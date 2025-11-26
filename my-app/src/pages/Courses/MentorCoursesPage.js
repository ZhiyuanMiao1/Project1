import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH, FaUserCircle } from 'react-icons/fa';
import { FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import api from '../../api/client';
import {
  DIRECTION_LABEL_ICON_MAP,
  COURSE_TYPE_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import './CoursesPage.css';

const MOCK_MENTOR_COURSES = [
  { id: 'mc-2025-11-28-a', title: '编程基础', type: '课前预习', date: '2025-11-28', duration: '2h', studentName: '张同学', studentAvatar: 'https://i.pravatar.cc/120?img=5' },
  { id: 'mc-2025-11-22-a', title: '数据结构与算法', type: '作业项目', date: '2025-11-22', duration: '1.5h', studentName: 'Alex Chen', studentAvatar: 'https://i.pravatar.cc/120?img=13' },
  { id: 'mc-2025-11-18-a', title: '软件工程实践', type: '课前预习', date: '2025-11-18', duration: '2h', studentName: '王同学', studentAvatar: 'https://i.pravatar.cc/120?img=45' },
  { id: 'mc-2025-11-12-b', title: '产品思维', type: '选课指导', date: '2025-11-12', duration: '1.5h', studentName: '陈同学', studentAvatar: 'https://i.pravatar.cc/120?img=47' },
  { id: 'mc-2025-11-06-a', title: '编译原理', type: '作业项目', date: '2025-11-06', duration: '2h', studentName: '刘同学', studentAvatar: 'https://i.pravatar.cc/120?img=36' },
  { id: 'mc-2025-10-18-a', title: '系统设计导论', type: '选课指导', date: '2025-10-18', duration: '2h', studentName: '周同学', studentAvatar: 'https://i.pravatar.cc/120?img=23' },
  { id: 'mc-2025-10-04-a', title: '机器学习基础', type: '课前预习', date: '2025-10-04', duration: '2h', studentName: '李同学', studentAvatar: 'https://i.pravatar.cc/120?img=11' },
  { id: 'mc-2025-09-15-a', title: '算法刷题营', type: '期末复习', date: '2025-09-15', duration: '1h', studentName: '冯同学', studentAvatar: 'https://i.pravatar.cc/120?img=52' },
  { id: 'mc-2025-08-30-a', title: '前端工程化', type: '课前预习', date: '2025-08-30', duration: '1.5h', studentName: '郑同学', studentAvatar: 'https://i.pravatar.cc/120?img=55' },
  { id: 'mc-2024-12-06-a', title: '数据库系统', type: '期末复习', date: '2024-12-06', duration: '2h', studentName: '王同学', studentAvatar: 'https://i.pravatar.cc/120?img=17' },
  { id: 'mc-2024-11-28-a', title: '软件测试', type: '课前预习', date: '2024-11-28', duration: '1.5h', studentName: '李同学', studentAvatar: 'https://i.pravatar.cc/120?img=57' },
  { id: 'mc-2024-11-20-a', title: '数据可视化', type: '其它类型', date: '2024-11-20', duration: '1h', studentName: '宋同学', studentAvatar: 'https://i.pravatar.cc/120?img=28' },
  { id: 'mc-2024-11-15-a', title: '人工智能导论', type: '期末复习', date: '2024-11-15', duration: '1.5h', studentName: '刘同学', studentAvatar: 'https://i.pravatar.cc/120?img=31' },
  { id: 'mc-2024-11-12-a', title: '操作系统', type: '其它类型', date: '2024-11-12', duration: '1.5h', studentName: '钱同学', studentAvatar: 'https://i.pravatar.cc/120?img=7' },
  { id: 'mc-2024-11-08-a', title: '移动开发', type: '作业项目', date: '2024-11-08', duration: '2h', studentName: '马同学', studentAvatar: 'https://i.pravatar.cc/120?img=26' },
  { id: 'mc-2024-11-02-a', title: '网络基础', type: '课前预习', date: '2024-11-02', duration: '1h', studentName: '朱同学', studentAvatar: 'https://i.pravatar.cc/120?img=8' },
  { id: 'mc-2024-09-16-a', title: '毕业论文辅导', type: '毕业论文', date: '2024-09-16', duration: '1h', studentName: '黄同学', studentAvatar: 'https://i.pravatar.cc/120?img=9' },
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

function MentorCoursesPage() {
  const menuAnchorRef = useRef(null);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [activeCourse, setActiveCourse] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
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
  }, [isLoggedIn]);

  // 访问控制：导师且审核通过才能查看
  useEffect(() => {
    let alive = true;
    const askLogin = () => {
      try { sessionStorage.setItem('postLoginRedirect', '/mentor/courses'); } catch {}
      try { sessionStorage.setItem('requiredRole', 'mentor'); } catch {}
      setShowMentorAuth(true);
    };

    setStatus('loading');
    setErrorMessage('');

    (async () => {
      try {
        const res = await api.get('/api/mentor/permissions');
        if (!alive) return;
        if (res?.data?.canEditProfile) {
          setStatus('ok');
          setErrorMessage('');
          return;
        }
        setStatus('forbidden');
        setErrorMessage(res?.data?.error || '当前身份暂无权限访问');
      } catch (e) {
        if (!alive) return;
        const code = e?.response?.status;
        const msg = e?.response?.data?.error || '';
        if (code === 401) {
          setStatus('unauthenticated');
          setErrorMessage('请先登录导师账号');
          askLogin();
          return;
        }
        if (code === 403) {
          if (msg && (msg.includes('审核') || msg.toLowerCase().includes('pending'))) {
            setStatus('pending');
          } else {
            setStatus('forbidden');
          }
          setErrorMessage(msg || '当前身份暂无权限访问');
          return;
        }
        setStatus('error');
        setErrorMessage(msg || '加载失败，请稍后再试');
      }
    })();

    return () => { alive = false; };
  }, []);

  const timelineData = useMemo(() => {
    const sorted = [...MOCK_MENTOR_COURSES].sort((a, b) => new Date(b.date) - new Date(a.date));
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

  return (
    <div className="courses-page">
      <div className="container">
        <header className="courses-header">
          <BrandMark className="nav-logo-text" to="/mentor" />
          <button
            type="button"
            className="icon-circle courses-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowMentorAuth(true)}
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

        {status === 'ok' && (
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

        {status !== 'ok' && (
          <div className="courses-guard">
            {status === 'loading' && <p className="courses-guard-hint">加载中...</p>}
            {status === 'unauthenticated' && (
              <>
                <p className="courses-guard-title">请先登录导师账号</p>
                <p className="courses-guard-subtitle">登录后即可访问导师课程日历。</p>
                <div className="courses-guard-actions">
                  <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>登录 / 注册</button>
                </div>
              </>
            )}
            {status === 'pending' && (
              <div className="mentor-pending">
                <svg className="mentor-pending-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 4h8v2l-3 3 3 3v2H8v-2l3-3-3-3V4z" />
                  <path d="M9 20h6" />
                </svg>
                <div className="mentor-pending-title">你已准备就绪！</div>
                <div className="mentor-pending-subtitle">
                  我们会尽快完成导师审核，审核通过后即可访问导师课程页面。
                </div>
              </div>
            )}
            {status === 'forbidden' && (
              <>
                <p className="courses-guard-title">仅导师可访问</p>
                <p className="courses-guard-subtitle">{errorMessage || '请使用导师身份登录后查看。'}</p>
                <div className="courses-guard-actions">
                  <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>切换账号</button>
                </div>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="courses-guard-title">加载失败</p>
                <p className="courses-guard-subtitle">{errorMessage || '请稍后重试。'}</p>
              </>
            )}
          </div>
        )}
      </div>

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
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
              return (
                <>
                  <div className="course-detail-mentor">
                    <div
                      className="course-detail-avatar"
                      style={activeCourse.studentAvatar ? { backgroundImage: `url(${activeCourse.studentAvatar})` } : {}}
                    >
                      {!activeCourse.studentAvatar && <FaUserCircle size={36} />}
                    </div>
                    <div className="course-detail-mentor-info">
                      <span className="course-detail-mentor-name">{activeCourse.studentName}</span>
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

export default MentorCoursesPage;
