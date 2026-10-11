-- Add client_email for booking confirmation emails; allow reviews without appointments
USE velourmen;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS client_email VARCHAR(191) NULL AFTER client_phone;

-- MySQL < 8.0.29 may not support IF NOT EXISTS on columns — fallback handled in script
ALTER TABLE reviews DROP FOREIGN KEY fk_reviews_appointment;
ALTER TABLE reviews MODIFY appointment_id INT UNSIGNED NULL;
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_appointment
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
