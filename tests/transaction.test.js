const request = require('supertest');
const app = require('../server');

describe('Transaction Import API Tests', () => {
  test('GET /api/batches should return array of batches', async () => {
    const res = await request(app).get('/api/batches');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  test('GET /api/audit-logs should return audit logs', async () => {
    const res = await request(app).get('/api/audit-logs');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  test('GET /api/batches/99999 should return 404 for non-existent batch', async () => {
    const res = await request(app).get('/api/batches/99999');
    expect(res.statusCode).toEqual(404);
  });
});
