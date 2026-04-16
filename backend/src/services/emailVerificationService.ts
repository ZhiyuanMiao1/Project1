import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool, query, type InsertResult } from '../db';
import { sendPasswordResetEmailCodeMail, sendRegisterEmailCodeMail } from './mailService';

dotenv.config();

export type EmailVerificationPurpose = 'register' | 'reset_password';

type EmailVerificationRow = {
  id: number;
  email: string;
  purpose: EmailVerificationPurpose;
  code_hash: string;
  code_salt: string;
  attempt_count: number;
  max_attempts: number;
  resend_available_at: Date | string;
  expires_at: Date | string;
  verified_at: Date | string | null;
  consumed_at: Date | string | null;
  invalidated_at: Date | string | null;
  verification_token_hash: string | null;
  verification_expires_at: Date | string | null;
  verification_consumed_at: Date | string | null;
};

const SUPPORTED_PURPOSES = new Set<EmailVerificationPurpose>(['register', 'reset_password']);

let emailVerificationTableEnsured = false;

const parsePositiveInt = (value: any, fallback: number) => {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const EMAIL_CODE_LENGTH = parsePositiveInt(process.env.EMAIL_CODE_LENGTH, 6);
const EMAIL_CODE_EXPIRES_MINUTES = parsePositiveInt(process.env.EMAIL_CODE_EXPIRES_MINUTES, 10);
const EMAIL_CODE_RESEND_SECONDS = parsePositiveInt(process.env.EMAIL_CODE_RESEND_SECONDS, 60);
const EMAIL_CODE_MAX_VERIFY_ATTEMPTS = parsePositiveInt(process.env.EMAIL_CODE_MAX_VERIFY_ATTEMPTS, 5);
const EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES = 30;

const EMAIL_CODE_SECRET = String(process.env.EMAIL_CODE_SECRET || process.env.JWT_SECRET || 'dev_email_code_secret_change_me');

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);
const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

const toDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(next.getTime()) ? next : null;
};

const normalizeEmail = (email: string) => String(email || '').trim().toLowerCase();

const hashEmailCode = ({
  email,
  purpose,
  code,
  salt,
}: {
  email: string;
  purpose: EmailVerificationPurpose;
  code: string;
  salt: string;
}) =>
  crypto
    .createHmac('sha256', EMAIL_CODE_SECRET)
    .update(`${salt}:${normalizeEmail(email)}:${purpose}:${code}`)
    .digest('hex');

const hashVerificationToken = (token: string) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');

const generateNumericCode = (length: number) => {
  const size = Math.max(4, Math.min(8, length));
  const max = 10 ** size;
  return String(crypto.randomInt(0, max)).padStart(size, '0');
};

export class EmailVerificationError extends Error {
  status: number;
  code: string;
  details: Record<string, any>;

