import { body, param, query as q } from 'express-validator';
import * as slotBlockService from '../services/slotBlockService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { emitSlotUpdated, emitSlotFromAppointment } from '../sockets/appointmentSocket.js';
import { sendStatusChangeEmail, sendShiftEmail } from '../services/mailService.js';
import { getAppointmentById } from '../services/appointmentService.js';

export const blockValidators = [
  body('staff_id').isInt({ min: 1 }).withMessage('Barber is required'),
  body('block_date').isISO8601({ strict: true, strictSeparator: true }).withMessage('Valid date required'),
  body('block_time').matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Valid time required (HH:mm)'),
  body('reason').optional().isIn(['walk_in', 'maintenance', 'hold', 'other']),
  body('client_name').optional({ nullable: true }).isLength({ max: 120 }),
  body('client_phone').optional({ nullable: true }).isLength({ max: 30 }),
  body('notes').optional({ nullable: true }).isLength({ max: 400 }),
];

export const cancelValidators = [
  body('appointment_id').isInt({ min: 1 }),
];

export const shiftValidators = [
  body('appointment_id').isInt({ min: 1 }),
  body('mode').optional().isIn(['next', 'custom']),
  body('appointment_date').optional({ nullable: true }).isISO8601({ strict: true, strictSeparator: true }),
  body('appointment_time').optional({ nullable: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/),
];

export const dayDesk = asyncHandler(async (req, res) => {
  const { formatDate, nowKarachi } = await import('../utils/time.js');
  const date = req.query.date || formatDate(nowKarachi());
  const staffId = req.query.staff_id;
  if (!staffId) {
    return res.status(400).json({ success: false, message: 'staff_id is required' });
  }
  const data = await slotBlockService.getDaySlotDesk(date, staffId);
  res.json({ success: true, data });
});

export const previewNext = asyncHandler(async (req, res) => {
  const staffId = Number(req.query.staff_id);
  if (!staffId) {
    return res.status(400).json({ success: false, message: 'staff_id is required' });
  }
  const next = await slotBlockService.findNextAvailableSlot({
    staffId,
    fromDate: req.query.from_date,
    fromTime: req.query.from_time,
    resourceType: req.query.package_id ? 'package' : req.query.service_id ? 'service' : null,
    resourceId: Number(req.query.package_id || req.query.service_id || 0) || null,
    excludeAppointmentId: req.query.exclude_appointment_id
      ? Number(req.query.exclude_appointment_id)
      : null,
  });
  res.json({ success: true, data: next });
});

export const listBlocks = asyncHandler(async (req, res) => {
  const data = await slotBlockService.listSlotBlocks({
    from_date: req.query.from_date,
    to_date: req.query.to_date,
    staff_id: req.query.staff_id,
  });
  res.json({ success: true, data });
});

export const createBlock = asyncHandler(async (req, res) => {
  const data = await slotBlockService.createSlotBlock(req.body, req.user?.id);
  emitSlotUpdated({
    type: 'blocked',
    date: data.block.block_date,
    time: data.block.block_time,
    salonWide: false,
    staffId: data.block.staff_id,
    reason: data.block.reason,
    blockId: data.block.id,
  });
  res.status(201).json({
    success: true,
    data: data.block,
    message: `Slot blocked for ${data.staff.name}. Online customers can no longer book this barber at that time.`,
  });
});

export const deleteBlock = asyncHandler(async (req, res) => {
  const data = await slotBlockService.removeSlotBlock(Number(req.params.id));
  emitSlotUpdated({
    type: 'unblocked',
    date: data.block_date,
    time: data.block_time,
    salonWide: false,
    staffId: data.staff_id,
    blockId: data.id,
  });
  res.json({ success: true, data, message: 'Slot unblocked for this barber.' });
});

export const deleteBlockByQuery = asyncHandler(async (req, res) => {
  const data = await slotBlockService.removeSlotBlockByDateTime(
    req.query.date,
    req.query.time,
    req.query.staff_id
  );
  emitSlotUpdated({
    type: 'unblocked',
    date: data.block_date,
    time: data.block_time,
    salonWide: false,
    staffId: data.staff_id,
    blockId: data.id,
  });
  res.json({ success: true, data, message: 'Slot unblocked for this barber.' });
});

export const cancelFromDesk = asyncHandler(async (req, res) => {
  const data = await slotBlockService.cancelAppointmentFromDesk(
    Number(req.body.appointment_id),
    req.user?.id
  );
  emitSlotFromAppointment(data.appointment, 'freed');
  // Also emit explicit freed with previous slot (status already cancelled)
  emitSlotUpdated({
    type: 'freed',
    date: data.freed.date,
    time: data.freed.time,
    salonWide: false,
    staffId: data.freed.staffId,
    appointmentId: data.appointment.id,
  });
  const full = await getAppointmentById(data.appointment.id).catch(() => data.appointment);
  sendStatusChangeEmail(full, data.previousStatus || 'pending').catch((err) =>
    console.error('[mail] cancel:', err.message)
  );
  res.json({
    success: true,
    data: data.appointment,
    message: 'Appointment cancelled and barber slot freed.',
  });
});

export const shiftFromDesk = asyncHandler(async (req, res) => {
  const data = await slotBlockService.shiftAppointmentFromDesk(req.body, req.user?.id);
  emitSlotUpdated({
    type: 'freed',
    date: data.previous.date,
    time: data.previous.time,
    salonWide: false,
    staffId: data.previous.staffId,
    appointmentId: data.appointment.id,
  });
  emitSlotFromAppointment(data.appointment, 'booked');
  const full = await getAppointmentById(data.appointment.id).catch(() => data.appointment);
  sendShiftEmail(full, data.previous).catch((err) => console.error('[mail] shift:', err.message));
  res.json({
    success: true,
    data: data.appointment,
    previous: data.previous,
    next: data.next,
    message: `Appointment shifted to ${data.next.date} ${String(data.next.time).slice(0, 5)}. Previous slot freed.`,
  });
});

export const deleteByQueryValidators = [
  q('date').isISO8601({ strict: true, strictSeparator: true }),
  q('time').matches(/^\d{2}:\d{2}(:\d{2})?$/),
  q('staff_id').isInt({ min: 1 }),
];

export const idParam = [param('id').isInt({ min: 1 })];
