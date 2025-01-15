import React from 'react';
import './RegisterPopup.css';

const RegisterPopup = ({ onClose, onContinue}) => {
  return (
    <div className="register-modal-overlay" onClick={onClose}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="register-modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>注册</h2>
        <div className="register-modal-divider"></div>
        <h3>MentorX欢迎您</h3>
        <div className="register-input-area">
          <input type="email" placeholder="请输入邮箱" className="register-input" />
          <input type="password" placeholder="请输入密码" className="register-input" />
          <input type="password" placeholder="请确认密码" className="register-input" />
        </div>
        <div className="register-button-group">
          <button className="register-button student-button">我是学生</button>
          <button className="register-button teacher-button">我是教师（需审核）</button>
        </div>
        <div className="register-continue-area">
          <button className="register-continue-button" onClick={onContinue}>继续</button>
        </div>
        {/* 添加中间带文字的分割线 */}
        <div className="register-modal-divider-with-text">
          <span className="divider-text">或（暂未开放）</span>
        </div>
        {/* 添加微信和 Google 登录按钮 */}
        <div className="social-login-buttons">
          <button className="social-button wechat-login">
            <img src="/images/wechat-icon.png" alt="WeChat" className="social-icon" />
            使用微信登录
          </button>
          <button className="social-button google-login">
            <img src="/images/google-icon.png" alt="Google" className="social-icon" />
            使用 Google 账号登录
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterPopup;
