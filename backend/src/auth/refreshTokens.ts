import type { Request, Response } from 'express';
import crypto from 'crypto';
import { pool, query, type InsertResult } from '../db';

export type Role = 'mentor' | 'student';

const MS_DAY = 24 * 60 * 60 * 1000;

export const ACCESS_TOKEN_EXPIRES_IN = '15m';
export const REFRESH_SLIDING_DAYS = 30;
export const REFRESH_INACTIVITY_DAYS = 14;
export const REFRESH_ABSOLUTE_DAYS = 90;

export const REFRESH_COOKIE_NAME = 'mx_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

let refreshTokensTableEnsured = false;

export const ensureRefreshTokensTable = async () => {
  if (refreshTokensTableEnsured) return true;
  await query(
    `CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`role\` ENUM('mentor','student') NOT NULL,
      \`family_id\` CHAR(36) NOT NULL,
      \`token_hash\` CHAR(64) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_used_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`sliding_expires_at\` TIMESTAMP NOT NULL,
      \`absolute_expires_at\` TIMESTAMP NOT NULL,
      \`revoked_at\` TIMESTAMP NULL DEFAULT NULL,
      \`replaced_by_id\` BIGINT NULL DEFAULT NULL,
      \`revocation_reason\` VARCHAR(200) NULL DEFAULT NULL,
      \`user_agent\` VARCHAR(255) NULL DEFAULT NULL,
      \`ip\` VARCHAR(45) NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_refresh_tokens_token_hash\` (\`token_hash\`),
      KEY \`idx_refresh_tokens_user_id\` (\`user_id\`),
      KEY \`idx_refresh_tokens_family_id\` (\`family_id\`),
      KEY \`idx_refresh_tokens_replaced_by_id\` (\`replaced_by_id\`),
      CONSTRAINT \`fk_refresh_tokens_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );
  refreshTokensTableEnsured = true;
  return true;
};

const toMs = (value: any) => {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_DAY);

const getCookieSecure = () => {
  const env = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (env === 'true' || env === '1' || env === 'yes') return true;
  if (env === 'false' || env === '0' || env === 'no') return false;
  return process.env.NODE_ENV === 'production';
};

const parseCookieHeader = (raw: any): Record<string, string> => {
  const header = typeof raw === 'string' ? raw : '';
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const valueRaw = part.slice(idx + 1).trim();
    if (!valueRaw) continue;
    try {
      out[key] = decodeURIComponent(valueRaw);
    } catch {
      out[key] = valueRaw;
    }
  }
  return out;
};

export const getRefreshTokenFromReq = (req: Request) => {
  const cookies = parseCookieHeader(req.headers?.cookie);
  const value = cookies[REFRESH_COOKIE_NAME];
  return value ? String(value) : null;
};

export const setRefreshTokenCookie = (res: Response, token: string, maxAgeMs: number) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: getCookieSecure(),
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.max(0, Math.floor(maxAgeMs)),
  });
};

export const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
};

export const hashRefreshToken = (token: string) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url');

export const createRefreshTokenSession = async ({
  userId,
  role,
  userAgent,
  ip,
}: {
  userId: number;
  role: Role;
  userAgent?: string | null;
  ip?: string | null;
}) => {
  await ensureRefreshTokensTable();

  const now = new Date();
  const absoluteExpiresAt = addDays(now, REFRESH_ABSOLUTE_DAYS);
  const slidingExpiresAtRaw = addDays(now, REFRESH_SLIDING_DAYS);
  const slidingExpiresAt = slidingExpiresAtRaw.getTime() > absoluteExpiresAt.getTime() ? absoluteExpiresAt : slidingExpiresAtRaw;

  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const familyId = crypto.randomUUID();

  const result = await query<InsertResult>(
    `INSERT INTO refresh_tokens
      (user_id, role, family_id, token_hash, last_used_at, sliding_expires_at, absolute_expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, role, familyId, tokenHash, now, slidingExpiresAt, absoluteExpiresAt, userAgent || null, ip || null]
  );

  const tokenId = Number((result as any)?.insertId || 0);
  return { token, tokenId, familyId, slidingExpiresAt, absoluteExpiresAt };
};

