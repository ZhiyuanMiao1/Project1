import React, { useEffect, useMemo, useState } from 'react';
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

const createInitialScores = () => REVIEW_CATEGORY_SPECS.reduce((acc, item) => {
  acc[item.key] = 0;
  return acc;
}, {});

function CourseReviewModal({ course, onClose, onSubmit }) {
  const [scores, setScores] = useState(() => createInitialScores());

  useEffect(() => {
    setScores(createInitialScores());
  }, [course?.id]);

  const reviewAverage = useMemo(() => {
    const values = REVIEW_CATEGORY_SPECS
      .map(({ key }) => Number(scores[key]) || 0)
      .filter((value) => value > 0);
    if (!values.length) return null;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  }, [scores]);

  const isReviewComplete = REVIEW_CATEGORY_SPECS.every(({ key }) => Number(scores[key]) >= 1);

  const handleScoreChange = (key, score) => {
    setScores((prev) => ({ ...prev, [key]: score }));
  };

  const handleSubmit = () => {
    if (!isReviewComplete) return;
    onSubmit?.(scores);
  };

  return (
    <div className="course-review-modal__overlay" role="dialog" aria-modal="true" aria-label="评价导师">
      <div className="course-review-modal__card">
        <button
          type="button"
          className="course-review-modal__close"
          aria-label="关闭评价弹窗"
          onClick={onClose}
        >
          <FiX size={20} />
        </button>

        <div className="course-review-modal__head">
          <div>
            <p className="course-review-modal__eyebrow">评价导师</p>
            <h2 className="course-review-modal__title">{course?.mentorName || '导师'}</h2>
            <p className="course-review-modal__subtitle">请按照以下维度为本次课程打分</p>
          </div>
          <div className="course-review-modal__average">
            <span className="course-review-modal__average-value">{reviewAverage != null ? reviewAverage.toFixed(1) : '--'}</span>
            <span className="course-review-modal__average-label">当前平均分</span>
          </div>
        </div>

        <div className="course-review-modal__list">
          {REVIEW_CATEGORY_SPECS.map(({ key, label, Icon }) => {
            const value = Number(scores[key]) || 0;
            return (
              <div className="course-review-modal__item" key={key}>
                <div className="course-review-modal__item-meta">
                  <span className="course-review-modal__item-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="course-review-modal__item-label">{label}</span>
                </div>
                <div className="course-review-modal__stars" role="radiogroup" aria-label={`${label}评分`}>
                  {Array.from({ length: 5 }).map((_, index) => {
                    const score = index + 1;
                    return (
                      <button
                        type="button"
                        key={score}
                        className={`course-review-modal__star-btn${score <= value ? ' is-active' : ''}`}
                        aria-label={`${label}${score}分`}
                        aria-pressed={score === value}
                        onClick={() => handleScoreChange(key, score)}
                      >
                        <FaStar size={18} />
                      </button>
                    );
                  })}
                </div>
                <span className="course-review-modal__item-score">{value ? `${value}.0` : '未评分'}</span>
              </div>
            );
          })}
        </div>

        <div className="course-review-modal__actions">
          <button
            type="button"
            className="course-review-modal__action course-review-modal__action--ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="course-review-modal__action"
            disabled={!isReviewComplete}
            onClick={handleSubmit}
          >
            提交评价
          </button>
        </div>
      </div>
    </div>
  );
}

export default CourseReviewModal;
