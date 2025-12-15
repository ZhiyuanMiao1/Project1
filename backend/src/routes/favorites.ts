import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { InsertResult, query as dbQuery } from '../db';

type Role = 'student' | 'mentor';

const router = Router();

const DEFAULT_COLLECTION_NAME = '默认收藏夹';

const normalizeRole = (value: any, fallback: Role): Role => {
  return value === 'mentor' || value === 'student' ? value : fallback;
};

type UserRow = {
  id: number;
  email: string;
  role: Role;
  mentor_approved?: number | boolean;
  username?: string | null;
  password_hash: string;
};

const getUserById = async (userId: number): Promise<UserRow | null> => {
  const rows = await dbQuery<UserRow[]>(
    'SELECT id, email, role, mentor_approved, username, password_hash FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

/**
 * 根据当前登录用户 + 请求的 role 决定操作哪个身份的收藏
 * - 若请求的 role 与当前 token 相同，直接用当前用户
 * - 若不同，则基于 email 查找同邮箱下的对应身份账号（为方便用户无需重新登录）
 * - 导师身份仍需通过审核
 */
async function resolveTargetUser(req: Request, res: Response, requestedRole: Role): Promise<{ userId: number; role: Role } | null> {
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

    if (current.role === requestedRole) {
      if (requestedRole === 'mentor') {
        const approved = current.mentor_approved === 1 || current.mentor_approved === true;
        if (!approved) {
          res.status(403).json({ error: '导师审核中，暂不可使用导师收藏', reason: 'mentor_not_approved' });
          return null;
        }
      }
      return { userId: current.id, role: current.role };
    }

    // 查找同邮箱的另一身份账号，让用户无需切换登录
    const siblings = await dbQuery<UserRow[]>(
      'SELECT id, email, role, mentor_approved, username, password_hash FROM users WHERE email = ? AND role = ? LIMIT 1',
      [current.email, requestedRole]
    );
    if (!siblings.length) {
      if (requestedRole === 'student') {
        try {
          const created = await dbQuery<InsertResult>(
            'INSERT INTO users (username, email, password_hash, role, mentor_approved) VALUES (?, ?, ?, ?, ?)',
            [current.username || null, current.email, current.password_hash, 'student', 0]
          );
          return { userId: created.insertId, role: 'student' };
        } catch (err: any) {
          if (err && err.code === 'ER_DUP_ENTRY') {
            const fallback = await dbQuery<UserRow[]>(
              'SELECT id, email, role, mentor_approved, username, password_hash FROM users WHERE email = ? AND role = ? LIMIT 1',
              [current.email, 'student']
            );
            if (fallback[0]) {
              return { userId: fallback[0].id, role: fallback[0].role };
            }
          }
          console.error('Auto-create student identity failed:', err);
          res.status(500).json({ error: '服务器错误，请稍后再试' });
          return null;
        }
      }
      const msg = '当前账号未开通导师身份';
      res.status(403).json({ error: msg, reason: 'role_not_available' });
      return null;
    }
    const target = siblings[0];
    if (requestedRole === 'mentor') {
      const approved = target.mentor_approved === 1 || target.mentor_approved === true;
      if (!approved) {
        res.status(403).json({ error: '导师审核中，暂不可使用导师收藏', reason: 'mentor_not_approved' });
        return null;
      }
    }
    return { userId: target.id, role: target.role };
  } catch (e) {
    console.error('Resolve target user failed:', e);
    res.status(500).json({ error: '服务器错误，请稍后再试' });
    return null;
  }
}

async function ensureDefaultCollection(userId: number, role: Role): Promise<number> {
  const result = await dbQuery<InsertResult>(
    `INSERT INTO favorite_collections (user_id, role, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [userId, role, DEFAULT_COLLECTION_NAME]
  );
  return result.insertId;
}

// 获取收藏夹列表（按身份隔离）
router.get(
  '/collections',
  requireAuth,
  [query('role').optional().isIn(['student', 'mentor'])],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestedRole = normalizeRole(req.query.role, req.user!.role as Role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    try {
      await ensureDefaultCollection(target.userId, target.role);
      const rows = await dbQuery<any[]>(
        `SELECT id, name, role, created_at
         FROM favorite_collections
         WHERE user_id = ? AND role = ?
         ORDER BY (name = ?) DESC, created_at DESC, id DESC`,
        [target.userId, target.role, DEFAULT_COLLECTION_NAME]
      );

      const collections = rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role as Role,
        createdAt: row.created_at,
        isDefault: row.name === DEFAULT_COLLECTION_NAME,
      }));

      return res.json({ collections });
    } catch (e) {
      console.error('List favorite collections error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

// 创建收藏夹
router.post(
  '/collections',
  requireAuth,
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('收藏夹名称长度需在1-100之间'),
    body('role').optional().isIn(['student', 'mentor']).withMessage('角色无效'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body as { name: string; role?: Role };
    if (name?.trim() === DEFAULT_COLLECTION_NAME) {
      return res.status(400).json({ error: '该名称为系统默认收藏夹名称，请使用其他名称' });
    }
    const requestedRole = normalizeRole((req.body as any).role, req.user!.role as Role);

    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    try {
      await ensureDefaultCollection(target.userId, target.role);
      const result = await dbQuery<InsertResult>(
        'INSERT INTO favorite_collections (user_id, role, name) VALUES (?, ?, ?)',
        [target.userId, target.role, name.trim()]
      );

      const rows = await dbQuery<any[]>(
        'SELECT id, name, role, created_at FROM favorite_collections WHERE id = ? LIMIT 1',
        [result.insertId]
      );
      const created = rows[0] || null;

      return res.status(201).json({
        message: '收藏夹已创建',
        collection: created
          ? {
              id: created.id,
              name: created.name,
              role: created.role as Role,
              createdAt: created.created_at,
              isDefault: created.name === DEFAULT_COLLECTION_NAME,
            }
          : {
              id: result.insertId,
              name,
              role: requestedRole,
              createdAt: new Date().toISOString(),
              isDefault: false,
            },
      });
    } catch (e: any) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: '同名收藏夹已存在' });
      }
      console.error('Create favorite collection error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

// 删除收藏夹
router.delete(
  '/collections/:id',
  requireAuth,
  [param('id').isInt({ gt: 0 }).withMessage('收藏夹ID无效')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = Number(req.params.id);

    try {
      const rows = await dbQuery<any[]>(
        'SELECT id, user_id, role, name FROM favorite_collections WHERE id = ? LIMIT 1',
        [id]
      );
      const found = rows[0];
      if (!found) {
        return res.status(404).json({ error: '未找到该收藏夹' });
      }
      if (found.name === DEFAULT_COLLECTION_NAME) {
        return res.status(403).json({ error: '默认收藏夹不可删除' });
      }

      const target = await resolveTargetUser(req, res, normalizeRole(found.role, req.user!.role as Role));
      if (!target) return;

      if (found.user_id !== target.userId || found.role !== target.role) {
        return res.status(404).json({ error: '未找到该收藏夹' });
      }

      await dbQuery('DELETE FROM favorite_collections WHERE id = ? AND user_id = ?', [id, target.userId]);
      return res.json({ message: '收藏夹已删除', id });
    } catch (e) {
      console.error('Delete favorite collection error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

// 收藏/取消收藏（默认收藏到「默认收藏夹」）
router.post(
  '/toggle',
  requireAuth,
  [
    body('itemType').isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    body('itemId').isString().trim().isLength({ min: 1, max: 100 }).withMessage('itemId无效'),
    body('role').optional().isIn(['student', 'mentor']).withMessage('角色无效'),
    body('payload').optional(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemType, itemId, payload } = req.body as { itemType: string; itemId: string; role?: Role; payload?: any };
    const requestedRole = normalizeRole((req.body as any).role, req.user!.role as Role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    try {
      const defaultCollectionId = await ensureDefaultCollection(target.userId, target.role);

      const existedRows = await dbQuery<any[]>(
        `SELECT id
         FROM favorite_items
         WHERE user_id = ? AND role = ? AND item_type = ? AND item_id = ?
         LIMIT 1`,
        [target.userId, target.role, itemType, itemId]
      );

      if (existedRows.length) {
        const existedId = existedRows[0].id;
        await dbQuery('DELETE FROM favorite_items WHERE id = ? AND user_id = ?', [existedId, target.userId]);
        return res.json({ favorited: false, removedId: existedId });
      }

      const payloadJson = typeof payload === 'undefined' ? null : JSON.stringify(payload);
      const insert = await dbQuery<InsertResult>(
        `INSERT INTO favorite_items (user_id, role, collection_id, item_type, item_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [target.userId, target.role, defaultCollectionId, itemType, itemId, payloadJson]
      );

      return res.status(201).json({
        favorited: true,
        item: {
          id: insert.insertId,
          collectionId: defaultCollectionId,
          itemType,
          itemId,
        },
      });
    } catch (e) {
      console.error('Toggle favorite item error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

// 获取收藏条目（可按收藏夹过滤）
router.get(
  '/items',
  requireAuth,
  [
    query('role').optional().isIn(['student', 'mentor']),
    query('collectionId').optional().isInt({ gt: 0 }).withMessage('collectionId无效'),
    query('itemType').optional().isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    query('idsOnly').optional().isIn(['1', '0', 'true', 'false']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestedRole = normalizeRole(req.query.role, req.user!.role as Role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target) return;

    const collectionId = req.query.collectionId ? Number(req.query.collectionId) : null;
    const itemType = req.query.itemType ? String(req.query.itemType) : null;
    const idsOnly = (() => {
      const raw = req.query.idsOnly;
      if (raw === '1' || raw === 'true') return true;
      return false;
    })();

    try {
      await ensureDefaultCollection(target.userId, target.role);

      if (collectionId) {
        const collectionRows = await dbQuery<any[]>(
          'SELECT id FROM favorite_collections WHERE id = ? AND user_id = ? AND role = ? LIMIT 1',
          [collectionId, target.userId, target.role]
        );
        if (!collectionRows.length) {
          return res.status(404).json({ error: '未找到该收藏夹' });
        }
      }

      const params: any[] = [target.userId, target.role];
      const where: string[] = ['fi.user_id = ?', 'fi.role = ?'];

      if (collectionId) {
        where.push('fi.collection_id = ?');
        params.push(collectionId);
      }
      if (itemType) {
        where.push('fi.item_type = ?');
        params.push(itemType);
      }

      const rows = await dbQuery<any[]>(
        `SELECT fi.id, fi.collection_id, fi.item_type, fi.item_id, fi.payload_json, fi.created_at
         FROM favorite_items fi
         INNER JOIN favorite_collections fc ON fc.id = fi.collection_id
         WHERE ${where.join(' AND ')} AND fc.user_id = ? AND fc.role = ?
         ORDER BY fi.created_at DESC, fi.id DESC`,
        [...params, target.userId, target.role]
      );

      if (idsOnly) {
        return res.json({ ids: rows.map((r) => String(r.item_id)) });
      }

      const items = rows.map((row) => {
        let payload: any = null;
        const raw = row.payload_json;
        if (raw) {
          try {
            payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch {
            payload = null;
          }
        }
        return {
          id: row.id,
          collectionId: row.collection_id,
          itemType: row.item_type,
          itemId: String(row.item_id),
          payload,
          createdAt: row.created_at,
        };
      });

      return res.json({ items });
    } catch (e) {
      console.error('List favorite items error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

// 删除单个收藏条目
router.delete(
  '/items/:id',
  requireAuth,
  [param('id').isInt({ gt: 0 }).withMessage('收藏条目ID无效')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = Number(req.params.id);

    try {
      const rows = await dbQuery<any[]>(
        `SELECT fi.id, fi.user_id, fi.role
         FROM favorite_items fi
         WHERE fi.id = ?
         LIMIT 1`,
        [id]
      );
      const found = rows[0];
      if (!found) {
        return res.status(404).json({ error: '未找到该收藏条目' });
      }

      const target = await resolveTargetUser(req, res, normalizeRole(found.role, req.user!.role as Role));
      if (!target) return;

      if (found.user_id !== target.userId || found.role !== target.role) {
        return res.status(404).json({ error: '未找到该收藏条目' });
      }

      await dbQuery('DELETE FROM favorite_items WHERE id = ? AND user_id = ?', [id, target.userId]);
      return res.json({ message: '已移除收藏', id });
    } catch (e) {
      console.error('Delete favorite item error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
