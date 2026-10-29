
const { getDB } = require('./config/database');

function logAudit(action, details) {
  return new Promise((resolve, reject) => {
    const db = getDB();

    db.run(
      `INSERT INTO AuditLog (action, details) VALUES (?, ?)`,
      [action, details],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { logAudit };
