import React, { useState } from 'react';
import './StudentListingCard.css';
import defaultImage from '../../assets/images/default-avatar.jpg'; // 默认头像路径
import useRevealOnScroll from '../../hooks/useRevealOnScroll';

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

const formatTimezoneWithCity = (tz) => {
  if (!tz) return '';
  if (tz.includes('(')) return tz; // 已有城市名
  const match = tz.match(/UTC\s*([+-])\s*(\d{1,2})(?::\d{2})?/i);
  if (!match) return tz;
  const sign = match[1] === '-' ? '-' : '+';
  const hoursRaw = match[2];
  const hoursKey = hoursRaw.length === 1 ? `${sign}${hoursRaw}` : `${sign}${hoursRaw.padStart(2, '0')}`;
  const city = TZ_CITY_MAP[hoursKey] || TZ_CITY_MAP[`${sign}${hoursRaw}`];
  return city ? `${tz.trim()} (${city})` : tz;
};

function StudentListingCard({ data }) {
  const [isFavorited, setIsFavorited] = useState(false);
  const { ref: revealRef, visible } = useRevealOnScroll();

  const toggleFavorite = () => {
    setIsFavorited(!isFavorited);
  };

  const degreeClass = (() => {
    const d = (data.degree || '').toLowerCase();
    if (d.includes('phd') || d.includes('博士')) return 'degree-phd';
    if (d.includes('本科') || d.includes('bachelor')) return 'degree-bachelor';
    if (d.includes('硕士') || d.includes('master')) return 'degree-master';
    return '';
  })();

  const timezoneLabel = formatTimezoneWithCity(data.timezone);

  return (
    <div ref={revealRef} className={`listing-card reveal ${visible ? 'is-visible' : ''}`}>
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
          <span className="listing-tag">{data.school}</span>
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
        <span className="rating-text">{data.rating} | {data.reviewCount} 条评价</span>
      </p>
      {/* 时区和语言合并 */}
      <div className="listing-timezone-languages">
        <span className="timezone">🌍 {timezoneLabel}</span>
        <div className="listing-languages">
          {data.languages.split(',').map((lang, index) => (
            <span key={index} className={`language-tag ${lang.trim()}-tag`}>
              {lang.trim()}
            </span>
          ))}
        </div>
      </div>
      <p className="listing-courses">{data.courses.join(' | ')}</p>
    </div>
  );
}

export default StudentListingCard;
