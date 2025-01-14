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
        <p>这里是注册功能的占位内容。</p>
      </div>
    </div>
  );
};

export default RegisterPopup;
