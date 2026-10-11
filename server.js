import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { initSockets } from './sockets/appointmentSocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadPath = path.join(__dirname, env.uploadDir);
const placeholderPath = path.join(uploadPath, 'placeholders');

for (const dir of [uploadPath, placeholderPath]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
const server = http.createServer(app);

/**
 * Allow all browser origins (Vercel, localhost, custom domains).
 * Reflects the request Origin so credentials still work.
 * Note: a Hostinger HTML "403 Forbidden" is NOT a CORS failure —
 * that means the Node process is down / .htaccess is stale.
 */
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});
initSockets(io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
// Do NOT use app.options('*') — Express 5 throws (path-to-regexp) and Passenger returns 503
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadPath));

// Root + health — Hostinger probes and browsers often hit /
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Velour API',
    health: '/api/health',
    timezone: env.timezone,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Velour API running', timezone: env.timezone });
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandledRejection:', err);
});

// Passenger / LiteSpeed sets PORT — bind to whatever Hostinger gives us
const listenPort = env.port;
server.listen(listenPort, '0.0.0.0', () => {
  console.log(`Velour API listening on 0.0.0.0:${listenPort}`);
  if (env.r2.enabled && env.r2.publicUrl) {
    console.log(`R2 media: ${env.r2.bucket} → ${env.r2.publicUrl}`);
  } else if (env.r2.enabled) {
    console.warn('R2 credentials found but R2_PUBLIC_URL is empty.');
  }
});
