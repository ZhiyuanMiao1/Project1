import React, { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegisterPopup from '../RegisterPopup/RegisterPopup';
import LoginPopup from '../LoginPopup/LoginPopup';
import './AuthModal.css';

const StudentAuthModal = ({ onClose, anchorRef }) => {
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
      let left = rect.left;
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
  }, [anchorRef]);

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
