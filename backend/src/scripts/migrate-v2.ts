import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing env var: ${name}`);
  return value.trim();
};

const parsePort = (raw: string | undefined, fallback = 3306) => {
  const n = Number.parseInt((raw || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

async function main() {
  const host = requiredEnv('DB_HOST');
  const user = requiredEnv('DB_USER');
  const password = process.env.DB_PASSWORD || '';
  const database = requiredEnv('DB_NAME');
  const port = parsePort(process.env.DB_PORT, 3306);

  const connection = await mysql.createConnection({ host, port, user, password, database, multipleStatements: false });

  const queryScalar = async <T = any>(sql: string, params: any[] = []) => {
    const [rows] = await connection.query<any[]>(sql, params);
    return (rows?.[0] as any) as T;
  };

  const tableExists = async (tableName: string) => {
    const row = await queryScalar<{ c: number }>(
      'SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [tableName]
    );
    return Number(row?.c || 0) > 0;
  };

  const columnExists = async (tableName: string, columnName: string) => {
    const row = await queryScalar<{ c: number }>(
      'SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [tableName, columnName]
    );
    return Number(row?.c || 0) > 0;
  };

  const listForeignKeys = async (tableName: string): Promise<string[]> => {
    const [rows] = await connection.query<any[]>(
      'SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [tableName]
    );
    return (rows || []).map((r) => String(r.CONSTRAINT_NAME)).filter(Boolean);
  };

  const dropAllForeignKeys = async (tableName: string) => {
    if (!(await tableExists(tableName))) return;
    const fks = await listForeignKeys(tableName);
    for (const fk of fks) {
      await connection.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fk}\``);
    }
  };

  const usersHasRoleColumn = (await tableExists('users')) && (await columnExists('users', 'role'));
  const userRolesExists = await tableExists('user_roles');

  if (!usersHasRoleColumn && userRolesExists) {
    console.log('[migrate-v2] DB already looks like v2 (users + user_roles). Nothing to do.');
    await connection.end();
    return;
  }

  if (!usersHasRoleColumn) {
    throw new Error('[migrate-v2] Unexpected schema: users.role not found, but user_roles also not found.');
  }

  if (await tableExists('users_v1')) {
    throw new Error('[migrate-v2] Refusing to run: users_v1 already exists (migration may have been run before).');
  }

  console.log('[migrate-v2] Detected v1 schema. Starting migration to v2...');
  console.log('[migrate-v2] IMPORTANT: make sure you have an RDS backup/snapshot before continuing.');

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  // Drop all foreign keys on tables that will reference new users/user_roles.
  await dropAllForeignKeys('mentor_profiles');
  await dropAllForeignKeys('favorite_collections');
  await dropAllForeignKeys('favorite_items');

  // Drop v1 trigger (users.public_id)
  await connection.query('DROP TRIGGER IF EXISTS `bi_users_public_id`');

  // Rename v1 tables
  await connection.query('RENAME TABLE `users` TO `users_v1`');
  if (await tableExists('account_settings')) {
    await connection.query('RENAME TABLE `account_settings` TO `account_settings_v1`');
  }

  // Create v2 tables (same as backend/schema.sql)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`username\` VARCHAR(100) NULL,
      \`email\` VARCHAR(255) NOT NULL,
      \`password_hash\` VARCHAR(255) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_users_email\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`user_roles\` (
      \`user_id\` INT NOT NULL,
      \`role\` ENUM('mentor','student') NOT NULL,
      \`mentor_approved\` TINYINT(1) NOT NULL DEFAULT 0,
      \`public_id\` VARCHAR(20) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`, \`role\`),
      UNIQUE KEY \`uniq_user_roles_public_id\` (\`public_id\`),
      CONSTRAINT \`fk_user_roles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`role_counters\` (
      \`role\` ENUM('mentor','student') NOT NULL PRIMARY KEY,
      \`next_serial\` INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await connection.query(
    "INSERT IGNORE INTO `role_counters` (`role`, `next_serial`) VALUES ('student', 0), ('mentor', 0)"
  );

  await connection.query('DROP TRIGGER IF EXISTS `bi_user_roles_public_id`');
  await connection.query(`
    CREATE TRIGGER \`bi_user_roles_public_id\`
    BEFORE INSERT ON \`user_roles\`
    FOR EACH ROW
    BEGIN
      IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
        IF NEW.role = 'student' THEN
          UPDATE \`role_counters\`
            SET next_serial = LAST_INSERT_ID(next_serial + 1)
            WHERE role = 'student';
          SET NEW.public_id = CONCAT('s', LAST_INSERT_ID());
        ELSEIF NEW.role = 'mentor' THEN
          UPDATE \`role_counters\`
            SET next_serial = LAST_INSERT_ID(next_serial + 1)
            WHERE role = 'mentor';
          SET NEW.public_id = CONCAT('m', LAST_INSERT_ID());
        END IF;
      END IF;
    END
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`account_settings\` (
      \`user_id\` INT NOT NULL,
      \`email_notifications\` TINYINT(1) NOT NULL DEFAULT 1,
      \`home_course_order_json\` TEXT NULL,
      \`availability_json\` TEXT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`),
      CONSTRAINT \`fk_account_settings_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 1) Migrate accounts: one row per email. Pick the newest users_v1 row (MAX(id)) as source of username/password_hash.
  await connection.query(`
    INSERT INTO \`users\` (\`username\`, \`email\`, \`password_hash\`, \`created_at\`)
    SELECT u_latest.username, u_latest.email, u_latest.password_hash, u_min.min_created_at
    FROM (
      SELECT u1.*
      FROM users_v1 u1
      JOIN (SELECT email, MAX(id) AS max_id FROM users_v1 GROUP BY email) m
        ON u1.id = m.max_id
    ) u_latest
    JOIN (
      SELECT email, MIN(created_at) AS min_created_at
      FROM users_v1
      GROUP BY email
    ) u_min
      ON u_min.email = u_latest.email
  `);

  // 2) Migrate roles (keep existing public_id + mentor_approved)
  await connection.query(`
    INSERT INTO \`user_roles\` (\`user_id\`, \`role\`, \`mentor_approved\`, \`public_id\`, \`created_at\`)
    SELECT u2.id, u1.role, u1.mentor_approved, u1.public_id, u1.created_at
    FROM users_v1 u1
    JOIN users u2 ON u2.email = u1.email
  `);

  // 3) Update counters so new allocations continue from max existing s#/m#
  await connection.query(`
    UPDATE role_counters
    SET next_serial = (
      SELECT COALESCE(MAX(CAST(SUBSTRING(public_id, 2) AS UNSIGNED)), 0)
      FROM user_roles
      WHERE role = 'student'
    )
    WHERE role = 'student'
  `);
  await connection.query(`
    UPDATE role_counters
    SET next_serial = (
      SELECT COALESCE(MAX(CAST(SUBSTRING(public_id, 2) AS UNSIGNED)), 0)
      FROM user_roles
      WHERE role = 'mentor'
    )
    WHERE role = 'mentor'
  `);

  // 4) Migrate account_settings (email -> user_id)
  if (await tableExists('account_settings_v1')) {
    const hasHome = await columnExists('account_settings_v1', 'home_course_order_json');
    const hasAvail = await columnExists('account_settings_v1', 'availability_json');

    await connection.query(`
      INSERT INTO account_settings (
        user_id,
        email_notifications,
        home_course_order_json,
        availability_json,
        created_at,
        updated_at
      )
      SELECT
        u.id,
        a.email_notifications,
        ${hasHome ? 'a.home_course_order_json' : 'NULL'},
        ${hasAvail ? 'a.availability_json' : 'NULL'},
        a.created_at,
        a.updated_at
      FROM account_settings_v1 a
      JOIN users u ON u.email = a.email
    `);
  }

  // 5) Migrate mentor_profiles (merge possible student+mentor duplicates into one by email)
  if (await tableExists('mentor_profiles')) {
    await connection.query('RENAME TABLE `mentor_profiles` TO `mentor_profiles_v1`');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`mentor_profiles\` (
      \`user_id\` INT NOT NULL,
      \`display_name\` VARCHAR(100) NULL,
      \`gender\` ENUM('男','女') NULL,
      \`degree\` ENUM('本科','硕士','PhD') NULL,
      \`school\` VARCHAR(200) NULL,
      \`timezone\` VARCHAR(64) NULL,
      \`courses_json\` TEXT NULL,
      \`teaching_languages_json\` TEXT NULL,
      \`avatar_url\` VARCHAR(500) NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`),
      CONSTRAINT \`fk_mentor_profiles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  if (await tableExists('mentor_profiles_v1')) {
    const [rows] = await connection.query<any[]>(
      `SELECT
         mp.*,
         u.email,
         u.role AS v1_role
       FROM mentor_profiles_v1 mp
       JOIN users_v1 u ON u.id = mp.user_id`
    );

    const emails = Array.from(new Set((rows || []).map((r) => String(r.email)).filter(Boolean)));
    const emailToUserId = new Map<string, number>();
    if (emails.length) {
      const placeholders = emails.map(() => '?').join(',');
      const [uRows] = await connection.query<any[]>(
        `SELECT id, email FROM users WHERE email IN (${placeholders})`,
        emails
      );
      for (const r of uRows || []) {
        emailToUserId.set(String(r.email), Number(r.id));
      }
    }

    type MpRow = any & { email: string; v1_role: 'student' | 'mentor' };
    const byEmail = new Map<string, MpRow[]>();
    for (const r of rows as MpRow[]) {
      const email = String(r.email || '').trim();
      if (!email) continue;
      const list = byEmail.get(email) || [];
      list.push(r);
      byEmail.set(email, list);
    }

    const pickNonEmpty = (a: any, b: any) => {
      const aa = typeof a === 'string' ? a.trim() : a;
      if (aa !== null && aa !== undefined && aa !== '') return a;
      const bb = typeof b === 'string' ? b.trim() : b;
      return bb !== undefined ? b : a;
    };

    for (const [email, list] of byEmail.entries()) {
      const userId = emailToUserId.get(email);
      if (!userId) continue;

      // Prefer v1 mentor row as base (it usually contains full profile), otherwise pick the newest updated_at.
      const mentorRow = list.find((r) => r.v1_role === 'mentor');
      const base =
        mentorRow ||
        list
          .slice()
          .sort((x, y) => {
            const xt = x.updated_at ? new Date(x.updated_at).getTime() : 0;
            const yt = y.updated_at ? new Date(y.updated_at).getTime() : 0;
            if (yt !== xt) return yt - xt;
            return Number(y.user_id) - Number(x.user_id);
          })[0];

      if (!base) continue;

      const merged = { ...base };
      for (const r of list) {
        merged.display_name = pickNonEmpty(merged.display_name, r.display_name);
        merged.gender = pickNonEmpty(merged.gender, r.gender);
        merged.degree = pickNonEmpty(merged.degree, r.degree);
        merged.school = pickNonEmpty(merged.school, r.school);
        merged.timezone = pickNonEmpty(merged.timezone, r.timezone);
        merged.courses_json = pickNonEmpty(merged.courses_json, r.courses_json);
        merged.avatar_url = pickNonEmpty(merged.avatar_url, r.avatar_url);

        const mergedCreatedAt = merged.created_at ? new Date(merged.created_at).getTime() : 0;
        const rCreatedAt = r.created_at ? new Date(r.created_at).getTime() : 0;
        if (mergedCreatedAt === 0 || (rCreatedAt !== 0 && rCreatedAt < mergedCreatedAt)) {
          merged.created_at = r.created_at;
        }

        const mergedUpdatedAt = merged.updated_at ? new Date(merged.updated_at).getTime() : 0;
        const rUpdatedAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (rUpdatedAt > mergedUpdatedAt) {
          merged.updated_at = r.updated_at;
        }
      }

      await connection.query(
        `INSERT INTO mentor_profiles (
           user_id, display_name, gender, degree, school, timezone, courses_json, avatar_url, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           gender = VALUES(gender),
           degree = VALUES(degree),
           school = VALUES(school),
           timezone = VALUES(timezone),
           courses_json = VALUES(courses_json),
           avatar_url = VALUES(avatar_url),
           created_at = VALUES(created_at),
           updated_at = VALUES(updated_at)`,
        [
          userId,
          merged.display_name ?? null,
          merged.gender ?? null,
          merged.degree ?? null,
          merged.school ?? null,
          merged.timezone ?? null,
          merged.courses_json ?? null,
          merged.avatar_url ?? null,
          merged.created_at ?? null,
          merged.updated_at ?? null,
        ]
      );
    }
  }

  // 6) Update favorites user_id from v1 role-user-id -> v2 account user_id
  if (await tableExists('favorite_collections')) {
    await connection.query(`
      UPDATE favorite_collections fc
      JOIN users_v1 u1 ON u1.id = fc.user_id
      JOIN users u2 ON u2.email = u1.email
      SET fc.user_id = u2.id
    `);
  }

  if (await tableExists('favorite_items')) {
    await connection.query(`
      UPDATE favorite_items fi
      JOIN users_v1 u1 ON u1.id = fi.user_id
      JOIN users u2 ON u2.email = u1.email
      SET fi.user_id = u2.id
    `);
  }

  // 7) Recreate foreign keys for favorites tables (v2)
  if (await tableExists('favorite_collections')) {
    await dropAllForeignKeys('favorite_collections');
    await connection.query(`
      ALTER TABLE favorite_collections
      ADD CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_fav_user_role FOREIGN KEY (user_id, role) REFERENCES user_roles(user_id, role) ON DELETE CASCADE
    `);
  }

  if (await tableExists('favorite_items')) {
    await dropAllForeignKeys('favorite_items');
    await connection.query(`
      ALTER TABLE favorite_items
      ADD CONSTRAINT fk_fav_items_user_role FOREIGN KEY (user_id, role) REFERENCES user_roles(user_id, role) ON DELETE CASCADE,
      ADD CONSTRAINT fk_fav_items_collection FOREIGN KEY (collection_id) REFERENCES favorite_collections(id) ON DELETE CASCADE
    `);
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  await connection.end();

  console.log('[migrate-v2] Migration finished.');
  console.log('[migrate-v2] Old tables kept for backup: users_v1, account_settings_v1, mentor_profiles_v1');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
