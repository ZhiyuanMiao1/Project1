-- MySQL dump 10.13  Distrib 8.0.25, for Win64 (x86_64)
--
-- Host: localhost    Database: project1
-- ------------------------------------------------------
-- Server version	8.0.25

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `project1`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `project1` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `project1`;

--
-- Table structure for table `account_settings`
--

DROP TABLE IF EXISTS `account_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account_settings` (
  `email` varchar(255) NOT NULL,
  `email_notifications` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `home_course_order_json` text,
  `availability_json` text,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_settings`
--

LOCK TABLES `account_settings` WRITE;
/*!40000 ALTER TABLE `account_settings` DISABLE KEYS */;
INSERT INTO `account_settings` VALUES ('1@qq.com',1,'2025-12-24 16:40:07','2025-12-24 16:40:07',NULL,NULL),('i@qq.com',1,'2025-12-19 14:43:40','2025-12-24 10:19:54','[\"cs-foundation\",\"algo\",\"ml\",\"ai-large-model\",\"data-analysis\",\"advanced-math\",\"statistics\",\"physics\",\"life-science\",\"chemistry\",\"materials-science\",\"software-engineering\",\"cybersecurity\",\"finance\",\"accounting\",\"economics\",\"marketing\",\"operations\",\"project-management\",\"psychology\",\"design-creative\",\"linguistics\",\"communication-studies\",\"law\",\"writing\",\"career-coaching\",\"others\"]','{\"timeZone\":\"Asia/Shanghai\",\"sessionDurationHours\":2,\"daySelections\":{\"2025-12-24\":[{\"start\":84,\"end\":91}],\"2025-12-25\":[{\"start\":49,\"end\":56}],\"2025-12-26\":[{\"start\":49,\"end\":56}],\"2025-12-27\":[{\"start\":49,\"end\":56}]}}');
/*!40000 ALTER TABLE `account_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorite_collections`
--

DROP TABLE IF EXISTS `favorite_collections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorite_collections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` enum('mentor','student') NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fav_user_role_name` (`user_id`,`role`,`name`),
  CONSTRAINT `fk_fav_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=676 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorite_collections`
--

LOCK TABLES `favorite_collections` WRITE;
/*!40000 ALTER TABLE `favorite_collections` DISABLE KEYS */;
INSERT INTO `favorite_collections` VALUES (4,63,'mentor','AI','2025-11-24 07:34:27'),(5,63,'mentor','BitCoin','2025-11-24 07:35:33'),(12,63,'mentor','Space','2025-11-25 03:40:53'),(15,64,'student','Mentor','2025-11-30 14:57:20'),(18,64,'student','默认收藏夹','2025-12-15 17:18:08'),(19,63,'mentor','默认收藏夹','2025-12-15 17:18:08'),(357,65,'student','默认收藏夹','2025-12-17 07:41:51'),(658,9,'student','默认收藏夹','2025-12-24 16:40:07');
/*!40000 ALTER TABLE `favorite_collections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorite_items`
--

DROP TABLE IF EXISTS `favorite_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorite_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` enum('mentor','student') NOT NULL,
  `collection_id` int NOT NULL,
  `item_type` varchar(50) NOT NULL,
  `item_id` varchar(100) NOT NULL,
  `payload_json` longtext,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fav_user_role_item` (`user_id`,`role`,`item_type`,`item_id`),
  KEY `idx_fav_items_collection` (`collection_id`),
  CONSTRAINT `fk_fav_items_collection` FOREIGN KEY (`collection_id`) REFERENCES `favorite_collections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_items_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorite_items`
--

LOCK TABLES `favorite_items` WRITE;
/*!40000 ALTER TABLE `favorite_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorite_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mentor_profiles`
--

DROP TABLE IF EXISTS `mentor_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mentor_profiles` (
  `user_id` int NOT NULL,
  `display_name` varchar(100) DEFAULT NULL,
  `gender` enum('男','女') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `degree` enum('本科','硕士','PhD') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `school` varchar(200) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `courses_json` text,
  `avatar_url` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_mentor_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mentor_profiles`
--

LOCK TABLES `mentor_profiles` WRITE;
/*!40000 ALTER TABLE `mentor_profiles` DISABLE KEYS */;
INSERT INTO `mentor_profiles` VALUES (58,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2025-12-17 09:13:09','2025-12-17 09:13:09'),(63,'i@qq','男','硕士','University of Warwick','Asia/Shanghai','[\"历史\",\"政治\"]','blob:http://localhost:3000/aa75ee5e-b275-45dc-914c-c1ccfe55b276','2025-11-10 17:09:07','2025-12-18 17:02:41'),(64,NULL,NULL,'硕士','University of Warwick',NULL,NULL,NULL,'2025-12-17 09:11:11','2025-12-18 16:48:03'),(65,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2025-12-17 09:13:09','2025-12-17 09:13:09');
/*!40000 ALTER TABLE `mentor_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_counters`
--

DROP TABLE IF EXISTS `role_counters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_counters` (
  `role` enum('mentor','student') NOT NULL,
  `next_serial` int NOT NULL,
  PRIMARY KEY (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_counters`
--

LOCK TABLES `role_counters` WRITE;
/*!40000 ALTER TABLE `role_counters` DISABLE KEYS */;
INSERT INTO `role_counters` VALUES ('mentor',20),('student',45);
/*!40000 ALTER TABLE `role_counters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('mentor','student') NOT NULL,
  `public_id` varchar(20) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `mentor_approved` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_public_id` (`public_id`),
  UNIQUE KEY `uniq_users_email_role` (`email`,`role`)
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'fifi','dev1761665221@mx.com','$2a$10$2HZbnkFQPmGMI/N1zWw9hu0DIjRmuO8OP6VPPTJK5tlFx5BadkGIK','student','s1','2025-10-28 15:27:02',0),(2,'fifi','dev1730080000@mx.com','$2a$10$41efGcL6jgnuMnp9wjPuXO0W1oiiswqCZmEe.4/vLrRUyz/F/54C2','student','s2','2025-10-28 15:57:13',0),(3,NULL,'2859985268@qq.com','$2a$10$dTEuKNhOarQmS3hNWziUfuiaRloeImjIS8pR6wr0waWYizZ./sGgW','student','s3','2025-11-01 09:50:25',0),(4,NULL,'23@gmail.com','$2a$10$sE2Q2seRaRMtf2Zc8X164ectpFHXYD3/nXUl1xLIOpKzJ8xFfD5R.','student','s4','2025-11-01 13:55:32',0),(5,NULL,'3@gmail.com','$2a$10$vxPumk63XTIyWlufJ93Ghuo5iiB/2ya4Wqc0iR8FjGYSM6yuOhptK','mentor','m1','2025-11-01 14:30:30',0),(6,NULL,'123@gmail.com','$2a$10$VRGZSH9cgZzDymUDC/nk1uCcnzVq7LlisvSwptXwzG.rl6leD6gIa','mentor','m2','2025-11-01 14:31:12',0),(7,NULL,'2@qq.com','$2a$10$Xzx3UmU7fcCHjIPgYhoM5eTY998bpeMjerMqAxZbtOOlg7Zvx4qJO','student','s5','2025-11-01 15:42:42',0),(8,NULL,'3@qq.com','$2a$10$amLy0NQ9tMhzNUSE5zH.vumAkrBi8wHg0g5OlBrIvQCAUuMPzkczu','mentor','m3','2025-11-01 15:44:05',0),(9,NULL,'1@qq.com','$2a$10$yO.PoIOC88j34Tgg9JtqU.Ju5FMNg9dYKKhSO4/7vs7h89ntaMT4.','student','s6','2025-11-01 15:48:46',0),(10,NULL,'4@gmail.com','$2a$10$3nqNAi3iIq6N4ipK29fFSe9LyodbZuoepbMD10/lK2X8aWWf7wutG','student','s7','2025-11-01 15:49:38',0),(11,NULL,'6@gmail.com','$2a$10$xdl3rkdTEjf9Vhur2ngd5e7EXcfLlo3D4kCO9/KFs5X0bc6XeEgne','mentor','m4','2025-11-01 15:53:52',0),(12,NULL,'7@qq.com','$2a$10$Gn1trUaDN51azaRdF2awLeXSG75yz0UQo67wy2aSnQjQBKB3TVHby','student','s8','2025-11-01 15:54:41',0),(13,NULL,'12@qq.com','$2a$10$Q80zEq.hZV1tND3YlIU37uuxJqiFL.2oBl7S60fbggwNDEIPlB7BG','student','s9','2025-11-01 16:00:00',0),(14,NULL,'11@qq.com','$2a$10$OaXV7ONVxfHQQF2mcTl/W.jFXtwkixiH3N6WRdlwrdy6sTHAkhPqe','mentor','m5','2025-11-01 16:01:32',0),(15,NULL,'33@163.com','$2a$10$WGx1yrA.Oj//xI44hqv8k.5Eq3D16jFzBd0O9gVI.AJT1LN/8KHrS','student','s10','2025-11-01 16:07:39',0),(16,NULL,'21@139.com','$2a$10$Q7CwtGk4SZcblhhb0iYvGO7KW1t3746rUsPgO8th4.L88jbGiO9Oi','mentor','m6','2025-11-01 16:08:38',0),(17,NULL,'32@qq.com','$2a$10$CINzjoc5s/nwqLFdjSufNupx4gZIScUfUCu4.XSMEIzWnBZupLxJq','student','s11','2025-11-01 16:09:36',0),(18,NULL,'22@139.com','$2a$10$cgB0ZPqnvNOIZ1UtGncCDu.9qGDPr1veV3FnMn2Q7a0m8.0XLjCGq','student','s12','2025-11-01 16:10:19',0),(19,NULL,'55w@qq.com','$2a$10$zYqqdZGKvh3g1QbHbK7xE.eytSDjsEw8vlaQKf38b8FKxmv/NPfD.','student','s13','2025-11-01 16:10:42',0),(20,NULL,'35@gmail.com','$2a$10$wwWPn3urhCHf.TyiaOrHAuSLoIehB/szIQpKqkMC7vLczYxAi9a5q','mentor','m7','2025-11-01 16:15:50',0),(21,NULL,'13@qq.com','$2a$10$/TZGo0HZu91QcfT.zHQd4OouytOqPcYK1mizDZ7hFYSJuq0g1ZaIC','mentor','m8','2025-11-01 16:16:55',0),(22,NULL,'55@qq.com','$2a$10$CvulysjzgNRGJ7X9A70MEeuVGw5O3VLsqzS0bNdTmLnWhbtWa/zwW','student','s14','2025-11-01 16:17:17',0),(23,NULL,'21@qq.com','$2a$10$Oox53lGr5DneCehCj2jA4.rWCuT/W41dmeEHFrb0p9m9ey3Wi7Q1.','student','s15','2025-11-01 16:23:53',0),(24,NULL,'22@gmail.com','$2a$10$XP1AF1dCST27qkmK2XCxPe.W4MUyAXYMGk3hAegoM0mBMAqEP4D2u','mentor','m9','2025-11-01 16:30:57',0),(25,NULL,'19@qq.com','$2a$10$5lKfOR5KXmd7LIPgNyEIkOviulD2z6U6TsBbJLYEgV.m4.xD9IhA.','mentor','m10','2025-11-01 16:32:08',0),(26,NULL,'20@qq.com','$2a$10$ZtlOEnILkuqDgLw/GQGEO.cjaKo18tvP2FngKGJdw586qv0ujZME.','student','s16','2025-11-01 16:32:30',0),(27,NULL,'20@qq.com','$2a$10$SH9xd5Gvkf3/bWwPhbIZTu7a8qzZO3e9xMGBj6bsebmahcFs5JH7m','mentor','m11','2025-11-02 07:06:43',0),(28,NULL,'30@126.com','$2a$10$JY28oW3AW.cT5GUMNMIG3ugYQ7u/dsFFynC113A2weuy2lC9Pn4L6','mentor','m12','2025-11-02 07:08:51',0),(29,NULL,'111@qq.com','$2a$10$yu72HsnTorgUFtk24K.WzeFqT78PtglmzdXAeNAB38m44fDrkluL6','student','s17','2025-11-02 07:44:24',0),(30,NULL,'20@gmail.com','$2a$10$WYTBbHCf2W3v6P/LqIYvuO4PrqdlpVX6hRPg8AbeyG166FqgaGQSK','student','s18','2025-11-02 07:51:06',0),(31,NULL,'18@qq.com','$2a$10$7NsLWH4Sa7aI6UTNjkDIveSJnn/lXG6vZInkAgV2eW0vrgGYPHQmm','student','s19','2025-11-02 07:51:57',0),(32,NULL,'22@gmail.com','$2a$10$iibCG0BH5XgP.NbbJyuOCOwRKOHm6W3zXLt9SlwIK1Dn61MCqDAIG','student','s20','2025-11-02 07:55:02',0),(33,NULL,'22@qq.com','$2a$10$7.SeT0H0bs1fIF1KSoJK5O85iB.L2LQbMoD0ckI21vkW2I3Gpt9au','mentor','m13','2025-11-02 07:55:45',0),(34,NULL,'31@qq.com','$2a$10$eE1ZaJlT26T9moJ8TErkv.Jd8IrE4WmKt.v02KrneZCi70eBhclfC','student','s21','2025-11-02 08:30:27',0),(35,NULL,'23@126.com','$2a$10$GpOO1jgtibGsMadCCc6juuIefQq14CN4zH6U.8HbxAe32nFtaJypW','student','s22','2025-11-02 08:31:20',0),(36,NULL,'2@139.com','$2a$10$Z9sTVoAsp5c.X2BxF75plOJvbz7/zi48qmABMeYsmCZyzsRpOPLRG','student','s23','2025-11-02 08:35:10',0),(37,NULL,'12@139.com','$2a$10$vLx2cuJVTWHojJGAKRylZetGTrrSW3pbcYWLqKa5b.7oLgfs9YYsa','student','s24','2025-11-02 08:49:48',0),(38,NULL,'1@139.com','$2a$10$sQuyPif39NwISfIxZxEAPuQF7ToUghobLEQyoALLozxYpeZaL1G46','student','s25','2025-11-02 08:55:15',0),(39,NULL,'28@gmail.com','$2a$10$qVywdhJSeShVzXBgXtsGbuGXtG.eyaahQhOLreMR86xvfILyBvkUu','student','s26','2025-11-02 08:57:50',0),(40,NULL,'1@outlook.com','$2a$10$NURGf1X61vC.ZvICRwcVGuILXphmwlraW.M5rVMXAEMIDhB3a4eOW','student','s27','2025-11-02 09:11:35',0),(41,NULL,'3@ab.com','$2a$10$ql3qKQUb/wff6uzrNUdca.m7uR6.BRdismKhN7vX14dyjTLyGocLe','mentor','m14','2025-11-02 11:12:54',0),(42,NULL,'26@qq.com','$2a$10$oQXwHID2gsX0mO.ojBwC.uiYjr5OeIjLWveZeyROd5xOmbbjaPD8.','student','s28','2025-11-02 15:57:56',0),(43,NULL,'33@qq.com','$2a$10$9Gb6xbVeYPk9Dvxb0lNNle4NXH.4.jygENdLc2k5q4LTlpit7tcgK','student','s29','2025-11-02 15:58:42',0),(44,NULL,'37@qq.com','$2a$10$Jc3zH3Y4VPIPj3RtGZ9TfeIVrwuPAdHw8Fg5FGTmyVcUstZrTCrwq','student','s30','2025-11-02 16:00:11',0),(45,NULL,'29@gmail.com','$2a$10$N81iFXI4fhV3C/NfkdD3juK96O71eVoIp4m5nlLlawIrER/mJ/2Ri','student','s31','2025-11-02 16:20:53',0),(46,NULL,'qw@qq.com','$2a$10$9xAIIkrP96RCjZ7/yvhEEuEjxQiH8Qt0TkXzoA3CW9Zzye2HICpTu','student','s32','2025-11-02 16:21:32',0),(47,NULL,'qe@qq.com','$2a$10$wvsr84UTuE7nnnu0zLtp1OB/7lPlM2c44RPXSY94x0Qxnx2jYb7Eq','student','s33','2025-11-02 16:24:39',0),(48,NULL,'q@qq.com','$2a$10$uhzLQ98wa8.xoXtXekge2elt.tLMx2/jCkvxTaIXMR.XWLSpP4ZAO','student','s34','2025-11-02 16:25:35',0),(49,NULL,'w@qq.com','$2a$10$SJQ7g9XtwiwZ5dLIYPHofuzhAn4i8Degia3lh3xiIiTShmDIUTHse','student','s35','2025-11-02 16:29:57',0),(50,NULL,'ww@qq.com','$2a$10$SEqoYWTbWnN9/olAwYsJCev9FpTPoNq6c0MZRovQc4EP6K7rMhWf6','student','s36','2025-11-02 16:31:30',0),(51,NULL,'qqq@qq.com','$2a$10$0MVatSejrBSZEwu05uTls.jIPEOtZ3JlPk3SQMLE1TEV9MLnu9YzG','student','s37','2025-11-02 16:35:24',0),(52,NULL,'e@qq.com','$2a$10$49d0.5iCZruvr0e35NbIVOsb3mytjK3T9Q07ETVAx/Suy0aEXVFlC','student','s38','2025-11-02 16:42:07',0),(53,NULL,'a@qq.com','$2a$10$rL8YBXdRQVDst8j6l7yt8e49ChO8t.a3BVndRIiUETU9rIhYAl.LW','student','s39','2025-11-02 16:48:48',0),(54,NULL,'s@qq.com','$2a$10$hKfKkFBaPKv4h2l7BxghP.XI5xk.20J4WM0US4YbK.w7Vh2JM/v92','student','s40','2025-11-02 16:58:41',0),(55,NULL,'we@qq.com','$2a$10$2JQe4Dn56ivkykSgqDYl9OSw54nqFS71nH1xPGBWSNJveAuamDTei','student','s41','2025-11-03 04:56:42',0),(56,NULL,'r@123.com','$2a$10$bsz5yt8XmoXXLrnry5lBjObJMDXb4FyOHrXoRk703GUA4w.1/.4nC','student','s42','2025-11-03 14:21:30',0),(57,NULL,'rt@qq.com','$2a$10$zUcxmiMBe/L1NPQCD.lxA.NIVG17ucZ1Edd3Y40xeKNpkcqGytuKW','mentor','m15','2025-11-03 14:37:24',1),(58,NULL,'t@qq.com','$2a$10$dvg0V6xy7XJTNj2aiiyyc.ch3TS/CRuEMNmb.QmhDGimAT4euEwRa','mentor','m16','2025-11-03 14:52:40',0),(59,NULL,'y@qq.com','$2a$10$MwX7PrGQ/H9n9vy9JXKVge5yX8cGSVQ2EFJL23.71lhKwLU7RNNeK','mentor','m17','2025-11-03 15:17:19',1),(60,NULL,'yu@qq.com','$2a$10$5EbcAxP8z79Cl6HRqbIwBOWlLa4HzwrtK3mLg0Wo3PNSQzP0a91CO','mentor','m18','2025-11-03 16:30:26',1),(61,NULL,'uu@139.com','$2a$10$qtvkGtKhDlV2l0AjpzwoluTsKm0TUelwTntCDxXeu/PhebBhCcd2m','mentor','m19','2025-11-03 17:47:54',0),(62,NULL,'uu@139.com','$2a$10$qtvkGtKhDlV2l0AjpzwoluTsKm0TUelwTntCDxXeu/PhebBhCcd2m','student','s43','2025-11-03 17:47:54',0),(63,NULL,'i@qq.com','$2a$10$p3QdVltjclX1tMM2bz/q0eC.BVIkw0h5LaFmfAkNOAKxS9F0VJM1C','mentor','m20','2025-11-04 14:06:44',1),(64,NULL,'i@qq.com','$2a$10$p3QdVltjclX1tMM2bz/q0eC.BVIkw0h5LaFmfAkNOAKxS9F0VJM1C','student','s44','2025-11-04 14:06:44',0),(65,NULL,'t@qq.com','$2a$10$dvg0V6xy7XJTNj2aiiyyc.ch3TS/CRuEMNmb.QmhDGimAT4euEwRa','student','s45','2025-11-26 08:21:43',0);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `bi_users_public_id` BEFORE INSERT ON `users` FOR EACH ROW BEGIN
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
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Dumping routines for database 'project1'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-26 10:37:36
