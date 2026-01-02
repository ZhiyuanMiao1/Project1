import React, { useEffect, useMemo, useRef, useState } from 'react';
// Use clean-encoded stylesheet to avoid garbled comments
import './MentorProfileEditorPage.css';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import defaultAvatar from '../../assets/images/default-avatar.jpg';

// ===== Time zone helpers (shared style/logic with student step 3) =====
const TIMEZONE_NAME_OVERRIDES = {
  'Asia/Shanghai': '\u4e2d\u56fd\u6807\u51c6\u65f6\u95f4',
  'Asia/Tokyo': '\u65e5\u672c\u6807\u51c6\u65f6\u95f4',
  'Asia/Bangkok': '\u6cf0\u56fd\u65f6\u95f4',
  'Asia/Dubai': '\u6d77\u6e7e\u6807\u51c6\u65f6\u95f4',
  'Europe/London': '\u683c\u6797\u5c3c\u6cbb\u6807\u51c6\u65f6\u95f4',
  'Europe/Berlin': '\u4e2d\u6b27\u6807\u51c6\u65f6\u95f4',
  'Europe/Moscow': '\u83ab\u65af\u79d1\u65f6\u533a',
  'America/Los_Angeles': '\u7f8e\u56fd\u592a\u5e73\u6d0b\u65f6\u533a',
  'America/Anchorage': '\u7f8e\u56fd\u963f\u62c9\u65af\u52a0\u65f6\u95f4',
  'America/Denver': '\u7f8e\u56fd\u5c71\u5730\u65f6\u95f4',
  'America/Chicago': '\u7f8e\u56fd\u4e2d\u90e8\u65f6\u95f4',
  'America/New_York': '\u7f8e\u56fd\u4e1c\u90e8\u65f6\u95f4',
  'Australia/Brisbane': '\u6fb3\u5927\u5229\u4e9a\u4e1c\u90e8\u65f6\u95f4',
  'Pacific/Auckland': '\u65b0\u897f\u5170\u6807\u51c6\u65f6\u533a',
  'Pacific/Honolulu': '\u590f\u5a01\u5937\u65f6\u533a',
  'Pacific/Pago_Pago': '\u8428\u6469\u4e9a\u65f6\u533a',
  'Atlantic/Azores': '\u4e9a\u901f\u5c14\u7fa4\u5c9b\u65f6\u95f4',
  'Atlantic/South_Georgia': '\u5357\u4e54\u6cbb\u4e9a\u65f6\u95f4',
  'Africa/Johannesburg': '\u5357\u975e\u65f6\u95f4',
  'Asia/Karachi': '\u5df4\u57fa\u65af\u5766\u6807\u51c6\u65f6\u95f4',
  'Asia/Dhaka': '\u5b5f\u52a0\u62c9\u56fd\u6807\u51c6\u65f6\u95f4',
  'Pacific/Guadalcanal': '\u6240\u7f57\u95e8\u7fa4\u5c9b\u65f6\u95f4',
  'America/Halifax': '\u52a0\u62ff\u5927\u5927\u897f\u6d0b\u65f6\u95f4',
  'America/Sao_Paulo': '\u5df4\u897f\u65f6\u95f4',
};

const TIMEZONE_CITY_ZH = {
  'Asia/Shanghai': '\u5317\u4eac',
  'Asia/Tokyo': '\u4e1c\u4eac',
  'Asia/Bangkok': '\u66fc\u8c37',
  'Asia/Dubai': '\u8fea\u62dc',
  'Europe/London': '\u4f26\u6566',
  'Europe/Berlin': '\u67cf\u6797',
  'Europe/Moscow': '\u83ab\u65af\u79d1',
  'America/Los_Angeles': '\u6d1b\u6749\u77f6',
  'America/Anchorage': '\u5b89\u514b\u96f7\u5947',
  'America/Denver': '\u4e39\u4f5b',
  'America/Chicago': '\u829d\u52a0\u54e5',
  'America/New_York': '\u7ebd\u7ea6',
  'Australia/Brisbane': '\u5e03\u91cc\u65af\u73ed',
  'Pacific/Auckland': '\u5965\u514b\u5170',
  'Pacific/Honolulu': '\u706b\u5974\u9c81\u9c81',
  'Pacific/Pago_Pago': '\u5e15\u679c\u5e15\u679c',
  'Atlantic/Azores': '\u4e9a\u901f\u5c14',
  'Atlantic/South_Georgia': '\u5357\u4e54\u6cbb\u4e9a',
  'Africa/Johannesburg': '\u7ea6\u7ff0\u5185\u65af\u5821',
  'Asia/Karachi': '\u5361\u62c9\u5947',
  'Asia/Dhaka': '\u8fbe\u5361',
  'Pacific/Guadalcanal': '\u970d\u5c3c\u4e9a\u62c9',
  'America/Halifax': '\u54c8\u5229\u6cd5\u514b\u65af',
  'America/Sao_Paulo': '\u5723\u4fdd\u7f57',
};

