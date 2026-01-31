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
  `lesson_balance_hours` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1b) Wallet balance: persist remaining lesson hours per account.
SET @__mx_has_lesson_balance_hours := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'lesson_balance_hours'
);
SET @__mx_sql := IF(
  @__mx_has_lesson_balance_hours = 0,
  'ALTER TABLE `users` ADD COLUMN `lesson_balance_hours` DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE __mx_stmt FROM @__mx_sql;
EXECUTE __mx_stmt;
DEALLOCATE PREPARE __mx_stmt;

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
  `student_avatar_url` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_account_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5b) Refresh tokens (rotating sessions; stored as SHA-256 hash)
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `sliding_expires_at` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
  `absolute_expires_at` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `replaced_by_id` BIGINT NULL DEFAULT NULL,
  `revocation_reason` VARCHAR(200) NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL DEFAULT NULL,
  `ip` VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user_id` (`user_id`),
  KEY `idx_refresh_tokens_family_id` (`family_id`),
  KEY `idx_refresh_tokens_replaced_by_id` (`replaced_by_id`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
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
  `teaching_languages_json` TEXT NULL, -- JSON array of language codes (e.g. ["zh","en"])
  `rating` DECIMAL(3,2) NOT NULL DEFAULT 0,
  `review_count` INT NOT NULL DEFAULT 0,
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

-- 8) Course embeddings (DashScope text-embedding-v4)
CREATE TABLE IF NOT EXISTS `course_embeddings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kind` ENUM('direction','course_type') NOT NULL,
  `source_id` VARCHAR(64) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `embedding_dim` INT NOT NULL,
  `embedding` JSON NOT NULL,
  `embedding_vec` /*!99999 vector(256) */ varbinary(1024) NULL,
  `text` VARCHAR(512) NOT NULL,
  `text_hash` CHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_course_embeddings_kind_source` (`kind`, `source_id`),
  KEY `idx_course_embeddings_label` (`label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9) Mentor custom course embeddings
CREATE TABLE IF NOT EXISTS `mentor_course_embeddings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `course_text` VARCHAR(255) NOT NULL,
  `course_text_norm` VARCHAR(255) NOT NULL,
  `course_key` CHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `embedding_dim` INT NOT NULL,
  `embedding` JSON NOT NULL,
  `embedding_vec` /*!99999 vector(256) */ varbinary(1024) NULL,
  `text_hash` CHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_mentor_course_user_key` (`user_id`, `course_key`),
  KEY `idx_mentor_course_user` (`user_id`),
  CONSTRAINT `fk_mentor_course_embeddings_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9b) Mentor -> direction relevance scores (precomputed for home tabs)
