import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/mentor/cards — only mentors can access
router.get('/cards', requireAuth, async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'mentor') {
    return res.status(403).json({ error: '仅导师可访问' });
  }

  // Demo data; replace with DB query if needed
  const cards = [
    { id: 1, degree: 'PhD', school: '哈佛大学', courses: ['Python编程'], timezone: 'UTC+8 (北京)', expectedDuration: '2小时', expectedTime: '2025-02-01', courseType: '选课指导' },
    { id: 2, degree: '硕士', school: '斯坦福大学', courses: ['深度学习'], timezone: 'UTC-7 (加州)', expectedDuration: '1.5小时', expectedTime: '2025-02-02', courseType: '作业项目' },
  ];

  return res.json({ cards });
});

export default router;

