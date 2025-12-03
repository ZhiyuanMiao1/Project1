import React from 'react';

function DetailsStep({ formData, onChange }) {
  return (
    <div className="step-field-stack">
      <div className="step-field-group">
        <label className="field-label" htmlFor="totalCourseHours">预计课程时长</label>
        <div className="hours-input">
          <input
            id="totalCourseHours"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="例如：10"
            value={formData.totalCourseHours}
            onChange={onChange('totalCourseHours')}
          />
          <span className="unit">小时</span>
        </div>
      </div>

      <div className="step-field-group">
        <label className="field-label" htmlFor="courseFocus">课程的关注点或素材</label>
        <textarea
          id="courseFocus"
          placeholder={'例如： Biomedical Engineering 课程的 Quiz1、Quiz2 需要讲解。\n\n也可以写一些学习偏好，比如：希望老师在 PPT 上标注一下'}
          value={formData.courseFocus}
          onChange={onChange('courseFocus')}
          rows={5}
        />
      </div>

      <div className="step-field-group">
        <label className="field-label" htmlFor="milestone">希望达成的目标/里程碑</label>
        <textarea
          id="milestone"
          type="text"
          placeholder="例如：6 周后的期末需要争取达到 A"
          value={formData.milestone}
          onChange={onChange('milestone')}
        />
      </div>
    </div>
  );
}

export default DetailsStep;
