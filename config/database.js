const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

async function initDatabase() {
  try {
    // First connect without database to ensure database exists
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    const dbName = process.env.DB_NAME || 'transaction_db';
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await tempConnection.end();

    // Now create pool with database selected
    pool = mysql.createPool({
      ...dbConfig,
      database: dbName,
      multipleStatements: true
    });

    console.log(`Connected to MySQL database (${dbName}) successfully.`);

    // Create tables if not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Batch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        total_rows INT DEFAULT 0,
        valid_rows INT DEFAULT 0,
        invalid_rows INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS Transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id INT,
        transaction_id VARCHAR(100) UNIQUE,
        customer_name VARCHAR(255),
        account_number VARCHAR(100),
        amount DECIMAL(15,2),
        status VARCHAR(50) DEFAULT 'PENDING',
        error_reason TEXT,
        FOREIGN KEY (batch_id) REFERENCES Batch(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS AuditLog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database tables verified/created successfully.');
    return pool;
  } catch (error) {
    console.error('MySQL Database initialization error:', error.message);
    console.error('Please check your MySQL username (root) and password in .env file (matching your MySQL Workbench credentials).');
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDatabase first.');
  }
  return pool;
}

module.exports = {
  initDatabase,
  getPool
};
