import { DateTime } from 'luxon';
import { env } from '../config/env.js';

export const ZONE = env.timezone || 'Asia/Karachi';

export function nowKarachi() {
  return DateTime.now().setZone(ZONE);
}

export function toKarachiDate(input) {
  if (DateTime.isDateTime(input)) return input.setZone(ZONE);
  if (typeof input === 'string') {
    return DateTime.fromISO(input, { zone: ZONE });
  }
  return DateTime.fromJSDate(input, { zone: ZONE });
}

export function formatDate(dt) {
  return toKarachiDate(dt).toFormat('yyyy-MM-dd');
}

export function formatTime(dt) {
  return toKarachiDate(dt).toFormat('HH:mm:ss');
}

export function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export function formatDisplayTime(timeStr) {
  const dt = DateTime.fromFormat(String(timeStr).slice(0, 8), 'HH:mm:ss', { zone: ZONE });
  if (!dt.isValid) {
    return DateTime.fromFormat(String(timeStr).slice(0, 5), 'HH:mm', { zone: ZONE }).toFormat('h:mm a');
  }
  return dt.toFormat('h:mm a');
}

export function weekdayForDate(dateStr) {
  return DateTime.fromISO(dateStr, { zone: ZONE }).weekday % 7; // Luxon: 1=Mon..7=Sun → JS 0=Sun
}
