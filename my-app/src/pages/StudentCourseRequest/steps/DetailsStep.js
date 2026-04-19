import React from 'react';
import { useI18n } from '../../../i18n/language';

function DetailsStep({ formData, onChange }) {
  const { t } = useI18n();

  return (
    <div className="step-field-stack">
      <div className="step-field-group">
        <label className="field-label" htmlFor="totalCourseHours">{t('courseRequest.details.totalHours', '预计课程时长')}</label>
        <div className="hours-input">
          <input
            id="totalCourseHours"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder={t('courseRequest.details.hoursPlaceholder', '例如：10')}
            value={formData.totalCourseHours}
            onChange={onChange('totalCourseHours')}
          />
          <span className="unit">{t('courseRequest.details.hourUnit', '小时')}</span>
        </div>
      </div>

      <div className="step-field-group">
        <label className="field-label" htmlFor="courseFocus">{t('courseRequest.details.focus', '具体课程和需求')}</label>
        <textarea
          id="courseFocus"
          placeholder={t('courseRequest.details.focusPlaceholder', '例如： Biomedical Engineering 课程的 Quiz1、Quiz2 需要讲解。\n\n希望导师对PPT讲的更细致一些')}
          value={formData.courseFocus}
          onChange={onChange('courseFocus')}
          rows={5}
        />
      </div>

      <div className="step-field-group">
        <label className="field-label" htmlFor="milestone">{t('courseRequest.details.milestone', '希望达成的目标/里程碑')}</label>
        <textarea
          id="milestone"
          type="text"
          placeholder={t('courseRequest.details.milestonePlaceholder', '例如：6 周后的期末需要争取达到 A')}
          value={formData.milestone}
          onChange={onChange('milestone')}
        />
      </div>
    </div>
  );
}

export default DetailsStep;
