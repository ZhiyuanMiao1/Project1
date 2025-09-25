import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import StudentPage from './components/StudentPage/StudentPage';
import TeacherPage from './components/TeacherPage/TeacherPage';
import StudentCourseRequestPage from './pages/StudentCourseRequest/StudentCourseRequestPage';
import TeacherProfileEditorPage from './pages/TeacherProfileEditor/TeacherProfileEditorPage';

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

        {/* 教师个人名片编辑页面 */}
        <Route path="/teacher/profile-editor" element={<TeacherProfileEditorPage />} />

        {/* 教师页面 */}
        <Route path="/teacher" element={<TeacherPage />} />
      </Routes>
    </Router>
  );
}

export default App;
