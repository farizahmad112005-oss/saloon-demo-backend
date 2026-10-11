import { query } from '../config/db.js';
import { nowKarachi, formatDate } from '../utils/time.js';

export async function getDashboardStats() {
  const today = formatDate(nowKarachi());

  const [totals] = await query(`
    SELECT
      (SELECT COUNT(*) FROM appointments) AS total_appointments,
      (SELECT COUNT(*) FROM appointments WHERE appointment_date = ?) AS today_appointments,
      (SELECT COUNT(*) FROM appointments WHERE status = 'completed') AS completed_appointments,
      (SELECT COALESCE(SUM(final_price), 0) FROM appointments WHERE status = 'completed') AS total_revenue,
      (SELECT COUNT(*) FROM customers) AS total_customers,
      (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending_appointments
  `, [today]);

  return totals;
}

export async function getYearlyChart(year) {
  const y = Number(year) || nowKarachi().year;
  const rows = await query(
    `SELECT
      MONTH(appointment_date) AS month,
      COUNT(*) AS completed_appointments,
      COALESCE(SUM(final_price), 0) AS total_revenue
     FROM appointments
     WHERE status = 'completed' AND YEAR(appointment_date) = :year
     GROUP BY MONTH(appointment_date)
     ORDER BY month`,
    { year: y }
  );

  const months = Array.from({ length: 12 }, (_, i) => {
    const found = rows.find((r) => Number(r.month) === i + 1);
    return {
      month: i + 1,
      label: new Date(y, i, 1).toLocaleString('en', { month: 'short' }),
      completed_appointments: found ? Number(found.completed_appointments) : 0,
      total_revenue: found ? Number(found.total_revenue) : 0,
    };
  });

  return { year: y, months };
}

/** Daily completed appointments + revenue for a given month (Asia/Karachi calendar). */
export async function getMonthlyDailyChart(year, month) {
  const now = nowKarachi();
  const y = Number(year) || now.year;
  const m = Number(month) || now.month;
  const daysInMonth = new Date(y, m, 0).getDate();

  const rows = await query(
    `SELECT
      DAY(appointment_date) AS day,
      COUNT(*) AS completed_appointments,
      COALESCE(SUM(final_price), 0) AS total_revenue
     FROM appointments
     WHERE status = 'completed'
       AND YEAR(appointment_date) = :year
       AND MONTH(appointment_date) = :month
     GROUP BY DAY(appointment_date)
     ORDER BY day`,
    { year: y, month: m }
  );

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const found = rows.find((r) => Number(r.day) === day);
    return {
      day,
      label: String(day),
      completed_appointments: found ? Number(found.completed_appointments) : 0,
      total_revenue: found ? Number(found.total_revenue) : 0,
    };
  });

  return {
    year: y,
    month: m,
    label: new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }),
    days,
  };
}

export async function getInProgressAppointments(limit = 20) {
  return query(
    `SELECT a.*,
      s.name AS service_name,
      p.name AS package_name,
      c.name AS category_name
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN packages p ON p.id = a.package_id
     WHERE a.status IN ('pending', 'confirmed')
     ORDER BY a.appointment_date ASC, a.appointment_time ASC
     LIMIT ${Math.min(50, Math.max(1, Number(limit) || 20))}`
  );
}

// Backward-compatible alias used by existing controller
export async function getMonthlyChart(year) {
  return getYearlyChart(year);
}
