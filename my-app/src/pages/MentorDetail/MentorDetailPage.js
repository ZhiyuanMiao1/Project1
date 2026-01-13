import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  FiAward,
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiClock,
  FiMessageCircle,
  FiPlus,
  FiX,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import api from '../../api/client';
import { fetchApprovedMentors } from '../../api/mentors';
import { fetchFavoriteItems } from '../../api/favorites';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import { getAuthToken } from '../../utils/authStorage';
import { buildShortUTC, convertSelectionsBetweenTimeZones, getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';
import './MentorDetailPage.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

const RATING_CATEGORY_SPECS = [
  { key: 'clarity', label: '讲解清晰', Icon: FiBookOpen },
  { key: 'communication', label: '沟通顺畅', Icon: FiMessageCircle },
  { key: 'preparation', label: '备课充分', Icon: FiClipboard },
  { key: 'expertise', label: '知识专业', Icon: FiAward },
  { key: 'punctuality', label: '上课守时', Icon: FiClock },
];

const isZhangSanPhdTestMentor = (mentor) => {
  if (process.env.NODE_ENV === 'production') return false;
  const name = String(mentor?.name || '').trim();
  if (!name.includes('张三')) return false;
  const degree = String(mentor?.degree || '').toLowerCase();
  return degree.includes('phd') || String(mentor?.degree || '').includes('博士');
};

const hashString = (input) => {
  const text = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toNoonDate = (dateLike) => {
  if (!dateLike) return dateLike;
  const d = new Date(dateLike);
  d.setHours(12, 0, 0, 0);
  return d;
};

const ymdKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const formatFullDate = (date) => {
  if (!(date instanceof Date)) return '';
  const label = weekdayLabels[date.getDay()] || '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${label}`;
};

const parseYmdKey = (key) => {
  if (!key) return null;
  const parts = String(key).split('-');
  if (parts.length !== 3) return null;
  const [yRaw, mRaw, dRaw] = parts;
  const year = Number.parseInt(yRaw, 10);
  const month = Number.parseInt(mRaw, 10);
  const day = Number.parseInt(dRaw, 10);
  if (!year || !month || !day) return null;
  return { year, month, day };
};

const formatRangeTitleFromKeys = (keys) => {
  const normalized = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!normalized.length) return '';
  const sorted = [...normalized].sort();
  const startParts = parseYmdKey(sorted[0]);
  const endParts = parseYmdKey(sorted[sorted.length - 1]);
  if (!startParts || !endParts) return '';

  const sameYear = startParts.year === endParts.year;
  const sameMonth = sameYear && startParts.month === endParts.month;

  if (sameMonth) {
    if (startParts.day === endParts.day) return `${startParts.year}年${startParts.month}月${startParts.day}日`;
    return `${startParts.year}年${startParts.month}月${startParts.day}-${endParts.day}日`;
  }

  if (sameYear) {
    return `${startParts.year}年${startParts.month}月${startParts.day}日-${endParts.month}月${endParts.day}日`;
  }

  return `${startParts.year}年${startParts.month}月${startParts.day}日-${endParts.year}年${endParts.month}月${endParts.day}日`;
};

const minutesToTimeLabel = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const normalized = Math.max(0, minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatReviewMonthLabel = (value, now = new Date()) => {
  if (!value) return '';
  const format = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月`;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return format(d);
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return format(parsed);

  const normalized = raw.replace(/\s+/g, '');
  const d = new Date(now);

  const dayMatch = normalized.match(/^(\d+)天前$/);
  const weekMatch = normalized.match(/^(\d+)周前$/);
  const monthMatch = normalized.match(/^(\d+)个月前$/);
  const yearMatch = normalized.match(/^(\d+)年前$/);

  if (normalized === '昨天') d.setDate(d.getDate() - 1);
  else if (normalized === '前天') d.setDate(d.getDate() - 2);
  else if (dayMatch) d.setDate(d.getDate() - Number(dayMatch[1]));
  else if (weekMatch) d.setDate(d.getDate() - Number(weekMatch[1]) * 7);
  else if (monthMatch) d.setMonth(d.getMonth() - Number(monthMatch[1]));
  else if (yearMatch) d.setFullYear(d.getFullYear() - Number(yearMatch[1]));
  else return raw;

  return format(d);
};

const normalizeStudentIdLabel = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/^S0+(\d+)$/i);
  if (!match) return value;
  return `S${Number(match[1])}`;
};

const SLOT_MINUTES = 15;

const normalizeAvailabilityPayload = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const timeZone = typeof raw.timeZone === 'string' ? raw.timeZone.trim() : '';
  const sessionDurationRaw = typeof raw.sessionDurationHours === 'number'
    ? raw.sessionDurationHours
    : Number.parseFloat(String(raw.sessionDurationHours ?? '2'));
  const sessionDurationHours = Number.isFinite(sessionDurationRaw) ? sessionDurationRaw : 2;
  const daySelectionsRaw = raw.daySelections;
  const daySelections =
    (daySelectionsRaw && typeof daySelectionsRaw === 'object' && !Array.isArray(daySelectionsRaw)) ? daySelectionsRaw : {};
  return {
    timeZone: timeZone || getDefaultTimeZone(),
    sessionDurationHours,
    daySelections,
  };
};

const blocksToMinuteSlots = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const slots = [];
  for (const block of blocks) {
    const startIdx = Number(block?.start);
    const endIdx = Number(block?.end);
    if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx)) continue;
    const s = Math.max(0, Math.min(95, Math.floor(Math.min(startIdx, endIdx))));
    const e = Math.max(0, Math.min(95, Math.floor(Math.max(startIdx, endIdx))));
    const startMinutes = s * SLOT_MINUTES;
    const endMinutes = (e + 1) * SLOT_MINUTES;
    if (endMinutes > startMinutes) slots.push({ startMinutes, endMinutes });
  }
  return slots;
};

const intersectAvailabilityBlocks = (a, b) => {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length === 0 || listB.length === 0) return [];

  const out = [];
  let i = 0;
  let j = 0;
  while (i < listA.length && j < listB.length) {
    const aStart = Number(listA[i]?.start);
    const aEnd = Number(listA[i]?.end);
    const bStart = Number(listB[j]?.start);
    const bEnd = Number(listB[j]?.end);
    if (![aStart, aEnd, bStart, bEnd].every((n) => Number.isFinite(n))) {
      if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) i += 1;
      if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) j += 1;
      continue;
    }
    const start = Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
    const end = Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd));
    if (start <= end) out.push({ start, end });
    if (Math.max(aStart, aEnd) < Math.max(bStart, bEnd)) i += 1;
    else j += 1;
  }

  if (out.length <= 1) return out;
  const merged = [out[0]];
  for (let k = 1; k < out.length; k += 1) {
    const prev = merged[merged.length - 1];
    const cur = out[k];
    if (cur.start <= prev.end + 1) prev.end = Math.max(prev.end, cur.end);
    else merged.push(cur);
  }
  return merged;
};

const buildCalendarGrid = (viewMonth) => {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startIdx = first.getDay(); // 0=Sun
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const prevMonthDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

  const cells = [];
  for (let i = startIdx - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, dayNum);
    cells.push({ date, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: next.getMonth() !== viewMonth.getMonth() });
  }
  return cells;
};

const isSameDay = (a, b) => (
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
);

const normalizeNumber = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

const buildMockReviewSummary = ({ seedKey, rating, reviewCount }) => {
  const rng = mulberry32(hashString(seedKey));
  const base = clamp(rating > 0 ? rating : 4.8, 1, 5);
  const count = Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : 0;

  const categories = RATING_CATEGORY_SPECS.map(({ key, label, Icon }) => ({
    key,
    label,
    Icon,
    score: round1(clamp(base + (rng() - 0.5) * 0.4, 0, 5)),
  }));

  const distribution = (() => {
    if (!count) return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 }));
    const mean = clamp(base, 1, 5);
    const w5 = clamp(0.55 + (mean - 4.5) * 0.7, 0.12, 0.88);
    const w4 = clamp(0.28 - (mean - 4.5) * 0.35, 0.06, 0.6);
    const w3 = clamp(0.12 - (mean - 4.5) * 0.2, 0.02, 0.25);
    const w2 = clamp(0.03 + (4.2 - mean) * 0.02, 0.01, 0.12);
    const w1 = clamp(0.02 + (4.1 - mean) * 0.02, 0.01, 0.12);
    const weightsRaw = [w5, w4, w3, w2, w1];
    const sum = weightsRaw.reduce((acc, x) => acc + x, 0) || 1;
    const weights = weightsRaw.map((x) => x / sum);
    const expected = weights.map((w) => w * count);
    const counts = expected.map((x) => Math.floor(x));
    let remaining = count - counts.reduce((acc, x) => acc + x, 0);
    const order = [...Array(expected.length).keys()].sort((a, b) => expected[b] - expected[a]);
    let idx = 0;
    while (remaining > 0) {
      counts[order[idx % order.length]] += 1;
      remaining -= 1;
      idx += 1;
    }
    return [
      { stars: 5, count: counts[0] },
      { stars: 4, count: counts[1] },
      { stars: 3, count: counts[2] },
      { stars: 2, count: counts[3] },
      { stars: 1, count: counts[4] },
    ];
  })();

  const reviews = (() => {
    const templates = [
      '讲解非常清晰，会结合题目拆解思路，课后也会给到改进建议。',
      '沟通顺畅，安排灵活，能快速定位我的薄弱点并提供练习方案。',
      '很有耐心，解释到我完全理解为止，节奏把控得很好。',
      '专业度很强，给到的学习路径很具体，效率提升明显。',
      '反馈及时，代码走查细致，指出了很多容易忽略的问题。',
      '课程节奏把控得很好，讲解时会先给出整体框架再逐步拆解细节；遇到我卡住的点会换一种说法举例说明，直到我能自己复述并写出来。课后还给了我一份复盘清单和练习路线，照着做提升非常明显。',
      '沟通非常顺畅，时间安排也很灵活；每次都会先快速定位薄弱环节，然后用针对性的题目把思路练熟。尤其在代码走查上很细，能指出很多容易忽略的边界情况和写法习惯，建议也都很可落地。',
      '这是一条更长的测试评价，用来确保文本在当前卡片宽度下能够稳定超过四行：导师会先帮我梳理目标与优先级，然后把知识点拆成可执行的小步骤；每次课后都有明确的作业与检查点，下一次会先复盘上次的错误，再迭代我的解题思路。过程中不仅讲“怎么做”，还讲“为什么这样做”，并会补充常见坑、边界情况和更优雅的写法。整体体验非常高效，帮助我快速建立信心并持续提升。',
    ];
    const names = ['Yoriko', 'Andrea', 'S12', 'S8', 'S19', 'S3'];
    const times = ['4 天前', '2 周前', '1 个月前', '3 天前', '5 天前'];
    const take = Math.max(2, Math.min(18, Number.isFinite(reviewCount) ? reviewCount : 0));
    return Array.from({ length: take }).map((_, i) => {
      const score = round1(clamp(base + (rng() - 0.5) * 0.6, 1, 5));
      return {
        id: `${seedKey}-review-${i}`,
        author: names[Math.floor(rng() * names.length)],
        time: times[Math.floor(rng() * times.length)],
        rating: score,
        content: (i === 0 ? templates[templates.length - 1] : templates[Math.floor(rng() * templates.length)]),
      };
    });
  })();

  return { categories, distribution, reviews };
};

function MentorDetailPage() {
  const menuAnchorRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const mentorId = safeDecode(typeof params?.mentorId === 'string' ? params.mentorId : '');

  const scheduleScrollRef = useRef(null);
  const scheduleResizeRef = useRef(null);
  const didDragRef = useRef(false);

  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [myAvailability, setMyAvailability] = useState(null);
  const [mentorAvailability, setMentorAvailability] = useState(null);

  const [mentor, setMentor] = useState(() => location?.state?.mentor || null);
  const [loading, setLoading] = useState(() => !location?.state?.mentor);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeReview, setActiveReview] = useState(null);
  const [visibleReviewCount, setVisibleReviewCount] = useState(6);
  const [revealStartIndex, setRevealStartIndex] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [selectedTimeZone, setSelectedTimeZone] = useState(() => getDefaultTimeZone());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(() => toNoonDate(new Date()));
  const [selectedRangeKeys, setSelectedRangeKeys] = useState(() => [ymdKey(toNoonDate(new Date()))]);
  const [dragStartKey, setDragStartKey] = useState(null);
  const [dragEndKey, setDragEndKey] = useState(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [dragPreviewKeys, setDragPreviewKeys] = useState(() => new Set());
  const [scheduleSelection, setScheduleSelection] = useState(null);
  const [showCourseOnboarding, setShowCourseOnboarding] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const parts = getZonedParts(getDefaultTimeZone(), new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    return new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1);
  });

  const ReviewContent = ({ review }) => {
    const contentText = String(review?.content ?? '');
    const [needsMore, setNeedsMore] = useState(false);
    const clampedRef = useRef(null);
    const measureRef = useRef(null);

    const recalc = () => {
      const clampedEl = clampedRef.current;
      const measureEl = measureRef.current;
      if (!clampedEl || !measureEl) return;
      const clampedHeight = clampedEl.getBoundingClientRect().height;
      const fullHeight = measureEl.getBoundingClientRect().height;
      setNeedsMore(fullHeight - clampedHeight > 1);
    };

    useLayoutEffect(() => {
      const raf = window.requestAnimationFrame(recalc);
      return () => window.cancelAnimationFrame(raf);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentText]);

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => recalc());
      if (clampedRef.current) observer.observe(clampedRef.current);
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentText]);

    return (
      <div className="review-content">
        <p
          ref={clampedRef}
          className="review-content-text is-clamped"
        >
          {contentText}
        </p>
        <p
          ref={measureRef}
          className="review-content-text review-content-measure"
          aria-hidden="true"
        >
          {contentText}
        </p>
        {needsMore ? (
          <button
            type="button"
            className="review-content-more"
            onClick={() => {
              setActiveReview(review);
            }}
          >
            显示更多
          </button>
        ) : null}
      </div>
    );
  };

  const ReviewModal = ({ review, onClose }) => {
    const closeButtonRef = useRef(null);
    const authorLabel = normalizeStudentIdLabel(review?.author);

    useLayoutEffect(() => {
      const prevOverflow = document.body.style.overflow;
      const prevPaddingRight = document.body.style.paddingRight;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const computedBodyPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;

      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = scrollbarWidth
        ? `${computedBodyPaddingRight + scrollbarWidth}px`
        : prevPaddingRight;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
        document.documentElement.style.overflow = prevHtmlOverflow;
      };
    }, []);

    useEffect(() => {
      closeButtonRef.current?.focus?.();
    }, []);

    useEffect(() => {
      const onKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const modal = (
      <div
        className="review-modal-overlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="review-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="review-modal-close"
            onClick={onClose}
            aria-label="关闭"
            ref={closeButtonRef}
          >
            <FiX aria-hidden="true" />
          </button>

          <article className="review-modal-card">
            <div className="review-head">
              <div className="review-avatar" aria-hidden="true">
                {String(authorLabel || 'S').slice(0, 1).toUpperCase()}
              </div>
              <div className="review-author">{authorLabel}</div>
              <div className="review-sub">
                <span className="review-score">
                  <span className="review-star" aria-hidden="true">★</span>
                  <span className="review-rating">{Number(review?.rating ?? 0).toFixed(1)}</span>
                </span>
                <span className="review-dot">·</span>
                <span className="review-time">{formatReviewMonthLabel(review?.time)}</span>
              </div>
            </div>

            <div className="review-content review-content--modal">
              <p className="review-content-text">{String(review?.content ?? '')}</p>
            </div>
          </article>
        </div>
      </div>
    );

    return createPortal(modal, document.body);
  };

  const CourseOnboardingModal = ({ mentorName, courseName, appointment, onCreateCourse, onClose }) => {
    const closeButtonRef = useRef(null);

    useLayoutEffect(() => {
      const prevOverflow = document.body.style.overflow;
      const prevPaddingRight = document.body.style.paddingRight;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const computedBodyPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;

      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = scrollbarWidth
        ? `${computedBodyPaddingRight + scrollbarWidth}px`
        : prevPaddingRight;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
        document.documentElement.style.overflow = prevHtmlOverflow;
      };
    }, []);

    useEffect(() => {
      closeButtonRef.current?.focus?.();
    }, []);

    useEffect(() => {
      const onKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const createdDateLabel = useMemo(() => {
      const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      return fmt.format(new Date());
    }, []);

    const appointmentDateLabel = useMemo(() => {
      if (!appointment?.date) return '';
      const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      return fmt.format(appointment.date);
    }, [appointment?.date]);

    const appointmentTimeLabel = useMemo(() => {
      if (!appointment?.windowLabel) return '';
      const tz = String(appointment?.timeZone || '').trim();
      if (!tz) return String(appointment.windowLabel);
      return `${appointment.windowLabel}（${buildShortUTC(tz)} ${tz}）`;
    }, [appointment?.timeZone, appointment?.windowLabel]);

    const modal = (
      <div
        className="course-onboarding-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="完善课程资料"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="course-onboarding-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="course-onboarding-close"
            onClick={onClose}
            aria-label="关闭"
            ref={closeButtonRef}
          >
            <FiX aria-hidden="true" />
          </button>

          <div className="course-onboarding-content">
            <h2 className="course-onboarding-title">完善课程资料</h2>

            <div className="course-onboarding-card-stack" aria-label="课程与预约信息">
              <div className="course-onboarding-card">
                <div className="course-onboarding-card-icon" aria-hidden="true">
                  <FiBookOpen />
                </div>
                <div className="course-onboarding-card-body">
                  <div className="course-onboarding-card-title">你的课程，创建于 {createdDateLabel}</div>
                  <div className="course-onboarding-card-subtitle">
                    {courseName || '课程'}
                    {mentorName ? <span className="course-onboarding-card-dot">·</span> : null}
                    {mentorName || null}
                  </div>
                </div>
                <div className="course-onboarding-card-chevron" aria-hidden="true">
                  <FiChevronRight />
                </div>
              </div>

              {appointment ? (
                <div className="course-onboarding-card">
                  <div className="course-onboarding-card-icon" aria-hidden="true">
                    <FiClock />
                  </div>
                  <div className="course-onboarding-card-body">
                    <div className="course-onboarding-card-title">已选择的预约时间</div>
                    <div className="course-onboarding-card-subtitle">
                      {appointmentDateLabel}
                      {appointmentTimeLabel ? <span className="course-onboarding-card-dot">·</span> : null}
                      {appointmentTimeLabel}
                    </div>
                  </div>
                  <div className="course-onboarding-card-chevron" aria-hidden="true">
                    <FiChevronRight />
                  </div>
                </div>
              ) : null}
            </div>

            <h3 className="course-onboarding-section-title">开始创建新课程</h3>
            <div className="course-onboarding-action-list" aria-label="创建课程入口">
              <button
                type="button"
                className="course-onboarding-action-row"
                onClick={onCreateCourse}
              >
                <span className="course-onboarding-action-left">
                  <span className="course-onboarding-action-icon" aria-hidden="true">
                    <FiPlus />
                  </span>
                  <span className="course-onboarding-action-text">创建新课程</span>
                </span>
                <span className="course-onboarding-action-chevron" aria-hidden="true">
                  <FiChevronRight />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );

    return createPortal(modal, document.body);
  };

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!(ev.newValue || getAuthToken()));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', handler);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const onLoginRequired = () => {
      setShowStudentAuth(true);
    };
    window.addEventListener('auth:login-required', onLoginRequired);
    return () => window.removeEventListener('auth:login-required', onLoginRequired);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setSelectedTimeZone(getDefaultTimeZone());
      setMyAvailability(null);
      return () => { alive = false; };
    }

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const availability = normalizeAvailabilityPayload(res?.data?.availability);
        setMyAvailability(availability);
        const tz = typeof availability?.timeZone === 'string' ? availability.timeZone.trim() : '';
        setSelectedTimeZone(tz || getDefaultTimeZone());
      })
      .catch(() => {
        if (!alive) return;
        setSelectedTimeZone(getDefaultTimeZone());
        setMyAvailability(null);
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    const parts = getZonedParts(selectedTimeZone, new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    setSelectedDate(todayNoon);
    setViewMonth(new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1));
    setSelectedRangeKeys([ymdKey(todayNoon)]);
    setDragStartKey(null);
    setDragEndKey(null);
    setDragPreviewKeys(new Set());
    setIsDraggingRange(false);
  }, [selectedTimeZone]);

  useEffect(() => {
    let alive = true;

    const fromState = location?.state?.mentor;
    if (fromState && String(fromState?.id) === mentorId) {
      setMentor(fromState);
      setLoading(false);
      setErrorMessage('');
      return () => {
        alive = false;
      };
    }

    if (!mentorId) {
      setMentor(null);
      setLoading(false);
      setErrorMessage('缺少 MentorID');
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    setErrorMessage('');

    fetchApprovedMentors()
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data?.mentors) ? res.data.mentors : [];
        const hit = list.find((m) => String(m?.id) === mentorId) || null;
        if (!hit) {
          setMentor(null);
          setErrorMessage('未找到该导师');
          return;
        }
        setMentor(hit);
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e?.response?.data?.error || e?.message || '加载失败，请稍后再试';
        setMentor(null);
        setErrorMessage(String(msg));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [location?.state?.mentor, mentorId]);

  useEffect(() => {
    let alive = true;
    if (!mentorId) {
      setMentorAvailability(null);
      return () => { alive = false; };
    }

    api.get(`/api/mentors/${encodeURIComponent(mentorId)}/availability`)
      .then((res) => {
        if (!alive) return;
        setMentorAvailability(normalizeAvailabilityPayload(res?.data?.availability));
      })
      .catch(() => {
        if (!alive) return;
        setMentorAvailability(null);
      });

    return () => { alive = false; };
  }, [mentorId]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setFavoriteIds(new Set());
      return () => { alive = false; };
    }

    fetchFavoriteItems({ role: 'student', itemType: 'tutor', idsOnly: true })
      .then((res) => {
        if (!alive) return;
        const ids = Array.isArray(res?.data?.ids) ? res.data.ids : [];
        setFavoriteIds(new Set(ids.map(String)));
      })
      .catch(() => {
        if (!alive) return;
        setFavoriteIds(new Set());
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const rawRatingValue = normalizeNumber(mentor?.rating, 0);
  const rawReviewCount = Number.parseInt(String(mentor?.reviewCount ?? 0), 10) || 0;
  const ratingValue = isZhangSanPhdTestMentor(mentor) ? 4.91 : rawRatingValue;
  const reviewCount = isZhangSanPhdTestMentor(mentor) ? 36 : rawReviewCount;
  const summary = useMemo(() => {
    const seedKey = mentor?.id || mentorId || 'mentor';
    return buildMockReviewSummary({ seedKey, rating: ratingValue, reviewCount });
  }, [mentor?.id, mentorId, ratingValue, reviewCount]);

  useEffect(() => {
    setVisibleReviewCount(6);
    setActiveReview(null);
    setRevealStartIndex(null);
  }, [mentor?.id, mentorId, summary.reviews.length]);

  const previewCardData = useMemo(() => {
    const courses = Array.isArray(mentor?.courses)
      ? mentor.courses
      : (typeof mentor?.courses === 'string'
        ? mentor.courses.split(/[,，]/g).map((x) => x.trim()).filter(Boolean)
        : []);

    return {
      name: mentor?.name || '导师',
      gender: mentor?.gender || '',
      degree: mentor?.degree || '',
      school: (mentor?.school || '').trim(),
      rating: ratingValue,
      reviewCount,
      timezone: mentor?.timezone || '',
      languages: mentor?.languages || '',
      courses,
      imageUrl: mentor?.imageUrl || mentor?.avatarUrl || null,
    };
  }, [mentor, ratingValue, reviewCount]);

  const favoriteTargetId = mentor?.id ?? mentorId;
  const isFavorite = !!favoriteTargetId && favoriteIds.has(String(favoriteTargetId));

  const zhDays = useMemo(() => ['日', '一', '二', '三', '四', '五', '六'], []);
  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
    return fmt.format(viewMonth);
  }, [viewMonth]);
  const calendarGrid = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);
  const nowParts = useMemo(
    () => getZonedParts(selectedTimeZone, new Date(nowTick)),
    [nowTick, selectedTimeZone],
  );
  const todayStart = useMemo(() => {
    const d = new Date(nowParts.year, nowParts.month - 1, nowParts.day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [nowParts.day, nowParts.month, nowParts.year]);
  const todayKey = useMemo(() => ymdKey(todayStart), [todayStart]);
  const canGoPrevMonth = useMemo(() => {
    const base = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return viewMonth.getTime() > base.getTime();
  }, [todayStart, viewMonth]);
  const onPrevMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const onNextMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const keyToDateStrict = useMemo(() => {
    return (key) => {
      const parsed = parseYmdKey(key);
      if (!parsed) return null;
      return new Date(parsed.year, parsed.month - 1, parsed.day);
    };
  }, []);

  const enumerateKeysInclusive = useMemo(() => {
    return (aKey, bKey) => {
      const a = keyToDateStrict(aKey);
      const b = keyToDateStrict(bKey);
      if (!a || !b) return [];
      const start = a.getTime() <= b.getTime() ? a : b;
      const end = a.getTime() <= b.getTime() ? b : a;
      const res = [];
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
      while (cur.getTime() <= endTs) {
        const t = new Date(cur);
        const key = ymdKey(t);
        if (key >= todayKey) res.push(key);
        cur.setDate(cur.getDate() + 1);
      }
      return res;
    };
  }, [keyToDateStrict, todayKey]);

  const endDragSelection = useMemo(() => {
    return () => {
      if (!isDraggingRange || !dragStartKey || !dragEndKey) {
        setIsDraggingRange(false);
        setDragPreviewKeys(new Set());
        return;
      }
      const keys = enumerateKeysInclusive(dragStartKey, dragEndKey);
      setSelectedRangeKeys(keys);
      const endDate = keyToDateStrict(dragEndKey);
      if (endDate) setSelectedDate(toNoonDate(endDate));
      setIsDraggingRange(false);
      setDragPreviewKeys(new Set());
    };
  }, [dragEndKey, dragStartKey, enumerateKeysInclusive, isDraggingRange, keyToDateStrict]);

  useEffect(() => {
    const onUp = () => {
      if (isDraggingRange) {
        endDragSelection();
        didDragRef.current = true;
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [endDragSelection, isDraggingRange]);

  const scheduleGmtLabel = useMemo(() => {
    const utcLabel = buildShortUTC(selectedTimeZone);
    const match = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(utcLabel);
    if (!match) {
      if (utcLabel === 'UTC±0') return 'GMT+00';
      return utcLabel.replace(/^UTC/, 'GMT');
    }
    const [, sign, hoursRaw, minutesRaw] = match;
    const hours = String(hoursRaw).padStart(2, '0');
    const minutes = minutesRaw ? `:${minutesRaw}` : '';
    return `GMT${sign}${hours}${minutes}`;
  }, [selectedTimeZone]);

  const timelineConfig = useMemo(() => ({
    startHour: 0,
    endHour: 24,
    rowHeight: 44,
    timeColumnWidth: 60,
    bodyPaddingTop: 0,
    timezoneLabel: scheduleGmtLabel,
  }), [scheduleGmtLabel]);

  const displayHours = useMemo(
    () => Array.from({ length: timelineConfig.endHour - timelineConfig.startHour }, (_, index) => timelineConfig.startHour + index),
    [timelineConfig.endHour, timelineConfig.startHour],
  );

  const participantLabels = useMemo(() => {
    return {
      left: '我',
      right: previewCardData.name || '导师',
    };
  }, [previewCardData.name]);

  const mySelectionsInViewTz = useMemo(() => {
    const payload = myAvailability;
    if (!payload) return {};
    const fromTz = typeof payload.timeZone === 'string' && payload.timeZone.trim() ? payload.timeZone.trim() : selectedTimeZone;
    const daySelections = payload.daySelections || {};
    return convertSelectionsBetweenTimeZones(daySelections, fromTz, selectedTimeZone);
  }, [myAvailability, selectedTimeZone]);

  const mentorSelectionsInViewTz = useMemo(() => {
    const payload = mentorAvailability;
    if (!payload) return {};
    const fromTz = typeof payload.timeZone === 'string' && payload.timeZone.trim() ? payload.timeZone.trim() : selectedTimeZone;
    const daySelections = payload.daySelections || {};
    return convertSelectionsBetweenTimeZones(daySelections, fromTz, selectedTimeZone);
  }, [mentorAvailability, selectedTimeZone]);

  const myAvailabilityDays = useMemo(() => {
    const keys = Object.keys(mySelectionsInViewTz || {});
    const set = new Set();
    for (const key of keys) {
      const blocks = mySelectionsInViewTz[key];
      if (Array.isArray(blocks) && blocks.length > 0) set.add(key);
    }
    return set;
  }, [mySelectionsInViewTz]);

  const mentorAvailabilityDays = useMemo(() => {
    const keys = Object.keys(mentorSelectionsInViewTz || {});
    const set = new Set();
    for (const key of keys) {
      const blocks = mentorSelectionsInViewTz[key];
      if (Array.isArray(blocks) && blocks.length > 0) set.add(key);
    }
    return set;
  }, [mentorSelectionsInViewTz]);

  const selectedKeys = useMemo(() => {
    if (!Array.isArray(selectedRangeKeys)) return [];
    return selectedRangeKeys.filter((k) => typeof k === 'string' && k);
  }, [selectedRangeKeys]);

  const multiDayMyBlocks = useMemo(() => {
    if (selectedKeys.length <= 1) return [];
    let common = null;
    for (const key of selectedKeys) {
      const blocks = mySelectionsInViewTz?.[key] || [];
      common = common == null ? blocks : intersectAvailabilityBlocks(common, blocks);
      if (!common || common.length === 0) return [];
    }
    return common || [];
  }, [mySelectionsInViewTz, selectedKeys]);

  const multiDayMentorBlocks = useMemo(() => {
    if (selectedKeys.length <= 1) return [];
    let common = null;
    for (const key of selectedKeys) {
      const blocks = mentorSelectionsInViewTz?.[key] || [];
      common = common == null ? blocks : intersectAvailabilityBlocks(common, blocks);
      if (!common || common.length === 0) return [];
    }
    return common || [];
  }, [mentorSelectionsInViewTz, selectedKeys]);

  const selectedDayKey = useMemo(() => ymdKey(selectedDate), [selectedDate]);
  const mySlots = useMemo(() => {
    if (selectedKeys.length > 1) return blocksToMinuteSlots(multiDayMyBlocks);
    return blocksToMinuteSlots(mySelectionsInViewTz?.[selectedDayKey]);
  }, [multiDayMyBlocks, mySelectionsInViewTz, selectedDayKey, selectedKeys.length]);

  const mentorSlots = useMemo(() => {
    if (selectedKeys.length > 1) return blocksToMinuteSlots(multiDayMentorBlocks);
    return blocksToMinuteSlots(mentorSelectionsInViewTz?.[selectedDayKey]);
  }, [mentorSelectionsInViewTz, multiDayMentorBlocks, selectedDayKey, selectedKeys.length]);
  const columns = useMemo(() => ({ mySlots, counterpartSlots: mentorSlots }), [mentorSlots, mySlots]);

  useEffect(() => {
    setScheduleSelection(null);
  }, [selectedDate]);

  useEffect(() => {
    const scrollEl = scheduleScrollRef.current;
    if (!scrollEl) return;
    const targetMinutes = 11 * 60;
    const top = (targetMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60);
    scrollEl.scrollTop = Math.max(0, top);
  }, [selectedDate, timelineConfig.rowHeight, timelineConfig.startHour]);

  const shiftSelectedDate = (deltaDays) => {
    setSelectedDate((prev) => {
      const today = toNoonDate(todayStart);
      const next = toNoonDate(prev);
      next.setDate(next.getDate() + deltaDays);
      const clamped = next < today ? today : next;
      setSelectedRangeKeys([ymdKey(clamped)]);
      return clamped;
    });
  };

  useEffect(() => {
    setViewMonth((current) => {
      if (
        current.getFullYear() === selectedDate.getFullYear()
        && current.getMonth() === selectedDate.getMonth()
      ) {
        return current;
      }
      return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    });
  }, [selectedDate]);

  const scheduleMinDate = toNoonDate(todayStart);
  const isPrevDayDisabled = toNoonDate(selectedDate).getTime() <= scheduleMinDate.getTime();
  const scheduleTitle = useMemo(() => {
    if (Array.isArray(selectedRangeKeys) && selectedRangeKeys.length > 1) return formatRangeTitleFromKeys(selectedRangeKeys);
    return formatFullDate(selectedDate);
  }, [selectedDate, selectedRangeKeys]);

  const handleTimelineClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = timelineConfig.startHour * 60 + offsetY / pixelsPerMinute;
    const snappedStart = Math.round(rawMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxStart = timelineConfig.endHour * 60 - 60;
    const startMinutes = Math.max(minStart, Math.min(maxStart, snappedStart));
    setScheduleSelection({ startMinutes, endMinutes: startMinutes + 60 });
  };

  const clearResizeState = () => {
    const state = scheduleResizeRef.current;
    if (!state) return;
    document.body.style.userSelect = state.previousUserSelect ?? '';
    document.body.classList.remove('reschedule-resizing');
    scheduleResizeRef.current = null;
  };

  useEffect(() => {
    return () => {
      const state = scheduleResizeRef.current;
      if (!state) return;
      document.body.style.userSelect = state.previousUserSelect ?? '';
      document.body.classList.remove('reschedule-resizing');
      scheduleResizeRef.current = null;
    };
  }, []);

  const handleSelectionResizePointerMove = (event) => {
    const state = scheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    event.preventDefault();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const deltaMinutes = (event.clientY - state.startY) / pixelsPerMinute;
    const snappedDelta = Math.round(deltaMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxEnd = timelineConfig.endHour * 60;
    const minDuration = 15;

    if (state.edge === 'start') {
      const startMinutes = Math.max(
        minStart,
        Math.min(state.endMinutes - minDuration, state.startMinutes + snappedDelta),
      );
      setScheduleSelection({ startMinutes, endMinutes: state.endMinutes });
      return;
    }

    const endMinutes = Math.max(
      state.startMinutes + minDuration,
      Math.min(maxEnd, state.endMinutes + snappedDelta),
    );
    setScheduleSelection({ startMinutes: state.startMinutes, endMinutes });
  };

  const handleSelectionResizePointerUp = (event) => {
    const state = scheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    clearResizeState();
  };

  const handleSelectionResizePointerDown = (edge) => (event) => {
    if (!scheduleSelection) return;
    event.preventDefault();
    event.stopPropagation();

    clearResizeState();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    scheduleResizeRef.current = {
      edge,
      pointerId: event.pointerId,
      startY: event.clientY,
      startMinutes: scheduleSelection.startMinutes,
      endMinutes: scheduleSelection.endMinutes,
      previousUserSelect: document.body.style.userSelect,
    };
    document.body.style.userSelect = 'none';
    document.body.classList.add('reschedule-resizing');
  };

  const handleSendAppointment = () => {
    if (!scheduleSelection) return;
    if (!isLoggedIn) {
      setShowStudentAuth(true);
      return;
    }
    setShowCourseOnboarding(true);
  };

  return (
    <div className="mentor-detail-page">
      <div className="container">
        <header className="mentor-detail-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle mentor-detail-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <main className="mentor-detail-content">
          {loading ? (
            <div className="mentor-detail-loading" aria-live="polite">加载中…</div>
          ) : errorMessage ? (
            <div className="mentor-detail-error" role="alert">{errorMessage}</div>
          ) : mentor ? (
            <>
              <section className="mentor-detail-top" aria-label="导师信息与预约">
                <div className="mentor-detail-preview" aria-label="导师预览卡片">
                  <div className="preview-wrap">
                    <StudentListingCard
                      data={previewCardData}
                      favoriteRole="student"
                      favoriteItemType="tutor"
                      favoriteItemId={favoriteTargetId}
                      initialFavorited={isFavorite}
                      onFavoriteChange={(itemId, favorited) => {
                        setFavoriteIds((prev) => {
                          const next = new Set(prev);
                          if (favorited) next.add(String(itemId));
                          else next.delete(String(itemId));
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>
                <aside className="mentor-detail-schedule" aria-label="导师可约时间">
                  <div className="mentor-detail-schedule-meta">
                    <span>时区：{buildShortUTC(selectedTimeZone)} {selectedTimeZone}</span>
                  </div>
                  <div className="mentor-detail-schedule-body" aria-label="选择日期">
                    <div className="calendar-card" aria-label="可约日期日历">
                      <div className="calendar-header">
                        <div className="month-label">{monthLabel}</div>
                        <div className="calendar-nav">
                          <button
                            type="button"
                            className="nav-btn"
                            aria-label="Prev month"
                            disabled={!canGoPrevMonth}
                            onClick={onPrevMonth}
                          >
                            &lsaquo;
                          </button>
                          <button type="button" className="nav-btn" aria-label="Next month" onClick={onNextMonth}>
                            &rsaquo;
                          </button>
                        </div>
                      </div>
                      <div className="calendar-grid">
                        {zhDays.map((d) => (
                          <div key={d} className="day-name">{d}</div>
                        ))}
                        {calendarGrid.map(({ date, outside }) => {
                          if (outside) {
                            return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
                          }
                          const isToday = isSameDay(date, todayStart);
                          const selected = isSameDay(date, selectedDate);
                          const key = ymdKey(date);
                          const isPast = key < todayKey;
                          const hasMyAvailability = myAvailabilityDays.has(key);
                          const hasMentorAvailability = mentorAvailabilityDays.has(key);
                          const inMultiSelected = (selectedRangeKeys || []).includes(key);
                          const inPreview = (dragPreviewKeys && dragPreviewKeys.size)
                            ? (dragPreviewKeys.has(key) && !selected && !inMultiSelected)
                            : false;
                          const cls = [
                            'date-cell',
                            isToday ? 'today' : '',
                            selected ? 'selected' : '',
                            isPast ? 'past' : '',
                            inMultiSelected ? 'multi-selected' : '',
                            inPreview ? 'range-preview' : '',
                          ].filter(Boolean).join(' ');
                          return (
                            <button
                              key={date.toISOString()}
                              type="button"
                              className={cls}
                              onMouseDown={(event) => {
                                if (isPast) return;
                                if (event?.metaKey || event?.ctrlKey) return;
                                setIsDraggingRange(true);
                                setDragStartKey(key);
                                setDragEndKey(key);
                                setDragPreviewKeys(new Set([key]));
                                didDragRef.current = false;
                              }}
                              onMouseEnter={() => {
                                if (!isDraggingRange) return;
                                if (isPast) return;
                                setDragEndKey(key);
                                const keys = enumerateKeysInclusive(dragStartKey || key, key);
                                setDragPreviewKeys(new Set(keys));
                                if (dragStartKey && dragStartKey !== key) didDragRef.current = true;
                              }}
                              onMouseUp={() => {
                                if (isDraggingRange) endDragSelection();
                              }}
                              onClick={(event) => {
                                if (didDragRef.current) { didDragRef.current = false; return; }
                                if (isPast) return;
                                const wantsMultiSelect = !!(event?.metaKey || event?.ctrlKey);
                                setSelectedDate(toNoonDate(date));
                                if (wantsMultiSelect) {
                                  setSelectedRangeKeys((prev) => {
                                    const list = Array.isArray(prev) ? prev : [];
                                    const set = new Set(list);
                                    const alreadySelected = set.has(key);
                                    if (alreadySelected) {
                                      if (set.size <= 1) return [key];
                                      set.delete(key);
                                    } else {
                                      set.add(key);
                                    }
                                    return Array.from(set).sort();
                                  });
                                } else {
                                  setSelectedRangeKeys([key]);
                                }
                                if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                                  setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                                }
                              }}
                            >
                              <span className="date-number">{date.getDate()}</span>
                              {(hasMyAvailability || hasMentorAvailability) ? (
                                <span className="availability-dots" aria-hidden="true">
                                  {(hasMyAvailability && hasMentorAvailability) ? (
                                    <span className="availability-dot both" />
                                  ) : hasMyAvailability ? (
                                    <span className="availability-dot me" />
                                  ) : (
                                    <span className="availability-dot mentor" />
                                  )}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mentor-detail-times-panel" aria-label="选择时间">
                      <aside className="reschedule-drawer mentor-detail-reschedule-embed" aria-label="发送预约">
                        <div className="reschedule-header">
                          <div className="reschedule-header-left">
                            <button
                              type="button"
                              className="reschedule-header-btn icon"
                              aria-label="前一天"
                              disabled={isPrevDayDisabled}
                              onClick={() => shiftSelectedDate(-1)}
                            >
                              <FiChevronLeft size={18} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="reschedule-header-btn icon"
                              aria-label="后一天"
                              onClick={() => shiftSelectedDate(1)}
                            >
                              <FiChevronRight size={18} aria-hidden="true" />
                            </button>
                            <div className="reschedule-date-title">{scheduleTitle}</div>
                          </div>
                          <button
                            type="button"
                            className="reschedule-header-btn icon close"
                            aria-label="清空选择"
                            onClick={() => setScheduleSelection(null)}
                          >
                            <FiX size={18} aria-hidden="true" />
                          </button>
                        </div>

                        <div className="reschedule-timeline">
                          <div
                            className="reschedule-timeline-head"
                            style={{ '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px` }}
                          >
                            <div className="reschedule-tz">{timelineConfig.timezoneLabel}</div>
                            <div className="reschedule-person">{participantLabels.left}</div>
                            <div className="reschedule-person">{participantLabels.right}</div>
                          </div>

                          <div className="reschedule-timeline-scroll" ref={scheduleScrollRef}>
                            <div
                              className="reschedule-timeline-body"
                              style={{
                                '--rs-row-height': `${timelineConfig.rowHeight}px`,
                                '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px`,
                                '--rs-body-padding-top': `${timelineConfig.bodyPaddingTop}px`,
                                '--rs-timeline-height': `${timelineConfig.rowHeight * (timelineConfig.endHour - timelineConfig.startHour)}px`,
                              }}
                            >
                              <div
                                className="reschedule-time-col"
                                aria-hidden="true"
                                onClick={handleTimelineClick}
                              >
                                {displayHours.map((hour) => (
                                  <div key={hour} className="reschedule-time-label">
                                    {hour === 0 ? null : (
                                      <span className="reschedule-time-text">{`${String(hour).padStart(2, '0')}:00`}</span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div
                                className="reschedule-column left"
                                aria-label="我的空闲时间"
                                onClick={handleTimelineClick}
                              >
                                {columns.mySlots.map((slot, index) => (
                                  <div
                                    key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                                    className="reschedule-slot availability"
                                    style={{
                                      top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                                      height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                                    }}
                                  >
                                    {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                                  </div>
                                ))}
                              </div>

                              <div
                                className="reschedule-column right"
                                aria-label="导师空闲时间"
                                onClick={handleTimelineClick}
                              >
                                {columns.counterpartSlots.map((slot, index) => (
                                  <div
                                    key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                                    className="reschedule-slot availability"
                                    style={{
                                      top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                                      height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                                    }}
                                  >
                                    {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                                  </div>
                                ))}
                              </div>

                              {scheduleSelection && (
                                <div className="reschedule-selection-layer" aria-hidden="true">
                                  <div
                                    className="reschedule-slot selection"
                                    style={{
                                      top: `${(scheduleSelection.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                                      height: `${(scheduleSelection.endMinutes - scheduleSelection.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                                    }}
                                  >
                                    <div
                                      className="reschedule-selection-handle top"
                                      role="presentation"
                                      onPointerDown={handleSelectionResizePointerDown('start')}
                                      onPointerMove={handleSelectionResizePointerMove}
                                      onPointerUp={handleSelectionResizePointerUp}
                                      onPointerCancel={handleSelectionResizePointerUp}
                                    />
                                    <div
                                      className="reschedule-selection-handle bottom"
                                      role="presentation"
                                      onPointerDown={handleSelectionResizePointerDown('end')}
                                      onPointerMove={handleSelectionResizePointerMove}
                                      onPointerUp={handleSelectionResizePointerUp}
                                      onPointerCancel={handleSelectionResizePointerUp}
                                    />
                                    {minutesToTimeLabel(scheduleSelection.startMinutes)} - {minutesToTimeLabel(scheduleSelection.endMinutes)}
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>
                        </div>

                        <div className="reschedule-footer">
                          <button
                            type="button"
                            className="reschedule-send-btn"
                            onClick={handleSendAppointment}
                            disabled={!scheduleSelection}
                          >
                            发送预约
                          </button>
                        </div>
                      </aside>
                    </div>
                  </div>
                </aside>
              </section>

              <section className="mentor-rating-card" aria-label="评分与评价">
                <div className="mentor-rating-top">
                  <div className="mentor-rating-number">{ratingValue > 0 ? ratingValue.toFixed(2) : '—'}</div>
                  <div className="mentor-rating-subtitle">{reviewCount > 0 ? `基于 ${reviewCount} 条评价` : '暂无评价数据'}</div>
                </div>

                <div className="mentor-rating-grid">
                  <div className="mentor-rating-distribution" aria-label="评分分布">
                    <div className="dist-title">总体评分</div>
                    {summary.distribution.map((row) => {
                      const pct = reviewCount > 0 ? row.count / reviewCount : 0;
                      return (
                        <div className="dist-row" key={`dist-${row.stars}`}>
                          <span className="dist-label">{row.stars}</span>
                          <div className="dist-bar" aria-hidden="true">
                            <div className="dist-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mentor-rating-categories" aria-label="评分维度">
                    {summary.categories.map((item) => {
                      const Icon = item.Icon;
                      return (
                        <div className="cat-item" key={`cat-${item.key || item.label}`}>
                          <div className="cat-label">{item.label}</div>
                          <div className="cat-score">{item.score.toFixed(1)}</div>
                          {Icon ? (
                            <div className="cat-icon" aria-hidden="true">
                              <Icon />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="mentor-reviews" aria-label="学员评价列表">
                <div className="mentor-reviews-grid">
                  {summary.reviews.slice(0, visibleReviewCount).map((review, index) => (
                    <article
                      className={`mentor-review-card${(revealStartIndex !== null && index >= revealStartIndex) ? ' mentor-review-card--reveal' : ''}`}
                      key={review.id}
                      style={(revealStartIndex !== null && index >= revealStartIndex)
                        ? { '--mentor-review-reveal-delay': `${Math.min(5, index - revealStartIndex) * 28}ms` }
                        : undefined}
                    >
                      <div className="review-head">
                        <div className="review-avatar" aria-hidden="true">
                          {String(normalizeStudentIdLabel(review.author) || 'S').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="review-author">{normalizeStudentIdLabel(review.author)}</div>
                        <div className="review-sub">
                          <span className="review-score">
                            <span className="review-star" aria-hidden="true">★</span>
                            <span className="review-rating">{review.rating.toFixed(1)}</span>
                          </span>
                          <span className="review-dot">·</span>
                          <span className="review-time">{formatReviewMonthLabel(review.time)}</span>
                        </div>
                      </div>
                      <ReviewContent review={review} />
                    </article>
                  ))}
                </div>

                {summary.reviews.length > visibleReviewCount ? (
                  <button
                    type="button"
                    className="mentor-reviews-more"
                    onClick={() => {
                      setRevealStartIndex(visibleReviewCount);
                      setVisibleReviewCount((count) => Math.min(count + 6, summary.reviews.length));
                    }}
                  >
                    显示更多
                  </button>
                ) : null}
              </section>
            </>
          ) : null}
        </main>
      </div>

      {activeReview ? (
        <ReviewModal
          review={activeReview}
          onClose={() => setActiveReview(null)}
        />
      ) : null}

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

      {showCourseOnboarding ? (
        <CourseOnboardingModal
          mentorName={previewCardData?.name || ''}
          courseName={Array.isArray(previewCardData?.courses) ? previewCardData.courses[0] : ''}
          appointment={scheduleSelection ? {
            date: selectedDate,
            windowLabel: `${minutesToTimeLabel(scheduleSelection.startMinutes)} - ${minutesToTimeLabel(scheduleSelection.endMinutes)}`,
            timeZone: selectedTimeZone,
          } : null}
          onCreateCourse={() => {
            setShowCourseOnboarding(false);
            navigate('/student/course-request', { state: { from: 'mentor-detail', mentorId } });
          }}
          onClose={() => setShowCourseOnboarding(false)}
        />
      ) : null}
    </div>
  );
}

export default MentorDetailPage;
