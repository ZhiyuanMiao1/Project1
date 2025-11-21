import React, { useState } from 'react';
import './MentorListingCard.css';
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import { FaHeart, FaGlobe, FaFileAlt, FaGraduationCap, FaClock, FaCalendarAlt } from 'react-icons/fa';
import { DIRECTION_LABEL_ICON_MAP, normalizeCourseLabel, COURSE_TYPE_LABEL_ICON_MAP } from '../../constants/courseMappings';

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
  if (tz.includes('(')) return tz;
  const match = tz.match(/UTC\s*([+-])\s*(\d{1,2})(?::\d{2})?/i);
  if (!match) return tz;
  const sign = match[1] === '-' ? '-' : '+';
  const hoursRaw = match[2];
  const hoursKey = hoursRaw.length === 1 ? `${sign}${hoursRaw}` : `${sign}${hoursRaw.padStart(2, '0')}`;
  const city = TZ_CITY_MAP[hoursKey] || TZ_CITY_MAP[`${sign}${hoursRaw}`];
  return city ? `${tz.trim()} (${city})` : tz;
};

function MentorListingCard({ data }) {
  const [isFavorited, setIsFavorited] = useState(false);
  const { ref: revealRef, visible } = useRevealOnScroll();

  const toggleFavorite = () => setIsFavorited((v) => !v);

  const name = (data?.name && String(data.name).trim()) || `S${data?.id ?? ''}`;
  const degree = data?.degree || '';
  const school = data?.school || '';

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

  const CourseTypeIcon = COURSE_TYPE_LABEL_ICON_MAP[data?.courseType] || FaGraduationCap;

  const timezoneLabel = data?.timezone ? formatTimezoneWithCity(data.timezone) : '';

  return (
    // 保持原有 .listing-card 尺寸规则，同时套用预览卡的视觉风格
    <div ref={revealRef} className={`listing-card mentor-preview-card reveal ${visible ? 'is-visible' : ''}`}>
      <button
        type="button"
        aria-label={isFavorited ? '取消收藏' : '收藏'}
        className={`card-fav ${isFavorited ? 'favorited' : ''}`}
        onClick={toggleFavorite}
      >
        <FaHeart />
      </button>

      <div className="card-header">
        <div className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase() || 'S'}
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
        {!!data?.courseType && (
          <div className="item" role="listitem">
            <span className="icon"><CourseTypeIcon /></span>
            <span>{data.courseType}</span>
          </div>
        )}
        {!!data?.expectedDuration && (
          <div className="item" role="listitem">
            <span className="icon"><FaClock /></span>
            <span>{data.expectedDuration}</span>
          </div>
        )}
        {!!data?.requirements && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>{data.requirements}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default MentorListingCard;
