import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import {
  createAppointment,
  getAppointmentById,
  listAppointments,
  updateAppointmentStatus,
  lookupByPhone,
} from '../services/appointmentService.js';
import { nowKarachi, formatDate } from '../utils/time.js';
import { getIO, emitSlotFromAppointment } from '../sockets/appointmentSocket.js';
import {
  sendBookingEmails,
  sendStatusChangeEmail,
} from '../services/mailService.js';

export const createValidators = [
  body('client_name').trim().notEmpty(),
  body('client_phone').trim().notEmpty(),
  body('client_email').trim().notEmpty().isEmail().withMessage('Valid email is required for confirmation'),
  body('appointment_date').isISO8601(),
  body('appointment_time').notEmpty(),
  body('staff_id').isInt({ min: 1 }).withMessage('Please select a barber'),
  body('booking_type').optional().isIn(['service', 'package']),
];

export const create = asyncHandler(async (req, res) => {
  const appointment = await createAppointment(req.body, req.user);
  try {
    getIO().to('admins').emit('appointment:created', appointment);
    emitSlotFromAppointment(appointment, 'booked');
  } catch {
    /* socket optional during boot */
  }
  // Non-blocking emails (admin + customer)
  sendBookingEmails(appointment).catch((err) => console.error('[mail] booking:', err.message));
  created(res, appointment, 'Appointment booked successfully');
});

export const listMine = asyncHandler(async (req, res) => {
  const data = await listAppointments({
    customer_id: req.user.id,
    page: req.query.page,
    limit: req.query.limit || 50,
  });
  ok(res, data);
});

export const lookup = asyncHandler(async (req, res) => {
  const items = await lookupByPhone(req.body.phone);
  ok(res, items);
});

export const getOne = asyncHandler(async (req, res) => {
  const appointment = await getAppointmentById(req.params.id);
  if (req.user?.role === 'customer' && appointment.customer_id !== req.user.id) {
    throw new AppError('Not authorized to view this appointment.', 403);
  }
  ok(res, appointment);
});

export const adminList = asyncHandler(async (req, res) => {
  const {
    status,
    service_id,
    customer,
    q,
    date,
    from_date,
    to_date,
    preset,
    page,
    limit,
  } = req.query;

  let fromDate = from_date;
  let toDate = to_date;
  let specificDate = date;
  const today = nowKarachi().startOf('day');

  if (preset === 'today') specificDate = formatDate(today);
  if (preset === 'yesterday') specificDate = formatDate(today.minus({ days: 1 }));
  if (preset === 'tomorrow') specificDate = formatDate(today.plus({ days: 1 }));

  const data = await listAppointments({
    status,
    service_id,
    customer_id: customer,
    q,
    date: specificDate,
    from_date: fromDate,
    to_date: toDate,
    page,
    limit,
  });
  ok(res, data);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const previous = await getAppointmentById(req.params.id);
  const appointment = await updateAppointmentStatus(req.params.id, req.body.status, req.user.id);
  try {
    const io = getIO();
    io.to('admins').emit('appointment:statusChanged', appointment);
    io.emit('appointment:updated', appointment);

    // Slot lock released or restored → push live availability
    if (req.body.status === 'cancelled' && previous.status !== 'cancelled') {
      emitSlotFromAppointment(appointment, 'freed');
    } else if (previous.status === 'cancelled' && req.body.status !== 'cancelled') {
      emitSlotFromAppointment(appointment, 'booked');
    }
  } catch {
    /* ignore */
  }
  if (previous.status !== appointment.status) {
    sendStatusChangeEmail(appointment, previous.status).catch((err) =>
      console.error('[mail] status:', err.message)
    );
  }
  ok(res, appointment, 'Status updated');
});
