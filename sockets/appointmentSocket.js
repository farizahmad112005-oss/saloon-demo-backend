import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

let ioInstance = null;

function normalizeTime(time) {
  const raw = String(time || '');
  if (!raw) return '';
  return raw.length === 5 ? `${raw}:00` : raw.slice(0, 8);
}

function normalizeDate(date) {
  return String(date || '').slice(0, 10);
}

export function initSockets(io) {
  ioInstance = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next();
      const decoded = jwt.verify(token, env.jwtSecret);
      socket.user = decoded;
      return next();
    } catch {
      return next();
    }
  });

  io.on('connection', (socket) => {
    // Public room: guests + customers + admins receive live slot changes
    socket.join('booking');

    if (socket.user?.role === 'admin') {
      socket.join('admins');
    }
    if (socket.user?.role === 'customer') {
      socket.join(`customer:${socket.user.id}`);
    }

    socket.on('join:booking', () => {
      socket.join('booking');
    });

    socket.on('join:admins', () => {
      if (socket.user?.role === 'admin') socket.join('admins');
    });
  });
}

export function getIO() {
  if (!ioInstance) throw new Error('Socket.IO not initialized');
  return ioInstance;
}

/**
 * Broadcast a slot change to every connected booking client.
 * Payload:
 *  { type: 'booked'|'freed'|'blocked'|'unblocked', date, time, salonWide?, resourceType?, resourceId? }
 */
export function emitSlotUpdated(payload) {
  try {
    const io = getIO();
    const event = {
      ...payload,
      date: normalizeDate(payload.date),
      time: normalizeTime(payload.time),
      at: Date.now(),
    };
    io.to('booking').emit('slot:updated', event);
    io.to('admins').emit('slot:updated', event);
  } catch {
    /* socket optional during boot / tests */
  }
}

export function emitSlotFromAppointment(appointment, type) {
  if (!appointment) return;
  const resourceType = appointment.booking_type === 'package' ? 'package' : 'service';
  const resourceId =
    resourceType === 'package'
      ? Number(appointment.package_id)
      : Number(appointment.service_id);

  emitSlotUpdated({
    type,
    date: appointment.appointment_date,
    time: appointment.appointment_time,
    salonWide: false,
    staffId: appointment.staff_id ? Number(appointment.staff_id) : null,
    resourceType,
    resourceId,
    appointmentId: appointment.id,
    appointmentCode: appointment.appointment_code,
  });
}
