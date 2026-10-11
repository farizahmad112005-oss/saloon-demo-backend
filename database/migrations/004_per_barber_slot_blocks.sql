-- Per-barber slot blocks (replaces salon-wide unique on date+time)
USE velourmen;

-- Drop old unique so we can reshape the table
SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'slot_blocks'
    AND index_name = 'uq_slot_block'
);
SET @sql := IF(@exist > 0, 'ALTER TABLE slot_blocks DROP INDEX uq_slot_block', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add staff_id if missing
SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'slot_blocks'
    AND column_name = 'staff_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE slot_blocks ADD COLUMN staff_id INT UNSIGNED NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Old salon-wide blocks cannot map cleanly to one barber — clear them
DELETE FROM slot_blocks WHERE staff_id IS NULL;

-- Require staff_id going forward
ALTER TABLE slot_blocks
  MODIFY staff_id INT UNSIGNED NOT NULL;

-- Unique per barber + clock time
SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'slot_blocks'
    AND index_name = 'uq_staff_slot_block'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE slot_blocks ADD UNIQUE KEY uq_staff_slot_block (staff_id, block_date, block_time)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'slot_blocks'
    AND index_name = 'idx_slot_blocks_staff_date'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE slot_blocks ADD INDEX idx_slot_blocks_staff_date (staff_id, block_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'slot_blocks'
    AND constraint_name = 'fk_block_staff'
);
SET @sql := IF(
  @fk = 0,
  'ALTER TABLE slot_blocks ADD CONSTRAINT fk_block_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
