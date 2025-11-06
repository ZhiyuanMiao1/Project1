import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MentorProfileEditorPage.css';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';

function MentorProfileEditorPage() {
  const navigate = useNavigate();

  // 基本资料（默认值使右侧预览完整）
  const [name, setName] = useState('导师姓名');
  const [degree, setDegree] = useState('硕士'); // 本科 / 硕士 / PhD
  const [school, setSchool] = useState('哈佛大学');
  const [timezone, setTimezone] = useState('UTC+8 (北京)');
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
    timezone,
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
          <span className="mx-select__caret" aria-hidden>▾</span>
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
              <input id="mx-timezone" type="text" placeholder="例如：UTC+8 (北京)" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
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

