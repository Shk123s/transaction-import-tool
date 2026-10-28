const { getPool } = require('./config/database');

async function logAudit(action, details) {
  try {
    const pool = getPool();
    await pool.query('INSERT INTO AuditLog (action, details) VALUES (?, ?)', [action, details]);
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };
