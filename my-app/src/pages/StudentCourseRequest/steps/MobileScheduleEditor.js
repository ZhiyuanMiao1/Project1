import React, { useCallback, useMemo, useState } from 'react';
import { FaChevronRight, FaPlus, FaTrashAlt } from 'react-icons/fa';
import { useI18n } from '../../../i18n/language';
import { addDaysToKey, keyToDate, mergeBlocksList } from './timezoneUtils';
import WheelPickerSheet from './WheelPickerSheet';

const SLOT_MINUTES = 15;
const SLOT_COUNT = 96;
const DATE_HORIZON_DAYS = 365;

const formatBoundaryTime = (boundaryIndex) => {
  const safeIndex = Math.max(0, Math.min(SLOT_COUNT, Number(boundaryIndex) || 0));
  if (safeIndex === SLOT_COUNT) return '24:00';
  const totalMinutes = safeIndex * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const removeExactBlock = (blocks, start, end) => {
  let removed = false;
  return (Array.isArray(blocks) ? blocks : []).filter((block) => {
    if (!removed && block.start === start && block.end === end) {
      removed = true;
      return false;
    }
    return true;
  });
};

function MobileScheduleEditor({
  daySelections,
  setDaySelections,
  sessionDurationHours,
  zonedTodayKey,
  zonedNowMinutes,
}) {
  const { language, t } = useI18n();
  const [activeSheet, setActiveSheet] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [draftDate, setDraftDate] = useState(zonedTodayKey);
  const [draftStart, setDraftStart] = useState(36);
  const [draftEnd, setDraftEnd] = useState(44);

  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  const safeTodayKey = zonedTodayKey || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();
  const disabledTodayThrough = Math.max(-1, Math.min(95, Math.floor((Number(zonedNowMinutes) || 0) / SLOT_MINUTES)));
  const durationSlots = Math.max(1, Math.min(40, Math.round((Number(sessionDurationHours) || 2) * 4)));

  const dateOptions = useMemo(() => {
    const keys = [];
    for (let offset = 0; offset <= DATE_HORIZON_DAYS; offset += 1) {
      keys.push(addDaysToKey(safeTodayKey, offset));
    }
    if (editingBlock?.date && !keys.includes(editingBlock.date)) keys.push(editingBlock.date);
    keys.sort();
    const todayDate = keyToDate(safeTodayKey);
    const todayYear = todayDate?.getFullYear();
    return keys.map((key) => {
      const date = keyToDate(key);
      const includeYear = date?.getFullYear() !== todayYear;
      const label = date
        ? new Intl.DateTimeFormat(locale, {
          ...(includeYear ? { year: 'numeric' } : null),
          month: 'short',
          day: 'numeric',
          weekday: 'short',
        }).format(date)
        : key;
      return { value: key, label };
    });
  }, [editingBlock?.date, locale, safeTodayKey]);

  const startOptions = useMemo(() => Array.from({ length: SLOT_COUNT }, (_, index) => ({
    value: index,
    label: formatBoundaryTime(index),
    disabled: draftDate === safeTodayKey && index <= disabledTodayThrough,
  })), [disabledTodayThrough, draftDate, safeTodayKey]);

  const endOptions = useMemo(() => Array.from({ length: SLOT_COUNT }, (_, index) => {
    const boundary = index + 1;
    return {
      value: boundary,
      label: formatBoundaryTime(boundary),
      disabled: boundary <= draftStart,
    };
  }), [draftStart]);

  const groups = useMemo(() => Object.entries(daySelections || {})
    .filter(([, blocks]) => Array.isArray(blocks) && blocks.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, blocks]) => ({
      date,
      blocks: [...blocks].sort((a, b) => a.start - b.start),
    })), [daySelections]);

  const formatDateHeading = useCallback((key) => {
    const date = keyToDate(key);
    if (!date) return key;
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(date);
  }, [locale]);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
    setEditingBlock(null);
  }, []);

  const setDateAndRepairTime = (nextDate) => {
    setDraftDate(nextDate);
    const earliestStart = nextDate === safeTodayKey ? disabledTodayThrough + 1 : 0;
    if (draftStart < earliestStart) {
      const nextStart = Math.min(95, Math.max(0, earliestStart));
      setDraftStart(nextStart);
      setDraftEnd(Math.min(96, nextStart + durationSlots));
    }
  };

  const openAddSheet = () => {
    let nextDate = safeTodayKey;
    let nextStart = Math.max(36, disabledTodayThrough + 1);
    if (nextStart > 95) {
      nextDate = addDaysToKey(safeTodayKey, 1);
      nextStart = 36;
    }
    setEditingBlock(null);
    setDraftDate(nextDate);
    setDraftStart(nextStart);
    setDraftEnd(Math.min(96, nextStart + durationSlots));
    setActiveSheet('availability');
  };

  const openEditSheet = (date, block) => {
    setEditingBlock({ date, start: block.start, end: block.end });
    setDraftDate(date);
    setDraftStart(block.start);
    setDraftEnd(Math.min(96, block.end + 1));
    setActiveSheet('availability');
  };

  const saveAvailability = () => {
    if (!draftDate || draftEnd <= draftStart) return;
    const nextBlock = { start: draftStart, end: draftEnd - 1 };
    setDaySelections((previous) => {
      const next = { ...(previous || {}) };
      if (editingBlock) {
        const remaining = removeExactBlock(next[editingBlock.date], editingBlock.start, editingBlock.end);
        if (remaining.length) next[editingBlock.date] = remaining;
        else delete next[editingBlock.date];
      }
      next[draftDate] = mergeBlocksList([...(next[draftDate] || []), nextBlock]);
      return next;
    });
    closeSheet();
  };

  const deleteAvailability = (date, block) => {
    setDaySelections((previous) => {
      const next = { ...(previous || {}) };
      const remaining = removeExactBlock(next[date], block.start, block.end);
      if (remaining.length) next[date] = remaining;
      else delete next[date];
      return next;
    });
  };

  const availabilityColumns = [
    {
      id: 'date',
      label: t('courseRequest.schedule.mobile.date', '日期'),
      options: dateOptions,
      value: draftDate,
      onChange: setDateAndRepairTime,
    },
    {
      id: 'start',
      label: t('courseRequest.schedule.mobile.start', '开始'),
      options: startOptions,
      value: draftStart,
      onChange: (nextStart) => {
        setDraftStart(nextStart);
        if (draftEnd <= nextStart) setDraftEnd(Math.min(96, nextStart + durationSlots));
      },
    },
    {
      id: 'end',
      label: t('courseRequest.schedule.mobile.end', '结束'),
      options: endOptions,
      value: draftEnd,
      onChange: setDraftEnd,
    },
  ];

  return (
    <div className="mobile-schedule-editor">
      <section className="mobile-availability-section" aria-labelledby="mobile-availability-title">
        <div className="mobile-availability-header">
          <div>
            <h2 id="mobile-availability-title">{t('courseRequest.schedule.mobile.availability', '可授课时间')}</h2>
            <p>{t('courseRequest.schedule.mobile.availabilityHint', '可添加多个日期和时间段')}</p>
          </div>
          <button type="button" className="mobile-availability-add" onClick={openAddSheet}>
            <FaPlus aria-hidden />
            {t('courseRequest.schedule.mobile.add', '添加')}
          </button>
        </div>

        <div className={`mobile-availability-list ${groups.length ? '' : 'is-empty'}`}>
          {groups.length ? groups.map((group) => (
            <div className="mobile-availability-day" key={group.date}>
              <div className="mobile-availability-day__title">{formatDateHeading(group.date)}</div>
              <div className="mobile-availability-day__times">
                {group.blocks.map((block) => (
                  <div className="mobile-availability-item" key={`${group.date}-${block.start}-${block.end}`}>
                    <button
                      type="button"
                      className="mobile-availability-item__edit"
                      onClick={() => openEditSheet(group.date, block)}
                      aria-label={`${formatDateHeading(group.date)} ${formatBoundaryTime(block.start)} - ${formatBoundaryTime(block.end + 1)}`}
                    >
                      <span>{formatBoundaryTime(block.start)} – {formatBoundaryTime(block.end + 1)}</span>
                      <FaChevronRight aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="mobile-availability-item__delete"
                      aria-label={t('courseRequest.schedule.mobile.delete', '删除该时间段')}
                      onClick={() => deleteAvailability(group.date, block)}
                    >
                      <FaTrashAlt aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="mobile-availability-empty">
              <strong>{t('courseRequest.schedule.mobile.emptyTitle', '还没有添加可授课时间')}</strong>
            </div>
          )}
        </div>
      </section>

      <WheelPickerSheet
        open={activeSheet === 'availability'}
        title={editingBlock
          ? t('courseRequest.schedule.mobile.editTime', '编辑可授课时间')
          : t('courseRequest.schedule.mobile.addTime', '添加可授课时间')}
        columns={availabilityColumns}
        onCancel={closeSheet}
        onConfirm={saveAvailability}
        confirmDisabled={!draftDate || draftEnd <= draftStart}
        cancelLabel={t('common.cancel', '取消')}
        confirmLabel={t('common.done', '完成')}
      />
    </div>
  );
}

export {
  DATE_HORIZON_DAYS,
  SLOT_COUNT,
  SLOT_MINUTES,
  formatBoundaryTime,
};
export default MobileScheduleEditor;
