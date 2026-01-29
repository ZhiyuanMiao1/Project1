import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { clearAuth } from '../../utils/auth';
import { getAuthToken } from '../../utils/authStorage';
import RegisterPopup from '../RegisterPopup/RegisterPopup'; // 引入注册弹窗组件
import LoginPopup from '../LoginPopup/LoginPopup'; // 引入登录弹窗组件
import './AuthModal.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { FiBookOpen, FiSettings } from 'react-icons/fi';
import { HiOutlineIdentification } from 'react-icons/hi2';
import { consumePostLoginRedirect, setPostLoginRedirect } from '../../utils/postLoginRedirect';

const MentorAuthModal = ({ onClose, anchorRef, leftAlignRef, forceLogin = false, align = 'left', alignOffset = 0 }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false); // 控制注册弹窗显示
  const [showLoginPopup, setShowLoginPopup] = useState(false); // 控制登录弹窗显示
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [canEditProfile, setCanEditProfile] = useState(null); // null: 未知/未登录, true: 可编辑, false: 审核中/非导师
  const navigate = useNavigate();

  useEffect(() => {
    const sync = (e) => {
      const next = !!(e?.detail?.isLoggedIn ?? getAuthToken());
      setIsLoggedIn(next);
    };
    window.addEventListener('auth:changed', sync);
    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!(ev.newValue || getAuthToken()));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 锚定到触发图标下方 10px
  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 200;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const minGap = 8;
      const alignEl = leftAlignRef?.current;
      const baseLeft = align === 'right'
        ? rect.right - modalWidth + alignOffset
        : (alignEl ? alignEl.getBoundingClientRect().left : rect.left);
      let left = baseLeft;
      const maxLeft = viewportWidth - modalWidth - minGap;
      if (left > maxLeft) left = Math.max(minGap, maxLeft);
      if (left < minGap) left = minGap;
      setPosition({ top: rect.bottom + 10, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, leftAlignRef, align, alignOffset]);

  // 若需要，直接打开登录子弹窗
  useEffect(() => {
    if (forceLogin) setShowLoginPopup(true);
  }, [forceLogin]);

  // 预取权限以控制“编辑个人名片”禁用样式
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isLoggedIn) { setCanEditProfile(null); return; }
      try {
        const res = await api.get('/api/mentor/permissions');
        if (!alive) return;
        setCanEditProfile(!!res?.data?.canEditProfile);
      } catch (e) {
        if (!alive) return;
        const status = e?.response?.status;
        if (status === 403) setCanEditProfile(false); else setCanEditProfile(null);
      }
    })();
    return () => { alive = false; };
  }, [isLoggedIn]);

  const checkEditPermission = async () => {
    try {
      const res = await api.get('/api/mentor/permissions');
      if (res?.data?.canEditProfile) {
        onClose && onClose();
        try { navigate('/mentor/profile-editor'); } catch {}
        return;
      }
      alert(res?.data?.error || '暂不可编辑个人名片');
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 401) {
        setPostLoginRedirect('/mentor/profile-editor', 'mentor');
        setShowLoginPopup(true);
        return;
      }
      if (status === 403) {
        alert(msg || '导师审核中，暂不可编辑个人名片');
        return;
      }
      alert(msg || '操作失败，请稍后再试');
    }
  };
  const isPendingMentor = isLoggedIn && canEditProfile === false;
  const handleAuthAction = (action) => {
    switch (action) {
      case 'register':
        setShowRegisterPopup(true);
        return;
      case 'login':
        setShowLoginPopup(true);
        return;
      case 'favorites':
        if (isPendingMentor) return;
        onClose && onClose();
        navigate('/student/favorites?role=mentor', { state: { from: 'mentor' } });
        return;
      case 'courses':
        if (isPendingMentor) return;
        onClose && onClose();
        navigate('/mentor/courses', { state: { from: 'mentor' } });
        return;
      case 'messages':
        onClose && onClose();
        navigate('/mentor/messages', { state: { from: 'mentor' } });
        return;
      case 'settings':
        onClose && onClose();
        navigate('/mentor/settings', { state: { from: 'mentor' } });
        return;
      case 'help':
        console.log(`User selected: ${action}`);
        onClose && onClose();
        return;
      case 'editProfile':
        // 检查权限后再跳转（若禁用则不处理）
        if (canEditProfile === false) return;
        checkEditPermission();
        return;
      case 'logout':
        try { api.post('/api/auth/logout').catch(() => {}); } catch {}
        clearAuth(api);
        onClose && onClose();
        try { navigate('/student'); } catch {}
        return;
      default:
        console.log(`User selected: ${action}`);
        onClose && onClose();
        return;
    }
  };

  // 文档级监听：点击弹窗外关闭，但不阻止外部交互
  useEffect(() => {
    // 弹出注册/登录窗口时，不注册外点关闭逻辑，避免与子弹窗冲突
    if (showRegisterPopup || showLoginPopup) return;

    const onDocMouseDown = (e) => {
      const panel = contentRef.current;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      // 忽略所有注册/登录弹窗内部的点击（含欢迎弹窗）
      const regs = Array.from(document.querySelectorAll('.register-modal-content, .student-welcome-overlay'));
      const logs = Array.from(document.querySelectorAll('.login-modal-content'));
      if (regs.some((el) => el.contains(e.target)) || logs.some((el) => el.contains(e.target))) return;
      onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose, showRegisterPopup, showLoginPopup]);

  const isPopupOpen = showRegisterPopup || showLoginPopup;

  return (
    <div className="auth-modal-overlay" style={{ pointerEvents: isPopupOpen ? 'auto' : 'none' }}>
      <div
        className="auth-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left, display: isPopupOpen ? 'none' : 'block' }}
        // 交互由文档级监听控制
      >
        <div className="auth-modal-options">
          {isLoggedIn ? (
            <>
              <button
                className="auth-modal-option-button"
                disabled={isPendingMentor}
                aria-disabled={isPendingMentor}
                title={isPendingMentor ? '导师审核中，暂不可用' : undefined}
                onClick={() => handleAuthAction('favorites')}
              >
                <i className="far fa-heart auth-icon" aria-hidden="true"></i>
                收藏
              </button>
              <button
                className="auth-modal-option-button"
                disabled={isPendingMentor}
                aria-disabled={isPendingMentor}
                title={isPendingMentor ? '导师审核中，暂不可用' : undefined}
                onClick={() => handleAuthAction('courses')}
              >
                <FiBookOpen className="auth-icon" />
                课程
              </button>
              <button
                className="auth-modal-option-button auth-divider"
                onClick={() => handleAuthAction('messages')}
              >
                <i className="far fa-comment auth-icon" aria-hidden="true"></i>
                消息
              </button>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('settings')}
              >
                <FiSettings className="auth-icon" />
                设置与数据
              </button>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('help')}
              >
                <i className="far fa-circle-question auth-icon" aria-hidden="true"></i>
                帮助中心
              </button>
              <button
                className="auth-modal-option-button auth-divider"
                onClick={() => handleAuthAction('editProfile')}
                disabled={isLoggedIn && canEditProfile === false}
                aria-disabled={isLoggedIn && canEditProfile === false}
                title={isLoggedIn && canEditProfile === false ? '审核中，暂不可编辑' : undefined}
              >
                <HiOutlineIdentification className="auth-icon" />
                编辑个人名片
              </button>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('logout')}
              >
                退出
              </button>
            </>
          ) : (
            <>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('register')}
              >
                注册
              </button>
              <button
                className="auth-modal-option-button auth-divider"
                onClick={() => handleAuthAction('login')}
              >
                登录
              </button>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('editProfile')}
              >
                编辑个人名片
              </button>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('help')}
              >
                帮助中心
              </button>
            </>
          )}
        </div>
      </div>

      {/* 注册弹窗 */}
      {showRegisterPopup && (
        <RegisterPopup onClose={() => setShowRegisterPopup(false)} />
      )}

      {/* 登录弹窗 */}
      {showLoginPopup && (
        <LoginPopup
          onClose={() => setShowLoginPopup(false)}
          onGoRegister={() => { setShowLoginPopup(false); setShowRegisterPopup(true); }}
          onSuccess={(payload) => {
            onClose && onClose();
            try { window.dispatchEvent(new Event('home:enter')); } catch {}
            const nextRole = payload?.user?.role;
            const want = consumePostLoginRedirect();
            if (want) {
              try { navigate(want, { replace: true }); } catch {}
              return;
            }
            try { navigate(nextRole === 'mentor' ? '/mentor' : '/student'); } catch {}
          }}
        />
      )}
    </div>
  );
};

export default MentorAuthModal;
