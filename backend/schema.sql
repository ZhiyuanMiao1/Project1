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





-- 2) Role counters table used to allocate next serial per role
CREATE TABLE IF NOT EXISTS `role_counters` (
  `role` ENUM('mentor','student') NOT NULL PRIMARY KEY,
  `next_serial` INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed counters; start from 0 so first allocation becomes 1
INSERT IGNORE INTO `role_counters` (`role`, `next_serial`) VALUES
  ('student', 0),
  ('mentor', 0);



-- 3) Trigger to auto-assign `public_id` on insert when not provided
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
