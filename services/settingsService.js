import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

export async function getSettings() {
  const rows = await query('SELECT * FROM salon_settings ORDER BY id ASC LIMIT 1');
  if (!rows.length) throw new AppError('Salon settings not configured.', 500);
  const s = rows[0];
  if (typeof s.social_links === 'string') {
    try {
      s.social_links = JSON.parse(s.social_links);
    } catch {
      s.social_links = {};
    }
  }
  return s;
}

export async function updateSettings(payload) {
  const current = await getSettings();
  const fields = {
    salon_name: payload.salon_name ?? current.salon_name,
    opening_time: payload.opening_time ?? current.opening_time,
    closing_time: payload.closing_time ?? current.closing_time,
    slot_interval_minutes: payload.slot_interval_minutes ?? current.slot_interval_minutes,
    phone: payload.phone ?? current.phone,
    email: payload.email ?? current.email,
    address: payload.address ?? current.address,
    social_links: JSON.stringify(payload.social_links ?? current.social_links ?? {}),
    currency: payload.currency ?? current.currency,
    timezone: payload.timezone ?? current.timezone,
    booking_horizon_days: payload.booking_horizon_days ?? current.booking_horizon_days,
    about_text: payload.about_text ?? current.about_text,
  };

  await query(
    `UPDATE salon_settings SET
      salon_name = :salon_name,
      opening_time = :opening_time,
      closing_time = :closing_time,
      slot_interval_minutes = :slot_interval_minutes,
      phone = :phone,
      email = :email,
      address = :address,
      social_links = :social_links,
      currency = :currency,
      timezone = :timezone,
      booking_horizon_days = :booking_horizon_days,
      about_text = :about_text
     WHERE id = :id`,
    { ...fields, id: current.id }
  );

  return getSettings();
}

export function publicSettings(settings) {
  return {
    salon_name: settings.salon_name,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
    slot_interval_minutes: settings.slot_interval_minutes,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    social_links: settings.social_links,
    currency: settings.currency,
    timezone: settings.timezone,
    booking_horizon_days: settings.booking_horizon_days,
    about_text: settings.about_text,
  };
}
