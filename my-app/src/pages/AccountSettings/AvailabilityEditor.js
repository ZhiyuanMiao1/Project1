import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScheduleTimesPanel from '../StudentCourseRequest/steps/ScheduleTimesPanel';
import { buildShortUTC, getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';

const toNoonDate = (dateLike) => {
  if (!dateLike) return dateLike;
  const d = new Date(dateLike);
  d.setHours(12, 0, 0, 0);
  return d;
};

const ymdKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const buildCalendarGrid = (viewMonth) => {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startIdx = first.getDay(); // 0=Sun
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const prevMonthDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

  const cells = [];
  for (let i = startIdx - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, dayNum);
    cells.push({ date, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: next.getMonth() !== viewMonth.getMonth() });
  }
  return cells;
};

const isSameDay = (a, b) => (
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
);

function AvailabilityEditor({
  value,
  disabled = false,
  loading = false,
  saving = false,
  onChange,
  onSave,
}) {
  const timesListRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState(() => toNoonDate(new Date()));
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [selectedRangeKeys, setSelectedRangeKeys] = useState(() => [ymdKey(toNoonDate(new Date()))]);
  const [dragStartKey, setDragStartKey] = useState(null);
  const [dragEndKey, setDragEndKey] = useState(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [dragPreviewKeys, setDragPreviewKeys] = useState(() => new Set());
  const didDragRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const selectedTimeZone = useMemo(() => {
    const raw = typeof value?.timeZone === 'string' ? value.timeZone.trim() : '';
    return raw || getDefaultTimeZone();
  }, [value?.timeZone]);

  const normalizeAvailability = useCallback((nextValue) => {
    const daySelections = nextValue && typeof nextValue.daySelections === 'object' && nextValue.daySelections && !Array.isArray(nextValue.daySelections)
      ? nextValue.daySelections
      : {};
    const sessionDurationHours = typeof nextValue?.sessionDurationHours === 'number' ? nextValue.sessionDurationHours : 2;
    return { timeZone: selectedTimeZone, sessionDurationHours, daySelections };
  }, [selectedTimeZone]);

  const safeValue = useMemo(() => normalizeAvailability(value), [normalizeAvailability, value]);

  useEffect(() => {
    const parts = getZonedParts(selectedTimeZone, new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    setSelectedDate(todayNoon);
    setViewMonth(new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1));
    setSelectedRangeKeys([ymdKey(todayNoon)]);
    setDragStartKey(null);
    setDragEndKey(null);
    setDragPreviewKeys(new Set());
    setIsDraggingRange(false);
  }, [selectedTimeZone]);

  const nowParts = useMemo(
    () => getZonedParts(selectedTimeZone, new Date(nowTick)),
    [nowTick, selectedTimeZone],
  );

  const todayStart = useMemo(() => {
    const d = new Date(nowParts.year, nowParts.month - 1, nowParts.day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [nowParts.day, nowParts.month, nowParts.year]);

  const zhDays = useMemo(() => ['日', '一', '二', '三', '四', '五', '六'], []);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
    return fmt.format(viewMonth);
  }, [viewMonth]);

  const calendarGrid = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);

  const todayKey = useMemo(() => ymdKey(todayStart), [todayStart]);
  const selectedKey = useMemo(() => ymdKey(selectedDate), [selectedDate]);

  const selectedBlocks = safeValue.daySelections[selectedKey] || [];

  const keyToDateStrict = useCallback((key) => {
    if (!key) return null;
    const parts = key.split('-');
    if (parts.length !== 3) return null;
    const [yRaw, mRaw, dRaw] = parts;
    const y = Number.parseInt(yRaw, 10);
    const m = Number.parseInt(mRaw, 10);
    const d = Number.parseInt(dRaw, 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, []);

  const enumerateKeysInclusive = useCallback((aKey, bKey) => {
    const a = keyToDateStrict(aKey);
    const b = keyToDateStrict(bKey);
    if (!a || !b) return [];
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    const res = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    while (cur.getTime() <= endTs) {
      const t = new Date(cur);
      const key = ymdKey(t);
      if (key >= todayKey) res.push(key);
      cur.setDate(cur.getDate() + 1);
    }
    return res;
  }, [keyToDateStrict, todayKey]);

  const endDragSelection = useCallback(() => {
    if (!isDraggingRange || !dragStartKey || !dragEndKey) {
      setIsDraggingRange(false);
      setDragPreviewKeys(new Set());
      return;
    }
    const keys = enumerateKeysInclusive(dragStartKey, dragEndKey);
    setSelectedRangeKeys(keys);
    const endDate = keyToDateStrict(dragEndKey);
    if (endDate) setSelectedDate(toNoonDate(endDate));
    setIsDraggingRange(false);
    setDragPreviewKeys(new Set());
  }, [dragEndKey, dragStartKey, enumerateKeysInclusive, isDraggingRange, keyToDateStrict]);

  useEffect(() => {
    const onUp = () => {
      if (isDraggingRange) {
        endDragSelection();
        didDragRef.current = true;
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [endDragSelection, isDraggingRange]);

  const disabledBeforeIndex = useMemo(() => {
    if (selectedKey < todayKey) return 95;
    if (selectedKey !== todayKey) return -1;

    const totalMinutes = nowParts.hour * 60 + nowParts.minute + (nowParts.second > 0 ? 1 : 0);
    return Math.floor(Math.max(0, Math.min(1439, totalMinutes)) / 15);
  }, [nowParts.hour, nowParts.minute, nowParts.second, selectedKey, todayKey]);

  const onPrevMonth = useCallback(() => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }, []);

  const onNextMonth = useCallback(() => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }, []);

  const canGoPrevMonth = useMemo(() => {
    const base = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return viewMonth.getTime() > base.getTime();
  }, [todayStart, viewMonth]);

  const setDayBlocks = useCallback((key, nextBlocks) => {
    onChange((prev) => {
      const prevSafe = normalizeAvailability(prev);
      const nextDaySelections = { ...(prevSafe.daySelections || {}) };
      if (Array.isArray(nextBlocks) && nextBlocks.length) nextDaySelections[key] = nextBlocks;
      else delete nextDaySelections[key];
      return { ...prevSafe, daySelections: nextDaySelections };
    });
  }, [normalizeAvailability, onChange]);

  const getDayBlocks = useCallback((key) => safeValue.daySelections[key] || [], [safeValue.daySelections]);

  const handleBlocksChange = useCallback((nextBlocks) => {
    const targets = (selectedRangeKeys && selectedRangeKeys.length) ? selectedRangeKeys : [selectedKey];
    onChange((prev) => {
      const prevSafe = normalizeAvailability(prev);
      const nextDaySelections = { ...(prevSafe.daySelections || {}) };
      for (const k of targets) {
        if (Array.isArray(nextBlocks) && nextBlocks.length) nextDaySelections[k] = nextBlocks;
        else delete nextDaySelections[k];
      }
      return { ...prevSafe, daySelections: nextDaySelections };
    });
  }, [normalizeAvailability, onChange, selectedKey, selectedRangeKeys]);

  if (loading) {
    return <div className="settings-availability-hint">加载中...</div>;
  }

  if (disabled) {
    return <div className="settings-availability-hint">请先登录后设置空余时间</div>;
  }

  return (
      <div className="settings-availability">
      <div className="settings-availability-meta">
        <span>时区：{buildShortUTC(selectedTimeZone)} {selectedTimeZone}</span>
      </div>

      <div className="schedule-sidebar" aria-label="空余时间选择">
        <div className="calendar-card" aria-label="空余时间日历">
          <div className="calendar-header">
            <div className="month-label">{monthLabel}</div>
            <div className="calendar-nav">
              <button
                type="button"
                className="nav-btn"
                aria-label="Prev month"
                disabled={!canGoPrevMonth}
                onClick={onPrevMonth}
              >
                &lsaquo;
              </button>
              <button type="button" className="nav-btn" aria-label="Next month" onClick={onNextMonth}>&rsaquo;</button>
            </div>
          </div>
          <div className="calendar-grid">
            {zhDays.map((d) => (
              <div key={d} className="day-name">{d}</div>
            ))}
            {calendarGrid.map(({ date, outside }) => {
              if (outside) {
                return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
              }
              const isToday = isSameDay(date, todayStart);
              const selected = isSameDay(date, selectedDate);
              const key = ymdKey(date);
              const hasSelection = !!(safeValue.daySelections[key] && safeValue.daySelections[key].length);
              const isPast = key < todayKey;
              const inMultiSelected = (selectedRangeKeys || []).includes(key);
              const inPreview = (dragPreviewKeys && dragPreviewKeys.size)
                ? (dragPreviewKeys.has(key) && !selected && !inMultiSelected)
                : false;
              const cls = [
                'date-cell',
                isToday ? 'today' : '',
                selected ? 'selected' : '',
                isPast ? 'past' : '',
                inMultiSelected ? 'multi-selected' : '',
                inPreview ? 'range-preview' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={cls}
                  onMouseDown={(event) => {
                    if (isPast) return;
                    if (event?.metaKey || event?.ctrlKey) return;
                    setIsDraggingRange(true);
                    setDragStartKey(key);
                    setDragEndKey(key);
                    setDragPreviewKeys(new Set([key]));
                    didDragRef.current = false;
                  }}
                  onMouseEnter={() => {
                    if (!isDraggingRange) return;
                    if (isPast) return;
                    setDragEndKey(key);
                    const keys = enumerateKeysInclusive(dragStartKey || key, key);
                    setDragPreviewKeys(new Set(keys));
                    if (dragStartKey && dragStartKey !== key) didDragRef.current = true;
                  }}
                  onMouseUp={() => {
                    if (isDraggingRange) endDragSelection();
                  }}
                  onClick={(event) => {
                    if (didDragRef.current) { didDragRef.current = false; return; }
                    if (isPast) return;
                    const wantsMultiSelect = !!(event?.metaKey || event?.ctrlKey);
                    setSelectedDate(toNoonDate(date));
                    if (wantsMultiSelect) {
                      setSelectedRangeKeys((prev) => {
                        const list = Array.isArray(prev) ? prev : [];
                        const set = new Set(list);
                        const alreadySelected = set.has(key);
                        if (alreadySelected) {
                          if (set.size <= 1) return [key];
                          set.delete(key);
                        } else {
                          set.add(key);
                        }
                        return Array.from(set).sort();
                      });
                    } else {
                      setSelectedRangeKeys([key]);
                    }
                    if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                      setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                    }
                  }}
                >
                  <span className="date-number">{date.getDate()}</span>
                  {hasSelection && <span className="date-marker" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        <ScheduleTimesPanel
          value={safeValue.sessionDurationHours}
          onChange={(next) => onChange((prev) => ({ ...normalizeAvailability(prev), sessionDurationHours: next }))}
          listRef={timesListRef}
          blocks={selectedBlocks}
          onBlocksChange={handleBlocksChange}
          dayKey={selectedKey}
          getDayBlocks={getDayBlocks}
          setDayBlocks={setDayBlocks}
          disableBeforeIndex={disabledBeforeIndex}
        />
      </div>

      <div className="settings-availability-actions">
        <button
          type="button"
          className="settings-availability-save"
          disabled={saving}
          onClick={() => onSave(safeValue)}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

export default AvailabilityEditor;
