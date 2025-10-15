import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegisterPopup from '../RegisterPopup/RegisterPopup';
import LoginPopup from '../LoginPopup/LoginPopup';
import './AuthModal.css';

const StudentAuthModal = ({ onClose, anchorRef, leftAlignRef }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const navigate = useNavigate();
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 200;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const minGap = 8;
      // 若提供了 leftAlignRef，则以其左边为准
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
      setShowRegisterPopup(true);
    } else if (action === '登录') {
      setShowLoginPopup(true);
    } else if (action === '发布课程需求') {
      onClose();
      navigate('/student/course-request');
    } else {
      console.log(`User selected: ${action}`);
      onClose();
    }
  };

  // 文档级监听：点击弹窗外关闭，但不阻止外部交互
  useEffect(() => {
    const onDocMouseDown = (e) => {
      const panel = contentRef.current;
      if (!panel) return;
      // 如果点击在弹窗内容内，则不关闭
      if (panel.contains(e.target)) return;
      // 若点击在注册/登录弹窗内，也不关闭（避免误关）
      const reg = document.querySelector('.register-modal-content');
      const log = document.querySelector('.login-modal-content');
      if ((reg && reg.contains(e.target)) || (log && log.contains(e.target))) return;
      onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  return (
    <div className="auth-modal-overlay">
      <div
        className="auth-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
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
            onClick={() => handleAuthAction('发布课程需求')}
          >
            发布课程需求
          </button>
          <button
            className="auth-modal-option-button"
            onClick={() => handleAuthAction('帮助中心')}
          >
            帮助中心
          </button>
        </div>
      </div>

      {showRegisterPopup && (
        <RegisterPopup onClose={() => setShowRegisterPopup(false)} />
      )}

      {showLoginPopup && (
        <LoginPopup onClose={() => setShowLoginPopup(false)} />
      )}
    </div>
  );
};

export default StudentAuthModal;
