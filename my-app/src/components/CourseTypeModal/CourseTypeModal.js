import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './CourseTypeModal.css';

const CourseTypeModal = ({ onClose, onSelect, anchorRef }) => {
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 280;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const minGap = 8;
      let left = rect.left;
      const maxLeft = viewportWidth - modalWidth - minGap;
      if (left > maxLeft) left = Math.max(minGap, maxLeft);
      if (left < minGap) left = minGap;
      setPosition({ top: rect.bottom + 10, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef]);
  const handleCourseTypeSelect = (courseType) => {
    onSelect(courseType); // 设置选中课程类型
    onClose(); // 关闭弹窗
  };

  // 文档级监听：点击弹窗外关闭，但不阻止外部交互
  useEffect(() => {
    const onDocMouseDown = (e) => {
      const panel = contentRef.current;
      if (!panel) return;
      if (!panel.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  return (
    <div className="course-type-modal-overlay">
      <div
        className="course-types-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
        // 交互由文档级监听控制
      >
        <div className="course-types">
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Pre-class Preparation')}
          >
            Pre-class Preparation
            <i className="fas fa-chalkboard-teacher"></i>
          </button>
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Assignment')}
          >
            Assignment
            <i className="fas fa-book"></i>
          </button>
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Exam Review')}
          >
            Exam Review
            <i className="fas fa-graduation-cap"></i>
          </button>
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Programming')}
          >
            Programming
            <i className="fas fa-code"></i>
          </button>
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Course Selection')}
          >
            Course Selection
            <i className="fas fa-lightbulb"></i>
          </button>
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Graduation Thesis')}
          >
            Graduation Thesis
            <i className="fas fa-pen"></i>
          </button>
          {/* 清空当前选择 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('')}
            aria-label="清空课程类型选择"
          >
            Reset
            <i className="fas fa-eraser"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseTypeModal;
