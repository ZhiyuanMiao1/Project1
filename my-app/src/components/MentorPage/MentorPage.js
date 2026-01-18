import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MentorNavbar from '../Navbar/MentorNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import MentorListings from '../Listings/MentorListings';
import api from '../../api/client';
import { fetchFavoriteItems } from '../../api/favorites';
import { COURSE_TYPE_EN_TO_CN, COURSE_TYPE_ID_TO_LABEL, COURSE_TYPE_OPTIONS } from '../../constants/courseMappings';
import { getAuthToken } from '../../utils/authStorage';
import './MentorPage.css';

const MENTOR_LISTINGS_SEARCH_EVENT = 'mentor:listings-search';
const MENTOR_LISTINGS_CATEGORY_EVENT = 'mentor:listings-category';

const REGION_OFFSET_RANGES = {
  中国: [{ min: 7.5, max: 8.5 }], // UTC+8
  日韩: [{ min: 8.5, max: 9.5 }], // UTC+9
  澳洲: [{ min: 9.5, max: 12.5 }], // UTC+10 ~ UTC+12
  欧洲: [{ min: -1.5, max: 3.5 }], // UTC-1 ~ UTC+3
  北美: [{ min: -10.5, max: -3.5 }], // UTC-10 ~ UTC-4
};

const parseUtcOffsetMinutesFromLabel = (tz) => {
  if (!tz) return null;
  const raw = String(tz).trim();
  const match = raw.match(/UTC\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return sign * (hours * 60 + minutes);
};

const getTimeZoneOffsetMinutes = (timeZone, referenceDate = new Date()) => {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(
      fmt
        .formatToParts(referenceDate)
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, p.value])
    );
    const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(iso);
    return Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);
  } catch {
    return null;
  }
};

const getTimezoneOffsetMinutesFlexible = (tz, referenceDate = new Date()) => {
  const parsed = parseUtcOffsetMinutesFromLabel(tz);
  if (typeof parsed === 'number') return parsed;
  const raw = typeof tz === 'string' ? tz.trim() : '';
  if (raw && raw.includes('/')) {
    return getTimeZoneOffsetMinutes(raw, referenceDate);
  }
  return null;
};

const matchesRegion = (timezone, region, referenceDate = new Date()) => {
  const key = typeof region === 'string' ? region.trim() : '';
  if (!key || key === '随便看看') return true;
  const ranges = REGION_OFFSET_RANGES[key];
  if (!ranges) return true;

  const offMin = getTimezoneOffsetMinutesFlexible(timezone, referenceDate);
  if (typeof offMin !== 'number') return false;
  const offHours = offMin / 60;
  return ranges.some((r) => offHours >= r.min && offHours <= r.max);
};

const SLOT_MINUTES = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDayKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { year: y, month: mo, day: d };
};

const localMinutesToUtcMs = (timeZone, year, month, day, minutesOfDay) => {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  const localAsUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  const fixedOffset = parseUtcOffsetMinutesFromLabel(timeZone);
  if (typeof fixedOffset === 'number') {
    return localAsUtcMs - fixedOffset * 60000;
  }

  const raw = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (raw && raw.includes('/')) {
    // Iterate because offset depends on the instant (DST).
    let guess = localAsUtcMs;
    for (let i = 0; i < 3; i += 1) {
      const off = getTimeZoneOffsetMinutes(raw, new Date(guess));
      const corrected = localAsUtcMs - off * 60000;
      if (Math.abs(corrected - guess) < 1000) return corrected;
      guess = corrected;
    }
    return guess;
  }

  // Fallback: treat as UTC.
  return localAsUtcMs;
};

