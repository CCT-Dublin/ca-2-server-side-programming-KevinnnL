// database.js
require("dotenv").config();
const mysql = require("mysql2/promise"); // ✅ correct package

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10
});

// 1) Check DB connectivity
async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}

// 2) Ensure schema exists BEFORE saving any data
async function ensureSchema() {
  const createSql = `
    CREATE TABLE IF NOT EXISTS mysql_table (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(20) NOT NULL,
      second_name VARCHAR(20) NOT NULL,
      email VARCHAR(120) NOT NULL,
      phone_number CHAR(10) NOT NULL,
      eircode CHAR(6) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.execute(createSql);
}

module.exports = { pool, testConnection, ensureSchema };
