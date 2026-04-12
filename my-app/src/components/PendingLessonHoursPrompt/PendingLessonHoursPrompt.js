import React, { useEffect, useMemo } from 'react';
import { FiAlertCircle, FiClock } from 'react-icons/fi';
import Button from '../common/Button/Button';
import {
  COURSE_TYPE_ID_TO_LABEL,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import { applyAvatarFallback, resolveAvatarSrc } from '../../utils/avatarPlaceholder';
import './PendingLessonHoursPrompt.css';

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

function PendingLessonHoursPrompt({
  open,
  confirmation,
  totalCount = 0,
  busy = false,
  error = '',
  onConfirm,
  onDispute,
}) {
  const actionRole = safeText(confirmation?.actionRole) === 'mentor' ? 'mentor' : 'student';
  const courseName = useMemo(() => {
    return normalizeCourseLabel(confirmation?.courseDirectionId) || '课程';
  }, [confirmation?.courseDirectionId]);

  const courseType = useMemo(() => {
    const courseTypeId = safeText(confirmation?.courseTypeId);
    return COURSE_TYPE_ID_TO_LABEL[courseTypeId] || '';
  }, [confirmation?.courseTypeId]);

  const isMentorAction = actionRole === 'mentor';
  const participantLabel = isMentorAction ? '学生' : '导师';
  const participantName = safeText(confirmation?.participantName || confirmation?.mentorName) || participantLabel;
  const avatarSrc = resolveAvatarSrc({
    src: confirmation?.participantAvatarUrl || confirmation?.mentorAvatarUrl,
    name: participantName,
    seed: confirmation?.threadId || confirmation?.id || participantName,
    size: 192,
  });

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  if (!open || !confirmation) return null;

  const title = isMentorAction ? '学生对本节课时提出了异议' : '请确认本节课实际课时';
  const subtitle = isMentorAction
    ? '处理完成前，此窗口不会关闭。你可以确认学生异议，或提交平台处理'
    : '处理完成前，此窗口不会关闭';
  const valueLabel = isMentorAction ? '导师原提交课时' : '导师提交课时';
  const disputedHoursText = formatHours(confirmation?.disputedHours);
  const tipText = isMentorAction
    ? '确认后将按学生异议结案；提交平台处理后，将进入平台介入状态'
    : '若课时不一致，请直接提出异议，导师需要重新处理';
  const secondaryLabel = isMentorAction ? '提交平台处理' : '提出异议';
  const primaryLabel = isMentorAction ? '确认学生异议' : '确认课时';

  return (
    <div className="pending-lesson-hours-overlay" role="presentation">
      <div
        className="pending-lesson-hours-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="待确认课时"
      >
        <div className="pending-lesson-hours-head">
          <h2 className="pending-lesson-hours-title">{title}</h2>
          {subtitle ? (
            <p className="pending-lesson-hours-subtitle">
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className="pending-lesson-hours-mentor">
          <img
            className="pending-lesson-hours-avatar"
            src={avatarSrc}
            alt=""
            loading="lazy"
            onError={(event) => applyAvatarFallback(event, {
              name: participantName,
              seed: confirmation?.threadId || confirmation?.id || participantName,
              size: 192,
            })}
          />
          <div className="pending-lesson-hours-mentor-copy">
            <div className="pending-lesson-hours-mentor-label">{participantLabel}</div>
            <div className="pending-lesson-hours-mentor-name">{participantName}</div>
          </div>
        </div>

        <div className="pending-lesson-hours-course">
          <div className="pending-lesson-hours-course-name">
            {courseName}
            {courseType ? <span className="pending-lesson-hours-course-type"> · {courseType}</span> : null}
          </div>
          <div className="pending-lesson-hours-course-time">
            <FiClock size={15} aria-hidden="true" />
            <span>{formatSessionTime(confirmation?.startsAt)}</span>
          </div>
        </div>

        <div className="pending-lesson-hours-value-card">
          <div className="pending-lesson-hours-value-label">{valueLabel}</div>
          <div className="pending-lesson-hours-value">{formatHours(confirmation?.proposedHours)} 小时</div>
        </div>

        {isMentorAction && confirmation?.disputedHours ? (
          <div className="pending-lesson-hours-value-card pending-lesson-hours-value-card--secondary">
            <div className="pending-lesson-hours-value-label">学生主张课时</div>
            <div className="pending-lesson-hours-value">{disputedHoursText} 小时</div>
          </div>
        ) : null}

        <div className="pending-lesson-hours-tip">
          <FiAlertCircle size={15} aria-hidden="true" />
          <span>{tipText}</span>
        </div>

        {totalCount > 1 ? (
          <div className="pending-lesson-hours-queue">
            当前还有 {totalCount} 条待处理课时确认，会按顺序逐条处理
          </div>
        ) : null}

        {error ? (
          <div className="pending-lesson-hours-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="pending-lesson-hours-actions">
          <Button
            className="pending-lesson-hours-btn pending-lesson-hours-btn--ghost"
            onClick={() => onDispute?.(confirmation)}
            disabled={busy}
          >
            {busy ? '处理中...' : secondaryLabel}
          </Button>
          <Button
            className="pending-lesson-hours-btn pending-lesson-hours-btn--primary"
            onClick={() => onConfirm?.(confirmation)}
            disabled={busy}
          >
            {busy ? '处理中...' : primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PendingLessonHoursPrompt;
