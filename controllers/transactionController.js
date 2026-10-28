const fs = require('fs');
const csv = require('csv-parser');
const { getPool } = require('../config/database');
const { logAudit } = require('../audit');

async function processBatchUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const originalname = req.file.originalname;
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      const pool = getPool();
      let connection;

      try {
        // Create batch record
        const [batchResult] = await pool.query(
          `INSERT INTO Batch (filename, total_rows, status) VALUES (?, ?, 'PENDING')`,
          [originalname, results.length]
        );
        const batchId = batchResult.insertId;

        if (results.length === 0) {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          await pool.query(`UPDATE Batch SET status = 'COMPLETED', valid_rows = 0, invalid_rows = 0 WHERE id = ?`, [batchId]);
          await logAudit('UPLOAD_BATCH', `Batch #${batchId} uploaded with 0 rows.`);
          return res.status(201).json({ message: 'Batch uploaded successfully (empty file).', batchId, total: 0, valid: 0, invalid: 0 });
        }

        // Check for duplicate transaction_ids within the uploaded CSV itself
        const seenTransactionIds = new Set();
        const csvDuplicates = new Set();
        results.forEach((row) => {
          const txId = row.transaction_id ? row.transaction_id.trim() : '';
          if (txId) {
            if (seenTransactionIds.has(txId)) {
              csvDuplicates.add(txId);
            } else {
              seenTransactionIds.add(txId);
            }
          }
        });

        let validCount = 0;
        let invalidCount = 0;

        for (const row of results) {
          const transaction_id = row.transaction_id ? row.transaction_id.trim() : '';
          const customer_name = row.customer_name ? row.customer_name.trim() : '';
          const account_number = row.account_number ? row.account_number.trim() : '';
          const amountStr = row.amount ? row.amount.toString().trim() : '';
          const amount = parseFloat(amountStr);

          let errorReason = null;

          if (!transaction_id || !customer_name || !account_number || !amountStr) {
            errorReason = 'All fields are mandatory.';
          } else if (csvDuplicates.has(transaction_id)) {
            errorReason = 'Duplicate transaction_id within the uploaded CSV file.';
          } else if (isNaN(amount) || amount <= 0) {
            errorReason = 'Amount must be greater than zero.';
          }

          if (errorReason) {
            invalidCount++;
            await pool.query(
              `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'INVALID', ?)`,
              [batchId, transaction_id || `UNKNOWN_${Math.random()}`, customer_name || null, account_number || null, isNaN(amount) ? 0 : amount, errorReason]
            );
          } else {
            // Check against existing database transactions
            const [existing] = await pool.query(`SELECT id FROM Transactions WHERE transaction_id = ?`, [transaction_id]);
            if (existing.length > 0) {
              invalidCount++;
              await pool.query(
                `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'INVALID', ?)`,
                [batchId, transaction_id, customer_name, account_number, amount, 'Duplicate transaction_id in database.']
              );
            } else {
              validCount++;
              await pool.query(
                `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)`,
                [batchId, transaction_id, customer_name, account_number, amount]
              );
            }
          }
        }

        // Update batch counts and status
        await pool.query(
          `UPDATE Batch SET valid_rows = ?, invalid_rows = ?, status = 'PROCESSED' WHERE id = ?`,
          [validCount, invalidCount, batchId]
        );

        await logAudit('UPLOAD_BATCH', `Batch #${batchId} (${originalname}) processed. Valid: ${validCount}, Invalid: ${invalidCount}`);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return res.status(201).json({
          message: 'Batch processed successfully.',
          batchId,
          totalRows: results.length,
          validRows: validCount,
          invalidRows: invalidCount
        });

      } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('Error processing batch upload:', err);
        return res.status(500).json({ error: 'Server error processing batch: ' + err.message });
      }
    })
    .on('error', (err) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(500).json({ error: 'Error parsing CSV file: ' + err.message });
    });
}


async function getAllBatches(req, res) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT b.*,
             (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'PENDING') as pending_count,
             (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'AUTHORIZED') as authorized_count,
             (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'INVALID') as invalid_count
      FROM Batch b
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get batch by ID with its transactions
async function getBatchById(req, res) {
  const batchId = req.params.id;
  try {
    const pool = getPool();
    const [batches] = await pool.query(`SELECT * FROM Batch WHERE id = ?`, [batchId]);
    if (batches.length === 0) {
      return res.status(404).json({ error: 'Batch not found.' });
    }

    const [transactions] = await pool.query(`SELECT * FROM Transactions WHERE batch_id = ?`, [batchId]);
    res.json({ batch: batches[0], transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Approve batch (authorize all pending transactions in the batch)
async function approveBatch(req, res) {
  const batchId = req.params.id;
  try {
    const pool = getPool();
    const [batches] = await pool.query(`SELECT * FROM Batch WHERE id = ?`, [batchId]);
    if (batches.length === 0) {
      return res.status(404).json({ error: 'Batch not found.' });
    }

    const [updateResult] = await pool.query(
      `UPDATE Transactions SET status = 'AUTHORIZED' WHERE batch_id = ? AND status = 'PENDING'`,
      [batchId]
    );

    const updatedCount = updateResult.affectedRows;
    await pool.query(`UPDATE Batch SET status = 'AUTHORIZED' WHERE id = ?`, [batchId]);

    await logAudit('APPROVE_BATCH', `Batch #${batchId} approved. ${updatedCount} transactions authorized.`);

    res.json({
      message: `Batch #${batchId} approved successfully.`,
      authorizedTransactionsCount: updatedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get audit logs
async function getAuditLogs(req, res) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM AuditLog ORDER BY timestamp DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  processBatchUpload,
  getAllBatches,
  getBatchById,
  approveBatch,
  getAuditLogs
};
