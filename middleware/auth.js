import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Authentication required.', 401);
  }
  const token = header.slice(7);
  const decoded = jwt.verify(token, env.jwtSecret);
  req.user = decoded;
  next();
});

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), env.jwtSecret);
    } catch {
      req.user = null;
    }
  }
  next();
});

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You are not authorized to perform this action.', 403));
    }
    next();
  };
}

export const requireAdmin = [authenticate, requireRole('admin')];
export const requireCustomer = [authenticate, requireRole('customer')];
