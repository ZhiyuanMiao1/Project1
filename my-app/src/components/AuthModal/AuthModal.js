import React from 'react';
import './AuthModal.css';

const AuthModal = ({ onClose }) => {
  const handleAuthAction = (action) => {
    console.log(`User selected: ${action}`); // Log user action
    onClose(); // Close the modal
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-options">
          <button
            className="auth-modal-option-button"
            onClick={() => handleAuthAction('登录')}
          >
            登录
          </button>
          <button
            className="auth-modal-option-button auth-divider"
            onClick={() => handleAuthAction('注册')}
          >
            注册
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
    </div>
  );
};

export default AuthModal;
