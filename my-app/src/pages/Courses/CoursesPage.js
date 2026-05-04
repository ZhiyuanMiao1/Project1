import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEllipsisH } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import Button from '../../components/common/Button/Button';
import LoadingText from '../../components/common/LoadingText/LoadingText';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import CourseDetailModal from '../../components/CourseDetailModal/CourseDetailModal';
import CourseReplayModal from '../../components/CourseReplayModal/CourseReplayModal';
import CourseReviewModal from '../../components/CourseReviewModal/CourseReviewModal';
import LessonHoursDialog from '../../components/LessonHoursDialog/LessonHoursDialog';
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

const formatTimeParts = (parts) => {
  if (!parts || !Number.isFinite(parts.hour) || !Number.isFinite(parts.minute)) return '';
  const hour = parts.hour === 24 ? 0 : parts.hour;
  return `${pad2(hour)}:${pad2(parts.minute)}`;
};

const getCourseDisplayTimeText = (course, timeZone = getDefaultTimeZone()) => {
  const startsAt = safeText(course?.startsAt);
  if (!startsAt) return '';

  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) return '';

  const startText = formatTimeParts(getZonedParts(timeZone, startDate));
  if (!startText) return '';

  const durationHours = toDurationHours(course?.durationHours);
  if (durationHours == null) return startText;

  const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
  if (Number.isNaN(endDate.getTime())) return startText;

  const endText = formatTimeParts(getZonedParts(timeZone, endDate));
  return endText ? `${startText}-${endText}` : startText;
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
    directionId,
    courseTypeId,
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
    latestLessonHoursMessageId: safeText(row?.latestLessonHoursMessageId || row?.latest_lesson_hours_message_id),
    latestLessonHoursStatus: safeText(row?.latestLessonHoursStatus || row?.latest_lesson_hours_status).toLowerCase(),
    latestLessonHoursProposedHours: toDurationHours(
      row?.latestLessonHoursProposedHours ?? row?.latest_lesson_hours_proposed_hours
    ),
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
    directionId,
    courseTypeId,
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

const getReviewSuccessCopy = (message, t = (_key, fallback) => fallback) => {
  if (message === 'review_updated') {
    return {
      title: t('courses.reviewUpdatedTitle', '评价已更新'),
      description: t('courses.reviewUpdatedDesc', '你的评价已更新，新的评分结果已经覆盖之前的记录'),
    };
  }

  return {
    title: t('courses.reviewSubmittedTitle', '感谢反馈'),
    description: t('courses.reviewSubmittedDesc', '你的评价已成功提交，我们会认真参考你的反馈持续优化导师服务'),
  };
};

