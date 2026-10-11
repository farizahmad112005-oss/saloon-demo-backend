import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    if (String(err.message).includes('uq_slot_lock')) {
      message = 'This time slot has just been booked by another customer. Please select another time.';
    } else {
      message = 'A record with this value already exists.';
    }
  }

  if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid authentication token.';
  }

  if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Authentication token has expired.';
  }

  if (status >= 500) {
    console.error(err);
    if (!err.isOperational) {
      message = 'Internal server error';
      details = null;
    }
  }

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}
