"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAdminSchema = void 0;
const db_1 = require("../db");
let adminSchemaEnsured = false;
const isDuplicateColumnError = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name');
};
const isDuplicateKeyError = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'ER_DUP_KEYNAME' || message.includes('Duplicate key name');
};
const addColumnIfMissing = async (sql) => {
    try {
        await (0, db_1.query)(sql);
    }
    catch (error) {
        if (!isDuplicateColumnError(error))
            throw error;
    }
};
const addIndexIfMissing = async (sql) => {
    try {
        await (0, db_1.query)(sql);
    }
    catch (error) {
        if (!isDuplicateKeyError(error))
            throw error;
    }
};
const ensureMentorReviewStatusEnum = async () => {
    const rows = await (0, db_1.query)("SHOW COLUMNS FROM user_roles LIKE 'mentor_review_status'");
    const type = String(rows?.[0]?.Type || rows?.[0]?.type || '').toLowerCase();
    if (type.includes("'interview_pending'") && type.includes("'interview_rejected'"))
        return;
    await (0, db_1.query)("ALTER TABLE user_roles MODIFY COLUMN mentor_review_status ENUM('pending','interview_pending','approved','rejected','interview_rejected') NOT NULL DEFAULT 'pending'");
};
const ensureMentorPayrollStatusEnum = async () => {
    const rows = await (0, db_1.query)("SHOW COLUMNS FROM mentor_payroll_payments LIKE 'status'");
    const type = String(rows?.[0]?.Type || rows?.[0]?.type || '').toLowerCase();
    if (type.includes("'pending'") && type.includes("'paid'"))
        return;
    await (0, db_1.query)("ALTER TABLE mentor_payroll_payments MODIFY COLUMN status ENUM('pending','paid') NOT NULL DEFAULT 'paid'");
};
const ensureAdminSchema = async () => {
    if (adminSchemaEnsured)
        return true;
    await (0, db_1.query)(`
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
    await (0, db_1.query)(`
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
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS course_session_disputes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      public_id VARCHAR(32) NOT NULL,
      course_session_id BIGINT NOT NULL,
      student_user_id INT NOT NULL,
      mentor_user_id INT NOT NULL,
      reason_code VARCHAR(40) NOT NULL,
      description_text TEXT NOT NULL,
      preferred_resolution VARCHAR(40) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_course_session_disputes_public_id (public_id),
      UNIQUE KEY uniq_course_session_disputes_session_student (course_session_id, student_user_id),
      KEY idx_course_session_disputes_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS course_dispute_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      dispute_id BIGINT NOT NULL,
      admin_id BIGINT NULL,
      event_type VARCHAR(40) NOT NULL,
      note_text TEXT NULL,
      payload_json LONGTEXT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_course_dispute_events_dispute_created (dispute_id, created_at),
      CONSTRAINT fk_course_dispute_events_dispute FOREIGN KEY (dispute_id) REFERENCES course_session_disputes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS course_dispute_refunds (
      id BIGINT NOT NULL AUTO_INCREMENT,
      dispute_id BIGINT NOT NULL,
      billing_refund_id BIGINT NOT NULL,
      hours DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_course_dispute_refund (dispute_id, billing_refund_id),
      CONSTRAINT fk_course_dispute_refunds_dispute FOREIGN KEY (dispute_id) REFERENCES course_session_disputes(id) ON DELETE CASCADE,
      CONSTRAINT fk_course_dispute_refunds_refund FOREIGN KEY (billing_refund_id) REFERENCES billing_refunds(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS platform_lesson_hour_grants (
      id BIGINT NOT NULL AUTO_INCREMENT,
      public_id VARCHAR(40) NOT NULL,
      user_id INT NOT NULL,
      dispute_id BIGINT NOT NULL,
      granted_hours DECIMAL(10,2) NOT NULL,
      remaining_hours DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_platform_grant_public_id (public_id),
      UNIQUE KEY uniq_platform_grant_dispute (dispute_id),
      KEY idx_platform_grants_user_remaining (user_id, remaining_hours),
      CONSTRAINT fk_platform_grants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_platform_grants_dispute FOREIGN KEY (dispute_id) REFERENCES course_session_disputes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS mentor_payroll_profiles (
      mentor_user_id INT NOT NULL,
      hourly_rate_cny DECIMAL(10,2) NOT NULL DEFAULT 400.00,
      china_tax_resident TINYINT(1) NOT NULL DEFAULT 1,
      updated_by_admin_id BIGINT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (mentor_user_id),
      CONSTRAINT fk_mentor_payroll_profiles_mentor FOREIGN KEY (mentor_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS mentor_payroll_payments (
      id BIGINT NOT NULL AUTO_INCREMENT,
      mentor_user_id INT NOT NULL,
      payroll_month CHAR(7) NOT NULL,
      settled_hours DECIMAL(10,2) NOT NULL,
      hourly_rate_cny DECIMAL(10,2) NOT NULL,
      gross_income_cny DECIMAL(12,2) NOT NULL,
      china_tax_resident TINYINT(1) NOT NULL,
      taxable_income_cny DECIMAL(12,2) NOT NULL DEFAULT 0,
      withheld_tax_cny DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_income_cny DECIMAL(12,2) NOT NULL,
      status ENUM('pending','paid') NOT NULL DEFAULT 'paid',
      payment_reference VARCHAR(120) NULL,
      note_text TEXT NULL,
      paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_by_admin_id BIGINT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_mentor_payroll_payment_month (mentor_user_id, payroll_month),
      KEY idx_mentor_payroll_payment_month (payroll_month, status),
      CONSTRAINT fk_mentor_payroll_payments_mentor FOREIGN KEY (mentor_user_id) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await ensureMentorPayrollStatusEnum();
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN assigned_admin_id BIGINT NULL AFTER status');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN accepted_at TIMESTAMP NULL DEFAULT NULL AFTER assigned_admin_id');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN outcome_code VARCHAR(32) NULL AFTER accepted_at');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN result_message TEXT NULL AFTER outcome_code');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN resolved_hours DECIMAL(10,2) NULL AFTER result_message');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN refund_status VARCHAR(24) NULL AFTER resolved_hours');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN resolved_at TIMESTAMP NULL DEFAULT NULL AFTER refund_status');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN result_email_sent_at TIMESTAMP NULL DEFAULT NULL AFTER resolved_at');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN mentor_result_email_sent_at TIMESTAMP NULL DEFAULT NULL AFTER result_email_sent_at');
    await addColumnIfMissing('ALTER TABLE course_session_disputes ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER mentor_result_email_sent_at');
    // The dispute workflow has only one open state. Normalize records created by
    // earlier versions so retired intermediate states cannot reappear in APIs.
    await (0, db_1.query)("UPDATE course_session_disputes SET status = 'submitted', version = version + 1 WHERE status IN ('reviewing', 'action_pending')");
    await addColumnIfMissing("ALTER TABLE users ADD COLUMN account_status ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER last_login_at");
    await addColumnIfMissing('ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL DEFAULT NULL AFTER account_status');
    await addColumnIfMissing('ALTER TABLE users ADD COLUMN suspended_reason TEXT NULL AFTER suspended_at');
    await addIndexIfMissing('ALTER TABLE users ADD KEY idx_users_account_status (account_status)');
    await addColumnIfMissing('ALTER TABLE account_settings ADD COLUMN mentor_resume_url TEXT NULL');
    await addColumnIfMissing("ALTER TABLE user_roles ADD COLUMN mentor_review_status ENUM('pending','interview_pending','approved','rejected','interview_rejected') NOT NULL DEFAULT 'pending' AFTER mentor_approved");
    await ensureMentorReviewStatusEnum();
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_review_note TEXT NULL AFTER mentor_review_status');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_qs_top100 TINYINT(1) NOT NULL DEFAULT 0 AFTER mentor_review_note');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER mentor_qs_top100');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_reviewed_by_admin_id BIGINT NULL AFTER mentor_reviewed_at');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_interview_note TEXT NULL AFTER mentor_reviewed_by_admin_id');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_interviewed_at TIMESTAMP NULL DEFAULT NULL AFTER mentor_interview_note');
    await addColumnIfMissing('ALTER TABLE user_roles ADD COLUMN mentor_interviewed_by_admin_id BIGINT NULL AFTER mentor_interviewed_at');
    await addIndexIfMissing('ALTER TABLE user_roles ADD KEY idx_user_roles_mentor_review (role, mentor_review_status, mentor_approved)');
    await (0, db_1.query)("UPDATE user_roles SET mentor_review_status = 'approved' WHERE role = 'mentor' AND mentor_approved = 1 AND mentor_review_status <> 'approved'");
    await (0, db_1.query)("UPDATE user_roles SET mentor_approved = 0 WHERE role = 'mentor' AND mentor_review_status <> 'approved' AND mentor_approved <> 0");
    adminSchemaEnsured = true;
    return true;
};
exports.ensureAdminSchema = ensureAdminSchema;
