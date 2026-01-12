import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  FiAward,
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiClock,
  FiMessageCircle,
  FiX,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import api from '../../api/client';
import { fetchApprovedMentors } from '../../api/mentors';
import { fetchFavoriteItems } from '../../api/favorites';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import { getAuthToken } from '../../utils/authStorage';
import { buildShortUTC, getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';
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

const buildMockAvailability = (date, role) => {
  const day = date?.getDay?.() ?? 1;
  const isWeekend = day === 0 || day === 6;

  if (role === 'student') {
    return isWeekend
      ? [
        { startMinutes: 13 * 60, endMinutes: 16 * 60 },
        { startMinutes: 19 * 60, endMinutes: 21 * 60 },
      ]
      : [
        { startMinutes: 12 * 60, endMinutes: 13 * 60 + 30 },
        { startMinutes: 14 * 60, endMinutes: 15 * 60 + 30 },
        { startMinutes: 20 * 60, endMinutes: 21 * 60 + 30 },
      ];
  }

  return isWeekend
    ? [
      { startMinutes: 15 * 60, endMinutes: 17 * 60 + 30 },
      { startMinutes: 20 * 60, endMinutes: 21 * 60 },
    ]
    : [
      { startMinutes: 11 * 60 + 30, endMinutes: 12 * 60 + 30 },
      { startMinutes: 14 * 60 + 30, endMinutes: 17 * 60 },
      { startMinutes: 19 * 60, endMinutes: 20 * 60 + 30 },
    ];
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
    ];
    const names = ['Yoriko', 'Andrea', 'S12', 'S8', 'S19', 'S3'];
    const times = ['4 天前', '2 周前', '1 个月前', '3 天前', '5 天前'];
    const take = Math.max(2, Math.min(4, Math.round(2 + rng() * 2)));
    return Array.from({ length: take }).map((_, i) => {
      const score = round1(clamp(base + (rng() - 0.5) * 0.6, 1, 5));
      return {
        id: `${seedKey}-review-${i}`,
        author: names[Math.floor(rng() * names.length)],
        time: times[Math.floor(rng() * times.length)],
        rating: score,
        content: templates[Math.floor(rng() * templates.length)],
      };
    });
  })();

  return { categories, distribution, reviews };
};

function MentorDetailPage() {
  const menuAnchorRef = useRef(null);
  const location = useLocation();
  const params = useParams();
  const mentorId = safeDecode(typeof params?.mentorId === 'string' ? params.mentorId : '');

  const scheduleScrollRef = useRef(null);
  const scheduleResizeRef = useRef(null);
  const didDragRef = useRef(false);

  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });

  const [mentor, setMentor] = useState(() => location?.state?.mentor || null);
  const [loading, setLoading] = useState(() => !location?.state?.mentor);
  const [errorMessage, setErrorMessage] = useState('');
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
  const [viewMonth, setViewMonth] = useState(() => {
    const parts = getZonedParts(getDefaultTimeZone(), new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    return new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1);
  });

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
      return () => { alive = false; };
    }

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const tz = typeof res?.data?.availability?.timeZone === 'string' ? res.data.availability.timeZone.trim() : '';
        setSelectedTimeZone(tz || getDefaultTimeZone());
      })
      .catch(() => {
        if (!alive) return;
        setSelectedTimeZone(getDefaultTimeZone());
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

  const mentorSlots = useMemo(() => buildMockAvailability(selectedDate, 'mentor'), [selectedDate]);
  const columns = useMemo(() => ({ mySlots: [], counterpartSlots: mentorSlots }), [mentorSlots]);

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
    const windowLabel = `${minutesToTimeLabel(scheduleSelection.startMinutes)} - ${minutesToTimeLabel(scheduleSelection.endMinutes)}`;
    console.log('[mentor-detail] send appointment', {
      date: ymdKey(selectedDate),
      windowLabel,
      timeZone: selectedTimeZone,
    });
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
                              onMouseDown={() => {
                                if (isPast) return;
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
                              onClick={() => {
                                if (didDragRef.current) { didDragRef.current = false; return; }
                                if (isPast) return;
                                setSelectedDate(toNoonDate(date));
                                setSelectedRangeKeys([key]);
                                if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                                  setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                                }
                              }}
                            >
                              <span className="date-number">{date.getDate()}</span>
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
                  {summary.reviews.map((review) => (
                    <article className="mentor-review-card" key={review.id}>
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
                      <p className="review-content">{review.content}</p>
                    </article>
                  ))}
                </div>

                <button type="button" className="mentor-reviews-more">显示更多</button>
              </section>
            </>
          ) : null}
        </main>
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

export default MentorDetailPage;
