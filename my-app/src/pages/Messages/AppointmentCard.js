import React, { useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiClock, FiVideo } from 'react-icons/fi';
import {
  getCourseTitleParts,
  resolveScheduleStatus,
  SCHEDULE_STATUS_META,
} from './appointmentCardUtils';
import './AppointmentCard.css';

function AppointmentCard({
  thread,
  scheduleCard,
  detailAvatarInitial,
  activeAvatarUrl,
  scheduleTitle,
  windowText,
  meetingText,
  cardHoverTime,
  isSendingCard,
  appointmentBusyId,
  messageActionBusyId,
  onDecision,
  onReschedule,
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
  const statusMeta = SCHEDULE_STATUS_META[statusKey] || SCHEDULE_STATUS_META.pending;
  const isBusy = String(appointmentBusyId) === String(scheduleCard?.id);
  const isMessageActionBusy = String(messageActionBusyId) === String(scheduleCard?.id);
  const showActions = !isOutgoing && statusKey !== 'expired';
  const rawStatus = typeof scheduleCard?.status === 'string' ? scheduleCard.status.trim().toLowerCase() : 'pending';
  const canRecallFallback = isOutgoing && rawStatus === 'pending';
  const canRecall = typeof scheduleCard?.canRecall === 'boolean' ? scheduleCard.canRecall : canRecallFallback;

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
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);

  useEffect(() => {
    if (!decisionMenuOpen && !messageMenuOpen) return undefined;

    const handleOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.schedule-decision-wrapper')) return;
      if (target.closest('.schedule-card-more')) return;
      setDecisionMenuOpen(false);
      setMessageMenuOpen(false);
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }, [decisionMenuOpen, messageMenuOpen]);

  useEffect(() => {
    setDecisionMenuOpen(false);
    setMessageMenuOpen(false);
  }, [scheduleCard?.id, statusKey]);

  return (
    <div className={`schedule-row ${isOutgoing ? 'is-outgoing' : ''}`}>
      {!isOutgoing && (
        <div className="message-detail-avatar schedule-avatar" aria-hidden="true">
          <span className="message-avatar-fallback">{detailAvatarInitial}</span>
          {activeAvatarUrl ? (
            <img
              className="message-avatar-img"
              src={activeAvatarUrl}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
        </div>
      )}
      <div className={`schedule-card ${isSendingCard ? 'is-sending' : ''}`}>
        <div className={`schedule-card-more ${messageMenuOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="schedule-card-more-trigger"
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={messageMenuOpen}
            onClick={() => setMessageMenuOpen((prev) => !prev)}
            disabled={isMessageActionBusy}
          >
            <span />
            <span />
            <span />
          </button>
          {messageMenuOpen && (
            <div className="schedule-card-more-menu" role="menu">
              <button
                type="button"
                className="schedule-card-more-item"
                onClick={() => {
                  setMessageMenuOpen(false);
                  onDeleteForMe?.(scheduleCard?.id);
                }}
                disabled={isMessageActionBusy}
              >
                删除（仅自己）
              </button>
              <button
                type="button"
                className="schedule-card-more-item danger"
                onClick={() => {
                  if (!canRecall) return;
                  setMessageMenuOpen(false);
                  onRecall?.(scheduleCard?.id);
                }}
                disabled={isMessageActionBusy || !canRecall}
                title={canRecall ? '' : '对方已响应，无法撤回'}
              >
                撤回
              </button>
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
          <a className="schedule-link" href="https://zoom.us" target="_blank" rel="noreferrer">加入Zoom视频会议</a>
        </div>

        <div className="schedule-meeting-id">{meetingText}</div>

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
              ) : (
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

