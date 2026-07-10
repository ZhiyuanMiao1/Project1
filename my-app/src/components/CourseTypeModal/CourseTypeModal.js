import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './CourseTypeModal.css';
import { COURSE_TYPE_ID_TO_LABEL } from '../../constants/courseMappings';
import { useI18n } from '../../i18n/language';

const CourseTypeModal = ({ onClose, onSelect, anchorRef, mode = 'courseType' }) => {
  const { getCourseTypeLabel, t } = useI18n();
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
          {mode === 'studentFeatures' ? (
            <>
              <button type="button" className="course-type-button" onClick={() => handleCourseTypeSelect('评分高')}>
                {t('mentorFilter.highRating', '评分高')}
                <i className="fas fa-star"></i>
              </button>
              <button type="button" className="course-type-button" onClick={() => handleCourseTypeSelect('经验丰富')}>
                {t('mentorFilter.experienced', '经验丰富')}
                <i className="fas fa-award"></i>
              </button>
              <button type="button" className="course-type-button" onClick={() => handleCourseTypeSelect('快速响应')}>
                {t('mentorFilter.fastResponse', '快速响应')}
                <i className="fas fa-bolt"></i>
              </button>
              <button type="button" className="course-type-button" onClick={() => handleCourseTypeSelect('双语授课')}>
                {t('mentorFilter.bilingualTeaching', '双语授课')}
                <i className="fas fa-language"></i>
              </button>
              <button type="button" className="course-type-button" onClick={() => handleCourseTypeSelect('QS前100')}>
                {t('mentorFilter.qsTop100', 'QS前100')}
                <i className="fas fa-university"></i>
              </button>
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('')}
                aria-label={t('mentorFilter.clearSelection', '清空选择')}
              >
                {t('common.reset', '重置')}
                <i className="fas fa-eraser"></i>
              </button>
            </>
          ) : (
            <>
              {/* 选课指导 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('course-selection')}
              >
                {getCourseTypeLabel('course-selection', COURSE_TYPE_ID_TO_LABEL['course-selection'] || '选课指导')}
                <i className="fas fa-lightbulb"></i>
              </button>

              {/* 课前预习 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('pre-study')}
              >
                {getCourseTypeLabel('pre-study', COURSE_TYPE_ID_TO_LABEL['pre-study'] || '课前预习')}
                <i className="fas fa-chalkboard-teacher"></i>
              </button>

              {/* 作业项目 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('assignment-project')}
              >
                {getCourseTypeLabel('assignment-project', COURSE_TYPE_ID_TO_LABEL['assignment-project'] || '作业项目')}
                <i className="fas fa-book"></i>
              </button>

              {/* 期末复习 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('final-review')}
              >
                {getCourseTypeLabel('final-review', COURSE_TYPE_ID_TO_LABEL['final-review'] || '期末复习')}
                <i className="fas fa-graduation-cap"></i>
              </button>

              {/* 毕业论文 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('in-class-support')}
              >
                {getCourseTypeLabel('in-class-support', COURSE_TYPE_ID_TO_LABEL['in-class-support'] || '毕业论文')}
                <i className="fas fa-pen"></i>
              </button>

              {/* 其它类型 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('others')}
              >
                {getCourseTypeLabel('others', COURSE_TYPE_ID_TO_LABEL['others'] || '其它类型')}
                <i className="fas fa-code"></i>
              </button>

              {/* 清空当前选择 */}
              <button
                type="button"
                className="course-type-button"
                onClick={() => handleCourseTypeSelect('')}
                aria-label={t('courseType.clearSelection', '清空课程类型选择')}
              >
                {t('common.reset', '重置')}
                <i className="fas fa-eraser"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseTypeModal;
