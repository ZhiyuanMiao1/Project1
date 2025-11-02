import React, { useRef } from 'react';
import './LoginPopup.css';

const LoginPopup = ({ onClose, onContinue, errorMessage = '', errorField = '' }) => {
  // 仅在按下也发生在遮罩层上时，才允许点击关闭
  const backdropMouseDownRef = useRef(false);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    onClose && onClose();
  };

  return (
    <div
      className="login-modal-overlay"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>登录</h2>
        <div className="login-modal-divider"></div>
        <h3>欢迎回来，MentorX用户</h3>
        <div className="login-input-area">
          <input
            type="email"
            placeholder="请输入邮箱、StudentID或MentorID"
            className={`login-input ${errorField === 'email' ? 'error' : ''}`}
          />
          <input
            type="password"
            placeholder="请输入密码"
            className={`login-input ${errorField === 'password' ? 'error' : ''}`}
          />
        </div>

        {/* 错误提示行（默认留空） */}
        <div className="login-validation-slot">
          {errorMessage ? <span className="validation-error">{errorMessage}</span> : null}
        </div>
        <div className="login-continue-area">
          <button className="login-continue-button" onClick={onContinue}>继续</button>
        </div>
        {/* 添加中间带文字的分割线 */}
        <div className="login-modal-divider-with-text">
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

export default LoginPopup;
