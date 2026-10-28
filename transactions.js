const fs = require('fs');
const csv = require('csv-parser');
const { getDB } = require('./database');
const { logAudit } = require('./audit');

function processBatchUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const originalname = req.file.originalname;
  const results = [];
  const db = getDB();

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      db.run(
        `INSERT INTO Batch (filename, total_rows, status) VALUES (?, ?, 'PENDING')`,
        [originalname, results.length],
        function (err) {
          if (err) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(500).json({ error: 'Database error creating batch: ' + err.message });
          }

          const batchId = this.lastID;
          let validCount = 0;
          let invalidCount = 0;
          let processed = 0;

          if (results.length === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            db.run(`UPDATE Batch SET status = 'COMPLETED', valid_rows = 0, invalid_rows = 0 WHERE id = ?`, [batchId]);
            logAudit('UPLOAD_BATCH', `Batch #${batchId} uploaded with 0 rows.`);
            return res.status(201).json({ message: 'Batch uploaded successfully (empty file).', batchId, total: 0, valid: 0, invalid: 0 });
          }

          // Check for duplicate transaction_ids within the CSV itself
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

          results.forEach((row) => {
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
              db.run(
                `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'INVALID', ?)`,
                [batchId, transaction_id || 'UNKNOWN', customer_name || null, account_number || null, isNaN(amount) ? 0 : amount, errorReason],
                checkFinish
              );
            } else {
              db.get(`SELECT id FROM Transactions WHERE transaction_id = ?`, [transaction_id], (err, existing) => {
                if (err) {
                  invalidCount++;
                  checkFinish(err);
                  return;
                }
                if (existing) {
                  invalidCount++;
                  db.run(
                    `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'INVALID', ?)`,
                    [batchId, transaction_id, customer_name, account_number, amount, 'Duplicate transaction_id in database.'],
                    checkFinish
                  );
                } else {
                  validCount++;
                  db.run(
                    `INSERT INTO Transactions (batch_id, transaction_id, customer_name, account_number, amount, status, error_reason) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)`,
                    [batchId, transaction_id, customer_name, account_number, amount],
                    checkFinish
                  );
                }
              });
            }
          });

          function checkFinish(err) {
            processed++;
            if (processed === results.length) {
              db.run(
                `UPDATE Batch SET valid_rows = ?, invalid_rows = ? WHERE id = ?`,
                [validCount, invalidCount, batchId],
                () => {
                  logAudit('UPLOAD_BATCH', `Batch #${batchId} (${originalname}) processed. Valid: ${validCount}, Invalid: ${invalidCount}`);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                  return res.status(201).json({
                    message: 'Batch processed successfully.',
                    batchId,
                    totalRows: results.length,
                    validRows: validCount,
                    invalidRows: invalidCount
                  });
                }
              );
            }
          }
        }
      );
    })
    .on('error', (err) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(500).json({ error: 'Error parsing CSV file: ' + err.message });
    });
}

function getAllBatches(req, res) {
  const db = getDB();
  const query = `
    SELECT b.*,
           (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'PENDING') as pending_count,
           (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'AUTHORIZED') as authorized_count,
           (SELECT COUNT(*) FROM Transactions t WHERE t.batch_id = b.id AND t.status = 'INVALID') as invalid_count
    FROM Batch b
    ORDER BY b.created_at DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

function getBatchById(req, res) {
  const batchId = req.params.id;
  const db = getDB();

  db.get(`SELECT * FROM Batch WHERE id = ?`, [batchId], (err, batch) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });

    db.all(`SELECT * FROM Transactions WHERE batch_id = ?`, [batchId], (err, transactions) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ batch, transactions });
    });
  });
}

function approveBatch(req, res) {
  const batchId = req.params.id;
  const db = getDB();

  db.get(`SELECT * FROM Batch WHERE id = ?`, [batchId], (err, batch) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!batch) return res.status(404).json({ error: 'Batch not found.' });

    db.run(
      `UPDATE Transactions SET status = 'AUTHORIZED' WHERE batch_id = ? AND status = 'PENDING'`,
      [batchId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const updatedCount = this.changes;
        db.run(`UPDATE Batch SET status = 'AUTHORIZED' WHERE id = ?`, [batchId], () => {
          logAudit('APPROVE_BATCH', `Batch #${batchId} approved. ${updatedCount} transactions authorized.`);
          res.json({
            message: `Batch #${batchId} approved successfully.`,
            authorizedTransactionsCount: updatedCount
          });
        });
      }
    );
  });
}

function getAuditLogs(req, res) {
  const db = getDB();
  db.all(`SELECT * FROM AuditLog ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

module.exports = {
  processBatchUpload,
  getAllBatches,
  getBatchById,
  approveBatch,
  getAuditLogs
};
