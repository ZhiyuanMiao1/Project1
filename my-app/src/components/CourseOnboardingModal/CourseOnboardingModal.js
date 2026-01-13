import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiBookOpen, FiChevronRight, FiPlus, FiX } from 'react-icons/fi';
import { FaEllipsisH } from 'react-icons/fa';
import {
  COURSE_TYPE_LABEL_ICON_MAP,
  DIRECTION_LABEL_ICON_MAP,
  courseTypeToCnLabel,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import './CourseOnboardingModal.css';

function CourseOnboardingModal({
  title = '完善课程资料',
  mentorName = '',
  courseName = '',
  courseType = '作业项目',
  onConfirm,
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

  const normalizedCourseLabel = useMemo(() => {
    const raw = String(courseName || '').trim();
    if (!raw) return '课程';
    return normalizeCourseLabel(raw) || raw;
  }, [courseName]);

  const normalizedCourseTypeLabel = useMemo(() => {
    const raw = String(courseType || '').trim();
    if (!raw) return '作业项目';
    return courseTypeToCnLabel(raw) || raw;
  }, [courseType]);

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

        <div className="course-onboarding-body">
          <div className="course-onboarding-content">
            <h2 className="course-onboarding-title">{title}</h2>

            <div className="course-onboarding-card-stack" aria-label="课程与预约信息">
              {(() => {
                const TitleIcon = DIRECTION_LABEL_ICON_MAP[normalizedCourseLabel] || FiBookOpen;
                const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[normalizedCourseTypeLabel] || FaEllipsisH;
                return (
                  <div className="course-onboarding-card course-onboarding-course-card">
                    <div className="course-onboarding-course-left">
                      <div className="course-onboarding-course-title-row">
                        <span className="course-onboarding-course-title-icon" aria-hidden="true">
                          <TitleIcon size={20} />
                        </span>
                        <span className="course-onboarding-course-title-text">{normalizedCourseLabel}</span>
                      </div>
                      <div className="course-onboarding-course-type-row">
                        <span className="course-onboarding-course-type-icon" aria-hidden="true">
                          <TypeIcon size={14} />
                        </span>
                        <span className="course-onboarding-course-type-text">{normalizedCourseTypeLabel}</span>
                      </div>
                    </div>
                    <div className="course-onboarding-course-right">
                      <span className="course-onboarding-course-created">创建于{createdDateLabel}</span>
                      <span className="course-onboarding-card-chevron" aria-hidden="true">
                        <FiChevronRight />
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="course-onboarding-footer" aria-label="创建课程入口">
          <h3 className="course-onboarding-section-title">开始创建新课程</h3>
          <div className="course-onboarding-action-list">
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

          <button
            type="button"
            className="course-onboarding-confirm"
            onClick={() => (onConfirm || onClose)?.()}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default CourseOnboardingModal;
