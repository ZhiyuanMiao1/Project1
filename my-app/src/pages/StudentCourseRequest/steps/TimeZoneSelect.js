import React, { useEffect, useMemo, useRef, useState } from 'react';

function TimeZoneSelect({ id, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const idx = options.findIndex((o) => o.value === value);
    if (idx === -1) return;
    const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
    if (!itemEl) return;
    // Scroll so that selected item is approximately centered
    const listHeight = listEl.clientHeight;
    const itemTop = itemEl.offsetTop;
    const itemHeight = itemEl.offsetHeight;
    const targetScroll = itemTop - Math.max(0, (listHeight - itemHeight) / 2);
    try {
      listEl.scrollTo({ top: targetScroll, behavior: 'auto' });
    } catch (_) {
      listEl.scrollTop = targetScroll;
    }
  }, [open, options, value]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!open) return;
      const btn = buttonRef.current;
      const list = listRef.current;
      if (btn && btn.contains(e.target)) return;
      if (list && list.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => o.value === value);
    return found ? found.label : '';
  }, [options, value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(options.length - 1, currentIndex + 1);
      onChange({ target: { value: options[next].value } });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(0, currentIndex - 1);
      onChange({ target: { value: options[prev].value } });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="mx-select" data-open={open ? 'true' : 'false'}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className="mx-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
      >
        <span className="mx-select__label">{selectedLabel || '请选择'}</span>
        <span className="mx-select__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="mx-select__popover">
          <ul
            ref={listRef}
            role="listbox"
            aria-labelledby={id}
            className="mx-select__list"
          >
            {options.map((opt, index) => {
              const selected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  className={`mx-select__option ${selected ? 'selected' : ''}`}
                  onClick={() => {
                    onChange({ target: { value: opt.value } });
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TimeZoneSelect;
