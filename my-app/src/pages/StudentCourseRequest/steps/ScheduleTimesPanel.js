import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_BLOCKS = [];

const ScheduleTimesPanel = React.memo(function ScheduleTimesPanel({
  value,                 // 当前小时数
  onChange,              // (next:number) => void
  listRef,               // 传入你原来的 timesListRef
  min = 0.25,
  max = 10,
  step = 0.25,
  // 受控：当外部需要按“天”管理选择时传入
  blocks,                // 可选，形如 [{start:number,end:number}]
  onBlocksChange,        // 可选，(nextBlocks) => void
  dayKey,                // 可选，'YYYY-MM-DD' 当前日 key
  getDayBlocks,          // 可选，(key)=>blocks，用于跨天读
  setDayBlocks,          // 可选，(key,next)=>void，用于跨天写
  disableBeforeIndex = -1, // 可选，<= 该索引的格子禁用（用于“今天”已过时段）
}) {
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  // ——— 工具 & 边界 ———//

  const ensureQuarter = useCallback((raw) => {
    const n = parseFloat(raw);
    if (!isFinite(n)) return 2;
    const clamped = Math.max(min, Math.min(max, n));
    return Number((Math.round(clamped / 0.25) * 0.25).toFixed(2));
  }, [min, max]);

  const setValue = useCallback((v) => {
    onChange(ensureQuarter(v));
  }, [onChange, ensureQuarter]);

  const adjust = useCallback((delta) => {
    const cur = valueRef.current ?? 0;                   // 永远拿“最新值”
    // 单击时也做一次边界拦截（否则会出现点减号没反应的错觉）
    if ((delta < 0 && cur <= min) || (delta > 0 && cur >= max)) return;
    const next = ensureQuarter(cur + delta);
    onChange(next);
  }, [ensureQuarter, onChange, min, max]);

  // ——— 长按（全局收尾）———//
  const HOLD_DELAY = 300, HOLD_INTERVAL = 150;
  const pressTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const isHoldingRef = useRef(false);
  const isPressedRef = useRef(false);
  const deltaRef = useRef(0);
  const endHandlerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    if (repeatTimerRef.current) { clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; }
    isHoldingRef.current = false;
    isPressedRef.current = false;
  }, []);

  const detachGlobal = useCallback(() => {
    const h = endHandlerRef.current;
    if (!h) return;
    window.removeEventListener('mouseup', h);
    window.removeEventListener('touchend', h);
    window.removeEventListener('touchcancel', h);
    window.removeEventListener('blur', h);
    endHandlerRef.current = null;
  }, []);

  const endGlobal = useCallback(() => {
    if (isPressedRef.current && !isHoldingRef.current) adjust(deltaRef.current); // 单击一次
    detachGlobal();
    clearTimers();
  }, [adjust, clearTimers, detachGlobal]);

  useEffect(() => () => { detachGlobal(); clearTimers(); }, [detachGlobal, clearTimers]);

  const startPress = useCallback((delta) => (e) => {
    if (e.currentTarget.disabled) return;
    e.preventDefault();
    isPressedRef.current = true;
    isHoldingRef.current = false;
    deltaRef.current = delta;

    endHandlerRef.current = endGlobal;
    window.addEventListener('mouseup', endGlobal);
    window.addEventListener('touchend', endGlobal, { passive: true });
    window.addEventListener('touchcancel', endGlobal, { passive: true });
    window.addEventListener('blur', endGlobal);

    pressTimerRef.current = setTimeout(() => {
      if (!isPressedRef.current) return;
      isHoldingRef.current = true;
      repeatTimerRef.current = setInterval(() => {
        const cur = ensureQuarter(valueRef.current ?? 0);
        if ((delta < 0 && cur <= min) || (delta > 0 && cur >= max)) {
          endGlobal();
          return;
        }
        adjust(delta);
      }, HOLD_INTERVAL);
    }, HOLD_DELAY);
  }, [adjust, endGlobal, ensureQuarter, min, max]);

  // ——— 时间列表（保持你的逻辑）———//
  const formatTime = useCallback((h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, []);
  const timeSlots = useMemo(() => {
    const arr = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) arr.push({ h, m, label: formatTime(h, m) });
    return arr;
  }, [formatTime]);

  // 支持多段选择：受控/非受控两种模式
  const isControlledBlocks = Array.isArray(blocks) && typeof onBlocksChange === 'function';
  const [uncontrolledBlocks, setUncontrolledBlocks] = useState([]); // [{start,end}]
  const selectedBlocks = useMemo(
    () => (isControlledBlocks ? (blocks ?? EMPTY_BLOCKS) : uncontrolledBlocks),
    [isControlledBlocks, blocks, uncontrolledBlocks]
  );

  const applyBlocks = useCallback((next) => {
    if (isControlledBlocks) {
      onBlocksChange(next);
    } else {
      setUncontrolledBlocks(next);
    }
  }, [isControlledBlocks, onBlocksChange]);

  // 计算：当前“单次时长”换算成多少个 15 分钟格
  const slotsPerSession = useMemo(() => {
    const SLOT_MINUTES = 15;
    return Math.max(1, Math.round(((value ?? 0) * 60) / SLOT_MINUTES));
  }, [value]);

  // 合并重叠/相邻的区间，保证 selectedBlocks 始终为最简集合
  const mergeBlocks = useCallback((blocks) => {
    if (!blocks || !blocks.length) return [];
    const sorted = [...blocks]
      .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
      .sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur.start <= prev.end + 1) {
        prev.end = Math.max(prev.end, cur.end);
      } else {
        merged.push({ ...cur });
      }
    }
    return merged;
  }, []);

  // 辅助：dayKey <-> Date 与相邻 day key
  const keyToDate = useCallback((key) => {
    if (!key) return null;
    const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, []);
  const dateToKey = useCallback((date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  const neighborKey = useCallback((dir) => {
    // dir: +1 明天 / -1 昨天
    const dt = keyToDate(dayKey);
    if (!dt) return null;
    const n = new Date(dt);
    n.setDate(dt.getDate() + (dir > 0 ? 1 : -1));
    return dateToKey(n);
  }, [dayKey, dateToKey, keyToDate]);

  const handleClickSlot = useCallback((idx) => {
    const len = timeSlots.length;
    const i = Math.max(0, Math.min(len - 1, idx));

    // 若当前索引已在某个已选区间内，则移除整个区间
    const containerIndex = (selectedBlocks || []).findIndex((b) => i >= b.start && i <= b.end);
    if (containerIndex >= 0) {
      const last = len - 1;
      const block = (selectedBlocks || [])[containerIndex];
      const next = (selectedBlocks || []).filter((_, k) => k !== containerIndex);
      applyBlocks(next);

      // 如果该段触及当天末尾且跨到下一天（即下一天 0 点起存在衔接段），连同下一天的首段一起删除
      if (block && block.end === last && typeof getDayBlocks === 'function' && typeof setDayBlocks === 'function') {
        const nxtKey = neighborKey(+1);
        const nxtBlocks = (getDayBlocks && nxtKey) ? (getDayBlocks(nxtKey) || []) : [];
        const idx0 = nxtBlocks.findIndex((b) => 0 >= b.start && 0 <= b.end);
        if (idx0 >= 0) {
          const after = nxtBlocks.filter((_, k) => k !== idx0);
          setDayBlocks(nxtKey, mergeBlocks(after));
        }
      }

      // 如果该段从 0 开始，且昨天结尾有一段与之衔接，也一并删除
      if (block && block.start === 0 && typeof getDayBlocks === 'function' && typeof setDayBlocks === 'function') {
        const prvKey = neighborKey(-1);
        const prvBlocks = (getDayBlocks && prvKey) ? (getDayBlocks(prvKey) || []) : [];
        const idxLast = prvBlocks.findIndex((b) => (len - 1) >= b.start && (len - 1) <= b.end);
        if (idxLast >= 0) {
          const afterPrev = prvBlocks.filter((_, k) => k !== idxLast);
          setDayBlocks(prvKey, mergeBlocks(afterPrev));
        }
      }
      return;
    }

    // 否则按当前“单次时长”新增区间并合并
    const start = i;
    const endWanted = i + slotsPerSession - 1; // 可能越过当天
    const last = len - 1;

    if (endWanted <= last) {
      const end = Math.max(0, Math.min(last, endWanted));
      const next = mergeBlocks([...(selectedBlocks || []), { start, end }]);
      applyBlocks(next);
    } else {
      // 当天部分
      const todayEnd = last;
      const nextToday = mergeBlocks([...(selectedBlocks || []), { start, end: todayEnd }]);
      applyBlocks(nextToday);

      // 溢出到明天的部分：从 0 开始若干格
      if (typeof getDayBlocks === 'function' && typeof setDayBlocks === 'function') {
        const overflowCount = endWanted - last; // 超出的格数
        const nxtKey = neighborKey(+1);
        if (nxtKey) {
          const nxtBlocks = getDayBlocks(nxtKey) || [];
          const nextNxt = mergeBlocks([...(nxtBlocks || []), { start: 0, end: Math.max(0, overflowCount - 1) }]);
          setDayBlocks(nxtKey, nextNxt);
        }
      }
    }
  }, [applyBlocks, getDayBlocks, setDayBlocks, mergeBlocks, neighborKey, selectedBlocks, slotsPerSession, timeSlots]);

  const selectedIndexSet = useMemo(() => {
    const set = new Set();
    for (const b of selectedBlocks) {
      for (let i = b.start; i <= b.end; i++) set.add(i);
    }
    return set;
  }, [selectedBlocks]);

  return (
    <div className="schedule-times-panel">
      <div className="times-panel-header">
        <div className="day-title">可约时长</div>
        <div className="duration-input">
          <button
            type="button"
            className="stepper-btn"
            aria-label="minus 0.25 hour"
            disabled={(value ?? 0) <= min}
            onMouseDown={startPress(-step)}
            onTouchStart={startPress(-step)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span aria-hidden>−</span>
          </button>

          <span className="duration-value" id="sessionDurationValue">{value}</span>

          <button
            type="button"
            className="stepper-btn"
            aria-label="plus 0.25 hour"
            disabled={(value ?? 0) >= max}
            onMouseDown={startPress(+step)}
            onTouchStart={startPress(+step)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span aria-hidden>+</span>
          </button>

          <span className="unit">小时</span>
          <input
            id="sessionDuration"
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => setValue(e.target.value)}
            aria-label="可约时长（小时）"
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="times-list" role="list" ref={listRef}>
        {timeSlots.map((t, idx) => {
      const isSelected = selectedIndexSet.has(idx);
      const isDisabled = disableBeforeIndex >= 0 && idx <= disableBeforeIndex;
      return (
        <button
          key={`${t.h}-${t.m}-${idx}`}
          type="button"
          className={`time-slot ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
          data-index={idx}
          data-time-slot={t.label}
          onClick={isDisabled ? undefined : () => handleClickSlot(idx)}
          disabled={isDisabled}
          aria-pressed={isSelected && !isDisabled}   // ✅ 合法（按钮/role=button 可用）
        >
              <span className="dot" aria-hidden />
              <span className="time-text">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export { ScheduleTimesPanel };
export default ScheduleTimesPanel;
