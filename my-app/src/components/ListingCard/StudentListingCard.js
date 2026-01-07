import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentListingCard.css';
import defaultImage from '../../assets/images/default-avatar.jpg'; // 默认头像路径
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import { toggleFavoriteItem } from '../../api/favorites';

// 统一时区城市显示（与时区下拉一致）
const TZ_CITY_MAP = {
  '+13': '奥克兰',
  '+11': '所罗门群岛',
  '+10': '布里斯班',
  '+9': '东京',
  '+08': '上海',
  '+8': '上海',
  '+7': '曼谷',
  '+6': '达卡',
  '+5': '卡拉奇',
  '+4': '迪拜',
  '+3': '莫斯科',
  '+2': '约翰内斯堡',
  '+1': '柏林',
  '+0': '伦敦',
  '-8': '洛杉矶',
  '-7': '加州',
  '-6': '芝加哥',
  '-5': '纽约',
  '-4': '哈利法克斯',
  '-3': '圣保罗',
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
    const parts = Object.fromEntries(fmt.formatToParts(referenceDate).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(iso);
    return Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);
  } catch {
    return 0;
  }
};

const buildUtcOffsetLabel = (offsetMinutes) => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (minutes === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatTimezoneWithCity = (tz) => {
  if (!tz) return '';
  const raw = String(tz).trim();
  const stripped = raw.replace(/\s*\(.*\)\s*$/, '').trim();
  const base = raw.includes('/') && !/UTC\s*[+-]/i.test(stripped)
    ? buildUtcOffsetLabel(getTimeZoneOffsetMinutes(raw))
    : stripped;

  const match = base.match(/UTC\s*([+-])\s*(\d{1,2})(?::\d{2})?/i);
  if (!match) return stripped || raw;
  const sign = match[1] === '-' ? '-' : '+';
  const hoursRaw = match[2];
  const hoursKey = hoursRaw.length === 1 ? `${sign}${hoursRaw}` : `${sign}${hoursRaw.padStart(2, '0')}`;
  const city = TZ_CITY_MAP[hoursKey] || TZ_CITY_MAP[`${sign}${hoursRaw}`];
  return city ? `${base} (${city})` : base;
};

function StudentListingCard({
  data,
  favoriteRole,
  favoriteItemType,
  favoriteItemId,
  initialFavorited = false,
  onFavoriteChange,
}) {
  const navigate = useNavigate();
  const [isFavorited, setIsFavorited] = useState(!!initialFavorited);
  const { ref: revealRef, visible } = useRevealOnScroll();

  useEffect(() => {
    setIsFavorited(!!initialFavorited);
  }, [initialFavorited]);

  const toggleFavorite = async (event) => {
    event?.stopPropagation?.();
    if (!favoriteRole || !favoriteItemType) {
      setIsFavorited((v) => !v);
      return;
    }

    const itemId = typeof favoriteItemId !== 'undefined' ? String(favoriteItemId) : (typeof data?.id !== 'undefined' ? String(data.id) : '');
    if (!itemId) {
      setIsFavorited((v) => !v);
      return;
    }

    let token = null;
    try {
      token = localStorage.getItem('authToken');
    } catch {}

    if (!token) {
      try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: window.location?.pathname || '/student' } })); } catch {}
      return;
    }

    try {
      const res = await toggleFavoriteItem({
        role: favoriteRole,
        itemType: favoriteItemType,
        itemId,
        payload: data,
      });
      const next = !!res?.data?.favorited;
      setIsFavorited(next);
      if (typeof onFavoriteChange === 'function') {
        onFavoriteChange(itemId, next, res?.data);
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: window.location?.pathname || '/student' } })); } catch {}
        return;
      }
      const msg = e?.response?.data?.error || '操作失败，请稍后再试';
      alert(msg);
    }
  };

  const degreeClass = (() => {
    const d = (data.degree || '').toLowerCase();
    if (d.includes('phd') || d.includes('博士')) return 'degree-phd';
    if (d.includes('本科') || d.includes('bachelor')) return 'degree-bachelor';
    if (d.includes('硕士') || d.includes('master')) return 'degree-master';
    return '';
  })();

  const school = typeof data?.school === 'string' ? data.school.trim() : '';

  const timezoneLabel = formatTimezoneWithCity(data.timezone);
  const courses = Array.isArray(data?.courses) ? data.courses : [];
  const coursesLabel = courses.map((c) => String(c ?? '').trim()).filter(Boolean).join(' | ');
  const languagesRaw = typeof data?.languages === 'string' ? data.languages : '';
  const ratingRaw = Number.parseFloat(String(data?.rating ?? 0));
  const ratingValue = Number.isFinite(ratingRaw) && ratingRaw > 0 ? Math.round(ratingRaw * 10) / 10 : 0;
  const reviewRaw = Number.parseInt(String(data?.reviewCount ?? 0), 10);
  const reviewCountValue = Number.isFinite(reviewRaw) && reviewRaw > 0 ? reviewRaw : 0;
  const languageTokens = languagesRaw
    ? languagesRaw.split(',').map((lang) => lang.trim()).filter(Boolean)
    : [];

  const handleOpenProfile = () => {
    const id = typeof data?.id !== 'undefined' && data?.id !== null ? String(data.id).trim() : '';
    if (!id) return;
    const path = `/student/mentors/${encodeURIComponent(id)}`;
    const url = (() => {
      try {
        return new URL(path, window.location.origin).toString();
      } catch {
        return path;
      }
    })();

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      navigate(path, { state: { mentor: data } });
    }
  };

  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenProfile();
    }
  };

  return (
    <div
      ref={revealRef}
      className={`listing-card reveal ${visible ? 'is-visible' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleOpenProfile}
      onKeyDown={handleCardKeyDown}
      aria-label={`在新页面打开导师主页：${data?.name || data?.id || ''}`}
    >
      {/* 右上角的爱心图标 */}
      <div className={`favorite-icon ${isFavorited ? 'favorited' : ''}`} onClick={toggleFavorite}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="heart-icon"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </div>
      {/* 左上角性别标记：男=蓝色♂，女=粉色♀ */}
      {data.gender && (data.gender === '男' || data.gender === '女') && (
        <div className={`gender-badge ${data.gender === '男' ? 'gender-male' : 'gender-female'}`} aria-hidden="true">
          {data.gender === '男' ? '♂' : '♀'}
        </div>
      )}
      <img
        className="listing-avatar"
        src={data.imageUrl ? data.imageUrl : defaultImage} // 如果没有头像，使用默认头像
        alt={data.name}
      />
      <h3 className="listing-name">
        {data.name}{' '}
        <span className="listing-tags">
          <span className={`listing-tag ${degreeClass}`}>
            {data.degree}
          </span>
          {school ? <span className="listing-tag">{school}</span> : null}
        </span>
      </h3>
      <p className="listing-rating">
        <svg
          className="rating-star"
          viewBox="0 0 24 24"
          role="img"
          aria-label="rating star"
          focusable="false"
        >
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
        <span className="rating-text">{ratingValue} | {reviewCountValue} 条评价</span>
      </p>
      {/* 时区和语言合并 */}
      <div className="listing-timezone-languages">
        <span className="timezone">🌍 {timezoneLabel}</span>
        <div className="listing-languages">
          {languageTokens.map((lang, index) => (
            <span key={index} className={`language-tag ${lang.trim()}-tag`}>
              {lang.trim()}
            </span>
          ))}
        </div>
      </div>
      {coursesLabel ? <p className="listing-courses">{coursesLabel}</p> : null}
    </div>
  );
}

export default StudentListingCard;
