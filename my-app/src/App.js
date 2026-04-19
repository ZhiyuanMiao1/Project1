import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate, matchPath } from 'react-router-dom';
import './App.css';
import StudentPage from './components/StudentPage/StudentPage';
import LessonHoursDialog from './components/LessonHoursDialog/LessonHoursDialog';
import PendingLessonHoursPrompt from './components/PendingLessonHoursPrompt/PendingLessonHoursPrompt';
import CourseStartReminderGate from './components/CourseStartReminder/CourseStartReminder';
import api from './api/client';
import { emitMessageUnreadChanged } from './hooks/useMessageUnreadSummary';
import usePendingLessonHours, { emitPendingLessonHoursChanged } from './hooks/usePendingLessonHours';
import { AUTH_SESSION_EXPIRED_EVENT } from './utils/auth';
import { getAuthToken } from './utils/authStorage';
import { LanguageProvider, useI18n } from './i18n/language';
import { formatQuarterHourValue, normalizeQuarterHourValue } from './utils/lessonHours';
import { inferRequiredRoleFromPath, setPostLoginRedirect } from './utils/postLoginRedirect';

const BRAND_NAME = 'Mentory';
const loadMentorPage = () => import(/* webpackPrefetch: true */ './components/MentorPage/MentorPage');
const loadStudentCourseRequestPage = () => import(/* webpackPrefetch: true */ './pages/StudentCourseRequest/StudentCourseRequestPage');
const loadMentorProfileEditorPage = () => import(/* webpackPrefetch: true */ './pages/MentorProfileEditor/MentorProfileEditorPage');
const loadFavoritesPage = () => import(/* webpackPrefetch: true */ './pages/Favorites/FavoritesPage');
const loadFavoriteCollectionPage = () => import(/* webpackPrefetch: true */ './pages/Favorites/FavoriteCollectionPage');
const loadCoursesPage = () => import(/* webpackPrefetch: true */ './pages/Courses/CoursesPage');
const loadMentorCoursesPage = () => import(/* webpackPrefetch: true */ './pages/Courses/MentorCoursesPage');
const loadMessagesPage = () => import(/* webpackPrefetch: true */ './pages/Messages/MessagesPage');
const loadRecentVisitsPage = () => import(/* webpackPrefetch: true */ './pages/RecentVisits/RecentVisitsPage');
const loadAccountSettingsPage = () => import(/* webpackPrefetch: true */ './pages/AccountSettings/AccountSettingsPage');
const loadMentorDetailPage = () => import(/* webpackPrefetch: true */ './pages/MentorDetail/MentorDetailPage');
const loadCourseRequestDetailPage = () => import(/* webpackPrefetch: true */ './pages/CourseRequestDetail/CourseRequestDetailPage');
const loadWalletPage = () => import(/* webpackPrefetch: true */ './pages/Wallet/WalletPage');
const loadClassroomPage = () => import(/* webpackPrefetch: true */ './pages/Classroom/ClassroomPage');
const loadHelpCenterPage = () => import(/* webpackPrefetch: true */ './pages/HelpCenter/HelpCenterPage');

const LazyMentorPage = lazy(loadMentorPage);
const LazyStudentCourseRequestPage = lazy(loadStudentCourseRequestPage);
const LazyMentorProfileEditorPage = lazy(loadMentorProfileEditorPage);
const LazyFavoritesPage = lazy(loadFavoritesPage);
const LazyFavoriteCollectionPage = lazy(loadFavoriteCollectionPage);
const LazyCoursesPage = lazy(loadCoursesPage);
const LazyMentorCoursesPage = lazy(loadMentorCoursesPage);
const LazyMessagesPage = lazy(loadMessagesPage);
const LazyRecentVisitsPage = lazy(loadRecentVisitsPage);
const LazyAccountSettingsPage = lazy(loadAccountSettingsPage);
const LazyMentorDetailPage = lazy(loadMentorDetailPage);
const LazyCourseRequestDetailPage = lazy(loadCourseRequestDetailPage);
const LazyWalletPage = lazy(loadWalletPage);
const LazyClassroomPage = lazy(loadClassroomPage);
const LazyHelpCenterPage = lazy(loadHelpCenterPage);

