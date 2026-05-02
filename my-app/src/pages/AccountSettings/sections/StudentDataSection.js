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

function StudentDataSection({
  studentAvatarUrl,
  studentAvatarUploading,
  studentAvatarUploadError,
  onPickStudentAvatar,
  studentAvatarInputRef,
  onStudentAvatarChange,
  studentAvatarName,
  studentIdValue,
  schoolValue,
  joinedMentoryDaysDisplay,
  classCount = null,
  classCountLoading = false,
  reviewCount = null,
  reviewsLoading = false,
  writtenReviews = [],
}) {
  const { t } = useI18n();
  const [writtenReviewsExpanded, setWrittenReviewsExpanded] = useState(false);
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
  const avatarDisplayName = 'S';
  const avatarSeed = studentIdValue || studentAvatarName || schoolValue || 'student';
  const hasSchoolValue = schoolValue && schoolValue !== '未提供' && schoolValue !== t('common.notProvided', '未提供');
  const avatarSrc = resolveAvatarSrc({
    src: studentAvatarUrl,
    name: avatarDisplayName,
    seed: avatarSeed,
    size: 280,
  });

  return (
    <div className="settings-data-section" aria-label={t('studentData.aria', '学生数据')}>
      <section className="settings-student-card" aria-label={t('studentData.overview', '学生数据概览')}>
        <div className="settings-student-card-left">
          <div className="settings-student-avatar-wrap">
            <button
              type="button"
              className={`settings-student-avatar-btn ${studentAvatarUrl ? 'has-avatar' : ''} ${studentAvatarUploading ? 'is-uploading' : ''}`}
              aria-label={t('studentData.changeAvatar', '更换头像')}
              onClick={onPickStudentAvatar}
              disabled={studentAvatarUploading}
            >
              <img
                className="settings-student-avatar-img"
                src={avatarSrc}
                alt=""
                onError={(event) => applyAvatarFallback(event, {
                  name: avatarDisplayName,
                  seed: avatarSeed,
                  size: 280,
                })}
              />
            </button>
            {studentAvatarUploading && (
              <span className="settings-student-avatar-uploading" aria-live="polite"><LoadingText text={t('common.uploading', '上传中…')} /></span>
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
            <div className="settings-student-name">{renderMaybeLoadingText(studentIdValue)}</div>
            <div className="settings-student-subtitle">{hasSchoolValue ? renderMaybeLoadingText(schoolValue) : t('studentData.subtitleFallback', 'Mentory 学生')}</div>
          </div>
        </div>

        <div className="settings-student-metrics" aria-label={t('studentData.metrics', '学生数据指标')}>
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">{t('studentData.classes', '上课')}</div>
            <div className="settings-student-metric-value">
              {classCountLoading ? <LoadingText text="..." /> : classCountDisplay}
              {normalizedClassCount != null && !classCountLoading ? (
                <span className="settings-student-metric-unit">{t('studentData.unit.times', '次')}</span>
              ) : null}
            </div>
          </div>
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">{t('studentData.reviews', '评价')}</div>
            <div className="settings-student-metric-value">
              {reviewsLoading ? <LoadingText text="..." /> : reviewCountDisplay}
              {normalizedReviewCount != null && !reviewsLoading ? (
                <span className="settings-student-metric-unit">{t('studentData.unit.items', '条')}</span>
              ) : null}
            </div>
          </div>
          <div className="settings-student-metric">
            <div className="settings-student-metric-label">{t('studentData.joined', '加入Mentory')}</div>
            <div className="settings-student-metric-value">
              {joinedMentoryDaysDisplay === '...' ? <LoadingText text="..." /> : joinedMentoryDaysDisplay}<span className="settings-student-metric-unit">{t('studentData.unit.days', '天')}</span>
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
                <span>{t('studentData.writtenReviews', '我撰写的评价')}</span>
              </div>
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
            {reviewsLoading ? (
              <div className="settings-orders-empty"><LoadingText text={t('common.loading', '加载中...')} /></div>
            ) : writtenReviews.length ? (
              <WrittenReviewsTable reviews={writtenReviews} ariaLabel={t('studentData.writtenReviewsList', '我撰写的评价列表')} nameFallback={t('studentData.mentorFallback', '导师')} />
            ) : (
              <div className="settings-orders-empty">{t('studentData.emptyReviews', '暂无评价')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentDataSection;
