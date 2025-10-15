import React, { useLayoutEffect, useRef, useState } from 'react';
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="auth-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
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
        <LoginPopup onClose={() => setShowLoginPopup(false)} />
      )}
    </div>
  );
};

export default TeacherAuthModal;
