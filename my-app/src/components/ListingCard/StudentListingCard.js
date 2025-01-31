import React, { useState } from 'react';
import './StudentListingCard.css';
import defaultImage from '../../assets/images/default-avatar.jpg'; // 默认头像路径

function StudentListingCard({ data }) {
  // 添加一个 state 用于管理收藏状态
  const [isFavorited, setIsFavorited] = useState(false);

  // 切换收藏状态的函数
  const toggleFavorite = () => {
    setIsFavorited(!isFavorited);
  };

  return (
    <div className="listing-card">
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

export default StudentListingCard;