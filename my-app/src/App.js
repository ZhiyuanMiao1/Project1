import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate, matchPath } from 'react-router-dom';
import './App.css';
import StudentPage from './components/StudentPage/StudentPage';
import MentorPage from './components/MentorPage/MentorPage';
import StudentCourseRequestPage from './pages/StudentCourseRequest/StudentCourseRequestPage';
import MentorProfileEditorPage from './pages/MentorProfileEditor/MentorProfileEditorPage';
import FavoritesPage from './pages/Favorites/FavoritesPage';
import FavoriteCollectionPage from './pages/Favorites/FavoriteCollectionPage';
import CoursesPage from './pages/Courses/CoursesPage';
import MentorCoursesPage from './pages/Courses/MentorCoursesPage';
import MessagesPage from './pages/Messages/MessagesPage';
import RecentVisitsPage from './pages/RecentVisits/RecentVisitsPage';
import AccountSettingsPage from './pages/AccountSettings/AccountSettingsPage';
import MentorDetailPage from './pages/MentorDetail/MentorDetailPage';
import CourseRequestDetailPage from './pages/CourseRequestDetail/CourseRequestDetailPage';
import WalletPage from './pages/Wallet/WalletPage';
import ClassroomPage from './pages/Classroom/ClassroomPage';
import HelpCenterPage from './pages/HelpCenter/HelpCenterPage';
import LessonHoursDialog from './components/LessonHoursDialog/LessonHoursDialog';
import PendingLessonHoursPrompt from './components/PendingLessonHoursPrompt/PendingLessonHoursPrompt';
import api from './api/client';
import { emitMessageUnreadChanged } from './hooks/useMessageUnreadSummary';
import usePendingLessonHours, { emitPendingLessonHoursChanged } from './hooks/usePendingLessonHours';
import { AUTH_SESSION_EXPIRED_EVENT } from './utils/auth';
import { getAuthToken } from './utils/authStorage';
import { formatQuarterHourValue, normalizeQuarterHourValue } from './utils/lessonHours';
import { inferRequiredRoleFromPath, setPostLoginRedirect } from './utils/postLoginRedirect';

const BRAND_NAME = 'Mentory';

const ROUTE_TITLE_MAP = [
  { path: '/student', title: 'Mentory' },
  { path: '/student/mentors/:mentorId', title: '导师主页' },
  { path: '/student/course-request', title: '发布课程需求' },
  { path: '/student/favorites', title: '收藏' },
  { path: '/student/favorites/:collectionId', title: '收藏夹' },
  { path: '/student/recent-visits', title: '最近浏览' },
  { path: '/student/courses', title: '课程' },
  { path: '/student/messages', title: '消息' },
  { path: '/student/wallet', title: '钱包' },
  { path: '/student/settings', title: '设置' },
  { path: '/student/help', title: '帮助中心' },
  { path: '/mentor', title: 'Mentory' },
  { path: '/mentor/profile-editor', title: '编辑个人名片' },
  { path: '/mentor/courses', title: '导师课程' },
  { path: '/mentor/requests/:requestId', title: '课程需求详情' },
  { path: '/mentor/messages', title: '消息' },
  { path: '/mentor/settings', title: '设置' },
  { path: '/mentor/help', title: '帮助中心' },
  { path: '/classroom/:courseId', title: '课堂' },
];

const normalizePathname = (pathname) => {
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/+$/, '') || '/';
};

const getDocumentTitleByPath = (pathname) => {
  const normalizedPath = normalizePathname(pathname);
  const matchedRoute = ROUTE_TITLE_MAP.find((route) =>
    Boolean(matchPath({ path: route.path, end: true }, normalizedPath))
  );
  if (!matchedRoute) {
    return BRAND_NAME;
  }
  return matchedRoute.title;
};

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const getCurrentPath = () => {
  if (typeof window === 'undefined') return '/';
  try {
    const { pathname, search, hash } = window.location;
    return `${pathname || ''}${search || ''}${hash || ''}` || '/';
  } catch {
    return '/';
  }
};

function RouteTitleManager() {
  const location = useLocation();

  useEffect(() => {
    document.title = getDocumentTitleByPath(location.pathname);
  }, [location.pathname]);

  return null;
}

function AuthSessionManager() {
  const navigate = useNavigate();
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = (message) => {
    const next = safeText(message) || '登录已失效，请重新登录';
    setToastMessage(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 2600);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onSessionExpired = (event) => {
      const detail = event?.detail || {};
      const from = safeText(detail.from) || getCurrentPath();
      const requiredRole = safeText(detail.requiredRole) || inferRequiredRoleFromPath(from);
      const message = safeText(detail.message) || '登录已失效，请重新登录';

      showToast(message);
      setPostLoginRedirect(from, requiredRole);

      const currentPath = safeText(typeof window !== 'undefined' ? window.location.pathname : '');
      const fallback = requiredRole === 'mentor' ? '/mentor' : '/student';
      const needsRedirect = currentPath.startsWith('/classroom') || (!currentPath.startsWith('/student') && !currentPath.startsWith('/mentor'));
      if (needsRedirect && currentPath !== fallback) {
        navigate(fallback, { replace: true });
      }

      window.setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from, requiredRole } }));
        } catch {}
      }, 0);
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [navigate]);

  if (!toastMessage) return null;
  return (
    <div className="auth-session-toast" role="status" aria-live="polite">
      {toastMessage}
    </div>
  );
}

