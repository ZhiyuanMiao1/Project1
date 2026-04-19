import React, { useEffect, useState } from 'react';
import './MentorListingCard.css';
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import { FaHeart, FaGlobe, FaFileAlt, FaGraduationCap, FaClock, FaCalendarAlt, FaLightbulb, FaTasks } from 'react-icons/fa';
import { DIRECTION_LABEL_ICON_MAP, normalizeCourseLabel, COURSE_TYPE_ID_TO_LABEL, COURSE_TYPE_LABEL_ICON_MAP } from '../../constants/courseMappings';
import { toggleFavoriteItem } from '../../api/favorites';
import { getAuthToken } from '../../utils/authStorage';
import { applyAvatarFallback, resolveAvatarSrc } from '../../utils/avatarPlaceholder';
import { useI18n } from '../../i18n/language';

// 时区城市映射，与时区选择下拉一致
const getTimeZoneCityMap = (t) => ({
  '+13': t('listings.city.auckland', '奥克兰'),
  '+11': t('listings.city.solomon', '所罗门群岛'),
  '+10': t('listings.city.brisbane', '布里斯班'),
  '+9': t('listings.city.tokyo', '东京'),
  '+08': t('listings.city.shanghai', '上海'),
  '+8': t('listings.city.shanghai', '上海'),
  '+7': t('listings.city.bangkok', '曼谷'),
  '+6': t('listings.city.dhaka', '达卡'),
  '+5': t('listings.city.karachi', '卡拉奇'),
  '+4': t('listings.city.dubai', '迪拜'),
  '+3': t('listings.city.moscow', '莫斯科'),
  '+2': t('listings.city.johannesburg', '约翰内斯堡'),
  '+1': t('listings.city.berlin', '柏林'),
  '+0': t('listings.city.london', '伦敦'),
  '-8': t('listings.city.losAngeles', '洛杉矶'),
  '-7': t('listings.city.california', '加州'),
  '-6': t('listings.city.chicago', '芝加哥'),
  '-5': t('listings.city.newYork', '纽约'),
  '-4': t('listings.city.halifax', '哈利法克斯'),
  '-3': t('listings.city.saoPaulo', '圣保罗'),
});

const formatTimezoneWithCity = (tz, t) => {
  if (!tz) return '';
  const cityMap = getTimeZoneCityMap(t);
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
          const city = cityMap[hoursKeyPadded] || cityMap[hoursKey];
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
  const city = cityMap[hoursKey] || cityMap[`${sign}${hoursRaw}`];
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
  const { getCourseDirectionDisplayLabel, getCourseTypeLabel, t } = useI18n();
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
      const msg = e?.response?.data?.error || t('listings.actionFailed', '操作失败，请稍后再试');
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
  const courses = normalizedLabels.map((label) => getCourseDirectionDisplayLabel(label, label)).join(' | ');
  const CourseIcon = DIRECTION_LABEL_ICON_MAP[normalizedLabels[0]] || FaFileAlt;

  const courseTypeIds = Array.isArray(data?.courseTypes) ? data.courseTypes : [];
  const courseTypeRaw = data?.courseType ? String(data.courseType).trim() : '';
  const courseTypeLabels = (
    courseTypeIds.length
      ? courseTypeIds.map((id) => {
          const raw = String(id).trim();
          const fallback = COURSE_TYPE_ID_TO_LABEL[raw] || raw;
          return getCourseTypeLabel(raw, fallback);
        }).filter(Boolean)
      : (courseTypeRaw ? [getCourseTypeLabel(courseTypeRaw, COURSE_TYPE_ID_TO_LABEL[courseTypeRaw] || courseTypeRaw)] : [])
  );
  const courseTypeLabel = courseTypeLabels.join(' | ');
  const CourseTypeIcon = COURSE_TYPE_LABEL_ICON_MAP[courseTypeLabels[0]] || FaGraduationCap;

  const timezoneLabel = data?.timezone ? formatTimezoneWithCity(data.timezone, t) : '';
  const avatarUrl = typeof data?.avatarUrl === 'string' && data.avatarUrl.trim() ? data.avatarUrl.trim() : '';
  const rawId = typeof data?.id !== 'undefined' && data?.id !== null ? String(data.id).trim() : '';
  const stableStudentId = typeof data?.studentPublicId === 'string' ? data.studentPublicId.trim() : '';
  const avatarSeed = stableStudentId || name || rawId || school || timezoneLabel || 'mentor';
  const avatarSrc = resolveAvatarSrc({
    src: avatarUrl,
    name,
    seed: avatarSeed,
    size: 256,
  });
  const expectedDurationLabel = (() => {
    const raw = data?.expectedDuration;
    if (typeof raw === 'string') {
      const text = raw.trim();
      const match = text.match(/^预计时长[:：]\s*(\d+(?:\.\d+)?)\s*小时$/);
      if (match) return t('listings.hours', '{hours}小时', { hours: match[1] });
      return text;
    }
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return t('listings.hours', '{hours}小时', { hours: raw });
    return '';
  })();
  const degreeLabel = (() => {
    const raw = String(degree || '').trim();
    const lower = raw.toLowerCase();
    if (lower.includes('phd') || raw.includes('博士')) return t('profile.degree.phd', raw || '博士');
    if (raw.includes('本科') || lower.includes('bachelor')) return t('profile.degree.bachelor', raw || '本科');
    if (raw.includes('硕士') || lower.includes('master')) return t('profile.degree.master', raw || '硕士');
    return raw;
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

  const requirementsLabel = (() => {
    const raw = data?.requirements;
    if (typeof raw !== 'string') return '';
    const text = raw.trim();
    if (!text) return '';
    const match = text.match(/^期望首课[:：]\s*(.+)$/);
    if (match) return t('courseRequest.earliestLesson', '期望首课：{value}', { value: match[1] });
    return text;
  })();

  const detailHref = rawId ? `/mentor/requests/${encodeURIComponent(rawId)}` : '';
  const WrapperTag = disableNavigation ? 'div' : 'a';
  const wrapperProps = disableNavigation
    ? {}
    : {
        href: detailHref || undefined,
        target: detailHref ? '_blank' : undefined,
        rel: detailHref ? 'noopener noreferrer' : undefined,
        'aria-label': t('listings.openRequestDetail', '在新标签页查看课程需求：{name}', { name }),
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
        aria-label={isFavorited ? t('listings.unfavorite', '取消收藏') : t('listings.favorite', '收藏')}
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
          <img
            className="avatar-img"
            src={avatarSrc}
            alt=""
            onError={(event) => applyAvatarFallback(event, {
              name,
              seed: avatarSeed,
              size: 256,
            })}
          />
        </div>
        <div className="header-texts">
          <div className="name">{name}</div>
          <div className="chips">
            {!!degreeLabel && <span className={`chip ${degreeClass}`}>{degreeLabel}</span>}
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
            <span>{t('listings.details', '具体内容：{value}', { value: courseFocusLabel })}</span>
          </div>
        )}
        {!!milestoneLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaTasks /></span>
            <span>{t('listings.goal', '学习目标：{value}', { value: milestoneLabel })}</span>
          </div>
        )}
        {!!requirementsLabel && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>{requirementsLabel}</span>
          </div>
        )}
      </div>
    </WrapperTag>
  );
}

export default MentorListingCard;
