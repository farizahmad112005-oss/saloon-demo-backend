import { body } from 'express-validator';
import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const categoryValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional({ nullable: true }).isString(),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt(),
];

export const listCategories = asyncHandler(async (req, res) => {
  const admin = req.user?.role === 'admin';
  const rows = await query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id) AS service_count
     FROM categories c
     ${admin ? '' : 'WHERE c.is_active = 1'}
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  ok(res, rows);
});

export const getCategory = asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM categories WHERE id = :id', { id: req.params.id });
  if (!rows.length) throw new AppError('Category not found.', 404);
  ok(res, rows[0]);
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, image, is_active = true, sort_order = 0 } = req.body;
  const slug = slugify(name);
  const result = await query(
    `INSERT INTO categories (name, slug, description, image, is_active, sort_order)
     VALUES (:name, :slug, :description, :image, :is_active, :sort_order)`,
    {
      name,
      slug,
      description: description || null,
      image: image || null,
      is_active: is_active ? 1 : 0,
      sort_order,
    }
  );
  const rows = await query('SELECT * FROM categories WHERE id = :id', { id: result.insertId });
  created(res, rows[0]);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const existing = await query('SELECT * FROM categories WHERE id = :id', { id: req.params.id });
  if (!existing.length) throw new AppError('Category not found.', 404);
  const cur = existing[0];
  const name = req.body.name ?? cur.name;
  await query(
    `UPDATE categories SET
      name = :name, slug = :slug, description = :description, image = :image,
      is_active = :is_active, sort_order = :sort_order
     WHERE id = :id`,
    {
      id: cur.id,
      name,
      slug: slugify(name),
      description: req.body.description ?? cur.description,
      image: req.body.image ?? cur.image,
      is_active: req.body.is_active === undefined ? cur.is_active : req.body.is_active ? 1 : 0,
      sort_order: req.body.sort_order ?? cur.sort_order,
    }
  );
  const rows = await query('SELECT * FROM categories WHERE id = :id', { id: cur.id });
  ok(res, rows[0], 'Category updated');
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const deps = await query('SELECT COUNT(*) AS c FROM services WHERE category_id = :id', {
    id: req.params.id,
  });
  if (deps[0].c > 0) {
    throw new AppError('Cannot delete category with existing services. Deactivate it instead.', 400);
  }
  await query('DELETE FROM categories WHERE id = :id', { id: req.params.id });
  ok(res, null, 'Category deleted');
});
