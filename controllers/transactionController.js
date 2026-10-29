
const fs = require('fs');
const csv = require('csv-parser');
const { getDB } = require('../config/database');
const { logAudit } = require('../audit');

// Convert SQLite callback methods into Promises.
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);

      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function removeUploadedFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Upload and process a CSV batch.
async function processBatchUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const originalname = req.file.originalname;
  const results = [];

  try {
    // Parse CSV into rows.
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => results.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    const db = getDB();

    // Create the batch.
    const batchResult = await dbRun(
      db,
      `INSERT INTO Batch (filename, total_rows, status)
       VALUES (?, ?, 'PENDING')`,
      [originalname, results.length]
    );

    const batchId = batchResult.lastID;

    // Handle an empty CSV.
    if (results.length === 0) {
      await dbRun(
        db,
        `UPDATE Batch
         SET status = 'COMPLETED', valid_rows = 0, invalid_rows = 0
         WHERE id = ?`,
        [batchId]
      );

      await logAudit(
        'UPLOAD_BATCH',
        `Batch #${batchId} uploaded with 0 rows.`
      );

      return res.status(201).json({
        message: 'Batch uploaded successfully (empty file).',
        batchId,
        total: 0,
        valid: 0,
        invalid: 0
      });
    }

    // Find duplicate IDs within this CSV.
    const seenTransactionIds = new Set();
    const csvDuplicates = new Set();

    for (const row of results) {
      const id = row.transaction_id
        ? row.transaction_id.trim()
        : '';

      if (!id) continue;

      if (seenTransactionIds.has(id)) {
        csvDuplicates.add(id);
      } else {
        seenTransactionIds.add(id);
      }
    }

    let validCount = 0;
    let invalidCount = 0;

    for (const row of results) {
      const transactionId = row.transaction_id
        ? row.transaction_id.trim()
        : '';

      const customerName = row.customer_name
        ? row.customer_name.trim()
        : '';

      const accountNumber = row.account_number
        ? row.account_number.trim()
        : '';

      const amountStr = row.amount == null
        ? ''
        : String(row.amount).trim();

      const amount = Number(amountStr);

      let errorReason = null;

      if (
        !transactionId ||
        !customerName ||
        !accountNumber ||
        !amountStr
      ) {
        errorReason = 'All fields are mandatory.';
      } else if (csvDuplicates.has(transactionId)) {
        errorReason =
          'Duplicate transaction_id within the uploaded CSV file.';
      } else if (!Number.isFinite(amount) || amount <= 0) {
        errorReason = 'Amount must be greater than zero.';
      }

      // Check existing database records if basic validation passed.
      if (!errorReason) {
        const existing = await dbGet(
          db,
          `SELECT id FROM Transactions WHERE transaction_id = ?`,
          [transactionId]
        );

        if (existing) {
          errorReason = 'Duplicate transaction_id in database.';
        }
      }

      if (errorReason) {
        invalidCount++;

        await dbRun(
          db,
          `INSERT INTO Transactions
           (batch_id, transaction_id, customer_name,
            account_number, amount, status, error_reason)
           VALUES (?, ?, ?, ?, ?, 'INVALID', ?)`,
          [
            batchId,
            transactionId || null,
            customerName || null,
            accountNumber || null,
            Number.isFinite(amount) ? amount : 0,
            errorReason
          ]
        );
      } else {
        validCount++;

        await dbRun(
          db,
          `INSERT INTO Transactions
           (batch_id, transaction_id, customer_name,
            account_number, amount, status, error_reason)
           VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)`,
          [
            batchId,
            transactionId,
            customerName,
            accountNumber,
            amount
          ]
        );
      }
    }

    // Save final batch counts and status.
    await dbRun(
      db,
      `UPDATE Batch
       SET valid_rows = ?, invalid_rows = ?, status = 'PROCESSED'
       WHERE id = ?`,
      [validCount, invalidCount, batchId]
    );

    await logAudit(
      'UPLOAD_BATCH',
      `Batch #${batchId} (${originalname}) processed. ` +
      `Valid: ${validCount}, Invalid: ${invalidCount}`
    );

    return res.status(201).json({
      message: 'Batch processed successfully.',
      batchId,
      totalRows: results.length,
      validRows: validCount,
      invalidRows: invalidCount
    });
  } catch (err) {
    console.error('Error processing batch upload:', err);

    return res.status(500).json({
      error: 'Server error processing batch: ' + err.message
    });
  } finally {
    removeUploadedFile(filePath);
  }
}

// Get all batches and their transaction counts.
async function getAllBatches(req, res) {
  try {
    const db = getDB();

    const rows = await dbAll(
      db,
      `SELECT b.*,
        (SELECT COUNT(*) FROM Transactions t
         WHERE t.batch_id = b.id AND t.status = 'PENDING')
          AS pending_count,
        (SELECT COUNT(*) FROM Transactions t
         WHERE t.batch_id = b.id AND t.status = 'AUTHORIZED')
          AS authorized_count,
        (SELECT COUNT(*) FROM Transactions t
         WHERE t.batch_id = b.id AND t.status = 'INVALID')
          AS invalid_count
       FROM Batch b
       ORDER BY b.created_at DESC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Error fetching batches:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Get one batch and its transactions.
async function getBatchById(req, res) {
  try {
    const db = getDB();
    const batchId = req.params.id;

    const batch = await dbGet(
      db,
      `SELECT * FROM Batch WHERE id = ?`,
      [batchId]
    );

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found.' });
    }

    const transactions = await dbAll(
      db,
      `SELECT * FROM Transactions WHERE batch_id = ?`,
      [batchId]
    );

    return res.json({ batch, transactions });
  } catch (err) {
    console.error('Error fetching batch:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Authorize all pending transactions in a batch.
async function approveBatch(req, res) {
  const db = getDB();
  const batchId = req.params.id;

  try {
    const batch = await dbGet(
      db,
      `SELECT * FROM Batch WHERE id = ?`,
      [batchId]
    );

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found.' });
    }

    // Prevent an invalid-only batch from being marked authorized.
    const updateResult = await dbRun(
      db,
      `UPDATE Transactions
       SET status = 'AUTHORIZED'
       WHERE batch_id = ? AND status = 'PENDING'`,
      [batchId]
    );

    const updatedCount = updateResult.changes;

    await dbRun(
      db,
      `UPDATE Batch SET status = 'AUTHORIZED' WHERE id = ?`,
      [batchId]
    );

    await logAudit(
      'APPROVE_BATCH',
      `Batch #${batchId} approved. ` +
      `${updatedCount} transactions authorized.`
    );

    return res.json({
      message: `Batch #${batchId} approved successfully.`,
      authorizedTransactionsCount: updatedCount
    });
  } catch (err) {
    console.error('Error approving batch:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Get audit logs.
async function getAuditLogs(req, res) {
  try {
    const db = getDB();

    const rows = await dbAll(
      db,
      `SELECT * FROM AuditLog ORDER BY timestamp DESC`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  processBatchUpload,
  getAllBatches,
  getBatchById,
  approveBatch,
  getAuditLogs
};
