import React, { useEffect, useId, useRef, useState } from 'react';
import { FiBookOpen, FiCalendar, FiCheckCircle, FiClock, FiUser, FiX } from 'react-icons/fi';
import LoadingText from '../common/LoadingText/LoadingText';
import { useI18n } from '../../i18n/language';
import './CourseDisputeModal.css';

const REASON_OPTIONS = [
  ['lesson_not_delivered', '未按约定授课', 'Lesson was not delivered as agreed'],
  ['content_mismatch', '课程内容与描述不符', 'Lesson content did not match the description'],
  ['mentor_conduct', '导师行为问题', 'Mentor conduct issue'],
  ['other', '其他问题', 'Other issue'],
];

const LEGACY_REASON_OPTIONS = [
  ['lesson_hours', '课时或扣费问题', 'Lesson hours or charge issue'],
];

const RESOLUTION_OPTIONS = [
  ['feedback_only', '仅反馈问题', 'Report the issue only'],
  ['lesson_credit', '补偿课时', 'Lesson credit'],
  ['refund_review', '评估退款', 'Refund assessment'],
];

const LEGACY_RESOLUTION_OPTIONS = [
  ['platform_review', '平台协助处理', 'Platform review'],
  ['reschedule', '补课或重新安排', 'Make-up lesson or reschedule'],
  ['partial_refund', '希望评估部分退款', 'Assess a partial refund'],
  ['full_refund', '希望评估全额退款', 'Assess a full refund'],
];

const OUTCOME_OPTIONS = [
  ['feedback_only', '反馈已记录', 'Feedback recorded'],
  ['lesson_credit', '已补偿课时', 'Lesson credit issued'],
  ['refund', '退款处理', 'Refund processed'],
  ['rejected', '不予支持', 'Not approved'],
];

const getOptionLabel = (options, value, isEnglish) => {
  const matched = options.find(([key]) => key === value);
  return matched ? matched[isEnglish ? 2 : 1] : value;
};

