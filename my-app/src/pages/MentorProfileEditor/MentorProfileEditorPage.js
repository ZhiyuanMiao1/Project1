import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MentorProfileEditorPage.css';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';

// ===== Time zone helpers (shared style/logic with student step 3) =====
const TIMEZONE_NAME_OVERRIDES = {
  'Asia/Shanghai': '中国标准时间',
  'Asia/Tokyo': '日本标准时间',
  'Asia/Bangkok': '泰国时间',
  'Asia/Dubai': '海湾标准时间',
  'Europe/London': '格林尼治标准时间',
  'Europe/Berlin': '中欧标准时间',
  'Europe/Moscow': '莫斯科时间',
  'America/Los_Angeles': '美国太平洋时间',
  'America/Denver': '美国山地时间',
  'America/Chicago': '美国中部时间',
  'America/New_York': '美国东部时间',
  'Australia/Brisbane': '澳大利亚东部时间',
  'Pacific/Auckland': '新西兰标准时间',
  'Pacific/Honolulu': '夏威夷时间',
  'Pacific/Pago_Pago': '萨摩亚时间',
  'Atlantic/Azores': '亚速尔群岛时间',
  'Atlantic/South_Georgia': '南乔治亚时间',
  'Africa/Johannesburg': '南非时间',
  'Asia/Karachi': '巴基斯坦标准时间',
  'Asia/Dhaka': '孟加拉国标准时间',
  'Pacific/Guadalcanal': '所罗门群岛时间',
  'America/Halifax': '加拿大大西洋时间',
  'America/Sao_Paulo': '巴西时间',
};

const FALLBACK_TIMEZONES = [
  'Pacific/Pago_Pago', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Halifax',
  'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Europe/London',
  'Europe/Berlin', 'Africa/Johannesburg', 'Europe/Moscow', 'Asia/Dubai',
  'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Brisbane', 'Pacific/Guadalcanal', 'Pacific/Auckland',
];

const extractCityName = (tz) => {
  const segs = (tz || '').split('/');
  return segs.length > 1 ? segs.slice(1).join(' / ').replace(/_/g, ' ') : tz;
};
const getTimeZoneOffsetMinutes = (timeZone, referenceDate = new Date()) => {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(referenceDate).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(iso);
    return Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);
  } catch { return 0; }
};
const formatTimeZoneOffset = (timeZone, referenceDate = new Date()) => {
  const off = getTimeZoneOffsetMinutes(timeZone, referenceDate);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `(UTC${sign}${h}:${m})`;
};
const buildTimeZoneLabel = (timeZone, referenceDate = new Date()) => {
  const offset = formatTimeZoneOffset(timeZone, referenceDate);
  const city = extractCityName(timeZone);
  const zh = TIMEZONE_NAME_OVERRIDES[timeZone];
  const base = zh || city || timeZone;
  const suffix = zh && city && zh !== city ? ` - ${city}` : '';
  return `${offset} ${base}${suffix}`;
};
const buildTimeZoneOptions = (referenceDate = new Date()) => (
  FALLBACK_TIMEZONES.map((tz) => ({ value: tz, label: buildTimeZoneLabel(tz, referenceDate) }))
);
const orderTimeZoneOptionsAroundSelected = (options, selectedValue, referenceDate = new Date()) => {
  if (!selectedValue) return options;
  const decorated = options.map((o) => ({ ...o, _off: getTimeZoneOffsetMinutes(o.value, referenceDate) }));
  const selOff = getTimeZoneOffsetMinutes(selectedValue, referenceDate);
  const later = decorated.filter(o=>o._off>selOff).sort((a,b)=>b._off-a._off);
  const earlier = decorated.filter(o=>o._off<selOff).sort((a,b)=>b._off-a._off);
  const selectedInList = decorated.find(o=>o.value===selectedValue) || { value: selectedValue, label: buildTimeZoneLabel(selectedValue, referenceDate), _off: selOff };
  const merged = [...later, selectedInList, ...earlier].map(({_off, ...r})=>r);
  const seen = new Set();
  return merged.filter(o=> (seen.has(o.value) ? false : (seen.add(o.value), true)));
};

