import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './MobileHomeFilters.css';

export function MobileHomeFilters({ filters, ariaLabel = '主页筛选', showChevron = true, hideLabelWhenSelected = false }) {
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
                {!hasValue || !hideLabelWhenSelected ? (
                  <span className="mobile-filter-chip__label">{filter.label}</span>
                ) : null}
                {hasValue ? <span className="mobile-filter-chip__value">{filter.value}</span> : null}
                {showChevron ? <span className="mobile-filter-chip__chevron" aria-hidden="true">⌄</span> : null}
              </button>
              {hasValue ? (
                <button
                  type="button"
                  className="mobile-filter-chip__clear"
                  onClick={filter.onClear}
                  aria-label={filter.clearLabel || `清除${filter.label}`}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
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
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const syncVisualViewport = () => {
      const overlay = overlayRef.current;
      const viewport = window.visualViewport;
      if (!overlay) return;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportRight = viewport ? viewportLeft + viewport.width : window.innerWidth;
      const viewportBottom = viewport ? viewportTop + viewport.height : window.innerHeight;
      const keyboardRect = navigator.virtualKeyboard?.boundingRect;
      const keyboardTop = keyboardRect?.height > 0 ? keyboardRect.top : Number.POSITIVE_INFINITY;
      const visibleBottom = Math.min(viewportBottom, keyboardTop);
      overlay.style.setProperty('--mobile-viewport-top', `${viewportTop}px`);
      overlay.style.setProperty('--mobile-viewport-left', `${viewportLeft}px`);
      overlay.style.setProperty('--mobile-viewport-width', `${Math.max(0, viewportRight - viewportLeft)}px`);
      overlay.style.setProperty('--mobile-viewport-height', `${Math.max(0, visibleBottom - viewportTop)}px`);
    };
    syncVisualViewport();
    window.addEventListener('resize', syncVisualViewport);
    window.visualViewport?.addEventListener('resize', syncVisualViewport);
    window.visualViewport?.addEventListener('scroll', syncVisualViewport);
    navigator.virtualKeyboard?.addEventListener?.('geometrychange', syncVisualViewport);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('resize', syncVisualViewport);
      window.visualViewport?.removeEventListener('resize', syncVisualViewport);
      window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
      navigator.virtualKeyboard?.removeEventListener?.('geometrychange', syncVisualViewport);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  const sheet = (
    <div ref={overlayRef} className="mobile-sheet-overlay" onMouseDown={onClose}>
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
  return createPortal(sheet, document.body);
}
