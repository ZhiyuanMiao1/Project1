import React, { useMemo } from 'react';
import { FiAlertCircle, FiCheckCircle, FiClock } from 'react-icons/fi';
import { getCourseTitleParts } from './appointmentCardUtils';
import { applyAvatarFallback } from '../../utils/avatarPlaceholder';
import './LessonHoursConfirmationCard.css';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const formatHours = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
};

const formatSessionTime = (value) => {
  const text = safeText(value);
  if (!text) return '--';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

function LessonHoursConfirmationCard({
  thread,
  confirmation,
  activeAvatarSrc,
  activeAvatarName,
  busyId,
  onRespond,
  onRetry,
}) {
  const isOutgoing = confirmation?.direction === 'outgoing';
  const status = safeText(confirmation?.status).toLowerCase() || 'pending';
  const isBusy = String(busyId || '') === String(confirmation?.id || '');
  const titleParts = useMemo(() => getCourseTitleParts(thread, confirmation), [confirmation, thread]);
  const sessionTimeText = formatSessionTime(confirmation?.startsAt);
  const proposedHoursText = formatHours(confirmation?.proposedHours);
  const finalHoursText = formatHours(confirmation?.finalHours ?? confirmation?.proposedHours);

  let statusTone = 'pending';
  let statusText = '等待学生确认';
  if (status === 'confirmed') {
    statusTone = 'confirmed';
    statusText = `已确认 ${finalHoursText} 课时`;
  } else if (status === 'disputed') {
    statusTone = 'disputed';
    statusText = isOutgoing ? '学生提出了修改异议' : '你已提出修改异议';
  }

  const canRespond = !isOutgoing && status === 'pending';
  const canRetry = isOutgoing && status === 'disputed';

  return (
    <div className={`lesson-hours-row ${isOutgoing ? 'is-outgoing' : ''}`}>
      {!isOutgoing ? (
        <div className="message-detail-avatar lesson-hours-avatar" aria-hidden="true">
          <img
            className="message-avatar-img"
            src={activeAvatarSrc}
            alt=""
            loading="lazy"
            onError={(event) => applyAvatarFallback(event, {
              name: activeAvatarName,
              seed: thread?.id || activeAvatarName || 'lesson-hours-card',
              size: 192,
            })}
          />
        </div>
      ) : null}

      <div className="lesson-hours-card">
        <div className="lesson-hours-card-top">
          <div className="lesson-hours-card-eyebrow">课时确认</div>
          <div className="lesson-hours-card-title">
            <span className="lesson-hours-card-title-main">
              {titleParts.courseName || '课程'}
            </span>
            {titleParts.courseType ? (
              <span className="lesson-hours-card-title-sub"> · {titleParts.courseType}</span>
            ) : null}
          </div>
        </div>

        <div className="lesson-hours-card-info">
          <div className="lesson-hours-card-line">
            <FiClock size={15} aria-hidden="true" />
            <span>{sessionTimeText}</span>
          </div>
          <div className="lesson-hours-card-hours">
            <span className="lesson-hours-card-hours-label">导师提交课时</span>
            <span className="lesson-hours-card-hours-value">{proposedHoursText} 小时</span>
          </div>
        </div>

        <div className={`lesson-hours-card-status is-${statusTone}`}>
          {status === 'confirmed' ? <FiCheckCircle size={15} aria-hidden="true" /> : <FiAlertCircle size={15} aria-hidden="true" />}
          <span>{statusText}</span>
        </div>

        {canRespond ? (
          <div className="lesson-hours-card-actions">
            <button
              type="button"
              className="lesson-hours-btn lesson-hours-btn--confirm"
              onClick={() => onRespond?.(confirmation?.id, 'confirmed')}
              disabled={isBusy}
            >
              {isBusy ? '处理中...' : '确认课时'}
            </button>
            <button
              type="button"
              className="lesson-hours-btn lesson-hours-btn--dispute"
              onClick={() => onRespond?.(confirmation?.id, 'disputed')}
              disabled={isBusy}
            >
              提出修改异议
            </button>
          </div>
        ) : null}

        {canRetry ? (
          <div className="lesson-hours-card-actions">
            <button
              type="button"
              className="lesson-hours-btn lesson-hours-btn--retry"
              onClick={() => onRetry?.(confirmation)}
              disabled={isBusy}
            >
              {isBusy ? '提交中...' : '重新提交课时'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default LessonHoursConfirmationCard;
