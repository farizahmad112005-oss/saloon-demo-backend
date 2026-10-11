-- Staff / barbers + staff-scoped slot locks
USE velourmen;

CREATE TABLE IF NOT EXISTS staff (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  title VARCHAR(120) NULL DEFAULT 'Barber',
  role ENUM('barber','other') NOT NULL DEFAULT 'barber',
  bio TEXT NULL,
  photo VARCHAR(500) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(191) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff_active_role (is_active, role),
  INDEX idx_staff_sort (sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_available_days (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday ... 6=Saturday',
  CONSTRAINT fk_sad_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  UNIQUE KEY uq_staff_weekday (staff_id, weekday)
) ENGINE=InnoDB;

-- Optional: which services a barber can perform. Empty = all active services.
CREATE TABLE IF NOT EXISTS staff_services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_ss_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_staff_service (staff_id, service_id)
) ENGINE=InnoDB;

-- Add staff_id to appointments (nullable first for existing rows)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'staff_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE appointments ADD COLUMN staff_id INT UNSIGNED NULL AFTER package_id, ADD INDEX idx_appt_staff_date_time (staff_id, appointment_date, appointment_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND CONSTRAINT_NAME = 'fk_appt_staff'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE appointments ADD CONSTRAINT fk_appt_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rebuild slot locks around staff capacity (one barber = one booking per clock time)
ALTER TABLE appointment_slot_locks DROP FOREIGN KEY fk_lock_appointment;

DROP TABLE IF EXISTS appointment_slot_locks_new;
CREATE TABLE appointment_slot_locks_new (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  resource_type ENUM('service','package') NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  appointment_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_slot (staff_id, appointment_date, appointment_time),
  CONSTRAINT fk_lock_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_lock_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Drop old locks (they had no staff_id — appointments remain; rebook if needed)
DROP TABLE IF EXISTS appointment_slot_locks;
RENAME TABLE appointment_slot_locks_new TO appointment_slot_locks;
