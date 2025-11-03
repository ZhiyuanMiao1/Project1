import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';

const router = Router();

// GET /api/mentor/cards — only mentors can access
router.get('/cards', requireAuth, async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'mentor') {
    return res.status(403).json({ error: '仅导师可访问' });
  }

  // 审核 gating：仅审核通过的导师可查看卡片
  try {
    const rows = await query<any[]>('SELECT mentor_approved FROM users WHERE id = ? LIMIT 1', [req.user!.id]);
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) {
      return res.status(403).json({ error: '导师审核中' });
    }
  } catch (e) {
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }

  // Demo data; replace with DB query if needed
  const cards = [
    { id: 1,  degree: 'PhD',  school: '哈佛大学',   courses: ['编程基础'],       timezone: 'UTC+8 (北京)',  expectedDuration: '2小时',   expectedTime: '2025-02-01', courseType: '选课指导' },
    { id: 2,  degree: '硕士', school: '斯坦福大学', courses: ['机器学习'],       timezone: 'UTC-7 (加州)',  expectedDuration: '1.5小时', expectedTime: '2025-02-02', courseType: '作业项目' },
    { id: 3,  degree: '硕士', school: '麻省理工学院', courses: ['数据结构与算法'], timezone: 'UTC-5 (纽约)',   expectedDuration: '2小时',   expectedTime: '2025-02-03', courseType: '课前预习' },
    { id: 4,  degree: 'PhD',  school: '牛津大学',   courses: ['AI 大模型'],     timezone: 'UTC+0 (伦敦)',  expectedDuration: '2小时',   expectedTime: '2025-02-04', courseType: '期末复习' },
    { id: 5,  degree: '硕士', school: '剑桥大学',   courses: ['数据分析'],       timezone: 'UTC+1 (柏林)',  expectedDuration: '1小时',   expectedTime: '2025-02-05', courseType: '选课指导' },
    { id: 6,  degree: 'PhD',  school: '清华大学',   courses: ['高等数学'],       timezone: 'UTC+8 (北京)',  expectedDuration: '2小时',   expectedTime: '2025-02-06', courseType: '作业项目' },
    { id: 7,  degree: '硕士', school: '北京大学',   courses: ['概率与统计'],     timezone: 'UTC+8 (北京)',  expectedDuration: '1.5小时', expectedTime: '2025-02-07', courseType: '课前预习' },
    { id: 8,  degree: 'PhD',  school: '加州大学伯克利分校', courses: ['软件工程'], timezone: 'UTC-8 (加州)',  expectedDuration: '2小时',   expectedTime: '2025-02-08', courseType: '毕业论文' },
    { id: 9,  degree: '硕士', school: '帝国理工学院', courses: ['物理学'],       timezone: 'UTC+0 (伦敦)',  expectedDuration: '2小时',   expectedTime: '2025-02-09', courseType: '其它类型' },
    { id: 10, degree: '硕士', school: '多伦多大学', courses: ['生命科学'],       timezone: 'UTC-5 (多伦多)', expectedDuration: '1小时',   expectedTime: '2025-02-10', courseType: '选课指导' },
    { id: 11, degree: 'PhD',  school: '苏黎世联邦理工', courses: ['网络安全'],     timezone: 'UTC+1 (苏黎世)', expectedDuration: '1.5小时', expectedTime: '2025-02-11', courseType: '作业项目' },
    { id: 12, degree: '硕士', school: '新加坡国立大学', courses: ['经济学'],       timezone: 'UTC+8 (新加坡)', expectedDuration: '2小时',  expectedTime: '2025-02-12', courseType: '课前预习' },
  ];

  return res.json({ cards });
});

export default router;
