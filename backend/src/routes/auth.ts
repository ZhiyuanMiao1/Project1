import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  clearRefreshTokenCookie,
  getRefreshTokenFromReq,
  RefreshAuthError,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshTokenCookie,
} from '../auth/refreshTokens';

type Role = 'mentor' | 'student';

type UserRow = {
  id: number;
  username: string | null;
  email: string;
};

type RoleRow = {
  role: Role;
  public_id: string;
  mentor_approved: number | boolean;
};

const router = Router();

router.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromReq(req);
  if (!refreshToken) {
    clearRefreshTokenCookie(res);
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const rotated = await rotateRefreshToken({
      refreshToken,
      userAgent: String(req.get('user-agent') || '').slice(0, 255) || null,
      ip: String(req.ip || '').slice(0, 45) || null,
    });

    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const accessToken = jwt.sign({ id: rotated.userId, role: rotated.role }, secret, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });

    setRefreshTokenCookie(res, rotated.newRefreshToken, rotated.slidingExpiresAt.getTime() - Date.now());

    const users = await query<UserRow[]>(
      'SELECT id, username, email FROM users WHERE id = ? LIMIT 1',
      [rotated.userId]
    );
    const user = users[0];
    if (!user) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ error: '未授权' });
    }

    const roles = await query<RoleRow[]>(
      'SELECT role, public_id, mentor_approved FROM user_roles WHERE user_id = ?',
      [rotated.userId]
    );
    const roleRow = roles.find((r) => r.role === rotated.role) || roles[0];
    const publicId = roleRow?.public_id || null;

    return res.json({
      message: '刷新成功',
      token: accessToken,
      user: { id: user.id, username: user.username, email: user.email, role: rotated.role, public_id: publicId },
      roles: roles.map((r) => ({ role: r.role, public_id: r.public_id, mentor_approved: r.mentor_approved })),
    });
  } catch (e: any) {
    if (e instanceof RefreshAuthError) {
      clearRefreshTokenCookie(res);
      return res.status(e.status || 401).json({ error: e.message || '登录已失效，请重新登录' });
    }
    console.error('Refresh Error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromReq(req);
  try {
    if (refreshToken) {
      await revokeRefreshToken({ refreshToken, reason: 'logout' });
    }
  } catch (e) {
    console.error('Logout Error:', e);
  } finally {
    clearRefreshTokenCookie(res);
  }
  return res.json({ message: '退出登录成功' });
});

export default router;

