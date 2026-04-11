import React from 'react';
import { FiX } from 'react-icons/fi';
import Button from '../common/Button/Button';
import './LessonHoursDialog.css';

function LessonHoursDialog({
  open,
  title = '提交本节课实际课时',
  value,
  onValueChange,
  error = '',
  submitting = false,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    onClose?.();
  };

  return (
    <div
      className="lesson-hours-dialog-overlay"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="lesson-hours-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="填写课时"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lesson-hours-dialog-head">
          <div>
            <h2 className="lesson-hours-dialog-title">{title}</h2>
          </div>
          <button
            type="button"
            className="lesson-hours-dialog-close"
            aria-label="关闭"
            onClick={handleClose}
            disabled={submitting}
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="lesson-hours-dialog-body">
          <div className="lesson-hours-dialog-row">
            <label className="lesson-hours-dialog-label" htmlFor="lesson-hours-dialog-input">
              课时
            </label>
            <div className="lesson-hours-dialog-field">
              <input
                id="lesson-hours-dialog-input"
                className="lesson-hours-dialog-input"
                type="number"
                min="0.25"
                max="12"
                step="0.25"
                inputMode="decimal"
                value={value}
                onChange={(event) => onValueChange?.(event.target.value)}
                disabled={submitting}
              />
              <span className="lesson-hours-dialog-unit">小时</span>
            </div>
          </div>
          {error ? (
            <div className="lesson-hours-dialog-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <div className="lesson-hours-dialog-actions">
          <Button
            className="lesson-hours-dialog-btn lesson-hours-dialog-btn--ghost"
            onClick={handleClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            className="lesson-hours-dialog-btn lesson-hours-dialog-btn--submit"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? '提交中...' : '提交'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LessonHoursDialog;
