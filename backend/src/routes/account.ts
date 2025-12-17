import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { InsertResult, query as dbQuery } from '../db';

type Role = 'student' | 'mentor';

type UserRow = {
  id: number;
  email: string;
  role: Role;
  salutation: string | null;
};

const router = Router();

const getUserById = async (userId: number): Promise<UserRow | null> => {
  const rows = await dbQuery<UserRow[]>(
    'SELECT id, email, role, salutation FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: '登录状态异常，请重新登录' });
    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      salutation: user.salutation,
    });
  } catch (e) {
    console.error('Account me error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch(
  '/me',
  requireAuth,
  [
    body('salutation')
      .optional({ nullable: true })
      .isString()
      .withMessage('称呼格式不正确')
      .trim()
      .isLength({ max: 100 })
      .withMessage('称呼长度需在100字以内'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    if (!req.user) return res.status(401).json({ error: '未授权' });

    try {
      const current = await getUserById(req.user.id);
      if (!current) return res.status(401).json({ error: '登录状态异常，请重新登录' });

      const raw = (req.body as any).salutation;
      const next = typeof raw === 'string' ? raw.trim() : null;
      const normalized = next && next.length > 0 ? next : null;

      await dbQuery<InsertResult>(
        'UPDATE users SET salutation = ? WHERE email = ?',
        [normalized, current.email]
      );

      return res.json({
        message: '更新成功',
        salutation: normalized,
      });
    } catch (e) {
      console.error('Account update error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;

