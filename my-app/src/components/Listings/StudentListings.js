import React, { useEffect, useMemo, useState } from 'react';
import StudentListingCard from '../ListingCard/StudentListingCard';
import './Listings.css';
import { fetchFavoriteItems } from '../../api/favorites';
import { fetchApprovedMentors } from '../../api/mentors';

const STUDENT_LISTINGS_SEARCH_EVENT = 'student:listings-search';

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
  const match = raw.match(/UTC\\s*([+-])\\s*(\\d{1,2})(?::(\\d{2}))?/i);
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

const matchesRegion = (mentorTimezone, region, referenceDate = new Date()) => {
  const key = typeof region === 'string' ? region.trim() : '';
  if (!key || key === '随便看看') return true;
  const ranges = REGION_OFFSET_RANGES[key];
  if (!ranges) return true;

  const offMin = getTimezoneOffsetMinutesFlexible(mentorTimezone, referenceDate);
  if (typeof offMin !== 'number') return false;
  const offHours = offMin / 60;
  return ranges.some((r) => offHours >= r.min && offHours <= r.max);
};

const hasNonEmptyText = (value) => typeof value === 'string' && value.trim().length > 0;

const hasAnyMentorCardInfo = (mentor) => {
  const courses = Array.isArray(mentor?.courses) ? mentor.courses : [];
  const hasCourses = courses.some((c) => typeof c === 'string' && c.trim().length > 0);

  return (
    hasNonEmptyText(mentor?.imageUrl) ||
    hasNonEmptyText(mentor?.school) ||
    hasNonEmptyText(mentor?.degree) ||
    hasNonEmptyText(mentor?.timezone) ||
    hasNonEmptyText(mentor?.gender) ||
    hasCourses
  );
};

