import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

export interface AdminAuthUser {
  adminId: number;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminAuthUser;
    }
  }
}

type AdminJwtPayload = {
  adminId?: number;
  scope?: string;
};

export const getAdminJwtSecret = () => process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_secret_change_me';

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: '后台未登录' });

  try {
    const payload = jwt.verify(token, getAdminJwtSecret()) as AdminJwtPayload;
    const adminId = Number(payload?.adminId || 0);
    if (!adminId || payload?.scope !== 'admin') return res.status(401).json({ error: '后台登录已失效' });

    const rows = await query<Array<{ id: number; username: string; is_active: number | boolean }>>(
      'SELECT id, username, is_active FROM admin_users WHERE id = ? LIMIT 1',
      [adminId]
    );
    const admin = rows?.[0];
    if (!admin || !(admin.is_active === 1 || admin.is_active === true)) {
      return res.status(401).json({ error: '后台账号不可用' });
    }

    req.admin = { adminId: Number(admin.id), username: String(admin.username || '') };
    return next();
  } catch (error) {
    return res.status(401).json({ error: '后台登录已失效' });
  }
}
