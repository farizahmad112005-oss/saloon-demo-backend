import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'appointmentService.js');
let s = fs.readFileSync(file, 'utf8');
const start = s.indexOf('export async function createAppointment');
const end = s.indexOf('export async function getAppointmentById');
if (start < 0 || end < 0) throw new Error('markers missing');

const next = `export async function createAppointment(payload, user = null) {
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
    discount_code,
    notes,
  } = payload;

  if (!client_name?.trim() || !client_phone?.trim()) {
    throw new AppError('Client name and phone are required.', 400);
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
    String(appointment_time).length === 5 ? \`\${appointment_time}:00\` : String(appointment_time).slice(0, 8);

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

    await assertSlotNotBlocked(connection, appointment_date, timeNorm);

    const customerId = await findOrCreateCustomer(connection, {
      name: client_name.trim(),
      age: client_age,
      phone: client_phone.trim(),
      customerId: user?.role === 'customer' ? user.id : null,
    });

    const code = makeAppointmentCode();
    let appointmentId;
    try {
      const [result] = await connection.query(
        \`INSERT INTO appointments (
          appointment_code, customer_id, booking_type, service_id, package_id, staff_id,
          appointment_date, appointment_time, original_price, discount_amount, final_price, discount_code,
          client_name, client_age, client_phone, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)\`,
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
          notes || null,
        ]
      );
      appointmentId = result.insertId;

      await connection.query(
        \`INSERT INTO appointment_slot_locks
          (staff_id, resource_type, resource_id, appointment_date, appointment_time, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)\`,
        [staffId, resourceType, resourceId, appointment_date, timeNorm, appointmentId]
      );

      const [lateBlocks] = await connection.query(
        'SELECT id FROM slot_blocks WHERE block_date = ? AND block_time = ?',
        [appointment_date, timeNorm]
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
      \`INSERT INTO appointment_status_history
        (appointment_id, from_status, to_status, changed_by_type, changed_by_id)
       VALUES (?, NULL, 'pending', ?, ?)\`,
      [appointmentId, user?.role === 'customer' ? 'customer' : 'system', user?.id || null]
    );

    await connection.query(
      \`INSERT INTO notifications (type, title, message, payload)
       VALUES ('appointment_created', 'New appointment', ?, ?)\`,
      [
        \`\${client_name} booked \${serviceRow?.name || packageRow?.name} on \${appointment_date}\`,
        JSON.stringify({ appointment_id: appointmentId, code, staff_id: staffId }),
      ]
    );

    const [created] = await connection.query(
      \`SELECT a.*,
        s.name AS service_name,
        p.name AS package_name,
        c.name AS category_name,
        st.name AS staff_name, st.photo AS staff_photo, st.title AS staff_title
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN packages p ON p.id = a.package_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.id = ?\`,
      [appointmentId]
    );

    return created[0];
  });
}

`;

fs.writeFileSync(file, s.slice(0, start) + next + s.slice(end));
console.log('patched createAppointment');
