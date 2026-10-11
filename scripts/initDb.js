import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'database');

async function run() {
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(root, 'seed.sql'), 'utf8');

  const connection = await mysql.createConnection({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    port: env.db.port,
    multipleStatements: true,
  });

  console.log('Running schema...');
  await connection.query(schema);
  console.log('Running seed...');
  await connection.query(seed);
  await connection.end();

  // Admin password via bcrypt
  const { default: bcrypt } = await import('bcryptjs');
  const { pool } = await import('../config/db.js');
  const hash = await bcrypt.hash('Admin@123', 10);
  await pool.query(`DELETE FROM admins WHERE email IN ('admin@saloondb.local', 'Admin@velour.com', 'admin@velour.com')`);
  await pool.query(
    `INSERT INTO admins (name, email, password_hash, phone)
     VALUES ('Salon Admin', 'Admin@velour.com', ?, '03007273029')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name)`,
    [hash]
  );
  await pool.end();
  console.log('Database initialized. Admin: Admin@velour.com / Admin@123');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
