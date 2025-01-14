import React, { useState } from 'react';
import RegisterPopup from '../RegisterPopup/RegisterPopup'; // 引入注册弹窗组件
import './AuthModal.css';

const AuthModal = ({ onClose }) => {
  const [showRegisterPopup, setShowRegisterPopup] = useState(false); // 控制注册弹窗显示

  const handleAuthAction = (action) => {
    if (action === '注册') {
      setShowRegisterPopup(true); // 显示注册弹窗
    } else {
      console.log(`User selected: ${action}`); // 其他操作日志
      onClose(); // 关闭主弹窗
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
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

      {/* 注册弹窗 */}
      {showRegisterPopup && (
        <RegisterPopup onClose={() => setShowRegisterPopup(false)} />
      )}
    </div>
  );
};

export default AuthModal;
