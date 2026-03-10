import React, { useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiClock, FiVideo } from 'react-icons/fi';
import {
  getCourseTitleParts,
  isScheduleWindowExpired,
  resolveScheduleStatus,
  SCHEDULE_STATUS_META,
} from './appointmentCardUtils';
import './AppointmentCard.css';
import { applyAvatarFallback } from '../../utils/avatarPlaceholder';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

function AppointmentCard({
  thread,
  scheduleCard,
  activeAvatarSrc,
  activeAvatarName,
  scheduleTitle,
  windowText,
  cardHoverTime,
  isSendingCard,
  isExiting,
  appointmentBusyId,
  messageActionBusyId,
  openMessageMenuId,
  onOpenMessageMenuChange,
  onDecision,
  onReschedule,
  onScheduleNextLesson,
  onDeleteForMe,
  onRecall,
}) {
  const cardDirection = scheduleCard?.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const isOutgoing = cardDirection === 'outgoing';

  const statusKey = useMemo(() => resolveScheduleStatus({
    status: scheduleCard?.status,
    windowText,
    referenceTime: scheduleCard?.time,
  }), [scheduleCard?.status, scheduleCard?.time, windowText]);
  const isScheduleExpired = useMemo(() => isScheduleWindowExpired({
    windowText,
    referenceTime: scheduleCard?.time,
  }), [scheduleCard?.time, windowText]);
  const statusMeta = SCHEDULE_STATUS_META[statusKey] || SCHEDULE_STATUS_META.pending;
  const isBusy = String(appointmentBusyId) === String(scheduleCard?.id);
  const isMessageActionBusy = String(messageActionBusyId) === String(scheduleCard?.id);
  const showActions = !isOutgoing && statusKey !== 'expired';
  const canEditDecision = !isScheduleExpired && statusKey !== 'pending';
  const courseSessionId = safeText(scheduleCard?.courseSessionId);
  const classroomHref = courseSessionId ? `/classroom/${encodeURIComponent(courseSessionId)}` : '';
  const canJoinClassroom = statusKey === 'accepted' && !isScheduleExpired && Boolean(classroomHref);
  const canRecallByStatus = isOutgoing && statusKey === 'pending';
  const canRecall = canRecallByStatus
    && (typeof scheduleCard?.canRecall === 'boolean' ? scheduleCard.canRecall : true);
  const canScheduleNextLesson = statusKey === 'pending' || statusKey === 'accepted';
  const scheduleCardId = String(scheduleCard?.id || '');
  const recallDisabledTitle = !isOutgoing
    ? '仅可撤回自己发出的日程'
    : statusKey === 'expired'
      ? '日程已过期，无法撤回'
      : '对方已响应，无法撤回';

  const statusClassName =
    statusMeta.tone === 'accept'
      ? 'accept-btn'
      : statusMeta.tone === 'reject'
        ? 'reject-btn'
        : statusMeta.tone === 'reschedule'
          ? 'reschedule-btn'
          : statusMeta.tone === 'expired'
            ? 'expired-btn'
          : 'pending-btn';

  const titleParts = useMemo(() => getCourseTitleParts(thread, scheduleCard), [scheduleCard, thread]);

  const decisionPopoverActions = useMemo(() => {
    if (statusKey === 'accepted') {
      return [
        { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
        { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
      ];
    }
    if (statusKey === 'rejected') {
      return [
        { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
        { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
      ];
    }
    if (statusKey === 'rescheduling') {
      return [
        { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
        { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
      ];
    }
    return [
      { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
      { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
      { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
    ];
  }, [statusKey]);

  const [decisionMenuOpen, setDecisionMenuOpen] = useState(false);
  const [messageMenuOpenInternal, setMessageMenuOpenInternal] = useState(false);
  const isMessageMenuControlled = typeof onOpenMessageMenuChange === 'function';
  const actualMessageMenuOpen = isMessageMenuControlled
    ? Boolean(openMessageMenuId) && String(openMessageMenuId) === scheduleCardId
    : messageMenuOpenInternal;
  const toggleActualMessageMenuOpen = (valueOrUpdater) => {
    if (isMessageMenuControlled) {
      const nextValue = typeof valueOrUpdater === 'function'
        ? valueOrUpdater(actualMessageMenuOpen)
        : valueOrUpdater;
      onOpenMessageMenuChange?.(Boolean(nextValue) ? scheduleCardId : null);
      return;
    }
    setMessageMenuOpenInternal(valueOrUpdater);
  };

  useEffect(() => {
    if (!decisionMenuOpen && !actualMessageMenuOpen) return undefined;

    const handleOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.schedule-decision-wrapper')) return;
      if (target.closest('.schedule-card-more')) return;
      setDecisionMenuOpen(false);
      if (isMessageMenuControlled) onOpenMessageMenuChange?.(null);
      else setMessageMenuOpenInternal(false);
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }, [actualMessageMenuOpen, decisionMenuOpen, isMessageMenuControlled, onOpenMessageMenuChange]);

  useEffect(() => {
    setDecisionMenuOpen(false);
    if (isMessageMenuControlled) onOpenMessageMenuChange?.(null);
    else setMessageMenuOpenInternal(false);
  }, [isMessageMenuControlled, onOpenMessageMenuChange, scheduleCard?.id, statusKey]);

  useEffect(() => {
    if (!isExiting) return;
    setDecisionMenuOpen(false);
    if (isMessageMenuControlled) onOpenMessageMenuChange?.(null);
    else setMessageMenuOpenInternal(false);
  }, [isExiting, isMessageMenuControlled, onOpenMessageMenuChange]);

  return (
    <div className={`schedule-row ${isOutgoing ? 'is-outgoing' : ''} ${isExiting ? 'is-exiting' : ''}`}>
      {!isOutgoing && (
        <div className="message-detail-avatar schedule-avatar" aria-hidden="true">
          <img
            className="message-avatar-img"
            src={activeAvatarSrc}
            alt=""
            loading="lazy"
            onError={(event) => applyAvatarFallback(event, {
              name: activeAvatarName,
              seed: thread?.id || activeAvatarName || 'appointment-card',
              size: 192,
            })}
          />
        </div>
      )}
      <div className={`schedule-card ${isSendingCard ? 'is-sending' : ''}`}>
        <div className={`schedule-card-more ${actualMessageMenuOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="schedule-card-more-trigger"
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={actualMessageMenuOpen}
            onClick={() => toggleActualMessageMenuOpen((prev) => !prev)}
            disabled={isMessageActionBusy || isExiting}
          >
            <span />
            <span />
            <span />
          </button>
          {actualMessageMenuOpen && (
            <div className="schedule-card-more-menu" role="menu">
              {canScheduleNextLesson ? (
                <button
                  type="button"
                  className="schedule-card-more-item"
                  onClick={() => {
                    toggleActualMessageMenuOpen(false);
                    onScheduleNextLesson?.(scheduleCard?.id);
                  }}
                  disabled={isMessageActionBusy || isExiting || isBusy}
                >
                  预约下节课
                </button>
              ) : null}
              <button
                type="button"
                className="schedule-card-more-item"
                onClick={() => {
                  toggleActualMessageMenuOpen(false);
                  onDeleteForMe?.(scheduleCard?.id);
                }}
                disabled={isMessageActionBusy || isExiting}
              >
                删除（仅自己）
              </button>
              {isOutgoing ? (
                <button
                  type="button"
                  className="schedule-card-more-item danger"
                  onClick={() => {
                    if (!canRecall) return;
                    toggleActualMessageMenuOpen(false);
                    onRecall?.(scheduleCard?.id);
                  }}
                  disabled={isMessageActionBusy || isExiting || !canRecall}
                  title={canRecall ? '' : recallDisabledTitle}
                >
                  撤回
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="schedule-card-top">
          <div className="schedule-card-top-row">
            <div className="schedule-card-icon" aria-hidden="true">
              <FiCalendar size={18} />
            </div>
            <div className="schedule-card-title-text">日程</div>
          </div>
          <div className="schedule-card-title">
            <span className="schedule-card-title-piece">
              <span className="schedule-card-title-icon" aria-hidden="true">
                {titleParts.DirectionIcon ? <titleParts.DirectionIcon size={14} /> : null}
              </span>
              <span className="schedule-card-title-main">{titleParts.courseName || scheduleTitle}</span>
            </span>
            {titleParts.courseType ? (
              <>
                <span className="schedule-card-title-sep" aria-hidden="true">-</span>
                <span className="schedule-card-title-piece">
                  <span className="schedule-card-title-icon" aria-hidden="true">
                    {titleParts.CourseTypeIcon ? <titleParts.CourseTypeIcon size={14} /> : null}
                  </span>
                  <span className="schedule-card-title-sub">{titleParts.courseType}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="schedule-time-row">
          <FiClock size={16} aria-hidden="true" />
          <span>{windowText}</span>
        </div>

        <div className="schedule-link-row">
          <FiVideo size={16} aria-hidden="true" />
          {canJoinClassroom ? (
            <a className="schedule-link" href={classroomHref} target="_blank" rel="noreferrer">
              加入视频会议
            </a>
          ) : (
            <span className="schedule-link schedule-link--disabled" aria-disabled="true">
              加入视频会议
            </span>
          )}
        </div>

        <div className="schedule-card-bottom">
          {showActions ? (
            <div className="schedule-actions">
              {statusKey === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="schedule-btn accept-btn"
                    onClick={() => onDecision?.(scheduleCard.id, 'accepted')}
                    disabled={isBusy}
                  >
                    <span className="schedule-btn-icon check" aria-hidden="true" />
                    接受
                  </button>
                  <button
                    type="button"
                    className="schedule-btn reject-btn"
                    onClick={() => onDecision?.(scheduleCard.id, 'rejected')}
                    disabled={isBusy}
                  >
                    <span className="schedule-btn-icon minus" aria-hidden="true" />
                    拒绝
                  </button>
                  <button
                    type="button"
                    className="schedule-btn reschedule-btn"
                    onClick={() => onReschedule?.(scheduleCard.id)}
                    disabled={isBusy}
                  >
                    <span className="schedule-btn-icon reschedule" aria-hidden="true" />
                    修改时间
                  </button>
                </>
              ) : canEditDecision ? (
                <div
                  className={`schedule-decision-wrapper ${decisionMenuOpen ? 'menu-open' : ''}`}
                  onMouseEnter={() => setDecisionMenuOpen(true)}
                  onMouseLeave={() => setDecisionMenuOpen(false)}
                >
                  <button
                    type="button"
                    className={`schedule-btn merged ${statusClassName}`}
                    onClick={() => setDecisionMenuOpen((prev) => !prev)}
                    disabled={isBusy}
                  >
                    {statusKey === 'accepted' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                    {statusKey === 'rejected' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                    {statusKey === 'rescheduling' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                    {statusMeta.label}
                    <span className={`schedule-decision-arrow ${decisionMenuOpen ? 'open' : ''}`} aria-hidden="true" />
                  </button>
                  {decisionMenuOpen && (
                    <div className="schedule-decision-popover" role="menu">
                      <div className="schedule-decision-popover-title">修改日程状态为</div>
                      <div className={`schedule-decision-popover-actions ${decisionPopoverActions.length === 1 ? 'single-action' : ''}`}>
                        {decisionPopoverActions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            className={`schedule-btn small inline-action ${
                              action.tone === 'accept'
                                ? 'accept-btn'
                                : action.tone === 'reject'
                                  ? 'reject-btn'
                                  : 'reschedule-btn'
                            }`}
                            onClick={() => {
                              if (action.value === 'rescheduling') onReschedule?.(scheduleCard.id);
                              else onDecision?.(scheduleCard.id, action.value);
                            }}
                            disabled={isBusy}
                          >
                            {action.tone === 'accept' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                            {action.tone === 'reject' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                            {action.tone === 'reschedule' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={`schedule-btn merged ${statusClassName}`}
                  disabled
                  aria-label={`日程状态：${statusMeta.label}`}
                >
                  {statusKey === 'accepted' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                  {statusKey === 'rejected' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                  {statusKey === 'rescheduling' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                  {statusMeta.label}
                </button>
              )}
            </div>
          ) : (
            <div className="schedule-actions">
              <button
                type="button"
                className={(statusKey === 'pending' || statusKey === 'expired')
                  ? `schedule-btn status-btn ${statusClassName}`
                  : `schedule-btn merged ${statusClassName}`}
                disabled
                aria-label={`日程状态：${statusMeta.label}`}
              >
                {isSendingCard && <span className="schedule-btn-spinner" aria-hidden="true" />}
                {statusKey === 'accepted' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                {statusKey === 'rejected' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                {statusKey === 'rescheduling' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                {statusMeta.label}
              </button>
            </div>
          )}
        </div>

        {cardHoverTime && (
          <div className="schedule-hover-time" aria-hidden="true">
            {cardHoverTime}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppointmentCard;

