/**
 * One-shot: contact info update, client_email column, nullable reviews, clear mock appointments.
 */
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

async function run() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    port: env.db.port,
    database: env.db.database,
    multipleStatements: true,
  });

  console.log('Connected to', env.db.host, env.db.database);

  // client_email column
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'client_email'`,
    [env.db.database]
  );
  if (!cols.length) {
    await conn.query(
      `ALTER TABLE appointments ADD COLUMN client_email VARCHAR(191) NULL AFTER client_phone`
    );
    console.log('Added appointments.client_email');
  } else {
    console.log('client_email already exists');
  }

  // Make reviews.appointment_id nullable
  try {
    await conn.query('ALTER TABLE reviews DROP FOREIGN KEY fk_reviews_appointment');
  } catch (e) {
    console.log('FK drop note:', e.message);
  }
  try {
    await conn.query('ALTER TABLE reviews DROP INDEX appointment_id');
  } catch (e) {
    /* may be named differently */
  }
  await conn.query('ALTER TABLE reviews MODIFY appointment_id INT UNSIGNED NULL');
  try {
    await conn.query(
      `ALTER TABLE reviews ADD CONSTRAINT fk_reviews_appointment
       FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL`
    );
  } catch (e) {
    console.log('FK add note:', e.message);
  }
  console.log('Reviews.appointment_id is nullable');

  // Clear mock / all demo appointments safely
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('DELETE FROM appointment_status_history');
  await conn.query('DELETE FROM appointment_slot_locks');
  await conn.query('DELETE FROM reviews');
  await conn.query('DELETE FROM appointments');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Cleared appointments and related rows');

  await conn.query(
    `INSERT INTO reviews (appointment_id, customer_name, rating, comment, service_name, is_visible, is_featured) VALUES
     (NULL, 'Ahmed Khan', 5, 'Best men''s salon in Faisalabad — skin fade was perfect.', 'Skin Fade', 1, 1),
     (NULL, 'Bilal Malik', 5, 'Top barber shop on Canal Road. Hair spa and cut were excellent.', 'Hair Spa', 1, 1),
     (NULL, 'Hassan Ahmed', 4, 'Great haircut and beard combo. Will book Velour again.', 'Haircut + Beard Combo', 1, 0),
     (NULL, 'Umar Raza', 5, 'Classic cut done right. Professional barbers and clean shop.', 'Classic Haircut', 1, 1)`
  );
  console.log('Inserted standalone reviews');

  await conn.query(
    `UPDATE salon_settings SET
      salon_name = ?,
      phone = ?,
      email = ?,
      address = ?,
      about_text = ?
     WHERE id = 1 OR id = (SELECT id FROM (SELECT id FROM salon_settings ORDER BY id LIMIT 1) t)`,
    [
      "Velour Men's Salon",
      '03007273029',
      'farizahmad112005@gmail.com',
      'Market Place 204 1st Floor Near Crumble, Canal Road, Faisalabad',
      "Velour is Faisalabad's premium men's hair salon and barber shop — sharp cuts, precise fades, beard grooming, and packages built for modern men. Visit us at Canal Road or book online.",
    ]
  );
  console.log('Updated salon_settings contact info');

  const [settings] = await conn.query(
    'SELECT salon_name, phone, email, address FROM salon_settings LIMIT 1'
  );
  const [apptCount] = await conn.query('SELECT COUNT(*) AS c FROM appointments');
  console.log('Settings:', settings[0]);
  console.log('Appointments remaining:', apptCount[0].c);

  await conn.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
