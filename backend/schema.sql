-- MySQL schema for basic auth + role-scoped public IDs
SET NAMES utf8mb4;

-- 1) Base table (fresh install path)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  -- 审核状态：导师账号需审核通过方可访问导师卡片
  `mentor_approved` TINYINT(1) NOT NULL DEFAULT 0,
  -- role-scoped public id: student => s#, mentor => m#
  `public_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- 同一邮箱可在不同角色各注册一次；对 (email, role) 做唯一约束
  UNIQUE KEY `uniq_users_email_role` (`email`, `role`),
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

-- 4) Mentor profile table: one row per mentor user
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

-- 5) 收藏夹表：按 user_id + role 隔离学生/导师收藏
CREATE TABLE IF NOT EXISTS `favorite_collections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role` ENUM('mentor','student') NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fav_user_role_name` (`user_id`, `role`, `name`),
  CONSTRAINT `fk_fav_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 兼容性迁移：从 email 唯一 改为 (email, role) 唯一 ==========
-- 说明：若早期版本已创建了 `uniq_users_email` 唯一索引，请执行以下语句迁移。
-- 注意：MySQL 低版本不支持 DROP INDEX IF EXISTS，如无该索引会报错，可手动忽略。

-- 删除旧的 email 唯一索引（若存在）
-- DROP INDEX IF EXISTS `uniq_users_email` ON `users`;
-- 低版本兼容写法（如果不存在会报错，可按需跳过）：
-- DROP INDEX `uniq_users_email` ON `users`;

-- 创建新的 (email, role) 复合唯一索引（若不存在）
-- CREATE UNIQUE INDEX `uniq_users_email_role` ON `users` (`email`, `role`);

-- ========== 审核字段迁移（如为已有库升级） ==========
-- 若已存在 `users` 表但没有 `mentor_approved` 字段，请执行：
--   ALTER TABLE `users` ADD COLUMN `mentor_approved` TINYINT(1) NOT NULL DEFAULT 0;
-- 宿主 MySQL 版本若支持，可使用 IF NOT EXISTS 变体：
--   ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `mentor_approved` TINYINT(1) NOT NULL DEFAULT 0;
