
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null;

const dbFile = path.join(__dirname, 'database.sqlite');

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        return reject(err);
      }

      console.log('Connected to SQLite successfully.');

      createTables()
        .then(resolve)
        .catch(reject);
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS Batch (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          total_rows INTEGER DEFAULT 0,
          valid_rows INTEGER DEFAULT 0,
          invalid_rows INTEGER DEFAULT 0,
          status TEXT DEFAULT 'PENDING',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS Transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id INTEGER,
          transaction_id TEXT UNIQUE,
          customer_name TEXT,
          account_number TEXT,
          amount REAL,
          status TEXT DEFAULT 'PENDING',
          error_reason TEXT,
          FOREIGN KEY (batch_id) REFERENCES Batch(id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS AuditLog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        console.log('Database tables initialized.');
        resolve();
      });
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
