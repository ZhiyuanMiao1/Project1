import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH } from 'react-icons/fa';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import {
  DIRECTION_LABEL_ICON_MAP,
  COURSE_TYPE_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import './CoursesPage.css';

const MOCK_COURSES = [
  { id: 'c-2025-11-28-a', title: '编程基础', type: '课前预习', date: '2025-11-28', duration: '2h' },
  { id: 'c-2025-11-22-a', title: '数据结构与算法', type: '作业项目', date: '2025-11-22', duration: '1.5h' },
  { id: 'c-2025-10-18-a', title: '系统设计导论', type: '选课指导', date: '2025-10-18', duration: '2h' },
  { id: 'c-2025-10-04-a', title: '机器学习基础', type: '课前预习', date: '2025-10-04', duration: '2h' },
  { id: 'c-2025-09-15-a', title: '算法刷题营', type: '期末复习', date: '2025-09-15', duration: '1h' },
  { id: 'c-2025-08-30-a', title: '前端工程化', type: '课前预习', date: '2025-08-30', duration: '1.5h' },
  { id: 'c-2024-12-06-a', title: '数据库系统', type: '期末复习', date: '2024-12-06', duration: '2h' },
  { id: 'c-2024-11-12-a', title: '操作系统', type: '其它类型', date: '2024-11-12', duration: '1.5h' },
  { id: 'c-2024-11-02-a', title: '网络基础', type: '课前预习', date: '2024-11-02', duration: '1h' },
  { id: 'c-2024-09-16-a', title: '毕业论文辅导', type: '毕业论文', date: '2024-09-16', duration: '1h' },
];

const formatDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}`;
};

function CoursesPage() {
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });

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
              <line x1="5" y1="8"  x2="20" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="courses-hero">
          <h1>课程</h1>
        </section>

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
                        return (
                          <article className="course-card" key={course.id} role="listitem">
                            <div className="course-head">
                              <div className="course-title-wrap">
                                <span className="course-title-icon">
                                  <TitleIcon size={18} />
                                </span>
                                <span className="course-title">{normalizedTitle}</span>
                              </div>
                              <span className="course-pill">
                                <span className="course-pill-icon">
                                  <TypeIcon size={14} />
                                </span>
                                <span>{course.type}</span>
                              </span>
                            </div>
                            <div className="course-meta">
                              <span className="meta-item">{course.dateText}</span>
                              <span className="meta-sep">•</span>
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
    </div>
  );
}

export default CoursesPage;
