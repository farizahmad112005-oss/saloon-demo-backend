import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { nowKarachi, formatDate } from '../utils/time.js';

export async function getActivePublicDiscounts() {
  const today = formatDate(nowKarachi());
  return query(
    `SELECT d.id, d.code, d.title, d.description, d.discount_type, d.discount_value,
            d.start_date, d.end_date, d.category_id, c.name AS category_name
     FROM discounts d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.is_active = 1 AND d.start_date <= :today AND d.end_date >= :today
     ORDER BY d.created_at DESC`,
    { today }
  );
}

export async function validateAndCalculateDiscount({
  code,
  bookingType,
  serviceId,
  packageId,
  originalPrice,
  connection = null,
}) {
  if (!code) {
    return { discount_amount: 0, discount_code: null, discount: null };
  }

  const run = connection
    ? async (sql, params) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      }
    : query;

  const today = formatDate(nowKarachi());
  const rows = await run(
    `SELECT * FROM discounts WHERE UPPER(code) = UPPER(:code) LIMIT 1`,
    { code: code.trim() }
  );

  if (!rows.length) throw new AppError('Invalid discount code.', 400);
  const discount = rows[0];

  if (!discount.is_active) throw new AppError('This discount code is not active.', 400);
  if (discount.start_date > today || discount.end_date < today) {
    throw new AppError('This discount code is outside its validity period.', 400);
  }
  if (discount.usage_limit != null && discount.usage_count >= discount.usage_limit) {
    throw new AppError('This discount code has reached its usage limit.', 400);
  }

  if (bookingType === 'package') {
    throw new AppError('Discount codes currently apply to individual services only.', 400);
  }

  const linked = await run(
    'SELECT service_id FROM discount_services WHERE discount_id = :id',
    { id: discount.id }
  );

  if (linked.length) {
    const allowed = linked.map((r) => r.service_id);
    if (!allowed.includes(Number(serviceId))) {
      throw new AppError('This discount code is not applicable to the selected service.', 400);
    }
  } else if (discount.category_id) {
    const services = await run('SELECT category_id FROM services WHERE id = :id', { id: serviceId });
    if (!services.length || services[0].category_id !== discount.category_id) {
      throw new AppError('This discount code is not applicable to the selected category.', 400);
    }
  }

  let discountAmount = 0;
  const price = Number(originalPrice);
  if (discount.discount_type === 'percentage') {
    discountAmount = Math.round((price * Number(discount.discount_value)) / 100);
  } else {
    discountAmount = Number(discount.discount_value);
  }
  discountAmount = Math.min(discountAmount, price);

  return {
    discount_amount: discountAmount,
    discount_code: discount.code,
    discount,
    final_price: price - discountAmount,
  };
}
