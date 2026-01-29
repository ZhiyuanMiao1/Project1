import React, { useEffect, useId, useRef } from 'react';
import './SuccessModal.css';

function SuccessModal({
  open,
  title = '成功',
  description,
  autoCloseMs = 2200,
  onClose,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const shouldAutoClose = Number.isFinite(autoCloseMs) && autoCloseMs > 0;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const closeTimer = shouldAutoClose ? window.setTimeout(() => onClose?.(), autoCloseMs) : null;

    return () => {
      window.clearTimeout(focusTimer);
      if (closeTimer) window.clearTimeout(closeTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, autoCloseMs, onClose, shouldAutoClose]);

  if (!open) return null;

  return (
    <div
      className="success-modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="success-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        style={shouldAutoClose ? { '--success-modal-duration': `${autoCloseMs}ms` } : undefined}
      >
        <div className="success-modal-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              d="M20 6.5 9.75 16.75 4 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h3 id={titleId} className="success-modal-title">
          {title}
        </h3>

        {description ? (
          <div className="success-modal-body">
            {typeof description === 'string' ? (
              <p className="success-modal-desc">{description}</p>
            ) : (
              description
            )}
          </div>
        ) : null}

        {shouldAutoClose ? <div className="success-modal-hint">将自动关闭</div> : null}
        {shouldAutoClose ? <div className="success-modal-progress" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

export default SuccessModal;
