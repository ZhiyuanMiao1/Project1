import React, { useState } from 'react';
import './MentorListingCard.css';
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import { FaHeart, FaGlobe, FaFileAlt, FaGraduationCap, FaClock, FaCalendarAlt } from 'react-icons/fa';
import { DIRECTION_LABEL_ICON_MAP, normalizeCourseLabel, COURSE_TYPE_LABEL_ICON_MAP } from '../../constants/courseMappings';

function MentorListingCard({ data }) {
  // 收藏状态
  const [isFavorited, setIsFavorited] = useState(false);
  const { ref: revealRef, visible } = useRevealOnScroll();

  const toggleFavorite = () => setIsFavorited((v) => !v);

  const name = `S${data?.id ?? ''}`;
  const degree = data?.degree || '';
  const school = data?.school || '';
  // 课程方向：标准化名称并选择对应图标（共用常量）

  const courseTitles = Array.isArray(data?.courses)
    ? data.courses
    : (data?.courses ? [data.courses] : []);
  const normalizedLabels = Array.from(new Set(courseTitles.map(normalizeCourseLabel).filter(Boolean)));
  const courses = normalizedLabels.join('、');
  const CourseIcon = DIRECTION_LABEL_ICON_MAP[normalizedLabels[0]] || FaFileAlt;

  // 课程类型图标（按中文标签匹配）
  const CourseTypeIcon = COURSE_TYPE_LABEL_ICON_MAP[data?.courseType] || FaGraduationCap;

  // 课程类型（第三行）映射保持不变

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
        {/* 根据产品需求：教师卡片仅保留前四行 + 最后一行，
            因此移除“具体内容”和“学习目标”两项 */}
        {!!data?.expectedTime && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>{data.expectedTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default MentorListingCard;
