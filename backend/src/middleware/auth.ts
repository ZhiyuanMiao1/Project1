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

export async function readAuthUserFromRequest(req: Request): Promise<{ user?: AuthUser; error?: { status: number; message: string } }> {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: { status: 401, message: '未授权' } };
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const payload = jwt.verify(token, secret) as AuthUser & { exp?: number };
    if (await isUserSuspended(Number(payload.id))) {
      return { error: { status: 403, message: '账号已被平台暂停使用，请联系 Mentory 支持' } };
    }
    return { user: { id: payload.id, role: payload.role } };
  } catch (e) {
    return { error: { status: 401, message: '登录已失效，请重新登录' } };
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const result = await readAuthUserFromRequest(req);
  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  req.user = result.user;
  return next();
}
