import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { generateTimeSlots, isValidSlotTime } from './slotService.js';
import { getServiceWeekdays, getPackageWeekdays } from './availabilityService.js';
import { nowKarachi, formatDate, weekdayForDate } from '../utils/time.js';

const BLOCK_REASONS = new Set(['walk_in', 'maintenance', 'hold', 'other']);
const ACTIVE_APPT = `status NOT IN ('cancelled','no_show')`;

function normalizeTime(time) {
  const raw = String(time || '');
  return raw.length === 5 ? `${raw}:00` : raw.slice(0, 8);
}

function normalizeDate(date) {
  return String(date || '').slice(0, 10);
}

async function loadStaffWeekdays(staffId) {
  const rows = await query(
    'SELECT weekday FROM staff_available_days WHERE staff_id = :staffId ORDER BY weekday',
    { staffId }
  );
  return rows.map((r) => Number(r.weekday));
}

/** True when "now" is strictly after the slot start (slot has begun / passed). */
export function isSlotPast(date, time) {
  const dateStr = normalizeDate(date);
  const timeNorm = normalizeTime(time);
  const today = formatDate(nowKarachi());
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  const slotStart = nowKarachi().set({
    hour: Number(timeNorm.slice(0, 2)),
    minute: Number(timeNorm.slice(3, 5)),
    second: 0,
    millisecond: 0,
  });
  return nowKarachi() > slotStart;
}

/**
 * Blocks for one barber over a date range → Map(date → Map(time → blockRow)).
 */
export async function getBlockedSlotsMap(fromDate, toDate, staffId) {
  if (!staffId) return new Map();

  const rows = await query(
    `SELECT id, staff_id, block_date, block_time, reason, client_name, client_phone, notes, blocked_by_admin_id, created_at
     FROM slot_blocks
     WHERE staff_id = :staffId
       AND block_date BETWEEN :fromDate AND :toDate`,
    { staffId, fromDate, toDate }
  );
  const map = new Map();
  for (const row of rows) {
    const dateKey = String(row.block_date);
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    map.get(dateKey).set(String(row.block_time).slice(0, 8), row);
  }
  return map;
}

export async function assertSlotNotBlocked(connection, staffId, date, timeNorm) {
  const [rows] = await connection.query(
    `SELECT id, reason, client_name FROM slot_blocks
     WHERE staff_id = ? AND block_date = ? AND block_time = ?
     FOR UPDATE`,
    [staffId, date, timeNorm]
  );
  if (rows.length) {
    const reason = rows[0].reason === 'walk_in' ? 'reserved for a walk-in client' : 'blocked by the salon';
    throw new AppError(`This barber's time slot is ${reason}. Please choose another time.`, 409);
  }
}

async function loadStaffOrThrow(staffId) {
  const rows = await query('SELECT * FROM staff WHERE id = :id', { id: staffId });
  if (!rows.length) throw new AppError('Barber not found.', 404);
  return rows[0];
}

/**
 * Day desk for one barber: every clock slot with status + actions.
 */
