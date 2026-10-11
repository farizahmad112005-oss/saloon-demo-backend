import { body } from 'express-validator';
import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { getActivePublicDiscounts, validateAndCalculateDiscount } from '../services/discountService.js';

async function attachServices(discounts) {
  if (!discounts.length) return discounts;
  const ids = discounts.map((d) => d.id);
  const rows = await query(
    `SELECT ds.discount_id, s.id, s.name, s.category_id
     FROM discount_services ds
     JOIN services s ON s.id = ds.service_id
     WHERE ds.discount_id IN (${ids.join(',')})`
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.discount_id)) map.set(r.discount_id, []);
    map.get(r.discount_id).push(r);
  }
  return discounts.map((d) => ({ ...d, services: map.get(d.id) || [] }));
}

export const discountValidators = [
  body('code').trim().notEmpty(),
  body('discount_type').isIn(['fixed', 'percentage']),
  body('discount_value').isFloat({ min: 0 }),
  body('start_date').isISO8601(),
  body('end_date').isISO8601(),
];

export const listPublicDiscounts = asyncHandler(async (req, res) => {
  ok(res, await getActivePublicDiscounts());
});

export const listDiscounts = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT d.*, c.name AS category_name
     FROM discounts d
     LEFT JOIN categories c ON c.id = d.category_id
     ORDER BY d.created_at DESC`
  );
  ok(res, await attachServices(rows));
});

export const createDiscount = asyncHandler(async (req, res) => {
  const {
    code,
    title,
    description,
    discount_type,
    discount_value,
    start_date,
    end_date,
    category_id,
    usage_limit,
    is_active = true,
    service_ids = [],
  } = req.body;

  const id = await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO discounts
        (code, title, description, discount_type, discount_value, start_date, end_date, category_id, usage_limit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code.toUpperCase(),
        title || null,
        description || null,
        discount_type,
        discount_value,
        start_date,
        end_date,
        category_id || null,
        usage_limit || null,
        is_active ? 1 : 0,
      ]
    );
    for (const sid of service_ids) {
      await connection.query('INSERT INTO discount_services (discount_id, service_id) VALUES (?, ?)', [
        result.insertId,
        sid,
      ]);
    }
    return result.insertId;
  });

  const rows = await query('SELECT * FROM discounts WHERE id = :id', { id });
  const [discount] = await attachServices(rows);
  created(res, discount);
});

export const updateDiscount = asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM discounts WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Discount not found.', 404);
  const cur = existing[0];

  await withTransaction(async (connection) => {
    await connection.query(
      `UPDATE discounts SET
        code = ?, title = ?, description = ?, discount_type = ?, discount_value = ?,
        start_date = ?, end_date = ?, category_id = ?, usage_limit = ?, is_active = ?
       WHERE id = ?`,
      [
        (req.body.code ?? cur.code).toUpperCase(),
        req.body.title ?? cur.title,
        req.body.description ?? cur.description,
        req.body.discount_type ?? cur.discount_type,
        req.body.discount_value ?? cur.discount_value,
        req.body.start_date ?? cur.start_date,
        req.body.end_date ?? cur.end_date,
        req.body.category_id ?? cur.category_id,
        req.body.usage_limit ?? cur.usage_limit,
        req.body.is_active === undefined ? cur.is_active : req.body.is_active ? 1 : 0,
        cur.id,
      ]
    );

    if (Array.isArray(req.body.service_ids)) {
      await connection.query('DELETE FROM discount_services WHERE discount_id = ?', [cur.id]);
      for (const sid of req.body.service_ids) {
        await connection.query('INSERT INTO discount_services (discount_id, service_id) VALUES (?, ?)', [
          cur.id,
          sid,
        ]);
      }
    }
  });

  const rows = await query('SELECT * FROM discounts WHERE id = :id', { id: cur.id });
  const [discount] = await attachServices(rows);
  ok(res, discount, 'Discount updated');
});

export const deleteDiscount = asyncHandler(async (req, res) => {
  await query('DELETE FROM discounts WHERE id = :id', { id: req.params.id });
  ok(res, null, 'Discount deleted');
});

export const validateDiscount = asyncHandler(async (req, res) => {
  const { code, booking_type = 'service', service_id, package_id, original_price } = req.body;
  const result = await validateAndCalculateDiscount({
    code,
    bookingType: booking_type,
    serviceId: service_id,
    packageId: package_id,
    originalPrice: original_price,
  });
  ok(res, {
    discount_code: result.discount_code,
    discount_amount: result.discount_amount,
    final_price: result.final_price ?? Number(original_price) - result.discount_amount,
    discount: result.discount
      ? {
          code: result.discount.code,
          type: result.discount.discount_type,
          value: Number(result.discount.discount_value),
        }
      : null,
  });
});
