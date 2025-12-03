import React from 'react';
import { FaEllipsisH } from 'react-icons/fa';
import { COURSE_TYPE_ICON_MAP, COURSE_TYPE_OPTIONS, DIRECTION_ICON_MAP, DIRECTION_OPTIONS } from '../../../constants/courseMappings';

function DirectionStep({
  isDirectionSelection,
  isCourseTypeSelection,
  formData,
  setFormData,
}) {
  if (!isDirectionSelection) {
    return null;
  }

  if (isCourseTypeSelection) {
    return (
      <div className="direction-select">
        <div className="direction-grid two-col-grid" role="list">
          {COURSE_TYPE_OPTIONS.map((option, index) => {
            const selectedList = Array.isArray(formData.courseTypes) ? formData.courseTypes : [];
            const isActive = selectedList.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="listitem"
                className={`direction-card ${isActive ? 'active' : ''}`}
                style={{ '--card-index': index }}
                onClick={() => {
                  setFormData((previous) => {
                    const list = Array.isArray(previous.courseTypes) ? previous.courseTypes : [];
                    const exists = list.includes(option.id);
                    const nextList = exists ? list.filter((id) => id !== option.id) : [...list, option.id];
                    return {
                      ...previous,
                      courseTypes: nextList,
                      // 同步一份字段值以兼容旧字段
                      courseType: nextList[0] || '',
                    };
                  });
                }}
              >
                <span className="direction-card__icon" aria-hidden="true">
                  {(() => { const TypeIcon = COURSE_TYPE_ICON_MAP[option.id] || FaEllipsisH; return <TypeIcon />; })()}
                </span>
                <span className="direction-card__title">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="direction-select">
      <div className="direction-grid" role="list">
        {DIRECTION_OPTIONS.map((option, index) => {
          const isActive = formData.courseDirection === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`direction-card ${isActive ? 'active' : ''}`}
              style={{ '--card-index': index }}
              onClick={() => {
                setFormData((previous) => ({
                  ...previous,
                  courseDirection: option.id,
                  learningGoal: option.label,
                }));
              }}
            >
              <span className="direction-card__icon" aria-hidden="true">
                {(() => { const Icon = DIRECTION_ICON_MAP[option.id] || FaEllipsisH; return <Icon />; })()}
              </span>
              <span className="direction-card__title">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DirectionStep;
