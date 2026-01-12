import React, { useEffect, useMemo } from 'react';
import ScheduleTimesPanel from './ScheduleTimesPanel';
import TimeZoneSelect from './TimeZoneSelect';

const normalizeBlocksForIntersect = (rawBlocks) => {
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return [];
  const cleaned = rawBlocks
    .map((b) => ({ start: Number(b?.start), end: Number(b?.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
    .map((b) => ({
      start: Math.max(0, Math.min(95, Math.floor(Math.min(b.start, b.end)))),
      end: Math.max(0, Math.min(95, Math.floor(Math.max(b.start, b.end)))),
    }));
  if (cleaned.length <= 1) return cleaned;
  const sorted = [...cleaned].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 1) prev.end = Math.max(prev.end, cur.end);
    else merged.push({ ...cur });
  }
  return merged;
};

const intersectAvailabilityBlocks = (a, b) => {
  const listA = normalizeBlocksForIntersect(a);
  const listB = normalizeBlocksForIntersect(b);
  if (listA.length === 0 || listB.length === 0) return [];

  const out = [];
  let i = 0;
  let j = 0;
  while (i < listA.length && j < listB.length) {
    const aStart = listA[i].start;
    const aEnd = listA[i].end;
    const bStart = listB[j].start;
    const bEnd = listB[j].end;

    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    if (start <= end) out.push({ start, end });

    if (aEnd < bEnd) i += 1;
    else j += 1;
  }

  return normalizeBlocksForIntersect(out);
};

const unionAvailabilityBlocks = (a, b) => normalizeBlocksForIntersect([...normalizeBlocksForIntersect(a), ...normalizeBlocksForIntersect(b)]);

const subtractAvailabilityBlocks = (base, remove) => {
  const baseList = normalizeBlocksForIntersect(base);
  const removeList = normalizeBlocksForIntersect(remove);
  if (baseList.length === 0) return [];
  if (removeList.length === 0) return baseList;

  const out = [];
  let j = 0;
  for (const seg of baseList) {
    let curStart = seg.start;
    const curEnd = seg.end;

    while (j < removeList.length && removeList[j].end < curStart) j += 1;

    let k = j;
    while (k < removeList.length && removeList[k].start <= curEnd) {
      const r = removeList[k];
      if (r.start > curStart) out.push({ start: curStart, end: Math.min(curEnd, r.start - 1) });
      curStart = Math.max(curStart, r.end + 1);
      if (curStart > curEnd) break;
      k += 1;
    }

    if (curStart <= curEnd) out.push({ start: curStart, end: curEnd });
  }

  return normalizeBlocksForIntersect(out);
};

function ScheduleStepContent({
  availability,
  onAvailabilityChange,
  orderedTimeZoneOptions,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  zhDays,
  calendarGrid,
  tzToday,
  selectedDate,
  setSelectedDate,
  viewMonth,
  todayStart,
  isSameDay,
  setViewMonth,
}) {
  return (
    <div className="step-field-stack">
      <label className="field-label" htmlFor="availability">选择授课时间</label>
      <TimeZoneSelect
        id="availability"
        value={availability}
        onChange={onAvailabilityChange}
        options={orderedTimeZoneOptions}
      />
      <div className="calendar-card" aria-label="可授课时间日历">
        <div className="calendar-header">
          <div className="month-label">{monthLabel}</div>
          <div className="calendar-nav">
            <button                                           // 上一月按钮
              type="button"                                   // 按钮类型
              className="nav-btn"                             // 样式类
              aria-label="Prev month"                         // 无障碍描述
              disabled={viewMonth.getFullYear() === todayStart.getFullYear() && viewMonth.getMonth() === todayStart.getMonth()} // 控制禁用状态
              onClick={onPrevMonth}                           // 使用封装好的上一月函数
            >&lsaquo;</button>

            <button                                           // 下一月按钮
              type="button"                                   // 按钮类型
              className="nav-btn"                             // 样式类
              aria-label="Next month"                         // 无障碍描述
              onClick={onNextMonth}                           // 使用封装好的下一月函数
            >&rsaquo;</button>

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
            const isToday = isSameDay(date, tzToday);
            const selected = isSameDay(date, selectedDate);
            const isPast = (() => {
              const d = new Date(date);
              d.setHours(0, 0, 0, 0);
              return d.getTime() < todayStart.getTime();
            })();
            const cls = [
              'date-cell',
              isToday ? 'today' : '',
              selected ? 'selected' : '',
              isPast ? 'past' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={date.toISOString()}
                type="button"
                className={cls}
                onClick={() => {
                  setSelectedDate(date);
                  if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }
                }}
              >
                <span className="date-number">{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScheduleStepSidebar({
  monthLabel,
  monthSlideKey,
  monthSlideDir,
  zhDays,
  calendarGrid,
  tzToday,
  selectedDate,
  selectedRangeKeys,
  setSelectedRangeKeys,
  todayStart,
  isSameDay,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  setSelectedDate,
  setViewMonth,
  daySelections,
  setDaySelections,
  dragPreviewKeys,
  setDragPreviewKeys,
  enumerateKeysInclusive,
  dragStartKey,
  setDragStartKey,
  dragEndKey,
  setDragEndKey,
  isDraggingRange,
  setIsDraggingRange,
  endDragSelection,
  didDragRef,
  ymdKey,
  timesListRef,
  sessionDurationHours,
  setFormData,
  getDayBlocks,
  setDayBlocks,
  selectedTimeZone,
  zonedTodayKey,
  zonedNowMinutes,
}) {
  const effectiveSelectedDate = selectedDate || tzToday;
  const selectedDateKeyLocal = effectiveSelectedDate ? ymdKey(effectiveSelectedDate) : '';
  // `selectedDate` is stored as a local Date (noon) for stable calendar rendering.
  // Treat the displayed YYYY-MM-DD as canonical; do not re-derive the day by
  // interpreting the Date as an absolute instant in another timezone.
  const selectedDateKeyInTz = selectedDateKeyLocal;

  const selectedDayBlocks = useMemo(
    () => (selectedDateKeyLocal && daySelections[selectedDateKeyLocal]) || [],
    [daySelections, selectedDateKeyLocal]
  );
  const selectedKeys = useMemo(() => {
    const keys = Array.isArray(selectedRangeKeys) ? selectedRangeKeys.filter((k) => typeof k === 'string' && k) : [];
    if (keys.length) return keys;
    return selectedDateKeyLocal ? [selectedDateKeyLocal] : [];
  }, [selectedDateKeyLocal, selectedRangeKeys]);

  const multiDayCommonBlocks = useMemo(() => {
    if (selectedKeys.length <= 1) return [];
    let common = null;
    for (const key of selectedKeys) {
      const dayBlocks = daySelections?.[key] || [];
      common = common == null ? normalizeBlocksForIntersect(dayBlocks) : intersectAvailabilityBlocks(common, dayBlocks);
      if (!common || common.length === 0) return [];
    }
    return common || [];
  }, [daySelections, selectedKeys]);

  const displayedBlocks = useMemo(() => {
    if (selectedKeys.length > 1) return multiDayCommonBlocks;
    return selectedDayBlocks;
  }, [multiDayCommonBlocks, selectedDayBlocks, selectedKeys.length]);
  const SLOT_MINUTES = 15;
  const isTodaySelected = !!selectedDateKeyInTz && selectedDateKeyInTz === zonedTodayKey;
  const isPastDay = useMemo(() => {
    if (!selectedDateKeyInTz || !zonedTodayKey) return false;
    return selectedDateKeyInTz < zonedTodayKey;
  }, [selectedDateKeyInTz, zonedTodayKey]);
  const disabledBeforeIndex = (() => {
    if (isPastDay) return 95; // 全禁用
    if (!isTodaySelected) return -1;
    const mins = Number.isFinite(zonedNowMinutes) ? zonedNowMinutes : 0;
    return Math.floor(mins / SLOT_MINUTES);
  })();

  useEffect(() => {
    const idxToLabel = (idx) => {
      const h = Math.floor(idx / 4);
      const m = (idx % 4) * 15;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const minutesToLabel = (mins) => {
      const clamped = Math.max(0, Math.min(1439, mins || 0));
      const h = Math.floor(clamped / 60);
      const m = clamped % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const lastDisabledLabel = disabledBeforeIndex >= 0 ? idxToLabel(disabledBeforeIndex) : null;
    const firstEnabledLabel = disabledBeforeIndex >= 0 && disabledBeforeIndex < 95 ? idxToLabel(disabledBeforeIndex + 1) : null;
    console.info('[Schedule][debug] 时区禁用界线', {
      selectedTimeZone,
      selectedDateKey: selectedDateKeyLocal,
      selectedDateKeyInTz,
      isTodaySelected,
      zonedNow: minutesToLabel(zonedNowMinutes),
      disabledThroughIndex: disabledBeforeIndex,
      disabledThroughLabel: lastDisabledLabel,
      firstEnabledLabel,
    });
  }, [disabledBeforeIndex, isTodaySelected, selectedDateKeyLocal, selectedDateKeyInTz, selectedTimeZone, zonedNowMinutes]);

  return (
    <div className="schedule-sidebar">
      <div className="calendar-card slim" aria-label="可授课时间日历">
        <div className="calendar-header">
          <div className="month-label">{monthLabel}</div>
          <div className="calendar-nav">
            <button type="button" className="nav-btn" aria-label="Prev month" disabled={viewMonth.getFullYear() === todayStart.getFullYear() && viewMonth.getMonth() === todayStart.getMonth()} onClick={onPrevMonth}>&lsaquo;</button>
            <button type="button" className="nav-btn" aria-label="Next month" onClick={onNextMonth}>&rsaquo;</button>
          </div>
        </div>
        <div
          key={monthSlideKey}                           // 每次切月都改变 key，强制重挂载以触发动画
          className={`calendar-grid ${                  // 绑定基础类与方向动画类
            monthSlideDir === 'left'                    // 如果方向是 'left'（点“下一月”）
              ? 'slide-in-left'                         // 新月份从右向中滑入
              : monthSlideDir === 'right'               // 如果方向是 'right'（点“上一月”）
                ? 'slide-in-right'                      // 新月份从左向中滑入
                : ''                                    // 没有方向时，不加动画类
          }`}
        >
          {zhDays.map((d) => (
            <div key={d} className="day-name">{d}</div>
          ))}
          {calendarGrid.map(({ date, outside }) => {
            if (outside) {
              return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
            }
            const isToday = isSameDay(date, tzToday);
            const key = ymdKey(date);
            const selected = isSameDay(date, selectedDate);
            const hasSelection = !!(daySelections[ymdKey(date)] && daySelections[ymdKey(date)].length);
            const isPast = (() => {
              const d = new Date(date);
              d.setHours(0, 0, 0, 0);
              return d.getTime() < todayStart.getTime();
            })();
            const inMultiSelected = (selectedRangeKeys || []).includes(key);
            // Avoid preview style overriding selected/multi-selected cells
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
                  const k = ymdKey(date);
                  setIsDraggingRange(true);
                  setDragStartKey(k);
                  setDragEndKey(k);
                  setDragPreviewKeys(new Set([k]));
                  didDragRef.current = false;
                }}
                onMouseEnter={() => {
                  if (!isDraggingRange) return;
                  if (isPast) return;
                  const k = ymdKey(date);
                  setDragEndKey(k);
                  const keys = enumerateKeysInclusive(dragStartKey || k, k);
                  setDragPreviewKeys(new Set(keys));
                  if (dragStartKey && dragStartKey !== k) didDragRef.current = true;
                }}
                onMouseUp={() => {
                  if (isDraggingRange) endDragSelection();
                }}
                onClick={(event) => {
                  if (didDragRef.current) { didDragRef.current = false; return; }
                  if (isPast) return;
                  setSelectedDate(date);
                  const k = ymdKey(date);
                  const wantsMultiSelect = !!(event?.metaKey || event?.ctrlKey);
                  if (wantsMultiSelect) {
                    setSelectedRangeKeys((prev) => {
                      const list = Array.isArray(prev) ? prev : [];
                      const set = new Set(list);
                      const alreadySelected = set.has(k);
                      if (alreadySelected) {
                        if (set.size <= 1) return [k];
                        set.delete(k);
                      } else {
                        set.add(k);
                      }
                      return Array.from(set).sort();
                    });
                  } else {
                    setSelectedRangeKeys([k]);
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
      {(() => {
        const key = selectedDateKeyLocal;
        const handleBlocksChange = (next) => {
          const targets = selectedKeys.length ? selectedKeys : [key];
          setDaySelections((prev) => {
            const patch = { ...prev };
            if (targets.length > 1) {
              const nextCommon = normalizeBlocksForIntersect(next);
              let commonBefore = null;
              for (const k of targets) {
                const dayBlocks = prev?.[k] || [];
                commonBefore = commonBefore == null ? normalizeBlocksForIntersect(dayBlocks) : intersectAvailabilityBlocks(commonBefore, dayBlocks);
                if (!commonBefore || commonBefore.length === 0) {
                  commonBefore = [];
                  break;
                }
              }
              const commonList = commonBefore || [];
              const added = subtractAvailabilityBlocks(nextCommon, commonList);
              const removed = subtractAvailabilityBlocks(commonList, nextCommon);

              for (const k of targets) {
                const existing = prev?.[k] || [];
                let nextForDay = normalizeBlocksForIntersect(existing);
                if (added.length) nextForDay = unionAvailabilityBlocks(nextForDay, added);
                if (removed.length) nextForDay = subtractAvailabilityBlocks(nextForDay, removed);
                if (nextForDay.length) patch[k] = nextForDay;
                else delete patch[k];
              }
              return patch;
            }

            const singleKey = targets[0] || key;
            if (Array.isArray(next) && next.length) patch[singleKey] = next;
            else delete patch[singleKey];
            return patch;
          });
        };
        return (
          <ScheduleTimesPanel
            value={sessionDurationHours}
            onChange={(next) => setFormData((prev) => ({ ...prev, sessionDurationHours: next }))}
            listRef={timesListRef}
            blocks={displayedBlocks}
            onBlocksChange={handleBlocksChange}
            dayKey={key}
            getDayBlocks={getDayBlocks}
            setDayBlocks={setDayBlocks}
            disableBeforeIndex={disabledBeforeIndex}
          />
        );
      })()}
    </div>
  );
}

export { ScheduleStepContent, ScheduleStepSidebar };
export default ScheduleStepContent;