const FALLBACK_TIMEZONES = [
  'Pacific/Pago_Pago', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Halifax',
  'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Europe/London',
  'Europe/Berlin', 'Africa/Johannesburg', 'Europe/Moscow', 'Asia/Dubai',
  'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Brisbane', 'Pacific/Guadalcanal', 'Pacific/Auckland',
];

const TEACHING_LANGUAGE_STORAGE_KEY = 'mentor.profile.teachingLanguages.v1';
const TEACHING_LANGUAGE_OPTIONS = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

const TEACHING_LANGUAGE_MAP = new Map(TEACHING_LANGUAGE_OPTIONS.map((o) => [o.code, o]));
const normalizeTeachingLanguageCodes = (raw) => {
  const valid = new Set(TEACHING_LANGUAGE_OPTIONS.map((o) => o.code));
  const input = Array.isArray(raw) ? raw : [];
  const next = [];
  const seen = new Set();
  for (const item of input) {
    const code = String(item || '').trim();
    if (!code || !valid.has(code) || seen.has(code)) continue;
    seen.add(code);
    next.push(code);
  }
  return next;
};

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
const buildShortUTCWithCity = (timeZone) => {
  const utc = buildShortUTC(timeZone);
  const city = TIMEZONE_CITY_ZH[timeZone] || TIMEZONE_NAME_OVERRIDES[timeZone] || extractCityName(timeZone);
  return city ? `${utc} (${city})` : utc;
};

