import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { InsertResult, query as dbQuery } from '../db';

type Role = 'student' | 'mentor';

type UserRow = {
  id: number;
  email: string;
  username?: string | null;
};

const router = Router();

const normalizeRole = (value: any, fallback: Role): Role => {
  return value === 'mentor' || value === 'student' ? value : fallback;
};

const getUserById = async (userId: number): Promise<UserRow | null> => {
  const rows = await dbQuery<UserRow[]>(
    'SELECT id, email, username FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

async function resolveTargetUser(
  req: Request,
  res: Response,
  requestedRole: Role
): Promise<{ userId: number; role: Role } | null> {
  if (!req.user) {
    res.status(401).json({ error: '未授权' });
    return null;
  }

  try {
    const current = await getUserById(req.user.id);
    if (!current) {
      res.status(401).json({ error: '登录状态异常，请重新登录' });
      return null;
    }

    const roleRows = await dbQuery<any[]>(
      'SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1',
      [current.id, requestedRole]
    );

    if (!roleRows.length) {
      if (requestedRole === 'student') {
        try {
          await dbQuery(
            'INSERT IGNORE INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, ?, ?, ?)',
            [current.id, 'student', 0, '']
          );
          return { userId: current.id, role: 'student' };
        } catch (err) {
          console.error('Auto-create student role failed:', err);
          res.status(500).json({ error: '服务器错误，请稍后再试' });
          return null;
        }
      }

      res.status(403).json({ error: '当前账号未开通导师身份', reason: 'role_not_available' });
      return null;
    }

    if (requestedRole === 'mentor') {
      const approved = roleRows[0]?.mentor_approved === 1 || roleRows[0]?.mentor_approved === true;
      if (!approved) {
        res.status(403).json({ error: '导师审核中，暂不可使用导师最近浏览', reason: 'mentor_not_approved' });
        return null;
      }
    }

    return { userId: current.id, role: requestedRole };
  } catch (e) {
    console.error('Resolve target user failed:', e);
    res.status(500).json({ error: '服务器错误，请稍后再试' });
    return null;
  }
}

const parsePayload = (raw: any) => {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

router.post(
  '/record',
  requireAuth,
  [
    body('role').optional().isIn(['student', 'mentor']).withMessage('角色无效'),
    body('itemType').isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    body('itemId').isString().trim().isLength({ min: 1, max: 100 }).withMessage('itemId无效'),
    body('payload').optional(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemType, itemId, payload } = req.body as {
      role?: Role;
      itemType: string;
      itemId: string;
      payload?: any;
    };
    const requestedRole = normalizeRole((req.body as any).role, req.user!.role as Role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    try {
      const payloadJson = typeof payload === 'undefined' ? null : JSON.stringify(payload);
      const result = await dbQuery<InsertResult>(
        `INSERT INTO recent_visits (user_id, role, item_type, item_id, payload_json, visited_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           payload_json = COALESCE(VALUES(payload_json), payload_json),
           visited_at = CURRENT_TIMESTAMP`,
        [target.userId, target.role, itemType.trim(), itemId.trim(), payloadJson]
      );

      const rows = await dbQuery<any[]>(
        `SELECT id, role, item_type, item_id, payload_json, visited_at, created_at, updated_at
         FROM recent_visits
         WHERE id = ?
         LIMIT 1`,
        [result.insertId]
      );
      const row = rows[0];

      return res.status(201).json({
        visit: row
          ? {
              id: row.id,
              role: row.role as Role,
              itemType: row.item_type,
              itemId: String(row.item_id),
              payload: parsePayload(row.payload_json),
              visitedAt: row.visited_at,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }
          : {
              id: result.insertId,
              role: target.role,
              itemType: itemType.trim(),
              itemId: itemId.trim(),
              payload: payload ?? null,
            },
      });
    } catch (e: any) {
      console.error('Record recent visit error:', e);
      const message = String(e?.message || '');
      if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
        return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
      }
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.get(
  '/items',
  requireAuth,
  [
    query('role').optional().isIn(['student', 'mentor']),
    query('itemType').optional().isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    query('limit').optional().isInt({ gt: 0, lt: 51 }).withMessage('limit无效'),
    query('offset').optional().isInt({ min: 0 }).withMessage('offset无效'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestedRole = normalizeRole(req.query.role, req.user!.role as Role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    const itemType = typeof req.query.itemType === 'string' ? req.query.itemType.trim() : '';
    const limitRaw = Number.parseInt(String(req.query.limit ?? '10'), 10);
    const offsetRaw = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    try {
      const params: any[] = [target.userId, target.role];
      const where: string[] = ['user_id = ?', 'role = ?'];
      if (itemType) {
        where.push('item_type = ?');
        params.push(itemType);
      }

      const rows = await dbQuery<any[]>(
        `SELECT id, role, item_type, item_id, payload_json, visited_at, created_at, updated_at
         FROM recent_visits
         WHERE ${where.join(' AND ')}
         ORDER BY visited_at DESC, id DESC
         LIMIT ${limit + 1} OFFSET ${offset}`,
        params
      );

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items = sliced.map((row) => ({
        id: row.id,
        role: row.role as Role,
        itemType: row.item_type,
        itemId: String(row.item_id),
        payload: parsePayload(row.payload_json),
        visitedAt: row.visited_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return res.json({
        items,
        pagination: {
          limit,
          offset,
          nextOffset: offset + items.length,
          hasMore,
        },
      });
    } catch (e: any) {
      console.error('List recent visits error:', e);
      const message = String(e?.message || '');
      if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
        return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
      }
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.delete(
  '/items/:id',
  requireAuth,
  [param('id').isInt({ gt: 0 }).withMessage('最近浏览ID无效')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = Number(req.params.id);

    try {
      const rows = await dbQuery<any[]>(
        'SELECT id, user_id, role FROM recent_visits WHERE id = ? LIMIT 1',
        [id]
      );
      const found = rows[0];
      if (!found) {
        return res.status(404).json({ error: '未找到该最近浏览记录' });
      }

      const target = await resolveTargetUser(req, res, normalizeRole(found.role, req.user!.role as Role));
      if (!target) return;

      if (found.user_id !== target.userId || found.role !== target.role) {
        return res.status(404).json({ error: '未找到该最近浏览记录' });
      }

      await dbQuery('DELETE FROM recent_visits WHERE id = ? AND user_id = ?', [id, target.userId]);
      return res.json({ message: '最近浏览已删除', id });
    } catch (e: any) {
      console.error('Delete recent visit error:', e);
      const message = String(e?.message || '');
      if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
        return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
      }
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
