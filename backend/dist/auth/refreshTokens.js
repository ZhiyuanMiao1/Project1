"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeAllRefreshTokensForUser = exports.revokeRefreshToken = exports.rotateRefreshToken = exports.RefreshAuthError = exports.createRefreshTokenSession = exports.generateRefreshToken = exports.hashRefreshToken = exports.clearRefreshTokenCookie = exports.setRefreshTokenCookie = exports.getRefreshTokenFromReq = exports.ensureRefreshTokensTable = exports.REFRESH_COOKIE_PATH = exports.REFRESH_COOKIE_NAME = exports.REFRESH_ABSOLUTE_DAYS = exports.REFRESH_INACTIVITY_DAYS = exports.REFRESH_SLIDING_DAYS = exports.ACCESS_TOKEN_EXPIRES_IN = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const MS_DAY = 24 * 60 * 60 * 1000;
exports.ACCESS_TOKEN_EXPIRES_IN = '15m';
exports.REFRESH_SLIDING_DAYS = 30;
exports.REFRESH_INACTIVITY_DAYS = 14;
exports.REFRESH_ABSOLUTE_DAYS = 90;
exports.REFRESH_COOKIE_NAME = 'mx_refresh';
exports.REFRESH_COOKIE_PATH = '/api/auth';
let refreshTokensTableEnsured = false;
const ensureRefreshTokensTable = async () => {
    if (refreshTokensTableEnsured)
        return true;
    await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`role\` ENUM('mentor','student') NOT NULL,
      \`family_id\` CHAR(36) NOT NULL,
      \`token_hash\` CHAR(64) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_used_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`sliding_expires_at\` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
      \`absolute_expires_at\` TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00',
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    refreshTokensTableEnsured = true;
    return true;
};
exports.ensureRefreshTokensTable = ensureRefreshTokensTable;
const toMs = (value) => {
    if (!value)
        return null;
    const dt = value instanceof Date ? value : new Date(value);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
};
const addDays = (date, days) => new Date(date.getTime() + days * MS_DAY);
const getCookieSecure = () => {
    const env = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
    if (env === 'true' || env === '1' || env === 'yes')
        return true;
    if (env === 'false' || env === '0' || env === 'no')
        return false;
    return process.env.NODE_ENV === 'production';
};
const parseCookieHeader = (raw) => {
    const header = typeof raw === 'string' ? raw : '';
    if (!header)
        return {};
    const out = {};
    const parts = header.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx <= 0)
            continue;
        const key = part.slice(0, idx).trim();
        if (!key)
            continue;
        const valueRaw = part.slice(idx + 1).trim();
        if (!valueRaw)
            continue;
        try {
            out[key] = decodeURIComponent(valueRaw);
        }
        catch {
            out[key] = valueRaw;
        }
    }
    return out;
};
const getRefreshTokenFromReq = (req) => {
    const cookies = parseCookieHeader(req.headers?.cookie);
    const value = cookies[exports.REFRESH_COOKIE_NAME];
    return value ? String(value) : null;
};
exports.getRefreshTokenFromReq = getRefreshTokenFromReq;
const setRefreshTokenCookie = (res, token, maxAgeMs) => {
    res.cookie(exports.REFRESH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: getCookieSecure(),
        sameSite: 'lax',
        path: exports.REFRESH_COOKIE_PATH,
        maxAge: Math.max(0, Math.floor(maxAgeMs)),
    });
};
exports.setRefreshTokenCookie = setRefreshTokenCookie;
const clearRefreshTokenCookie = (res) => {
    res.clearCookie(exports.REFRESH_COOKIE_NAME, { path: exports.REFRESH_COOKIE_PATH });
};
exports.clearRefreshTokenCookie = clearRefreshTokenCookie;
const hashRefreshToken = (token) => crypto_1.default.createHash('sha256').update(String(token)).digest('hex');
exports.hashRefreshToken = hashRefreshToken;
const generateRefreshToken = () => crypto_1.default.randomBytes(32).toString('base64url');
exports.generateRefreshToken = generateRefreshToken;
const createRefreshTokenSession = async ({ userId, role, userAgent, ip, }) => {
    await (0, exports.ensureRefreshTokensTable)();
    const now = new Date();
    const absoluteExpiresAt = addDays(now, exports.REFRESH_ABSOLUTE_DAYS);
    const slidingExpiresAtRaw = addDays(now, exports.REFRESH_SLIDING_DAYS);
    const slidingExpiresAt = slidingExpiresAtRaw.getTime() > absoluteExpiresAt.getTime() ? absoluteExpiresAt : slidingExpiresAtRaw;
    const token = (0, exports.generateRefreshToken)();
    const tokenHash = (0, exports.hashRefreshToken)(token);
    const familyId = crypto_1.default.randomUUID();
    const result = await (0, db_1.query)(`INSERT INTO refresh_tokens
      (user_id, role, family_id, token_hash, last_used_at, sliding_expires_at, absolute_expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, role, familyId, tokenHash, now, slidingExpiresAt, absoluteExpiresAt, userAgent || null, ip || null]);
    const tokenId = Number(result?.insertId || 0);
    return { token, tokenId, familyId, slidingExpiresAt, absoluteExpiresAt };
};
exports.createRefreshTokenSession = createRefreshTokenSession;
class RefreshAuthError extends Error {
    constructor(code, message, status = 401) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
exports.RefreshAuthError = RefreshAuthError;
const rotateRefreshToken = async ({ refreshToken, userAgent, ip, }) => {
    await (0, exports.ensureRefreshTokensTable)();
    const tokenHash = (0, exports.hashRefreshToken)(refreshToken);
    const now = new Date();
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(`SELECT id, user_id, role, family_id, created_at, last_used_at, sliding_expires_at, absolute_expires_at, revoked_at, replaced_by_id
       FROM refresh_tokens
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`, [tokenHash]);
        const row = Array.isArray(rows) ? rows[0] : undefined;
        if (!row)
            throw new RefreshAuthError('REFRESH_NOT_FOUND', '未授权');
        const revokedAtMs = toMs(row.revoked_at);
        if (revokedAtMs) {
            const replaced = Number(row.replaced_by_id || 0);
            if (replaced > 0) {
                // Rotation reuse detected -> revoke the whole token family.
                await conn.execute(`UPDATE refresh_tokens
           SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, 'reuse_detected')
           WHERE family_id = ? AND revoked_at IS NULL`, [now, row.family_id]);
            }
            throw new RefreshAuthError('REFRESH_REVOKED', '登录已失效，请重新登录');
        }
        const absoluteMs = toMs(row.absolute_expires_at);
        if (absoluteMs && now.getTime() > absoluteMs)
            throw new RefreshAuthError('REFRESH_ABSOLUTE_EXPIRED', '登录已失效，请重新登录');
        const slidingMs = toMs(row.sliding_expires_at);
        if (slidingMs && now.getTime() > slidingMs)
            throw new RefreshAuthError('REFRESH_EXPIRED', '登录已失效，请重新登录');
        const lastUsedMs = toMs(row.last_used_at) ?? toMs(row.created_at);
        if (lastUsedMs && now.getTime() > lastUsedMs + exports.REFRESH_INACTIVITY_DAYS * MS_DAY) {
            throw new RefreshAuthError('REFRESH_INACTIVE_EXPIRED', '登录已失效，请重新登录');
        }
        const absoluteExpiresAt = (row.absolute_expires_at instanceof Date)
            ? row.absolute_expires_at
            : new Date(String(row.absolute_expires_at));
        const slidingExpiresAtRaw = addDays(now, exports.REFRESH_SLIDING_DAYS);
        const slidingExpiresAt = slidingExpiresAtRaw.getTime() > absoluteExpiresAt.getTime() ? absoluteExpiresAt : slidingExpiresAtRaw;
        const newToken = (0, exports.generateRefreshToken)();
        const newTokenHash = (0, exports.hashRefreshToken)(newToken);
        const [insertRes] = await conn.execute(`INSERT INTO refresh_tokens
        (user_id, role, family_id, token_hash, last_used_at, sliding_expires_at, absolute_expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.user_id, row.role, row.family_id, newTokenHash, now, slidingExpiresAt, absoluteExpiresAt, userAgent || null, ip || null]);
        const newId = Number(insertRes?.insertId || 0);
        if (!newId)
            throw new Error('Failed to create refresh token');
        await conn.execute(`UPDATE refresh_tokens
       SET revoked_at = ?, replaced_by_id = ?, revocation_reason = 'rotated'
       WHERE id = ? AND revoked_at IS NULL`, [now, newId, row.id]);
        await conn.commit();
        return {
            userId: row.user_id,
            role: row.role,
            familyId: row.family_id,
            newRefreshToken: newToken,
            slidingExpiresAt,
            absoluteExpiresAt,
        };
    }
    catch (e) {
        try {
            await conn.rollback();
        }
        catch { }
        throw e;
    }
    finally {
        conn.release();
    }
};
exports.rotateRefreshToken = rotateRefreshToken;
const revokeRefreshToken = async ({ refreshToken, reason = 'logout', }) => {
    await (0, exports.ensureRefreshTokensTable)();
    const now = new Date();
    const tokenHash = (0, exports.hashRefreshToken)(refreshToken);
    await (0, db_1.query)(`UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, ?)
     WHERE token_hash = ?`, [now, reason || 'logout', tokenHash]);
};
exports.revokeRefreshToken = revokeRefreshToken;
const revokeAllRefreshTokensForUser = async (userId, reason = 'revoke_all') => {
    await (0, exports.ensureRefreshTokensTable)();
    const now = new Date();
    await (0, db_1.query)(`UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, ?), revocation_reason = COALESCE(revocation_reason, ?)
     WHERE user_id = ? AND revoked_at IS NULL`, [now, reason || 'revoke_all', userId]);
};
exports.revokeAllRefreshTokensForUser = revokeAllRefreshTokensForUser;
