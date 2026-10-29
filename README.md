# Transaction Import & Processing Tool

A Node.js and Express application for importing transaction records from CSV files, validating rows, detecting duplicate transaction IDs, tracking upload batches, authorizing transactions, and recording audit events.

> **Database note:** This README documents the intended MySQL setup using the `mysql2` driver. Make sure `config/database.js`, controllers, and audit logging actually use `mysql2` before describing the running application as MySQL-backed. A file that imports `sqlite3` is using SQLite instead.

## Features

- Upload CSV files using `multipart/form-data`.
- Validate required fields and ensure transaction amounts are greater than zero.
- Detect duplicate transaction IDs within a CSV and against existing database records.
- Track uploads as batches and store per-row validation errors.
- Approve pending valid transactions.
- Record audit events for important actions.
- Explore API endpoints using Swagger UI.
- Use the dashboard to upload files and inspect batches and transactions.
- Run automated tests with Jest and Supertest, if the test suite is configured.

## Technology stack

- Node.js
- Express.js
- MySQL with the `mysql2` Node.js driver (intended configuration)
- `csv-parser`
- Multer for file uploads
- Swagger UI / OpenAPI
- Jest and Supertest for tests

## Database setup (MySQL)

### 1. Start MySQL Server

Start the MySQL Windows service first. In PowerShell opened as Administrator, check the service name:

```powershell
Get-Service *MySQL*
```

If the service is named `MySQL80`, start it with:

```powershell
Start-Service MySQL80
```

In MySQL Workbench, open your saved connection (for example, `root@localhost:3306`). If the connection is offline, the MySQL Server service must be started before Workbench can connect.

### 2. Create and select the database

After connecting in MySQL Workbench, open a SQL tab and run:

```sql
CREATE DATABASE IF NOT EXISTS transaction_import_tool;
USE transaction_import_tool;
SELECT DATABASE();
```

The final query should return `transaction_import_tool`.

To select it in Workbench later:
- In the left **SCHEMAS** panel, click the refresh icon.
- Double-click `transaction_import_tool` so its name becomes bold; this sets it as the default schema for that SQL tab.
- Or run `USE transaction_import_tool;` in the SQL editor.

The application database name must match the `DB_NAME` environment variable.

### 3. Configure environment variables

Create a `.env` file in the project root. Use your own local MySQL credentials; do not commit this file.

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=transaction_import_tool
```

If your MySQL connection uses a different host, port, username, or password, update these values accordingly.

### 4. Install and run

From the project directory:

```powershell
npm install
npm start
```

Expected local URLs, if the server starts successfully:

- Dashboard: `http://localhost:3000`
- Swagger API docs: `http://localhost:3000/api-docs`

### 5. Run tests

```powershell
npm test
```

## Database design

The intended relational schema contains:

| Table | Purpose |
|---|---|
| `Batch` | Stores each CSV upload, filename, row counts, status, and creation timestamp. |
| `Transactions` | Stores individual transaction records, their `batch_id`, business `transaction_id`, amount, status, and validation error. |
| `AuditLog` | Records important actions and timestamps. |

A single batch can contain many transaction records. `Transactions.batch_id` links each transaction to its batch. The internal primary key (`id`) is distinct from the business identifier (`transaction_id`).

## Sample CSV

Save a CSV file with these headers:

```csv
transaction_id,customer_name,account_number,amount
TXN1001,Alice Smith,ACC-90812,250.50
TXN1002,Bob Jones,ACC-90813,1000.00
TXN1003,Charlie Brown,ACC-90814,45.20
TXN1004,Diana Prince,ACC-90815,500.00
```