const BACKGROUND_ROUTE_LOADERS = [
  loadMentorDetailPage,
  loadStudentCourseRequestPage,
  loadMessagesPage,
  loadWalletPage,
  loadMentorPage,
  loadCoursesPage,
  loadFavoritesPage,
  loadAccountSettingsPage,
  loadHelpCenterPage,
  loadRecentVisitsPage,
  loadMentorProfileEditorPage,
  loadMentorCoursesPage,
  loadCourseRequestDetailPage,
  loadClassroomPage,
  loadFavoriteCollectionPage,
];

let hasStartedBackgroundRouteWarmup = false;

const ROUTE_TITLE_MAP = [
  { path: '/student', title: 'Mentory' },
  { path: '/student/mentors/:mentorId', title: '导师主页', titleKey: 'app.route.mentorProfile' },
  { path: '/student/course-request', title: '发布课程需求', titleKey: 'app.route.courseRequest' },
  { path: '/student/favorites', title: '收藏', titleKey: 'app.route.favorites' },
  { path: '/student/favorites/:collectionId', title: '收藏夹', titleKey: 'app.route.favoriteCollection' },
  { path: '/student/recent-visits', title: '最近浏览', titleKey: 'app.route.recentVisits' },
  { path: '/student/courses', title: '课程', titleKey: 'app.route.courses' },
  { path: '/student/messages', title: '消息', titleKey: 'app.route.messages' },
  { path: '/student/wallet', title: '钱包', titleKey: 'app.route.wallet' },
  { path: '/student/settings', title: '设置', titleKey: 'app.route.settings' },
  { path: '/student/help', title: '帮助中心', titleKey: 'app.route.help' },
  { path: '/mentor', title: 'Mentory' },
  { path: '/mentor/profile-editor', title: '编辑个人名片', titleKey: 'app.route.profileEditor' },
  { path: '/mentor/courses', title: '导师课程', titleKey: 'app.route.mentorCourses' },
  { path: '/mentor/requests/:requestId', title: '课程需求详情', titleKey: 'app.route.requestDetail' },
  { path: '/mentor/messages', title: '消息', titleKey: 'app.route.messages' },
  { path: '/mentor/settings', title: '设置', titleKey: 'app.route.settings' },
  { path: '/mentor/help', title: '帮助中心', titleKey: 'app.route.help' },
  { path: '/classroom/:courseId', title: '课堂', titleKey: 'app.route.classroom' },
];

const normalizePathname = (pathname) => {
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/+$/, '') || '/';
};

const getDocumentTitleRouteByPath = (pathname) => {
  const normalizedPath = normalizePathname(pathname);
  const matchedRoute = ROUTE_TITLE_MAP.find((route) =>
    Boolean(matchPath({ path: route.path, end: true }, normalizedPath))
  );
  return matchedRoute || null;
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
  const { t } = useI18n();

  useEffect(() => {
    const route = getDocumentTitleRouteByPath(location.pathname);
    document.title = route ? t(route.titleKey || '', route.title) : BRAND_NAME;
  }, [location.pathname, t]);

  return null;
}

const canWarmBackgroundRoutes = () => {
  if (typeof navigator === 'undefined') return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  return !effectiveType.includes('2g');
};

function BackgroundRouteWarmup() {
  const location = useLocation();

  useEffect(() => {
    if (hasStartedBackgroundRouteWarmup) return undefined;
    if (normalizePathname(location.pathname) !== '/student') return undefined;
    if (!canWarmBackgroundRoutes()) return undefined;

    hasStartedBackgroundRouteWarmup = true;

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;
    const queue = [...BACKGROUND_ROUTE_LOADERS];

    const scheduleNext = (fn, delay = 250) => {
      if (cancelled) return;
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(fn, { timeout: 2000 });
        return;
      }
      timeoutId = window.setTimeout(fn, delay);
    };

    const runNext = () => {
      if (cancelled || queue.length === 0) return;
      const loader = queue.shift();
      Promise.resolve()
        .then(() => loader())
        .catch(() => null)
        .finally(() => {
          if (cancelled || queue.length === 0) return;
          scheduleNext(runNext);
        });
    };

    const start = () => scheduleNext(runNext, 0);

    if (typeof document !== 'undefined' && document.readyState === 'complete') {
      start();
      return () => {
        cancelled = true;
        if (idleId != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
        if (timeoutId != null) window.clearTimeout(timeoutId);
      };
    }

    const onLoad = () => start();
    window.addEventListener('load', onLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', onLoad);
      if (idleId != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [location.pathname]);

  return null;
}

function AuthSessionManager() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    const next = safeText(message) || t('auth.sessionExpired', '登录已失效，请重新登录');
    setToastMessage(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 2600);
  }, [t]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onSessionExpired = (event) => {
      const detail = event?.detail || {};
      const from = safeText(detail.from) || getCurrentPath();
      const requiredRole = safeText(detail.requiredRole) || inferRequiredRoleFromPath(from);
      const message = safeText(detail.message) || t('auth.sessionExpired', '登录已失效，请重新登录');

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
  }, [navigate, showToast, t]);

  if (!toastMessage) return null;
  return (
    <div className="auth-session-toast" role="status" aria-live="polite">
      {toastMessage}
    </div>
  );
}

