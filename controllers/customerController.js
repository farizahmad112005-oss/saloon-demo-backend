import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const q = req.query.q;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = q
    ? 'WHERE c.name LIKE :q OR c.phone LIKE :q OR c.email LIKE :q'
    : '';
  const params = q ? { q: `%${q}%` } : {};

  const items = await query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id) AS appointment_count,
      (SELECT COALESCE(SUM(final_price),0) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS lifetime_value
     FROM customers c
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const countRows = await query(`SELECT COUNT(*) AS total FROM customers c ${where}`, params);
  ok(res, { items, total: countRows[0].total, page, limit });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, name, age, phone, email, is_active, created_at FROM customers WHERE id = :id', {
    id: req.params.id,
  });
  if (!rows.length) throw new AppError('Customer not found.', 404);
  ok(res, rows[0]);
});

export const getMe = asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, name, age, phone, email, created_at FROM customers WHERE id = :id',
    { id: req.user.id }
  );
  if (!rows.length) throw new AppError('Customer not found.', 404);
  ok(res, rows[0]);
});
