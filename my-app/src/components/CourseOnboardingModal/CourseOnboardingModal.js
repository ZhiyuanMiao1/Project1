import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  sampleCoursesCount = 0,
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

  const courseCards = useMemo(() => {
    const today = new Date();
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    const withDate = (label, type, daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (Number.isFinite(daysAgo) ? daysAgo : 0));
      return { label, type, createdLabel: fmt.format(d) };
    };

    const primary = withDate(normalizedCourseLabel, normalizedCourseTypeLabel, 0);
    const samples = [
      withDate('编程基础', '课前预习', 2),
      withDate('数据结构与算法', '期末复习', 6),
      withDate('机器学习', '作业项目', 12),
      withDate('求职辅导', '选课指导', 20),
    ];

    const want = Math.max(0, Math.min(20, Number(sampleCoursesCount) || 0));
    return [primary, ...samples.slice(0, want)];
  }, [normalizedCourseLabel, normalizedCourseTypeLabel, sampleCoursesCount]);

  const courseButtonRefs = useRef([]);
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(null);

  useEffect(() => {
    setSelectedCourseIndex((prev) => {
      if (prev === null || typeof prev === 'undefined') return null;
      const lastIndex = Math.max(0, courseCards.length - 1);
      return Math.min(Math.max(0, prev), lastIndex);
    });
  }, [courseCards.length]);

  const selectedCourse = typeof selectedCourseIndex === 'number' ? (courseCards[selectedCourseIndex] || null) : null;

  const focusCourseAt = (index) => {
    const el = courseButtonRefs.current[index];
    el?.focus?.();
  };

  const onCourseKeyDown = (event, index) => {
    const key = event.key;
    const lastIndex = courseCards.length - 1;
    if (lastIndex < 0) return;

    let nextIndex = null;
    if (key === 'ArrowDown' || key === 'ArrowRight') nextIndex = Math.min(index + 1, lastIndex);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') nextIndex = Math.max(index - 1, 0);
    else if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = lastIndex;

    if (nextIndex === null) return;
    event.preventDefault();
    setSelectedCourseIndex(nextIndex);
    requestAnimationFrame(() => focusCourseAt(nextIndex));
  };

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

        <div className="course-onboarding-header">
          <h2 className="course-onboarding-title">{title}</h2>
        </div>

        <div className="course-onboarding-body">
          <div className="course-onboarding-content">
            <div className="course-onboarding-card-stack" role="radiogroup" aria-label="选择课程">
              {courseCards.map((item, idx) => {
                const TitleIcon = DIRECTION_LABEL_ICON_MAP[item.label] || FiBookOpen;
                const TypeIcon = COURSE_TYPE_LABEL_ICON_MAP[item.type] || FaEllipsisH;
                const isSelected = selectedCourseIndex === idx;
                const isTabbable = isSelected || (selectedCourseIndex === null && idx === 0);
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isTabbable ? 0 : -1}
                    className={`course-onboarding-card course-onboarding-course-card course-onboarding-course-card--selectable${isSelected ? ' course-onboarding-course-card--selected' : ''}`}
                    key={`${item.label}-${item.type}-${idx}`}
                    onClick={() => setSelectedCourseIndex(idx)}
                    onKeyDown={(e) => onCourseKeyDown(e, idx)}
                    ref={(el) => {
                      if (el) courseButtonRefs.current[idx] = el;
                    }}
                  >
                    <div className="course-onboarding-course-left">
                      <div className="course-onboarding-course-title-row">
                        <span
                          className="course-onboarding-course-title-icon"
                          aria-hidden="true"
                        >
                          <TitleIcon size={20} />
                        </span>
                        <span className="course-onboarding-course-title-text">
                          {item.label}
                        </span>
                      </div>
                      <div className="course-onboarding-course-type-row">
                        <span className="course-onboarding-course-type-icon" aria-hidden="true">
                          <TypeIcon size={14} />
                        </span>
                        <span className="course-onboarding-course-type-text">{item.type}</span>
                      </div>
                    </div>
                    <div className="course-onboarding-course-right">
                      <span className="course-onboarding-course-created">创建于{item.createdLabel || createdDateLabel}</span>
                    </div>
                  </button>
                );
              })}
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
            onClick={() => {
              if (onConfirm) onConfirm(selectedCourse);
              else onClose?.();
            }}
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
