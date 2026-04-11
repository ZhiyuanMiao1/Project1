import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import Button from '../../components/common/Button/Button';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import CourseDetailModal from '../../components/CourseDetailModal/CourseDetailModal';
import CourseReviewModal from '../../components/CourseReviewModal/CourseReviewModal';
import SuccessModal from '../../components/SuccessModal/SuccessModal';
import api from '../../api/client';
import useCourseAlertSummary, { markCoursesAsSeen } from '../../hooks/useCourseAlertSummary';
import useMessageUnreadSummary from '../../hooks/useMessageUnreadSummary';
import {
  COURSE_TYPE_ID_TO_LABEL,
  COURSE_TYPE_LABEL_ICON_MAP,
  DIRECTION_LABEL_ICON_MAP,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import { getAuthToken } from '../../utils/authStorage';
import { getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';
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

const toRating = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
};

const normalizeReviewComment = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeReviewScores = (source) => {
  if (!source || typeof source !== 'object') return null;
  const keys = ['clarity', 'communication', 'preparation', 'expertise', 'punctuality'];
  const next = {};

  for (const key of keys) {
    const value = Number(source?.[key]);
    if (!Number.isFinite(value) || value < 1 || value > 5) return null;
    next[key] = value;
  }

  return next;
};

const hasSubmittedReview = (course) => Boolean(safeText(course?.reviewSubmittedAt));

const normalizeStudentCourse = (row) => {
  const directionId = safeText(row?.courseDirectionId || row?.course_direction || row?.title);
  const courseTypeId = safeText(row?.courseTypeId || row?.course_type);
  const fallbackTitle = safeText(row?.title);

  const title = normalizeCourseLabel(directionId)
    || normalizeCourseLabel(fallbackTitle)
    || fallbackTitle
    || '其他课程方向';

  const type = COURSE_TYPE_ID_TO_LABEL[courseTypeId]
    || safeText(row?.type)
    || '其他课程类型';

  const date = toDateKey(row?.date, row?.startsAt || row?.starts_at);
  const startsAt = safeText(row?.startsAt || row?.starts_at);
  const durationHours = toDurationHours(row?.durationHours ?? row?.duration_hours);

  return {
    id: safeText(row?.id) || `${date || 'unknown'}-${directionId || title}`,
    roleInCourse: 'student',
    title,
    type,
    date,
    startsAt,
    duration: toDurationText(durationHours, row?.duration),
    durationHours,
    mentorName: safeText(row?.counterpartName || row?.mentorName || row?.counterpartPublicId) || '导师',
    mentorAvatar: safeText(row?.counterpartAvatarUrl || row?.mentorAvatar),
    mentorPublicId: safeText(row?.counterpartPublicId || row?.mentorPublicId),
    counterpartName: safeText(row?.counterpartName || row?.mentorName || row?.counterpartPublicId) || '导师',
    counterpartAvatar: safeText(row?.counterpartAvatarUrl || row?.mentorAvatar),
    rating: toRating(row?.counterpartRating ?? row?.rating),
    counterpartRating: toRating(row?.counterpartRating ?? row?.rating),
    replayUrl: safeText(row?.replayUrl || row?.replay_url),
    reviewSubmittedAt: safeText(row?.reviewSubmittedAt || row?.review_submitted_at),
    reviewUpdatedAt: safeText(row?.reviewUpdatedAt || row?.review_updated_at),
    reviewScores: normalizeReviewScores(row?.reviewScores || row?.review_scores),
    reviewOverallScore: toRating(row?.reviewOverallScore ?? row?.review_overall_score),
    reviewComment: normalizeReviewComment(row?.reviewComment ?? row?.review_comment),
    status: safeText(row?.status).toLowerCase(),
  };
};

const normalizeMentorCourse = (row) => {
  const directionId = safeText(row?.courseDirectionId || row?.course_direction || row?.title);
  const courseTypeId = safeText(row?.courseTypeId || row?.course_type);
  const fallbackTitle = safeText(row?.title);

  const title = normalizeCourseLabel(directionId)
    || normalizeCourseLabel(fallbackTitle)
    || fallbackTitle
    || '其他课程方向';

  const type = COURSE_TYPE_ID_TO_LABEL[courseTypeId]
    || safeText(row?.type)
    || '其他课程类型';

  const date = toDateKey(row?.date, row?.startsAt || row?.starts_at);
  const startsAt = safeText(row?.startsAt || row?.starts_at);
  const durationHours = toDurationHours(row?.durationHours ?? row?.duration_hours);
  const counterpartName = safeText(row?.counterpartName || row?.studentName || row?.counterpartPublicId) || '学生';
  const counterpartAvatar = safeText(row?.counterpartAvatarUrl || row?.studentAvatar);

  return {
    id: safeText(row?.id) || `${date || 'unknown'}-${directionId || title}`,
    roleInCourse: 'mentor',
    title,
    type,
    date,
    startsAt,
    duration: toDurationText(durationHours, row?.duration),
    durationHours,
    mentorName: counterpartName,
    mentorAvatar: counterpartAvatar,
    counterpartName,
    counterpartAvatar,
    rating: null,
    counterpartRating: null,
    replayUrl: safeText(row?.replayUrl || row?.replay_url),
    reviewSubmittedAt: '',
    reviewUpdatedAt: '',
    reviewScores: null,
    reviewOverallScore: null,
    reviewComment: '',
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

const hasEnoughLessonHours = (course, remainingHours) => {
  const requiredHours = toDurationHours(course?.durationHours);
  if (requiredHours == null) return true;

  const normalizedRemainingHours = typeof remainingHours === 'number' ? remainingHours : Number(remainingHours);
  if (!Number.isFinite(normalizedRemainingHours)) return false;

  return normalizedRemainingHours + 1e-6 >= requiredHours;
};

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

const getReviewSuccessCopy = (message) => {
  if (message === 'review_updated') {
    return {
      title: '评价已更新',
      description: '你的评价已更新，新的评分结果已经覆盖之前的记录。',
    };
  }

  return {
    title: '感谢反馈',
    description: '你的评价已成功提交，我们会认真参考你的反馈持续优化导师服务。',
  };
};

function CoursesPage() {
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [activeCourse, setActiveCourse] = useState(null);
  const [reviewCourse, setReviewCourse] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [courses, setCourses] = useState([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitError, setReviewSubmitError] = useState('');
  const [showReviewThanks, setShowReviewThanks] = useState(false);
  const [reviewSuccessCopy, setReviewSuccessCopy] = useState(() => getReviewSuccessCopy('review_submitted'));
  const [userTimeZone, setUserTimeZone] = useState(() => getDefaultTimeZone());
  const [walletSummary, setWalletSummary] = useState(() => ({
    remainingHours: 0,
    monthTopUpCny: 0,
    totalTopUpCny: 0,
  }));
  const [walletSummaryStatus, setWalletSummaryStatus] = useState('idle');
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

    if (!getAuthToken()) {
      setUserTimeZone(getDefaultTimeZone());
      return () => {
        alive = false;
      };
    }

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const nextTimeZone = safeText(res?.data?.availability?.timeZone) || getDefaultTimeZone();
        setUserTimeZone(nextTimeZone);
      })
      .catch(() => {
        if (!alive) return;
        setUserTimeZone(getDefaultTimeZone());
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;

    if (!isLoggedIn) {
      setWalletSummary({
        remainingHours: 0,
        monthTopUpCny: 0,
        totalTopUpCny: 0,
      });
      setWalletSummaryStatus('idle');
      return () => {
        alive = false;
      };
    }

    setWalletSummaryStatus('loading');

    api.get('/api/account/wallet-summary')
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        setWalletSummary({
          remainingHours: Number(data?.remainingHours) || 0,
          monthTopUpCny: Number(data?.monthTopUpCny) || 0,
          totalTopUpCny: Number(data?.totalTopUpCny) || 0,
        });
        setWalletSummaryStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setWalletSummaryStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;

    if (!isLoggedIn) {
      setCourses([]);
      setLoading(false);
      setLoadFailed(false);
      setActiveCourse(null);
      setReviewCourse(null);
      setReviewSubmitting(false);
      setReviewSubmitError('');
      setShowReviewThanks(false);
      setErrorMessage('请登录后查看课程');
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    setLoadFailed(false);
    setErrorMessage('');

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
          errors.push(studentResult.reason?.response?.data?.error || studentResult.reason?.message || '学生课程加载失败');
        }

        if (mentorResult.status === 'fulfilled') {
          const mentorRows = Array.isArray(mentorResult.value?.data?.courses) ? mentorResult.value.data.courses : [];
          const normalizedMentorRows = mentorRows.map(normalizeMentorCourse);
          nextGroups.push(normalizedMentorRows);
          markCoursesAsSeen({ view: 'mentor', courses: normalizedMentorRows });
        } else {
          errors.push(mentorResult.reason?.response?.data?.error || mentorResult.reason?.message || '导师课程加载失败');
        }

        if (!nextGroups.length) {
          setCourses([]);
          setLoadFailed(true);
          setErrorMessage(String(errors[0] || '加载课程失败，请稍后重试'));
          return;
        }

        setCourses(mergeCoursesById(...nextGroups));
        setErrorMessage(errors.length ? '部分课程加载失败，当前仅显示已成功加载的课程。' : '');
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || '加载课程失败，请稍后重试';
        setCourses([]);
        setLoadFailed(true);
        setErrorMessage(String(msg));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

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

  const applyReviewResultToCourse = (course, payload = {}) => {
    if (!course) return course;
    const nextSubmittedAt = safeText(payload?.reviewSubmittedAt) || safeText(course?.reviewSubmittedAt) || new Date().toISOString();
    const nextUpdatedAt = safeText(payload?.reviewUpdatedAt) || nextSubmittedAt;
    const nextScores = normalizeReviewScores(payload?.reviewScores) || normalizeReviewScores(course?.reviewScores);
    const nextOverallScore = toRating(payload?.reviewOverallScore ?? course?.reviewOverallScore);
    const nextRating = toRating(payload?.mentorRating ?? course?.rating ?? course?.counterpartRating);
    const nextComment = normalizeReviewComment(payload?.reviewComment ?? course?.reviewComment);

    return {
      ...course,
      reviewSubmittedAt: nextSubmittedAt,
      reviewUpdatedAt: nextUpdatedAt,
      reviewScores: nextScores,
      reviewOverallScore: nextOverallScore,
      reviewComment: nextComment,
      rating: nextRating ?? course?.rating ?? null,
      counterpartRating: nextRating ?? course?.counterpartRating ?? null,
    };
  };

  const syncReviewedCourseState = (courseId, payload = {}) => {
    const normalizedCourseId = safeText(courseId);
    if (!normalizedCourseId) return;

    setCourses((prev) => prev.map((course) => (
      safeText(course?.id) === normalizedCourseId ? applyReviewResultToCourse(course, payload) : course
    )));
    setActiveCourse((prev) => (
      safeText(prev?.id) === normalizedCourseId ? applyReviewResultToCourse(prev, payload) : prev
    ));
    setReviewCourse((prev) => (
      safeText(prev?.id) === normalizedCourseId ? applyReviewResultToCourse(prev, payload) : prev
    ));
  };

  const handleCardKeyDown = (event, course) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCourseOpen(course);
    }
  };

  const handleOpenClassroom = (course) => {
    const courseId = safeText(course?.id);
    if (!courseId || !isScheduledCourse(course)) return;
    window.open(`/classroom/${encodeURIComponent(courseId)}`, '_blank', 'noopener,noreferrer');
  };

  const handleOpenWallet = (course) => {
    const requiredHours = toDurationHours(course?.durationHours);
    navigate('/student/wallet', {
      state: {
        from: 'student-courses',
        courseId: safeText(course?.id),
        requiredHours,
        remainingHours: Number(walletSummary?.remainingHours) || 0,
      },
    });
  };

  const handleOpenReplay = (course) => {
    const replayUrl = safeText(course?.replayUrl);
    if (!replayUrl) {
      window.alert('回放功能即将上线');
      return;
    }
    window.open(replayUrl, '_blank', 'noopener,noreferrer');
  };

  const toggleStudentAuthModal = () => {
    setShowStudentAuth((prev) => !prev);
  };

  const handleReviewClose = () => {
    if (reviewSubmitting) return;
    setReviewCourse(null);
    setReviewSubmitError('');
  };

  const handleReviewThanksClose = () => setShowReviewThanks(false);

  const handleOpenReview = (course) => {
    if (course?.roleInCourse && course.roleInCourse !== 'student') return;
    setReviewSubmitError('');
    setReviewCourse(course);
  };

  const handleReviewSubmit = async (reviewForm) => {
    const courseId = safeText(reviewCourse?.id);
    if (!courseId || reviewSubmitting || reviewCourse?.roleInCourse === 'mentor') return;

    setReviewSubmitting(true);
    setReviewSubmitError('');

    try {
      const response = await api.post(`/api/courses/${encodeURIComponent(courseId)}/review`, reviewForm);
      const payload = response?.data || {};
      syncReviewedCourseState(courseId, payload);
      setReviewSuccessCopy(getReviewSuccessCopy(payload?.message));
      setReviewCourse(null);
      setShowReviewThanks(true);
    } catch (err) {
      const payload = err?.response?.data || {};
      const errorCode = safeText(payload?.error);

      const messageMap = {
        invalid_course_id: '课程信息无效，请刷新后重试。',
        invalid_review_scores: '请为每个评价维度选择 1 到 5 分。',
        invalid_review_comment: '文字评价最多可填写 1000 个字符。',
        course_not_found: '未找到这节课程，暂时无法评价。',
        course_not_completed: '课程尚未结束，暂时还不能评价。',
        submit_review_failed: '提交评价失败，请稍后再试。',
      };

      setReviewSubmitError(messageMap[errorCode] || err?.message || '提交评价失败，请稍后再试。');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const renderTimeline = () => {
    if (loading) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-hint">加载中...</p>
        </div>
      );
    }

    if (loadFailed) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">加载失败</p>
          <p className="courses-guard-subtitle">{errorMessage || '请稍后重试。'}</p>
        </div>
      );
    }

    if (!timelineData.length) {
      return (
        <div className="courses-guard courses-guard--empty-state">
          <p className="courses-guard-title">暂无课程</p>
          <p className="courses-guard-subtitle">创建或接受课程后，课程会显示在这里</p>
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
                      const typeLabel = safeText(course.type) || '其他课程类型';
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

  return (
    <div className="courses-page">
      <div className="container">
        <header className="courses-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle courses-menu nav-menu-trigger"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={toggleStudentAuthModal}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {isLoggedIn ? (
              <UnreadBadge count={totalBadgeCount} variant="nav" className="nav-unread-badge" ariaLabel="待处理提醒" />
            ) : null}
          </button>
        </header>

        <section className="courses-hero">
          <h1>课程</h1>
        </section>

        {errorMessage && !loadFailed ? <div className="courses-alert">{errorMessage}</div> : null}

        {isLoggedIn ? renderTimeline() : null}
      </div>

      {showStudentAuth ? (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          unreadCount={messageUnreadCount}
          courseCount={totalCourseCount}
          align="right"
          alignOffset={23}
        />
      ) : null}

      {activeCourse ? (() => {
        const normalizedTitle = normalizeCourseLabel(activeCourse.title) || activeCourse.title;
        const typeLabel = safeText(activeCourse.type) || '其他课程类型';
        const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedTitle] || FaEllipsisH;
        const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[typeLabel] || FaEllipsisH;
        const ratingValue = activeCourse.roleInCourse === 'student'
          ? toRating(activeCourse.counterpartRating ?? activeCourse.rating)
          : null;
        const isCompleted = isCompletedCourse(activeCourse);
        const isReviewed = activeCourse.roleInCourse === 'student' && hasSubmittedReview(activeCourse);
        const isUpcomingScheduledCourse = isScheduledCourse(activeCourse) && !isCompleted;
        const requiresLessonHourCheck = activeCourse.roleInCourse === 'student' && isUpcomingScheduledCourse;
        const hasSufficientLessonHours = requiresLessonHourCheck
          ? hasEnoughLessonHours(activeCourse, walletSummary?.remainingHours)
          : true;
        const shouldRedirectToWallet = requiresLessonHourCheck
          && walletSummaryStatus === 'loaded'
          && !hasSufficientLessonHours;
        const canEnterClassroom = isUpcomingScheduledCourse
          && (!requiresLessonHourCheck || (walletSummaryStatus === 'loaded' && hasSufficientLessonHours));
        const classroomButtonLabel = (() => {
          if (!isUpcomingScheduledCourse) return '进入课堂';
          if (!requiresLessonHourCheck) return '进入课堂';
          if (walletSummaryStatus === 'loading' || walletSummaryStatus === 'idle') return '检查课时中...';
          if (walletSummaryStatus === 'error') return '课时信息加载失败';
          if (shouldRedirectToWallet) return '前往充值';
          return '进入课堂';
        })();
        const classroomButtonDisabled = !canEnterClassroom && !shouldRedirectToWallet;

        return (
          <CourseDetailModal
            participantName={activeCourse.counterpartName || activeCourse.mentorName}
            avatarUrl={activeCourse.counterpartAvatar || activeCourse.mentorAvatar}
            ratingValue={ratingValue}
            title={normalizedTitle}
            TitleIcon={TitleIcon}
            typeLabel={typeLabel}
            TypeIcon={TypeIcon}
            dateLabel={getCourseDisplayDateText(activeCourse, userTimeZone)}
            durationLabel={activeCourse.duration}
            onClose={handleCourseClose}
            actions={isCompleted && activeCourse.roleInCourse === 'student' ? (
              <div className="course-detail-action-row">
                <Button
                  className="course-detail-classroom-btn course-detail-classroom-btn--secondary"
                  onClick={() => handleOpenReplay(activeCourse)}
                >
                  查看回放
                </Button>
                <Button
                  className="course-detail-classroom-btn course-detail-classroom-btn--ghost"
                  onClick={() => handleOpenReview(activeCourse)}
                  disabled={reviewSubmitting}
                >
                  {isReviewed ? '我的评价' : '评价导师'}
                </Button>
              </div>
            ) : (
              <Button
                className="course-detail-classroom-btn"
                onClick={() => (shouldRedirectToWallet ? handleOpenWallet(activeCourse) : handleOpenClassroom(activeCourse))}
                disabled={classroomButtonDisabled}
              >
                {classroomButtonLabel}
              </Button>
            )}
          />
        );
      })() : null}

      {reviewCourse ? (
        <CourseReviewModal
          course={reviewCourse}
          onClose={handleReviewClose}
          onSubmit={handleReviewSubmit}
          isSubmitting={reviewSubmitting}
          submitError={reviewSubmitError}
        />
      ) : null}

      <SuccessModal
        open={showReviewThanks}
        title={reviewSuccessCopy.title}
        description={reviewSuccessCopy.description}
        autoCloseMs={2200}
        onClose={handleReviewThanksClose}
      />
    </div>
  );
}

export default CoursesPage;
