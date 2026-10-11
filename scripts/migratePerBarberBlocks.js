import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database');

async function run() {
  const sql = fs.readFileSync(path.join(root, 'migrations', '004_per_barber_slot_blocks.sql'), 'utf8');
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
    console.log('Migration 004 applied (per-barber slot_blocks).');
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
