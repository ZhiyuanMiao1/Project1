import type { PoolConnection } from 'mysql2/promise';
import { query as dbQuery } from '../db';

export const CURRENT_TERMS_VERSION = '2026-08-20';
export const CURRENT_PRIVACY_VERSION = '2026-08-20';

let legalAcceptancesTableReady = false;

type SqlExecutor = Pick<PoolConnection, 'execute'>;

export const ensureUserLegalAcceptancesTable = async () => {
  if (legalAcceptancesTableReady) return;

  await dbQuery(`
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

export const recordRegistrationLegalAcceptances = async ({
  connection,
  userId,
  role,
  requestId,
  ip,
  userAgent,
}: {
  connection: SqlExecutor;
  userId: number;
  role: 'mentor' | 'student';
  requestId?: string;
  ip?: string;
  userAgent?: string;
}) => {
  const rows = [
    ['terms', CURRENT_TERMS_VERSION, 'accepted'],
    ['privacy', CURRENT_PRIVACY_VERSION, 'acknowledged'],
  ];

  for (const [documentType, documentVersion, actionType] of rows) {
    await connection.execute(
      `INSERT INTO user_legal_acceptances
        (user_id, role, document_type, document_version, action_type, source, request_id, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, 'registration', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         action_type = VALUES(action_type),
         accepted_at = CURRENT_TIMESTAMP,
         request_id = VALUES(request_id),
         ip = VALUES(ip),
         user_agent = VALUES(user_agent)`,
      [
        userId,
        role,
        documentType,
        documentVersion,
        actionType,
        requestId || null,
        ip || null,
        userAgent || null,
      ]
    );
  }
};
