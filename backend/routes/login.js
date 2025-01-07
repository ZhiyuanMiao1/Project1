const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../db'); // 数据库模块

router.post('/', [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('password').notEmpty().withMessage('密码不能为空')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, 'your_jwt_secret', { expiresIn: '1h' });
        res.json({ message: '登录成功', token });
    } catch (err) {
        res.status(500).json({ error: '服务器错误，请稍后再试。' });
    }
});

module.exports = router;
