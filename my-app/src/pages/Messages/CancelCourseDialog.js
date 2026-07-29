import React, { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { useI18n } from '../../i18n/language';
import './CancelCourseDialog.css';

function CancelCourseDialog({
  open,
  submitting = false,
  error = '',
  onClose,
  onConfirm,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || submitting) return;
      onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open, submitting]);

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    onClose?.();
  };

  return (
    <div
      className="cancel-course-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section
        ref={dialogRef}
        className="cancel-course-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-course-dialog-title"
        aria-describedby="cancel-course-dialog-description"
        tabIndex="-1"
      >
        <header className="cancel-course-dialog__header">
          <h2 id="cancel-course-dialog-title" className="cancel-course-dialog__title">
            {t('appointment.cancelDialogTitle', '取消课程')}
          </h2>
          <button
            className="cancel-course-dialog__close"
            type="button"
            aria-label={t('common.close', '关闭')}
            onClick={handleClose}
            disabled={submitting}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="cancel-course-dialog__body">
          <p id="cancel-course-dialog-description" className="cancel-course-dialog__description">
            {t(
              'appointment.cancelDialogMessage',
              '确定取消这节课吗？本次取消不会扣除学生课时',
            )}
          </p>

          {error ? (
            <div className="cancel-course-dialog__error" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="cancel-course-dialog__actions">
          <button
            type="button"
            className="cancel-course-dialog__button cancel-course-dialog__button--secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            className="cancel-course-dialog__button cancel-course-dialog__button--primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting
              ? t('appointment.cancelling', '取消中…')
              : t('appointment.cancelDialogConfirm', '确认')}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default CancelCourseDialog;
