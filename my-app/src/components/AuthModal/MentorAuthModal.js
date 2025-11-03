import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import RegisterPopup from '../RegisterPopup/RegisterPopup'; // 引入注册弹窗组件
import LoginPopup from '../LoginPopup/LoginPopup'; // 引入登录弹窗组件
import './AuthModal.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { FiBookOpen, FiSettings } from 'react-icons/fi';
import { HiOutlineIdentification } from 'react-icons/hi2';

const MentorAuthModal = ({ onClose, anchorRef, leftAlignRef }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false); // 控制注册弹窗显示
  const [showLoginPopup, setShowLoginPopup] = useState(false); // 控制登录弹窗显示
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const navigate = useNavigate();

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

  const handleAuthAction = (action) => {
    switch (action) {
      case 'register':
        setShowRegisterPopup(true);
        return;
      case 'login':
        setShowLoginPopup(true);
        return;
      case 'favorites':
      case 'courses':
      case 'messages':
      case 'settings':
      case 'help':
        console.log(`User selected: ${action}`);
        onClose && onClose();
        return;
      case 'editProfile':
        onClose && onClose();
        try { navigate('/mentor/profile-editor'); } catch {}
        return;
      case 'logout':
        try {
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
        } catch {}
        try { delete api.defaults.headers.common['Authorization']; } catch {}
        try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: false } })); } catch {}
        setIsLoggedIn(false);
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
                onClick={() => handleAuthAction('editProfile')}
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
          onSuccess={(payload) => {
            onClose && onClose();
            try { window.dispatchEvent(new Event('home:enter')); } catch {}
            const nextRole = payload?.user?.role;
            try { window.location.pathname = (nextRole === 'mentor' ? '/mentor' : '/student'); } catch {}
          }}
        />
      )}
    </div>
  );
};

export default MentorAuthModal;
