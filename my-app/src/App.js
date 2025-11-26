import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import StudentPage from './components/StudentPage/StudentPage';
import MentorPage from './components/MentorPage/MentorPage';
import StudentCourseRequestPage from './pages/StudentCourseRequest/StudentCourseRequestPage';
import MentorProfileEditorPage from './pages/MentorProfileEditor/MentorProfileEditorPage';
import FavoritesPage from './pages/Favorites/FavoritesPage';
import CoursesPage from './pages/Courses/CoursesPage';
import MentorCoursesPage from './pages/Courses/MentorCoursesPage';
import MessagesPage from './pages/Messages/MessagesPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* 默认路径重定向到 /student */}
        <Route path="/" element={<Navigate to="/student" />} />

        {/* 学生页面 */}
        <Route path="/student" element={<StudentPage />} />

        {/* 发布课程需求页面 */}
        <Route path="/student/course-request" element={<StudentCourseRequestPage />} />

        {/* 收藏页面 */}
        <Route path="/student/favorites" element={<FavoritesPage />} />

        {/* 课程时间轴页面 */}
        <Route path="/student/courses" element={<CoursesPage />} />
        <Route path="/student/messages" element={<MessagesPage mode="student" />} />

        {/* 导师个人名片编辑页面 */}
        <Route path="/mentor/profile-editor" element={<MentorProfileEditorPage />} />

        {/* 导师课程时间轴页 */}
        <Route path="/mentor/courses" element={<MentorCoursesPage />} />
        <Route path="/mentor/messages" element={<MessagesPage mode="mentor" />} />

        {/* 导师页面 */}
        <Route path="/mentor" element={<MentorPage />} />
      </Routes>
    </Router>
  );
}

export default App;
