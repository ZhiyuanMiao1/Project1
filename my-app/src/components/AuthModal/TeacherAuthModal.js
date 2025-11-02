import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import RegisterPopup from '../RegisterPopup/RegisterPopup'; // 引入注册弹窗组件
import LoginPopup from '../LoginPopup/LoginPopup'; // 引入登录弹窗组件
import './AuthModal.css';

const TeacherAuthModal = ({ onClose, anchorRef, leftAlignRef }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false); // 控制注册弹窗显示
  const [showLoginPopup, setShowLoginPopup] = useState(false); // 控制登录弹窗显示
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

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
    if (action === '注册') {
      setShowRegisterPopup(true); // 显示注册弹窗
    } else if (action === '登录') {
      setShowLoginPopup(true); // 显示登录弹窗
    } else {
      console.log(`User selected: ${action}`); // 其他操作日志
      onClose(); // 关闭主弹窗
    }
  };

  // 文档级监听：点击弹窗外关闭，但不阻止外部交互
  useEffect(() => {
    const onDocMouseDown = (e) => {
      const panel = contentRef.current;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      const reg = document.querySelector('.register-modal-content');
      const log = document.querySelector('.login-modal-content');
      if ((reg && reg.contains(e.target)) || (log && log.contains(e.target))) return;
      onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

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
          <button
            className="auth-modal-option-button"
            onClick={() => handleAuthAction('注册')}
          >
            注册
          </button>
          <button
            className="auth-modal-option-button auth-divider"
            onClick={() => handleAuthAction('登录')}
          >
            登录
          </button>
          <button
            className="auth-modal-option-button"
            onClick={() => handleAuthAction('编辑个人名片')}
          >
            编辑个人名片
          </button>
          <button
            className="auth-modal-option-button"
            onClick={() => handleAuthAction('帮助中心')}
          >
            帮助中心
          </button>
        </div>
      </div>

      {/* 注册弹窗 */}
      {showRegisterPopup && (
        <RegisterPopup onClose={() => setShowRegisterPopup(false)} />
      )}

      {/* 登录弹窗 */}
      {showLoginPopup && (
        <LoginPopup
          role="mentor"
          onClose={() => setShowLoginPopup(false)}
          onSuccess={() => {
            onClose && onClose();
            try { window.dispatchEvent(new Event('home:enter')); } catch {}
            // 跳转导师首页
            try { window.location.pathname = '/teacher'; } catch {}
          }}
        />
      )}
    </div>
  );
};

export default TeacherAuthModal;
