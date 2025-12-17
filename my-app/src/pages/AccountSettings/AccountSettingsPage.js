import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiBell,
  FiCreditCard,
  FiGlobe,
  FiLock,
  FiShield,
  FiUser,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { fetchAccountIds } from '../../api/account';
import './AccountSettingsPage.css';

const SETTINGS_SECTIONS = [
  {
    id: 'profile',
    label: '个人信息',
    icon: FiUser,
  },
  {
    id: 'security',
    label: '登录与安全',
    icon: FiLock,
  },
  {
    id: 'privacy',
    label: '隐私',
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
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [accountIds, setAccountIds] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      const role = user?.role;
      const publicId = user?.public_id;
      return {
        studentId: role === 'student' && typeof publicId === 'string' ? publicId : '',
        mentorId: role === 'mentor' && typeof publicId === 'string' ? publicId : '',
      };
    } catch {
      return { studentId: '', mentorId: '' };
    }
  });
  const [idsStatus, setIdsStatus] = useState('idle'); // idle | loading | loaded | error

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

  useEffect(() => {
    if (!isLoggedIn) {
      setIdsStatus('idle');
      setAccountIds({ studentId: '', mentorId: '' });
      return;
    }

    let alive = true;
    setIdsStatus('loading');
    fetchAccountIds()
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        const next = {
          studentId: typeof data.studentId === 'string' ? data.studentId : '',
          mentorId: typeof data.mentorId === 'string' ? data.mentorId : '',
        };
        setAccountIds(next);
        setIdsStatus('loaded');
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

  const studentIdValue = accountIds.studentId || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const mentorIdValue = accountIds.mentorId || (idsStatus === 'loading' ? '加载中...' : '暂未开通');

  return (
    <div className="settings-page">
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
          <h1>账号设置</h1>
        </section>

        <section className="settings-shell" aria-label="账号设置">
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
              <div className="settings-detail-title">{activeSection?.label || '账号设置'}</div>
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
                </>
              )}

              {activeSectionId === 'security' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">登录密码</div>
                      <div className="settings-row-value">已设置</div>
                    </div>
                    <button type="button" className="settings-action">修改</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">两步验证</div>
                      <div className="settings-row-value">未开启</div>
                    </div>
                    <button type="button" className="settings-action">开启</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">登录设备</div>
                      <div className="settings-row-value">3 台设备已登录</div>
                    </div>
                    <button type="button" className="settings-action">管理</button>
                  </div>
                </>
              )}

              {activeSectionId === 'privacy' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">公开个人资料</div>
                      <div className="settings-row-value">让导师更快了解你</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
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