function TeachingLanguageModal({ open, value, onCancel, onConfirm }) {
  const [draft, setDraft] = useState(() => normalizeTeachingLanguageCodes(value));

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeTeachingLanguageCodes(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const toggle = (code) => {
    setDraft((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  return (
    <div className="mx-lang-modal-overlay" onMouseDown={() => onCancel?.()}>
      <div className="mx-lang-modal" role="dialog" aria-modal="true" aria-label="选择授课语言" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mx-lang-modal__header">
          <div className="mx-lang-modal__title">选择授课语言</div>
        </div>
        <div className="mx-lang-modal__body">
          {TEACHING_LANGUAGE_OPTIONS.map((opt) => {
            const checked = draft.includes(opt.code);
            return (
              <label key={opt.code} className={`mx-lang-option ${checked ? 'is-checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(opt.code)} />
                <span className="mx-lang-option__flag" aria-hidden="true">{String(opt.code || '').toUpperCase()}</span>
                <span className="mx-lang-option__label">{opt.label}</span>
              </label>
            );
          })}
        </div>
        <div className="mx-lang-modal__footer">
          <button type="button" className="mx-lang-modal__btn mx-lang-modal__btn--ghost" onClick={() => onCancel?.()}>取消</button>
          <button type="button" className="mx-lang-modal__btn mx-lang-modal__btn--primary" onClick={() => onConfirm?.(normalizeTeachingLanguageCodes(draft))}>确定</button>
        </div>
      </div>
    </div>
  );
}

function MentorProfileEditorPage() {
  const navigate = useNavigate();
  const saveHintTimerRef = useRef(null);
  const avatarUploadSeqRef = useRef(0);

  // 基本资料（默认值使右侧预览完整）
  const [name, setName] = useState('');
  const [gender, setGender] = useState(''); // 男 / 女（空=未选择）
  const [degree, setDegree] = useState('硕士'); // 本科 / 硕士 / PhD
  const [school, setSchool] = useState('');
  // 时区（IANA 名称），用于自定义下拉
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch { return 'Asia/Shanghai'; }
  });
  const [coursesInput, setCoursesInput] = useState('');
  const [teachingLanguageCodes, setTeachingLanguageCodes] = useState([]);
  const [teachingLangModalOpen, setTeachingLangModalOpen] = useState(false);

  const courses = useMemo(
    () => coursesInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    [coursesInput]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEACHING_LANGUAGE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setTeachingLanguageCodes(normalizeTeachingLanguageCodes(parsed));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TEACHING_LANGUAGE_STORAGE_KEY, JSON.stringify(teachingLanguageCodes));
    } catch {}
  }, [teachingLanguageCodes]);

  const teachingLanguageLabel = useMemo(
    () => teachingLanguageCodes.map((code) => TEACHING_LANGUAGE_MAP.get(code)?.label).filter(Boolean).join(', '),
    [teachingLanguageCodes]
  );

  // 头像：默认显示项目内的 default-avatar，可点击上传预览
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState(null);
  const avatarInputRef = useRef(null);
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const [saveHint, setSaveHint] = useState(null); // { id: number }
  const [saving, setSaving] = useState(false);

  useEffect(() => () => {
    if (saveHintTimerRef.current) {
      clearTimeout(saveHintTimerRef.current);
      saveHintTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    avatarUploadSeqRef.current += 1;
  }, []);

  const showSavedHint = () => {
    const id = Date.now();
    setSaveHint({ id });
    if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current);
    saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 1800);
  };

  const onPickAvatar = () => {
    if (avatarInputRef.current) avatarInputRef.current.click();
  };

  const setNextAvatarPreviewUrl = (nextUrl) => {
    setAvatarPreviewUrl((prev) => {
      try { if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); } catch {}
      return nextUrl;
    });
  };

  useEffect(() => () => {
    try { if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(avatarPreviewUrl); } catch {}
  }, [avatarPreviewUrl]);

  const onAvatarChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ''; } catch {}
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setAvatarUploadError('头像文件需 ≤ 5MB');
      return;
    }
    if (file.type && !String(file.type).toLowerCase().startsWith('image/')) {
      setAvatarUploadError('仅支持图片文件');
      return;
    }

    const seq = ++avatarUploadSeqRef.current;
    const prevAvatarUrl = avatarUrl;

    const nextPreview = URL.createObjectURL(file);
    setNextAvatarPreviewUrl(nextPreview);
    setAvatarUploadError(null);
    setAvatarUploading(true);

    try {
      const signRes = await api.post('/api/oss/policy', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (seq !== avatarUploadSeqRef.current) return;

      const { host, key, policy, signature, accessKeyId, fileUrl } = signRes?.data || {};
      if (!host || !key || !policy || !signature || !accessKeyId || !fileUrl) {
        throw new Error('签名响应不完整');
      }

      const formData = new FormData();
      formData.append('key', key);
      formData.append('policy', policy);
      formData.append('OSSAccessKeyId', accessKeyId);
      formData.append('success_action_status', '200');
      formData.append('signature', signature);
      formData.append('file', file);

      const uploadRes = await fetch(host, { method: 'POST', body: formData });
      if (seq !== avatarUploadSeqRef.current) return;
      if (!uploadRes.ok) throw new Error('上传失败');

      setAvatarUrl(fileUrl);
      setNextAvatarPreviewUrl(fileUrl);
    } catch (err) {
      if (seq !== avatarUploadSeqRef.current) return;
      let msg = err?.response?.data?.error || err?.message || '上传失败，请稍后再试';
      if (msg === 'Failed to fetch' || msg === 'NetworkError') {
        msg = '上传失败（请检查 OSS CORS 配置）';
      }
      setAvatarUploadError(msg);
      setAvatarUrl(prevAvatarUrl || null);
      setNextAvatarPreviewUrl(prevAvatarUrl || null);
    } finally {
      if (seq !== avatarUploadSeqRef.current) return;
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (avatarUploading) {
      alert('头像上传中，请稍后再保存');
      return false;
    }
    if (saving) return false;

    setSaving(true);
    try {
      const payload = {
        displayName: name,
        gender,
        degree,
        school,
        timezone,
        courses,
        avatarUrl,
      };
      await api.put('/api/mentor/profile', payload);
      // 重建右侧预览卡片，使其重新执行 reveal 动画
      setPreviewReplayKey((k) => k + 1);
      showSavedHint();
      return true;
    } catch (e) {
      const msg = e?.response?.data?.error || '保存失败，请稍后再试';
      alert(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    const ok = await handleSave();
    if (ok) navigate('/mentor');
  };

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

  // 加载已有资料（如已保存）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/api/mentor/profile');
        if (!alive) return;
        const p = res?.data?.profile;
        if (p) {
          setName(p.displayName || '');
          setGender(p.gender || '');
          setDegree(p.degree || '硕士');
          setSchool(p.school || '');
          if (p.timezone) setTimezone(p.timezone);
          setCoursesInput(Array.isArray(p.courses) ? p.courses.join('，') : '');
          setAvatarUrl(p.avatarUrl || null);
          setNextAvatarPreviewUrl(p.avatarUrl || null);
        }
      } catch (e) {
        // 忽略 404/空数据，仅在控制台提示
        try { console.warn('Load profile failed', e?.response?.data || e?.message); } catch {}
      }
    })();
    return () => { alive = false; };
  }, []);

  // 预览卡片数据
  const previewCardData = useMemo(() => ({
    name: name || '导师称呼',
    gender: gender || '',
    degree: degree || '硕士',
    school: (school || '').trim(),
    rating: 4.9,
    reviewCount: 120,
    timezone: buildShortUTCWithCity(timezone),
    languages: teachingLanguageLabel,
    courses,
    imageUrl: avatarPreviewUrl || avatarUrl || null,
  }), [name, gender, degree, school, timezone, courses, avatarPreviewUrl, avatarUrl, teachingLanguageLabel]);

  // 学历选择（复用“时区列表”样式/交互）
  const DEGREE_OPTIONS = useMemo(() => ([
    { value: '本科', label: '本科' },
    { value: '硕士', label: '硕士' },
    { value: 'PhD', label: 'PhD' },
  ]), []);

  // —— 性别选择 —— //
  const GENDER_OPTIONS = useMemo(() => ([
    { value: '男', label: '男' },
    { value: '女', label: '女' },
  ]), []);

  const GenderSelect = ({ id, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current; if (!listEl) return;
      const idx = Math.max(0, GENDER_OPTIONS.findIndex(o => o.value === value));
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`); if (!itemEl) return;
      const listH = listEl.clientHeight; const top = itemEl.offsetTop; const h = itemEl.offsetHeight;
      const target = top - Math.max(0, (listH - h) / 2);
      try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
    }, [open, value]);

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

    const selectedLabel = useMemo(() => GENDER_OPTIONS.find(o => o.value === value)?.label || '', [value]);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
      if (!open) return;
      const cur = Math.max(0, GENDER_OPTIONS.findIndex(o => o.value === value));
      if (e.key === 'ArrowDown') { e.preventDefault(); onChange(GENDER_OPTIONS[Math.min(GENDER_OPTIONS.length - 1, cur + 1)].value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(GENDER_OPTIONS[Math.max(0, cur - 1)].value); }
      else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
    };

    return (
      <div className="mx-select" data-open={open ? 'true' : 'false'}>
        <button id={id} ref={buttonRef} type="button" className="mx-select__button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)} onKeyDown={handleKeyDown}>
          <span className="mx-select__label">{selectedLabel || '请选择'}</span>
          <span className="mx-select__caret" aria-hidden>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </button>
        {open && (
          <div className="mx-select__popover">
            <ul ref={listRef} role="listbox" aria-labelledby={id} className="mx-select__list">
              {GENDER_OPTIONS.map((opt, index) => {
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
            <div className="mx-editor-exit-wrap">
              <button type="button" className="ghost-button" onClick={handleSaveAndExit} disabled={avatarUploading || saving}>
                {saving ? '保存中...' : '保存并退出'}
              </button>
              {saveHint && (
                <div key={saveHint.id} className="mx-editor-save-hint" role="status" aria-live="polite">
                  已保存
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-editor-main">
        <div className="container">
          <h1 className="mx-editor-title">编辑个人名片</h1>
          {/* 头像：默认显示 default-avatar，点击可上传 */}
          <div className="mx-editor-avatar-shell">
            <button
              type="button"
              className={`mx-editor-avatar ${avatarUrl ? 'has-avatar' : ''} ${avatarUploading ? 'is-uploading' : ''}`}
              aria-label="修改头像"
              onClick={onPickAvatar}
              disabled={avatarUploading}
            >
              <img
                className="mx-editor-avatar-img"
                src={avatarPreviewUrl || avatarUrl || defaultAvatar}
                alt="头像"
              />
              {!avatarPreviewUrl && !avatarUrl && (
                <span className="mx-editor-avatar-placeholder">头像</span>
              )}
              {avatarUploading && (
                <span className="mx-editor-avatar-uploading" aria-live="polite">上传中…</span>
              )}
              <svg className="mx-editor-avatar-camera" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {/* 黑色实心圆底 */}
                <circle cx="12" cy="12" r="12" fill="currentColor" />
                {/* 白色线框相机 */}
                <rect x="6" y="8" width="12" height="9" rx="2" ry="2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 8 L10.1 6.6 A1.8 1.8 0 0 1 11.6 5.8 H12.4 A1.8 1.8 0 0 1 13.9 6.6 L15 8" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12.5" r="3" fill="none" stroke="#ffffff" strokeWidth="1.2" />
              </svg>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onAvatarChange}
            />
          </div>
          {avatarUploadError && (
            <div className="mx-editor-avatar-error" role="alert">{avatarUploadError}</div>
          )}
        </div>
        <div className="container mx-editor-grid">
          {/* 左侧：表单 */}
          <section className="mx-editor-form">
            <div className="form-row">
              <label htmlFor="mx-name">名字</label>
              <input id="mx-name" type="text" placeholder="导师称呼" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-gender">性别</label>
              <GenderSelect id="mx-gender" value={gender} onChange={setGender} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-degree">学历</label>
              {/* 自定义选择器：本科（上）/ 硕士（中）/ PhD（下） */}
              <DegreeSelect id="mx-degree" value={degree} onChange={setDegree} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-school">学校名称</label>
              <input id="mx-school" type="text" placeholder="可选填" value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-timezone">时区</label>
              <TimeZoneSelect id="mx-timezone" value={timezone} onChange={setTimezone} options={orderedTimeZoneOptions} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-courses">可授课课程</label>
              <div className="mx-courses-field">
                <textarea
                  id="mx-courses"
                  placeholder="Python编程，机器学习，深度学习"
                  value={coursesInput}
                  onChange={(e) => setCoursesInput(e.target.value)}
                  rows={3}
                />
                <div className="mx-teaching-languages-row">
                  {teachingLanguageCodes.length === 0 ? (
                    <button
                      type="button"
                      className="mx-teaching-languages-link"
                      onClick={() => setTeachingLangModalOpen(true)}
                    >添加授课语言</button>
                  ) : (
                    <button
                      type="button"
                      className="mx-teaching-languages-trigger"
                      onClick={() => setTeachingLangModalOpen(true)}
                      aria-label="编辑授课语言"
                    >
                      {teachingLanguageCodes.map((code) => {
                        const opt = TEACHING_LANGUAGE_MAP.get(code);
                        if (!opt) return null;
                        return (
                          <span key={code} className="mx-lang-flag" title={opt.label} aria-hidden="true">{String(opt.code || '').toUpperCase()}</span>
                        );
                      })}
                      <span className="mx-lang-plus" aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <TeachingLanguageModal
            open={teachingLangModalOpen}
            value={teachingLanguageCodes}
            onCancel={() => setTeachingLangModalOpen(false)}
            onConfirm={(next) => {
              setTeachingLanguageCodes(next);
              setTeachingLangModalOpen(false);
            }}
          />

          {/* 右侧：实时预览 */}
          <aside className="mx-editor-preview">
            <div className="preview-wrap">
              <StudentListingCard key={previewReplayKey} data={previewCardData} />
            </div>
          </aside>
        </div>
      </main>
      {/* 底部居中的保存按钮 */}
      <div className="mx-editor-save-floating">
        <button
          type="button"
          className="mx-save-button"
          onClick={(e) => { try { e.currentTarget.blur(); } catch {} handleSave(); }}
          disabled={avatarUploading || saving}
        >{saving ? '保存中...' : '保存'}</button>
      </div>
      
    </div>
  );
}

export default MentorProfileEditorPage;
