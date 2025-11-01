import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db';

const router = Router();

interface UserRow {
  id: number;
  username: string | null;
  email: string;
  password_hash: string;
  role: 'mentor' | 'student';
}

router.post(
  '/',
  [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('password').notEmpty().withMessage('密码不能为空'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body as { email: string; password: string };

    try {
      const rows = await query<UserRow[]>(
        'SELECT id, username, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = rows[0];
      if (!user) {
        return res.status(401).json({ error: '邮箱或密码错误' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: '邮箱或密码错误' });
      }

      const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
      const token = jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '1h' });

      return res.json({
        message: '登录成功',
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error('Login Error:', err);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
