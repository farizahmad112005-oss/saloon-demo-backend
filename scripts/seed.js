import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

const ADMIN_EMAIL = 'Admin@velour.com';
const ADMIN_PASSWORD = 'Admin@123';

async function seedAdmin() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // Migrate legacy demo admin if present
  await pool.query(`DELETE FROM admins WHERE email IN ('admin@saloondb.local', 'Admin@velour.com', 'admin@velour.com')`);

  await pool.query(
    `INSERT INTO admins (name, email, password_hash, phone)
     VALUES ('Salon Admin', ?, ?, '03007273029')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), phone = VALUES(phone)`,
    [ADMIN_EMAIL, hash]
  );

  console.log(`Admin seeded: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await pool.end();
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