export async function getDaySlotDesk(date, staffId) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('A valid date (YYYY-MM-DD) is required.', 400);
  }
  const sid = Number(staffId);
  if (!sid) throw new AppError('Select a barber to manage slots.', 400);

  const staff = await loadStaffOrThrow(sid);
  const settings = await getSettings();
  const staffWeekdays = new Set(await loadStaffWeekdays(sid));
  const wd = weekdayForDate(date);
  const barberWorks = staffWeekdays.has(wd);

  const allSlots = generateTimeSlots(
    settings.opening_time,
    settings.closing_time,
    settings.slot_interval_minutes
  );

  const [blocks, appointments] = await Promise.all([
    query(
      `SELECT sb.*, a.name AS admin_name
       FROM slot_blocks sb
       LEFT JOIN admins a ON a.id = sb.blocked_by_admin_id
       WHERE sb.staff_id = :staffId AND sb.block_date = :date
       ORDER BY sb.block_time`,
      { staffId: sid, date }
    ),
    query(
      `SELECT a.id, a.appointment_code, a.appointment_date, a.appointment_time,
              a.client_name, a.client_phone, a.status, a.booking_type, a.final_price,
              a.service_id, a.package_id, a.staff_id,
              s.name AS service_name, p.name AS package_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN packages p ON p.id = a.package_id
       WHERE a.staff_id = :staffId
         AND a.appointment_date = :date
         AND a.${ACTIVE_APPT}
       ORDER BY a.appointment_time, a.id`,
      { staffId: sid, date }
    ),
  ]);

  const blockByTime = new Map(blocks.map((b) => [String(b.block_time).slice(0, 8), b]));
  const apptsByTime = new Map();
  for (const appt of appointments) {
    const t = String(appt.appointment_time).slice(0, 8);
    if (!apptsByTime.has(t)) apptsByTime.set(t, []);
    apptsByTime.get(t).push(appt);
  }

  const slots = allSlots.map((time) => {
    const past = isSlotPast(date, time);
    const block = blockByTime.get(time) || null;
    const booked = apptsByTime.get(time) || [];
    const appointment = booked[0] || null;

    let status = 'available';
    if (!barberWorks) status = 'off';
    else if (block) status = 'blocked';
    else if (appointment) status = 'booked';
    else if (past) status = 'past';

    const canManageTime = !past;

    return {
      time,
      status,
      isPast: past,
      barberWorks,
      block,
      appointment,
      appointments: booked,
      canBlock: status === 'available',
      canUnblock: status === 'blocked' && canManageTime,
      canCancel: status === 'booked' && canManageTime && Boolean(appointment),
      canShift: status === 'booked' && canManageTime && Boolean(appointment),
    };
  });

  return {
    date,
    staff: {
      id: staff.id,
      name: staff.name,
      title: staff.title,
      photo: staff.photo,
      role: staff.role,
      is_active: staff.is_active,
    },
    barberWorks,
    weekday: wd,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
    slot_interval_minutes: settings.slot_interval_minutes,
    slots,
    summary: {
      total: slots.length,
      available: slots.filter((s) => s.status === 'available').length,
      booked: slots.filter((s) => s.status === 'booked').length,
      blocked: slots.filter((s) => s.status === 'blocked').length,
      past: slots.filter((s) => s.status === 'past').length,
      off: slots.filter((s) => s.status === 'off').length,
    },
  };
}

