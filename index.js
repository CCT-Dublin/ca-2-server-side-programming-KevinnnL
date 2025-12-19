// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { pool, testConnection } = require("./database");

// set your CSV file name here
const CSV_FILE = path.join(__dirname, "data.csv");

// ====== VALIDATION HELPERS ======
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidEmail(v) {
  if (!isNonEmptyString(v)) return false;
  // simple email check 
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidIntOrEmpty(v) {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  if (s === "") return true;
  return Number.isInteger(Number(s));
}

function isValidDateOrEmpty(v) {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  if (s === "") return true;
  // expects YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// REQUIRED COLUMNS 
// Dataset matched
const REQUIRED_COLUMNS = ["first_name", "last_name", "email"];

// Validate types 
const OPTIONAL_COLUMNS = ["age", "created_at"];

// Validate one CSV row
function validateRow(row) {
  const errors = [];

  // Required checks
  for (const col of REQUIRED_COLUMNS) {
    if (!isNonEmptyString(row[col])) {
      errors.push(`Missing/empty required field: ${col}`);
    }
  }

  // Specific checks
  if (row.email && !isValidEmail(row.email)) {
    errors.push("Invalid email format");
  }

  if (!isValidIntOrEmpty(row.age)) {
    errors.push("age must be an integer (or empty)");
  }

  if (!isValidDateOrEmpty(row.created_at)) {
    errors.push("created_at must be YYYY-MM-DD (or empty)");
  }

  return errors;
}

// Inserting one valid row into DB
async function insertRow(row) {
  // Convert/clean values
  const clean = {
    first_name: row.first_name?.trim(),
    last_name: row.last_name?.trim(),
    email: row.email?.trim(),
    age: row.age?.trim() === "" ? null : Number(row.age),
    created_at: row.created_at?.trim() === "" ? null : row.created_at.trim()
  };

  const sql = `
    INSERT INTO mysql_table (first_name, last_name, email, age, created_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  const params = [
    clean.first_name,
    clean.last_name,
    clean.email,
    clean.age,
    clean.created_at
  ];

  await pool.execute(sql, params);
}

//  MAIN 
async function run() {
  // 1) Verify DB connectivity
  await testConnection();
  console.log("✅ Connected to MySQL successfully.");

  // 2) Check CSV exists
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    process.exit(1);
  }

  let rowNumber = 1; // data row number (not counting header)
  let validCount = 0;
  let invalidCount = 0;

  const insertPromises = [];

  // 3) Stream CSV rows
  fs.createReadStream(CSV_FILE)
    .pipe(csv())
    .on("data", (row) => {
      // rowNumber refers to “which record in the CSV data”
      const errors = validateRow(row);

      if (errors.length > 0) {
        invalidCount++;
        console.error(`❌ Invalid record at CSV row ${rowNumber}: ${errors.join(" | ")}`);
      } else {
        validCount++;
        // Insert valid row (queued)
        insertPromises.push(
          insertRow(row).catch((err) => {
            invalidCount++;
            validCount--;
            console.error(`❌ DB insert failed at CSV row ${rowNumber}: ${err.message}`);
          })
        );
      }

      rowNumber++;
    })
    .on("end", async () => {
      // 4) Wait inserts finish
      await Promise.all(insertPromises);

      console.log("====================================");
      console.log(`✅ Valid rows inserted: ${validCount}`);
      console.log(`❌ Invalid rows skipped: ${invalidCount}`);
      console.log("Done.");
      await pool.end();
    })
    .on("error", (err) => {
      console.error("❌ CSV read error:", err.message);
      process.exit(1);
    });
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
