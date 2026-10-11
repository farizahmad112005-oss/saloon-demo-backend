-- Add salon-wide slot blocks for existing Velour databases (safe to re-run)
USE velourmen;

CREATE TABLE IF NOT EXISTS slot_blocks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  block_date DATE NOT NULL,
  block_time TIME NOT NULL,
  reason ENUM('walk_in','maintenance','hold','other') NOT NULL DEFAULT 'walk_in',
  client_name VARCHAR(120) NULL,
  client_phone VARCHAR(30) NULL,
  notes VARCHAR(400) NULL,
  blocked_by_admin_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slot_block (block_date, block_time),
  INDEX idx_slot_blocks_date (block_date),
  CONSTRAINT fk_block_admin FOREIGN KEY (blocked_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

UPDATE salon_settings
SET salon_name = 'Velour Salon',
    about_text = 'Velour is a premium men''s hair salon built for sharp cuts, precise fades, and grooming that feels intentional. Clean lines, skilled barbers, and a calm black-and-gold space — book online or walk in.',
    email = COALESCE(NULLIF(email, ''), 'farizahmad112005@gmail.com'),
    opening_time = COALESCE(opening_time, '10:00:00'),
    closing_time = COALESCE(closing_time, '22:00:00')
WHERE id = 1 OR salon_name LIKE '%Luxe%' OR salon_name LIKE '%Belle%';
