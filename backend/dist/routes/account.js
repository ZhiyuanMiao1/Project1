"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const router = (0, express_1.Router)();
const getUserById = async (userId) => {
    const rows = await (0, db_1.query)('SELECT id, email, role, salutation FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
};
router.get('/me', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const user = await getUserById(req.user.id);
        if (!user)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        return res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            salutation: user.salutation,
        });
    }
    catch (e) {
        console.error('Account me error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.patch('/me', auth_1.requireAuth, [
    (0, express_validator_1.body)('salutation')
        .optional({ nullable: true })
        .isString()
        .withMessage('称呼格式不正确')
        .trim()
        .isLength({ max: 100 })
        .withMessage('称呼长度需在100字以内'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const current = await getUserById(req.user.id);
        if (!current)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const raw = req.body.salutation;
        const next = typeof raw === 'string' ? raw.trim() : null;
        const normalized = next && next.length > 0 ? next : null;
        await (0, db_1.query)('UPDATE users SET salutation = ? WHERE email = ?', [normalized, current.email]);
        return res.json({
            message: '更新成功',
            salutation: normalized,
        });
    }
    catch (e) {
        console.error('Account update error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