const getEarliestFutureAvailabilityMs = (daySelections, timeZone, nowMs) => {
  if (!daySelections || typeof daySelections !== 'object') return null;
  const entries = Object.entries(daySelections);
  if (!entries.length) return null;

  let best = Infinity;
  for (const [key, blocks] of entries) {
    if (!Array.isArray(blocks) || blocks.length === 0) continue;
    const parsed = parseDayKey(key);
    if (!parsed) continue;

    for (const block of blocks) {
      const startIdx = Number(block?.start);
      const endIdx = Number(block?.end);
      if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx)) continue;
      const startMin = Math.max(0, Math.min(95, Math.floor(Math.min(startIdx, endIdx)))) * SLOT_MINUTES;
      const endMinExclusive = (Math.max(0, Math.min(95, Math.floor(Math.max(startIdx, endIdx)))) + 1) * SLOT_MINUTES;

      const startMs = localMinutesToUtcMs(timeZone, parsed.year, parsed.month, parsed.day, startMin);
      const endMs = localMinutesToUtcMs(timeZone, parsed.year, parsed.month, parsed.day, endMinExclusive);

      if (endMs <= nowMs) continue;

      const candidate = startMs <= nowMs && nowMs < endMs ? nowMs : startMs;
      if (candidate < best) best = candidate;
    }
  }

  return best === Infinity ? null : best;
};

const getStartDateBucket = (earliestMs, nowMs) => {
  if (typeof earliestMs !== 'number' || !Number.isFinite(earliestMs)) return '';
  const diffDays = (earliestMs - nowMs) / MS_PER_DAY;
  if (diffDays < 1) return '0_1';
  if (diffDays < 3) return '1_3';
  if (diffDays <= 7) return '3_7';
  return 'gt7';
};

const COURSE_TYPE_LABEL_TO_ID = new Map(COURSE_TYPE_OPTIONS.map((o) => [o.label, o.id]));

const normalizeCourseTypeId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (COURSE_TYPE_ID_TO_LABEL[raw]) return raw; // already an id
  const cnLabel = COURSE_TYPE_EN_TO_CN[raw] || raw; // english->cn, or pass-through
  return COURSE_TYPE_LABEL_TO_ID.get(cnLabel) || '';
};

