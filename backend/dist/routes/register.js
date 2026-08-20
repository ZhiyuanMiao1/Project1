"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_validator_1 = require("express-validator");
const db_1 = require("../db");
const emailVerificationService_1 = require("../services/emailVerificationService");
const legalConsent_1 = require("../services/legalConsent");
const router = (0, express_1.Router)();
let mentorResumeColumnEnsured = false;
const isMissingMentorResumeColumnError = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('mentor_resume_url');
};
const ensureMentorResumeColumn = async () => {
    if (mentorResumeColumnEnsured)
        return true;
    try {
        await (0, db_1.query)('ALTER TABLE account_settings MODIFY COLUMN mentor_resume_url TEXT NULL');
        mentorResumeColumnEnsured = true;
        return true;
    }
    catch (e) {
        if (isMissingMentorResumeColumnError(e)) {
            try {
                await (0, db_1.query)('ALTER TABLE account_settings ADD COLUMN mentor_resume_url TEXT NULL');
                mentorResumeColumnEnsured = true;
                return true;
            }
            catch (inner) {
                const code = String(inner?.code || '');
                const message = String(inner?.message || '');
                if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
                    mentorResumeColumnEnsured = true;
                    return true;
                }
            }
        }
        return false;
    }
};
const getRoleRow = async (userId, role, run = db_1.query) => {
    const rows = await run('SELECT role, public_id FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1', [userId, role]);
    return rows[0] || null;
};
const ensureRole = async (userId, role, run = db_1.query) => {
    const existing = await getRoleRow(userId, role, run);
    if (existing)
        return existing;
    // public_id 由触发器生成：这里插入空字符串触发分配
    await run('INSERT INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, ?, ?, ?)', [userId, role, role === 'mentor' ? 0 : 0, '']);
    const created = await getRoleRow(userId, role, run);
    if (!created)
        throw new Error('failed_to_create_role');
    return created;
};
router.post('/', [
    (0, express_validator_1.body)('username').optional().isLength({ min: 3 }).withMessage('用户名至少3个字符'),
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    (0, express_validator_1.body)('role').isIn(['student', 'mentor']).withMessage('角色无效'),
    (0, express_validator_1.body)('emailVerificationToken')
        .isString()
        .trim()
        .isLength({ min: 20, max: 256 })
        .withMessage('请先完成邮箱验证'),
    (0, express_validator_1.body)('termsAccepted').custom((value) => value === true).withMessage('请先阅读并同意服务条款'),
    (0, express_validator_1.body)('privacyAcknowledged').custom((value) => value === true).withMessage('请先阅读隐私政策'),
    (0, express_validator_1.body)('termsVersion').equals(legalConsent_1.CURRENT_TERMS_VERSION).withMessage('服务条款已更新，请重新阅读并同意'),
    (0, express_validator_1.body)('privacyVersion').equals(legalConsent_1.CURRENT_PRIVACY_VERSION).withMessage('隐私政策已更新，请重新阅读'),
    (0, express_validator_1.body)('resumeUrls').optional().isArray({ min: 1, max: 10 }).withMessage('请上传 1 到 10 个文件'),
    (0, express_validator_1.body)('resumeUrls.*').optional().isString().trim().isLength({ min: 1, max: 500 }).withMessage('简历地址无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username = null, email, password, role, emailVerificationToken } = req.body;
    const resumeUrls = Array.isArray(req.body?.resumeUrls)
        ? req.body.resumeUrls
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item)
        : [];
    if (role === 'mentor' && !resumeUrls.length) {
        return res.status(400).json({
            errors: [{ msg: '请先上传简历', param: 'resumeUrls', location: 'body' }],
        });
    }
    let connection = null;
    try {
        await (0, legalConsent_1.ensureUserLegalAcceptancesTable)();
        const accountRows = await (0, db_1.query)('SELECT id, username, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
        let userId = 0;
        const account = accountRows[0] || null;
        if (account) {
            userId = account.id;
            const ok = await bcryptjs_1.default.compare(password, account.password_hash);
            if (!ok) {
                // 统一返回“邮箱或密码错误”，避免泄露邮箱是否存在
                return res.status(401).json({ error: '邮箱或密码错误' });
            }
            // 如果传了 username 且数据库为空，则顺手补齐
            if (username && !account.username) {
                await (0, db_1.query)('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
            }
        }
        const existingRole = account ? await getRoleRow(userId, role) : null;
        if (existingRole) {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        if (role === 'mentor') {
            const ensured = await ensureMentorResumeColumn();
            if (!ensured) {
                return res.status(500).json({ error: '服务器错误，请稍后再试' });
            }
        }
        await (0, emailVerificationService_1.consumeEmailVerificationToken)({
            email,
            purpose: 'register',
            verificationToken: emailVerificationToken,
        });
        connection = await db_1.pool.getConnection();
        await connection.beginTransaction();
        const run = async (sql, params = []) => {
            const [rows] = await connection.execute(sql, params);
            return rows;
        };
        if (!account) {
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            const created = await run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
            userId = created.insertId;
        }
        const mainRole = await ensureRole(userId, role, run);
        // 若开通导师身份，则确保也有 student 身份（与旧逻辑一致，方便后续切换）
        let pairedStudent = null;
        if (role === 'mentor') {
            const studentRole = await ensureRole(userId, 'student', run);
            pairedStudent = { userId, public_id: studentRole.public_id || null };
            await run(`INSERT INTO account_settings (user_id, email_notifications, mentor_resume_url)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE mentor_resume_url = VALUES(mentor_resume_url)`, [userId, 1, JSON.stringify(resumeUrls)]);
        }
        await (0, legalConsent_1.recordRegistrationLegalAcceptances)({
            connection,
            userId,
            role,
            requestId: String(req.headers['x-request-id'] || '').slice(0, 100),
            ip: String(req.ip || '').slice(0, 45),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
        });
        await connection.commit();
        connection.release();
        connection = null;
        return res.status(201).json({
            message: '用户注册成功',
            userId,
            public_id: mainRole.public_id || null,
            role,
            paired_student: pairedStudent,
        });
    }
    catch (err) {
        if (connection) {
            try {
                await connection.rollback();
            }
            catch { }
            connection.release();
            connection = null;
        }
        if (err instanceof emailVerificationService_1.EmailVerificationError) {
            return res.status(err.status || 400).json({
                error: err.message,
                code: err.code,
                ...err.details,
            });
        }
        // MySQL 唯一键冲突（如 users.email / user_roles PK / public_id 唯一约束）
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        console.error('Register Error:', err);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
