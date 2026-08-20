"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRegistrationLegalAcceptances = exports.ensureUserLegalAcceptancesTable = exports.CURRENT_PRIVACY_VERSION = exports.CURRENT_TERMS_VERSION = void 0;
const db_1 = require("../db");
exports.CURRENT_TERMS_VERSION = '2026-08-20';
exports.CURRENT_PRIVACY_VERSION = '2026-08-20';
let legalAcceptancesTableReady = false;
const ensureUserLegalAcceptancesTable = async () => {
    if (legalAcceptancesTableReady)
        return;
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS user_legal_acceptances (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      role ENUM('mentor','student') NOT NULL,
      document_type ENUM('terms','privacy') NOT NULL,
      document_version VARCHAR(40) NOT NULL,
      action_type ENUM('accepted','acknowledged') NOT NULL,
      accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(40) NOT NULL DEFAULT 'registration',
      request_id VARCHAR(100) NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(255) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_legal_acceptance (user_id, role, document_type, document_version),
      KEY idx_user_legal_acceptances_user (user_id, accepted_at),
      CONSTRAINT fk_user_legal_acceptances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    legalAcceptancesTableReady = true;
};
exports.ensureUserLegalAcceptancesTable = ensureUserLegalAcceptancesTable;
const recordRegistrationLegalAcceptances = async ({ connection, userId, role, requestId, ip, userAgent, }) => {
    const rows = [
        ['terms', exports.CURRENT_TERMS_VERSION, 'accepted'],
        ['privacy', exports.CURRENT_PRIVACY_VERSION, 'acknowledged'],
    ];
    for (const [documentType, documentVersion, actionType] of rows) {
        await connection.execute(`INSERT INTO user_legal_acceptances
        (user_id, role, document_type, document_version, action_type, source, request_id, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, 'registration', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         action_type = VALUES(action_type),
         accepted_at = CURRENT_TIMESTAMP,
         request_id = VALUES(request_id),
         ip = VALUES(ip),
         user_agent = VALUES(user_agent)`, [
            userId,
            role,
            documentType,
            documentVersion,
            actionType,
            requestId || null,
            ip || null,
            userAgent || null,
        ]);
    }
};
exports.recordRegistrationLegalAcceptances = recordRegistrationLegalAcceptances;
