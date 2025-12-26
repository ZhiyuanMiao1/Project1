import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import AvailabilityEditor from '../AvailabilityEditor';
import {
  buildShortUTC,
  buildTimeZoneOptions,
  convertSelectionsBetweenTimeZones,
  extractCityName,
  orderTimeZoneOptionsAroundSelected,
} from '../../StudentCourseRequest/steps/timezoneUtils';

const DEGREE_OPTIONS = [
  { value: '本科', label: '本科' },
  { value: '硕士', label: '硕士' },
  { value: 'PhD', label: 'PhD' },
];

function DegreeSelect({ id, value, onChange }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const idx = Math.max(0, DEGREE_OPTIONS.findIndex((o) => o.value === value));
    const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
    if (!itemEl) return;
    const listH = listEl.clientHeight;
    const top = itemEl.offsetTop;
    const h = itemEl.offsetHeight;
    const target = top - Math.max(0, (listH - h) / 2);
    try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
  }, [open, value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!open) return;
      const btn = buttonRef.current;
      const list = listRef.current;
      if (btn && btn.contains(e.target)) return;
      if (list && list.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectedLabel = useMemo(() => DEGREE_OPTIONS.find((o) => o.value === value)?.label || '', [value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    const i = Math.max(0, DEGREE_OPTIONS.findIndex((o) => o.value === value));
    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.min(DEGREE_OPTIONS.length - 1, i + 1)].value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.max(0, i - 1)].value); }
    else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
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
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="mx-select__popover">
          <ul ref={listRef} role="listbox" aria-labelledby={id} className="mx-select__list">
            {DEGREE_OPTIONS.map((opt, index) => {
              const selected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  className={`mx-select__option ${selected ? 'selected' : ''}`}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
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

function TimeZoneSelect({ id, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
    if (!itemEl) return;
    const listH = listEl.clientHeight;
    const top = itemEl.offsetTop;
    const h = itemEl.offsetHeight;
    const target = top - Math.max(0, (listH - h) / 2);
    try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
  }, [open, options, value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!open) return;
      const btn = buttonRef.current;
      const list = listRef.current;
      if (btn && btn.contains(e.target)) return;
      if (list && list.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label || '', [options, value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    const cur = Math.max(0, options.findIndex((o) => o.value === value));
    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(options[Math.min(options.length - 1, cur + 1)].value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(options[Math.max(0, cur - 1)].value); }
    else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="mx-select mx-select--timezone" data-open={open ? 'true' : 'false'}>
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
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="mx-select__popover">
          <ul ref={listRef} role="listbox" aria-labelledby={id} className="mx-select__list">
            {options.map((opt, index) => {
              const selected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  className={`mx-select__option ${selected ? 'selected' : ''}`}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
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

function ProfileSection({
  studentIdValue,
  mentorIdValue,
  emailValue,
  degreeValue,
  schoolValue,
  canEditEducationProfile,
  savingAccountProfile,
  accountProfile,
  onSaveAccountProfilePatch,
  availability,
  availabilityStatus,
  savingAvailability,
  availabilitySummary,
  isLoggedIn,
  onAvailabilityChange,
  onPersistAvailability,
}) {
  const [editingDegree, setEditingDegree] = useState(false);
  const [degreeDraft, setDegreeDraft] = useState('');
  const [editingSchool, setEditingSchool] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState('');
  const [editingTimeZone, setEditingTimeZone] = useState(false);
  const [timeZoneDraft, setTimeZoneDraft] = useState('');
  const [availabilityExpanded, setAvailabilityExpanded] = useState(false);

  const canEditTimeZone = isLoggedIn && availabilityStatus === 'loaded';
  const availabilityTimeZone = useMemo(() => {
    const raw = typeof availability?.timeZone === 'string' ? availability.timeZone.trim() : '';
    return raw || 'Asia/Shanghai';
  }, [availability?.timeZone]);

  const timeZoneCity = useMemo(() => extractCityName(availabilityTimeZone), [availabilityTimeZone]);
  const timeZoneShort = useMemo(() => buildShortUTC(availabilityTimeZone), [availabilityTimeZone]);
  const timeZoneDisplayValue = useMemo(() => {
    if (!isLoggedIn) return '请先登录';
    if (availabilityStatus === 'loading') return '加载中...';
    if (availabilityStatus === 'error') return '加载失败';
    return `${timeZoneShort}（${timeZoneCity || '时区'}）`;
  }, [availabilityStatus, isLoggedIn, timeZoneCity, timeZoneShort]);

  const orderedTimeZoneOptions = useMemo(() => {
    const now = new Date();
    return orderTimeZoneOptionsAroundSelected(
      buildTimeZoneOptions(now),
      (timeZoneDraft || availabilityTimeZone),
      now
    );
  }, [availabilityTimeZone, timeZoneDraft]);

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-title">StudentID</div>
          <div className="settings-row-value">{studentIdValue}</div>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-title">MentorID</div>
          <div className="settings-row-value">{mentorIdValue}</div>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-title">邮箱</div>
          <div className="settings-row-value">{emailValue}</div>
        </div>
      </div>

      <div className={`settings-row ${editingDegree ? 'settings-row--overlay' : ''}`}>
        <div className="settings-row-main">
          <div className="settings-row-title">学历</div>
          <div className={`settings-row-value ${canEditEducationProfile && editingDegree ? 'settings-row-value--interactive' : ''}`}>
            {canEditEducationProfile && editingDegree ? (
              <DegreeSelect
                id="mx-degree-inline"
                value={degreeDraft || ''}
                onChange={(v) => setDegreeDraft(v)}
              />
            ) : (
              degreeValue
            )}
          </div>
        </div>
        {canEditEducationProfile && (
          <button
            type="button"
            className="settings-action"
            disabled={savingAccountProfile}
            onClick={() => {
              if (!editingDegree) {
                setEditingDegree(true);
                setDegreeDraft(accountProfile.degree || '');
                return;
              }
              onSaveAccountProfilePatch({ degree: degreeDraft || '' });
              setEditingDegree(false);
            }}
          >
            {editingDegree ? '保存' : '编辑'}
          </button>
        )}
      </div>

      <div className={`settings-row ${editingSchool ? 'settings-row--overlay' : ''}`}>
        <div className="settings-row-main">
          <div className="settings-row-title">学校</div>
          <div className={`settings-row-value ${canEditEducationProfile && editingSchool ? 'settings-row-value--interactive' : ''}`}>
            {canEditEducationProfile && editingSchool ? (
              <input
                type="text"
                className="settings-inline-input"
                value={schoolDraft}
                placeholder="可选填"
                onChange={(e) => setSchoolDraft(e.target.value)}
              />
            ) : (
              schoolValue
            )}
          </div>
        </div>
        {canEditEducationProfile && (
          <button
            type="button"
            className="settings-action"
            disabled={savingAccountProfile}
            onClick={() => {
              if (!editingSchool) {
                setEditingSchool(true);
                setSchoolDraft(accountProfile.school || '');
                return;
              }
              onSaveAccountProfilePatch({ school: schoolDraft || '' });
              setEditingSchool(false);
            }}
          >
            {editingSchool ? '保存' : '编辑'}
          </button>
        )}
      </div>

      <div className={`settings-row ${editingTimeZone ? 'settings-row--overlay' : ''}`}>
        <div className="settings-row-main">
          <div className="settings-row-title">时区</div>
          <div className={`settings-row-value ${canEditTimeZone && editingTimeZone ? 'settings-row-value--interactive' : ''}`}>
            {canEditTimeZone && editingTimeZone ? (
              <TimeZoneSelect
                id="mx-timezone-inline"
                value={timeZoneDraft || availabilityTimeZone}
                onChange={(v) => setTimeZoneDraft(v)}
                options={orderedTimeZoneOptions}
              />
            ) : (
              timeZoneDisplayValue
            )}
          </div>
        </div>
        {canEditTimeZone && (
          <button
            type="button"
            className="settings-action"
            disabled={savingAvailability}
            onClick={async () => {
              if (!editingTimeZone) {
                setEditingTimeZone(true);
                setTimeZoneDraft(availabilityTimeZone);
                return;
              }

              const nextTimeZone = timeZoneDraft || availabilityTimeZone;
              const nextDaySelections = convertSelectionsBetweenTimeZones(
                availability?.daySelections || {},
                availabilityTimeZone,
                nextTimeZone
              );
              const ok = await onPersistAvailability(
                {
                  ...(availability || { timeZone: availabilityTimeZone, sessionDurationHours: 2, daySelections: {} }),
                  timeZone: nextTimeZone,
                  daySelections: nextDaySelections,
                },
                { successMessage: '时区已保存' }
              );
              if (ok) setEditingTimeZone(false);
            }}
          >
            {editingTimeZone ? '保存' : '编辑'}
          </button>
        )}
      </div>

      <div className="settings-accordion-item">
        <button
          type="button"
          className="settings-accordion-trigger"
          aria-expanded={availabilityExpanded}
          aria-controls="settings-availability"
          onClick={() => setAvailabilityExpanded((prev) => !prev)}
        >
          <div className="settings-row-main">
            <div className="settings-row-title">空余时间</div>
            <div className="settings-row-value">{availabilitySummary}</div>
          </div>
          <span className="settings-accordion-icon" aria-hidden="true">
            <FiChevronDown size={18} />
          </span>
        </button>
        <div
          id="settings-availability"
          className="settings-accordion-panel"
          hidden={!availabilityExpanded}
        >
          <AvailabilityEditor
            value={availability}
            disabled={!isLoggedIn}
            loading={availabilityStatus === 'loading'}
            saving={savingAvailability}
            onChange={onAvailabilityChange}
            onSave={(next) => onPersistAvailability(next)}
          />
        </div>
      </div>
    </>
  );
}

export default ProfileSection;

