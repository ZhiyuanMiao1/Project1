"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const express_validator_1 = require("express-validator");
const router = (0, express_1.Router)();
router.get('/ids', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const currentRows = await (0, db_1.query)('SELECT email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const email = currentRows[0]?.email;
        if (!email)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const rows = await (0, db_1.query)("SELECT id, role, public_id, created_at FROM users WHERE email = ? AND role IN ('student','mentor')", [email]);
        let studentId = null;
        let mentorId = null;
        let studentUserId = null;
        let mentorUserId = null;
        let studentCreatedAt = null;
        let mentorCreatedAt = null;
        for (const row of rows) {
            if (row.role === 'student') {
                studentId = row.public_id;
                studentUserId = row.id;
                studentCreatedAt = row.created_at ?? null;
            }
            if (row.role === 'mentor') {
                mentorId = row.public_id;
                mentorUserId = row.id;
                mentorCreatedAt = row.created_at ?? null;
            }
        }
        let degree = null;
        let school = null;
        const profileUserIds = [studentUserId, mentorUserId].filter((id) => typeof id === 'number');
        if (profileUserIds.length > 0) {
            const placeholders = profileUserIds.map(() => '?').join(',');
            const profRows = await (0, db_1.query)(`SELECT user_id, degree, school, updated_at FROM mentor_profiles WHERE user_id IN (${placeholders})`, profileUserIds);
            const candidates = (profRows || []).map((row) => {
                const norm = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);
                const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
                const nextDegree = norm(row.degree);
                const nextSchool = norm(row.school);
                const hasValue = !!nextDegree || !!nextSchool;
                return {
                    userId: row.user_id,
                    degree: nextDegree,
                    school: nextSchool,
                    hasValue,
                    updatedAt,
                };
            });
            const withValue = candidates.filter((c) => c.hasValue);
            const sorted = (withValue.length > 0 ? withValue : candidates)
                .sort((a, b) => b.updatedAt - a.updatedAt);
            const picked = sorted[0];
            if (picked) {
                degree = picked.degree;
                school = picked.school;
            }
        }
        return res.json({ email, studentId, mentorId, degree, school, studentCreatedAt, mentorCreatedAt });
    }
    catch (e) {
        console.error('Account ids error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/profile', auth_1.requireAuth, [
    (0, express_validator_1.body)('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    (0, express_validator_1.body)('school').optional().isString().trim().isLength({ max: 200 }).withMessage('学校无效'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const hasDegree = Object.prototype.hasOwnProperty.call(req.body, 'degree');
    const hasSchool = Object.prototype.hasOwnProperty.call(req.body, 'school');
    if (!hasDegree && !hasSchool) {
        return res.status(400).json({ error: '没有可保存的字段' });
    }
    const normalize = (value) => {
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    };
    try {
        const currentRows = await (0, db_1.query)('SELECT email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const email = currentRows[0]?.email;
        if (!email)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const rows = await (0, db_1.query)("SELECT id, role, public_id FROM users WHERE email = ? AND role IN ('student','mentor')", [email]);
        let studentUserId = null;
        let mentorUserId = null;
        for (const row of rows) {
            if (row.role === 'student')
                studentUserId = row.id;
            if (row.role === 'mentor')
                mentorUserId = row.id;
        }
        const targetUserIds = Array.from(new Set([studentUserId, mentorUserId].filter((id) => typeof id === 'number')));
        if (targetUserIds.length === 0) {
            return res.status(404).json({ error: '未找到账号信息' });
        }
        const patchDegree = hasDegree ? normalize(req.body.degree) : undefined;
        const patchSchool = hasSchool ? normalize(req.body.school) : undefined;
        for (const userId of targetUserIds) {
            const existingRows = await (0, db_1.query)('SELECT degree, school FROM mentor_profiles WHERE user_id = ? LIMIT 1', [userId]);
            const existing = existingRows?.[0] || {};
            const existingDegree = normalize(existing.degree);
            const existingSchool = normalize(existing.school);
            const nextDegree = typeof patchDegree !== 'undefined' ? patchDegree : existingDegree;
            const nextSchool = typeof patchSchool !== 'undefined' ? patchSchool : existingSchool;
            await (0, db_1.query)(`INSERT INTO mentor_profiles (user_id, degree, school)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             degree = VALUES(degree),
             school = VALUES(school),
             updated_at = CURRENT_TIMESTAMP`, [userId, nextDegree, nextSchool]);
        }
        return res.json({ message: '保存成功' });
    }
    catch (e) {
        console.error('Account profile save error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/password', auth_1.requireAuth, [
    (0, express_validator_1.body)('newPassword').isString().isLength({ min: 6 }).withMessage('密码至少6位'),
    (0, express_validator_1.body)('confirmPassword')
        .isString()
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('两次输入的密码不一致'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { newPassword } = req.body;
    try {
        const currentRows = await (0, db_1.query)('SELECT email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const email = currentRows[0]?.email;
        if (!email)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        const result = await (0, db_1.query)("UPDATE users SET password_hash = ? WHERE email = ? AND role IN ('student','mentor')", [passwordHash, email]);
        const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
        if (affected === 0) {
            return res.status(404).json({ error: '未找到账号信息' });
        }
        return res.json({ message: '密码已更新' });
    }
    catch (e) {
        console.error('Account password update error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
