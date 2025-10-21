"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_validator_1 = require("express-validator");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.post('/', [
    (0, express_validator_1.body)('email').isEmail().withMessage('请输入有效的邮箱'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('密码不能为空'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
        const rows = await (0, db_1.query)('SELECT id, username, email, password_hash, role FROM users WHERE email = ? LIMIT 1', [email]);
        const user = rows[0];
        if (!user) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }
        const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, secret, { expiresIn: '1h' });
        return res.json({
            message: '登录成功',
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role },
        });
    }
    catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
