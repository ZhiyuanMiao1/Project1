import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegisterPopup from '../RegisterPopup/RegisterPopup';
import LoginPopup from '../LoginPopup/LoginPopup';
import api from '../../api/client';
import './AuthModal.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { FiBookOpen, FiSettings } from 'react-icons/fi';
import { RiMegaphoneLine } from 'react-icons/ri';

const StudentAuthModal = ({ onClose, anchorRef, leftAlignRef, isLoggedIn = false, forceLogin = false }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const navigate = useNavigate();
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Position the dropdown next to the avatar/menu icon
  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 200;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const minGap = 8;
      const alignEl = leftAlignRef?.current;
      const baseLeft = alignEl ? alignEl.getBoundingClientRect().left : rect.left;
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
  }, [anchorRef, leftAlignRef]);

  // 若需要，直接打开登录子弹窗
  useEffect(() => {
    if (forceLogin) setShowLoginPopup(true);
  }, [forceLogin]);

  const handleAuthAction = (action) => {
    switch (action) {
      case 'register':
        if (!isLoggedIn) setShowRegisterPopup(true);
        return;
      case 'login':
        if (!isLoggedIn) setShowLoginPopup(true);
        return;
      case 'publish':
        onClose && onClose();
        navigate('/student/course-request');
        return;
      case 'logout':
        try {
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
        } catch {}
        try { delete api.defaults.headers.common['Authorization']; } catch {}
        try {
          window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: false } }));
        } catch {}
        onClose && onClose();
        navigate('/student');
        return;
      default:
        // Placeholder for future actions
        console.log(`User selected: ${action}`);
        onClose && onClose();
        return;
    }
  };

  // Close on outside click (but keep register/login popups interactive)
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
      onClose && onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose, showRegisterPopup, showLoginPopup]);

  const isPopupOpen = (showRegisterPopup || showLoginPopup);

  return (
    <div className="auth-modal-overlay" style={{ pointerEvents: isPopupOpen ? 'auto' : 'none' }}>
      <div
        className="auth-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left, display: isPopupOpen ? 'none' : 'block' }}
      >
        <div className="auth-modal-options">
          {isLoggedIn ? (
            <>
              <button
                className="auth-modal-option-button"
                onClick={() => handleAuthAction('favorites')}
              >
                <i className="far fa-heart auth-icon" aria-hidden="true"></i>
                收藏
              </button>
              <button
                className="auth-modal-option-button"
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
                账号设置
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
                onClick={() => handleAuthAction('publish')}
              >
                <RiMegaphoneLine className="auth-icon" />
                发布课程需求
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
                onClick={() => handleAuthAction('publish')}
              >
                发布课程需求
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

      {showRegisterPopup && (
        <RegisterPopup
          onClose={() => setShowRegisterPopup(false)}
          onSuccess={(payload) => {
            // RegisterPopup 内部负责导航与动画；此处仅收口关闭外层菜单
            onClose && onClose();
          }}
        />
      )}

      {showLoginPopup && (
        <LoginPopup
          onClose={() => setShowLoginPopup(false)}
          onSuccess={(payload) => {
            try { window.dispatchEvent(new Event('home:enter')); } catch {}
            onClose && onClose();
            const nextRole = payload?.user?.role;
            let redirected = false;
            try {
              const want = sessionStorage.getItem('postLoginRedirect');
              const required = sessionStorage.getItem('requiredRole');
              if (want && (!required || required === nextRole)) {
                sessionStorage.removeItem('postLoginRedirect');
                sessionStorage.removeItem('requiredRole');
                window.location.assign(want);
                redirected = true;
              }
            } catch {}
            if (!redirected) {
              try { navigate(nextRole === 'mentor' ? '/mentor' : '/student'); } catch {}
            }
          }}
        />
      )}
    </div>
  );
};

export default StudentAuthModal;
