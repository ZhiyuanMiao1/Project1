import jwt from 'jsonwebtoken';

type ClassroomObserverTokenPayload = {
  scope?: string;
  courseId?: number | string;
  adminId?: number | string;
};

const OBSERVER_SCOPE = 'classroom-observer';
const OBSERVER_TOKEN_EXPIRES_IN = '2h';

const getClassroomObserverSecret = () => (
  process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_secret_change_me'
);

export const createClassroomObserverToken = (courseId: number, adminId: number) => (
  jwt.sign(
    { scope: OBSERVER_SCOPE, courseId, adminId },
    getClassroomObserverSecret(),
    { expiresIn: OBSERVER_TOKEN_EXPIRES_IN }
  )
);

export const verifyClassroomObserverToken = (token: unknown, courseId: number) => {
  const rawToken = typeof token === 'string' ? token.trim() : '';
  if (!rawToken) return null;

  try {
    const payload = jwt.verify(rawToken, getClassroomObserverSecret()) as ClassroomObserverTokenPayload;
    const payloadCourseId = Number(payload?.courseId || 0);
    const adminId = Number(payload?.adminId || 0);
    if (payload?.scope !== OBSERVER_SCOPE || payloadCourseId !== courseId || !adminId) return null;
    return { courseId: payloadCourseId, adminId };
  } catch {
    return null;
  }
};
