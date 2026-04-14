import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
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
import {
  EmailVerificationError,
  sendEmailVerificationCode,
  verifyEmailCode,
} from '../services/emailVerificationService';

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

const handleEmailVerificationError = (res: Response, error: unknown) => {
  if (error instanceof EmailVerificationError) {
    return res.status(error.status || 400).json({
      error: error.message,
      code: error.code,
      ...error.details,
    });
  }

  console.error('Email verification error:', error);
  return res.status(500).json({
    error: '服务器错误，请稍后再试',
    code: 'EMAIL_CODE_UNKNOWN_ERROR',
  });
};

router.post(
  '/send-email-code',
  [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('purpose').isIn(['register']).withMessage('验证码用途无效'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payload = await sendEmailVerificationCode({
        email: String(req.body?.email || ''),
        purpose: String(req.body?.purpose || ''),
        ip: String(req.ip || '').slice(0, 45) || null,
        userAgent: String(req.get('user-agent') || '').slice(0, 255) || null,
      });

      return res.json(payload);
    } catch (error) {
      return handleEmailVerificationError(res, error);
    }
  }
);

router.post(
  '/verify-email-code',
  [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('purpose').isIn(['register']).withMessage('验证码用途无效'),
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('请输入 6 位验证码')
      .bail()
      .matches(/^\d{6}$/)
      .withMessage('验证码格式不正确'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payload = await verifyEmailCode({
        email: String(req.body?.email || ''),
        purpose: String(req.body?.purpose || ''),
        code: String(req.body?.code || ''),
      });

      return res.json(payload);
    } catch (error) {
      return handleEmailVerificationError(res, error);
    }
  }
);

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