// Short UTC like "UTC+8" for preview card
const buildShortUTC = (timeZone) => {
  if (!timeZone) return 'UTC±0';
  try {
    const ref = new Date();
    const f = new Intl.DateTimeFormat('en-US', { timeZone: timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = Object.fromEntries(f.formatToParts(ref).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(iso);
    const offMin = Math.round((tzAsUTC.getTime() - ref.getTime()) / 60000);
    const sign = offMin >= 0 ? '+' : '-';
    const h = Math.floor(Math.abs(offMin) / 60);
    const m = Math.abs(offMin) % 60;
    return `UTC${sign}${h}${m?`:${String(m).padStart(2,'0')}`:''}`;
  } catch { return 'UTC±0'; }
};

function MentorProfileEditorPage() {
  const navigate = useNavigate();

  // 基本资料（默认值使右侧预览完整）
  const [name, setName] = useState('导师姓名');
  const [degree, setDegree] = useState('硕士'); // 本科 / 硕士 / PhD
  const [school, setSchool] = useState('哈佛大学');
  // 时区（IANA 名称），用于自定义下拉
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch { return 'Asia/Shanghai'; }
  });
  const [coursesInput, setCoursesInput] = useState('Python编程, 机器学习, 深度学习');

  const courses = useMemo(
    () => coursesInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    [coursesInput]
  );

  // 权限校验
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/api/mentor/permissions');
        if (!alive) return;
        if (!res?.data?.canEditProfile) {
          alert(res?.data?.error || '暂不可编辑个人名片');
          navigate('/mentor', { replace: true });
        }
      } catch (e) {
        if (!alive) return;
        const status = e?.response?.status;
        const msg = e?.response?.data?.error;
        if (status === 401) {
          try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: '/mentor/profile-editor' } })); } catch {}
          alert('请先登录');
          navigate('/mentor', { replace: true });
          return;
        }
        if (status === 403) {
          alert(msg || '导师审核中，暂不可编辑个人名片');
          navigate('/mentor', { replace: true });
          return;
        }
        alert(msg || '加载失败，请稍后再试');
        navigate('/mentor', { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  // 预览卡片数据
  const previewCardData = useMemo(() => ({
    name,
    degree: degree || '硕士',
    school: school || '哈佛大学',
    rating: 4.9,
    reviewCount: 120,
    timezone: buildShortUTC(timezone),
    languages: '中文, 英语',
    courses: courses.length ? courses : ['Python编程', '机器学习', '深度学习'],
  }), [name, degree, school, timezone, courses]);

  // 学历选择（复用“时区列表”样式/交互）
  const DEGREE_OPTIONS = useMemo(() => ([
    { value: '本科', label: '本科' },
    { value: '硕士', label: '硕士' },
    { value: 'PhD', label: 'PhD' },
  ]), []);

  const DegreeSelect = ({ id, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    // 打开时把当前项尽量滚动到列表中部
    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current;
      if (!listEl) return;
      const idx = DEGREE_OPTIONS.findIndex((o) => o.value === value);
      if (idx === -1) return;
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
      if (!itemEl) return;
      const listHeight = listEl.clientHeight;
      const target = itemEl.offsetTop - Math.max(0, (listHeight - itemEl.offsetHeight) / 2);
      try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
    }, [open, value]);

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

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
      if (!open) return;
      const i = Math.max(0, DEGREE_OPTIONS.findIndex((o) => o.value === value));
      if (e.key === 'ArrowDown') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.min(DEGREE_OPTIONS.length - 1, i + 1)].value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.max(0, i - 1)].value); }
      else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
    };

    const selectedLabel = useMemo(() => DEGREE_OPTIONS.find(o => o.value === value)?.label || '', [value]);

    return (
      <div className="mx-select" data-open={open ? 'true' : 'false'}>
        <button
          id={id}
          ref={buttonRef}
          type="button"
          className="mx-select__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
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
  };

  const orderedTimeZoneOptions = useMemo(() => {
    const now = new Date();
    return orderTimeZoneOptionsAroundSelected(buildTimeZoneOptions(now), timezone, now);
  }, [timezone]);

  const TimeZoneSelect = ({ id, value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current; if (!listEl) return;
      const idx = options.findIndex(o=>o.value===value); if (idx<0) return;
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`); if (!itemEl) return;
      const listH = listEl.clientHeight; const top = itemEl.offsetTop; const h = itemEl.offsetHeight;
      const target = top - Math.max(0, (listH - h) / 2);
      try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
    }, [open, value, options]);

    useEffect(() => {
      const onDoc = (e) => {
        if (!open) return;
        const btn = buttonRef.current; const list = listRef.current;
        if (btn && btn.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const selectedLabel = useMemo(() => options.find(o=>o.value===value)?.label || '', [options, value]);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
      if (!open) return;
      const cur = Math.max(0, options.findIndex(o=>o.value===value));
      if (e.key === 'ArrowDown') { e.preventDefault(); onChange(options[Math.min(options.length-1, cur+1)].value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(options[Math.max(0, cur-1)].value); }
      else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
    };

    return (
      <div className="mx-select" data-open={open ? 'true' : 'false'}>
        <button id={id} ref={buttonRef} type="button" className="mx-select__button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v=>!v)} onKeyDown={handleKeyDown}>
          <span className="mx-select__label">{selectedLabel || '请选择'}</span>
          <span className="mx-select__caret" aria-hidden>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </button>
        {open && (
          <div className="mx-select__popover">
            <ul ref={listRef} role="listbox" aria-labelledby={id} className="mx-select__list">
              {options.map((opt, index) => {
                const selected = opt.value === value;
                return (
                  <li key={opt.value} role="option" aria-selected={selected} data-index={index} className={`mx-select__option ${selected ? 'selected' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
                    {opt.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-editor-page">
      <header className="mx-editor-header">
        <div className="container">
          <BrandMark className="nav-logo-text" to="/mentor" />
          <div className="step-header-actions">
            <button type="button" className="ghost-button" onClick={() => navigate('/mentor')}>
              保存并退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-editor-main">
        <div className="container">
          <h1 className="mx-editor-title">编辑个人名片</h1>
        </div>
        <div className="container mx-editor-grid">
          {/* 左侧：表单 */}
          <section className="mx-editor-form">
            <div className="form-row">
              <label htmlFor="mx-name">名字</label>
              <input id="mx-name" type="text" placeholder="请输入姓名" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-degree">学历</label>
              {/* 自定义选择器：本科（上）/ 硕士（中）/ PhD（下） */}
              <DegreeSelect id="mx-degree" value={degree} onChange={setDegree} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-school">学校名称</label>
              <input id="mx-school" type="text" placeholder="例如：哈佛大学" value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-timezone">时区</label>
              <TimeZoneSelect id="mx-timezone" value={timezone} onChange={setTimezone} options={orderedTimeZoneOptions} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-courses">可授课课程</label>
              <input id="mx-courses" type="text" placeholder="用逗号分隔多个课程，例如：Python编程, 机器学习, 深度学习" value={coursesInput} onChange={(e) => setCoursesInput(e.target.value)} />
              {courses.length > 0 && (
                <div className="chips-preview">
                  {courses.map((c) => (
                    <span key={c} className="chip-item">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 右侧：实时预览 */}
          <aside className="mx-editor-preview">
            <div className="preview-wrap">
              <StudentListingCard data={previewCardData} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default MentorProfileEditorPage;
