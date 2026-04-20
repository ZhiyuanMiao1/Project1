"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_validator_1 = require("express-validator");
const db_1 = require("../db");
const refreshTokens_1 = require("../auth/refreshTokens");
const emailVerificationService_1 = require("../services/emailVerificationService");
const mentorRecommendation_1 = require("../services/mentorRecommendation");
const userStatus_1 = require("../services/userStatus");
const router = (0, express_1.Router)();
const EMAIL_CODE_PURPOSES = ['register', 'reset_password'];
const handleEmailVerificationError = (res, error) => {
    if (error instanceof emailVerificationService_1.EmailVerificationError) {
        return res.status(error.status || 400).json({
            error: error.message,
            code: error.code,
            ...error.details,
        });
    }
    console.error('Email verification error:', error);
    return res.status(500).json({
        error: '服务器错误，请稍后再试',
        code: 'EMAIL_CODE_UNKNOWN_ERROR',
    });
};
router.post('/send-email-code', [
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('purpose').isIn(EMAIL_CODE_PURPOSES).withMessage('验证码用途无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const purpose = String(req.body?.purpose || '');
        if (purpose === 'reset_password') {
            const users = await (0, db_1.query)('SELECT id, username, email FROM users WHERE email = ? LIMIT 1', [String(req.body?.email || '').trim().toLowerCase()]);
            if (!users[0]) {
                return res.status(404).json({ error: '该邮箱尚未注册' });
            }
        }
        const payload = await (0, emailVerificationService_1.sendEmailVerificationCode)({
            email: String(req.body?.email || ''),
            purpose,
            ip: String(req.ip || '').slice(0, 45) || null,
            userAgent: String(req.get('user-agent') || '').slice(0, 255) || null,
        });
        return res.json(payload);
    }
    catch (error) {
        return handleEmailVerificationError(res, error);
    }
});
router.post('/verify-email-code', [
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('purpose').isIn(EMAIL_CODE_PURPOSES).withMessage('验证码用途无效'),
    (0, express_validator_1.body)('code')
        .isLength({ min: 6, max: 6 })
        .withMessage('请输入 6 位验证码')
        .bail()
        .matches(/^\d{6}$/)
        .withMessage('验证码格式不正确'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const payload = await (0, emailVerificationService_1.verifyEmailCode)({
            email: String(req.body?.email || ''),
            purpose: String(req.body?.purpose || ''),
            code: String(req.body?.code || ''),
        });
        return res.json(payload);
    }
    catch (error) {
        return handleEmailVerificationError(res, error);
    }
});
router.post('/reset-password', [
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('emailVerificationToken').isString().isLength({ min: 16 }).withMessage('请先完成邮箱验证码验证'),
    (0, express_validator_1.body)('newPassword').isString().isLength({ min: 6 }).withMessage('密码至少6位'),
    (0, express_validator_1.body)('confirmPassword')
        .isString()
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('两次输入的密码不一致'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');
    const emailVerificationToken = String(req.body?.emailVerificationToken || '');
    try {
        await (0, emailVerificationService_1.consumeEmailVerificationToken)({
            email,
            purpose: 'reset_password',
            verificationToken: emailVerificationToken,
        });
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        const result = await (0, db_1.query)('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);
        const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
        if (affected === 0) {
            return res.status(404).json({ error: '该邮箱尚未注册' });
        }
        const users = await (0, db_1.query)('SELECT id, username, email FROM users WHERE email = ? LIMIT 1', [email]);
        const user = users[0];
        if (user?.id) {
            try {
                await (0, refreshTokens_1.revokeAllRefreshTokensForUser)(user.id, 'password_reset');
            }
            catch (e) {
                console.error('Revoke refresh tokens on password reset error:', e);
            }
        }
        (0, refreshTokens_1.clearRefreshTokenCookie)(res);
        return res.json({ message: '密码已重置，请使用新密码登录' });
    }
    catch (error) {
        return handleEmailVerificationError(res, error);
    }
});
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
        if (await (0, userStatus_1.isUserSuspended)(user.id)) {
            (0, refreshTokens_1.clearRefreshTokenCookie)(res);
            return res.status(403).json({ error: '账号已被平台暂停使用，请联系 Mentory 支持' });
        }
        const roles = await (0, db_1.query)('SELECT role, public_id, mentor_approved FROM user_roles WHERE user_id = ?', [rotated.userId]);
        const roleRow = roles.find((r) => r.role === rotated.role) || roles[0];
        const publicId = roleRow?.public_id || null;
        void (0, mentorRecommendation_1.touchUserLastLogin)(user.id).catch((error) => {
            console.error('Touch refreshed login error:', error);
        });
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
