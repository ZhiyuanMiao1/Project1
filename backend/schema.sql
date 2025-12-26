-- MySQL schema (v2) - unified users + roles
-- Key idea:
-- - `users` is the account table (one row per person, id as PK, email UNIQUE but NOT PK)
-- - `user_roles` stores role-specific info (StudentID/MentorID via `public_id`, and mentor approval)
SET NAMES utf8mb4;

-- 1) Account table (one user_id for both student/mentor)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Role table (one row per role per user)
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` INT NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  -- mentor approval is only meaningful when role='mentor'
  `mentor_approved` TINYINT(1) NOT NULL DEFAULT 0,
  -- role-scoped public id: student => s#, mentor => m#
  `public_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `role`),
  UNIQUE KEY `uniq_user_roles_public_id` (`public_id`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Role counters (used by trigger to allocate next serial per role)
CREATE TABLE IF NOT EXISTS `role_counters` (
  `role` ENUM('mentor','student') NOT NULL PRIMARY KEY,
  `next_serial` INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed counters; start from 0 so first allocation becomes 1
INSERT IGNORE INTO `role_counters` (`role`, `next_serial`) VALUES
  ('student', 0),
  ('mentor', 0);

-- 4) Trigger to auto-assign `public_id` on insert when not provided
DROP TRIGGER IF EXISTS `bi_user_roles_public_id`;
DELIMITER //
CREATE TRIGGER `bi_user_roles_public_id`
BEFORE INSERT ON `user_roles`
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

-- 5) Account-level settings shared across roles (keyed by user_id)
CREATE TABLE IF NOT EXISTS `account_settings` (
  `user_id` INT NOT NULL,
  `email_notifications` TINYINT(1) NOT NULL DEFAULT 1,
  `home_course_order_json` TEXT NULL,
  `availability_json` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_account_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) Mentor profile table: one row per mentor account
CREATE TABLE IF NOT EXISTS `mentor_profiles` (
  `user_id` INT NOT NULL,
  `display_name` VARCHAR(100) NULL,
  `gender` ENUM('男','女') NULL,
  `degree` ENUM('本科','硕士','PhD') NULL,
  `school` VARCHAR(200) NULL,
  `timezone` VARCHAR(64) NULL,
  `courses_json` TEXT NULL,          -- JSON array of strings
  `avatar_url` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_mentor_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7) Favorites (isolated by role but owned by the same user_id)
CREATE TABLE IF NOT EXISTS `favorite_collections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fav_user_role_name` (`user_id`, `role`, `name`),
  CONSTRAINT `fk_fav_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_user_role` FOREIGN KEY (`user_id`, `role`) REFERENCES `user_roles`(`user_id`, `role`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `favorite_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  `collection_id` INT NOT NULL,
  `item_type` VARCHAR(50) NOT NULL,
  `item_id` VARCHAR(100) NOT NULL,
  `payload_json` LONGTEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fav_user_role_item` (`user_id`, `role`, `item_type`, `item_id`),
  KEY `idx_fav_items_collection` (`collection_id`),
  CONSTRAINT `fk_fav_items_user_role` FOREIGN KEY (`user_id`, `role`) REFERENCES `user_roles`(`user_id`, `role`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_items_collection` FOREIGN KEY (`collection_id`) REFERENCES `favorite_collections`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