function CourseDisputeModal({
  course,
  onClose,
  onSubmit,
  submitting = false,
  error = '',
}) {
  const { isEnglish, t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const descriptionLabelId = useId();
  const dialogRef = useRef(null);
  const existingDispute = course?.courseDispute || null;
  const [reasonCode, setReasonCode] = useState('');
  const [preferredResolution, setPreferredResolution] = useState('feedback_only');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setReasonCode(existingDispute?.reasonCode || '');
    setPreferredResolution(existingDispute?.preferredResolution || 'feedback_only');
    setDescription(existingDispute?.description || '');
  }, [course?.id, existingDispute?.description, existingDispute?.preferredResolution, existingDispute?.reasonCode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, submitting]);

  const descriptionLength = description.trim().length;
  const canSubmit = Boolean(reasonCode)
    && descriptionLength >= 1
    && descriptionLength <= 2000
    && Boolean(preferredResolution)
    && !submitting;

  const CourseIcon = course?.disputeTitleIcon || FiBookOpen;
  const CourseTypeIcon = course?.disputeTypeIcon || FiBookOpen;
  const courseTitle = course?.disputeDisplayTitle || course?.title || t('courseDispute.courseFallback', '课程');
  const courseType = course?.disputeDisplayType || course?.type || t('courseDispute.typeFallback', '其他课程类型');
  const dateLabel = course?.disputeDateLabel || course?.dateText || course?.date || '--';
  const timeLabel = course?.disputeTimeLabel || '--';
  const durationLabel = course?.duration || '--';
  const mentorName = course?.mentorName || course?.counterpartName || t('lessonHours.mentor', '导师');
  const mentorId = course?.mentorPublicId || course?.counterpartPublicId || '--';

  const submittedAt = existingDispute?.submittedAt
    ? new Date(existingDispute.submittedAt).toLocaleString(isEnglish ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    : '';
  const isClosed = ['resolved', 'rejected'].includes(existingDispute?.status);
  const isActionPending = existingDispute?.status === 'action_pending';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || existingDispute) return;
    onSubmit?.({ reasonCode, preferredResolution, description: description.trim() });
  };

  return (
    <div
      className="course-dispute-modal__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose?.();
      }}
    >
      <section
        className="course-dispute-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="course-dispute-modal__header">
          <div>
            <h2 id={titleId}>{t('courseDispute.title', '课程异议')}</h2>
          </div>
          <button
            type="button"
            className="course-dispute-modal__close"
            aria-label={t('courseDispute.close', '关闭课程异议弹窗')}
            onClick={onClose}
            disabled={submitting}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="course-dispute-modal__course-card" aria-label={t('courseDispute.courseInfo', '相关课程')}>
          <div className="course-dispute-modal__course-main">
            <span className="course-dispute-modal__course-icon" aria-hidden="true">
              <CourseIcon />
            </span>
            <div className="course-dispute-modal__course-title-wrap">
              <strong>{courseTitle}</strong>
              <span className="course-dispute-modal__course-type">
                <CourseTypeIcon aria-hidden="true" />
                <span>{courseType}</span>
              </span>
            </div>
          </div>

          <div className="course-dispute-modal__course-details">
            <div>
              <FiCalendar aria-hidden="true" />
              <span className="course-dispute-modal__detail-label">{t('courseDispute.date', '上课日期')}</span>
              <strong>{dateLabel}</strong>
            </div>
            <div>
              <FiClock aria-hidden="true" />
              <span className="course-dispute-modal__detail-label">{t('courseDispute.time', '授课时间')}</span>
              <strong>{timeLabel}</strong>
            </div>
            <div>
              <FiBookOpen aria-hidden="true" />
              <span className="course-dispute-modal__detail-label">{t('courseDispute.duration', '课程时长')}</span>
              <strong>{durationLabel}</strong>
            </div>
            <div>
              <FiUser aria-hidden="true" />
              <span className="course-dispute-modal__detail-label">{t('courseDispute.mentor', '授课导师')}</span>
              <strong>{mentorName}</strong>
            </div>
          </div>

          <div className="course-dispute-modal__mentor-id">
            <strong>{mentorId}</strong>
          </div>
        </div>

        {existingDispute ? (
          <div className="course-dispute-modal__existing">
            <div className="course-dispute-modal__status">
              <FiCheckCircle aria-hidden="true" />
              <div>
                <strong>{isClosed
                  ? t('courseDispute.resolvedStatus', '异议已处理')
                  : isActionPending
                    ? t('courseDispute.actionPendingStatus', '处理结果执行中')
                    : t('courseDispute.submittedStatus', '异议已提交')}</strong>
                <span>{isClosed
                  ? t('courseDispute.resolvedHint', '以下是平台的最终处理结果')
                  : isActionPending
                    ? t('courseDispute.actionPendingHint', '退款或补偿正在执行，请稍后查看结果')
                    : t('courseDispute.submittedHint', '平台正在核实，你无需重复提交')}</span>
              </div>
            </div>
            <dl className="course-dispute-modal__summary-list">
              <div>
                <dt>{t('courseDispute.referenceId', '申请编号')}</dt>
                <dd>{existingDispute.id}</dd>
              </div>
              <div>
                <dt>{t('courseDispute.reasonLabel', '问题类型')}</dt>
                <dd>{getOptionLabel([...REASON_OPTIONS, ...LEGACY_REASON_OPTIONS], reasonCode, isEnglish)}</dd>
              </div>
              <div>
                <dt>{t('courseDispute.resolutionLabel', '期望处理方式')}</dt>
                <dd>{getOptionLabel([...RESOLUTION_OPTIONS, ...LEGACY_RESOLUTION_OPTIONS], preferredResolution, isEnglish)}</dd>
              </div>
              {submittedAt ? (
                <div>
                  <dt>{t('courseDispute.submittedAt', '提交时间')}</dt>
                  <dd>{submittedAt}</dd>
                </div>
              ) : null}
              <div className="course-dispute-modal__summary-description">
                <dt>{t('courseDispute.descriptionLabel', '情况说明')}</dt>
                <dd>{description}</dd>
              </div>
              {existingDispute.outcomeCode ? (
                <div>
                  <dt>{t('courseDispute.outcomeLabel', '处理结果')}</dt>
                  <dd>{getOptionLabel(OUTCOME_OPTIONS, existingDispute.outcomeCode, isEnglish)}</dd>
                </div>
              ) : null}
              {existingDispute.resolvedHours > 0 ? (
                <div>
                  <dt>{t('courseDispute.resolvedHours', '处理课时')}</dt>
                  <dd>{existingDispute.resolvedHours}h</dd>
                </div>
              ) : null}
              {existingDispute.resultMessage ? (
                <div className="course-dispute-modal__summary-description">
                  <dt>{t('courseDispute.resultMessage', '平台说明')}</dt>
                  <dd>{existingDispute.resultMessage}</dd>
                </div>
              ) : null}
            </dl>
            <footer className="course-dispute-modal__actions">
              <button type="button" className="course-dispute-modal__primary" onClick={onClose}>
                {t('common.close', '关闭')}
              </button>
            </footer>
          </div>
        ) : (
          <form className="course-dispute-modal__form" onSubmit={handleSubmit}>
            <fieldset className="course-dispute-modal__field">
              <legend>{t('courseDispute.reasonLabel', '问题类型')}</legend>
              <div className="course-dispute-modal__option-grid">
                {REASON_OPTIONS.map(([value, zhLabel, enLabel]) => (
                  <label className={`course-dispute-modal__option${reasonCode === value ? ' is-selected' : ''}`} key={value}>
                    <input
                      type="radio"
                      name="course-dispute-reason"
                      value={value}
                      checked={reasonCode === value}
                      onClick={() => setReasonCode((current) => (current === value ? '' : value))}
                      readOnly
                      disabled={submitting}
                    />
                    <span>{isEnglish ? enLabel : zhLabel}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="course-dispute-modal__field">
              <div id={descriptionLabelId} className="course-dispute-modal__field-label">
                {t('courseDispute.descriptionLabel', '情况说明')}
              </div>
              <textarea
                id={descriptionId}
                aria-labelledby={descriptionLabelId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('courseDispute.descriptionPlaceholder', '请具体说明发生了什么，以及与原约定不一致的地方')}
                rows={5}
                minLength={1}
                maxLength={2000}
                disabled={submitting}
              />
            </div>

            <fieldset className="course-dispute-modal__field">
              <legend>{t('courseDispute.resolutionLabel', '期望处理方式')}</legend>
              <div className="course-dispute-modal__resolution-list">
                {RESOLUTION_OPTIONS.map(([value, zhLabel, enLabel]) => (
                  <label className="course-dispute-modal__resolution" key={value}>
                    <input
                      type="radio"
                      name="course-dispute-resolution"
                      value={value}
                      checked={preferredResolution === value}
                      onClick={() => setPreferredResolution((current) => (current === value ? '' : value))}
                      readOnly
                      disabled={submitting}
                    />
                    <span>{isEnglish ? enLabel : zhLabel}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error ? <div className="course-dispute-modal__error" role="alert">{error}</div> : null}

            <footer className="course-dispute-modal__actions">
              <button type="button" className="course-dispute-modal__secondary" onClick={onClose} disabled={submitting}>
                {t('common.cancel', '取消')}
              </button>
              <button type="submit" className="course-dispute-modal__primary" disabled={!canSubmit}>
                {submitting
                  ? <LoadingText text={t('courseDispute.submitting', '正在提交...')} />
                  : t('courseDispute.submit', '提交异议')}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

export default CourseDisputeModal;
