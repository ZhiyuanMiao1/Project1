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
    (0, express_validator_1.body)('role').isIn(['mentor', 'student']).withMessage('角色无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { username = null, email, password, role } = req.body;
    try {
        const existing = await (0, db_1.query)('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: '该邮箱已被注册' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const result = await (0, db_1.query)('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', [username, email, passwordHash, role]);
        return res.status(201).json({ message: '用户注册成功', userId: result.insertId });
    }
    catch (err) {
        // MySQL 唯一键冲突
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '该邮箱已被注册' });
        }
        console.error('Register Error:', err);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
