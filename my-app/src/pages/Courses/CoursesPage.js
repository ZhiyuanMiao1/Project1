import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH, FaStar, FaRegStar, FaUserCircle } from 'react-icons/fa';
import { FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import {
  DIRECTION_LABEL_ICON_MAP,
  COURSE_TYPE_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import './CoursesPage.css';

const MOCK_COURSES = [
  { id: 'c-2025-11-28-a', title: '编程基础', type: '课前预习', date: '2025-11-28', duration: '2h', mentorName: '李老师', mentorAvatar: 'https://i.pravatar.cc/120?img=34', rating: 4.8 },
  { id: 'c-2025-11-22-a', title: '数据结构与算法', type: '作业项目', date: '2025-11-22', duration: '1.5h', mentorName: 'Thomas Muller', mentorAvatar: 'https://i.pravatar.cc/120?img=20', rating: 4.6 },
  { id: 'c-2025-11-18-a', title: '软件工程实践', type: '课前预习', date: '2025-11-18', duration: '2h', mentorName: '赵老师', mentorAvatar: 'https://i.pravatar.cc/120?img=41', rating: 4.7 },
  { id: 'c-2025-11-12-b', title: '产品思维', type: '选课指导', date: '2025-11-12', duration: '1.5h', mentorName: '陈导师', mentorAvatar: 'https://i.pravatar.cc/120?img=10', rating: 4.5 },
  { id: 'c-2025-11-06-a', title: '编译原理', type: '作业项目', date: '2025-11-06', duration: '2h', mentorName: '刘老师', mentorAvatar: 'https://i.pravatar.cc/120?img=24', rating: 4.4 },
  { id: 'c-2025-10-18-a', title: '系统设计导论', type: '选课指导', date: '2025-10-18', duration: '2h', mentorName: '周导师', mentorAvatar: 'https://i.pravatar.cc/120?img=30', rating: 4.6 },
  { id: 'c-2025-10-04-a', title: '机器学习基础', type: '课前预习', date: '2025-10-04', duration: '2h', mentorName: '李导师', mentorAvatar: 'https://i.pravatar.cc/120?img=32', rating: 4.7 },
  { id: 'c-2025-09-15-a', title: '算法刷题营', type: '期末复习', date: '2025-09-15', duration: '1h', mentorName: '冯老师', mentorAvatar: 'https://i.pravatar.cc/120?img=38', rating: 4.3 },
  { id: 'c-2025-08-30-a', title: '前端工程化', type: '课前预习', date: '2025-08-30', duration: '1.5h', mentorName: '郑导师', mentorAvatar: 'https://i.pravatar.cc/120?img=6', rating: 4.5 },
  { id: 'c-2024-12-06-a', title: '数据库系统', type: '期末复习', date: '2024-12-06', duration: '2h', mentorName: '王老师', mentorAvatar: 'https://i.pravatar.cc/120?img=12', rating: 4.4 },
  { id: 'c-2024-11-28-a', title: '软件测试', type: '课前预习', date: '2024-11-28', duration: '1.5h', mentorName: '李老师', mentorAvatar: 'https://i.pravatar.cc/120?img=21', rating: 4.6 },
  { id: 'c-2024-11-20-a', title: '数据可视化', type: '其它类型', date: '2024-11-20', duration: '1h', mentorName: '宋导师', mentorAvatar: 'https://i.pravatar.cc/120?img=43', rating: 4.4 },
  { id: 'c-2024-11-15-a', title: '人工智能导论', type: '期末复习', date: '2024-11-15', duration: '1.5h', mentorName: '刘老师', mentorAvatar: 'https://i.pravatar.cc/120?img=18', rating: 4.7 },
  { id: 'c-2024-11-12-a', title: '操作系统', type: '其它类型', date: '2024-11-12', duration: '1.5h', mentorName: '钱老师', mentorAvatar: 'https://i.pravatar.cc/120?img=16', rating: 4.5 },
  { id: 'c-2024-11-08-a', title: '移动开发', type: '作业项目', date: '2024-11-08', duration: '2h', mentorName: '马导师', mentorAvatar: 'https://i.pravatar.cc/120?img=48', rating: 4.4 },
  { id: 'c-2024-11-02-a', title: '网络基础', type: '课前预习', date: '2024-11-02', duration: '1h', mentorName: '朱老师', mentorAvatar: 'https://i.pravatar.cc/120?img=27', rating: 4.3 },
  { id: 'c-2024-09-16-a', title: '毕业论文辅导', type: '毕业论文', date: '2024-09-16', duration: '1h', mentorName: '导师组', mentorAvatar: 'https://i.pravatar.cc/120?img=14', rating: 4.8 },
];

const formatDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}`;
};

const isCoursePast = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
};

function CoursesPage() {
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [activeCourse, setActiveCourse] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      setErrorMessage('');
      return;
    }
    setActiveCourse(null);
    setErrorMessage('请登录后查看课程');
  }, [isLoggedIn]);

  const timelineData = useMemo(() => {
    const sorted = [...MOCK_COURSES].sort((a, b) => new Date(b.date) - new Date(a.date));
    const yearMap = new Map();

    sorted.forEach((course) => {
      const d = new Date(course.date);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const monthMap = yearMap.get(year);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month).push({ ...course, month, dateText: formatDate(course.date) });
    });

    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, monthsMap]) => ({
        year,
        months: Array.from(monthsMap.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([month, courses]) => ({
            month,
            courses: courses.sort((a, b) => new Date(b.date) - new Date(a.date)),
          })),
      }));
  }, []);

  const handleCourseOpen = (course) => setActiveCourse(course);
  const handleCourseClose = () => setActiveCourse(null);
  const handleCardKeyDown = (event, course) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCourseOpen(course);
    }
  };

  const renderStars = (ratingValue) => {
    const value = typeof ratingValue === 'number' && !Number.isNaN(ratingValue) ? ratingValue : 0;
    const starSize = 14;
    return Array.from({ length: 5 }).map((_, idx) => {
      const fill = Math.max(0, Math.min(1, value - idx));
      const clipPath = `inset(0 ${100 - fill * 100}% 0 0)`; // vertical cut based on remaining unfilled width
      return (
        <span className="course-detail-star" key={idx} aria-hidden="true">
          <FaRegStar size={starSize} className="course-detail-star-base" />
          {fill > 0 && (
            <span className="course-detail-star-fill" style={{ clipPath }}>
              <FaStar size={starSize} />
            </span>
          )}
        </span>
      );
    });
  };

  return (
    <div className="courses-page">
      <div className="container">
        <header className="courses-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle courses-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="courses-hero">
          <h1>课程</h1>
        </section>

        {errorMessage && <div className="courses-alert">{errorMessage}</div>}

        {isLoggedIn && (
          <section className="courses-timeline">
            {timelineData.map((yearBlock) => (
              <div className="courses-year-block" key={yearBlock.year}>
                <div className="year-side">
                  <div className="year-label">{yearBlock.year}</div>
                  <div className="year-line" />
                </div>
                <div className="year-content">
                  {yearBlock.months.map((monthBlock, idx) => (
                    <div className="month-row" key={`${yearBlock.year}-${monthBlock.month}`}>
                      <div className={`month-marker ${idx === yearBlock.months.length - 1 ? 'is-last' : ''}`}>
                        <span className="month-label">{monthBlock.month}月</span>
                      </div>
                      <div className="month-cards" role="list">
                        {monthBlock.courses.map((course) => {
                          const normalizedTitle = normalizeCourseLabel(course.title) || course.title;
                          const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
                          const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[course.type] || FaEllipsisH;
                          const isPast = isCoursePast(course.date);
                          return (
                            <article
                              className="course-card"
                              key={course.id}
                              role="listitem"
                              tabIndex={0}
                              onClick={() => handleCourseOpen(course)}
                              onKeyDown={(event) => handleCardKeyDown(event, course)}
                              aria-label={`${normalizedTitle} ${course.type}`}
                            >
                              <div className="course-head">
                                <div className="course-title-wrap">
                                  <span className={`course-status ${isPast ? 'course-status--done' : ''}`}>
                                    {isPast ? '\u2713' : ''}
                                  </span>
                                  <span className="course-title-icon">
                                    <TitleIcon size={20} />
                                  </span>
                                  <span className="course-title">{normalizedTitle}</span>
                                </div>
                              </div>
                              <div className="course-type-row">
                                <span className="course-pill">
                                  <span className="course-pill-icon">
                                    <TypeIcon size={14} />
                                  </span>
                                  <span>{course.type}</span>
                                </span>
                              </div>
                              <div className="course-meta">
                                <span className="meta-item">{course.dateText}</span>
                                <span className="meta-sep">·</span>
                                <span className="meta-item">{course.duration}</span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      {activeCourse && (
        <div className="course-detail-overlay" role="dialog" aria-modal="true">
          <div className="course-detail-card">
            <button
              type="button"
              className="course-detail-close"
              aria-label="关闭课程详情"
              onClick={handleCourseClose}
            >
              <FiX size={20} />
            </button>
            {(() => {
              const normalizedTitle = normalizeCourseLabel(activeCourse.title) || activeCourse.title;
              const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
              const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[activeCourse.type] || FaEllipsisH;
              const ratingValue = typeof activeCourse.rating === 'number' ? activeCourse.rating : 0;
              return (
                <>
                  <div className="course-detail-mentor">
                  <div
                    className="course-detail-avatar"
                    style={activeCourse.mentorAvatar ? { backgroundImage: `url(${activeCourse.mentorAvatar})` } : {}}
                  >
                    {!activeCourse.mentorAvatar && <FaUserCircle size={36} />}
                  </div>
                  <div className="course-detail-mentor-info">
                    <span className="course-detail-mentor-name">{activeCourse.mentorName}</span>
                  </div>
                    <div className="course-detail-rating">
                      <div className="course-detail-stars">
                        {renderStars(ratingValue)}
                      </div>
                      <span className="course-detail-rating-value">{ratingValue.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="course-detail-body">
                  <div className="course-detail-title">
                    <TitleIcon size={18} className="course-detail-title-icon-plain" />
                    <span>{normalizedTitle}</span>
                  </div>
                    <div className="course-detail-meta-grid">
                      <div className="course-detail-meta-chip">
                        <span className="course-detail-chip-label">课程类型</span>
                        <div className="course-detail-chip-value">
                          <TypeIcon size={14} />
                          <span>{activeCourse.type}</span>
                        </div>
                      </div>
                      <div className="course-detail-meta-chip">
                        <span className="course-detail-chip-label">日期</span>
                        <div className="course-detail-chip-value">{formatDate(activeCourse.date)}</div>
                      </div>
                      <div className="course-detail-meta-chip">
                        <span className="course-detail-chip-label">时长</span>
                        <div className="course-detail-chip-value">{activeCourse.duration}</div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default CoursesPage;
