import React from 'react';
import './CourseTypeModal.css';

const CourseTypeModal = ({ onClose, onSelect }) => {
  const handleCourseTypeSelect = (courseType) => {
    onSelect(courseType); // 设置选中课程类型
    onClose(); // 关闭弹窗
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="course-types-modal-content" onClick={(e) => e.stopPropagation()}>
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
            清空
            <i className="fas fa-eraser"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseTypeModal;
