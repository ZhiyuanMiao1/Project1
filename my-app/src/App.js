import React, { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, matchPath } from 'react-router-dom';
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
  { path: '/mentor', title: 'Mentory' },
  { path: '/mentor/profile-editor', title: '编辑个人名片' },
  { path: '/mentor/courses', title: '导师课程' },
  { path: '/mentor/requests/:requestId', title: '课程需求详情' },
  { path: '/mentor/messages', title: '消息' },
  { path: '/mentor/settings', title: '设置' },
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

function RouteTitleManager() {
  const location = useLocation();

  useEffect(() => {
    document.title = getDocumentTitleByPath(location.pathname);
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <RouteTitleManager />
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

        {/* 导师个人名片编辑页面 */}
        <Route path="/mentor/profile-editor" element={<MentorProfileEditorPage />} />

        {/* 导师课程时间轴页 */}
        <Route path="/mentor/courses" element={<MentorCoursesPage />} />
        <Route path="/mentor/requests/:requestId" element={<CourseRequestDetailPage />} />
        <Route path="/mentor/messages" element={<MessagesPage />} />
        <Route path="/mentor/settings" element={<AccountSettingsPage mode="mentor" />} />

        {/* 导师页面 */}
        <Route path="/mentor" element={<MentorPage />} />
      </Routes>
    </Router>
  );
}

export default App;
