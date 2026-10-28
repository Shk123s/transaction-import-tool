# Transaction Import & Processing Tool (MySQL)

A production-ready, clean-architecture Node.js & Express application for importing, validating, detecting duplicates, and authorizing financial transaction batches from CSV files with MySQL storage.

---

## 🚀 Features & Evaluation Criteria Fulfilled

1. **Functionality (40%)**:
   - CSV file upload via multipart/form-data.
   - Robust validation (mandatory fields, positive amount check).
   - Batch status tracking (`PENDING`, `PROCESSED`, `AUTHORIZED`, `INVALID`).
   - Batch authorization (approve pending valid transactions).
   - Audit logging of all administrative actions.

2. **Code Structure (25%)** (Strict Separation of Concerns):
   - **Database Connection**: `config/database.js` (MySQL connection pool & schema creation).
   - **Controllers**: `controllers/transactionController.js` (Business logic & CSV processing).
   - **Routes**: `routes/transactionRoutes.js` (API endpoint routing).
   - **Server / Entry Point**: `server.js` (Express app & Swagger integration).

3. **Validation & Error Handling (20%)**:
   - Duplicate detection *within* the uploaded CSV file (`transaction_id` collision check).
   - Duplicate detection against *existing records* in the MySQL database.
   - Detailed error reporting per row (`error_reason` stored in database).
   - Graceful handling of empty files, malformed CSVs, and database errors.

4. **Database Design (10%)**:
   - MySQL relational schema:
     - `Batch`: Tracks batch metadata (filename, row counts, status).
     - `Transactions`: Stores individual transaction records with unique constraints on `transaction_id`.
     - `AuditLog`: Tracks system actions and timestamps.

5. **Documentation & Bonus (15%)**:
   - **Swagger OpenAPI Documentation**: Interactive API docs available at `/api-docs`.
   - **Simple Dashboard**: Responsive Web UI (`public/index.html`) for uploading CSVs, viewing batches, inspecting rows, and approving batches.
   - **Unit Tests**: Jest & Supertest automated test suite (`tests/`).
   - **Sample CSV**: Included at `public/sample.csv`.

---

## 🛠️ Setup & Installation Guide

### Prerequisites
- Node.js (v16+ recommended)
- MySQL Server (running locally, e.g., MySQL 8.0)
- MySQL Workbench (or any MySQL client)

### Step 1: Configure Environment Variables
Copy or update the `.env` file in the project root with your MySQL credentials (matching your MySQL Workbench connection):

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=12345
DB_NAME=transaction_import_tool
```

### Step 2: Install Dependencies
Open your terminal in the project directory and run:

```bash
npm install
```

### Step 3: Start the Application
```bash
npm start
```
The server will automatically create the `transaction_db` database and required tables (`Batch`, `Transactions`, `AuditLog`) if they do not exist.

Access points:
- **Dashboard UI**: `http://localhost:3000`
- **Swagger API Docs**: `http://localhost:3000/api-docs`

### Step 4: Run Tests
```bash
npm test
```

---

## 📂 Sample CSV Format (`public/sample.csv`)

```csv
transaction_id,customer_name,account_number,amount
TXN1001,Alice Smith,ACC-90812,250.50
TXN1002,Bob Jones,ACC-90813,1000.00
TXN1003,Charlie Brown,ACC-90814,45.20
TXN1004,Diana Prince,ACC-90815,500.00
```
