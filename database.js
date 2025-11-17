// database.js
// MySQL helper using mysql2/promise

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'test',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const TABLE_NAME = 'mysql_table';

async function createTableIfNotExists(columnNames) {
  // columnNames: array of snake_case strings
  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    throw new Error('createTableIfNotExists: columnNames must be a non-empty array');
  }

  // Build column definitions as VARCHAR(255) by default.
  // If you want specific types, change this logic or supply a schema.
  const colsSql = columnNames.map(col => `\`${col}\` VARCHAR(255)`).join(',\n  ');
  const createSql = `
    CREATE TABLE IF NOT EXISTS \`${TABLE_NAME}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ${colsSql}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
