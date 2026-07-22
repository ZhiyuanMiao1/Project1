import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

function WheelColumn({ label, options, value, onChange }) {
  const listRef = useRef(null);
  const settleTimerRef = useRef(null);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value]
  );

  const findNearestEnabledIndex = (rawIndex) => {
    if (!options.length) return -1;
    const safeIndex = Math.max(0, Math.min(options.length - 1, rawIndex));
    if (!options[safeIndex]?.disabled) return safeIndex;

    for (let distance = 1; distance < options.length; distance += 1) {
      const after = safeIndex + distance;
      if (after < options.length && !options[after]?.disabled) return after;
      const before = safeIndex - distance;
      if (before >= 0 && !options[before]?.disabled) return before;
    }
    return -1;
  };

  const scrollToIndex = (index, behavior = 'smooth') => {
    if (!listRef.current || index < 0) return;
    listRef.current.scrollTo({ top: index * ITEM_HEIGHT, behavior });
  };

  useLayoutEffect(() => {
    scrollToIndex(selectedIndex, 'auto');
  }, [selectedIndex]);

  useEffect(() => () => clearTimeout(settleTimerRef.current), []);

  const settleSelection = () => {
    const list = listRef.current;
    if (!list || !options.length) return;
    const rawIndex = Math.round(list.scrollTop / ITEM_HEIGHT);
    const nextIndex = findNearestEnabledIndex(rawIndex);
    if (nextIndex < 0) return;
    scrollToIndex(nextIndex);
    const nextValue = options[nextIndex]?.value;
    if (nextValue !== value) onChange(nextValue);
  };

  const handleScroll = () => {
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(settleSelection, 90);
  };

  const moveSelection = (direction) => {
    if (!options.length) return;
    let index = selectedIndex + direction;
    while (index >= 0 && index < options.length && options[index]?.disabled) index += direction;
    if (index < 0 || index >= options.length) return;
    onChange(options[index].value);
    scrollToIndex(index);
  };

  return (
    <div className="wheel-picker__column-wrap">
      <div className="wheel-picker__column-label">{label}</div>
      <div className="wheel-picker__viewport">
        <div className="wheel-picker__selection" aria-hidden />
        <div className="wheel-picker__fade wheel-picker__fade--top" aria-hidden />
        <div className="wheel-picker__fade wheel-picker__fade--bottom" aria-hidden />
        <div
          ref={listRef}
          className="wheel-picker__column"
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveSelection(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveSelection(-1);
            }
          }}
        >
          <div className="wheel-picker__spacer" aria-hidden />
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`wheel-picker__option ${isSelected ? 'is-selected' : ''}`}
                key={String(option.value)}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  scrollToIndex(options.indexOf(option));
                }}
              >
                {option.label}
              </button>
            );
          })}
          <div className="wheel-picker__spacer" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function WheelPickerSheet({
  open,
  title,
  columns,
  onCancel,
  onConfirm,
  confirmDisabled = false,
  cancelLabel = '取消',
  confirmLabel = '完成',
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => cancelRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus?.();
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="wheel-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="wheel-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="wheel-sheet__handle" aria-hidden />
        <div className="wheel-sheet__header">
          <button ref={cancelRef} type="button" className="wheel-sheet__action" onClick={onCancel}>{cancelLabel}</button>
          <h2>{title}</h2>
          <button
            type="button"
            className="wheel-sheet__action wheel-sheet__action--confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
        <div
          className={`wheel-picker ${columns.length === 1 ? 'wheel-picker--single' : ''}`}
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <WheelColumn
              key={column.id}
              label={column.label}
              options={column.options}
              value={column.value}
              onChange={column.onChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export { ITEM_HEIGHT, VISIBLE_ITEMS, WheelColumn, WheelPickerSheet };
export default WheelPickerSheet;
