import { parseTimeToMinutes, minutesToTime } from '../utils/time.js';

/**
 * Generate time slots from opening to closing using interval minutes.
 * Last slot must start early enough that it doesn't go past closing (exclusive end).
 */
export function generateTimeSlots(openingTime, closingTime, intervalMinutes) {
  const start = parseTimeToMinutes(openingTime);
  const end = parseTimeToMinutes(closingTime);
  const interval = Number(intervalMinutes) || 40;

  if (interval <= 0 || end <= start) return [];

  const slots = [];
  for (let t = start; t < end; t += interval) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

export function isValidSlotTime(openingTime, closingTime, intervalMinutes, timeStr) {
  const slots = generateTimeSlots(openingTime, closingTime, intervalMinutes);
  const normalized = String(timeStr).length === 5 ? `${timeStr}:00` : String(timeStr).slice(0, 8);
  return slots.includes(normalized);
}
