import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiBookOpen, FiChevronRight, FiClock, FiPlus, FiX } from 'react-icons/fi';
import './CourseOnboardingModal.css';

function CourseOnboardingModal({
  title = '完善课程资料',
  mentorName = '',
  courseName = '',
  appointment = null,
  onCreateCourse,
  onClose,
}) {
  const closeButtonRef = useRef(null);

  useLayoutEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const computedBodyPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;

    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = scrollbarWidth
      ? `${computedBodyPaddingRight + scrollbarWidth}px`
      : prevPaddingRight;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const createdDateLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return fmt.format(new Date());
  }, []);

  const appointmentDateLabel = useMemo(() => {
    if (!appointment?.date) return '';
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return fmt.format(appointment.date);
  }, [appointment?.date]);

  const appointmentTimeLabel = useMemo(() => {
    if (!appointment?.windowLabel) return '';
    const tzLabel = String(appointment?.timeZoneLabel || '').trim();
    if (!tzLabel) return String(appointment.windowLabel);
    return `${appointment.windowLabel}（${tzLabel}）`;
  }, [appointment?.timeZoneLabel, appointment?.windowLabel]);

  const modal = (
    <div
      className="course-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="course-onboarding-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="course-onboarding-close"
          onClick={() => onClose?.()}
          aria-label="关闭"
          ref={closeButtonRef}
        >
          <FiX aria-hidden="true" />
        </button>

        <div className="course-onboarding-content">
          <h2 className="course-onboarding-title">{title}</h2>

          <div className="course-onboarding-card-stack" aria-label="课程与预约信息">
            <div className="course-onboarding-card">
              <div className="course-onboarding-card-icon" aria-hidden="true">
                <FiBookOpen />
              </div>
              <div className="course-onboarding-card-body">
                <div className="course-onboarding-card-title">你的课程，创建于 {createdDateLabel}</div>
                <div className="course-onboarding-card-subtitle">
                  {courseName || '课程'}
                  {mentorName ? <span className="course-onboarding-card-dot">·</span> : null}
                  {mentorName || null}
                </div>
              </div>
              <div className="course-onboarding-card-chevron" aria-hidden="true">
                <FiChevronRight />
              </div>
            </div>

            {appointment ? (
              <div className="course-onboarding-card">
                <div className="course-onboarding-card-icon" aria-hidden="true">
                  <FiClock />
                </div>
                <div className="course-onboarding-card-body">
                  <div className="course-onboarding-card-title">已选择的预约时间</div>
                  <div className="course-onboarding-card-subtitle">
                    {appointmentDateLabel}
                    {appointmentTimeLabel ? <span className="course-onboarding-card-dot">·</span> : null}
                    {appointmentTimeLabel}
                  </div>
                </div>
                <div className="course-onboarding-card-chevron" aria-hidden="true">
                  <FiChevronRight />
                </div>
              </div>
            ) : null}
          </div>

          <h3 className="course-onboarding-section-title">开始创建新课程</h3>
          <div className="course-onboarding-action-list" aria-label="创建课程入口">
            <button
              type="button"
              className="course-onboarding-action-row"
              onClick={() => onCreateCourse?.()}
            >
              <span className="course-onboarding-action-left">
                <span className="course-onboarding-action-icon" aria-hidden="true">
                  <FiPlus />
                </span>
                <span className="course-onboarding-action-text">创建新课程</span>
              </span>
              <span className="course-onboarding-action-chevron" aria-hidden="true">
                <FiChevronRight />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default CourseOnboardingModal;

