import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database');

async function run() {
  const sql = fs.readFileSync(path.join(root, 'migrations', '003_staff_barbers.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    port: env.db.port,
    database: env.db.database,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('Migration 003 applied.');
  } catch (e) {
    console.error('Migration note:', e.code || e.message);
  }

  const [rows] = await conn.query('SELECT COUNT(*) AS c FROM staff');
  if (Number(rows[0].c) === 0) {
    await conn.query(`
      INSERT INTO staff (id, name, title, role, bio, photo, phone, is_active, sort_order) VALUES
      (1, 'Zain Ali', 'Senior Barber', 'barber', 'Precision fades and classic cuts with a clean finish.', '/uploads/placeholders/svc-style.svg', '03001111001', 1, 1),
      (2, 'Omar Farooq', 'Fade Specialist', 'barber', 'Skin fades, tapers, and sharp line-ups.', '/uploads/placeholders/svc-treat.svg', '03001111002', 1, 2),
      (3, 'Rayan Shah', 'Grooming Expert', 'barber', 'Beard sculpting, hot towel shaves, and executive looks.', '/uploads/placeholders/svc-cleanup.svg', '03001111003', 1, 3)
    `);
    await conn.query(`
      INSERT INTO staff_available_days (staff_id, weekday)
      SELECT s.id, d.weekday FROM staff s
      CROSS JOIN (
        SELECT 1 AS weekday UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
      ) d
    `);
    console.log('Default barbers seeded.');
  } else {
    console.log('Staff already present:', rows[0].c);
  }

  await conn.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
