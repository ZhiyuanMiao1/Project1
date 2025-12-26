import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../db';

const router = Router();

type Role = 'mentor' | 'student';

interface AccountRow {
  id: number;
  username: string | null;
  email: string;
  password_hash: string;
}

interface RoleRow {
  role: Role;
  public_id: string;
  mentor_approved: number | boolean;
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
      const accounts = await query<AccountRow[]>(
        'SELECT id, username, email, password_hash FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const account = accounts[0];
      if (!account) return res.status(401).json({ error: '邮箱或密码错误' });

      const isMatch = await bcrypt.compare(password, account.password_hash);
      if (!isMatch) return res.status(401).json({ error: '邮箱或密码错误' });

      // 读取该账号已开通的角色；若没有任何角色，默认补一个 student 角色
      let roles = await query<RoleRow[]>(
        'SELECT role, public_id, mentor_approved FROM user_roles WHERE user_id = ?',
        [account.id]
      );
      if (!roles.length) {
        await query(
          'INSERT INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, ?, ?, ?)',
          [account.id, 'student', 0, '']
        );
        roles = await query<RoleRow[]>(
          'SELECT role, public_id, mentor_approved FROM user_roles WHERE user_id = ?',
          [account.id]
        );
      }

      const preferred: Role = roles.some((r) => r.role === 'mentor') ? 'mentor' : 'student';
      const roleRow = roles.find((r) => r.role === preferred) || roles[0];
      const activeRole: Role = roleRow?.role === 'mentor' || roleRow?.role === 'student' ? roleRow.role : 'student';
      const publicId = roleRow?.public_id || null;

      const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
      const token = jwt.sign({ id: account.id, role: activeRole }, secret, { expiresIn: '1h' });

      return res.json({
        message: '登录成功',
        token,
        user: { id: account.id, username: account.username, email: account.email, role: activeRole, public_id: publicId },
        roles: roles.map((r) => ({ role: r.role, public_id: r.public_id, mentor_approved: r.mentor_approved })),
      });
    } catch (err) {
      console.error('Login Error:', err);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
