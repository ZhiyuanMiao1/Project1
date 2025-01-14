import React from 'react';
import './RegisterPopup.css';

const RegisterPopup = ({ onClose }) => {
  return (
    <div className="register-modal-overlay" onClick={onClose}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>注册</h2>
        <p>这里是注册功能的占位内容。</p>
        <button onClick={onClose}>关闭</button>
      </div>
    </div>
  );
};

export default RegisterPopup;
