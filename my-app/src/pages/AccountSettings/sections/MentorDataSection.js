import React, { useState } from 'react';
import { FiChevronDown, FiMessageSquare } from 'react-icons/fi';
import defaultAvatar from '../../../assets/images/default-avatar.jpg';
import WrittenReviewsTable from '../components/WrittenReviewsTable';

const MOCK_ABOUT_ME_REVIEWS = [
  { id: 'aboutme-2025-12-05-01', target: 's12', rating: 4.4, content: '讲解很清晰，学习效率提升很多。', time: '2025/12/05 18:20' },
  { id: 'aboutme-2025-11-09-02', target: 's44', rating: 3.6, content: '很有耐心，建议也很到位。', time: '2025/11/09 10:15' },
];

function MentorDataSection({
  mentorAvatarUrl,
  mentorAvatarUploading,
  mentorAvatarUploadError,
  onPickMentorAvatar,
  mentorAvatarInputRef,
  onMentorAvatarChange,
  mentorIdValue,
  schoolValue,
  mentorJoinedMentoryDaysDisplay,
  aboutMeReviews = MOCK_ABOUT_ME_REVIEWS,
}) {
  const [aboutMeReviewsExpanded, setAboutMeReviewsExpanded] = useState(false);

  return (
    <div className="settings-data-section" aria-label="导师数据">
      <section className="settings-mentor-card" aria-label="导师数据概览">
        <div className="settings-mentor-card-left">
          <div className="settings-mentor-avatar-wrap">
            <button
              type="button"
              className={`settings-mentor-avatar-btn ${mentorAvatarUrl ? 'has-avatar' : ''} ${mentorAvatarUploading ? 'is-uploading' : ''}`}
              aria-label="更换头像"
              onClick={onPickMentorAvatar}
              disabled={mentorAvatarUploading}
            >
              {mentorAvatarUrl ? (
                <img className="settings-mentor-avatar-img" src={mentorAvatarUrl} alt="" />
              ) : (
                <img className="settings-mentor-avatar-img" src={defaultAvatar} alt="" />
              )}
            </button>
            {mentorAvatarUploading && (
              <span className="settings-mentor-avatar-uploading" aria-live="polite">上传中…</span>
            )}
            <svg className="settings-mentor-avatar-camera" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="12" fill="currentColor" />
              <rect x="6" y="8" width="12" height="9" rx="2" ry="2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8 L10.1 6.6 A1.8 1.8 0 0 1 11.6 5.8 H12.4 A1.8 1.8 0 0 1 13.9 6.6 L15 8" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3" fill="none" stroke="#ffffff" strokeWidth="1.2" />
            </svg>
            <input
              ref={mentorAvatarInputRef}
              type="file"
              accept="image/*"
              className="settings-mentor-avatar-input"
              onChange={onMentorAvatarChange}
            />
          </div>
          {mentorAvatarUploadError ? (
            <div className="settings-mentor-avatar-error" role="alert">{mentorAvatarUploadError}</div>
          ) : null}
          <div className="settings-mentor-main">
            <div className="settings-mentor-name">{mentorIdValue}</div>
            <div className="settings-mentor-subtitle">{schoolValue !== '未提供' ? schoolValue : 'Mentory 导师'}</div>
          </div>
        </div>

        <div className="settings-mentor-metrics" aria-label="导师数据指标">
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">上课</div>
            <div className="settings-mentor-metric-value">
              3<span className="settings-mentor-metric-unit">次</span>
            </div>
          </div>
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">被评价</div>
            <div className="settings-mentor-metric-value">
              2<span className="settings-mentor-metric-unit">条</span>
            </div>
          </div>
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">加入Mentory</div>
            <div className="settings-mentor-metric-value">
              {mentorJoinedMentoryDaysDisplay}<span className="settings-mentor-metric-unit">天</span>
            </div>
          </div>
        </div>
      </section>

      <div className="settings-student-reviews">
        <div className="settings-student-reviews-divider" aria-hidden="true" />
        <div className="settings-accordion-item">
          <button
            type="button"
            className="settings-accordion-trigger"
            aria-expanded={aboutMeReviewsExpanded}
            aria-controls="settings-about-me-reviews"
            onClick={() => setAboutMeReviewsExpanded((prev) => !prev)}
          >
            <div className="settings-row-main">
              <div className="settings-row-title settings-student-reviews-title">
                <FiMessageSquare aria-hidden="true" focusable="false" strokeWidth={1.5} size={18} />
                <span>关于我的评价</span>
              </div>
              {!aboutMeReviews.length ? (
                <div className="settings-row-value">暂无评价</div>
              ) : null}
            </div>
            <span className="settings-accordion-icon" aria-hidden="true">
              <FiChevronDown size={18} />
            </span>
          </button>
          <div
            id="settings-about-me-reviews"
            className="settings-accordion-panel"
            hidden={!aboutMeReviewsExpanded}
          >
            {aboutMeReviews.length ? (
              <WrittenReviewsTable reviews={aboutMeReviews} ariaLabel="关于我的评价列表" nameFallback="StudentID" />
            ) : (
              <div className="settings-orders-empty">暂无评价</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MentorDataSection;
