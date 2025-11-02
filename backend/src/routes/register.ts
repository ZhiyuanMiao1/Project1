import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query, InsertResult } from '../db';

const router = Router();

router.post(
  '/',
  [
    body('username').optional().isLength({ min: 3 }).withMessage('用户名至少3个字符'),
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    body('role').isIn(['student', 'mentor']).withMessage('角色无效'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username = null, email, password, role } = req.body as {
      username?: string | null;
      email: string;
      password: string;
      role: 'mentor' | 'student';
    };

    try {
      // 允许同一邮箱分别以 student / mentor 注册各一次
      // 仅当同一角色下已存在该邮箱时，才视为冲突
      const existing = await query<any[]>(
        'SELECT id FROM users WHERE email = ? AND role = ? LIMIT 1',
        [email, role]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await query<InsertResult>(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, role]
      );

      // 读取触发器生成的 public_id 返回给前端
      const inserted = await query<any[]>(
        'SELECT public_id, role FROM users WHERE id = ? LIMIT 1',
        [result.insertId]
      );
      const public_id = inserted?.[0]?.public_id || null;
      const finalRole = inserted?.[0]?.role || role;

      return res.status(201).json({ message: '用户注册成功', userId: result.insertId, public_id, role: finalRole });
    } catch (err: any) {
      // MySQL 唯一键冲突（如 (email, role) 唯一约束 或 public_id 唯一约束）
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: '该邮箱在该角色下已被注册' });
      }
      console.error('Register Error:', err);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
