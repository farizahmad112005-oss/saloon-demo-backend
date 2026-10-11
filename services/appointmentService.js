import { randomBytes } from 'crypto';
import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { isValidSlotTime } from './slotService.js';
import { getServiceWeekdays, getPackageWeekdays } from './availabilityService.js';
import { assertSlotNotBlocked } from './slotBlockService.js';
import { assertStaffCanTakeBooking } from './staffService.js';
import { validateAndCalculateDiscount } from './discountService.js';
import { nowKarachi, formatDate, weekdayForDate } from '../utils/time.js';

function makeAppointmentCode() {
  return `VL-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function findOrCreateCustomer(connection, { name, age, phone, email, customerId }) {
  if (customerId) {
    const [rows] = await connection.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (rows.length) {
      await connection.query(
        'UPDATE customers SET name = COALESCE(?, name), age = COALESCE(?, age), email = COALESCE(?, email) WHERE id = ?',
        [name, age, email || null, customerId]
      );
      return rows[0].id;
    }
  }

  const [existing] = await connection.query('SELECT id FROM customers WHERE phone = ?', [phone]);
  if (existing.length) {
    await connection.query(
      'UPDATE customers SET name = ?, age = COALESCE(?, age), email = COALESCE(?, email) WHERE id = ?',
      [name, age, email || null, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await connection.query(
    'INSERT INTO customers (name, age, phone, email) VALUES (?, ?, ?, ?)',
    [name, age || null, phone, email || null]
  );
  return result.insertId;
}

export async function createAppointment(payload, user = null) {
  const {
    booking_type = 'service',
    service_id,
    package_id,
    staff_id,
    appointment_date,
    appointment_time,
    client_name,
    client_age,
    client_phone,
    client_email,
    discount_code,
    notes,
  } = payload;

  if (!client_name?.trim() || !client_phone?.trim()) {
    throw new AppError('Client name and phone are required.', 400);
  }
  const emailNorm = client_email?.trim() || null;
  if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    throw new AppError('Please enter a valid email address.', 400);
  }
  if (!appointment_date || !appointment_time) {
    throw new AppError('Appointment date and time are required.', 400);
  }
  const staffId = Number(staff_id);
  if (!staffId) {
    throw new AppError('Please select a barber for your appointment.', 400);
  }

  const settings = await getSettings();
  const today = formatDate(nowKarachi());
  const horizonEnd = formatDate(nowKarachi().plus({ days: settings.booking_horizon_days || 30 }));

  if (appointment_date < today || appointment_date > horizonEnd) {
    throw new AppError('Selected date is outside the booking window.', 400);
  }

  const timeNorm =
    String(appointment_time).length === 5 ? `${appointment_time}:00` : String(appointment_time).slice(0, 8);

  if (!isValidSlotTime(settings.opening_time, settings.closing_time, settings.slot_interval_minutes, timeNorm)) {
    throw new AppError('Selected time is not a valid salon slot.', 400);
  }

  const resourceType = booking_type === 'package' ? 'package' : 'service';
  const resourceId = resourceType === 'package' ? Number(package_id) : Number(service_id);
  if (!resourceId) throw new AppError('Service or package is required.', 400);

  return withTransaction(async (connection) => {
    let originalPrice = 0;
    let serviceRow = null;
    let packageRow = null;

    if (resourceType === 'service') {
      const [rows] = await connection.query('SELECT * FROM services WHERE id = ? FOR UPDATE', [resourceId]);
      if (!rows.length) throw new AppError('Service not found.', 404);
      serviceRow = rows[0];
      if (!serviceRow.is_active) {
        throw new AppError('This service is not available at the moment.', 400);
      }
      const weekdays = await getServiceWeekdays(resourceId);
      const wd = weekdayForDate(appointment_date);
      if (!weekdays.includes(wd)) {
        throw new AppError('Selected service is not available on this day.', 400);
      }
      originalPrice = Number(serviceRow.price);
    } else {
      const [rows] = await connection.query('SELECT * FROM packages WHERE id = ? FOR UPDATE', [resourceId]);
      if (!rows.length) throw new AppError('Package not found.', 404);
      packageRow = rows[0];
      if (!packageRow.is_active) {
        throw new AppError('This package is not available at the moment.', 400);
      }
      const weekdays = await getPackageWeekdays(resourceId);
      const wd = weekdayForDate(appointment_date);
      if (!weekdays.includes(wd)) {
        throw new AppError('Selected package is not available on this day.', 400);
      }
      originalPrice = Number(packageRow.package_price);
    }

    await assertStaffCanTakeBooking(connection, {
      staffId,
      resourceType,
      resourceId,
      appointmentDate: appointment_date,
      timeNorm,
    });

    const discountResult = await validateAndCalculateDiscount({
      code: discount_code,
      bookingType: resourceType,
      serviceId: resourceType === 'service' ? resourceId : null,
      packageId: resourceType === 'package' ? resourceId : null,
      originalPrice,
      connection,
    });

    const discountAmount = discountResult.discount_amount || 0;
    const finalPrice = originalPrice - discountAmount;

    // Salon-wide admin holds (walk-ins / maintenance) must win over online booking.
    await assertSlotNotBlocked(connection, staffId, appointment_date, timeNorm);

    const customerId = await findOrCreateCustomer(connection, {
      name: client_name.trim(),
      age: client_age,
      phone: client_phone.trim(),
      email: emailNorm,
      customerId: user?.role === 'customer' ? user.id : null,
    });

    const code = makeAppointmentCode();
    let appointmentId;
    try {
      const [result] = await connection.query(
        `INSERT INTO appointments (
          appointment_code, customer_id, booking_type, service_id, package_id, staff_id,
          appointment_date, appointment_time, original_price, discount_amount, final_price, discount_code,
          client_name, client_age, client_phone, client_email, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          code,
          customerId,
          resourceType,
          resourceType === 'service' ? resourceId : null,
          resourceType === 'package' ? resourceId : null,
          staffId,
          appointment_date,
          timeNorm,
          originalPrice,
          discountAmount,
          finalPrice,
          discountResult.discount_code,
          client_name.trim(),
          client_age || null,
          client_phone.trim(),
          emailNorm,
          notes || null,
        ]
      );
      appointmentId = result.insertId;

      await connection.query(
        `INSERT INTO appointment_slot_locks
          (staff_id, resource_type, resource_id, appointment_date, appointment_time, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [staffId, resourceType, resourceId, appointment_date, timeNorm, appointmentId]
      );

      // Final guard: a walk-in block may have landed in a parallel transaction.
      const [lateBlocks] = await connection.query(
        'SELECT id FROM slot_blocks WHERE staff_id = ? AND block_date = ? AND block_time = ?',
        [staffId, appointment_date, timeNorm]
      );
      if (lateBlocks.length) {
        throw new AppError(
          'This time slot was just held by the salon for a walk-in. Please select another time.',
          409
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AppError(
          'This barber was just booked for that time. Please select another slot or barber.',
          409
        );
      }
      throw err;
    }

    if (discountResult.discount) {
      await connection.query('UPDATE discounts SET usage_count = usage_count + 1 WHERE id = ?', [
        discountResult.discount.id,
      ]);
    }

    await connection.query(
      `INSERT INTO appointment_status_history
        (appointment_id, from_status, to_status, changed_by_type, changed_by_id)
       VALUES (?, NULL, 'pending', ?, ?)`,
      [appointmentId, user?.role === 'customer' ? 'customer' : 'system', user?.id || null]
    );

    await connection.query(
      `INSERT INTO notifications (type, title, message, payload)
       VALUES ('appointment_created', 'New appointment', ?, ?)`,
      [
        `${client_name} booked ${serviceRow?.name || packageRow?.name} on ${appointment_date}`,
        JSON.stringify({ appointment_id: appointmentId, code, staff_id: staffId }),
      ]
    );

    const [created] = await connection.query(
      `SELECT a.*,
        s.name AS service_name,
        p.name AS package_name,
        c.name AS category_name,
        st.name AS staff_name, st.photo AS staff_photo, st.title AS staff_title
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN packages p ON p.id = a.package_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ?`,
      [appointmentId]
    );

    return created[0];
  });
}

export async function getAppointmentById(id) {
  const rows = await query(
    `SELECT a.*,
      s.name AS service_name, s.duration_minutes, s.image AS service_image,
      p.name AS package_name, p.image AS package_image,
      c.name AS category_name,
      st.name AS staff_name, st.photo AS staff_photo, st.title AS staff_title,
      cu.email AS customer_email,
      r.id AS review_id, r.rating, r.comment AS review_comment, r.customer_name AS review_customer_name
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN packages p ON p.id = a.package_id
     LEFT JOIN staff st ON st.id = a.staff_id
     LEFT JOIN customers cu ON cu.id = a.customer_id
     LEFT JOIN reviews r ON r.appointment_id = a.id
     WHERE a.id = :id`,
    { id }
  );
  if (!rows.length) throw new AppError('Appointment not found.', 404);
  return rows[0];
}

export async function listAppointments(filters = {}) {
  const where = ['1=1'];
  const params = {};

  if (filters.status) {
    where.push('a.status = :status');
    params.status = filters.status;
  }
  if (filters.service_id) {
    where.push('a.service_id = :service_id');
    params.service_id = filters.service_id;
  }
  if (filters.customer_id) {
    where.push('a.customer_id = :customer_id');
    params.customer_id = filters.customer_id;
  }
  if (filters.phone) {
    where.push('a.client_phone = :phone');
    params.phone = filters.phone;
  }
  if (filters.date) {
    where.push('a.appointment_date = :date');
    params.date = filters.date;
  }
  if (filters.from_date) {
    where.push('a.appointment_date >= :from_date');
    params.from_date = filters.from_date;
  }
  if (filters.to_date) {
    where.push('a.appointment_date <= :to_date');
    params.to_date = filters.to_date;
  }
  if (filters.q) {
    where.push(
      '(a.client_name LIKE :q OR a.client_phone LIKE :q OR a.appointment_code LIKE :q OR s.name LIKE :q OR p.name LIKE :q)'
    );
    params.q = `%${filters.q}%`;
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  const items = await query(
    `SELECT a.*,
      s.name AS service_name,
      p.name AS package_name,
      c.name AS category_name,
      st.name AS staff_name,
      r.id AS review_id
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN packages p ON p.id = a.package_id
     LEFT JOIN staff st ON st.id = a.staff_id
     LEFT JOIN reviews r ON r.appointment_id = a.id
     WHERE ${where.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN packages p ON p.id = a.package_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  return { items, total: countRows[0].total, page, limit };
}

export async function updateAppointmentStatus(id, status, adminId) {
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  if (!allowed.includes(status)) throw new AppError('Invalid status.', 400);

  await withTransaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new AppError('Appointment not found.', 404);
    const appt = rows[0];
    if (appt.status === status) return;

    await connection.query('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);
    await connection.query(
      `INSERT INTO appointment_status_history
        (appointment_id, from_status, to_status, changed_by_type, changed_by_id)
       VALUES (?, ?, ?, 'admin', ?)`,
      [id, appt.status, status, adminId || null]
    );

    if (status === 'cancelled') {
      await connection.query('DELETE FROM appointment_slot_locks WHERE appointment_id = ?', [id]);
    } else if (appt.status === 'cancelled' && status !== 'cancelled') {
      if (!appt.staff_id) {
        throw new AppError('Cannot restore appointment without an assigned barber.', 400);
      }
      try {
        await connection.query(
          `INSERT INTO appointment_slot_locks
            (staff_id, resource_type, resource_id, appointment_date, appointment_time, appointment_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            appt.staff_id,
            appt.booking_type,
            appt.booking_type === 'package' ? appt.package_id : appt.service_id,
            appt.appointment_date,
            appt.appointment_time,
            id,
          ]
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          throw new AppError('Cannot restore appointment; this barber slot is already taken.', 409);
        }
        throw err;
      }
    }
  });

  // Fetch after commit so the returned status is never stale from another connection.
  return getAppointmentById(id);
}

export async function lookupByPhone(phone) {
  if (!phone?.trim()) throw new AppError('Phone number is required.', 400);
  const { items } = await listAppointments({ phone: phone.trim(), limit: 50, page: 1 });
  return items;
}