function StudentListings() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [allMentors, setAllMentors] = useState([]);
  const [listError, setListError] = useState('');
  const [appliedRegion, setAppliedRegion] = useState('');
  const [appliedExactSearch, setAppliedExactSearch] = useState('');

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      setAppliedRegion(typeof detail.region === 'string' ? detail.region : '');
      setAppliedExactSearch(typeof detail.exactSearch === 'string' ? detail.exactSearch : '');
    };
    window.addEventListener(STUDENT_LISTINGS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(STUDENT_LISTINGS_SEARCH_EVENT, handler);
  }, []);

  const mentors = useMemo(() => {
    const region = typeof appliedRegion === 'string' ? appliedRegion.trim() : '';
    const needle = typeof appliedExactSearch === 'string' ? appliedExactSearch.trim() : '';
    const needleLower = needle.toLowerCase();
    const now = new Date();

    return (Array.isArray(allMentors) ? allMentors : []).filter((m) => {
      if (!matchesRegion(m?.timezone, region, now)) return false;
      if (!needle) return true;
      const id = String(m?.id ?? '');
      const name = String(m?.name ?? '');
      return id.toLowerCase().includes(needleLower) || name.toLowerCase().includes(needleLower);
    });
  }, [allMentors, appliedRegion, appliedExactSearch]);

  // 模拟加载动画，避免页面切换过于生硬
  useEffect(() => {
    let alive = true;
    let timer = null;

    const load = async () => {
      setListError('');
      setLoading(true);
      const startedAt = Date.now();

      try {
        const res = await fetchApprovedMentors();
        if (!alive) return;

        const list = Array.isArray(res?.data?.mentors) ? res.data.mentors : [];
        const normalized = list
          .map((item) => {
            const ratingRaw = Number.parseFloat(String(item?.rating ?? 0));
            const reviewCountRaw = Number.parseInt(String(item?.reviewCount ?? item?.review_count ?? 0), 10);

            return {
              ...item,
              id: item?.id,
              name: item?.name,
              gender: item?.gender || '',
              degree: item?.degree || '',
              school: item?.school || '',
              rating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? Math.round(ratingRaw * 10) / 10 : 0,
              reviewCount: Number.isFinite(reviewCountRaw) && reviewCountRaw > 0 ? reviewCountRaw : 0,
              courses: Array.isArray(item?.courses) ? item.courses : [],
              timezone: typeof item?.timezone === 'string' ? item.timezone : '',
              languages: typeof item?.languages === 'string' ? item.languages : '',
              imageUrl: item?.imageUrl ?? item?.avatarUrl ?? item?.avatar_url ?? null,
            };
          })
          .filter((item) => item && item.id && hasAnyMentorCardInfo(item));

        setAllMentors(normalized);
      } catch (e) {
        if (!alive) return;
        setAllMentors([]);
        const msg = e?.response?.data?.error || e?.message || 'Failed to load mentors';
        setListError(String(msg));
      } finally {
        const elapsed = Date.now() - startedAt;
        const minDelay = 500;
        const remaining = minDelay - elapsed;
        const done = () => {
          if (!alive) return;
          setLoading(false);
        };
        if (remaining > 0) timer = setTimeout(done, remaining);
        else done();
      }
    };

    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch { setIsLoggedIn(false); }
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

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

  const favoriteIdSet = useMemo(() => favoriteIds, [favoriteIds]);
  /* const listingData = [
    {
      id: 1,
      name: '张三',
      gender: '男',
      degree: 'PhD',
      school: '哈佛大学',
      rating: 4.9,
      reviewCount: 120,
      courses: ['Python编程', '机器学习', '深度学习'],
      timezone: 'UTC+8 (北京)',
      languages: '中文, 英语',
      imageUrl: tutor1Image,
    },
    {
      id: 2,
      name: '李四',
      gender: '女',
      degree: '硕士',
      school: '斯坦福大学',
      rating: 4.8,
      reviewCount: 95,
      courses: ['深度学习', '自然语言处理'],
      timezone: 'UTC-7 (加州)',
      languages: '英语, 西班牙语',
      imageUrl: tutor2Image,
    },
    {
      id: 3,
      name: '王五',
      gender: '男',
      degree: 'PhD',
      school: '麻省理工学院',
      rating: 4.7,
      reviewCount: 80,
      courses: ['数据分析', '统计建模', '数据可视化', '大数据处理'],
      timezone: 'UTC+1 (伦敦)',
      languages: '英语, 德语',
      imageUrl: tutor3Image,
    },
    {
      id: 4,
      name: '赵六',
      gender: '男',
      degree: '本科',
      school: '清华大学',
      rating: 5.0,
      reviewCount: 150,
      courses: ['算法设计', '高等数学'],
      timezone: 'UTC +8 (北京)',
      languages: '中文, 英语',
      imageUrl: tutor4Image,
    },
    {
      id: 5,
      name: 'Emily Smith',
      gender: '女',
      degree: 'PhD',
      school: '剑桥大学',
      rating: 4.85,
      reviewCount: 60,
      courses: ['微积分', '高等代数', '线性代数', '概率论', '数值分析'],
      timezone: 'UTC+0 (伦敦)',
      languages: '英语, 法语',
      imageUrl: tutor5Image,
    },
    {
      id: 6,
      name: 'Michael Johnson',
      gender: '男',
      degree: '硕士',
      school: '加州理工学院',
      rating: 4.75,
      reviewCount: 45,
      courses: ['数据挖掘'],
      timezone: 'UTC-8 (加州)',
      languages: '英语',
      imageUrl: tutor6Image,
    },
    {
      id: 7,
      name: '刘强',
      gender: '男',
      degree: 'PhD',
      school: '香港大学',
      rating: 4.9,
      reviewCount: 100,
      courses: ['网络安全', '信息加密', '区块链技术', '密码学'],
      timezone: 'UTC+8 (香港)',
      languages: '中文, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 8,
      name: 'Anna Müller',
      gender: '女',
      degree: '本科',
      school: '慕尼黑工业大学',
      rating: 4.6,
      reviewCount: 50,
      courses: ['工程数学', '线性代数'],
      timezone: 'UTC+1 (德国)',
      languages: '德语, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 9,
      name: '田七',
      gender: '男',
      degree: 'PhD',
      school: '东京大学',
      rating: 5.0,
      reviewCount: 120,
      courses: ['物理学', '量子力学', '天体物理', '热力学', '统计力学'],
      timezone: 'UTC+9 (东京)',
      languages: '日语, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 10,
      name: 'Carlos Lopez',
      gender: '男',
      degree: 'PhD',
      school: '墨西哥国立自治大学',
      rating: 4.8,
      reviewCount: 75,
      courses: ['统计学', '数据挖掘'],
      timezone: 'UTC-6 (墨西哥)',
      languages: '西班牙语, 英语',
      imageUrl: null, // 使用默认头像
    },
  ]; */

  return (
    <div className="listings container">
      <div className="listing-grid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk-card">
                <div className="sk sk-avatar" />
                <div className="sk sk-title" />
                <div className="sk-chips">
                  <div className="sk sk-chip" />
                  <div className="sk sk-chip" />
                </div>
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line short" />
              </div>
            ))
          : listError ? (
              <p style={{ margin: 0, color: '#64748b', gridColumn: '1 / -1' }}>{listError}</p>
            ) : mentors.length === 0 ? (
              <div className="listing-empty" role="status" aria-live="polite">暂无导师</div>
            ) : mentors.map((item) => (
              <StudentListingCard
                key={item.id}
                data={item}
                favoriteRole="student"
                favoriteItemType="tutor"
                favoriteItemId={item.id}
                initialFavorited={favoriteIdSet.has(String(item.id))}
                onFavoriteChange={(itemId, favorited) => {
                  setFavoriteIds((prev) => {
                    const next = new Set(prev);
                    if (favorited) next.add(String(itemId));
                    else next.delete(String(itemId));
                    return next;
                  });
                }}
              />
            ))}
      </div>
    </div>
  );
}

export default StudentListings;
