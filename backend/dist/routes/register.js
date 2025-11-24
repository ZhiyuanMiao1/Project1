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
        // 允许同一邮箱分别以 student / mentor 注册各一次
        // 仅当同一角色下已存在该邮箱时，才视为冲突
        const existing = await (0, db_1.query)('SELECT id FROM users WHERE email = ? AND role = ? LIMIT 1', [email, role]);
        if (existing.length > 0) {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        // mentor_approved 仅用于导师审核；创建时统一置 0，由人工审核修改
        const mentorApproved = 0;
        const result = await (0, db_1.query)('INSERT INTO users (username, email, password_hash, role, mentor_approved) VALUES (?, ?, ?, ?, ?)', [username, email, passwordHash, role, mentorApproved]);
        // 读取触发器生成的 public_id 返回给前端
        const inserted = await (0, db_1.query)('SELECT public_id, role FROM users WHERE id = ? LIMIT 1', [result.insertId]);
        const public_id = inserted?.[0]?.public_id || null;
        const finalRole = inserted?.[0]?.role || role;
        // 若选择注册为导师，则自动为其创建学生身份（若尚未存在）
        let pairedStudent = null;
        if (finalRole === 'mentor') {
            const hasStudent = await (0, db_1.query)('SELECT id FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'student']);
            if (hasStudent.length === 0) {
                const studentInsert = await (0, db_1.query)('INSERT INTO users (username, email, password_hash, role, mentor_approved) VALUES (?, ?, ?, ?, ?)', [username, email, passwordHash, 'student', 0]);
                const sRow = await (0, db_1.query)('SELECT public_id FROM users WHERE id = ? LIMIT 1', [studentInsert.insertId]);
                pairedStudent = { userId: studentInsert.insertId, public_id: sRow?.[0]?.public_id || null };
            }
            else {
                // 已存在则读出其 public_id 以便返回
                const sInfo = await (0, db_1.query)('SELECT id, public_id FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'student']);
                if (sInfo.length > 0)
                    pairedStudent = { userId: sInfo[0].id, public_id: sInfo[0].public_id };
            }
        }
        return res.status(201).json({
            message: '用户注册成功',
            userId: result.insertId,
            public_id,
            role: finalRole,
            paired_student: pairedStudent,
        });
    }
    catch (err) {
        // MySQL 唯一键冲突（如 (email, role) 唯一约束 或 public_id 唯一约束）
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
        }
        console.error('Register Error:', err);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
