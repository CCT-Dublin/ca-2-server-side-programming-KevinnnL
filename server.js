// Load environment variables from .env (DB credentials, PORT, etc.)
require("dotenv").config();
console.log("DB_NAME =", process.env.DB_NAME);

const express = require("express");
const path = require("path");
const helmet = require("helmet");                 // Security headers (CSP, etc.)
const rateLimit = require("express-rate-limit");  // Prevent brute-force / spam
const morgan = require("morgan");                 // Request logging

const http = require("http");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");                 // Used for CSP nonce

// Database helpers (pool for queries, plus startup checks)
const { pool, testConnection, ensureSchema } = require("./database");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// ---------- MIDDLEWARE (Incoming requests handling) ----------
app.use(morgan("combined"));
app.use(express.json({ limit: "50kb" }));                 // Limit body size (DoS protection)
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

// Rate limiter: blocks too many requests from the same IP in a short time
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// ---------- CSP (Content Security Policy with nonce) ----------
// Generates a unique nonce per request so inline <script> and <style> are allowed safely
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Helmet sets security headers, including CSP rules
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);

// Serve static files (CSS, images, etc.) from this folder
app.use(express.static(path.join(__dirname)));

// ---------- Serve form.html with nonce injected ----------
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "form.html");
  let html = fs.readFileSync(filePath, "utf8");

  // Add nonce to inline <style> and <script> so CSP does not block them
  html = html.replace("<style>", `<style nonce="${res.locals.nonce}">`);
  html = html.replace("<script>", `<script nonce="${res.locals.nonce}">`);

  res.type("html").send(html);
});

// ---------- Server-side validation rules ----------
const nameRegex = /^[A-Za-z0-9]{1,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\d{10}$/;
const eircodeRegex = /^[0-9][A-Za-z0-9]{5}$/;

// Simple cleaning to reduce XSS risk (extra layer; CSP still helps a lot)
function clean(str) {
  return String(str || "")
    .trim()
    .replace(/[<>]/g, "");
}

// ---------- API route: validate + insert into MySQL ----------
app.post("/api/submit", async (req, res) => {
  try {
    let { first_name, second_name, email, phone_number, eircode } = req.body;

    // Normalize and clean inputs before validating
    first_name = clean(first_name);
    second_name = clean(second_name);
    email = clean(email);
    phone_number = clean(phone_number);
    eircode = clean(eircode).toUpperCase();

    // Reject bad input (never trust client-side validation only)
    if (!nameRegex.test(first_name)) return res.status(400).json({ error: "Invalid first_name" });
    if (!nameRegex.test(second_name)) return res.status(400).json({ error: "Invalid second_name" });
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email" });
    if (!phoneRegex.test(phone_number)) return res.status(400).json({ error: "Invalid phone_number" });
    if (!eircodeRegex.test(eircode)) return res.status(400).json({ error: "Invalid eircode" });

    // Parameterized query prevents SQL injection
    const sql = `
      INSERT INTO mysql_table (first_name, second_name, email, phone_number, eircode)
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [first_name, second_name, email, phone_number, eircode]);

    return res.status(201).json({ ok: true, message: "Saved to database" });
  } catch (err) {
    console.error("API error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------- Startup: DB check + schema check + start HTTP/HTTPS ----------
async function start() {
  try {
    await testConnection();
    console.log("✅ MySQL connection OK");

    await ensureSchema();
    console.log("✅ Schema OK (mysql_table ready)");

    const keyPath = "./certs/key.pem";
    const certPath = "./certs/cert.pem";

    let server;

    // If SSL files exist, start HTTPS. Otherwise fallback to HTTP.
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      server = https.createServer(sslOptions, app);
      server.listen(PORT, () => {
        console.log(`✅ HTTPS server running at https://localhost:${PORT}`);
      });
    } else {
      server = http.createServer(app);
      server.listen(PORT, () => {
        console.log(`✅ HTTP server running at http://localhost:${PORT}`);
        console.log("ℹ️ HTTPS not started (missing ./certs/key.pem or ./certs/cert.pem)");
      });
    }

    // Port check: useful error message if PORT is already being used
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Close the other server or change PORT.`);
      } else {
        console.error("❌ Server failed to start:", err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
}

start();
