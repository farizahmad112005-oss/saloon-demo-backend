import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = path.join(__dirname, '..', 'database', 'migrations', '001_slot_blocks.sql');

async function run() {
  const sql = fs.readFileSync(migration, 'utf8');
  const connection = await mysql.createConnection({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    port: env.db.port,
    database: env.db.database || 'saloondb',
    multipleStatements: true,
  });
  console.log('Applying slot_blocks migration...');
  try {
    await connection.query(sql);
    console.log('Migration applied.');
  } catch (err) {
    if (err.code === 'ER_FK_DUP_NAME' || err.message?.includes('fk_block_admin')) {
      console.log('slot_blocks already exists (or FK already present). Skipping create.');
    } else if (err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('slot_blocks already exists.');
    } else {
      throw err;
    }
  }
  await connection.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
