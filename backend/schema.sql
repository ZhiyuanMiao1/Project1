-- MySQL schema for basic auth

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('teacher','student') NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

