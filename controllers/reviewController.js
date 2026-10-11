import { body } from 'express-validator';
import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';

export const reviewValidators = [
  body('appointment_id').isInt({ min: 1 }),
  body('rating').isInt({ min: 1, max: 5 }),
  body('customer_name').trim().notEmpty(),
  body('comment').optional({ nullable: true }).isString(),
];

export const listReviews = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const top = req.query.top === '5' || req.query.top === 'true';

  let sql = `
    SELECT r.*, a.appointment_code, a.client_phone
    FROM reviews r
    JOIN appointments a ON a.id = r.appointment_id
    ${admin ? '' : 'WHERE r.is_visible = 1'}
    ORDER BY r.rating DESC, r.created_at DESC
  `;
  if (top) sql += ' LIMIT 5';

  const rows = await query(sql);
  ok(res, rows);
});

export const createReview = asyncHandler(async (req, res) => {
  const { appointment_id, rating, customer_name, comment } = req.body;
  const appts = await query('SELECT * FROM appointments WHERE id = :id', { id: appointment_id });
  if (!appts.length) throw new AppError('Appointment not found.', 404);
  const appt = appts[0];

  if (appt.status !== 'completed') {
    throw new AppError('Reviews can only be submitted for completed appointments.', 400);
  }

  if (req.user?.role === 'customer' && appt.customer_id !== req.user.id) {
    throw new AppError('Not authorized to review this appointment.', 403);
  }

  const existing = await query('SELECT id FROM reviews WHERE appointment_id = :id', {
    id: appointment_id,
  });
  if (existing.length) throw new AppError('A review already exists for this appointment.', 409);

  let serviceName = null;
  if (appt.service_id) {
    const s = await query('SELECT name FROM services WHERE id = :id', { id: appt.service_id });
    serviceName = s[0]?.name;
  } else if (appt.package_id) {
    const p = await query('SELECT name FROM packages WHERE id = :id', { id: appt.package_id });
    serviceName = p[0]?.name;
  }

  const result = await query(
    `INSERT INTO reviews (appointment_id, customer_name, rating, comment, service_name, is_visible)
     VALUES (:appointment_id, :customer_name, :rating, :comment, :service_name, 1)`,
    {
      appointment_id,
      customer_name,
      rating,
      comment: comment || null,
      service_name: serviceName,
    }
  );

  const rows = await query('SELECT * FROM reviews WHERE id = :id', { id: result.insertId });
  created(res, rows[0], 'Thank you for your feedback');
});

export const updateReviewVisibility = asyncHandler(async (req, res) => {
  const { is_visible, is_featured } = req.body;
  const existing = await query('SELECT * FROM reviews WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Review not found.', 404);
  await query(
    'UPDATE reviews SET is_visible = :is_visible, is_featured = :is_featured WHERE id = :id',
    {
      id: req.params.id,
      is_visible: is_visible === undefined ? existing[0].is_visible : is_visible ? 1 : 0,
      is_featured: is_featured === undefined ? existing[0].is_featured : is_featured ? 1 : 0,
    }
  );
  const rows = await query('SELECT * FROM reviews WHERE id = :id', { id: req.params.id });
  ok(res, rows[0], 'Review updated');
});

export const deleteReview = asyncHandler(async (req, res) => {
  await query('DELETE FROM reviews WHERE id = :id', { id: req.params.id });
  ok(res, null, 'Review deleted');
});
