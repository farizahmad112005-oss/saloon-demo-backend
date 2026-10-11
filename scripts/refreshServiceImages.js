import { pool } from '../config/db.js';

const map = {
  1: '/uploads/placeholders/svc-facial.svg',
  2: '/uploads/placeholders/svc-deep.svg',
  3: '/uploads/placeholders/svc-hydrate.svg',
  4: '/uploads/placeholders/svc-glow.svg',
  5: '/uploads/placeholders/svc-style.svg',
  6: '/uploads/placeholders/svc-treat.svg',
  7: '/uploads/placeholders/svc-wash.svg',
  8: '/uploads/placeholders/svc-hairspa.svg',
  9: '/uploads/placeholders/svc-party.svg',
  10: '/uploads/placeholders/svc-bridal-mu.svg',
  11: '/uploads/placeholders/svc-event.svg',
  12: '/uploads/placeholders/svc-cleanup.svg',
  13: '/uploads/placeholders/svc-skin.svg',
  14: '/uploads/placeholders/svc-hydration.svg',
  15: '/uploads/placeholders/svc-aroma.svg',
  16: '/uploads/placeholders/svc-polish.svg',
  17: '/uploads/placeholders/svc-trial.svg',
  18: '/uploads/placeholders/svc-bridal-full.svg',
  19: '/uploads/placeholders/svc-mani.svg',
  20: '/uploads/placeholders/svc-gel.svg',
  21: '/uploads/placeholders/svc-night.svg',
};

async function run() {
  for (const [id, image] of Object.entries(map)) {
    await pool.query('UPDATE services SET image = ? WHERE id = ?', [image, Number(id)]);
  }
  await pool.query(
    `UPDATE packages SET image = CASE id
      WHEN 1 THEN '/uploads/placeholders/pkg-glow.svg'
      WHEN 2 THEN '/uploads/placeholders/pkg-bridal.svg'
      WHEN 3 THEN '/uploads/placeholders/pkg-radiance.svg'
      WHEN 4 THEN '/uploads/placeholders/pkg-evening.svg'
      ELSE image END`
  );
  console.log('Service and package images refreshed');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
