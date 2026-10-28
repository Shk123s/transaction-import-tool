const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  processBatchUpload,
  getAllBatches,
  getBatchById,
  approveBatch,
  getAuditLogs
} = require('../controllers/transactionController');

const router = express.Router();

// Multer setup for CSV uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload and process CSV transaction batch
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Batch processed successfully
 *       400:
 *         description: No file uploaded
 *       500:
 *         description: Server error
 */
router.post('/upload', upload.single('file'), processBatchUpload);

/**
 * @swagger
 * /api/batches:
 *   get:
 *     summary: Get all transaction batches
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: List of batches
 */
router.get('/batches', getAllBatches);

/**
 * @swagger
 * /api/batches/{id}:
 *   get:
 *     summary: Get batch details and transactions by ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Batch and transactions details
 *       404:
 *         description: Batch not found
 */
router.get('/batches/:id', getBatchById);

/**
 * @swagger
 * /api/batches/{id}/approve:
 *   post:
 *     summary: Approve pending transactions in a batch
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Batch approved successfully
 */
router.post('/batches/:id/approve', approveBatch);

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Get system audit logs
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: List of audit logs
 */
router.get('/audit-logs', getAuditLogs);

module.exports = router;
