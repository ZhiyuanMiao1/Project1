import React from 'react';
import '../RegisterPopup/RegisterPopup.css';
import './StudentWelcomePopup.css';

const StudentWelcomePopup = ({ publicId, onConfirm, onClose }) => {
  const handleConfirm = () => {
    if (typeof onConfirm === 'function') onConfirm();
  };

  const handleClose = () => {
    if (typeof onClose === 'function') onClose();
  };

  return (
    <div
      className="register-modal-overlay student-welcome-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
      onClick={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <div
        className="register-modal-content"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button className="register-modal-close" onClick={handleClose}>&times;</button>
        <h2>注册</h2>
        <div className="register-modal-divider" />
        <h3>欢迎来到MentorX</h3>

        <div className="student-welcome-body">
          <p className="student-welcome-line">这是你的 StudentID：<span className="student-welcome-id">{publicId || '—'}</span></p>
          <p className="student-welcome-sub">你以后可以通过这个ID号或邮箱登录</p>
        </div>

        <div className="register-continue-area">
          <button type="button" className="register-continue-button" onClick={handleConfirm}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentWelcomePopup;
