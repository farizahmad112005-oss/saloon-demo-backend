import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { generateTimeSlots } from './slotService.js';
import { nowKarachi, formatDate, weekdayForDate } from '../utils/time.js';

export async function getServiceWeekdays(serviceId) {
  const rows = await query(
    'SELECT weekday FROM service_available_days WHERE service_id = :serviceId ORDER BY weekday',
    { serviceId }
  );
  return rows.map((r) => r.weekday);
}

export async function getPackageWeekdays(packageId) {
  const services = await query(
    `SELECT s.id FROM package_services ps
     JOIN services s ON s.id = ps.service_id
     WHERE ps.package_id = :packageId AND s.is_active = 1`,
    { packageId }
  );
  if (!services.length) return [];

  const daySets = [];
  for (const svc of services) {
    const days = await getServiceWeekdays(svc.id);
    daySets.push(new Set(days));
  }

  const intersection = [...daySets[0]].filter((d) => daySets.every((set) => set.has(d)));
  return intersection.sort((a, b) => a - b);
}

async function getBookedSlots(resourceType, resourceId, fromDate, toDate) {
  const rows = await query(
    `SELECT appointment_date, appointment_time
     FROM appointment_slot_locks
     WHERE resource_type = :resourceType
       AND resource_id = :resourceId
       AND appointment_date BETWEEN :fromDate AND :toDate`,
    { resourceType, resourceId, fromDate, toDate }
  );
  const map = new Map();
  for (const row of rows) {
    const key = `${row.appointment_date}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(row.appointment_time).slice(0, 8));
  }
  return map;
}

export async function getAvailability({ resourceType, resourceId }) {
  const settings = await getSettings();
  const horizon = settings.booking_horizon_days || 30;
  const today = nowKarachi().startOf('day');
  const fromDate = formatDate(today);
  const toDate = formatDate(today.plus({ days: horizon }));

  let weekdays;
  let active = true;
  let name = '';

  if (resourceType === 'service') {
    const services = await query('SELECT * FROM services WHERE id = :id', { id: resourceId });
    if (!services.length) throw new AppError('Service not found.', 404);
    active = !!services[0].is_active;
    name = services[0].name;
    weekdays = await getServiceWeekdays(resourceId);
  } else {
    const packages = await query('SELECT * FROM packages WHERE id = :id', { id: resourceId });
    if (!packages.length) throw new AppError('Package not found.', 404);
    active = !!packages[0].is_active;
    name = packages[0].name;
    weekdays = await getPackageWeekdays(resourceId);
  }

  const allSlots = generateTimeSlots(
    settings.opening_time,
    settings.closing_time,
    settings.slot_interval_minutes
  );
  const [booked, blockedMap] = await Promise.all([
    getBookedSlots(resourceType, resourceId, fromDate, toDate),
    // Service/package calendar without a barber no longer applies salon-wide blocks.
    Promise.resolve(new Map()),
  ]);
  const weekdaySet = new Set(weekdays);
  const days = [];

  for (let i = 0; i <= horizon; i += 1) {
    const date = today.plus({ days: i });
    const dateStr = formatDate(date);
    const wd = weekdayForDate(dateStr);
    const isAvailableDay = active && weekdaySet.has(wd);
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
    resourceType,
    resourceId,
    name,
    isActive: active,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
    slot_interval_minutes: settings.slot_interval_minutes,
    weekdays,
    days,
  };
}
