// 引入必要的库和组件
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './TeacherNavbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import TimezoneModal from '../TimezoneModal/TimezoneModal';
import CourseTypeModal from '../CourseTypeModal/CourseTypeModal';
import StartDateModal from '../StartDateModal/StartDateModal';
import TeacherAuthModal from '../AuthModal/TeacherAuthModal'; // 引入学生版本的注册和登录弹窗组件

function TeacherNavbar() {
  const [showTimezoneModal, setShowTimezoneModal] = useState(false); // 控制时区弹窗显示
  const [selectedRegion, setSelectedRegion] = useState(''); // 当前选中的区域
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false); // 控制课程类型弹窗显示
  const [selectedCourseType, setSelectedCourseType] = useState(''); // 当前选中的课程类型
  const [showStartDateModal, setShowStartDateModal] = useState(false); // 控制首课日期弹窗显示
  const [selectedStartDate, setSelectedStartDate] = useState(''); // 当前选中的首课日期
  const [activeFilter, setActiveFilter] = useState(''); // 当前激活的搜索框
  const [isSearchBarActive, setIsSearchBarActive] = useState(false); // 搜索栏是否被激活
  const [showAuthModal, setShowAuthModal] = useState(false); // 控制注册和登录弹窗显示
  const navigate = useNavigate(); // 获取 navigate 函数
  const location = useLocation(); // 获取当前路径

  // 判断当前路由，确定哪个按钮应该高亮
  const isStudentActive = location.pathname === '/student';
  const isTeacherActive = location.pathname === '/teacher';
  
  return (
    <header className="navbar">
      {/* 第一行：LOGO + Students/Teacher + 右侧菜单 */}
      <div className="navbar-top container">
        <div className="navbar-left">
          <span className="nav-logo-text">MentorX</span>
        </div>
        <div className="navbar-center">
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${isStudentActive ? 'active' : ''}`}
              onClick={() => navigate('/student')}
            >
              学生
            </button>
            <button
              className={`nav-tab ${isTeacherActive ? 'active' : ''}`}
              onClick={() => navigate('/teacher')}
            >
              教师
            </button>
          </nav>
        </div>
        <div className="navbar-right">
          <span className="nav-link nav-text">编辑个人名片</span>
          <span
            className="icon-circle"
            onClick={() => {
              setShowAuthModal(true)}
            } // 点击打开注册和登录弹窗
          >
            <i className="fa fa-user"></i>
          </span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
      <div className="navbar-bottom container">
        <div className={`search-bar ${isSearchBarActive ? 'active' : ''}`}>
          <div className="search-filters">
            <div
              className={`search-item timezone ${activeFilter === 'timezone' ? 'active' : ''}`}
              onClick={() => {
                setShowTimezoneModal(true);
                setActiveFilter('timezone');
                setIsSearchBarActive(true);
              }}
            >
              <label>时区</label>
              <input
                type="text"
                placeholder="选择时区"
                value={selectedRegion}
                readOnly
              />
            </div>
            <div
              className={`search-item course-type ${activeFilter === 'courseType' ? 'active' : ''}`}
              onClick={() => {
                setShowCourseTypeModal(true);
                setActiveFilter('courseType');
                setIsSearchBarActive(true);
              }}
            >
              <label>课程类型</label>
              <input
                type="text"
                placeholder="选择课程类型"
                value={selectedCourseType}
                readOnly
              />
            </div>
            <div
              className={`search-item start-date ${activeFilter === 'startDate' ? 'active' : ''}`}
              onClick={() => {
                setShowStartDateModal(true);
                setActiveFilter('startDate');
                setIsSearchBarActive(true);
              }}
            >
              <label>首课日期</label>
              <input
                type="text"
                placeholder="选择首课日期"
                value={selectedStartDate}
                readOnly
              />
            </div>
          </div>
          <button className="search-btn">
            <i className="fas fa-search"></i>
          </button>
        </div>
      </div>

      {/* 弹窗部分 */}
      {showTimezoneModal && (
        <TimezoneModal
          onClose={() => {
            setShowTimezoneModal(false);
            setActiveFilter('');
            setIsSearchBarActive(false);
          }}
          onSelect={(region) => setSelectedRegion(region)}
        />
      )}

      {showCourseTypeModal && (
        <CourseTypeModal
          onClose={() => {
            setShowCourseTypeModal(false);
            setActiveFilter('');
            setIsSearchBarActive(false);
          }}
          // 允许从弹窗传回 null/undefined 表示清空
          onSelect={(courseType) => setSelectedCourseType(courseType || '')}
        />
      )}

      {showStartDateModal && (
        <StartDateModal
          onClose={() => {
            setShowStartDateModal(false);
            setActiveFilter('');
            setIsSearchBarActive(false);
          }}
          onSelect={(startDate) => setSelectedStartDate(startDate)}
        />
      )}

      {showAuthModal && (
        <TeacherAuthModal
          onClose={() => setShowAuthModal(false)} // 关闭注册和登录弹窗
        />
      )}
    </header>
  );
}

export default TeacherNavbar;
