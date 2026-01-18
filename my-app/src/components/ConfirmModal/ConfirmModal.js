import React, { useEffect, useId, useRef } from 'react';
import './ConfirmModal.css';

function ConfirmModal({
  open,
  title = '确认操作',
  description,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const confirmButtonRef = useRef(null);

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
          <h3 id={titleId} className="confirm-modal-title">{title}</h3>
        </div>

        {description ? (
          <div className="confirm-modal-body">
            {typeof description === 'string' ? <p className="confirm-modal-desc">{description}</p> : description}
          </div>
        ) : null}

        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={() => onCancel?.()}>
            {cancelText}
          </button>
          <button
            type="button"
            className="confirm-modal-btn confirm-modal-btn--confirm"
            ref={confirmButtonRef}
            onClick={() => onConfirm?.()}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;

