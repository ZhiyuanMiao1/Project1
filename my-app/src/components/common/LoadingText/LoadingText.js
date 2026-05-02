import React from 'react';
import './LoadingText.css';

const TRAILING_ELLIPSIS_RE = /(?:\s*(?:[.．。]{2,}|…+))$/u;

const toText = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

function LoadingText({
  text,
  children,
  className = '',
  active = true,
  role = 'status',
  ...props
}) {
  const rawText = toText(text ?? children);
  const label = rawText.trim();
  const displayText = label.replace(TRAILING_ELLIPSIS_RE, '').trimEnd();

  if (!active) {
    return (
      <span className={className} {...props}>
        {label}
      </span>
    );
  }

  const classes = ['mx-loading-text', className].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      role={role}
      aria-live="polite"
      aria-label={label || displayText}
      {...props}
    >
      {displayText ? <span className="mx-loading-text__label">{displayText}</span> : null}
      <span className="mx-loading-text__dots" aria-hidden="true">
        <span className="mx-loading-text__dot" />
        <span className="mx-loading-text__dot" />
        <span className="mx-loading-text__dot" />
      </span>
    </span>
  );
}

export default LoadingText;
