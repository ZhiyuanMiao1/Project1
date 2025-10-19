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

  // 文档级监听：点击弹窗外关闭（使用 click 冒泡阶段，避免按下瞬间关闭）
  useEffect(() => {
    const onDocClick = (e) => {
      const panel = contentRef.current;
      const anchorEl = anchorRef?.current;
      if (!panel) return;
      if (panel.contains(e.target)) return; // 点击在弹窗内部
      if (anchorEl && anchorEl.contains(e.target)) return; // 点击在触发元素上（例如首次点击打开）
      onClose();
    };
    document.addEventListener('click', onDocClick, false);
    return () => document.removeEventListener('click', onDocClick, false);
  }, [onClose, anchorRef]);

  return (
    <div className="course-type-modal-overlay">
      <div
        className="course-types-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
        // 交互由文档级监听控制
      >
        <div className="course-types">
          {/* 选课指导 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Course Selection')}
          >
            选课指导
            <i className="fas fa-lightbulb"></i>
          </button>

          {/* 课前预习 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Pre-class Preparation')}
          >
            课前预习
            <i className="fas fa-chalkboard-teacher"></i>
          </button>

          {/* 作业项目 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Assignment')}
          >
            作业项目
            <i className="fas fa-book"></i>
          </button>

          {/* 期末复习 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Exam Review')}
          >
            期末复习
            <i className="fas fa-graduation-cap"></i>
          </button>

          {/* 毕业论文 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Graduation Thesis')}
          >
            毕业论文
            <i className="fas fa-pen"></i>
          </button>

          {/* 其它类型（保持原有值以确保功能不变）*/}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('Programming')}
          >
            其它类型
            <i className="fas fa-code"></i>
          </button>

          {/* 清空当前选择 */}
          <button
            className="course-type-button"
            onClick={() => handleCourseTypeSelect('')}
            aria-label="清空课程类型选择"
          >
            重置
            <i className="fas fa-eraser"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseTypeModal;
