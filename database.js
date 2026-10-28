const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = null;
const dbFile = path.join(__dirname, 'database.sqlite');

function initDatabase(callback) {
  db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
      if (callback) callback(err);
      return;
    }
    console.log('Connected to SQLite database (root fallback mode).');
    createTables(callback);
  });
}

function createTables(callback) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      total_rows INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      invalid_rows INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER,
      transaction_id TEXT UNIQUE,
      customer_name TEXT,
      account_number TEXT,
      amount REAL,
      status TEXT DEFAULT 'PENDING',
      error_reason TEXT,
      FOREIGN KEY (batch_id) REFERENCES Batch(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS AuditLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (callback) callback(err);
    });
  });
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

module.exports = {
  initDatabase,
  getDB
};
