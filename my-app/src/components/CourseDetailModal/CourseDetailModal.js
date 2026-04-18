import React from 'react';
import { FaRegStar, FaStar } from 'react-icons/fa';
import { FiX } from 'react-icons/fi';
import './CourseDetailModal.css';
import { applyAvatarFallback, resolveAvatarSrc } from '../../utils/avatarPlaceholder';
import { useI18n } from '../../i18n/language';

function CourseDetailModal({
  participantName,
  avatarUrl,
  ratingValue = null,
  title,
  TitleIcon,
  typeLabel,
  TypeIcon,
  dateLabel,
  durationLabel,
  onClose,
  actions,
}) {
  const { t } = useI18n();
  const displayParticipantName = (() => {
    if (participantName === '导师') return t('lessonHours.mentor', '导师');
    if (participantName === '学生') return t('lessonHours.student', '学生');
    return participantName || t('lessonHours.mentor', '导师');
  })();
  const avatarSeed = title || displayParticipantName || 'course-detail';
  const avatarSrc = resolveAvatarSrc({
    src: avatarUrl,
    name: displayParticipantName,
    seed: avatarSeed,
    size: 240,
  });

  const renderStars = (value) => {
    const normalized = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
    const starSize = 14;
    return Array.from({ length: 5 }).map((_, idx) => {
      const fill = Math.max(0, Math.min(1, normalized - idx));
      const clipPath = `inset(0 ${100 - fill * 100}% 0 0)`;
      return (
        <span className="course-detail-modal__star" key={idx} aria-hidden="true">
          <FaRegStar size={starSize} className="course-detail-modal__star-base" />
          {fill > 0 && (
            <span className="course-detail-modal__star-fill" style={{ clipPath }}>
              <FaStar size={starSize} />
            </span>
          )}
        </span>
      );
    });
  };

  return (
    <div
      className="course-detail-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('courseDetail.aria', '课程详情')}
    >
      <div className="course-detail-modal__card">
        <button
          type="button"
          className="course-detail-modal__close"
          aria-label={t('courseDetail.close', '关闭课程详情')}
          onClick={onClose}
        >
          <FiX size={20} />
        </button>

        <div className="course-detail-modal__mentor">
          <div className="course-detail-modal__avatar" aria-hidden="true">
            <img
              className="course-detail-modal__avatar-img"
              src={avatarSrc}
              alt=""
              onError={(event) => applyAvatarFallback(event, {
                name: displayParticipantName,
                seed: avatarSeed,
                size: 240,
              })}
            />
          </div>
          <div className="course-detail-modal__mentor-info">
            <span className="course-detail-modal__mentor-name">{displayParticipantName}</span>
          </div>
          {ratingValue != null && (
            <div className="course-detail-modal__rating">
              <div className="course-detail-modal__stars">{renderStars(ratingValue)}</div>
              <span className="course-detail-modal__rating-value">{ratingValue.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="course-detail-modal__body">
          <div className="course-detail-modal__title">
            <TitleIcon size={18} className="course-detail-modal__title-icon" />
            <span>{title}</span>
          </div>

          <div className="course-detail-modal__meta-grid">
            <div className="course-detail-modal__meta-chip">
              <span className="course-detail-modal__chip-label">{t('courseDetail.courseType', '课程类型')}</span>
              <div className="course-detail-modal__chip-value">
                <TypeIcon size={14} />
                <span>{typeLabel}</span>
              </div>
            </div>

            <div className="course-detail-modal__meta-chip">
              <span className="course-detail-modal__chip-label">{t('courseDetail.date', '日期')}</span>
              <div className="course-detail-modal__chip-value">{dateLabel}</div>
            </div>

            <div className="course-detail-modal__meta-chip">
              <span className="course-detail-modal__chip-label">{t('courseDetail.duration', '时长')}</span>
              <div className="course-detail-modal__chip-value">{durationLabel}</div>
            </div>
          </div>

          <div className="course-detail-modal__actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

export default CourseDetailModal;
