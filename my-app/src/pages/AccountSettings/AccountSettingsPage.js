import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAward,
  FiBell,
  FiBookOpen,
  FiCreditCard,
  FiGlobe,
  FiShield,
  FiUser,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { fetchAccountProfile } from '../../api/account';
import api from '../../api/client';
import defaultAvatar from '../../assets/images/default-avatar.jpg';
import './AccountSettingsPage.css';

const SETTINGS_SECTIONS = [
  {
    id: 'profile',
    label: '个人信息',
    icon: FiUser,
  },
  {
    id: 'studentData',
    label: '学生数据',
    icon: FiBookOpen,
  },
  {
    id: 'mentorData',
    label: '导师数据',
    icon: FiAward,
  },
  {
    id: 'security',
    label: '安全与隐私',
    icon: FiShield,
  },
  {
    id: 'notifications',
    label: '通知',
    icon: FiBell,
  },
  {
    id: 'payments',
    label: '付款与账单',
    icon: FiCreditCard,
  },
  {
    id: 'language',
    label: '语言与偏好',
    icon: FiGlobe,
  },
];

function AccountSettingsPage({ mode = 'student' }) {
  const isMentorView = mode === 'mentor';
  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [accountProfile, setAccountProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      const role = user?.role;
      const publicId = user?.public_id;
      return {
        email: typeof user?.email === 'string' ? user.email : '',
        studentId: role === 'student' && typeof publicId === 'string' ? publicId : '',
        mentorId: role === 'mentor' && typeof publicId === 'string' ? publicId : '',
        degree: '',
        school: '',
      };
    } catch {
      return { email: '', studentId: '', mentorId: '', degree: '', school: '' };
    }
  });
  const [idsStatus, setIdsStatus] = useState('idle'); // idle | loading | loaded | error
  const [degreeDraft, setDegreeDraft] = useState('');
  const [schoolDraft, setSchoolDraft] = useState('');
  const [editingDegree, setEditingDegree] = useState(false);
  const [editingSchool, setEditingSchool] = useState(false);
  const [savingAccountProfile, setSavingAccountProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [toast, setToast] = useState(null); // { id: number, kind: 'success' | 'error', message: string }

  const [activeSectionId, setActiveSectionId] = useState(SETTINGS_SECTIONS[0]?.id || 'profile');

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setIdsStatus('idle');
      setAccountProfile({ email: '', studentId: '', mentorId: '', degree: '', school: '' });
      setEditingPassword(false);
      setNewPasswordDraft('');
      setConfirmPasswordDraft('');
      setSavingPassword(false);
      setPasswordError('');
      setToast(null);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      return;
    }

    let alive = true;
    setIdsStatus('loading');
    fetchAccountProfile()
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        const next = {
          email: typeof data.email === 'string' ? data.email : '',
          studentId: typeof data.studentId === 'string' ? data.studentId : '',
          mentorId: typeof data.mentorId === 'string' ? data.mentorId : '',
          degree: typeof data.degree === 'string' ? data.degree : '',
          school: typeof data.school === 'string' ? data.school : '',
        };
        setAccountProfile(next);
        setIdsStatus('loaded');
        setDegreeDraft(typeof data.degree === 'string' ? data.degree : '');
        setSchoolDraft(typeof data.school === 'string' ? data.school : '');
      })
      .catch(() => {
        if (!alive) return;
        setIdsStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const activeSection = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.id === activeSectionId) || SETTINGS_SECTIONS[0],
    [activeSectionId],
  );

  const studentIdValue = accountProfile.studentId || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const mentorIdValue = accountProfile.mentorId || (idsStatus === 'loading' ? '加载中...' : '暂未开通');
  const emailValue = accountProfile.email || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const degreeValue = accountProfile.degree || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const schoolValue = accountProfile.school || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const canEditEducationProfile = isLoggedIn && idsStatus !== 'loading';

  const DEGREE_OPTIONS = useMemo(() => ([
    { value: '本科', label: '本科' },
    { value: '硕士', label: '硕士' },
    { value: 'PhD', label: 'PhD' },
  ]), []);

  const DegreeSelect = ({ id, value, onChange }) => {
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
  };

  const saveAccountProfilePatch = async (patch) => {
    if (savingAccountProfile) return;
    setSavingAccountProfile(true);
    try {
      await api.put('/api/account/profile', patch);
      setAccountProfile((prev) => ({ ...prev, ...patch }));
    } catch (e) {
      const msg = e?.response?.data?.error || '保存失败，请稍后再试';
      alert(msg);
    } finally {
      setSavingAccountProfile(false);
    }
  };

  const showToast = (message, kind = 'success') => {
    const id = Date.now();
    setToast({ id, kind, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  const startPasswordEdit = () => {
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }
    setPasswordError('');
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setEditingPassword(true);
  };

  const cancelPasswordEdit = () => {
    setEditingPassword(false);
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setPasswordError('');
  };

  const saveNewPassword = async () => {
    if (savingPassword) return;
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }

    const newPassword = newPasswordDraft;
    const confirmPassword = confirmPasswordDraft;
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      setPasswordError('密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    try {
      await api.put('/api/account/password', { newPassword, confirmPassword });
      cancelPasswordEdit();
      showToast('密码修改成功', 'success');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || '修改失败，请稍后再试';
      setPasswordError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="settings-page">
      {toast && (
        <div
          key={toast.id}
          className={`settings-toast ${toast.kind === 'success' ? 'settings-toast--success' : 'settings-toast--error'}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
      <div className="container">
        <header className="settings-header">
          <BrandMark className="nav-logo-text" to={homeHref} />
          <button
            type="button"
            className="icon-circle settings-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => (isMentorView ? setShowMentorAuth(true) : setShowStudentAuth(true))}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="settings-hero">
          <h1>设置与数据</h1>
        </section>

        <section className="settings-shell" aria-label="设置与数据">
          <div className="settings-nav-pane">
            <nav className="settings-nav" aria-label="设置选项">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`settings-nav-item ${isActive ? 'is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <span className="settings-nav-icon" aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <span className="settings-nav-text">
                      <span className="settings-nav-label">{section.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="settings-divider" aria-hidden="true" />

          <div className="settings-detail-pane">
            <div className="settings-detail-head">
              <div className="settings-detail-title">{activeSection?.label || '设置与数据'}</div>
            </div>

            <div
              className={`settings-card ${activeSectionId === 'profile' ? 'settings-card--profile' : ''}`}
              role="region"
              aria-label={`${activeSection?.label || '设置'}内容`}
            >
              {activeSectionId === 'profile' && (
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
                          saveAccountProfilePatch({ degree: degreeDraft || '' });
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
                          saveAccountProfilePatch({ school: schoolDraft || '' });
                          setEditingSchool(false);
                        }}
                      >
                        {editingSchool ? '保存' : '编辑'}
                      </button>
                    )}
                  </div>
                </>
              )}

              {activeSectionId === 'studentData' && (
                <div className="settings-data-section" aria-label="学生数据">
                  <section className="settings-student-card" aria-label="学生数据概览">
                    <div className="settings-student-card-left">
                      <div className="settings-student-avatar-wrap" aria-hidden="true">
                        <img className="settings-student-avatar" src={defaultAvatar} alt="" />
                        <span className="settings-student-avatar-badge">
                          <FiShield size={18} />
                        </span>
                      </div>
                      <div className="settings-student-main">
                        <div className="settings-student-name">{studentIdValue}</div>
                        <div className="settings-student-subtitle">{schoolValue !== '未提供' ? schoolValue : 'MentorX 学生'}</div>
                      </div>
                    </div>

                    <div className="settings-student-metrics" aria-label="学生数据指标">
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">上课</div>
                        <div className="settings-student-metric-value">
                          3<span className="settings-student-metric-unit">次</span>
                        </div>
                      </div>
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">评价</div>
                        <div className="settings-student-metric-value">
                          2<span className="settings-student-metric-unit">条</span>
                        </div>
                      </div>
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">加入MentorX</div>
                        <div className="settings-student-metric-value">
                          2<span className="settings-student-metric-unit">年</span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeSectionId === 'mentorData' && (
                <div className="settings-data-section" aria-label="导师数据">
                  <section className="settings-data-card">
                    <div className="settings-data-placeholder">暂无字段（待补充）</div>
                  </section>
                </div>
              )}

              {activeSectionId === 'security' && (
                <>
                  <div className={`settings-row ${editingPassword ? 'settings-row--overlay' : ''}`}>
                    <div className="settings-row-main">
                      <div className="settings-row-title">登录密码</div>
                      <div className={`settings-row-value ${editingPassword ? 'settings-row-value--interactive' : ''}`}>
                        {editingPassword ? (
                          <div className="settings-password-fields">
                            <input
                              type="password"
                              className="settings-password-input"
                              value={newPasswordDraft}
                              placeholder="新密码（至少6位）"
                              autoComplete="new-password"
                              onChange={(e) => setNewPasswordDraft(e.target.value)}
                            />
                            <input
                              type="password"
                              className="settings-password-input"
                              value={confirmPasswordDraft}
                              placeholder="确认新密码"
                              autoComplete="new-password"
                              onChange={(e) => setConfirmPasswordDraft(e.target.value)}
                            />
                            {passwordError && (
                              <div className="settings-inline-error" role="alert">{passwordError}</div>
                            )}
                          </div>
                        ) : (
                          '已设置'
                        )}
                      </div>
                    </div>
                    {editingPassword ? (
                      <div className="settings-row-actions">
                        <button type="button" className="settings-action" disabled={savingPassword} onClick={saveNewPassword}>
                          {savingPassword ? '保存中...' : '保存'}
                        </button>
                        <button type="button" className="settings-action" disabled={savingPassword} onClick={cancelPasswordEdit}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="settings-action" disabled={!isLoggedIn} onClick={startPasswordEdit}>
                        修改
                      </button>
                    )}
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">数据个性化</div>
                      <div className="settings-row-value">用于优化推荐内容</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                </>
              )}

              {activeSectionId === 'notifications' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">站内消息</div>
                      <div className="settings-row-value">预约、提醒与系统通知</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">邮件通知</div>
                      <div className="settings-row-value">重要更新与课程提醒</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">推送通知</div>
                      <div className="settings-row-value">移动端推送提醒</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                </>
              )}

              {activeSectionId === 'payments' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">默认支付方式</div>
                      <div className="settings-row-value">未设置</div>
                    </div>
                    <button type="button" className="settings-action">添加</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">账单信息</div>
                      <div className="settings-row-value">发票抬头、地址等</div>
                    </div>
                    <button type="button" className="settings-action">查看</button>
                  </div>
                </>
              )}

              {activeSectionId === 'language' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">语言</div>
                      <div className="settings-row-value">简体中文</div>
                    </div>
                    <button type="button" className="settings-action">更改</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">时区</div>
                      <div className="settings-row-value">UTC+08:00</div>
                    </div>
                    <button type="button" className="settings-action">更改</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default AccountSettingsPage;
