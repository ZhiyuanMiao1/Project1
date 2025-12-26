"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_validator_1 = require("express-validator");
const db_1 = require("../db");
const router = (0, express_1.Router)();
const getRoleRow = async (userId, role) => {
    const rows = await (0, db_1.query)('SELECT role, public_id FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1', [userId, role]);
    return rows[0] || null;
};
const ensureRole = async (userId, role) => {
    const existing = await getRoleRow(userId, role);
    if (existing)
        return existing;
    // public_id 由触发器生成：这里插入空字符串触发分配
    await (0, db_1.query)('INSERT INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, ?, ?, ?)', [userId, role, role === 'mentor' ? 0 : 0, '']);
    const created = await getRoleRow(userId, role);
    if (!created)
        throw new Error('failed_to_create_role');
    return created;
};
router.post('/', [
    (0, express_validator_1.body)('username').optional().isLength({ min: 3 }).withMessage('用户名至少3个字符'),
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    (0, express_validator_1.body)('role').isIn(['student', 'mentor']).withMessage('角色无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username = null, email, password, role } = req.body;
    try {
        const accountRows = await (0, db_1.query)('SELECT id, username, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
        let userId;
        let passwordHash;
        if (accountRows.length === 0) {
            passwordHash = await bcryptjs_1.default.hash(password, 10);
            const created = await (0, db_1.query)('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
            userId = created.insertId;
        }
        else {
            const account = accountRows[0];
            userId = account.id;
            passwordHash = account.password_hash;
            const ok = await bcryptjs_1.default.compare(password, passwordHash);
            if (!ok) {
                // 统一返回“邮箱或密码错误”，避免泄露邮箱是否存在
                return res.status(401).json({ error: '邮箱或密码错误' });
            }
            // 如果传了 username 且数据库为空，则顺手补齐
            if (username && !account.username) {
                await (0, db_1.query)('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
            }
        }
        const existingRole = await getRoleRow(userId, role);
        if (existingRole) {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        const mainRole = await ensureRole(userId, role);
        // 若开通导师身份，则确保也有 student 身份（与旧逻辑一致，方便后续切换）
        let pairedStudent = null;
        if (role === 'mentor') {
            const studentRole = await ensureRole(userId, 'student');
            pairedStudent = { userId, public_id: studentRole.public_id || null };
        }
        return res.status(201).json({
            message: '用户注册成功',
            userId,
            public_id: mainRole.public_id || null,
            role,
            paired_student: pairedStudent,
        });
    }
    catch (err) {
        // MySQL 唯一键冲突（如 users.email / user_roles PK / public_id 唯一约束）
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        console.error('Register Error:', err);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
