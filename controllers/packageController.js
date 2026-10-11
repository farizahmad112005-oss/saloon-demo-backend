import { body } from 'express-validator';
import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { getAvailability } from '../services/availabilityService.js';

async function attachServices(packages) {
  if (!packages.length) return packages;
  const ids = packages.map((p) => p.id);
  const rows = await query(
    `SELECT ps.package_id, s.id, s.name, s.price, s.duration_minutes, s.image, s.is_active
     FROM package_services ps
     JOIN services s ON s.id = ps.service_id
     WHERE ps.package_id IN (${ids.join(',')})`
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.package_id)) map.set(r.package_id, []);
    map.get(r.package_id).push(r);
  }
  return packages.map((p) => {
    const services = map.get(p.id) || [];
    const savings = Number(p.original_price) - Number(p.package_price);
    return { ...p, services, savings };
  });
}

export const packageValidators = [
  body('name').trim().notEmpty(),
  body('package_price').isFloat({ min: 0 }),
  body('service_ids').isArray({ min: 1 }).withMessage('At least one service is required'),
];

export const listPackages = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const rows = await query(
    `SELECT * FROM packages
     ${admin ? '' : 'WHERE is_active = 1'}
     ORDER BY sort_order ASC, name ASC`
  );
  ok(res, await attachServices(rows));
});

export const getPackage = asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM packages WHERE id = :id', { id: req.params.id });
  if (!rows.length) throw new AppError('Package not found.', 404);
  const [pkg] = await attachServices(rows);
  ok(res, pkg);
});

export const getPackageAvailability = asyncHandler(async (req, res) => {
  const data = await getAvailability({ resourceType: 'package', resourceId: Number(req.params.id) });
  ok(res, data);
});

export const createPackage = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    image,
    package_price,
    is_active = true,
    sort_order = 0,
    service_ids = [],
  } = req.body;

  const serviceRows = await query(
    `SELECT id, price FROM services WHERE id IN (${service_ids.map(Number).join(',') || 0})`
  );
  if (serviceRows.length !== service_ids.length) {
    throw new AppError('One or more services are invalid.', 400);
  }
  const original_price = serviceRows.reduce((sum, s) => sum + Number(s.price), 0);

  const id = await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO packages (name, description, image, original_price, package_price, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, image || null, original_price, package_price, is_active ? 1 : 0, sort_order]
    );
    for (const sid of service_ids) {
      await connection.query('INSERT INTO package_services (package_id, service_id) VALUES (?, ?)', [
        result.insertId,
        sid,
      ]);
    }
    return result.insertId;
  });

  const rows = await query('SELECT * FROM packages WHERE id = :id', { id });
  const [pkg] = await attachServices(rows);
  created(res, pkg);
});

export const updatePackage = asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM packages WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Package not found.', 404);
  const cur = existing[0];
  const service_ids = req.body.service_ids;

  await withTransaction(async (connection) => {
    let original_price = cur.original_price;
    if (Array.isArray(service_ids)) {
      const serviceRows = await query(
        `SELECT id, price FROM services WHERE id IN (${service_ids.map(Number).join(',') || 0})`
      );
      if (serviceRows.length !== service_ids.length) {
        throw new AppError('One or more services are invalid.', 400);
      }
      original_price = serviceRows.reduce((sum, s) => sum + Number(s.price), 0);
      await connection.query('DELETE FROM package_services WHERE package_id = ?', [cur.id]);
      for (const sid of service_ids) {
        await connection.query('INSERT INTO package_services (package_id, service_id) VALUES (?, ?)', [
          cur.id,
          sid,
        ]);
      }
    }

    await connection.query(
      `UPDATE packages SET
        name = ?, description = ?, image = ?, original_price = ?, package_price = ?,
        is_active = ?, sort_order = ?
       WHERE id = ?`,
      [
        req.body.name ?? cur.name,
        req.body.description ?? cur.description,
        req.body.image ?? cur.image,
        original_price,
        req.body.package_price ?? cur.package_price,
        req.body.is_active === undefined ? cur.is_active : req.body.is_active ? 1 : 0,
        req.body.sort_order ?? cur.sort_order,
        cur.id,
      ]
    );
  });

  const rows = await query('SELECT * FROM packages WHERE id = :id', { id: cur.id });
  const [pkg] = await attachServices(rows);
  ok(res, pkg, 'Package updated');
});

export const deletePackage = asyncHandler(async (req, res) => {
  const deps = await query('SELECT COUNT(*) AS c FROM appointments WHERE package_id = :id', {
    id: req.params.id,
  });
  if (deps[0].c > 0) {
    await query('UPDATE packages SET is_active = 0 WHERE id = :id', { id: req.params.id });
    return ok(res, null, 'Package has appointments and was deactivated.');
  }
  await query('DELETE FROM packages WHERE id = :id', { id: req.params.id });
  ok(res, null, 'Package deleted');
});
