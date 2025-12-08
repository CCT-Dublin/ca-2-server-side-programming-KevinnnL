// database.js
// MySQL helper using mysql2/promise

const mysql = require('mysql2/promise');

// Use your MySQL Workbench credentials
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Pass1234!',    // Password database
  database: 'mysql_table',  // Database table
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// used for CSV import (Part A)
const TABLE_NAME = 'mysql_table';

// Table for CSV (Part A) 
async function createTableIfNotExists(columnNames) {
  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    throw new Error('createTableIfNotExists: columnNames must be a non-empty array');
  }

  const colsSql = columnNames.map(col => `\`${col}\` VARCHAR(255)`).join(',\n  ');
  const createSql = `
    CREATE TABLE IF NOT EXISTS \`${TABLE_NAME}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ${colsSql}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const conn = await pool.getConnection();
  try {
    await conn.query(createSql);
  } finally {
    conn.release();
  }
}

async function insertMany(columnNames, rowsArray) {
  if (!Array.isArray(rowsArray) || rowsArray.length === 0) return { inserted: 0 };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const cols = columnNames.map(c => `\`${c}\``).join(', ');
    const sql = `INSERT INTO \`${TABLE_NAME}\` (${cols}) VALUES ?`;
    const [result] = await conn.query(sql, [rowsArray]);

    await conn.commit();
    return { inserted: result.affectedRows || rowsArray.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Typed table for form submissions (Part B/C) 
const FORM_TABLE = 'form_submissions';

async function createFormTableIfNotExists() {
  const sql = `
    CREATE TABLE IF NOT EXISTS \`${FORM_TABLE}\` (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      first_name   VARCHAR(100) NOT NULL,
      second_name  VARCHAR(100) NOT NULL,
      email        VARCHAR(255) NOT NULL,
      phone        VARCHAR(20)  NOT NULL,
      eircode      VARCHAR(6)   NOT NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const conn = await pool.getConnection();
  try {
    await conn.query(sql);
  } finally {
    conn.release();
  }
}

async function insertFormRow(rowObj) {
  const sql = `
    INSERT INTO \`${FORM_TABLE}\`
      (first_name, second_name, email, phone, eircode)
    VALUES (?, ?, ?, ?, ?)
  `;

  const conn = await pool.getConnection();
  try {
    const [res] = await conn.query(sql, [
      rowObj.first_name,
      rowObj.second_name,
      rowObj.email,
      rowObj.phone,
      rowObj.eircode
    ]);
    return res;
  } finally {
    conn.release();
  }
}

module.exports = {
  pool,
  createTableIfNotExists,     // CSV
  insertMany,                 // CSV
  TABLE_NAME,
  createFormTableIfNotExists, // form middleware in server.js
  insertFormRow               // /submit handler
};
