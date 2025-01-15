import React from 'react';
import './RegisterPopup.css';

const RegisterPopup = ({ onClose }) => {
  return (
    <div className="register-modal-overlay" onClick={onClose}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="register-modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>注册</h2>
        <div className="register-modal-divider"></div>
        <h3>MentorX欢迎您</h3>
      </div>
    </div>
  );
};

export default RegisterPopup;
