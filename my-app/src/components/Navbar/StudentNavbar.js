import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './StudentNavbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import TimezoneModal from '../TimezoneModal/TimezoneModal';
import CourseTypeModal from '../CourseTypeModal/CourseTypeModal';
// 移除首课日期弹窗，改为直接输入
import StudentAuthModal from '../AuthModal/StudentAuthModal';
import BrandMark from '../common/BrandMark/BrandMark';

function StudentNavbar() {
  const timezoneRef = useRef(null);
  const courseTypeRef = useRef(null);
  const exactSearchInputRef = useRef(null);
  const userIconRef = useRef(null);
  const publishBtnRef = useRef(null);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false);
  const [selectedCourseType, setSelectedCourseType] = useState('');
  // 精确搜索：输入 MentorID 或导师姓名
  const [exactSearch, setExactSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [isSearchBarActive, setIsSearchBarActive] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  // 延后切换激活项，避免按下鼠标到弹窗出现之间的闪烁
  const [pendingFilter, setPendingFilter] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const isStudentActive = location.pathname.startsWith('/student');
  const isTeacherActive = location.pathname.startsWith('/teacher');

  // 挂载后根据弹窗打开情况再切换激活项，避免点击瞬间的白->灰闪烁
  useEffect(() => {
    if (pendingFilter === 'timezone' && showTimezoneModal) {
      setActiveFilter('timezone');
      setIsSearchBarActive(true);
      setPendingFilter('');
    } else if (pendingFilter === 'courseType' && showCourseTypeModal) {
      setActiveFilter('courseType');
      setIsSearchBarActive(true);
      setPendingFilter('');
    }
  }, [pendingFilter, showTimezoneModal, showCourseTypeModal]);

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
              导师
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
                setPendingFilter('timezone');
              }}
            >
              <label>时区</label>
              <input
                type="text"
                placeholder="选择导师时区"
                value={selectedRegion}
                readOnly
              />
            </div>
            <div
              ref={courseTypeRef}
              className={`search-item course-type ${activeFilter === 'courseType' ? 'active' : ''}`}
              onClick={() => {
                setShowCourseTypeModal(true);
                setPendingFilter('courseType');
              }}
            >
              <label>导师特色</label>
              <input
                type="text"
                placeholder="选择导师特色"
                value={selectedCourseType}
                readOnly
              />
            </div>
            <div
              className={`search-item start-date ${activeFilter === 'startDate' ? 'active' : ''}`}
              onClick={() => {
                setActiveFilter('startDate');
                setIsSearchBarActive(true);
                try { exactSearchInputRef.current && exactSearchInputRef.current.focus(); } catch {}
              }}
            >
              <label>精确搜索</label>
              <input
                ref={exactSearchInputRef}
                type="text"
                placeholder="输入导师的MentorID数字或导师姓名"
                value={exactSearch}
                onChange={(e) => setExactSearch(e.target.value)}
                onFocus={() => { setActiveFilter('startDate'); setIsSearchBarActive(true); }}
                onBlur={() => { setActiveFilter(''); setIsSearchBarActive(false); }}
                style={{ cursor: 'text' }}
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
            if (!pendingFilter) {
              setActiveFilter('');
              setIsSearchBarActive(false);
            }
          }}
          onSelect={(region) => setSelectedRegion(region)}
          anchorRef={timezoneRef}
        />
      )}

      {showCourseTypeModal && (
        <CourseTypeModal
          onClose={() => {
            setShowCourseTypeModal(false);
            if (!pendingFilter) {
              setActiveFilter('');
              setIsSearchBarActive(false);
            }
          }}
          onSelect={(courseType) => setSelectedCourseType(courseType)}
          anchorRef={courseTypeRef}
          mode="studentFeatures"
        />
      )}

      {/* 首课日期弹窗已移除，改为直接输入 */}

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
