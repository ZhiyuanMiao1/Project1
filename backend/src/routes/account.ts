import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query as dbQuery } from '../db';

type Role = 'student' | 'mentor';

type CurrentUserRow = {
  email: string;
};

type PublicIdRow = {
  role: Role;
  public_id: string;
};

const router = Router();

router.get('/ids', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const currentRows = await dbQuery<CurrentUserRow[]>(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const email = currentRows[0]?.email;
    if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

    const rows = await dbQuery<PublicIdRow[]>(
      "SELECT role, public_id FROM users WHERE email = ? AND role IN ('student','mentor')",
      [email]
    );

    let studentId: string | null = null;
    let mentorId: string | null = null;
    for (const row of rows) {
      if (row.role === 'student') studentId = row.public_id;
      if (row.role === 'mentor') mentorId = row.public_id;
    }

    return res.json({ studentId, mentorId });
  } catch (e) {
    console.error('Account ids error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
