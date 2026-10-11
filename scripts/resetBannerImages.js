import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'uploads', 'placeholders');
fs.mkdirSync(dir, { recursive: true });

const banners = [
  { file: 'banner-1.svg', c1: '#F3D9E0', c2: '#C97B84' },
  { file: 'banner-2.svg', c1: '#E8D5B7', c2: '#6B2D3C' },
  { file: 'banner-3.svg', c1: '#D4B5A0', c2: '#C4A265' },
];

for (const b of banners) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700" viewBox="0 0 1600 700">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${b.c1}"/>
      <stop offset="100%" stop-color="${b.c2}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="700" fill="url(#g)"/>
  <circle cx="1280" cy="180" r="220" fill="#ffffff" fill-opacity="0.16"/>
  <circle cx="220" cy="560" r="260" fill="#2A1C20" fill-opacity="0.08"/>
</svg>`;
  fs.writeFileSync(path.join(dir, b.file), svg, 'utf8');
}

await pool.query(
  `UPDATE banners SET
     image = CASE
       WHEN sort_order = 1 OR id = 1 THEN '/uploads/placeholders/banner-1.svg'
       WHEN sort_order = 2 OR id = 2 THEN '/uploads/placeholders/banner-2.svg'
       ELSE '/uploads/placeholders/banner-3.svg'
     END`
);

console.log('Banner images reset to clean salon placeholders');
await pool.end();
