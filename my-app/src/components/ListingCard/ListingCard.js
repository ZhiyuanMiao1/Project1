import React from 'react';
import './ListingCard.css';
import defaultImage from '../../assets/images/default-avatar.jpg'; // 默认头像路径

function ListingCard({ data }) {
  return (
    <div className="listing-card">
      <img
        className="listing-avatar"
        src={data.imageUrl ? data.imageUrl : defaultImage} // 如果没有头像，使用默认头像
        alt={data.name}
      />
      <h3 className="listing-name">
        {data.name}{' '}
        <span className="listing-tags">
          <span className={`listing-tag ${data.degree === 'PhD' ? 'phd-tag' : 'msc-tag'}`}>
            {data.degree}
          </span>
          <span className="listing-tag">{data.school}</span>
        </span>
      </h3>
      <p className="listing-rating">
        ⭐ {data.rating} | {data.reviewCount} 条评价
      </p>
      {/* 时区和语言合并 */}
      <div className="listing-timezone-languages">
        <span className="timezone">🌍 {data.timezone}</span>
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

export default ListingCard;
