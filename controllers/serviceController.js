import { body } from 'express-validator';
import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { getAvailability } from '../services/availabilityService.js';
import { nowKarachi, formatDate } from '../utils/time.js';

async function attachDays(services) {
  if (!services.length) return services;
  const ids = services.map((s) => s.id);
  const days = await query(
    `SELECT service_id, weekday FROM service_available_days WHERE service_id IN (${ids.join(',')})`
  );
  const map = new Map();
  for (const d of days) {
    if (!map.has(d.service_id)) map.set(d.service_id, []);
    map.get(d.service_id).push(d.weekday);
  }
  return services.map((s) => ({ ...s, available_days: map.get(s.id) || [] }));
}

export const serviceValidators = [
  body('name').trim().notEmpty(),
  body('category_id').isInt({ min: 1 }),
  body('price').isFloat({ min: 0 }),
  body('duration_minutes').optional().isInt({ min: 10 }),
  body('available_days').optional().isArray(),
];

export const listServices = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const { category_id, featured } = req.query;
  const where = [];
  const params = {};
  if (!admin) where.push('s.is_active = 1');
  if (category_id) {
    where.push('s.category_id = :category_id');
    params.category_id = category_id;
  }

  let rows = await query(
    `SELECT s.*, c.name AS category_name, c.slug AS category_slug
     FROM services s
     JOIN categories c ON c.id = s.category_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.sort_order ASC, s.name ASC`,
    params
  );

  rows = await attachDays(rows);

  if (featured === '1' || featured === 'true') {
    rows = rows.filter((s) => s.is_active).slice(0, 8);
  }

  // Attach best active discount preview for customer views
  if (!admin) {
    const today = formatDate(nowKarachi());
    const discounts = await query(
      `SELECT d.*, ds.service_id
       FROM discounts d
       JOIN discount_services ds ON ds.discount_id = d.id
       WHERE d.is_active = 1 AND d.start_date <= :today AND d.end_date >= :today`,
      { today }
    );
    const byService = new Map();
    for (const d of discounts) {
      if (!byService.has(d.service_id)) byService.set(d.service_id, d);
    }
    rows = rows.map((s) => {
      const d = byService.get(s.id);
      if (!d) return { ...s, discount: null };
      const amount =
        d.discount_type === 'percentage'
          ? Math.round((Number(s.price) * Number(d.discount_value)) / 100)
          : Number(d.discount_value);
      return {
        ...s,
        discount: {
          code: d.code,
          type: d.discount_type,
          value: Number(d.discount_value),
          amount: Math.min(amount, Number(s.price)),
        },
      };
    });
  }

  ok(res, rows);
});

export const getService = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT s.*, c.name AS category_name
     FROM services s JOIN categories c ON c.id = s.category_id
     WHERE s.id = :id`,
    { id: req.params.id }
  );
  if (!rows.length) throw new AppError('Service not found.', 404);
  const [service] = await attachDays(rows);
  ok(res, service);
});

export const getServiceAvailability = asyncHandler(async (req, res) => {
  const data = await getAvailability({ resourceType: 'service', resourceId: Number(req.params.id) });
  ok(res, data);
});

export const createService = asyncHandler(async (req, res) => {
  const {
    name,
    category_id,
    description,
    price,
    duration_minutes = 40,
    image,
    is_active = true,
    sort_order = 0,
    available_days = [1, 2, 3, 4, 5, 6],
  } = req.body;

  const id = await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO services
        (category_id, name, description, price, duration_minutes, image, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        name,
        description || null,
        price,
        duration_minutes,
        image || null,
        is_active ? 1 : 0,
        sort_order,
      ]
    );
    const serviceId = result.insertId;
    for (const day of available_days) {
      await connection.query(
        'INSERT INTO service_available_days (service_id, weekday) VALUES (?, ?)',
        [serviceId, day]
      );
    }
    return serviceId;
  });

  const rows = await query(
    `SELECT s.*, c.name AS category_name FROM services s
     JOIN categories c ON c.id = s.category_id WHERE s.id = :id`,
    { id }
  );
  const [service] = await attachDays(rows);
  created(res, service);
});

export const updateService = asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM services WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Service not found.', 404);
  const cur = existing[0];

  await withTransaction(async (connection) => {
    await connection.query(
      `UPDATE services SET
        category_id = ?, name = ?, description = ?, price = ?, duration_minutes = ?,
        image = ?, is_active = ?, sort_order = ?
       WHERE id = ?`,
      [
        req.body.category_id ?? cur.category_id,
        req.body.name ?? cur.name,
        req.body.description ?? cur.description,
        req.body.price ?? cur.price,
        req.body.duration_minutes ?? cur.duration_minutes,
        req.body.image ?? cur.image,
        req.body.is_active === undefined ? cur.is_active : req.body.is_active ? 1 : 0,
        req.body.sort_order ?? cur.sort_order,
        cur.id,
      ]
    );

    if (Array.isArray(req.body.available_days)) {
      await connection.query('DELETE FROM service_available_days WHERE service_id = ?', [cur.id]);
      for (const day of req.body.available_days) {
        await connection.query(
          'INSERT INTO service_available_days (service_id, weekday) VALUES (?, ?)',
          [cur.id, day]
        );
      }
    }
  });

  const rows = await query(
    `SELECT s.*, c.name AS category_name FROM services s
     JOIN categories c ON c.id = s.category_id WHERE s.id = :id`,
    { id: cur.id }
  );
  const [service] = await attachDays(rows);
  ok(res, service, 'Service updated');
});

export const deleteService = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await query('SELECT id, name FROM services WHERE id = :id', { id });
  if (!existing.length) throw new AppError('Service not found.', 404);

  await withTransaction(async (connection) => {
    // Break package / discount links so the row can be removed.
    await connection.query('DELETE FROM package_services WHERE service_id = ?', [id]);
    await connection.query('DELETE FROM discount_services WHERE service_id = ?', [id]);
    // Drop future locks for this resource (appointments keep history via ON DELETE SET NULL).
    await connection.query(
      `DELETE FROM appointment_slot_locks
       WHERE resource_type = 'service' AND resource_id = ?`,
      [id]
    );
    await connection.query('DELETE FROM services WHERE id = ?', [id]);
  });

  ok(res, { id }, 'Service deleted');
});