CREATE TABLE IF NOT EXISTS `mentor_direction_scores` (
  `user_id` INT NOT NULL,
  `direction_id` VARCHAR(64) NOT NULL,
  `score` DOUBLE NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `direction_id`),
  KEY `idx_mds_direction_score` (`direction_id`, `score`),
  CONSTRAINT `fk_mds_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10) Course requests (student publish / save draft)
CREATE TABLE IF NOT EXISTS `course_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `status` ENUM('draft','submitted','paired') NOT NULL DEFAULT 'draft',
  `draft_step` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `learning_goal` VARCHAR(200) NULL,
  `course_direction` VARCHAR(64) NULL,
  `course_type` VARCHAR(64) NULL,
  `course_types_json` TEXT NULL,
  `course_focus` TEXT NULL,
  `format` VARCHAR(64) NULL,
  `milestone` TEXT NULL,
  `total_course_hours` DECIMAL(6,2) NULL,
  `time_zone` VARCHAR(64) NULL,
  `session_duration_hours` DECIMAL(4,2) NULL,
  `schedule_json` LONGTEXT NULL,
  `contact_name` VARCHAR(100) NULL,
  `contact_method` VARCHAR(32) NULL,
  `contact_value` VARCHAR(200) NULL,
  `submitted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_course_requests_user_status` (`user_id`, `status`),
  KEY `idx_course_requests_created_at` (`created_at`),
  CONSTRAINT `fk_course_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- If you upgraded from an older schema, ensure the ENUM includes 'paired'.
ALTER TABLE `course_requests`
  MODIFY COLUMN `status` ENUM('draft','submitted','paired') NOT NULL DEFAULT 'draft';

-- Persist the last step index when saving "draft + exit" from the frontend.
SET @__mx_has_draft_step := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_requests'
    AND COLUMN_NAME = 'draft_step'
);
SET @__mx_sql := IF(
  @__mx_has_draft_step = 0,
  'ALTER TABLE `course_requests` ADD COLUMN `draft_step` TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE __mx_stmt FROM @__mx_sql;
EXECUTE __mx_stmt;
DEALLOCATE PREPARE __mx_stmt;

CREATE TABLE IF NOT EXISTS `course_request_attachments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `file_id` CHAR(32) NOT NULL,
  `original_file_name` VARCHAR(255) NOT NULL,
  `ext` VARCHAR(10) NOT NULL,
  `content_type` VARCHAR(100) NULL,
  `size_bytes` INT NOT NULL,
  `oss_key` VARCHAR(1024) NOT NULL,
  `file_url` VARCHAR(2048) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_course_request_file` (`request_id`, `file_id`),
  KEY `idx_course_request_attachments_request` (`request_id`),
  CONSTRAINT `fk_course_request_attachments_request` FOREIGN KEY (`request_id`) REFERENCES `course_requests`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11) Messages / appointments (account-scoped inbox)
CREATE TABLE IF NOT EXISTS `message_threads` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_user_id` INT NOT NULL,
  `mentor_user_id` INT NOT NULL,
  `last_message_id` BIGINT NULL,
  `last_message_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_message_threads_pair` (`student_user_id`, `mentor_user_id`),
  KEY `idx_message_threads_student` (`student_user_id`),
  KEY `idx_message_threads_mentor` (`mentor_user_id`),
  CONSTRAINT `fk_message_threads_student` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_threads_mentor` FOREIGN KEY (`mentor_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `message_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `thread_id` BIGINT NOT NULL,
  `sender_user_id` INT NOT NULL,
  `message_type` VARCHAR(50) NOT NULL,
  `payload_json` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_message_items_thread` (`thread_id`),
  CONSTRAINT `fk_message_items_thread` FOREIGN KEY (`thread_id`) REFERENCES `message_threads`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_items_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Persist appointment card status (accepted/rejected/etc) so both parties see consistent state.
CREATE TABLE IF NOT EXISTS `appointment_statuses` (
  `appointment_message_id` BIGINT NOT NULL,
  `status` ENUM('pending','accepted','rejected','rescheduling') NOT NULL DEFAULT 'pending',
  `updated_by_user_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`appointment_message_id`),
  KEY `idx_appointment_statuses_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_appointment_statuses_message` FOREIGN KEY (`appointment_message_id`) REFERENCES `message_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_appointment_statuses_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12) Billing / top-up orders (used by wallet)
CREATE TABLE IF NOT EXISTS `billing_orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `provider` ENUM('paypal','alipay','wechat') NOT NULL DEFAULT 'paypal',
  `provider_order_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  `topup_hours` DECIMAL(10,2) NOT NULL,
  `unit_price_cny` DECIMAL(10,2) NOT NULL,
  `amount_cny` DECIMAL(10,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'USD',
  `amount_usd` DECIMAL(10,2) NOT NULL,
  `paypal_capture_id` VARCHAR(64) NULL,
  `paypal_payer_id` VARCHAR(32) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `captured_at` TIMESTAMP NULL DEFAULT NULL,
  `credited_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `provider_create_json` LONGTEXT NULL,
  `provider_capture_json` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_billing_orders_provider_order` (`provider`, `provider_order_id`),
  KEY `idx_billing_orders_user_created` (`user_id`, `created_at`),
  KEY `idx_billing_orders_user_credited` (`user_id`, `credited_at`),
  CONSTRAINT `fk_billing_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13) Course sessions (used by Courses page calendar/history)
-- Note: classroom link / address intentionally NOT stored here (per product requirement).
CREATE TABLE IF NOT EXISTS `course_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_user_id` INT NOT NULL,
  `mentor_user_id` INT NOT NULL,
  `course_direction` VARCHAR(64) NULL, -- stores direction id (e.g. cs-foundation)
  `course_type` VARCHAR(64) NULL,      -- stores type id (e.g. pre-study)
  `starts_at` DATETIME NOT NULL,
  `duration_hours` DECIMAL(6,2) NOT NULL,
  `status` ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_course_sessions_student_time` (`student_user_id`, `starts_at`),
  KEY `idx_course_sessions_mentor_time` (`mentor_user_id`, `starts_at`),
  CONSTRAINT `fk_course_sessions_student` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_course_sessions_mentor` FOREIGN KEY (`mentor_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
