import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { generateTimeSlots } from './slotService.js';
import { getBlockedSlotsMap } from './slotBlockService.js';
import { getServiceWeekdays, getPackageWeekdays } from './availabilityService.js';
import { nowKarachi, formatDate, weekdayForDate } from '../utils/time.js';

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
}

export async function getStaffWeekdays(staffId) {
  const rows = await query(
    'SELECT weekday FROM staff_available_days WHERE staff_id = :staffId ORDER BY weekday',
    { staffId }
  );
  return rows.map((r) => Number(r.weekday));
}

export async function getStaffServiceIds(staffId) {
  const rows = await query(
    'SELECT service_id FROM staff_services WHERE staff_id = :staffId',
    { staffId }
  );
  return rows.map((r) => r.service_id);
}

async function attachStaffMeta(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [days, services] = await Promise.all([
    query(
      `SELECT staff_id, weekday FROM staff_available_days
       WHERE staff_id IN (${ids.join(',')}) ORDER BY weekday`
    ),
    query(
      `SELECT ss.staff_id, ss.service_id, s.name AS service_name
       FROM staff_services ss
       JOIN services s ON s.id = ss.service_id
       WHERE ss.staff_id IN (${ids.join(',')})`
    ),
  ]);

  const dayMap = new Map();
  for (const d of days) {
    if (!dayMap.has(d.staff_id)) dayMap.set(d.staff_id, []);
    dayMap.get(d.staff_id).push(d.weekday);
  }
  const svcMap = new Map();
  for (const s of services) {
    if (!svcMap.has(s.staff_id)) svcMap.set(s.staff_id, []);
    svcMap.get(s.staff_id).push({ id: s.service_id, name: s.service_name });
  }

  return rows.map((r) => ({
    ...r,
    available_days: dayMap.get(r.id) || [],
    services: svcMap.get(r.id) || [],
    // empty services list means barber can perform all services
    can_do_all_services: !(svcMap.get(r.id) || []).length,
  }));
}

export async function listStaff({ admin = false, barbersOnly = false } = {}) {
  const where = [];
  if (!admin) {
    where.push('is_active = 1');
    where.push(`role = 'barber'`);
  } else if (barbersOnly) {
    where.push(`role = 'barber'`);
  }

  const rows = await query(
    `SELECT * FROM staff
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sort_order ASC, name ASC`
  );
  return attachStaffMeta(rows);
}

export async function getStaffById(id, { admin = false } = {}) {
  const rows = await query('SELECT * FROM staff WHERE id = :id', { id });
  if (!rows.length) throw new AppError('Staff member not found.', 404);
  if (!admin && (!rows[0].is_active || rows[0].role !== 'barber')) {
    throw new AppError('Barber not available.', 404);
  }
  const [staff] = await attachStaffMeta(rows);
  return staff;
}

export async function assertStaffCanTakeBooking(connection, {
  staffId,
  resourceType,
  resourceId,
  appointmentDate,
  timeNorm,
}) {
  const [staffRows] = await connection.query(
    'SELECT * FROM staff WHERE id = ? FOR UPDATE',
    [staffId]
  );
  if (!staffRows.length) throw new AppError('Barber not found.', 404);
  const staff = staffRows[0];
  if (!staff.is_active) throw new AppError('This barber is not available.', 400);
  if (staff.role !== 'barber') {
    throw new AppError('Only barbers can be booked for appointments.', 400);
  }

  const [dayRows] = await connection.query(
    'SELECT weekday FROM staff_available_days WHERE staff_id = ?',
    [staffId]
  );
  const weekdays = dayRows.map((r) => r.weekday);
  const wd = weekdayForDate(appointmentDate);
  if (!weekdays.includes(wd)) {
    throw new AppError('Selected barber does not work on this day.', 400);
  }

  if (resourceType === 'service') {
    const [links] = await connection.query(
      'SELECT service_id FROM staff_services WHERE staff_id = ?',
      [staffId]
    );
    if (links.length && !links.some((l) => Number(l.service_id) === Number(resourceId))) {
      throw new AppError('This barber does not offer the selected service.', 400);
    }
  }

  return staff;
}

