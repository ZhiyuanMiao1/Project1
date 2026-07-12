import React, { useEffect, useRef } from 'react';
import './MobileHomeFilters.css';

export function MobileHomeFilters({ filters, ariaLabel = '主页筛选' }) {
  return (
    <div className="mobile-home-filters" aria-label={ariaLabel}>
      <div className="mobile-home-filters__scroller">
        {filters.map((filter) => {
          const hasValue = Boolean(String(filter.value || '').trim());
          return (
            <div key={filter.key} className={`mobile-filter-chip${hasValue ? ' is-selected' : ''}`}>
              <button
                type="button"
                ref={filter.buttonRef}
                className="mobile-filter-chip__open"
                onClick={filter.onOpen}
                aria-expanded={Boolean(filter.expanded)}
              >
                <span className="mobile-filter-chip__label">{filter.label}</span>
                {hasValue ? <span className="mobile-filter-chip__value">{filter.value}</span> : null}
                <span className="mobile-filter-chip__chevron" aria-hidden="true">⌄</span>
              </button>
              {hasValue ? (
                <button
                  type="button"
                  className="mobile-filter-chip__clear"
                  onClick={filter.onClear}
                  aria-label={filter.clearLabel || `清除${filter.label}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MobileSearchSheet({ open, title, value, placeholder, onChange, onClose, onSubmit, searchLabel = '搜索' }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="mobile-sheet-overlay" onMouseDown={onClose}>
      <section
        className="mobile-sheet mobile-search-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mobile-sheet__handle" aria-hidden="true" />
        <div className="mobile-sheet__header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <form
          className="mobile-search-sheet__form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          <button type="submit">{searchLabel}</button>
        </form>
      </section>
    </div>
  );
}
