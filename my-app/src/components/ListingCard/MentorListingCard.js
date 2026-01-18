import React, { useEffect, useState } from 'react';
import './MentorListingCard.css';
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import { FaHeart, FaGlobe, FaFileAlt, FaGraduationCap, FaClock, FaCalendarAlt, FaLightbulb, FaTasks } from 'react-icons/fa';
import { DIRECTION_LABEL_ICON_MAP, normalizeCourseLabel, COURSE_TYPE_ID_TO_LABEL, COURSE_TYPE_LABEL_ICON_MAP } from '../../constants/courseMappings';
import { toggleFavoriteItem } from '../../api/favorites';
import { getAuthToken } from '../../utils/authStorage';

// 时区城市映射，与时区选择下拉一致
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

const formatTimezoneWithCity = (tz) => {
  if (!tz) return '';
  const raw = String(tz).trim();
  const base = raw.replace(/\s*\(.*\)\s*$/, '').trim();
  const match = base.match(/UTC\s*([+-])\s*(\d{1,2})(?::\d{2})?/i);
  if (!match) {
    // Support IANA time zones like "Asia/Shanghai"
    if (raw.includes('/')) {
      try {
        const referenceDate = new Date();
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: raw,
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
        const offMin = Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);

        if (Number.isFinite(offMin)) {
          const sign = offMin < 0 ? '-' : '+';
          const abs = Math.abs(offMin);
          const hh = Math.floor(abs / 60);
          const mm = abs % 60;
          const utc = mm ? `UTC${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : `UTC${sign}${hh}`;
          const hoursKey = `${sign}${String(hh)}`;
          const hoursKeyPadded = `${sign}${String(hh).padStart(2, '0')}`;
          const city = TZ_CITY_MAP[hoursKeyPadded] || TZ_CITY_MAP[hoursKey];
          return city ? `${utc} (${city})` : utc;
        }
      } catch {
        // ignore
      }
    }
    return raw;
  }
  const sign = match[1] === '-' ? '-' : '+';
  const hoursRaw = match[2];
  const hoursKey = hoursRaw.length === 1 ? `${sign}${hoursRaw}` : `${sign}${hoursRaw.padStart(2, '0')}`;
  const city = TZ_CITY_MAP[hoursKey] || TZ_CITY_MAP[`${sign}${hoursRaw}`];
  return city ? `${base} (${city})` : base;
};

function MentorListingCard({
  data,
  favoriteRole,
  favoriteItemType,
  favoriteItemId,
  initialFavorited = false,
  onFavoriteChange,
  disableNavigation = false,
}) {
  const [isFavorited, setIsFavorited] = useState(!!initialFavorited);
  const { ref: revealRef, visible } = useRevealOnScroll();

  const getReturnPath = () => {
    try {
      const { pathname, search, hash } = window.location;
      const path = `${pathname}${search || ''}${hash || ''}`;
      return path || '/mentor';
    } catch {
      return '/mentor';
    }
  };

  useEffect(() => {
    setIsFavorited(!!initialFavorited);
  }, [initialFavorited]);

  const toggleFavorite = async (event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!favoriteRole || !favoriteItemType) {
      setIsFavorited((v) => !v);
      return;
    }

    const itemId = typeof favoriteItemId !== 'undefined'
      ? String(favoriteItemId)
      : (typeof data?.id !== 'undefined' ? String(data.id) : '');

    if (!itemId) {
      setIsFavorited((v) => !v);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: getReturnPath() } })); } catch {}
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
        try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: getReturnPath() } })); } catch {}
        return;
      }
      const msg = e?.response?.data?.error || '操作失败，请稍后再试';
      alert(msg);
    }
  };

  const name = (data?.name && String(data.name).trim()) || `S${data?.id ?? ''}`;
  const degree = data?.degree || '';
  const school = typeof data?.school === 'string' ? data.school.trim() : (data?.school ? String(data.school).trim() : '');

  const degreeClass = (() => {
    const d = (degree || '').toLowerCase();
    if (d.includes('phd') || d.includes('博士')) return 'degree-phd';
    if (d.includes('本科') || d.includes('bachelor')) return 'degree-bachelor';
    if (d.includes('硕士') || d.includes('master')) return 'degree-master';
    return '';
  })();

  const courseTitles = Array.isArray(data?.courses)
    ? data.courses
    : (data?.courses ? [data.courses] : []);
  const normalizedLabels = Array.from(new Set(courseTitles.map(normalizeCourseLabel).filter(Boolean)));
  const courses = normalizedLabels.join(' | ');
  const CourseIcon = DIRECTION_LABEL_ICON_MAP[normalizedLabels[0]] || FaFileAlt;

  const courseTypeIds = Array.isArray(data?.courseTypes) ? data.courseTypes : [];
  const courseTypeRaw = data?.courseType ? String(data.courseType).trim() : '';
  const courseTypeLabels = (
    courseTypeIds.length
      ? courseTypeIds.map((id) => COURSE_TYPE_ID_TO_LABEL[String(id).trim()] || String(id).trim()).filter(Boolean)
      : (courseTypeRaw ? [COURSE_TYPE_ID_TO_LABEL[courseTypeRaw] || courseTypeRaw] : [])
  );
  const courseTypeLabel = courseTypeLabels.join('、');
  const CourseTypeIcon = COURSE_TYPE_LABEL_ICON_MAP[courseTypeLabels[0]] || FaGraduationCap;

  const timezoneLabel = data?.timezone ? formatTimezoneWithCity(data.timezone) : '';
  const avatarUrl = typeof data?.avatarUrl === 'string' && data.avatarUrl.trim() ? data.avatarUrl.trim() : '';
  const expectedDurationLabel = (() => {
    const raw = data?.expectedDuration;
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return `${raw}小时`;
    return '';
  })();

  const courseFocusLabel = (() => {
    const raw = data?.courseFocus;
    if (typeof raw === 'string') return raw.trim();
    if (raw === null || typeof raw === 'undefined') return '';
    return String(raw).trim();
  })();

  const milestoneLabel = (() => {
    const raw = data?.milestone;
    if (typeof raw === 'string') return raw.trim();
    if (raw === null || typeof raw === 'undefined') return '';
    return String(raw).trim();
  })();

  const rawId = typeof data?.id !== 'undefined' && data?.id !== null ? String(data.id).trim() : '';
  const detailHref = rawId ? `/mentor/requests/${encodeURIComponent(rawId)}` : '';
  const WrapperTag = disableNavigation ? 'div' : 'a';
  const wrapperProps = disableNavigation
    ? {}
    : {
        href: detailHref || undefined,
        target: detailHref ? '_blank' : undefined,
        rel: detailHref ? 'noopener noreferrer' : undefined,
        'aria-label': `在新标签页查看课程需求：${name}`,
      };

  return (
    // 保持原有 .listing-card 尺寸规则，同时套用预览卡的视觉风格
    <WrapperTag
      ref={revealRef}
      className={`listing-card mentor-preview-card${disableNavigation ? ' is-static' : ''} reveal ${visible ? 'is-visible' : ''}`}
      {...wrapperProps}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={isFavorited ? '取消收藏' : '收藏'}
        aria-pressed={isFavorited}
        className={`card-fav ${isFavorited ? 'favorited' : ''}`}
        onClick={toggleFavorite}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleFavorite(event);
          }
        }}
      >
        <FaHeart />
      </div>

      <div className="card-header">
        <div className="avatar" aria-hidden="true">
          {avatarUrl ? <img className="avatar-img" src={avatarUrl} alt="" /> : (name.slice(0, 1).toUpperCase() || 'S')}
        </div>
        <div className="header-texts">
          <div className="name">{name}</div>
          <div className="chips">
            {!!degree && <span className={`chip ${degreeClass}`}>{degree}</span>}
            {!!school && <span className="chip gray">{school}</span>}
          </div>
        </div>
      </div>

      <div className="card-list" role="list">
        {!!timezoneLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaGlobe /></span>
            <span>{timezoneLabel}</span>
          </div>
        )}
        {!!courses && (
          <div className="item" role="listitem">
            <span className="icon"><CourseIcon /></span>
            <span>{courses}</span>
          </div>
        )}
        {!!courseTypeLabel && (
          <div className="item" role="listitem">
            <span className="icon"><CourseTypeIcon /></span>
            <span>{courseTypeLabel}</span>
          </div>
        )}
        {!!expectedDurationLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaClock /></span>
            <span>{expectedDurationLabel}</span>
          </div>
        )}
        {!!courseFocusLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaLightbulb /></span>
            <span>具体内容：{courseFocusLabel}</span>
          </div>
        )}
        {!!milestoneLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaTasks /></span>
            <span>学习目标：{milestoneLabel}</span>
          </div>
        )}
        {!!data?.requirements && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>{data.requirements}</span>
          </div>
        )}
      </div>
    </WrapperTag>
  );
}

export default MentorListingCard;
