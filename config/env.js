import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local .env only; never overrides vars already set by Hostinger / Passenger
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `[env] Missing required environment variables: ${missing.join(', ')}. ` +
      'Set them in Hostinger → Website → Environment variables, then Redeploy/Restart.'
  );
  throw new Error(`Missing required environment variable: ${missing.join(', ')}`);
}

const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const r2Bucket = process.env.R2_BUCKET || '';
const r2Endpoint = process.env.R2_ENDPOINT || '';
const r2PublicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const clientOrigins = (process.env.CLIENT_URLS || clientUrl)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Hostinger Passenger injects PORT — do NOT force 5000 in Hostinger panel
const port = Number(process.env.PORT || process.env.LSNODE_PORT || 5000);

export const env = {
  port: Number.isFinite(port) && port > 0 ? port : 5000,
  clientUrl,
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  timezone: process.env.TZ || 'Asia/Karachi',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  },
  r2: {
    enabled: Boolean(r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2Endpoint),
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    bucket: r2Bucket,
    endpoint: r2Endpoint,
    publicUrl: r2PublicUrl,
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || "Velour Men's Salon <farizahmad112005@gmail.com>",
    adminEmail: process.env.ADMIN_EMAIL || 'farizahmad112005@gmail.com',
  },
};