function PendingLessonHoursGate() {
  const location = useLocation();
  const { t } = useI18n();
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
      const message = err?.response?.data?.error || err?.message || t('lessonHours.respondFailed', '处理课时确认失败，请稍后再试');
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
      setError(t('lessonHours.disputeInvalid', '请输入你认为正确的课时，需为 0.25 小时颗粒度'));
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
        title={t('lessonHours.disputeTitle', '填写你认为正确的课时')}
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

const withRouteSuspense = (element) => (
  <Suspense fallback={null}>
    {element}
  </Suspense>
);

function App() {
  return (
    <LanguageProvider>
      <Router>
        <RouteTitleManager />
        <BackgroundRouteWarmup />
        <AuthSessionManager />
        <PendingLessonHoursGate />
        <CourseStartReminderGate />
        <Routes>
          {/* 默认路径重定向到 /student */}
          <Route path="/" element={<Navigate to="/student" />} />

          {/* 学生页面 */}
          <Route path="/student" element={<StudentPage />} />

          {/* 学生查看导师主页 */}
          <Route path="/student/mentors/:mentorId" element={withRouteSuspense(<LazyMentorDetailPage />)} />

          {/* 发布课程需求页面 */}
          <Route path="/student/course-request" element={withRouteSuspense(<LazyStudentCourseRequestPage />)} />

          {/* 收藏页面 */}
          <Route path="/student/favorites" element={withRouteSuspense(<LazyFavoritesPage />)} />
          <Route path="/student/favorites/:collectionId" element={withRouteSuspense(<LazyFavoriteCollectionPage />)} />
          <Route path="/student/recent-visits" element={withRouteSuspense(<LazyRecentVisitsPage />)} />

          {/* 课程时间轴页面 */}
          <Route path="/student/courses" element={withRouteSuspense(<LazyCoursesPage />)} />
          <Route path="/student/messages" element={withRouteSuspense(<LazyMessagesPage />)} />
          <Route path="/student/wallet" element={withRouteSuspense(<LazyWalletPage />)} />
          <Route path="/student/settings" element={withRouteSuspense(<LazyAccountSettingsPage mode="student" />)} />
          <Route path="/student/help" element={withRouteSuspense(<LazyHelpCenterPage mode="student" />)} />
          <Route path="/classroom/:courseId" element={withRouteSuspense(<LazyClassroomPage />)} />

          {/* 导师个人名片编辑页面 */}
          <Route path="/mentor/profile-editor" element={withRouteSuspense(<LazyMentorProfileEditorPage />)} />

          {/* 导师课程时间轴页 */}
          <Route path="/mentor/courses" element={withRouteSuspense(<LazyMentorCoursesPage />)} />
          <Route path="/mentor/requests/:requestId" element={withRouteSuspense(<LazyCourseRequestDetailPage />)} />
          <Route path="/mentor/messages" element={withRouteSuspense(<LazyMessagesPage />)} />
          <Route path="/mentor/settings" element={withRouteSuspense(<LazyAccountSettingsPage mode="mentor" />)} />
          <Route path="/mentor/help" element={withRouteSuspense(<LazyHelpCenterPage mode="mentor" />)} />

          {/* 导师页面 */}
          <Route path="/mentor" element={withRouteSuspense(<LazyMentorPage />)} />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;
