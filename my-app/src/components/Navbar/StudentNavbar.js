import React, { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './StudentNavbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import TimezoneModal from '../TimezoneModal/TimezoneModal';
import CourseTypeModal from '../CourseTypeModal/CourseTypeModal';
import StartDateModal from '../StartDateModal/StartDateModal';
import StudentAuthModal from '../AuthModal/StudentAuthModal';
import BrandMark from '../common/BrandMark/BrandMark';

function StudentNavbar() {
  const timezoneRef = useRef(null);
  const courseTypeRef = useRef(null);
  const startDateRef = useRef(null);
  const userIconRef = useRef(null);
  const publishBtnRef = useRef(null);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false);
  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [showStartDateModal, setShowStartDateModal] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [isSearchBarActive, setIsSearchBarActive] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isStudentActive = location.pathname.startsWith('/student');
  const isTeacherActive = location.pathname.startsWith('/teacher');

  return (
    <header className="navbar">
      {/* 顶部双层导航 */}
      <div className="navbar-top container">
        <div className="navbar-left">
          {/* 学生视图点击 LOGO 返回学生首页 */}
          <BrandMark className="nav-logo-text" to="/student" />
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
          <button
            type="button"
            className="nav-link nav-text"
            ref={publishBtnRef}
            onClick={() => navigate('/student/course-request')}
          >
            发布课程需求
          </button>
          <span
            className="icon-circle"
            ref={userIconRef}
            onClick={() => {
              setShowAuthModal(true);
            }}
          >
            <i className="fa fa-user"></i>
          </span>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="navbar-bottom container">
        <div className={`search-bar ${isSearchBarActive ? 'active' : ''}`}>
          <div className="search-filters">
            <div
              ref={timezoneRef}
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
              ref={courseTypeRef}
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
              ref={startDateRef}
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
          anchorRef={timezoneRef}
        />
      )}

      {showCourseTypeModal && (
        <CourseTypeModal
          onClose={() => {
            setShowCourseTypeModal(false);
            setActiveFilter('');
            setIsSearchBarActive(false);
          }}
          onSelect={(courseType) => setSelectedCourseType(courseType)}
          anchorRef={courseTypeRef}
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
          anchorRef={startDateRef}
        />
      )}

      {showAuthModal && (
        <StudentAuthModal
          onClose={() => setShowAuthModal(false)}
          anchorRef={userIconRef}
          leftAlignRef={publishBtnRef}
        />
      )}
    </header>
  );
}

export default StudentNavbar;


