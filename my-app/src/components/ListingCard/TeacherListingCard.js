import React, { useState } from 'react';
import './TeacherListingCard.css';
import {
  FaHeart,
  FaGlobe,
  FaFileAlt,
  FaGraduationCap,
  FaClock,
  FaLightbulb,
  FaCalendarAlt,
} from 'react-icons/fa';

function TeacherListingCard({ data }) {
  // 收藏状态
  const [isFavorited, setIsFavorited] = useState(false);

  const toggleFavorite = () => setIsFavorited((v) => !v);

  const name = `Student${data?.id ?? ''}`;
  const degree = data?.degree || '';
  const school = data?.school || '';
  const courses = Array.isArray(data?.courses)
    ? data.courses.join('、')
    : (data?.courses || '');

  return (
    // 保持原有 .listing-card 尺寸规则，同时套用预览卡的视觉风格
    <div className="listing-card teacher-preview-card">
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
            {!!degree && <span className="chip green">{degree}</span>}
            {!!school && <span className="chip gray">{school}</span>}
          </div>
        </div>
      </div>

      <div className="card-list" role="list">
        {!!data?.timezone && (
          <div className="item" role="listitem">
            <span className="icon"><FaGlobe /></span>
            <span>{data.timezone}</span>
          </div>
        )}
        {!!courses && (
          <div className="item" role="listitem">
            <span className="icon"><FaFileAlt /></span>
            <span>{courses}</span>
          </div>
        )}
        {!!data?.courseType && (
          <div className="item" role="listitem">
            <span className="icon"><FaGraduationCap /></span>
            <span>课程类型：{data.courseType}</span>
          </div>
        )}
        {!!data?.expectedDuration && (
          <div className="item" role="listitem">
            <span className="icon"><FaClock /></span>
            <span>预计时长：{data.expectedDuration}</span>
          </div>
        )}
        {!!data?.requirements && (
          <div className="item" role="listitem">
            <span className="icon"><FaLightbulb /></span>
            <span>具体内容：{data.requirements}</span>
          </div>
        )}
        {!!data?.expectedTime && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>期望首课：{data.expectedTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherListingCard;

