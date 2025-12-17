// server.js (clean + fixed)

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const { createFormTableIfNotExists, insertFormRow, pool } = require('./database');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// -------------------- Middleware --------------------
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// ✅ Serve static files ONLY ONCE
const PUBLIC_DIR = path.join(__dirname, 'public');
console.log('Serving static files from:', PUBLIC_DIR);
app.use(express.static(PUBLIC_DIR));

// -------------------- Validation --------------------
function onlyLettersOrNumbers(v) { return /^[A-Za-z0-9]+$/.test(v); }
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function onlyDigits(v) { return /^\d+$/.test(v); }
function isAlphanumeric(v) { return /^[A-Za-z0-9]+$/.test(v); }
function startsWithNumber(v) { return /^[0-9]/.test(v); }

function validateForm(body) {
  const errors = [];
  const fv = v => (typeof v === 'string' ? v.trim() : '');

  const first_name = fv(body.first_name);
  const second_name = fv(body.second_name);
  const email = fv(body.email);
  const phone = fv(body.phone);
  const eircode = fv(body.eircode);

  if (!first_name) errors.push({ field: 'first_name', msg: 'First name required' });
  else if (first_name.length > 20) errors.push({ field: 'first_name', msg: 'Max 20 characters' });
  else if (!onlyLettersOrNumbers(first_name)) errors.push({ field: 'first_name', msg: 'Only letters and numbers allowed' });

  if (!second_name) errors.push({ field: 'second_name', msg: 'Second name required' });
  else if (second_name.length > 20) errors.push({ field: 'second_name', msg: 'Max 20 characters' });
  else if (!onlyLettersOrNumbers(second_name)) errors.push({ field: 'second_name', msg: 'Only letters and numbers allowed' });

  if (!email) errors.push({ field: 'email', msg: 'Email required' });
  else if (!isValidEmail(email)) errors.push({ field: 'email', msg: 'Invalid email' });

  if (!phone) errors.push({ field: 'phone', msg: 'Phone required' });
  else if (!onlyDigits(phone)) errors.push({ field: 'phone', msg: 'Phone must contain only numbers' });
  else if (phone.length !== 10) errors.push({ field: 'phone', msg: 'Phone must be exactly 10 digits' });

  if (!eircode) errors.push({ field: 'eircode', msg: 'Eircode required' });
  else if (eircode.length !== 6) errors.push({ field: 'eircode', msg: 'Eircode must be exactly 6 characters' });
  else if (!startsWithNumber(eircode)) errors.push({ field: 'eircode', msg: 'Eircode must start with a number' });
  else if (!isAlphanumeric(eircode)) errors.push({ field: 'eircode', msg: 'Eircode must be alphanumeric' });

  return { errors, values: { first_name, second_name, email, phone, eircode } };
}

// -------------------- DB schema middleware --------------------
async function ensureFormTableExists(req, res, next) {
  try {
    await createFormTableIfNotExists();
    next();
  } catch (err) {
    console.error('Error ensuring form table exists:', err);
    res.status(500).json({ message: 'Server database error' });
  }
}

// -------------------- Routes --------------------
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try { await conn.ping(); } finally { conn.release(); }
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('Health check DB error:', err);
    res.status(500).json({ status: 'error', db: 'down' });
  }
});

app.post('/submit', ensureFormTableExists, async (req, res) => {
  try {
    const { errors, values } = validateForm(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    await insertFormRow(values);
    res.status(201).json({ message: 'Inserted' });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Serve the HTML form
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'form.html'));
});

// -------------------- Error handler --------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Unexpected server error' });
});

// -------------------- Start server + port check --------------------
async function startServer() {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.ping();
      console.log('DB connection OK');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Unable to connect to database on startup:', err.message || err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

startServer();
