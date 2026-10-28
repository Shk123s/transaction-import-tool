const express = require('express');
const path = require('path');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');
const { initDatabase } = require('./config/database');
const transactionRoutes = require('./routes/transactionRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Transaction Import API with MySQL',
      version: '1.0.0',
      description: 'API documentation for the CSV Transaction Import & Processing system with duplicate detection, batching, and authorization.',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development Server',
      },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js', './server.js'],
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Batch upload and transaction management
 */

app.use('/api', transactionRoutes);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Transaction Import Server running on http://localhost:${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database. Server not started.', err);
    process.exit(1);
  });

module.exports = app;
