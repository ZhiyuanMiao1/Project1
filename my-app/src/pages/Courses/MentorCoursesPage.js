import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH } from 'react-icons/fa';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import Button from '../../components/common/Button/Button';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import CourseDetailModal from '../../components/CourseDetailModal/CourseDetailModal';
import LessonHoursDialog from '../../components/LessonHoursDialog/LessonHoursDialog';
import api from '../../api/client';
import { getAuthToken } from '../../utils/authStorage';
import useCourseAlertSummary, { markCoursesAsSeen } from '../../hooks/useCourseAlertSummary';
import useMessageUnreadSummary from '../../hooks/useMessageUnreadSummary';
import {
  COURSE_TYPE_ID_TO_LABEL,
  COURSE_TYPE_LABEL_ICON_MAP,
  DIRECTION_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import { useI18n } from '../../i18n/language';
import { getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';
import { formatQuarterHourValue, normalizeQuarterHourValue } from '../../utils/lessonHours';
import './CoursesPage.css';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const pad2 = (n) => String(n).padStart(2, '0');

const buildDateTextFromParts = (parts) => {
  if (!parts) return '';
  return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}`;
};

const parseDateParts = (value) => {
  const text = safeText(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
};

const getCourseDisplayDateParts = (course, timeZone = getDefaultTimeZone()) => {
  const startsAt = safeText(course?.startsAt);
  if (startsAt) {
    const parsed = new Date(startsAt);
    if (!Number.isNaN(parsed.getTime())) {
      const parts = getZonedParts(timeZone, parsed);
      if (Number.isFinite(parts?.year) && Number.isFinite(parts?.month) && Number.isFinite(parts?.day)) {
        return {
          year: parts.year,
          month: parts.month,
          day: parts.day,
        };
      }
    }
  }

  return parseDateParts(course?.date);
};

const getCourseDisplayDateText = (course, timeZone = getDefaultTimeZone()) => {
  const parts = getCourseDisplayDateParts(course, timeZone);
  return buildDateTextFromParts(parts) || safeText(course?.date) || safeText(course?.startsAt);
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

const toDurationHours = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
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
    roleInCourse: 'mentor',
    directionId,
    courseTypeId,
    title,
    type,
    date,
    startsAt,
    durationHours: toDurationHours(row?.durationHours ?? row?.duration_hours),
    duration: toDurationText(row?.durationHours ?? row?.duration_hours, row?.duration),
    studentName: safeText(row?.counterpartName || row?.studentName || row?.counterpartPublicId) || '学生',
    studentAvatar: safeText(row?.counterpartAvatarUrl || row?.studentAvatar),
    counterpartName: safeText(row?.counterpartName || row?.studentName || row?.counterpartPublicId) || '学生',
    counterpartAvatar: safeText(row?.counterpartAvatarUrl || row?.studentAvatar),
    replayUrl: safeText(row?.replayUrl || row?.replay_url),
    latestLessonHoursMessageId: safeText(row?.latestLessonHoursMessageId || row?.latest_lesson_hours_message_id),
    latestLessonHoursStatus: safeText(row?.latestLessonHoursStatus || row?.latest_lesson_hours_status).toLowerCase(),
    latestLessonHoursProposedHours: toDurationHours(
      row?.latestLessonHoursProposedHours ?? row?.latest_lesson_hours_proposed_hours
    ),
    status: safeText(row?.status).toLowerCase(),
  };
};

const normalizeStudentCourse = (row) => {
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
    roleInCourse: 'student',
    directionId,
    courseTypeId,
    title,
    type,
    date,
    startsAt,
    durationHours: toDurationHours(row?.durationHours ?? row?.duration_hours),
    duration: toDurationText(row?.durationHours ?? row?.duration_hours, row?.duration),
    studentName: safeText(row?.counterpartName || row?.mentorName || row?.counterpartPublicId) || '导师',
    studentAvatar: safeText(row?.counterpartAvatarUrl || row?.mentorAvatar),
    counterpartName: safeText(row?.counterpartName || row?.mentorName || row?.counterpartPublicId) || '导师',
    counterpartAvatar: safeText(row?.counterpartAvatarUrl || row?.mentorAvatar),
    replayUrl: safeText(row?.replayUrl || row?.replay_url),
    latestLessonHoursMessageId: safeText(row?.latestLessonHoursMessageId || row?.latest_lesson_hours_message_id),
    latestLessonHoursStatus: safeText(row?.latestLessonHoursStatus || row?.latest_lesson_hours_status).toLowerCase(),
    latestLessonHoursProposedHours: toDurationHours(
      row?.latestLessonHoursProposedHours ?? row?.latest_lesson_hours_proposed_hours
    ),
    status: safeText(row?.status).toLowerCase(),
  };
};

const mergeCoursesById = (...courseGroups) => {
  const map = new Map();
  courseGroups.flat().forEach((course) => {
    const key = safeText(course?.id);
    if (!key || map.has(key)) return;
    map.set(key, course);
  });
  return Array.from(map.values());
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

const isScheduledCourse = (course) => safeText(course?.status).toLowerCase() === 'scheduled';

const getCourseEndTimestamp = (course) => {
  const startsAt = safeText(course?.startsAt);
  const startsAtTimestamp = Date.parse(startsAt);
  if (!Number.isNaN(startsAtTimestamp)) {
    const durationHours = toDurationHours(course?.durationHours);
    const durationMs = (durationHours ?? 0) * 60 * 60 * 1000;
    return startsAtTimestamp + durationMs;
  }

  const date = safeText(course?.date);
  if (date) {
    const fallback = Date.parse(`${date}T23:59:59`);
    if (!Number.isNaN(fallback)) return fallback;
  }

  return NaN;
};

const isCompletedCourse = (course) => {
  const status = safeText(course?.status).toLowerCase();
  if (status === 'completed') return true;
  if (status && status !== 'scheduled') return false;
  const endTimestamp = getCourseEndTimestamp(course);
  return Number.isFinite(endTimestamp) && endTimestamp <= Date.now();
};

function MentorCoursesPage() {
  const { t, getCourseDirectionDisplayLabel, getCourseTypeLabel } = useI18n();
  const menuAnchorRef = useRef(null);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [activeCourse, setActiveCourse] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(getAuthToken()));
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
  const [errorMessage, setErrorMessage] = useState('');
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [coursesNotice, setCoursesNotice] = useState('');
  const [reloadSeed, setReloadSeed] = useState(0);
  const [userTimeZone, setUserTimeZone] = useState(() => getDefaultTimeZone());
  const [timeZoneLoading, setTimeZoneLoading] = useState(() => !!getAuthToken());
  const [lessonHoursCourse, setLessonHoursCourse] = useState(null);
  const [lessonHoursValue, setLessonHoursValue] = useState('1');
  const [lessonHoursSubmitting, setLessonHoursSubmitting] = useState(false);
  const [lessonHoursError, setLessonHoursError] = useState('');
  const { totalUnreadCount: messageUnreadCount } = useMessageUnreadSummary(isLoggedIn);
  const { newCourseCount: studentNewCourseCount } = useCourseAlertSummary({ enabled: isLoggedIn, view: 'student' });
  const { newCourseCount: mentorNewCourseCount } = useCourseAlertSummary({ enabled: isLoggedIn, view: 'mentor' });
  const totalCourseCount = studentNewCourseCount + mentorNewCourseCount;
  const totalBadgeCount = messageUnreadCount + totalCourseCount;

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
          setErrorMessage(t('courses.mentorLoginRequired', '请先登录导师账号'));
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
        setErrorMessage(res?.data?.error || t('courses.accessDenied', '当前身份暂无访问权限'));
      } catch (e) {
        if (!alive) return;

        const code = e?.response?.status;
        const msg = e?.response?.data?.error || '';
        if (code === 401) {
          setStatus('unauthenticated');
          setErrorMessage(t('courses.mentorLoginRequired', '请先登录导师账号'));
          askLogin();
          return;
        }
        if (code === 403) {
          if (msg && (msg.includes('审核') || msg.toLowerCase().includes('pending'))) {
            setStatus('pending');
          } else {
            setStatus('forbidden');
          }
          setErrorMessage(msg || t('courses.accessDenied', '当前身份暂无访问权限'));
          return;
        }
        setStatus('error');
        setErrorMessage(msg || t('courses.loadFailed', '加载失败，请稍后再试'));
      }
    })();

    return () => { alive = false; };
  }, [isLoggedIn, t]);

  useEffect(() => {
    let alive = true;

    if (!isLoggedIn) {
      setUserTimeZone(getDefaultTimeZone());
      setTimeZoneLoading(false);
      return () => {
        alive = false;
      };
    }

    setTimeZoneLoading(true);

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const nextTimeZone = safeText(res?.data?.availability?.timeZone) || getDefaultTimeZone();
        setUserTimeZone(nextTimeZone);
      })
      .catch(() => {
        if (!alive) return;
        setUserTimeZone(getDefaultTimeZone());
      })
      .finally(() => {
        if (!alive) return;
        setTimeZoneLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;

    if (status !== 'ok') {
      setCourses([]);
      setCoursesLoading(false);
      setCoursesError('');
      setCoursesNotice('');
      return () => {
        alive = false;
      };
    }

    setCoursesLoading(true);
    setCoursesError('');
    setCoursesNotice('');

    Promise.allSettled([
      api.get('/api/courses', { params: { view: 'student' } }),
      api.get('/api/courses', { params: { view: 'mentor' } }),
    ])
      .then(([studentResult, mentorResult]) => {
        if (!alive) return;

        const nextGroups = [];
        const errors = [];

        if (studentResult.status === 'fulfilled') {
          const studentRows = Array.isArray(studentResult.value?.data?.courses) ? studentResult.value.data.courses : [];
          const normalizedStudentRows = studentRows.map(normalizeStudentCourse);
          nextGroups.push(normalizedStudentRows);
          markCoursesAsSeen({ view: 'student', courses: normalizedStudentRows });
        } else {
          errors.push(studentResult.reason?.response?.data?.error || studentResult.reason?.message || t('courses.studentCoursesLoadFailed', '学生课程加载失败'));
        }

        if (mentorResult.status === 'fulfilled') {
          const mentorRows = Array.isArray(mentorResult.value?.data?.courses) ? mentorResult.value.data.courses : [];
          const normalizedMentorRows = mentorRows.map(normalizeMentorCourse);
          nextGroups.push(normalizedMentorRows);
          markCoursesAsSeen({ view: 'mentor', courses: normalizedMentorRows });
        } else {
          errors.push(mentorResult.reason?.response?.data?.error || mentorResult.reason?.message || t('courses.mentorCoursesLoadFailed', '导师课程加载失败'));
        }

        if (!nextGroups.length) {
          setCourses([]);
          setCoursesError(String(errors[0] || t('courses.loadFailed', '加载课程失败，请稍后重试')));
          return;
        }

        setCourses(mergeCoursesById(...nextGroups));
        setCoursesNotice(errors.length ? t('courses.partialLoadFailed', '部分课程加载失败，当前仅显示已成功加载的课程') : '');
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || t('courses.loadFailed', '加载课程失败，请稍后重试');
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
  }, [reloadSeed, status, t]);

  const timelineData = useMemo(() => {
    const sorted = [...courses].sort((a, b) => toDateTimestamp(b) - toDateTimestamp(a));
    const yearMap = new Map();

    sorted.forEach((course) => {
      const displayDateParts = getCourseDisplayDateParts(course, userTimeZone);
      if (!displayDateParts) return;

      const { year, month } = displayDateParts;

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const monthMap = yearMap.get(year);
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month).push({
        ...course,
        month,
        dateText: buildDateTextFromParts(displayDateParts),
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
  }, [courses, userTimeZone]);

  const handleCourseOpen = (course) => setActiveCourse(course);
  const handleCourseClose = () => setActiveCourse(null);
  const handleCardKeyDown = (event, course) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCourseOpen(course);
    }
  };

  const applyLessonHoursResultToCourse = (course, payload = {}) => {
    if (!course) return course;
    const nextMessageId = safeText(payload?.messageId) || safeText(course?.latestLessonHoursMessageId);
    const nextStatus = safeText(payload?.status) || safeText(course?.latestLessonHoursStatus);
    const nextProposedHours = toDurationHours(payload?.proposedHours);

    return {
      ...course,
      latestLessonHoursMessageId: nextMessageId,
      latestLessonHoursStatus: nextStatus.toLowerCase(),
      latestLessonHoursProposedHours: nextProposedHours ?? course?.latestLessonHoursProposedHours ?? null,
    };
  };

  const syncLessonHoursCourseState = (courseId, payload = {}) => {
    const normalizedCourseId = safeText(courseId);
    if (!normalizedCourseId) return;

    setCourses((prev) => prev.map((course) => (
      safeText(course?.id) === normalizedCourseId ? applyLessonHoursResultToCourse(course, payload) : course
    )));
    setActiveCourse((prev) => (
      safeText(prev?.id) === normalizedCourseId ? applyLessonHoursResultToCourse(prev, payload) : prev
    ));
  };

  const handleOpenClassroom = (course) => {
    const courseId = safeText(course?.id);
    if (!courseId || !isScheduledCourse(course) || isCompletedCourse(course)) return;
    window.open(`/classroom/${encodeURIComponent(courseId)}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenReplay = (course) => {
    const replayUrl = safeText(course?.replayUrl);
    if (!replayUrl) {
      window.alert(t('courses.reviewComingSoon', '回访功能即将上线'));
      return;
    }
    window.open(replayUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenLessonHoursDialog = (course) => {
    if (!course) return;
    const latestStatus = safeText(course?.latestLessonHoursStatus).toLowerCase();
    if (latestStatus === 'confirmed' || latestStatus === 'dispute_confirmed' || latestStatus === 'platform_review') return;
    const defaultHours = course?.latestLessonHoursProposedHours ?? course?.durationHours ?? 1;
    setLessonHoursValue(formatQuarterHourValue(defaultHours, '1'));
    setLessonHoursError('');
    setLessonHoursCourse(course);
  };

  const handleCloseLessonHoursDialog = () => {
    if (lessonHoursSubmitting) return;
    setLessonHoursCourse(null);
    setLessonHoursError('');
  };

  const handleSubmitLessonHours = async () => {
    const courseId = safeText(lessonHoursCourse?.id);
    const proposedHours = normalizeQuarterHourValue(lessonHoursValue);
    if (!courseId || proposedHours == null) {
      setLessonHoursError(t('courses.lessonHoursInvalid', '请输入 0.25 小时颗粒度的有效课时'));
      return;
    }

    setLessonHoursSubmitting(true);
    setLessonHoursError('');

    try {
      const response = await api.post(`/api/classrooms/${encodeURIComponent(courseId)}/end-session`, {
        proposedHours,
      });
      const payload = response?.data || {};
      syncLessonHoursCourseState(courseId, payload);
      setLessonHoursCourse(null);
      setReloadSeed((prev) => prev + 1);
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || t('courses.submitLessonHoursFailed', '提交课时失败，请稍后再试');
      setLessonHoursError(String(message));
    } finally {
      setLessonHoursSubmitting(false);
    }
  };

  const toggleMentorAuthModal = () => {
    setShowMentorAuth((prev) => !prev);
  };

  const renderTimeline = () => {
    if (coursesLoading || timeZoneLoading) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-hint">{t('courses.loading', '加载中...')}</p>
        </div>
      );
    }

    if (coursesError) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">{t('courses.loadFailedTitle', '加载失败')}</p>
          <p className="courses-guard-subtitle">{coursesError}</p>
          <div className="courses-guard-actions">
            <button
              type="button"
              className="courses-btn"
              onClick={() => setReloadSeed((v) => v + 1)}
            >
              {t('courses.retry', '重试')}
            </button>
          </div>
        </div>
      );
    }

    if (!timelineData.length) {
      return (
        <div className="courses-guard courses-guard--empty-state">
          <p className="courses-guard-title">{t('courses.emptyTitle', '暂无课程')}</p>
          <p className="courses-guard-subtitle">{t('courses.emptySubtitle', '创建或接受课程后，课程会显示在这里')}</p>
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
                    <span className="month-label">{t('courses.month', `${monthBlock.month}月`, { month: monthBlock.month })}</span>
                  </div>
                  <div className="month-cards" role="list">
                    {monthBlock.courses.map((course) => {
                      const normalizedTitle = normalizeCourseLabel(course.title) || course.title;
                      const typeLabel = safeText(course.type) || '其它课程类型';
                      const displayTitle = getCourseDirectionDisplayLabel(course.directionId || normalizedTitle, normalizedTitle);
                      const displayType = getCourseTypeLabel(course.courseTypeId || typeLabel, typeLabel);
                      const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
                      const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[typeLabel] || FaEllipsisH;
                      const isPast = isCompletedCourse(course);
                      return (
                        <article
                          className="course-card"
                          key={course.id}
                          role="listitem"
                          tabIndex={0}
                          onClick={() => handleCourseOpen(course)}
                          onKeyDown={(event) => handleCardKeyDown(event, course)}
                          aria-label={`${displayTitle} ${displayType}`}
                        >
                          <div className="course-head">
                            <div className="course-title-wrap">
                              <span className={`course-status ${isPast ? 'course-status--done' : ''}`}>
                                {isPast ? '\u2713' : ''}
                              </span>
                              <span className="course-title-icon">
                                <TitleIcon size={20} />
                              </span>
                              <span className="course-title">{displayTitle}</span>
                            </div>
                          </div>
                          <div className="course-type-row">
                            <span className="course-pill">
                              <span className="course-pill-icon">
                                <TypeIcon size={14} />
                              </span>
                              <span>{displayType}</span>
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
          <p className="courses-guard-hint">{t('courses.loading', '加载中...')}</p>
        </div>
      );
    }

    if (status === 'unauthenticated') {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">{t('courses.mentorLoginRequired', '请先登录导师账号')}</p>
          <p className="courses-guard-subtitle">{t('courses.mentorCalendarHint', '登录后即可访问导师课程日历')}</p>
          <div className="courses-guard-actions">
            <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>{t('courses.loginOrRegister', '登录 / 注册')}</button>
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
            <div className="mentor-pending-title">{t('courses.mentorReadyTitle', '你已准备就绪')}</div>
            <div className="mentor-pending-subtitle">
              {t('courses.mentorReadyDesc', '我们会尽快完成导师审核，审核通过后即可访问导师课程页面')}
            </div>
          </div>
        </div>
      );
    }

    if (status === 'forbidden') {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">{t('courses.mentorOnlyTitle', '仅导师可访问')}</p>
          <p className="courses-guard-subtitle">{errorMessage || t('courses.mentorOnlyHint', '请使用导师身份登录后查看')}</p>
          <div className="courses-guard-actions">
            <button type="button" className="courses-btn" onClick={() => setShowMentorAuth(true)}>{t('courses.switchAccount', '切换账号')}</button>
          </div>
        </div>
      );
    }

    return (
      <div className="courses-guard">
        <p className="courses-guard-title">{t('courses.loadFailedTitle', '加载失败')}</p>
        <p className="courses-guard-subtitle">{errorMessage || t('courses.tryAgain', '请稍后重试')}</p>
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
            className="icon-circle courses-menu nav-menu-trigger"
            aria-label={t('common.menuMore', '更多菜单')}
            ref={menuAnchorRef}
            onClick={toggleMentorAuthModal}
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
            {isLoggedIn ? (
              <UnreadBadge count={totalBadgeCount} variant="nav" className="nav-unread-badge" ariaLabel={t('common.pendingReminders', '待处理提醒')} />
            ) : null}
          </button>
        </header>

        <section className="courses-hero">
          <h1>{t('courses.title', '课程')}</h1>
        </section>

        {status === 'ok' && coursesNotice ? <div className="courses-alert">{coursesNotice}</div> : null}

        {status === 'ok' ? renderTimeline() : renderStatusGuard()}
      </div>

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          unreadCount={messageUnreadCount}
          courseCount={totalCourseCount}
          align="right"
          alignOffset={23}
        />
      )}

      {activeCourse && (() => {
        const normalizedTitle = normalizeCourseLabel(activeCourse.title) || activeCourse.title;
        const typeLabel = safeText(activeCourse.type) || '其它课程类型';
        const displayTitle = getCourseDirectionDisplayLabel(activeCourse.directionId || normalizedTitle, normalizedTitle);
        const displayType = getCourseTypeLabel(activeCourse.courseTypeId || typeLabel, typeLabel);
        const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
        const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[typeLabel] || FaEllipsisH;
        const isCompleted = isCompletedCourse(activeCourse);
        const canEnterClassroom = isScheduledCourse(activeCourse) && !isCompletedCourse(activeCourse);
        const lessonHoursLocked = ['confirmed', 'dispute_confirmed', 'platform_review'].includes(
          safeText(activeCourse?.latestLessonHoursStatus).toLowerCase()
        );

        return (
          <CourseDetailModal
            participantName={activeCourse.counterpartName || activeCourse.studentName}
            avatarUrl={activeCourse.counterpartAvatar || activeCourse.studentAvatar}
            title={displayTitle}
            TitleIcon={TitleIcon}
            typeLabel={displayType}
            TypeIcon={TypeIcon}
            dateLabel={getCourseDisplayDateText(activeCourse, userTimeZone)}
            durationLabel={activeCourse.duration}
            onClose={handleCourseClose}
            actions={isCompleted ? (
              <div className="course-detail-action-row">
                <Button
                  className="course-detail-classroom-btn course-detail-classroom-btn--secondary"
                  onClick={() => handleOpenReplay(activeCourse)}
                >
                  {t('courses.viewReplay', '查看回放')}
                </Button>
                <Button
                  className="course-detail-classroom-btn course-detail-classroom-btn--ghost"
                  onClick={() => handleOpenLessonHoursDialog(activeCourse)}
                  disabled={lessonHoursSubmitting || lessonHoursLocked}
                  title={lessonHoursLocked ? t('courses.lessonHoursLocked', '学生已确认课时，当前不可修改') : ''}
                >
                  {t('courses.fillLessonHours', '填写课时')}
                </Button>
              </div>
            ) : (
              <Button
                className="course-detail-classroom-btn"
                onClick={() => handleOpenClassroom(activeCourse)}
                disabled={!canEnterClassroom}
              >
                {t('courses.enterClassroom', '进入课堂')}
              </Button>
            )}
          />
        );
      })()}

      <LessonHoursDialog
        open={Boolean(lessonHoursCourse)}
        title={t('courses.submitLessonHoursTitle', '提交本节课实际课时')}
        value={lessonHoursValue}
        onValueChange={setLessonHoursValue}
        error={lessonHoursError}
        submitting={lessonHoursSubmitting}
        onClose={handleCloseLessonHoursDialog}
        onSubmit={handleSubmitLessonHours}
      />
    </div>
  );
}

export default MentorCoursesPage;
