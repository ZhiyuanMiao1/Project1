"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const refreshTokens_1 = require("../auth/refreshTokens");
const router = (0, express_1.Router)();
router.post('/refresh', async (req, res) => {
    const refreshToken = (0, refreshTokens_1.getRefreshTokenFromReq)(req);
    if (!refreshToken) {
        (0, refreshTokens_1.clearRefreshTokenCookie)(res);
        return res.status(401).json({ error: '未授权' });
    }
    try {
        const rotated = await (0, refreshTokens_1.rotateRefreshToken)({
            refreshToken,
            userAgent: String(req.get('user-agent') || '').slice(0, 255) || null,
            ip: String(req.ip || '').slice(0, 45) || null,
        });
        const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
        const accessToken = jsonwebtoken_1.default.sign({ id: rotated.userId, role: rotated.role }, secret, { expiresIn: refreshTokens_1.ACCESS_TOKEN_EXPIRES_IN });
        (0, refreshTokens_1.setRefreshTokenCookie)(res, rotated.newRefreshToken, rotated.slidingExpiresAt.getTime() - Date.now());
        const users = await (0, db_1.query)('SELECT id, username, email FROM users WHERE id = ? LIMIT 1', [rotated.userId]);
        const user = users[0];
        if (!user) {
            (0, refreshTokens_1.clearRefreshTokenCookie)(res);
            return res.status(401).json({ error: '未授权' });
        }
        const roles = await (0, db_1.query)('SELECT role, public_id, mentor_approved FROM user_roles WHERE user_id = ?', [rotated.userId]);
        const roleRow = roles.find((r) => r.role === rotated.role) || roles[0];
        const publicId = roleRow?.public_id || null;
        return res.json({
            message: '刷新成功',
            token: accessToken,
            user: { id: user.id, username: user.username, email: user.email, role: rotated.role, public_id: publicId },
            roles: roles.map((r) => ({ role: r.role, public_id: r.public_id, mentor_approved: r.mentor_approved })),
        });
    }
    catch (e) {
        if (e instanceof refreshTokens_1.RefreshAuthError) {
            (0, refreshTokens_1.clearRefreshTokenCookie)(res);
            return res.status(e.status || 401).json({ error: e.message || '登录已失效，请重新登录' });
        }
        console.error('Refresh Error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/logout', async (req, res) => {
    const refreshToken = (0, refreshTokens_1.getRefreshTokenFromReq)(req);
    try {
        if (refreshToken) {
            await (0, refreshTokens_1.revokeRefreshToken)({ refreshToken, reason: 'logout' });
        }
    }
    catch (e) {
        console.error('Logout Error:', e);
    }
    finally {
        (0, refreshTokens_1.clearRefreshTokenCookie)(res);
    }
    return res.json({ message: '退出登录成功' });
});
exports.default = router;
