// 引入必要的库和组件
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './MentorNavbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import TimezoneModal from '../TimezoneModal/TimezoneModal';
import CourseTypeModal from '../CourseTypeModal/CourseTypeModal';
import StartDateModal from '../StartDateModal/StartDateModal';
import MentorAuthModal from '../AuthModal/MentorAuthModal'; // 引入学生版本的注册和登录弹窗组件
import BrandMark from '../common/BrandMark/BrandMark';
import { courseTypeToCnLabel } from '../../constants/courseMappings';

function MentorNavbar() {
  const timezoneRef = useRef(null); // 时区筛选锚点
  const courseTypeRef = useRef(null); // 课程类型锚点
  const startDateRef = useRef(null); // 首课日期锚点
  const userIconRef = useRef(null); // 右上角用户图标锚点
  const editProfileBtnRef = useRef(null); // 右上角“编辑个人名片”按钮
  const [showTimezoneModal, setShowTimezoneModal] = useState(false); // 控制时区弹窗显示
  const [selectedRegion, setSelectedRegion] = useState(''); // 当前选中的区域
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false); // 控制课程类型弹窗显示
  const [selectedCourseType, setSelectedCourseType] = useState(''); // 当前选中的课程类型
  const [showStartDateModal, setShowStartDateModal] = useState(false); // 控制首课日期弹窗显示
  const [selectedStartDate, setSelectedStartDate] = useState(''); // 当前选中的首课日期
  const [activeFilter, setActiveFilter] = useState(''); // 当前激活的搜索框
  const [isSearchBarActive, setIsSearchBarActive] = useState(false); // 搜索栏是否被激活
  const [showAuthModal, setShowAuthModal] = useState(false); // 控制注册和登录弹窗显示
  // 延后切换激活项，避免点击到弹窗出现之间的白->灰闪烁
  const [pendingFilter, setPendingFilter] = useState('');
  const navigate = useNavigate(); // 获取 navigate 函数
  const location = useLocation(); // 获取当前路径
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 判断当前路由，确定哪个按钮应该高亮
  const isStudentActive = location.pathname.startsWith('/student');
  const isMentorActive = location.pathname.startsWith('/mentor');
  
  // 弹窗打开后再切换激活项，避免点击瞬间的白->灰闪烁
  useEffect(() => {
    if (pendingFilter === 'timezone' && showTimezoneModal) {
      setActiveFilter('timezone');
      setIsSearchBarActive(true);
      setPendingFilter('');
    } else if (pendingFilter === 'courseType' && showCourseTypeModal) {
      setActiveFilter('courseType');
      setIsSearchBarActive(true);
      setPendingFilter('');
    } else if (pendingFilter === 'startDate' && showStartDateModal) {
      setActiveFilter('startDate');
      setIsSearchBarActive(true);
      setPendingFilter('');
    }
  }, [pendingFilter, showTimezoneModal, showCourseTypeModal, showStartDateModal]);
  
  // 登录状态：登录后显示三条横线（与学生页一致）
  useEffect(() => {
    try {
      setIsLoggedIn(!!localStorage.getItem('authToken'));
    } catch {}

    const onAuthChanged = (e) => {
      const next = !!(e?.detail?.isLoggedIn ?? localStorage.getItem('authToken'));
      setIsLoggedIn(next);
    };
    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!ev.newValue);
    };
    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  
  return (
    <header className="navbar">
      {/* 第一行：LOGO + Students/Mentor + 右侧菜单 */}
      <div className="navbar-top container">
        <div className="navbar-left">
          {/* 点击 LOGO 在导师视图返回导师首页 */}
          <BrandMark className="nav-logo-text" to="/mentor" />
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
              className={`nav-tab ${isMentorActive ? 'active' : ''}`}
              onClick={() => navigate('/mentor')}
            >
              导师
            </button>
          </nav>
        </div>
        <div className="navbar-right">
          <button
            type="button"
            className="nav-link nav-text"
            ref={editProfileBtnRef}
            onClick={() => navigate('/mentor/profile-editor')}
          >
            编辑个人名片
          </button>
          <span
            className="icon-circle"
            ref={userIconRef}
            onClick={() => {
              setShowAuthModal(true);
            }}
          >
            {isLoggedIn ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="5" y1="8"  x2="20" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <i className="fa fa-user"></i>
            )}
          </span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
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
                placeholder="选择学生时区"
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
              <label>课程类型</label>
              <input
                type="text"
                placeholder="选择课程类型"
                value={courseTypeToCnLabel(selectedCourseType)}
                readOnly
              />
            </div>
            <div
              ref={startDateRef}
              className={`search-item start-date ${activeFilter === 'startDate' ? 'active' : ''}`}
              onClick={() => {
                setShowStartDateModal(true);
                setPendingFilter('startDate');
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
          // 允许从弹窗传回 null/undefined 表示清空
          onSelect={(courseType) => setSelectedCourseType(courseType || '')}
          anchorRef={courseTypeRef}
        />
      )}

      {showStartDateModal && (
        <StartDateModal
          onClose={() => {
            setShowStartDateModal(false);
            if (!pendingFilter) {
              setActiveFilter('');
              setIsSearchBarActive(false);
            }
          }}
          onSelect={(startDate) => setSelectedStartDate(startDate)}
          anchorRef={startDateRef}
        />
      )}

      {showAuthModal && (
        <MentorAuthModal
          onClose={() => setShowAuthModal(false)} // 关闭注册和登录弹窗
          anchorRef={userIconRef}
          leftAlignRef={editProfileBtnRef}
        />
      )}
    </header>
  );
}

export default MentorNavbar;

