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
  public_id?: string | null;
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

    // 为保证“从哪个页面触发登录不影响结果”，此处不再依赖前端传入的 role
    // 仅基于 email + password 进行身份判定；如同一邮箱下多条记录均匹配，优先 mentor
    const { email, password } = req.body as { email: string; password: string };

    try {
      let user: UserRow | undefined;
      // 统一按邮箱取出所有候选账号
      const rows = await query<UserRow[]>(
        'SELECT id, username, email, password_hash, role, public_id FROM users WHERE email = ?',
        [email]
      );
      if (rows.length === 0) {
        return res.status(401).json({ error: '邮箱或密码错误' });
      }
      // 遍历比对，收集所有匹配的账号
      const matches: UserRow[] = [];
      for (const row of rows) {
        try {
          const ok = await bcrypt.compare(password, row.password_hash);
          if (ok) matches.push(row);
        } catch {}
      }
      if (matches.length === 0) {
        return res.status(401).json({ error: '邮箱或密码错误' });
      }
      if (matches.length === 1) {
        user = matches[0];
      } else {
        // 多条均匹配：为消除“入口依赖”，采用固定优先级（mentor > student）
        user = matches.find(m => m.role === 'mentor') || matches[0];
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
        user: { id: user.id, username: user.username, email: user.email, role: user.role, public_id: user.public_id || null },
      });
    } catch (err) {
      console.error('Login Error:', err);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
