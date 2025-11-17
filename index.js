// index.js
// Usage: node index.js path/to/data.csv
// If no path provided, defaults to ./data.csv

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { createTableIfNotExists, insertMany } = require('./database');

const INPUT_FILE = process.argv[2] || path.join(process.cwd(), 'data.csv');

function toSnakeCase(s) {
  return s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function isValidEmail(v) {
  if (!v) return false;
  // simple email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidDate(v) {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function isIntegerLike(v) {
  if (v === null || v === undefined || v === '') return false;
  return /^-?\d+$/.test(String(v).trim());
}

function isNumberLike(v) {
  if (v === null || v === undefined || v === '') return false;
  return !Number.isNaN(Number(String(v).trim()));
}

// Simple validator that infers column type from header name
function validateRow(originalRow, headerMeta) {
  // originalRow: object {originalHeaderName: value}
  // headerMeta: array of { orig, snake }
  const validated = {};
  const errors = [];

  for (const { orig, snake } of headerMeta) {
    let val = originalRow[orig];
    if (typeof val === 'string') val = val.trim();

    // Basic type heuristics based on header name
    const h = orig.toLowerCase();

    if (h.includes('email')) {
      if (val === '' || val == null) {
        errors.push(`${orig}: empty email`);
      } else if (!isValidEmail(val)) {
        errors.push(`${orig}: invalid email`);
      }
    } else if (h.includes('date') || h.includes('dob') || h.includes('birth')) {
      if (val === '' || val == null) {
        errors.push(`${orig}: empty date`);
      } else if (!isValidDate(val)) {
        errors.push(`${orig}: invalid date`);
      }
    } else if (/(id$|^id$|_id$|^id_|^id)/i.test(snake) || /(age|count|qty|number|price|amount|total)/i.test(h)) {
      // treat as integer-like if header suggests numeric
      if (val === '' || val == null) {
        errors.push(`${orig}: empty numeric`);
      } else if (!isNumberLike(val)) {
        errors.push(`${orig}: not numeric`);
      }
    } else {
      // free text: enforce presence (non-empty) by default
      if (val === '' || val == null) {
        // optional: allow empty values — change policy here if needed
        // For this assignment we'll mark empty fields as errors to catch missing data
        errors.push(`${orig}: empty`);
      }
    }

    // store as string (we created table columns as VARCHAR(255))
    validated[snake] = (val === undefined || val === null) ? null : String(val);
  }

  return { validated, errors };
}

(async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`CSV file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_FILE, 'utf8');

  parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, trim: false }, async (err, records) => {
    if (err) {
      console.error('Failed parsing CSV:', err.message);
      process.exit(1);
    }

    if (!records || records.length === 0) {
      console.log('No data rows found in CSV.');
      process.exit(0);
    }

    // Build header metadata from the first record's keys (original headers)
    const origHeaders = Object.keys(records[0]);
    const headerMeta = origHeaders.map(h => ({ orig: h, snake: toSnakeCase(h) }));

    // Create table with snake_case columns if not exists
    const columnNames = headerMeta.map(h => h.snake);
 