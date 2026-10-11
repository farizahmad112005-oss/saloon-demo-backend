import { body } from 'express-validator';
import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';

export const bannerValidators = [
  body('title').trim().notEmpty(),
  body('image').trim().notEmpty(),
];

export const listBanners = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const rows = await query(
    `SELECT * FROM banners
     ${admin ? '' : 'WHERE is_active = 1'}
     ORDER BY sort_order ASC, id DESC`
  );
  ok(res, rows);
});

export const createBanner = asyncHandler(async (req, res) => {
  const { title, subtitle, image, cta_text, cta_url, is_active = true, sort_order = 0 } = req.body;
  const result = await query(
    `INSERT INTO banners (title, subtitle, image, cta_text, cta_url, is_active, sort_order)
     VALUES (:title, :subtitle, :image, :cta_text, :cta_url, :is_active, :sort_order)`,
    {
      title,
      subtitle: subtitle || null,
      image,
      cta_text: cta_text || null,
      cta_url: cta_url || null,
      is_active: is_active ? 1 : 0,
      sort_order,
    }
  );
  const rows = await query('SELECT * FROM banners WHERE id = :id', { id: result.insertId });
  created(res, rows[0]);
});

export const updateBanner = asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM banners WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Banner not found.', 404);
  const cur = existing[0];
  await query(
    `UPDATE banners SET
      title = :title, subtitle = :subtitle, image = :image, cta_text = :cta_text,
      cta_url = :cta_url, is_active = :is_active, sort_order = :sort_order
     WHERE id = :id`,
    {
      id: cur.id,
      title: req.body.title ?? cur.title,
      subtitle: req.body.subtitle ?? cur.subtitle,
      image: req.body.image ?? cur.image,
      cta_text: req.body.cta_text ?? cur.cta_text,
      cta_url: req.body.cta_url ?? cur.cta_url,
      is_active: req.body.is_active === undefined ? cur.is_active : req.body.is_active ? 1 : 0,
      sort_order: req.body.sort_order ?? cur.sort_order,
    }
  );
  const rows = await query('SELECT * FROM banners WHERE id = :id', { id: cur.id });
  ok(res, rows[0], 'Banner updated');
});

export const deleteBanner = asyncHandler(async (req, res) => {
  await query('DELETE FROM banners WHERE id = :id', { id: req.params.id });
  ok(res, null, 'Banner deleted');
});
