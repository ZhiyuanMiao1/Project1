import React, { useState } from 'react';
import './TeacherListingCard.css';

function TeacherListingCard({ data }) {
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
      <h3 className="teacher-listing-name">Student{data.id}</h3>
      <div className="teacher-listing-tags">
        <span className={`teacher-listing-tag ${data.degree.toLowerCase()}-tag`}>
          {data.degree}
        </span>
        <span className="teacher-listing-tag">{data.school}</span>
      </div>
      {/* 时区 */}
      <div className="teacher-listing-timezone">
        <span className="teacher-timezone">🌍 {data.timezone}</span>
      </div>
      {/* 课程名称 */}
      <p className="teacher-listing-courses">📚 {data.courses}</p>
      {/* 期望时长 */}
      <p className="teacher-listing-duration">⏳ 期望时长: {data.expectedDuration}</p>
      {/* 最近期望上课时间 */}
      <p className="teacher-listing-expected-time">📅 最近期望上课: {data.expectedTime}</p>
      {/* 具体需求 */}
      <p className="teacher-listing-requirements">📝 {data.requirements}</p>
    </div>
  );
}

export default TeacherListingCard;