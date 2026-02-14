import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH, FaUserCircle } from 'react-icons/fa';
import { FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import api from '../../api/client';
import { getAuthToken } from '../../utils/authStorage';
import {
  COURSE_TYPE_ID_TO_LABEL,
  COURSE_TYPE_LABEL_ICON_MAP,
  DIRECTION_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import './CoursesPage.css';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const pad2 = (n) => String(n).padStart(2, '0');

const formatDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
};

const isCoursePast = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
};

const toDateKey = (rawDate, rawStartsAt) => {
  const direct = safeText(rawDate);
  const directMatch = direct.match(/\d{4}-\d{2}-\d{2}/);
  if (directMatch) return directMatch[0];

  const startsAt = safeText(rawStartsAt);
  const startsAtMatch = startsAt.match(/\d{4}-\d{2}-\d{2}/);
  if (startsAtMatch) return startsAtMatch[0];

  const parsed = new Date(startsAt || direct);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

const toDurationText = (durationHours, fallback) => {
  const n = typeof durationHours === 'number' ? durationHours : Number(durationHours);
  if (Number.isFinite(n) && n > 0) {
    const normalized = Math.round(n * 100) / 100;
    const value = Number.isInteger(normalized) ? String(normalized) : String(normalized).replace(/\.0+$/, '');
    return `${value}h`;
  }
  const text = safeText(fallback);
  if (text) return text;
  return '1h';
};

const normalizeMentorCourse = (row) => {
  const directionId = safeText(row?.courseDirectionId || row?.course_direction || row?.title);
  const courseTypeId = safeText(row?.courseTypeId || row?.course_type);
  const fallbackTitle = safeText(row?.title);

  const title = normalizeCourseLabel(directionId)
    || normalizeCourseLabel(fallbackTitle)
    || fallbackTitle
    || '其它课程方向';

  const type = COURSE_TYPE_ID_TO_LABEL[courseTypeId]
    || safeText(row?.type)
    || '其它课程类型';

  const date = toDateKey(row?.date, row?.startsAt || row?.starts_at);
  const startsAt = safeText(row?.startsAt || row?.starts_at);

  return {
    id: safeText(row?.id) || `${date || 'unknown'}-${directionId || title}`,
    title,
    type,
    date,
    startsAt,
    duration: toDurationText(row?.durationHours ?? row?.duration_hours, row?.duration),
    studentName: safeText(row?.counterpartName || row?.studentName || row?.counterpartPublicId) || '学生',
    studentAvatar: safeText(row?.counterpartAvatarUrl || row?.studentAvatar),
  };
};

const toDateTimestamp = (course) => {
  const date = safeText(course?.date);
  if (date) {
    const parsed = Date.parse(`${date}T00:00:00`);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const startsAt = safeText(course?.startsAt);
  const fallback = Date.parse(startsAt);
  if (!Number.isNaN(fallback)) return fallback;
  return 0;
};

function MentorCoursesPage() {
  const menuAnchorRef = useRef(null);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [activeCourse, setActiveCourse] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(getAuthToken()));
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
  const [errorMessage, setErrorMessage] = useState('');
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [reloadSeed, setReloadSeed] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(Boolean(e.detail.isLoggedIn));
      } else {
        setIsLoggedIn(Boolean(getAuthToken()));
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

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
        if (!getAuthToken()) {
          setStatus('unauthenticated');
          setErrorMessage('请先登录导师账号');
          askLogin();
          return;
        }

        const res = await api.get('/api/mentor/permissions');
        if (!alive) return;

        if (res?.data?.canEditProfile) {
          setStatus('ok');
          setErrorMessage('');
          return;
        }

        setStatus('forbidden');
        setErrorMessage(res?.data?.error || '当前身份暂无访问权限');
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
          setErrorMessage(msg || '当前身份暂无访问权限');
          return;
        }
        setStatus('error');
        setErrorMessage(msg || '加载失败，请稍后再试');
      }
    })();

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;

    if (status !== 'ok') {
      setCourses([]);
      setCoursesLoading(false);
      setCoursesError('');
      return () => {
        alive = false;
      };
    }

    setCoursesLoading(true);
    setCoursesError('');

    api.get('/api/courses', { params: { view: 'mentor' } })
      .then((res) => {
        if (!alive) return;
        const rows = Array.isArray(res?.data?.courses) ? res.data.courses : [];
        setCourses(rows.map(normalizeMentorCourse));
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || '加载课程失败，请稍后重试';
        setCourses([]);
        setCoursesError(String(msg));
      })
      .finally(() => {
        if (!alive) return;
        setCoursesLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [status, reloadSeed]);

  const timelineData = useMemo(() => {
    const sorted = [...courses].sort((a, b) => toDateTimestamp(b) - toDateTimestamp(a));
    const yearMap = new Map();

    sorted.forEach((course) => {
      const key = safeText(course.date) || safeText(course.startsAt);
      const date = new Date(key);
      if (Number.isNaN(date.getTime())) return;

      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const monthMap = yearMap.get(year);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month).push({
        ...course,
        month,
        dateText: formatDate(course.date || course.startsAt),
      });
    });

    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, monthsMap]) => ({
        year,
        months: Array.from(monthsMap.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([month, monthCourses]) => ({
            month,
            courses: monthCourses.sort((a, b) => toDateTimestamp(b) - toDateTimestamp(a)),
          })),
      }));
  }, [courses]);

  const handleCourseOpen = (course) => setActiveCourse(course);
  const handleCourseClose = () => setActiveCourse(null);
  const handleCardKeyDown = (event, course) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCourseOpen(course);
    }
  };

  const renderTimeline = () => {
    if (coursesLoading) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-hint">加载中...</p>
        </div>
      );
    }

    if (coursesError) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">加载失败</p>
          <p className="courses-guard-subtitle">{coursesError}</p>
          <div className="courses-guard-actions">
            <button
              type="button"
              className="courses-btn"
              onClick={() => setReloadSeed((v) => v + 1)}
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    if (!timelineData.length) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">暂无课程</p>
          <p className="courses-guard-subtitle">学生接受课程邀请后，课程会显示在这里。</p>
        </div>
      );
    }

    return (
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
                      const typeLabel = safeText(course.type) || '其它课程类型';
                      const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
                      const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[typeLabel] || FaEllipsisH;
                      const isPast = isCoursePast(course.date || course.startsAt);
                      return (
                        <article
                          className="course-card"
                          key={course.id}
                          role="listitem"
                          tabIndex={0}
                          onClick={() => handleCourseOpen(course)}
                          onKeyDown={(event) => handleCardKeyDown(event, course)}
                          aria-label={`${normalizedTitle} ${typeLabel}`}
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
                              <span>{typeLabel}</span>
                            </span>
                          </div>
                          <div className="course-meta">
                            <span className="meta-item">{course.dateText}</span>
                            <span className="meta-sep">|</span>
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
    );
  };

  const renderStatusGuard = () => {
    if (status === 'loading') {
      return (
        <div className="courses-guard">
          <p className="courses-guard-hint">加载中...</p>
        </div>
      );
    }

    if (status === 'unauthenticated') {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">请先登录导师账号</p>
          <p className="courses-guard-subtitle">登录后即可访问导师课程日历。</p>
          <div className="courses-guard-actions">
            <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>登录 / 注册</button>
          </div>
        </div>
      );
    }

    if (status === 'pending') {
      return (
        <div className="courses-guard">
          <div className="mentor-pending">
            <svg className="mentor-pending-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4h8v2l-3 3 3 3v2H8v-2l3-3-3-3V4z" />
              <path d="M9 20h6" />
            </svg>
            <div className="mentor-pending-title">你已准备就绪</div>
            <div className="mentor-pending-subtitle">
              我们会尽快完成导师审核，审核通过后即可访问导师课程页面。
            </div>
          </div>
        </div>
      );
    }

    if (status === 'forbidden') {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">仅导师可访问</p>
          <p className="courses-guard-subtitle">{errorMessage || '请使用导师身份登录后查看。'}</p>
          <div className="courses-guard-actions">
            <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>切换账号</button>
          </div>
        </div>
      );
    }

    return (
      <div className="courses-guard">
        <p className="courses-guard-title">加载失败</p>
        <p className="courses-guard-subtitle">{errorMessage || '请稍后重试。'}</p>
      </div>
    );
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

        {status === 'ok' ? renderTimeline() : renderStatusGuard()}
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
              const typeLabel = safeText(activeCourse.type) || '其它课程类型';
              const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
              const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[typeLabel] || FaEllipsisH;
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
                          <span>{typeLabel}</span>
                        </div>
                      </div>
                      <div className="course-detail-meta-chip">
                        <span className="course-detail-chip-label">日期</span>
                        <div className="course-detail-chip-value">{formatDate(activeCourse.date || activeCourse.startsAt)}</div>
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
