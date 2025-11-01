-- MySQL schema for basic auth + role-scoped public IDs

-- 1) Base table (fresh install path)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  -- role-scoped public id: student => s#, mentor => m#
  `public_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`),
  UNIQUE KEY `uniq_users_public_id` (`public_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Defensive migration (existing DB path)
-- Ensure `public_id` column and unique index exist
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `public_id` VARCHAR(20) NULL AFTER `role`;
CREATE UNIQUE INDEX IF NOT EXISTS `uniq_users_public_id` ON `users` (`public_id`);

-- 3) Role counters table used to allocate next serial per role
CREATE TABLE IF NOT EXISTS `role_counters` (
  `role` ENUM('mentor','student') NOT NULL PRIMARY KEY,
  `next_serial` INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed counters; start from 0 so first allocation becomes 1
INSERT IGNORE INTO `role_counters` (`role`, `next_serial`) VALUES
  ('student', 0),
  ('mentor', 0);

-- 4) Backfill `public_id` for existing rows where it is NULL
-- Students => s1, s2, ... by ascending `id`
SET @s := 0;
UPDATE `users` u
JOIN (
  SELECT id, (@s := @s + 1) AS rn
  FROM `users`
  WHERE role = 'student'
  ORDER BY id
) x USING (id)
SET u.public_id = COALESCE(u.public_id, CONCAT('s', x.rn))
WHERE u.role = 'student' AND u.public_id IS NULL;

-- Mentors => m1, m2, ... by ascending `id`
SET @m := 0;
UPDATE `users` u
JOIN (
  SELECT id, (@m := @m + 1) AS rn
  FROM `users`
  WHERE role = 'mentor'
  ORDER BY id
) y USING (id)
SET u.public_id = COALESCE(u.public_id, CONCAT('m', y.rn))
WHERE u.role = 'mentor' AND u.public_id IS NULL;

-- 5) Sync counters to current max per role to prepare for future inserts
UPDATE `role_counters` rc
LEFT JOIN (
  SELECT 'student' AS role, COALESCE(MAX(CAST(SUBSTRING(public_id, 2) AS UNSIGNED)), 0) AS mx
  FROM `users` WHERE role = 'student'
  UNION ALL
  SELECT 'mentor' AS role, COALESCE(MAX(CAST(SUBSTRING(public_id, 2) AS UNSIGNED)), 0) AS mx
  FROM `users` WHERE role = 'mentor'
) t ON t.role = rc.role
SET rc.next_serial = COALESCE(t.mx, 0);

-- After backfill, enforce NOT NULL on existing DBs
ALTER TABLE `users` MODIFY `public_id` VARCHAR(20) NOT NULL;

-- 6) Trigger to auto-assign `public_id` on insert when not provided
-- Uses LAST_INSERT_ID trick to atomically fetch incrementing serial per role
DROP TRIGGER IF EXISTS `bi_users_public_id`;
DELIMITER //
CREATE TRIGGER `bi_users_public_id`
BEFORE INSERT ON `users`
FOR EACH ROW
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    IF NEW.role = 'student' THEN
      UPDATE `role_counters`
        SET next_serial = LAST_INSERT_ID(next_serial + 1)
        WHERE role = 'student';
      SET NEW.public_id = CONCAT('s', LAST_INSERT_ID());
    ELSEIF NEW.role = 'mentor' THEN
      UPDATE `role_counters`
        SET next_serial = LAST_INSERT_ID(next_serial + 1)
        WHERE role = 'mentor';
      SET NEW.public_id = CONCAT('m', LAST_INSERT_ID());
    END IF;
  END IF;
END //
DELIMITER ;
