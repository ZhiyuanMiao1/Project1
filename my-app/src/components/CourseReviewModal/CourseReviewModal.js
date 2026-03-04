import React, { useEffect, useRef, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import { FiAward, FiBookOpen, FiClipboard, FiClock, FiMessageCircle, FiX } from 'react-icons/fi';
import './CourseReviewModal.css';

const REVIEW_CATEGORY_SPECS = [
  { key: 'clarity', label: '讲解清晰', Icon: FiBookOpen },
  { key: 'communication', label: '沟通顺畅', Icon: FiMessageCircle },
  { key: 'preparation', label: '备课充分', Icon: FiClipboard },
  { key: 'expertise', label: '知识专业', Icon: FiAward },
  { key: 'punctuality', label: '上课守时', Icon: FiClock },
];

const createInitialScores = () =>
  REVIEW_CATEGORY_SPECS.reduce((acc, item) => {
    acc[item.key] = 0;
    return acc;
  }, {});

const normalizeInitialScores = (source) => {
  const base = createInitialScores();
  if (!source || typeof source !== 'object') return base;

  REVIEW_CATEGORY_SPECS.forEach(({ key }) => {
    const value = Number(source?.[key]);
    base[key] = Number.isFinite(value) && value >= 1 && value <= 5 ? value : 0;
  });

  return base;
};

function CourseReviewModal({
  course,
  onClose,
  onSubmit,
  isSubmitting = false,
  submitError = '',
}) {
  const [scores, setScores] = useState(() => normalizeInitialScores(course?.reviewScores));
  const [hoveredScores, setHoveredScores] = useState(() => createInitialScores());
  const [comment, setComment] = useState(() => (typeof course?.reviewComment === 'string' ? course.reviewComment : ''));
  const commentInputRef = useRef(null);

  useEffect(() => {
    setScores(normalizeInitialScores(course?.reviewScores));
    setHoveredScores(createInitialScores());
    setComment(typeof course?.reviewComment === 'string' ? course.reviewComment : '');
  }, [course?.id, course?.reviewSubmittedAt, course?.reviewUpdatedAt, course?.reviewScores, course?.reviewComment]);

  const isReviewComplete = REVIEW_CATEGORY_SPECS.every(({ key }) => Number(scores[key]) >= 1);
  const hasExistingReview = Boolean(course?.reviewSubmittedAt);

  const handleScoreChange = (key, score) => {
    if (isSubmitting) return;
    setScores((prev) => ({ ...prev, [key]: score }));
  };

  const handleScoreHover = (key, score) => {
    if (isSubmitting) return;
    setHoveredScores((prev) => ({ ...prev, [key]: score }));
  };

  const handleScoreHoverLeave = (key) => {
    setHoveredScores((prev) => ({ ...prev, [key]: 0 }));
  };

  const handleSubmit = () => {
    if (!isReviewComplete || isSubmitting) return;
    onSubmit?.({
      ...scores,
      comment: comment.trim(),
    });
  };

  const handleBlankAreaMouseDown = (event) => {
    const textarea = commentInputRef.current;
    if (!textarea) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (textarea.contains(target)) return;

    const interactiveSelector = 'button, textarea, input, label, a, select, option';
    if (target.closest(interactiveSelector)) return;

    if (document.activeElement === textarea) {
      textarea.blur();
    }
  };

  return (
    <div
      className="course-review-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="评价导师"
      onMouseDown={handleBlankAreaMouseDown}
    >
      <div className="course-review-modal__card">
        <button
          type="button"
          className="course-review-modal__close"
          aria-label="关闭评价弹窗"
          onClick={onClose}
          disabled={isSubmitting}
        >
          <FiX size={20} />
        </button>

        <div className="course-review-modal__head">
          <h2 className="course-review-modal__title">{course?.mentorName || '导师'}</h2>
        </div>

        <div className="course-review-modal__list">
          {REVIEW_CATEGORY_SPECS.map(({ key, label, Icon }) => {
            const value = Number(scores[key]) || 0;
            const hoverValue = Number(hoveredScores[key]) || 0;
            const displayValue = hoverValue || value;

            return (
              <div className="course-review-modal__item" key={key}>
                <div className="course-review-modal__item-meta">
                  <span className="course-review-modal__item-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="course-review-modal__item-label">{label}</span>
                </div>

                <div
                  className="course-review-modal__stars"
                  role="radiogroup"
                  aria-label={`${label}评分`}
                  onMouseLeave={() => handleScoreHoverLeave(key)}
                >
                  {Array.from({ length: 5 }).map((_, index) => {
                    const score = index + 1;
                    return (
                      <button
                        type="button"
                        key={score}
                        className={`course-review-modal__star-btn${score <= displayValue ? ' is-active' : ''}${
                          hoverValue && score <= hoverValue ? ' is-hover-preview' : ''
                        }`}
                        aria-label={`${label}${score}分`}
                        aria-pressed={score === value}
                        onMouseEnter={() => handleScoreHover(key, score)}
                        onFocus={() => handleScoreHover(key, score)}
                        onBlur={() => handleScoreHoverLeave(key)}
                        onClick={() => handleScoreChange(key, score)}
                        disabled={isSubmitting}
                      >
                        <FaStar size={18} />
                      </button>
                    );
                  })}
                </div>

                <span
                  className={`course-review-modal__item-score${value ? ' course-review-modal__item-score--filled' : ''}`}
                >
                  {value ? `${value}.0` : '未评分'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="course-review-modal__comment">
          <label className="course-review-modal__comment-label" htmlFor="course-review-comment">
            文字评价（可选）
          </label>
          <textarea
            id="course-review-comment"
            ref={commentInputRef}
            className="course-review-modal__comment-input"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="可以写下这节课的体验、收获或建议，为其他学生提供参考"
            rows={5}
            maxLength={1000}
            disabled={isSubmitting}
          />
        </div>

        {submitError ? <div className="course-review-modal__feedback">{submitError}</div> : null}

        <div className="course-review-modal__actions">
          <button
            type="button"
            className="course-review-modal__action course-review-modal__action--ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="button"
            className="course-review-modal__action"
            disabled={!isReviewComplete || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? '提交中...' : hasExistingReview ? '更新评价' : '提交评价'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CourseReviewModal;
