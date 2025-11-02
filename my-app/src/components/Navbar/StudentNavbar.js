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
  const searchBarRef = useRef(null);
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 精确搜索展开（覆盖左侧筛选）状态
  const [isExactExpanded, setIsExactExpanded] = useState(false);
  // 延后切换激活项，避免按下鼠标到弹窗出现之间的闪烁
  const [pendingFilter, setPendingFilter] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const isStudentActive = location.pathname.startsWith('/student');
  const isTeacherActive = location.pathname.startsWith('/teacher');

  const [isExactAnimating, setIsExactAnimating] = useState(false);

  // 初始化登录状态与监听登录变化
  useEffect(() => {
    try {
      setIsLoggedIn(!!localStorage.getItem('authToken'));
    } catch {}

    const onAuthChanged = (e) => {
      const next = !!(e?.detail?.isLoggedIn ?? localStorage.getItem('authToken'));
      setIsLoggedIn(next);
    };
    window.addEventListener('auth:changed', onAuthChanged);

    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!ev.newValue);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 登录状态变更（注册成功自动登录 / 退出登录）时，在学生首页触发主页开场动画
  const firstAuthRef = useRef(true);
  useEffect(() => {
    if (firstAuthRef.current) { firstAuthRef.current = false; return; }
    if (!isLoggedIn && location.pathname.startsWith('/student')) {
      try { window.dispatchEvent(new Event('home:enter')); } catch {}
    }
  }, [isLoggedIn, location.pathname]);

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

  // 当精确搜索展开时，仅点击搜索框外部才收起
  useEffect(() => {
    if (!isExactExpanded) return;

    const handleOutside = (e) => {
      const bar = searchBarRef.current;
      if (bar && !bar.contains(e.target)) {
        setIsExactAnimating(true);      // ✅ 标记开始收起动画
        setIsExactExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('touchstart', handleOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('touchstart', handleOutside, true);
    };
  }, [isExactExpanded]);

  useEffect(() => {
    const bar = searchBarRef.current;
    if (!bar) return;
    
    const onEnd = (e) => {
      if (!isExactAnimating) return;
      // 这些属性任意一个过渡结束即可认为布局回位完成
      if (['flex-basis','width','opacity','padding','margin'].includes(e.propertyName)) {
        setIsExactAnimating(false);     // 动画结束
        setActiveFilter('');            // 现在再清理激活项
        // 如果你的逻辑是“没有精确输入就整体失焦”，可以按需清理：
        if (!exactSearch) setIsSearchBarActive(false);
      }
    };
  
    bar.addEventListener('transitionend', onEnd);
    return () => bar.removeEventListener('transitionend', onEnd);
  }, [isExactAnimating, exactSearch]);

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

      {/* 搜索栏 */}
      <div className="navbar-bottom container">
        <div
          ref={searchBarRef}
          className={`search-bar ${isSearchBarActive ? 'active' : ''} ${isExactExpanded ? 'exact-expanded' : ''} ${isExactAnimating ? 'is-animating' : ''}`}
        >
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
                setIsExactExpanded(true);
                try { exactSearchInputRef.current && exactSearchInputRef.current.focus(); } catch {}
              }}
            >
              <label>精确搜索</label>
              <input
                ref={exactSearchInputRef}
                type="text"
                placeholder="输入导师的MentorID数字或导师姓名"
                value={exactSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setExactSearch(v);
                  setIsExactExpanded(true);
                  setIsSearchBarActive(true);
                }}
                onFocus={() => {
                  setActiveFilter('startDate');
                  setIsSearchBarActive(true);
                  setIsExactExpanded(true);
                }}
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
          isLoggedIn={isLoggedIn}
        />
      )}
    </header>
  );
}

export default StudentNavbar;
