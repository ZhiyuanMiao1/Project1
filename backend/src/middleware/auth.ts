import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isUserSuspended } from '../services/userStatus';

export interface AuthUser {
  id: number;
  role: 'mentor' | 'student';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const payload = jwt.verify(token, secret) as AuthUser & { exp?: number };
    if (await isUserSuspended(Number(payload.id))) {
      return res.status(403).json({ error: '账号已被平台暂停使用，请联系 Mentory 支持' });
    }
    req.user = { id: payload.id, role: payload.role };
    return next();
  } catch (e) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }
}
