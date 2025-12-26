import React, { useState } from 'react';
import { FiChevronDown, FiMessageSquare } from 'react-icons/fi';
import WrittenReviewsTable from '../components/WrittenReviewsTable';

const MOCK_WRITTEN_REVIEWS = [
  { id: 'review-2025-12-12-01', target: '导师 Alex', rating: 3.6, content: '讲解清晰，反馈及时。', time: '2025/12/12 20:10' },
  { id: 'review-2025-11-20-02', target: '导师 Lily', rating: 4.4, content: '很耐心，建议更具体一点。', time: '2025/11/20 19:05' },
];

function StudentDataSection({
  studentAvatarUrl,
  studentAvatarUploading,
  studentAvatarUploadError,
  onPickStudentAvatar,
  studentAvatarInputRef,
  onStudentAvatarChange,
  studentAvatarInitial,
  studentIdValue,
  schoolValue,
  joinedMentorXDaysDisplay,
  writtenReviews = MOCK_WRITTEN_REVIEWS,
}) {
  const [writtenReviewsExpanded, setWrittenReviewsExpanded] = useState(false);

  return (
    <div className="settings-data-section" aria-label="学生数据">
      <section className="settings-student-card" aria-label="学生数据概览">
        <div className="settings-student-card-left">
          <div className="settings-student-avatar-wrap">
            <button
              type="button"
              className={`settings-student-avatar-btn ${studentAvatarUrl ? 'has-avatar' : ''} ${studentAvatarUploading ? 'is-uploading' : ''}`}
              aria-label="更换头像"
              onClick={onPickStudentAvatar}
              disabled={studentAvatarUploading}
            >
              {studentAvatarUrl ? (
                <img className="settings-student-avatar-img" src={studentAvatarUrl} alt="" />
              ) : (
                <span className="settings-student-avatar-initial" aria-hidden="true">{studentAvatarInitial}</span>
              )}
            </button>
            {studentAvatarUploading && (
              <span className="settings-student-avatar-uploading" aria-live="polite">上传中…</span>
            )}
            <svg className="settings-student-avatar-camera" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="12" fill="currentColor" />
              <rect x="6" y="8" width="12" height="9" rx="2" ry="2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8 L10.1 6.6 A1.8 1.8 0 0 1 11.6 5.8 H12.4 A1.8 1.8 0 0 1 13.9 6.6 L15 8" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3" fill="none" stroke="#ffffff" strokeWidth="1.2" />
            </svg>
            <input
              ref={studentAvatarInputRef}
              type="file"
              accept="image/*"
              className="settings-student-avatar-input"
              onChange={onStudentAvatarChange}
            />
          </div>
          {studentAvatarUploadError ? (
            <div className="settings-student-avatar-error" role="alert">{studentAvatarUploadError}</div>
          ) : null}
          <div className="settings-student-main">
            <div className="settings-student-name">{studentIdValue}</div>
            <div className="settings-student-subtitle">{schoolValue !== '未提供' ? schoolValue : 'MentorX 学生'}</div>
          </div>
        </div>

        <div className="settings-student-metrics" aria-label="学生数据指标">
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">上课</div>
            <div className="settings-student-metric-value">
              3<span className="settings-student-metric-unit">次</span>
            </div>
          </div>
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">评价</div>
            <div className="settings-student-metric-value">
              2<span className="settings-student-metric-unit">条</span>
            </div>
          </div>
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">加入MentorX</div>
            <div className="settings-student-metric-value">
              {joinedMentorXDaysDisplay}<span className="settings-student-metric-unit">天</span>
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
            aria-expanded={writtenReviewsExpanded}
            aria-controls="settings-written-reviews"
            onClick={() => setWrittenReviewsExpanded((prev) => !prev)}
          >
            <div className="settings-row-main">
              <div className="settings-row-title settings-student-reviews-title">
                <FiMessageSquare aria-hidden="true" focusable="false" strokeWidth={1.5} size={18} />
                <span>我撰写的评价</span>
              </div>
              {!writtenReviews.length ? (
                <div className="settings-row-value">暂无评价</div>
              ) : null}
            </div>
            <span className="settings-accordion-icon" aria-hidden="true">
              <FiChevronDown size={18} />
            </span>
          </button>
          <div
            id="settings-written-reviews"
            className="settings-accordion-panel"
            hidden={!writtenReviewsExpanded}
          >
            {writtenReviews.length ? (
              <WrittenReviewsTable reviews={writtenReviews} ariaLabel="我撰写的评价列表" nameFallback="导师" />
            ) : (
              <div className="settings-orders-empty">暂无评价</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentDataSection;
