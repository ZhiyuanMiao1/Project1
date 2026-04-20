import { query } from '../db';

let adminSchemaEnsured = false;

const isDuplicateColumnError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name');
};

const isDuplicateKeyError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'ER_DUP_KEYNAME' || message.includes('Duplicate key name');
};

const addColumnIfMissing = async (sql: string) => {
  try {
    await query(sql);
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
};

const addIndexIfMissing = async (sql: string) => {
  try {
    await query(sql);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
};

export const ensureAdminSchema = async () => {
  if (adminSchemaEnsured) return true;

  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGINT NOT NULL AUTO_INCREMENT,
      username VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(120) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_admin_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      admin_id BIGINT NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(60) NOT NULL,
      target_id VARCHAR(80) NOT NULL,
      reason TEXT NULL,
      before_json LONGTEXT NULL,
      after_json LONGTEXT NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_admin_audit_logs_admin_created (admin_id, created_at),
      KEY idx_admin_audit_logs_target (target_type, target_id),
      KEY idx_admin_audit_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS risk_reports (
      id BIGINT NOT NULL AUTO_INCREMENT,
      status ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
      severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
      source VARCHAR(40) NOT NULL DEFAULT 'admin',
      reporter_user_id INT NULL,
      target_type VARCHAR(60) NOT NULL,
      target_id VARCHAR(80) NOT NULL,
      target_user_id INT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      resolution_note TEXT NULL,
      assigned_admin_id BIGINT NULL,
      created_by_admin_id BIGINT NULL,
      updated_by_admin_id BIGINT NULL,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_risk_reports_status_severity (status, severity),
      KEY idx_risk_reports_target (target_type, target_id),
      KEY idx_risk_reports_target_user (target_user_id),
      KEY idx_risk_reports_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing(
    "ALTER TABLE users ADD COLUMN account_status ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER last_login_at"
  );
  await addColumnIfMissing(
    'ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL DEFAULT NULL AFTER account_status'
  );
  await addColumnIfMissing(
    'ALTER TABLE users ADD COLUMN suspended_reason TEXT NULL AFTER suspended_at'
  );
  await addIndexIfMissing('ALTER TABLE users ADD KEY idx_users_account_status (account_status)');

  await addColumnIfMissing(
    'ALTER TABLE account_settings ADD COLUMN mentor_resume_url TEXT NULL'
  );

  await addColumnIfMissing(
    "ALTER TABLE user_roles ADD COLUMN mentor_review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER mentor_approved"
  );
  await addColumnIfMissing(
    'ALTER TABLE user_roles ADD COLUMN mentor_review_note TEXT NULL AFTER mentor_review_status'
  );
  await addColumnIfMissing(
    'ALTER TABLE user_roles ADD COLUMN mentor_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER mentor_review_note'
  );
  await addColumnIfMissing(
    'ALTER TABLE user_roles ADD COLUMN mentor_reviewed_by_admin_id BIGINT NULL AFTER mentor_reviewed_at'
  );
  await addIndexIfMissing(
    'ALTER TABLE user_roles ADD KEY idx_user_roles_mentor_review (role, mentor_review_status, mentor_approved)'
  );

  await query(
    "UPDATE user_roles SET mentor_review_status = 'approved' WHERE role = 'mentor' AND mentor_approved = 1 AND mentor_review_status <> 'approved'"
  );

  adminSchemaEnsured = true;
  return true;
};
