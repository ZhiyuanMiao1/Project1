import React, { useEffect, useId, useRef } from 'react';
import Button from '../common/Button/Button';
import LoadingText from '../common/LoadingText/LoadingText';
import { useI18n } from '../../i18n/language';
import './ConfirmModal.css';

const ACTIVE_TEXT_RE = /(?:中|ing)(?:\s*(?:[.．。]{2,}|…+))$/iu;

const renderActionText = (value) => (
  typeof value === 'string' && ACTIVE_TEXT_RE.test(value.trim())
    ? <LoadingText text={value} />
    : value
);

function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) {
  const { t } = useI18n();
  const titleId = useId();
  const confirmButtonRef = useRef(null);
  const resolvedTitle = title || t('common.confirmAction', '确认操作');
  const resolvedConfirmText = confirmText || t('common.confirm', '确认');
  const resolvedCancelText = cancelText || t('common.cancel', '取消');

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => confirmButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="confirm-modal-header">
          <h3 id={titleId} className="confirm-modal-title">{resolvedTitle}</h3>
        </div>

        {description ? (
          <div className="confirm-modal-body">
            {typeof description === 'string' ? <p className="confirm-modal-desc">{description}</p> : description}
          </div>
        ) : null}

        <div className="confirm-modal-actions">
          <Button className="confirm-modal-btn confirm-modal-btn--cancel" onClick={() => onCancel?.()}>
            {resolvedCancelText}
          </Button>
          <Button
            className="confirm-modal-btn confirm-modal-btn--confirm"
            ref={confirmButtonRef}
            onClick={() => onConfirm?.()}
          >
            {renderActionText(resolvedConfirmText)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
