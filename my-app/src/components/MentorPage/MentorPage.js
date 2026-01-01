import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MentorNavbar from '../Navbar/MentorNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import MentorListings from '../Listings/MentorListings';
import api from '../../api/client';
import { fetchFavoriteItems } from '../../api/favorites';
import './MentorPage.css';

const MENTOR_LISTINGS_SEARCH_EVENT = 'mentor:listings-search';

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

function MentorPage() {
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
  const [cards, setCards] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [appliedRegion, setAppliedRegion] = useState('');
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
    let alive = true;

    async function load() {
      try {
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
  }, [currentPath, navigate]);

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      setAppliedRegion(typeof detail.region === 'string' ? detail.region : '');
    };
    window.addEventListener(MENTOR_LISTINGS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(MENTOR_LISTINGS_SEARCH_EVENT, handler);
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
    if (!appliedRegion || appliedRegion.trim() === '' || appliedRegion.trim() === '随便看看') return list;
    const referenceDate = new Date();
    return list.filter((item) => matchesRegion(item?.timezone, appliedRegion, referenceDate));
  }, [cards, appliedRegion]);

  return (
    <div className="app">
      <MentorNavbar />
      <CategoryFilters />

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