async function getStaffBookedSlots(staffId, fromDate, toDate) {
  const rows = await query(
    `SELECT appointment_date, appointment_time
     FROM appointment_slot_locks
     WHERE staff_id = :staffId
       AND appointment_date BETWEEN :fromDate AND :toDate`,
    { staffId, fromDate, toDate }
  );
  const map = new Map();
  for (const row of rows) {
    const key = String(row.appointment_date);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(row.appointment_time).slice(0, 8));
  }
  return map;
}

/**
 * Availability for a barber, optionally scoped to a service or package.
 * Day is available only when BOTH the barber and the resource work that weekday.
 * A slot is free when the barber is free and the salon has not blocked the clock time.
 */
export async function getStaffAvailability({
  staffId,
  resourceType = null,
  resourceId = null,
}) {
  const staff = await getStaffById(staffId, { admin: false });
  const settings = await getSettings();
  const horizon = settings.booking_horizon_days || 30;
  const today = nowKarachi().startOf('day');
  const fromDate = formatDate(today);
  const toDate = formatDate(today.plus({ days: horizon }));

  const staffWeekdays = new Set(staff.available_days);
  let resourceWeekdays = null;
  let resourceName = null;
  let resourceActive = true;

  if (resourceType === 'service' && resourceId) {
    const services = await query('SELECT * FROM services WHERE id = :id', { id: resourceId });
    if (!services.length) throw new AppError('Service not found.', 404);
    resourceActive = !!services[0].is_active;
    resourceName = services[0].name;
    if (!staff.can_do_all_services && !staff.services.some((s) => s.id === Number(resourceId))) {
      throw new AppError('This barber does not offer the selected service.', 400);
    }
    resourceWeekdays = new Set(await getServiceWeekdays(resourceId));
  } else if (resourceType === 'package' && resourceId) {
    const packages = await query('SELECT * FROM packages WHERE id = :id', { id: resourceId });
    if (!packages.length) throw new AppError('Package not found.', 404);
    resourceActive = !!packages[0].is_active;
    resourceName = packages[0].name;
    resourceWeekdays = new Set(await getPackageWeekdays(resourceId));
  }

  const allSlots = generateTimeSlots(
    settings.opening_time,
    settings.closing_time,
    settings.slot_interval_minutes
  );
  const [booked, blockedMap] = await Promise.all([
    getStaffBookedSlots(staffId, fromDate, toDate),
    getBlockedSlotsMap(fromDate, toDate, staffId),
  ]);

  const days = [];
  for (let i = 0; i <= horizon; i += 1) {
    const date = today.plus({ days: i });
    const dateStr = formatDate(date);
    const wd = weekdayForDate(dateStr);
    const barberWorks = staffWeekdays.has(wd);
    const resourceWorks = resourceWeekdays ? resourceWeekdays.has(wd) : true;
    const isAvailableDay = resourceActive && barberWorks && resourceWorks;
    const bookedForDay = booked.get(dateStr) || new Set();
    const blockedForDay = blockedMap.get(dateStr) || new Map();

    const slots = allSlots.map((time) => {
      const isPast =
        i === 0 &&
        nowKarachi() >
          date.set({
            hour: Number(time.slice(0, 2)),
            minute: Number(time.slice(3, 5)),
            second: 0,
          });
      const isBooked = bookedForDay.has(time);
      const isBlocked = blockedForDay.has(time);
      const available = isAvailableDay && !isBooked && !isBlocked && !isPast;
      let reason = null;
      if (!isAvailableDay) reason = 'unavailable_day';
      else if (isPast) reason = 'past';
      else if (isBlocked) reason = 'blocked';
      else if (isBooked) reason = 'booked';
      return { time, available, reason };
    });

    days.push({
      date: dateStr,
      weekday: wd,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toFormat('cccc'),
      displayDate: date.toFormat('dd LLL yyyy'),
      isAvailableDay,
      slots,
    });
  }

  return {
    staff,
    resourceType,
    resourceId,
    resourceName,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
    slot_interval_minutes: settings.slot_interval_minutes,
    weekdays: [...staffWeekdays].sort((a, b) => a - b),
    days,
  };
}

