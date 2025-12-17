"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.get('/ids', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const currentRows = await (0, db_1.query)('SELECT email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const email = currentRows[0]?.email;
        if (!email)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const rows = await (0, db_1.query)("SELECT role, public_id FROM users WHERE email = ? AND role IN ('student','mentor')", [email]);
        let studentId = null;
        let mentorId = null;
        for (const row of rows) {
            if (row.role === 'student')
                studentId = row.public_id;
            if (row.role === 'mentor')
                mentorId = row.public_id;
        }
        return res.json({ studentId, mentorId });
    }
    catch (e) {
        console.error('Account ids error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