  constructor(code: string, message: string, status = 400, details: Record<string, any> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const ensureEmailVerificationTable = async () => {
  if (emailVerificationTableEnsured) return true;

  await query(
    `CREATE TABLE IF NOT EXISTS \`email_verification_codes\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`email\` VARCHAR(255) NOT NULL,
      \`purpose\` VARCHAR(32) NOT NULL,
      \`code_hash\` CHAR(64) NOT NULL,
      \`code_salt\` CHAR(32) NOT NULL,
      \`attempt_count\` INT NOT NULL DEFAULT 0,
      \`max_attempts\` INT NOT NULL DEFAULT 5,
      \`resend_available_at\` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
      \`expires_at\` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
      \`verified_at\` TIMESTAMP NULL DEFAULT NULL,
      \`consumed_at\` TIMESTAMP NULL DEFAULT NULL,
      \`invalidated_at\` TIMESTAMP NULL DEFAULT NULL,
      \`verification_token_hash\` CHAR(64) NULL DEFAULT NULL,
      \`verification_expires_at\` TIMESTAMP NULL DEFAULT NULL,
      \`verification_consumed_at\` TIMESTAMP NULL DEFAULT NULL,
      \`last_attempt_at\` TIMESTAMP NULL DEFAULT NULL,
      \`sent_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`request_ip\` VARCHAR(45) NULL DEFAULT NULL,
      \`user_agent\` VARCHAR(255) NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_email_verification_lookup\` (\`email\`, \`purpose\`, \`id\`),
      KEY \`idx_email_verification_token\` (\`email\`, \`purpose\`, \`verification_token_hash\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  emailVerificationTableEnsured = true;
  return true;
};

const assertSupportedPurpose = (purpose: string): EmailVerificationPurpose => {
  const normalized = String(purpose || '').trim().toLowerCase();
  if (normalized === 'register' && SUPPORTED_PURPOSES.has('register')) return 'register';
  if (normalized === 'reset_password' && SUPPORTED_PURPOSES.has('reset_password')) return 'reset_password';
  throw new EmailVerificationError('EMAIL_CODE_PURPOSE_INVALID', '验证码用途无效', 400);
};

export const sendEmailVerificationCode = async ({
  email,
  purpose,
  ip,
  userAgent,
}: {
  email: string;
  purpose: string;
  ip?: string | null;
  userAgent?: string | null;
}) => {
  await ensureEmailVerificationTable();

  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = assertSupportedPurpose(purpose);
  const now = new Date();

  const latestRows = await query<EmailVerificationRow[]>(
    `SELECT id, email, purpose, code_hash, code_salt, attempt_count, max_attempts, resend_available_at, expires_at,
            verified_at, consumed_at, invalidated_at, verification_token_hash, verification_expires_at, verification_consumed_at
     FROM email_verification_codes
     WHERE email = ? AND purpose = ?
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedEmail, normalizedPurpose]
  );
  const latest = latestRows[0] || null;

  const resendAt = toDate(latest?.resend_available_at);
  const invalidatedAt = toDate(latest?.invalidated_at);
  const consumedAt = toDate(latest?.consumed_at);
  const expiredAt = toDate(latest?.expires_at);
  const isLatestStillPending = !!latest && !invalidatedAt && !consumedAt && !!expiredAt && expiredAt.getTime() > now.getTime();
  if (isLatestStillPending && resendAt && resendAt.getTime() > now.getTime()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resendAt.getTime() - now.getTime()) / 1000));
    throw new EmailVerificationError(
      'EMAIL_CODE_RATE_LIMIT',
      `验证码发送过于频繁，请 ${retryAfterSeconds} 秒后再试`,
      429,
      { retryAfterSeconds }
    );
  }

  const code = generateNumericCode(EMAIL_CODE_LENGTH);
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashEmailCode({
    email: normalizedEmail,
    purpose: normalizedPurpose,
    code,
    salt,
  });
  const expiresAt = addMinutes(now, EMAIL_CODE_EXPIRES_MINUTES);
  const resendAvailableAt = addSeconds(now, EMAIL_CODE_RESEND_SECONDS);

  await query(
    `UPDATE email_verification_codes
     SET invalidated_at = COALESCE(invalidated_at, ?)
     WHERE email = ? AND purpose = ? AND invalidated_at IS NULL AND verification_consumed_at IS NULL`,
    [now, normalizedEmail, normalizedPurpose]
  );

  const insertResult = await query<InsertResult>(
    `INSERT INTO email_verification_codes
      (email, purpose, code_hash, code_salt, max_attempts, resend_available_at, expires_at, request_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedEmail,
      normalizedPurpose,
      codeHash,
      salt,
      EMAIL_CODE_MAX_VERIFY_ATTEMPTS,
      resendAvailableAt,
      expiresAt,
      ip || null,
      userAgent || null,
    ]
  );

  const recordId = Number((insertResult as any)?.insertId || 0);

  try {
    if (normalizedPurpose === 'register') {
      await sendRegisterEmailCodeMail({
        to: normalizedEmail,
        code,
        expiresMinutes: EMAIL_CODE_EXPIRES_MINUTES,
      });
    } else if (normalizedPurpose === 'reset_password') {
      await sendPasswordResetEmailCodeMail({
        to: normalizedEmail,
        code,
        expiresMinutes: EMAIL_CODE_EXPIRES_MINUTES,
      });
    }
  } catch (error) {
    if (recordId) {
      await query(
        'UPDATE email_verification_codes SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?',
        [new Date(), recordId]
      );
    }
    throw new EmailVerificationError('EMAIL_CODE_SEND_FAILED', '验证码发送失败，请稍后再试', 500);
  }

  return {
    message: '验证码已发送',
    resendAfterSeconds: EMAIL_CODE_RESEND_SECONDS,
    expiresInSeconds: EMAIL_CODE_EXPIRES_MINUTES * 60,
  };
};

export const verifyEmailCode = async ({
  email,
  purpose,
  code,
}: {
  email: string;
  purpose: string;
  code: string;
}) => {
  await ensureEmailVerificationTable();

  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = assertSupportedPurpose(purpose);
  const normalizedCode = String(code || '').trim();
  const now = new Date();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, email, purpose, code_hash, code_salt, attempt_count, max_attempts, resend_available_at, expires_at,
              verified_at, consumed_at, invalidated_at, verification_token_hash, verification_expires_at, verification_consumed_at
       FROM email_verification_codes
       WHERE email = ? AND purpose = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedEmail, normalizedPurpose]
    );
    const row = Array.isArray(rows) ? (rows[0] as EmailVerificationRow | undefined) : undefined;

    if (!row) {
      throw new EmailVerificationError('EMAIL_CODE_NOT_FOUND', '验证码不存在或已失效', 400);
    }

    const invalidatedAt = toDate(row.invalidated_at);
    if (invalidatedAt) {
      throw new EmailVerificationError('EMAIL_CODE_NOT_FOUND', '验证码不存在或已失效', 400);
    }

    const expiresAt = toDate(row.expires_at);
    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      await conn.execute(
        'UPDATE email_verification_codes SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?',
        [now, row.id]
      );
      await conn.commit();
      throw new EmailVerificationError('EMAIL_CODE_EXPIRED', '验证码已过期，请重新发送', 400);
    }

    if (Number(row.attempt_count || 0) >= Number(row.max_attempts || EMAIL_CODE_MAX_VERIFY_ATTEMPTS)) {
      await conn.execute(
        'UPDATE email_verification_codes SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?',
        [now, row.id]
      );
      await conn.commit();
      throw new EmailVerificationError('EMAIL_CODE_TOO_MANY_ATTEMPTS', '验证码错误次数过多，请重新发送', 429, {
        attemptsRemaining: 0,
      });
    }

    const expectedHash = hashEmailCode({
      email: normalizedEmail,
      purpose: normalizedPurpose,
      code: normalizedCode,
      salt: row.code_salt,
    });

    if (expectedHash !== row.code_hash) {
      const nextAttempts = Number(row.attempt_count || 0) + 1;
      const attemptsRemaining = Math.max(0, Number(row.max_attempts || EMAIL_CODE_MAX_VERIFY_ATTEMPTS) - nextAttempts);
      const lockNow = attemptsRemaining <= 0 ? now : null;
      await conn.execute(
        `UPDATE email_verification_codes
         SET attempt_count = ?, last_attempt_at = ?, invalidated_at = COALESCE(invalidated_at, ?)
         WHERE id = ?`,
        [nextAttempts, now, lockNow, row.id]
      );
      await conn.commit();

      throw new EmailVerificationError(
        attemptsRemaining > 0 ? 'EMAIL_CODE_INVALID' : 'EMAIL_CODE_TOO_MANY_ATTEMPTS',
        attemptsRemaining > 0 ? '验证码错误，请重新输入' : '验证码错误次数过多，请重新发送',
        attemptsRemaining > 0 ? 400 : 429,
        { attemptsRemaining }
      );
    }

    const verificationToken = crypto.randomBytes(24).toString('base64url');
    const verificationTokenHash = hashVerificationToken(verificationToken);
    const verificationExpiresAt = addMinutes(now, EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES);

    await conn.execute(
      `UPDATE email_verification_codes
       SET verified_at = ?, consumed_at = ?, invalidated_at = COALESCE(invalidated_at, ?),
           verification_token_hash = ?, verification_expires_at = ?, last_attempt_at = ?
       WHERE id = ?`,
      [now, now, now, verificationTokenHash, verificationExpiresAt, now, row.id]
    );

    await conn.commit();

    return {
      message: '邮箱验证通过',
      verificationToken,
      verificationExpiresInSeconds: EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES * 60,
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }
};

export const consumeEmailVerificationToken = async ({
  email,
  purpose,
  verificationToken,
}: {
  email: string;
  purpose: string;
  verificationToken: string;
}) => {
  await ensureEmailVerificationTable();

  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = assertSupportedPurpose(purpose);
  const tokenHash = hashVerificationToken(String(verificationToken || '').trim());
  const now = new Date();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, verification_expires_at, verification_consumed_at
       FROM email_verification_codes
       WHERE email = ? AND purpose = ? AND verification_token_hash = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedEmail, normalizedPurpose, tokenHash]
    );
    const row = Array.isArray(rows) ? (rows[0] as Pick<EmailVerificationRow, 'id' | 'verification_expires_at' | 'verification_consumed_at'> | undefined) : undefined;

    if (!row) {
      throw new EmailVerificationError('EMAIL_VERIFICATION_REQUIRED', '请先完成邮箱验证码验证', 401);
    }

    const verificationConsumedAt = toDate(row.verification_consumed_at);
    if (verificationConsumedAt) {
      throw new EmailVerificationError('EMAIL_VERIFICATION_USED', '邮箱验证已失效，请重新获取验证码', 401);
    }

    const verificationExpiresAt = toDate(row.verification_expires_at);
    if (!verificationExpiresAt || verificationExpiresAt.getTime() <= now.getTime()) {
      await conn.execute(
        'UPDATE email_verification_codes SET verification_consumed_at = COALESCE(verification_consumed_at, ?), invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?',
        [now, now, row.id]
      );
      await conn.commit();
      throw new EmailVerificationError('EMAIL_VERIFICATION_EXPIRED', '邮箱验证已过期，请重新获取验证码', 401);
    }

    await conn.execute(
      'UPDATE email_verification_codes SET verification_consumed_at = ? WHERE id = ? AND verification_consumed_at IS NULL',
      [now, row.id]
    );
    await conn.commit();
    return { id: row.id };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }
};