export async function createStaff(payload) {
  const {
    name,
    title = 'Barber',
    role = 'barber',
    bio = null,
    photo = null,
    phone = null,
    email = null,
    is_active = true,
    sort_order = 0,
    available_days = [1, 2, 3, 4, 5, 6],
    service_ids = [],
  } = payload;

  if (!name?.trim()) throw new AppError('Staff name is required.', 400);
  if (!['barber', 'other'].includes(role)) throw new AppError('Invalid staff role.', 400);

  const id = await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO staff (name, title, role, bio, photo, phone, email, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        title || 'Barber',
        role,
        bio || null,
        photo || null,
        phone || null,
        email || null,
        is_active ? 1 : 0,
        sort_order || 0,
      ]
    );
    const staffId = result.insertId;
    for (const day of available_days || []) {
      await connection.query(
        'INSERT INTO staff_available_days (staff_id, weekday) VALUES (?, ?)',
        [staffId, day]
      );
    }
    for (const sid of service_ids || []) {
      await connection.query(
        'INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)',
        [staffId, sid]
      );
    }
    return staffId;
  });

  return getStaffById(id, { admin: true });
}

export async function updateStaff(id, payload) {
  const cur = await getStaffById(id, { admin: true });

  await withTransaction(async (connection) => {
    await connection.query(
      `UPDATE staff SET
        name = ?, title = ?, role = ?, bio = ?, photo = ?, phone = ?, email = ?,
        is_active = ?, sort_order = ?
       WHERE id = ?`,
      [
        payload.name ?? cur.name,
        payload.title ?? cur.title,
        payload.role ?? cur.role,
        payload.bio !== undefined ? payload.bio : cur.bio,
        payload.photo !== undefined ? payload.photo : cur.photo,
        payload.phone !== undefined ? payload.phone : cur.phone,
        payload.email !== undefined ? payload.email : cur.email,
        payload.is_active === undefined ? cur.is_active : payload.is_active ? 1 : 0,
        payload.sort_order ?? cur.sort_order,
        id,
      ]
    );

    if (Array.isArray(payload.available_days)) {
      await connection.query('DELETE FROM staff_available_days WHERE staff_id = ?', [id]);
      for (const day of payload.available_days) {
        await connection.query(
          'INSERT INTO staff_available_days (staff_id, weekday) VALUES (?, ?)',
          [id, day]
        );
      }
    }

    if (Array.isArray(payload.service_ids)) {
      await connection.query('DELETE FROM staff_services WHERE staff_id = ?', [id]);
      for (const sid of payload.service_ids) {
        await connection.query(
          'INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)',
          [id, sid]
        );
      }
    }
  });

  return getStaffById(id, { admin: true });
}

export async function deleteStaff(id) {
  const existing = await query('SELECT id FROM staff WHERE id = :id', { id });
  if (!existing.length) throw new AppError('Staff member not found.', 404);

  const deps = await query(
    `SELECT COUNT(*) AS cnt FROM appointments
     WHERE staff_id = :id AND status NOT IN ('cancelled','completed','no_show')`,
    { id }
  );
  const openCount = Number(deps[0]?.cnt || 0);

  if (openCount > 0) {
    await query('UPDATE staff SET is_active = 0 WHERE id = :id', { id });
    return {
      soft: true,
      message: 'Staff has upcoming appointments and was deactivated instead of deleted.',
    };
  }

  await withTransaction(async (connection) => {
    await connection.query(
      `DELETE FROM appointment_slot_locks WHERE staff_id = ?`,
      [id]
    );
    await connection.query('DELETE FROM staff WHERE id = ?', [id]);
  });

  return { soft: false, message: 'Staff member deleted.' };
}

export async function listBarbersForService(serviceId) {
  const all = await listStaff({ admin: false, barbersOnly: true });
  if (!serviceId) return all;
  return all.filter(
    (b) => b.can_do_all_services || b.services.some((s) => Number(s.id) === Number(serviceId))
  );
}

export { slugify };