type RefreshTokenRow = {
  id: number;
  user_id: number;
  role: Role;
  family_id: string;
  created_at: Date | string | null;
  last_used_at: Date | string | null;
  sliding_expires_at: Date | string;
  absolute_expires_at: Date | string;
  revoked_at: Date | string | null;
  replaced_by_id: number | null;
};

export class RefreshAuthError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const rotateRefreshToken = async ({
  refreshToken,
  userAgent,
  ip,
}: {
  refreshToken: string;
  userAgent?: string | null;
  ip?: string | null;
}) => {
  await ensureRefreshTokensTable();

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, user_id, role, family_id, created_at, last_used_at, sliding_expires_at, absolute_expires_at, revoked_at, replaced_by_id
       FROM refresh_tokens
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );
    const row = Array.isArray(rows) ? (rows[0] as RefreshTokenRow | undefined) : undefined;
    if (!row) throw new RefreshAuthError('REFRESH_NOT_FOUND', '未授权');

    const revokedAtMs = toMs(row.revoked_at);
    if (revokedAtMs) {
      const replaced = Number(row.replaced_by_id || 0);
      if (replaced > 0) {
        // Rotation reuse detected -> revoke the whole token family.
        await conn.execute(
          `UPDATE refresh_tokens
           SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, 'reuse_detected')
           WHERE family_id = ? AND revoked_at IS NULL`,
          [now, row.family_id]
        );
      }
      throw new RefreshAuthError('REFRESH_REVOKED', '登录已失效，请重新登录');
    }

    const absoluteMs = toMs(row.absolute_expires_at);
    if (absoluteMs && now.getTime() > absoluteMs) throw new RefreshAuthError('REFRESH_ABSOLUTE_EXPIRED', '登录已失效，请重新登录');

    const slidingMs = toMs(row.sliding_expires_at);
    if (slidingMs && now.getTime() > slidingMs) throw new RefreshAuthError('REFRESH_EXPIRED', '登录已失效，请重新登录');

    const lastUsedMs = toMs(row.last_used_at) ?? toMs(row.created_at);
    if (lastUsedMs && now.getTime() > lastUsedMs + REFRESH_INACTIVITY_DAYS * MS_DAY) {
      throw new RefreshAuthError('REFRESH_INACTIVE_EXPIRED', '登录已失效，请重新登录');
    }

    const absoluteExpiresAt = (row.absolute_expires_at instanceof Date)
      ? row.absolute_expires_at
      : new Date(String(row.absolute_expires_at));

    const slidingExpiresAtRaw = addDays(now, REFRESH_SLIDING_DAYS);
    const slidingExpiresAt = slidingExpiresAtRaw.getTime() > absoluteExpiresAt.getTime() ? absoluteExpiresAt : slidingExpiresAtRaw;

    const newToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newToken);

    const [insertRes] = await conn.execute(
      `INSERT INTO refresh_tokens
        (user_id, role, family_id, token_hash, last_used_at, sliding_expires_at, absolute_expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.user_id, row.role, row.family_id, newTokenHash, now, slidingExpiresAt, absoluteExpiresAt, userAgent || null, ip || null]
    );
    const newId = Number((insertRes as any)?.insertId || 0);
    if (!newId) throw new Error('Failed to create refresh token');

    await conn.execute(
      `UPDATE refresh_tokens
       SET revoked_at = ?, replaced_by_id = ?, revocation_reason = 'rotated'
       WHERE id = ? AND revoked_at IS NULL`,
      [now, newId, row.id]
    );

    await conn.commit();

    return {
      userId: row.user_id,
      role: row.role,
      familyId: row.family_id,
      newRefreshToken: newToken,
      slidingExpiresAt,
      absoluteExpiresAt,
    };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    throw e;
  } finally {
    conn.release();
  }
};

export const revokeRefreshToken = async ({
  refreshToken,
  reason = 'logout',
}: {
  refreshToken: string;
  reason?: string;
}) => {
  await ensureRefreshTokensTable();
  const now = new Date();
  const tokenHash = hashRefreshToken(refreshToken);
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, ?)
     WHERE token_hash = ?`,
    [now, reason || 'logout', tokenHash]
  );
};

export const revokeAllRefreshTokensForUser = async (userId: number, reason = 'revoke_all') => {
  await ensureRefreshTokensTable();
  const now = new Date();
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, ?)
     WHERE user_id = ? AND revoked_at IS NULL`,
    [now, reason || 'revoke_all', userId]
  );
};

