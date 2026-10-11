import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../middleware/auth.js';
import { ok, created } from '../utils/response.js';

export const adminLoginValidators = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const customerRegisterValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('email').optional({ nullable: true }).isEmail().withMessage('Valid email required'),
  body('age').optional({ nullable: true }).isInt({ min: 10, max: 100 }),
];

export const customerLoginValidators = [
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const rows = await query('SELECT * FROM admins WHERE email = :email LIMIT 1', { email });
  if (!rows.length || !rows[0].is_active) throw new AppError('Invalid email or password.', 401);
  const admin = rows[0];
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) throw new AppError('Invalid email or password.', 401);

  const token = signToken({ id: admin.id, role: 'admin', email: admin.email, name: admin.name });
  ok(res, {
    token,
    user: { id: admin.id, name: admin.name, email: admin.email, phone: admin.phone, role: 'admin', avatar: admin.avatar },
  }, 'Admin logged in');
});

export const customerRegister = asyncHandler(async (req, res) => {
  const { name, phone, email, password, age } = req.body;
  const existingPhone = await query('SELECT id, password_hash FROM customers WHERE phone = :phone', { phone });
  if (existingPhone.length && existingPhone[0].password_hash) {
    throw new AppError('An account with this phone already exists.', 409);
  }
  if (email) {
    const existingEmail = await query('SELECT id FROM customers WHERE email = :email', { email });
    if (existingEmail.length) throw new AppError('Email already in use.', 409);
  }

  const password_hash = await bcrypt.hash(password, 10);
  let customerId;

  if (existingPhone.length) {
    await query(
      `UPDATE customers SET name = :name, age = :age, email = COALESCE(:email, email), password_hash = :password_hash WHERE id = :id`,
      { name, age: age || null, email: email || null, password_hash, id: existingPhone[0].id }
    );
    customerId = existingPhone[0].id;
  } else {
    const result = await query(
      `INSERT INTO customers (name, age, phone, email, password_hash) VALUES (:name, :age, :phone, :email, :password_hash)`,
      { name, age: age || null, phone, email: email || null, password_hash }
    );
    customerId = result.insertId;
  }

  const token = signToken({ id: customerId, role: 'customer', phone, name });
  created(res, {
    token,
    user: { id: customerId, name, phone, email: email || null, age: age || null, role: 'customer' },
  }, 'Account created');
});

export const customerLogin = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const rows = await query('SELECT * FROM customers WHERE phone = :phone LIMIT 1', { phone });
  if (!rows.length || !rows[0].password_hash) throw new AppError('Invalid phone or password.', 401);
  const customer = rows[0];
  const match = await bcrypt.compare(password, customer.password_hash);
  if (!match) throw new AppError('Invalid phone or password.', 401);

  const token = signToken({ id: customer.id, role: 'customer', phone: customer.phone, name: customer.name });
  ok(res, {
    token,
    user: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      age: customer.age,
      role: 'customer',
    },
  }, 'Logged in');
});

export const getAdminProfile = asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, name, email, phone, avatar, created_at FROM admins WHERE id = :id',
    { id: req.user.id }
  );
  if (!rows.length) throw new AppError('Admin not found.', 404);
  ok(res, rows[0]);
});

export const updateAdminProfile = asyncHandler(async (req, res) => {
  const { name, phone, currentPassword, newPassword } = req.body;
  const rows = await query('SELECT * FROM admins WHERE id = :id', { id: req.user.id });
  if (!rows.length) throw new AppError('Admin not found.', 404);
  const admin = rows[0];

  let password_hash = admin.password_hash;
  if (newPassword) {
    if (!currentPassword) throw new AppError('Current password is required.', 400);
    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) throw new AppError('Current password is incorrect.', 400);
    password_hash = await bcrypt.hash(newPassword, 10);
  }

  await query(
    'UPDATE admins SET name = :name, phone = :phone, password_hash = :password_hash WHERE id = :id',
    {
      name: name || admin.name,
      phone: phone ?? admin.phone,
      password_hash,
      id: admin.id,
    }
  );

  const updated = await query(
    'SELECT id, name, email, phone, avatar, created_at FROM admins WHERE id = :id',
    { id: admin.id }
  );
  ok(res, updated[0], 'Profile updated');
});
