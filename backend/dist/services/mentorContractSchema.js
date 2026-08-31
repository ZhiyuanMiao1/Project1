"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMentorContractSchema = void 0;
const db_1 = require("../db");
let schemaReady = false;
const addColumnIfMissing = async (sql) => {
    try {
        await (0, db_1.query)(sql);
    }
    catch (error) {
        const code = String(error?.code || '');
        const message = String(error?.message || '');
        if (code !== 'ER_DUP_FIELDNAME' && !message.includes('Duplicate column name'))
            throw error;
    }
};
const ensureMentorContractSchema = async () => {
    if (schemaReady)
        return;
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS mentor_contract_signatures (
      id BIGINT NOT NULL AUTO_INCREMENT,
      mentor_user_id INT NOT NULL,
      contract_type VARCHAR(40) NOT NULL DEFAULT 'mentor_cooperation',
      mentor_name VARCHAR(120) NOT NULL,
      mentor_email VARCHAR(255) NOT NULL,
      contract_number VARCHAR(64) NOT NULL,
      contract_version VARCHAR(40) NOT NULL,
      template_file_name VARCHAR(255) NOT NULL,
      template_sha256 CHAR(64) NOT NULL,
      status ENUM('pending','generating','signed','failed') NOT NULL DEFAULT 'pending',
      signing_started_at DATETIME(3) NULL,
      signed_at DATETIME(3) NULL,
      signed_ip VARCHAR(45) NULL,
      signed_user_agent VARCHAR(512) NULL,
      china_tax_resident TINYINT(1) NULL,
      tax_residency_declaration_version VARCHAR(20) NULL,
      tax_residency_declared_at DATETIME(3) NULL,
      email_verification_code_id BIGINT NULL,
      email_verified_at DATETIME(3) NULL,
      final_docx_oss_key VARCHAR(1024) NULL,
      final_docx_sha256 CHAR(64) NULL,
      final_pdf_oss_key VARCHAR(1024) NULL,
      final_pdf_sha256 CHAR(64) NULL,
      failure_code VARCHAR(80) NULL,
      failure_detail VARCHAR(1000) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uniq_mentor_contract_user_type (mentor_user_id, contract_type),
      UNIQUE KEY uniq_mentor_contract_number (contract_number),
      KEY idx_mentor_contract_status (status, updated_at),
      CONSTRAINT fk_mentor_contract_signature_user FOREIGN KEY (mentor_user_id) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
    await addColumnIfMissing('ALTER TABLE mentor_contract_signatures ADD COLUMN china_tax_resident TINYINT(1) NULL AFTER signed_user_agent');
    await addColumnIfMissing('ALTER TABLE mentor_contract_signatures ADD COLUMN tax_residency_declaration_version VARCHAR(20) NULL AFTER china_tax_resident');
    await addColumnIfMissing('ALTER TABLE mentor_contract_signatures ADD COLUMN tax_residency_declared_at DATETIME(3) NULL AFTER tax_residency_declaration_version');
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS mentor_contract_email_codes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      contract_signature_id BIGINT NOT NULL,
      email VARCHAR(255) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      code_salt CHAR(32) NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      resend_available_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      verified_at DATETIME(3) NULL,
      invalidated_at DATETIME(3) NULL,
      last_attempt_at DATETIME(3) NULL,
      sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      request_ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      PRIMARY KEY (id),
      KEY idx_mentor_contract_code_lookup (contract_signature_id, id),
      CONSTRAINT fk_mentor_contract_code_signature FOREIGN KEY (contract_signature_id) REFERENCES mentor_contract_signatures(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS mentor_contract_audit_logs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      mentor_user_id INT NOT NULL,
      contract_signature_id BIGINT NULL,
      event_type VARCHAR(60) NOT NULL,
      event_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      metadata_json LONGTEXT NULL,
      PRIMARY KEY (id),
      KEY idx_mentor_contract_audit_user (mentor_user_id, event_at),
      KEY idx_mentor_contract_audit_signature (contract_signature_id, event_at),
      CONSTRAINT fk_mentor_contract_audit_user FOREIGN KEY (mentor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_mentor_contract_audit_signature FOREIGN KEY (contract_signature_id) REFERENCES mentor_contract_signatures(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
    schemaReady = true;
};
exports.ensureMentorContractSchema = ensureMentorContractSchema;