function CoursesPage() {
  const { t, getCourseDirectionDisplayLabel, getCourseTypeLabel } = useI18n();
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
  const [reviewSuccessCopy, setReviewSuccessCopy] = useState(() => getReviewSuccessCopy('review_submitted', t));
  const [userTimeZone, setUserTimeZone] = useState(() => getDefaultTimeZone());
  const [timeZoneLoading, setTimeZoneLoading] = useState(() => !!getAuthToken());
  const [lessonHoursCourse, setLessonHoursCourse] = useState(null);
  const [lessonHoursValue, setLessonHoursValue] = useState('1');
  const [lessonHoursSubmitting, setLessonHoursSubmitting] = useState(false);
  const [lessonHoursError, setLessonHoursError] = useState('');
  const [replayCourse, setReplayCourse] = useState(null);
  const [replayFiles, setReplayFiles] = useState([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');
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
      setLessonHoursCourse(null);
      setLessonHoursValue('1');
      setLessonHoursSubmitting(false);
      setLessonHoursError('');
      setReplayCourse(null);
      setReplayFiles([]);
      setReplayLoading(false);
      setReplayError('');
      setErrorMessage(t('courses.loginRequired', '请登录后查看课程'));
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
          errors.push(studentResult.reason?.response?.data?.error || studentResult.reason?.message || t('courses.studentLoadFailed', '学生课程加载失败'));
        }

        if (mentorResult.status === 'fulfilled') {
          const mentorRows = Array.isArray(mentorResult.value?.data?.courses) ? mentorResult.value.data.courses : [];
          const normalizedMentorRows = mentorRows.map(normalizeMentorCourse);
          nextGroups.push(normalizedMentorRows);
          markCoursesAsSeen({ view: 'mentor', courses: normalizedMentorRows });
        } else {
          errors.push(mentorResult.reason?.response?.data?.error || mentorResult.reason?.message || t('courses.mentorLoadFailed', '导师课程加载失败'));
        }

        if (!nextGroups.length) {
          setCourses([]);
          setLoadFailed(true);
          setErrorMessage(String(errors[0] || t('courses.loadFailed', '加载课程失败，请稍后重试')));
          return;
        }

        setCourses(mergeCoursesById(...nextGroups));
        setErrorMessage(errors.length ? t('courses.partialLoadFailed', '部分课程加载失败，当前仅显示已成功加载的课程') : '');
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || t('courses.loadFailed', '加载课程失败，请稍后重试');
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
  }, [isLoggedIn, t]);

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

  const syncLessonHoursCourseState = (courseId, payload = {}) => {
    const normalizedCourseId = safeText(courseId);
    if (!normalizedCourseId) return;

    setCourses((prev) => prev.map((course) => (
      safeText(course?.id) === normalizedCourseId ? applyLessonHoursResultToCourse(course, payload) : course
    )));
    setActiveCourse((prev) => (
      safeText(prev?.id) === normalizedCourseId ? applyLessonHoursResultToCourse(prev, payload) : prev
    ));
    setLessonHoursCourse((prev) => (
      safeText(prev?.id) === normalizedCourseId ? applyLessonHoursResultToCourse(prev, payload) : prev
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

  const getReplayLoadErrorMessage = (error) => {
    const code = safeText(error?.response?.data?.error);
    const messageMap = {
      invalid_course_id: t('courses.invalidCourseId', '课程信息无效，请刷新后重试'),
      recording_storage_unconfigured: t('courses.replayStorageUnconfigured', '回放存储暂未配置，请稍后再试'),
      server_error: t('courses.replayLoadFailed', '回放加载失败'),
    };
    return messageMap[code] || code || error?.message || t('courses.replayLoadFailed', '回放加载失败');
  };

  const loadReplayFiles = async (course) => {
    const courseId = safeText(course?.id);
    if (!courseId) return;

    setReplayCourse(course);
    setReplayFiles([]);
    setReplayLoading(true);
    setReplayError('');

    try {
      const response = await api.get(`/api/courses/${encodeURIComponent(courseId)}/replay-files`);
      const files = Array.isArray(response?.data?.files) ? response.data.files : [];
      setReplayFiles(files);
    } catch (error) {
      setReplayError(getReplayLoadErrorMessage(error));
    } finally {
      setReplayLoading(false);
    }
  };

  const handleOpenReplay = (course) => {
    void loadReplayFiles(course);
  };

  const handleReplayRetry = () => {
    if (!replayCourse) return;
    void loadReplayFiles(replayCourse);
  };

  const handleReplayClose = () => {
    if (replayLoading) return;
    setReplayCourse(null);
    setReplayFiles([]);
    setReplayError('');
  };

  const toggleStudentAuthModal = () => {
    setShowStudentAuth((prev) => !prev);
  };

  const handleReviewClose = () => {
    if (reviewSubmitting) return;
    setReviewCourse(null);
    setReviewSubmitError('');
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
      setReviewSuccessCopy(getReviewSuccessCopy(payload?.message, t));
      setReviewCourse(null);
      setShowReviewThanks(true);
    } catch (err) {
      const payload = err?.response?.data || {};
      const errorCode = safeText(payload?.error);

      const messageMap = {
        invalid_course_id: t('courses.invalidCourseId', '课程信息无效，请刷新后重试'),
        invalid_review_scores: t('courses.invalidReviewScores', '请为每个评价维度选择 1 到 5 分'),
        invalid_review_comment: t('courses.invalidReviewComment', '文字评价最多可填写 1000 个字符'),
        course_not_found: t('courses.courseNotFound', '未找到这节课程，暂时无法评价'),
        course_not_completed: t('courses.courseNotCompleted', '课程尚未结束，暂时还不能评价'),
        submit_review_failed: t('courses.submitReviewFailed', '提交评价失败，请稍后再试'),
      };

      setReviewSubmitError(messageMap[errorCode] || err?.message || t('courses.submitReviewFailed', '提交评价失败，请稍后再试'));
    } finally {
      setReviewSubmitting(false);
    }
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
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || t('courses.submitLessonHoursFailed', '提交课时失败，请稍后再试');
      setLessonHoursError(String(msg));
    } finally {
      setLessonHoursSubmitting(false);
    }
  };

  const renderTimeline = () => {
    if (loading || timeZoneLoading) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-hint"><LoadingText text={t('courses.loading', '加载中...')} /></p>
        </div>
      );
    }

    if (loadFailed) {
      return (
        <div className="courses-guard">
          <p className="courses-guard-title">{t('courses.loadFailedTitle', '加载失败')}</p>
          <p className="courses-guard-subtitle">{errorMessage || t('courses.tryAgain', '请稍后重试')}</p>
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
                      const typeLabel = safeText(course.type) || '其他课程类型';
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

  return (
    <div className="courses-page">
      <div className="container">
        <header className="courses-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle courses-menu nav-menu-trigger"
            aria-label={t('common.menuMore', '更多菜单')}
            ref={menuAnchorRef}
            onClick={toggleStudentAuthModal}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
        const displayTitle = getCourseDirectionDisplayLabel(activeCourse.directionId || normalizedTitle, normalizedTitle);
        const displayType = getCourseTypeLabel(activeCourse.courseTypeId || typeLabel, typeLabel);
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
        const lessonHoursLocked = ['confirmed', 'dispute_confirmed', 'platform_review'].includes(
          safeText(activeCourse?.latestLessonHoursStatus).toLowerCase()
        );
        const classroomButtonLabel = (() => {
          if (!isUpcomingScheduledCourse) return t('courses.enterClassroom', '进入课堂');
          if (!requiresLessonHourCheck) return t('courses.enterClassroom', '进入课堂');
          if (walletSummaryStatus === 'loading' || walletSummaryStatus === 'idle') return <LoadingText text={t('courses.checkingHours', '检查课时中...')} />;
          if (walletSummaryStatus === 'error') return t('courses.hoursLoadFailed', '课时信息加载失败');
          if (shouldRedirectToWallet) return t('courses.goTopUp', '前往充值');
          return t('courses.enterClassroom', '进入课堂');
        })();
        const classroomButtonDisabled = !canEnterClassroom && !shouldRedirectToWallet;

        return (
          <CourseDetailModal
            participantName={activeCourse.counterpartName || activeCourse.mentorName}
            avatarUrl={activeCourse.counterpartAvatar || activeCourse.mentorAvatar}
            ratingValue={ratingValue}
            title={displayTitle}
            TitleIcon={TitleIcon}
            typeLabel={displayType}
            TypeIcon={TypeIcon}
            dateLabel={getCourseDisplayDateText(activeCourse, userTimeZone)}
            timeLabel={getCourseDisplayTimeText(activeCourse, userTimeZone)}
            durationLabel={activeCourse.duration}
            onClose={handleCourseClose}
            actions={isCompleted ? (
              activeCourse.roleInCourse === 'student' ? (
                <div className="course-detail-action-row">
                  <Button
                    className="course-detail-classroom-btn course-detail-classroom-btn--secondary"
                    onClick={() => handleOpenReplay(activeCourse)}
                  >
                    {t('courses.viewReplay', '查看回放')}
                  </Button>
                  <Button
                    className="course-detail-classroom-btn course-detail-classroom-btn--ghost"
                    onClick={() => handleOpenReview(activeCourse)}
                    disabled={reviewSubmitting}
                  >
                    {isReviewed ? t('courses.myReview', '我的评价') : t('courses.reviewMentor', '评价导师')}
                  </Button>
                </div>
              ) : (
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
              )
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

      <CourseReplayModal
        open={Boolean(replayCourse)}
        title={safeText(replayCourse?.title)}
        files={replayFiles}
        loading={replayLoading}
        error={replayError}
        onClose={handleReplayClose}
        onRetry={handleReplayRetry}
      />

      {reviewCourse ? (
        <CourseReviewModal
          course={reviewCourse}
          onClose={handleReviewClose}
          onSubmit={handleReviewSubmit}
          isSubmitting={reviewSubmitting}
          submitError={reviewSubmitError}
        />
      ) : null}

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