function MentorPage() {
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
  const [cards, setCards] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [appliedRegion, setAppliedRegion] = useState('');
  const [appliedCourseType, setAppliedCourseType] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedCategoryId, setAppliedCategoryId] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const navigate = useNavigate();
  const location = useLocation();
  const askedLoginRef = useRef(false);

  const currentPath = useMemo(() => {
    try {
      const { pathname, search, hash } = window.location;
      return `${pathname}${search || ''}${hash || ''}`;
    } catch {
      return location?.pathname || '/mentor';
    }
  }, [location]);

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
    let alive = true;

    async function load() {
      if (getAuthToken()) askedLoginRef.current = false;
      if (!isLoggedIn || !getAuthToken()) {
        if (!alive) return;
        setStatus('unauthenticated');
        try { sessionStorage.setItem('postLoginRedirect', currentPath); } catch {}
        try { sessionStorage.setItem('requiredRole', 'mentor'); } catch {}
        try { navigate('/mentor', { replace: true, state: { from: currentPath } }); } catch {}
        if (!askedLoginRef.current) {
          askedLoginRef.current = true;
          try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: currentPath } })); } catch {}
        }
        return;
      }

      try {
        setStatus('loading');
        const res = await api.get('/api/mentor/cards');
        if (!alive) return;
        setCards(Array.isArray(res.data?.cards) ? res.data.cards : []);
        setStatus('ok');
      } catch (e) {
        if (!alive) return;
        const status = e?.response?.status;
        if (status === 401) {
          setStatus('unauthenticated');
          // remember intended url for post-login redirect
          try { sessionStorage.setItem('postLoginRedirect', currentPath); } catch {}
          try { sessionStorage.setItem('requiredRole', 'mentor'); } catch {}
          // put state.from in history state
          try { navigate('/mentor', { replace: true, state: { from: currentPath } }); } catch {}
          // prompt login dialog (global event for navbars)
          if (!askedLoginRef.current) {
            askedLoginRef.current = true;
            try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: currentPath } })); } catch {}
          }
          return;
        }
        if (status === 403) {
          const msg = e?.response?.data?.error || '';
          if (msg && (msg.includes('审核') || msg.toLowerCase().includes('pending'))) {
            setStatus('pending');
          } else {
            setStatus('forbidden');
          }
          return;
        }
        setStatus('error');
      }
    }

    load();
    return () => { alive = false; };
  }, [currentPath, isLoggedIn, navigate]);

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      setAppliedRegion(typeof detail.region === 'string' ? detail.region : '');
      setAppliedCourseType(typeof detail.courseType === 'string' ? detail.courseType : '');
      setAppliedStartDate(typeof detail.startDate === 'string' ? detail.startDate : '');
    };
    window.addEventListener(MENTOR_LISTINGS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(MENTOR_LISTINGS_SEARCH_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      setAppliedCategoryId(typeof detail.categoryId === 'string' ? detail.categoryId : null);
    };
    window.addEventListener(MENTOR_LISTINGS_CATEGORY_EVENT, handler);
    return () => window.removeEventListener(MENTOR_LISTINGS_CATEGORY_EVENT, handler);
  }, []);

  useEffect(() => {
    let alive = true;
    if (status !== 'ok') {
      setFavoriteIds(new Set());
      return () => { alive = false; };
    }

    fetchFavoriteItems({ role: 'mentor', itemType: 'student_request', idsOnly: true })
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
  }, [status]);

  const filteredCards = useMemo(() => {
    const list = Array.isArray(cards) ? cards : [];
    const regionKey = appliedRegion.trim();
    const courseTypeId = normalizeCourseTypeId(appliedCourseType);
    const startDateKey = appliedStartDate.trim();
    const referenceDate = new Date();
    const nowMs = referenceDate.getTime();
    return list.filter((item) => {
      if (appliedCategoryId) {
        const rawCourses = Array.isArray(item?.courses) ? item.courses : (item?.courses ? [item.courses] : []);
        const courseIds = rawCourses.map((c) => String(c).trim()).filter(Boolean);
        if (!courseIds.includes(appliedCategoryId)) return false;
      }

      if (regionKey && regionKey !== '随便看看') {
        if (!matchesRegion(item?.timezone, regionKey, referenceDate)) return false;
      }

      if (courseTypeId) {
        const ids = Array.isArray(item?.courseTypes) ? item.courseTypes : (item?.courseType ? [item.courseType] : []);
        const normalizedIds = ids.map(normalizeCourseTypeId).filter(Boolean);
        if (!normalizedIds.includes(courseTypeId)) return false;
      }

      if (startDateKey) {
        const tz = typeof item?.timezone === 'string' ? item.timezone : '';
        const earliestMs = getEarliestFutureAvailabilityMs(item?.daySelections, tz, nowMs);
        const bucket = earliestMs == null ? '' : getStartDateBucket(earliestMs, nowMs);
        if (bucket !== startDateKey) return false;
      }

      return true;
    });
  }, [cards, appliedRegion, appliedCourseType, appliedStartDate, appliedCategoryId]);

  return (
    <div className="app">
      <MentorNavbar />
      <CategoryFilters eventName={MENTOR_LISTINGS_CATEGORY_EVENT} />

      {status === 'ok' && (
        <MentorListings
          data={filteredCards}
          favoriteIds={favoriteIds}
          onFavoriteChange={(itemId, favorited) => {
            setFavoriteIds((prev) => {
              const next = new Set(prev);
              if (favorited) next.add(String(itemId));
              else next.delete(String(itemId));
              return next;
            });
          }}
        />
      )}

      {status === 'forbidden' && (
        <div className="container" style={{ padding: '40px 0', textAlign: 'center', color: '#374151' }}>
          仅导师可访问，请用导师身份登录/注册
        </div>
      )}

      {status === 'pending' && (
        <div className="container mentor-pending-wrap">
          <div className="mentor-pending">
            <svg className="mentor-pending-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 2h12v2l-4 4 4 4v2H6v-2l4-4-4-4V2z" />
              <path d="M8 20h8" />
            </svg>
            <div className="mentor-pending-title">你已准备就绪！</div>
            <div className="mentor-pending-subtitle">感谢加入我们。我们会尽快为你解锁导师账户，并在一切完成后通知你</div>
          </div>
        </div>
      )}

      {(status === 'loading') && (
        <MentorListings data={null} />
      )}
    </div>
  );
}

export default MentorPage;