function PendingLessonHoursGate() {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeValue, setDisputeValue] = useState('1');
  const { items, refresh } = usePendingLessonHours(isLoggedIn);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(Boolean(event.detail.isLoggedIn));
      } else {
        setIsLoggedIn(Boolean(getAuthToken()));
      }
    };

    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setBusyId('');
      setError('');
      return;
    }
    refresh();
  }, [isLoggedIn, location.pathname, refresh]);

  useEffect(() => {
    if (!items.length) {
      setBusyId('');
      setError('');
      setDisputeDialogOpen(false);
    }
  }, [items.length]);

  const activeConfirmation = items[0] || null;

  const handleRespond = async (confirmation, status, extraPayload = {}) => {
    const messageId = safeText(confirmation?.id);
    if (!messageId) return;
    const actionRole = safeText(confirmation?.actionRole) === 'mentor' ? 'mentor' : 'student';

    setBusyId(messageId);
    setError('');

    try {
      if (actionRole === 'mentor') {
        await api.post(
          `/api/messages/lesson-hour-confirmations/${encodeURIComponent(messageId)}/mentor-respond`,
          { status, ...extraPayload }
        );
      } else {
        await api.post(
          `/api/messages/lesson-hour-confirmations/${encodeURIComponent(messageId)}/respond`,
          { status, ...extraPayload }
        );
      }
      emitPendingLessonHoursChanged();
      emitMessageUnreadChanged();
      setDisputeDialogOpen(false);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || '处理课时确认失败，请稍后再试';
      setError(String(message));
    } finally {
      setBusyId('');
    }
  };

  const handleStudentDisputeStart = (confirmation) => {
    const initialValue = formatQuarterHourValue(
      confirmation?.disputedHours ?? confirmation?.proposedHours,
      '1'
    );
    setDisputeValue(initialValue);
    setError('');
    setDisputeDialogOpen(true);
  };

  const handleStudentDisputeSubmit = async () => {
    const disputedHours = normalizeQuarterHourValue(disputeValue);
    if (!activeConfirmation || disputedHours == null) {
      setError('请输入你认为正确的课时，需为 0.25 小时颗粒度');
      return;
    }

    await handleRespond(activeConfirmation, 'disputed', { disputedHours });
  };

  return (
    <>
      <PendingLessonHoursPrompt
        open={Boolean(activeConfirmation) && !disputeDialogOpen}
        confirmation={activeConfirmation}
        totalCount={items.length}
        busy={Boolean(activeConfirmation && busyId === activeConfirmation.id)}
        error={error}
        onConfirm={(confirmation) => handleRespond(
          confirmation,
          safeText(confirmation?.actionRole) === 'mentor' ? 'dispute_confirmed' : 'confirmed'
        )}
        onDispute={(confirmation) => (
          safeText(confirmation?.actionRole) === 'mentor'
            ? handleRespond(confirmation, 'platform_review')
            : handleStudentDisputeStart(confirmation)
        )}
      />

      <LessonHoursDialog
        open={disputeDialogOpen}
        title="填写你认为正确的课时"
        value={disputeValue}
        onValueChange={setDisputeValue}
        error={error}
        submitting={Boolean(activeConfirmation && busyId === activeConfirmation.id)}
        onClose={() => {
          if (busyId) return;
          setDisputeDialogOpen(false);
          setError('');
        }}
        onSubmit={handleStudentDisputeSubmit}
      />
    </>
  );
}

function App() {
  return (
    <Router>
      <RouteTitleManager />
      <AuthSessionManager />
      <PendingLessonHoursGate />
      <Routes>
        {/* 默认路径重定向到 /student */}
        <Route path="/" element={<Navigate to="/student" />} />

        {/* 学生页面 */}
        <Route path="/student" element={<StudentPage />} />

        {/* 学生查看导师主页 */}
        <Route path="/student/mentors/:mentorId" element={<MentorDetailPage />} />

        {/* 发布课程需求页面 */}
        <Route path="/student/course-request" element={<StudentCourseRequestPage />} />

        {/* 收藏页面 */}
        <Route path="/student/favorites" element={<FavoritesPage />} />
        <Route path="/student/favorites/:collectionId" element={<FavoriteCollectionPage />} />
        <Route path="/student/recent-visits" element={<RecentVisitsPage />} />

        {/* 课程时间轴页面 */}
        <Route path="/student/courses" element={<CoursesPage />} />
        <Route path="/student/messages" element={<MessagesPage />} />
        <Route path="/student/wallet" element={<WalletPage />} />
        <Route path="/student/settings" element={<AccountSettingsPage mode="student" />} />
        <Route path="/student/help" element={<HelpCenterPage mode="student" />} />
        <Route path="/classroom/:courseId" element={<ClassroomPage />} />

        {/* 导师个人名片编辑页面 */}
        <Route path="/mentor/profile-editor" element={<MentorProfileEditorPage />} />

        {/* 导师课程时间轴页 */}
        <Route path="/mentor/courses" element={<MentorCoursesPage />} />
        <Route path="/mentor/requests/:requestId" element={<CourseRequestDetailPage />} />
        <Route path="/mentor/messages" element={<MessagesPage />} />
        <Route path="/mentor/settings" element={<AccountSettingsPage mode="mentor" />} />
        <Route path="/mentor/help" element={<HelpCenterPage mode="mentor" />} />

        {/* 导师页面 */}
        <Route path="/mentor" element={<MentorPage />} />
      </Routes>
    </Router>
  );
}

export default App;
