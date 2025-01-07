const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../db'); // 数据库模块

router.post('/', [
    body('username').isLength({ min: 3 }).withMessage('用户名至少3个字符'),
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    body('role').isIn(['teacher', 'student']).withMessage('角色无效')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await db.query('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', 
            [username, email, hashedPassword, role]);
        res.status(201).json({ message: '用户注册成功！' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误，请稍后再试。' });
    }
});

module.exports = router;
