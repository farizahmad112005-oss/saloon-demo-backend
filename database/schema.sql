-- Saloon Booking — Velour Men's Hair Salon
-- Database: velourmen

CREATE DATABASE IF NOT EXISTS velourmen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE velourmen;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS appointment_status_history;
DROP TABLE IF EXISTS appointment_slot_locks;
DROP TABLE IF EXISTS slot_blocks;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS discount_services;
DROP TABLE IF EXISTS discounts;
DROP TABLE IF EXISTS banners;
DROP TABLE IF EXISTS package_services;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS staff_services;
DROP TABLE IF EXISTS staff_available_days;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS service_available_days;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS salon_settings;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NULL,
  avatar VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  age TINYINT UNSIGNED NULL,
  phone VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(191) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_phone (phone),
  INDEX idx_customers_email (email)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT NULL,
  image VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE staff (
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

CREATE TABLE staff_available_days (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday ... 6=Saturday (JS/Luxon)',
  CONSTRAINT fk_sad_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  UNIQUE KEY uq_staff_weekday (staff_id, weekday)
) ENGINE=InnoDB;

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 40,
  image VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_services_category (category_id),
  INDEX idx_services_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE staff_services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_ss_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_staff_service (staff_id, service_id)
) ENGINE=InnoDB;

CREATE TABLE service_available_days (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT '0=Sunday ... 6=Saturday (JS/Luxon)',
  CONSTRAINT fk_sad_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_service_weekday (service_id, weekday)
) ENGINE=InnoDB;

CREATE TABLE packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  image VARCHAR(500) NULL,
  original_price DECIMAL(10,2) NOT NULL,
  package_price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_packages_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE package_services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_ps_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_package_service (package_id, service_id)
) ENGINE=InnoDB;

CREATE TABLE banners (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(400) NULL,
  image VARCHAR(500) NOT NULL,
  cta_text VARCHAR(100) NULL,
  cta_url VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE discounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  title VARCHAR(160) NULL,
  description VARCHAR(400) NULL,
  discount_type ENUM('fixed','percentage') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category_id INT UNSIGNED NULL,
  usage_limit INT UNSIGNED NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_discounts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_discounts_active_dates (is_active, start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE discount_services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discount_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_ds_discount FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ds_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY uq_discount_service (discount_id, service_id)
) ENGINE=InnoDB;

CREATE TABLE salon_settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_name VARCHAR(160) NOT NULL DEFAULT 'Velour Salon',
  opening_time TIME NOT NULL DEFAULT '10:00:00',
  closing_time TIME NOT NULL DEFAULT '22:00:00',
  slot_interval_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  phone VARCHAR(40) NULL,
  email VARCHAR(191) NULL,
  address TEXT NULL,
  social_links JSON NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
  booking_horizon_days INT UNSIGNED NOT NULL DEFAULT 30,
  about_text TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_code VARCHAR(32) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NULL,
  booking_type ENUM('service','package') NOT NULL DEFAULT 'service',
  service_id INT UNSIGNED NULL,
  package_id INT UNSIGNED NULL,
  staff_id INT UNSIGNED NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  final_price DECIMAL(10,2) NOT NULL,
  discount_code VARCHAR(60) NULL,
  client_name VARCHAR(120) NOT NULL,
  client_age TINYINT UNSIGNED NULL,
  client_phone VARCHAR(30) NOT NULL,
  client_email VARCHAR(191) NULL,
  status ENUM('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_appt_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_appt_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  CONSTRAINT fk_appt_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
  INDEX idx_appt_date (appointment_date),
  INDEX idx_appt_status (status),
  INDEX idx_appt_phone (client_phone),
  INDEX idx_appt_service_date_time (service_id, appointment_date, appointment_time),
  INDEX idx_appt_package_date_time (package_id, appointment_date, appointment_time),
  INDEX idx_appt_staff_date_time (staff_id, appointment_date, appointment_time),
  INDEX idx_appt_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE appointment_slot_locks (
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

-- Per-barber holds: walk-ins, maintenance, or admin holds for one barber's chair.
-- Unique on (staff_id, date, time) so other barbers stay bookable at the same clock time.
CREATE TABLE slot_blocks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  block_date DATE NOT NULL,
  block_time TIME NOT NULL,
  reason ENUM('walk_in','maintenance','hold','other') NOT NULL DEFAULT 'walk_in',
  client_name VARCHAR(120) NULL,
  client_phone VARCHAR(30) NULL,
  notes VARCHAR(400) NULL,
  blocked_by_admin_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_slot_block (staff_id, block_date, block_time),
  INDEX idx_slot_blocks_date (block_date),
  INDEX idx_slot_blocks_staff_date (staff_id, block_date),
  CONSTRAINT fk_block_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_block_admin FOREIGN KEY (blocked_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE appointment_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  changed_by_type ENUM('admin','customer','system') NOT NULL DEFAULT 'system',
  changed_by_id INT UNSIGNED NULL,
  note VARCHAR(400) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ash_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  INDEX idx_ash_appointment (appointment_id)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  service_name VARCHAR(160) NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
  INDEX idx_reviews_rating (rating),
  INDEX idx_reviews_visible (is_visible)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message VARCHAR(500) NULL,
  payload JSON NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_read (is_read)
) ENGINE=InnoDB;
