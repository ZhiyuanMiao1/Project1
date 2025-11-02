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
    (0, express_validator_1.body)('role').optional().isIn(['mentor', 'student']).withMessage('角色无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password, role } = req.body;
    try {
        let user;
        // 统一按邮箱取出所有候选账号；如提供了 role，则优先尝试该角色，但不阻止回退
        const rows = await (0, db_1.query)('SELECT id, username, email, password_hash, role FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }
        // 若指定了 role，则把该角色的账号排到最前面尝试
        const ordered = role
            ? [...rows.filter(r => r.role === role), ...rows.filter(r => r.role !== role)]
            : rows;
        for (const row of ordered) {
            try {
                const ok = await bcryptjs_1.default.compare(password, row.password_hash);
                if (ok) {
                    user = row;
                    break;
                }
            }
            catch (_e) {
                // 忽略单条比对异常，继续尝试其他角色
            }
        }
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
