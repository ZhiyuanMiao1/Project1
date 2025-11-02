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
    body('role').optional().isIn(['mentor', 'student']).withMessage('角色无效'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role } = req.body as { email: string; password: string; role?: 'mentor' | 'student' };

    try {
      let user: UserRow | undefined;
      // 统一按邮箱取出所有候选账号；如提供了 role，则优先尝试该角色，但不阻止回退
      const rows = await query<UserRow[]>(
        'SELECT id, username, email, password_hash, role FROM users WHERE email = ?',
        [email]
      );
      if (rows.length === 0) {
        return res.status(401).json({ error: '邮箱或密码错误' });
      }
      // 若指定了 role，则把该角色的账号排到最前面尝试
      const ordered = role
        ? [...rows.filter(r => r.role === role), ...rows.filter(r => r.role !== role)]
        : rows;
      for (const row of ordered) {
        try {
          const ok = await bcrypt.compare(password, row.password_hash);
          if (ok) {
            user = row;
            break;
          }
        } catch (_e) {
          // 忽略单条比对异常，继续尝试其他角色
        }
      }
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