export async function createSlotBlock(payload, adminId) {
  const {
    staff_id,
    block_date,
    block_time,
    reason = 'walk_in',
    client_name = null,
    client_phone = null,
    notes = null,
  } = payload;

  const staffId = Number(staff_id);
  if (!staffId) throw new AppError('Barber is required to block a slot.', 400);
  if (!block_date || !block_time) {
    throw new AppError('Date and time are required to block a slot.', 400);
  }
  if (!BLOCK_REASONS.has(reason)) {
    throw new AppError('Invalid block reason.', 400);
  }

  const staff = await loadStaffOrThrow(staffId);
  if (!staff.is_active) throw new AppError('Cannot block slots for an inactive barber.', 400);

  const settings = await getSettings();
  const today = formatDate(nowKarachi());
  const horizonEnd = formatDate(nowKarachi().plus({ days: settings.booking_horizon_days || 30 }));
  const timeNorm = normalizeTime(block_time);

  if (block_date < today) throw new AppError('Cannot block a past date.', 400);
  if (block_date > horizonEnd) throw new AppError('Date is outside the booking horizon.', 400);
  if (!isValidSlotTime(settings.opening_time, settings.closing_time, settings.slot_interval_minutes, timeNorm)) {
    throw new AppError('Selected time is not a valid salon slot.', 400);
  }
  if (isSlotPast(block_date, timeNorm)) {
    throw new AppError('Cannot block a time that has already passed.', 400);
  }

  const weekdays = await loadStaffWeekdays(staffId);
  if (!weekdays.includes(weekdayForDate(block_date))) {
    throw new AppError('This barber does not work on the selected day.', 400);
  }

  return withTransaction(async (connection) => {
    const [existingBlock] = await connection.query(
      `SELECT id FROM slot_blocks
       WHERE staff_id = ? AND block_date = ? AND block_time = ?
       FOR UPDATE`,
      [staffId, block_date, timeNorm]
    );
    if (existingBlock.length) {
      throw new AppError('This barber slot is already blocked.', 409);
    }

    const [activeBookings] = await connection.query(
      `SELECT id, appointment_code, client_name, booking_type, service_id, package_id, status
       FROM appointments
       WHERE staff_id = ?
         AND appointment_date = ?
         AND appointment_time = ?
         AND ${ACTIVE_APPT}
       FOR UPDATE`,
      [staffId, block_date, timeNorm]
    );

    if (activeBookings.length) {
      throw new AppError(
        'This barber already has an appointment at this time. Cancel or shift it before blocking.',
        409
      );
    }

    let insertId;
    try {
      const [result] = await connection.query(
        `INSERT INTO slot_blocks
          (staff_id, block_date, block_time, reason, client_name, client_phone, notes, blocked_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          staffId,
          block_date,
          timeNorm,
          reason,
          client_name?.trim() || null,
          client_phone?.trim() || null,
          notes?.trim() || null,
          adminId || null,
        ]
      );
      insertId = result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AppError('This barber slot is already blocked.', 409);
      }
      throw err;
    }

    await connection.query(
      `INSERT INTO notifications (type, title, message, payload)
       VALUES ('slot_blocked', 'Barber slot blocked', ?, ?)`,
      [
        `${staff.name}: ${block_date} ${timeNorm.slice(0, 5)} blocked (${reason})`,
        JSON.stringify({
          block_id: insertId,
          staff_id: staffId,
          block_date,
          block_time: timeNorm,
          reason,
        }),
      ]
    );

    const [rows] = await connection.query('SELECT * FROM slot_blocks WHERE id = ?', [insertId]);
    return { block: rows[0], staff };
  });
}

export async function removeSlotBlock(id) {
  const rows = await query('SELECT * FROM slot_blocks WHERE id = :id', { id });
  if (!rows.length) throw new AppError('Blocked slot not found.', 404);
  const block = rows[0];
  if (isSlotPast(block.block_date, block.block_time)) {
    throw new AppError('Cannot unblock a slot that has already passed.', 400);
  }
  await query('DELETE FROM slot_blocks WHERE id = :id', { id });
  return block;
}

export async function removeSlotBlockByDateTime(date, time, staffId) {
  const sid = Number(staffId);
  if (!sid) throw new AppError('Barber is required.', 400);
  const timeNorm = normalizeTime(time);
  const rows = await query(
    `SELECT * FROM slot_blocks
     WHERE staff_id = :staffId AND block_date = :date AND block_time = :time`,
    { staffId: sid, date, time: timeNorm }
  );
  if (!rows.length) throw new AppError('Blocked slot not found.', 404);
  if (isSlotPast(rows[0].block_date, rows[0].block_time)) {
    throw new AppError('Cannot unblock a slot that has already passed.', 400);
  }
  await query('DELETE FROM slot_blocks WHERE id = :id', { id: rows[0].id });
  return rows[0];
}

export async function listSlotBlocks({ from_date, to_date, staff_id } = {}) {
  const settings = await getSettings();
  const today = formatDate(nowKarachi());
  const fromDate = from_date || today;
  const toDate = to_date || formatDate(nowKarachi().plus({ days: settings.booking_horizon_days || 30 }));
  const params = { fromDate, toDate };
  let staffFilter = '';
  if (staff_id) {
    staffFilter = 'AND sb.staff_id = :staffId';
    params.staffId = Number(staff_id);
  }

  return query(
    `SELECT sb.*, a.name AS admin_name, st.name AS staff_name
     FROM slot_blocks sb
     LEFT JOIN admins a ON a.id = sb.blocked_by_admin_id
     LEFT JOIN staff st ON st.id = sb.staff_id
     WHERE sb.block_date BETWEEN :fromDate AND :toDate
       ${staffFilter}
     ORDER BY sb.block_date, sb.block_time, st.name`,
    params
  );
}

/**
 * Find the next free clock slot for a barber (optionally scoped to a service/package).
 * excludeAppointmentId ignores that booking's current lock (for shift).
 */
export async function findNextAvailableSlot({
  staffId,
  fromDate,
  fromTime,
  resourceType = null,
  resourceId = null,
  excludeAppointmentId = null,
}) {
  const settings = await getSettings();
  const horizon = settings.booking_horizon_days || 30;
  const today = nowKarachi().startOf('day');
  const startDate = normalizeDate(fromDate) || formatDate(today);
  const startTime = fromTime ? normalizeTime(fromTime) : '00:00:00';
  const toDate = formatDate(today.plus({ days: horizon }));

  const staffWeekdays = new Set(await loadStaffWeekdays(staffId));
  let resourceWeekdays = null;
  if (resourceType === 'service' && resourceId) {
    resourceWeekdays = new Set(await getServiceWeekdays(resourceId));
  } else if (resourceType === 'package' && resourceId) {
    resourceWeekdays = new Set(await getPackageWeekdays(resourceId));
  }

  const allSlots = generateTimeSlots(
    settings.opening_time,
    settings.closing_time,
    settings.slot_interval_minutes
  );

  const rangeFrom = startDate < formatDate(today) ? formatDate(today) : startDate;

  const [blockedMap, lockRows] = await Promise.all([
    getBlockedSlotsMap(rangeFrom, toDate, staffId),
    query(
      `SELECT appointment_id, appointment_date, appointment_time
       FROM appointment_slot_locks
       WHERE staff_id = :staffId
         AND appointment_date BETWEEN :fromDate AND :toDate`,
      { staffId, fromDate: rangeFrom, toDate }
    ),
  ]);

  const booked = new Map();
  for (const row of lockRows) {
    if (excludeAppointmentId && Number(row.appointment_id) === Number(excludeAppointmentId)) {
      continue;
    }
    const key = String(row.appointment_date);
    if (!booked.has(key)) booked.set(key, new Set());
    booked.get(key).add(String(row.appointment_time).slice(0, 8));
  }

  const scanStart = nowKarachi().set({
    year: Number(startDate.slice(0, 4)),
    month: Number(startDate.slice(5, 7)),
    day: Number(startDate.slice(8, 10)),
    hour: 12,
    minute: 0,
    second: 0,
  });
  const scanEnd = nowKarachi().set({
    year: Number(toDate.slice(0, 4)),
    month: Number(toDate.slice(5, 7)),
    day: Number(toDate.slice(8, 10)),
    hour: 12,
    minute: 0,
    second: 0,
  });

  for (let day = scanStart; day <= scanEnd; day = day.plus({ days: 1 })) {
    const dateKey = formatDate(day);
    const wd = weekdayForDate(dateKey);
    if (!staffWeekdays.has(wd)) continue;
    if (resourceWeekdays && !resourceWeekdays.has(wd)) continue;

    const bookedForDay = booked.get(dateKey) || new Set();
    const blockedForDay = blockedMap.get(dateKey) || new Map();

    for (const time of allSlots) {
      if (dateKey < startDate) continue;
      if (dateKey === startDate && time <= startTime) continue;
      if (isSlotPast(dateKey, time)) continue;
      if (bookedForDay.has(time)) continue;
      if (blockedForDay.has(time)) continue;
      return { date: dateKey, time, displayTime: time.slice(0, 5) };
    }
  }

  return null;
}

/**
 * Cancel appointment and free the barber slot — only if current time is not past the slot start.
 */
export async function cancelAppointmentFromDesk(appointmentId, adminId) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query(
      'SELECT * FROM appointments WHERE id = ? FOR UPDATE',
      [appointmentId]
    );
    if (!rows.length) throw new AppError('Appointment not found.', 404);
    const appt = rows[0];

    if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
      throw new AppError(`Appointment is already ${appt.status}.`, 400);
    }
    if (!appt.staff_id) {
      throw new AppError('Appointment has no assigned barber.', 400);
    }
    if (isSlotPast(appt.appointment_date, appt.appointment_time)) {
      throw new AppError(
        'Cannot free this slot — the appointment time has already passed.',
        400
      );
    }

    await connection.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', appointmentId]);
    await connection.query('DELETE FROM appointment_slot_locks WHERE appointment_id = ?', [appointmentId]);
    await connection.query(
      `INSERT INTO appointment_status_history
        (appointment_id, from_status, to_status, changed_by_type, changed_by_id, note)
       VALUES (?, ?, 'cancelled', 'admin', ?, 'Cancelled from slot manager — slot freed')`,
      [appointmentId, appt.status, adminId || null]
    );

    const [updated] = await connection.query(
      `SELECT a.*,
        s.name AS service_name, p.name AS package_name,
        st.name AS staff_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN packages p ON p.id = a.package_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ?`,
      [appointmentId]
    );

    return {
      appointment: updated[0],
      previousStatus: appt.status,
      freed: {
        staffId: appt.staff_id,
        date: normalizeDate(appt.appointment_date),
        time: normalizeTime(appt.appointment_time),
      },
    };
  });
}

async function assertTargetSlotFree(connection, {
  staffId,
  date,
  timeNorm,
  excludeAppointmentId,
  resourceType,
  resourceId,
}) {
  const settings = await getSettings();
  const today = formatDate(nowKarachi());
  const horizonEnd = formatDate(nowKarachi().plus({ days: settings.booking_horizon_days || 30 }));

  if (date < today || date > horizonEnd) {
    throw new AppError('Target date is outside the booking window.', 400);
  }
  if (!isValidSlotTime(settings.opening_time, settings.closing_time, settings.slot_interval_minutes, timeNorm)) {
    throw new AppError('Target time is not a valid salon slot.', 400);
  }
  if (isSlotPast(date, timeNorm)) {
    throw new AppError('Cannot move to a time that has already passed.', 400);
  }

  const [staffDays] = await connection.query(
    'SELECT weekday FROM staff_available_days WHERE staff_id = ?',
    [staffId]
  );
  const wd = weekdayForDate(date);
  if (!staffDays.some((d) => d.weekday === wd)) {
    throw new AppError('This barber does not work on the target day.', 400);
  }

  if (resourceType === 'service' && resourceId) {
    const weekdays = await getServiceWeekdays(resourceId);
    if (!weekdays.includes(wd)) {
      throw new AppError('This service is not available on the target day.', 400);
    }
  } else if (resourceType === 'package' && resourceId) {
    const weekdays = await getPackageWeekdays(resourceId);
    if (!weekdays.includes(wd)) {
      throw new AppError('This package is not available on the target day.', 400);
    }
  }

  const [blocks] = await connection.query(
    `SELECT id FROM slot_blocks
     WHERE staff_id = ? AND block_date = ? AND block_time = ?
     FOR UPDATE`,
    [staffId, date, timeNorm]
  );
  if (blocks.length) {
    throw new AppError('Target slot is blocked for this barber.', 409);
  }

  const [locks] = await connection.query(
    `SELECT appointment_id FROM appointment_slot_locks
     WHERE staff_id = ? AND appointment_date = ? AND appointment_time = ?
     FOR UPDATE`,
    [staffId, date, timeNorm]
  );
  if (locks.length && Number(locks[0].appointment_id) !== Number(excludeAppointmentId)) {
    throw new AppError('Target slot is already booked for this barber.', 409);
  }
}

/**
 * Shift an appointment to the next free slot or a custom date/time.
 * Frees the previous lock atomically.
 */
export async function shiftAppointmentFromDesk(payload, adminId) {
  const {
    appointment_id,
    mode = 'next',
    appointment_date = null,
    appointment_time = null,
  } = payload;

  const appointmentId = Number(appointment_id);
  if (!appointmentId) throw new AppError('Appointment id is required.', 400);
  if (!['next', 'custom'].includes(mode)) {
    throw new AppError('Mode must be "next" or "custom".', 400);
  }

  // Resolve target outside the transaction for "next" discovery (re-validated inside).
  let targetDate = appointment_date ? normalizeDate(appointment_date) : null;
  let targetTime = appointment_time ? normalizeTime(appointment_time) : null;

  const preview = await query('SELECT * FROM appointments WHERE id = :id', { id: appointmentId });
  if (!preview.length) throw new AppError('Appointment not found.', 404);
  const current = preview[0];

  if (['cancelled', 'completed', 'no_show'].includes(current.status)) {
    throw new AppError(`Cannot shift an appointment that is ${current.status}.`, 400);
  }
  if (!current.staff_id) throw new AppError('Appointment has no assigned barber.', 400);
  if (isSlotPast(current.appointment_date, current.appointment_time)) {
    throw new AppError('Cannot shift — the current appointment time has already passed.', 400);
  }

  if (mode === 'next') {
    const next = await findNextAvailableSlot({
      staffId: current.staff_id,
      fromDate: normalizeDate(current.appointment_date),
      fromTime: normalizeTime(current.appointment_time),
      resourceType: current.booking_type,
      resourceId: current.booking_type === 'package' ? current.package_id : current.service_id,
      excludeAppointmentId: appointmentId,
    });
    if (!next) {
      throw new AppError('No later available slot found for this barber within the booking horizon.', 404);
    }
    targetDate = next.date;
    targetTime = next.time;
  } else {
    if (!targetDate || !targetTime) {
      throw new AppError('Custom shift requires appointment_date and appointment_time.', 400);
    }
  }

  if (
    targetDate === normalizeDate(current.appointment_date) &&
    targetTime === normalizeTime(current.appointment_time)
  ) {
    throw new AppError('Target slot is the same as the current slot.', 400);
  }

  return withTransaction(async (connection) => {
    const [rows] = await connection.query(
      'SELECT * FROM appointments WHERE id = ? FOR UPDATE',
      [appointmentId]
    );
    if (!rows.length) throw new AppError('Appointment not found.', 404);
    const appt = rows[0];

    if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
      throw new AppError(`Cannot shift an appointment that is ${appt.status}.`, 400);
    }
    if (isSlotPast(appt.appointment_date, appt.appointment_time)) {
      throw new AppError('Cannot shift — the current appointment time has already passed.', 400);
    }

    const staffId = appt.staff_id;
    const resourceType = appt.booking_type;
    const resourceId = resourceType === 'package' ? appt.package_id : appt.service_id;
    const oldDate = normalizeDate(appt.appointment_date);
    const oldTime = normalizeTime(appt.appointment_time);

    await assertTargetSlotFree(connection, {
      staffId,
      date: targetDate,
      timeNorm: targetTime,
      excludeAppointmentId: appointmentId,
      resourceType,
      resourceId,
    });

    await connection.query(
      'DELETE FROM appointment_slot_locks WHERE appointment_id = ?',
      [appointmentId]
    );

    try {
      await connection.query(
        `INSERT INTO appointment_slot_locks
          (staff_id, resource_type, resource_id, appointment_date, appointment_time, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [staffId, resourceType, resourceId, targetDate, targetTime, appointmentId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AppError('Target slot was just taken. Please try another time.', 409);
      }
      throw err;
    }

    await connection.query(
      `UPDATE appointments
       SET appointment_date = ?, appointment_time = ?
       WHERE id = ?`,
      [targetDate, targetTime, appointmentId]
    );

    await connection.query(
      `INSERT INTO appointment_status_history
        (appointment_id, from_status, to_status, changed_by_type, changed_by_id, note)
       VALUES (?, ?, ?, 'admin', ?, ?)`,
      [
        appointmentId,
        appt.status,
        appt.status,
        adminId || null,
        `Shifted from ${oldDate} ${oldTime.slice(0, 5)} → ${targetDate} ${targetTime.slice(0, 5)} (${mode})`,
      ]
    );

    await connection.query(
      `INSERT INTO notifications (type, title, message, payload)
       VALUES ('appointment_shifted', 'Appointment shifted', ?, ?)`,
      [
        `${appt.client_name} moved to ${targetDate} ${targetTime.slice(0, 5)}`,
        JSON.stringify({
          appointment_id: appointmentId,
          staff_id: staffId,
          from: { date: oldDate, time: oldTime },
          to: { date: targetDate, time: targetTime },
          mode,
        }),
      ]
    );

    const [updated] = await connection.query(
      `SELECT a.*,
        s.name AS service_name, p.name AS package_name,
        st.name AS staff_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN packages p ON p.id = a.package_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ?`,
      [appointmentId]
    );

    return {
      appointment: updated[0],
      previous: { staffId, date: oldDate, time: oldTime },
      next: { staffId, date: targetDate, time: targetTime },
      mode,
    };
  });
}

export { normalizeTime, normalizeDate };
