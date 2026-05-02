import React, { useState } from 'react';
import { FiChevronDown, FiMessageSquare } from 'react-icons/fi';
import WrittenReviewsTable from '../components/WrittenReviewsTable';
import LoadingText from '../../../components/common/LoadingText/LoadingText';
import { applyAvatarFallback, resolveAvatarSrc } from '../../../utils/avatarPlaceholder';
import { useI18n } from '../../../i18n/language';

const LOADING_TEXT_RE = /(?:loading|加载中|正在加载)(?:\s*(?:[.．。]{2,}|…+))?$/iu;

const renderMaybeLoadingText = (value) => (
  typeof value === 'string' && LOADING_TEXT_RE.test(value.trim())
    ? <LoadingText text={value} />
    : value
);

function MentorDataSection({
  mentorAvatarUrl,
  mentorAvatarUploading,
  mentorAvatarUploadError,
  onPickMentorAvatar,
  mentorAvatarInputRef,
  onMentorAvatarChange,
  mentorIdValue,
  mentorAvatarName,
  schoolValue,
  mentorJoinedMentoryDaysDisplay,
  classCount = null,
  classCountLoading = false,
  reviewCount = null,
  reviewsLoading = false,
  aboutMeReviews = [],
}) {
  const { t } = useI18n();
  const [aboutMeReviewsExpanded, setAboutMeReviewsExpanded] = useState(false);
  const normalizedClassCount = Number.isFinite(Number(classCount))
    ? Math.max(0, Math.floor(Number(classCount)))
    : null;
  const normalizedReviewCount = Number.isFinite(Number(reviewCount))
    ? Math.max(0, Math.floor(Number(reviewCount)))
    : null;
  const classCountDisplay = classCountLoading
    ? '...'
    : (normalizedClassCount == null ? '--' : String(normalizedClassCount));
  const reviewCountDisplay = reviewsLoading
    ? '...'
    : (normalizedReviewCount == null ? '--' : String(normalizedReviewCount));
  const normalizedMentorAvatarUrl = typeof mentorAvatarUrl === 'string' ? mentorAvatarUrl.trim() : '';
  const normalizedMentorAvatarName = typeof mentorAvatarName === 'string' ? mentorAvatarName.trim() : '';
  const avatarDisplayName = !normalizedMentorAvatarUrl && !normalizedMentorAvatarName ? 'M' : mentorAvatarName;
  const avatarSeed = mentorIdValue || mentorAvatarName || schoolValue || 'mentor';
  const hasSchoolValue = schoolValue && schoolValue !== '未提供' && schoolValue !== t('common.notProvided', '未提供');
  const avatarSrc = resolveAvatarSrc({
    src: mentorAvatarUrl,
    name: avatarDisplayName,
    seed: avatarSeed,
    size: 280,
  });

  return (
    <div className="settings-data-section" aria-label={t('mentorData.aria', '导师数据')}>
      <section className="settings-mentor-card" aria-label={t('mentorData.overview', '导师数据概览')}>
        <div className="settings-mentor-card-left">
          <div className="settings-mentor-avatar-wrap">
            <button
              type="button"
              className={`settings-mentor-avatar-btn ${mentorAvatarUrl ? 'has-avatar' : ''} ${mentorAvatarUploading ? 'is-uploading' : ''}`}
              aria-label={t('mentorData.changeAvatar', '更换头像')}
              onClick={onPickMentorAvatar}
              disabled={mentorAvatarUploading}
            >
              <img
                className="settings-mentor-avatar-img"
                src={avatarSrc}
                alt=""
                onError={(event) => applyAvatarFallback(event, {
                  name: avatarDisplayName,
                  seed: avatarSeed,
                  size: 280,
                })}
              />
            </button>
            {mentorAvatarUploading && (
              <span className="settings-mentor-avatar-uploading" aria-live="polite"><LoadingText text={t('common.uploading', '上传中…')} /></span>
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
            <div className="settings-mentor-name">{renderMaybeLoadingText(mentorIdValue)}</div>
            <div className="settings-mentor-subtitle">{hasSchoolValue ? renderMaybeLoadingText(schoolValue) : t('mentorData.subtitleFallback', 'Mentory 导师')}</div>
          </div>
        </div>

        <div className="settings-mentor-metrics" aria-label={t('mentorData.metrics', '导师数据指标')}>
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">{t('mentorData.classes', '上课')}</div>
            <div className="settings-mentor-metric-value">
              {classCountLoading ? <LoadingText text="..." /> : classCountDisplay}
              {normalizedClassCount != null && !classCountLoading ? (
                <span className="settings-mentor-metric-unit">{t('studentData.unit.times', '次')}</span>
              ) : null}
            </div>
          </div>
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">{t('mentorData.receivedReviews', '被评价')}</div>
            <div className="settings-mentor-metric-value">
              {reviewsLoading ? <LoadingText text="..." /> : reviewCountDisplay}
              {normalizedReviewCount != null && !reviewsLoading ? (
                <span className="settings-mentor-metric-unit">{t('studentData.unit.items', '条')}</span>
              ) : null}
            </div>
          </div>
          <div className="settings-mentor-metric">
            <div className="settings-mentor-metric-label">{t('mentorData.joined', '加入Mentory')}</div>
            <div className="settings-mentor-metric-value">
              {mentorJoinedMentoryDaysDisplay === '...' ? <LoadingText text="..." /> : mentorJoinedMentoryDaysDisplay}<span className="settings-mentor-metric-unit">{t('studentData.unit.days', '天')}</span>
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
                <span>{t('mentorData.aboutMeReviews', '关于我的评价')}</span>
              </div>
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
            {reviewsLoading ? (
              <div className="settings-orders-empty"><LoadingText text={t('common.loading', '加载中...')} /></div>
            ) : aboutMeReviews.length ? (
              <WrittenReviewsTable reviews={aboutMeReviews} ariaLabel={t('mentorData.aboutMeReviewsList', '关于我的评价列表')} nameFallback="StudentID" />
            ) : (
              <div className="settings-orders-empty">{t('studentData.emptyReviews', '暂无评价')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MentorDataSection;
