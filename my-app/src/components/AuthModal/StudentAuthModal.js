import React, { useState } from 'react';
import RegisterPopup from '../RegisterPopup/RegisterPopup';
import LoginPopup from '../LoginPopup/LoginPopup';
import './AuthModal.css';

const StudentAuthModal = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // 用户是否登录
  const [user, setUser] = useState(null); // 存储用户信息
  const [showAuthModal, setShowAuthModal] = useState(false); // 控制主弹窗显示
  const [showRegisterPopup, setShowRegisterPopup] = useState(false); // 控制注册弹窗
  const [showLoginPopup, setShowLoginPopup] = useState(false); // 控制登录弹窗

  // 打开/关闭弹窗
  const toggleAuthModal = () => {
    setShowAuthModal(!showAuthModal);
  };

  // 处理用户登录
  const handleLoginSuccess = (userData) => {
    setUser(userData); // 存储用户信息
    setIsLoggedIn(true);
    setShowAuthModal(false); // 关闭弹窗
  };

  // 处理退出登录
  const handleLogout = () => {
    setUser(null);
    setIsLoggedIn(false);
    setShowAuthModal(false);
  };

  return (
    <div>
      {/* 右上角按钮，控制弹窗 */}
      <button className="auth-btn" onClick={toggleAuthModal}>
        {isLoggedIn ? (
          <div className="user-info">
            <img src={user?.avatar || "/default-avatar.jpg"} alt="User Avatar" className="avatar" />
            <span>{user?.name || "用户"}</span>
          </div>
        ) : (
          <span>登录/注册</span>
        )}
      </button>

      {/* 弹窗内容 */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={toggleAuthModal}>
          <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
            {isLoggedIn ? (
              // 已登录时的内容
              <div className="user-menu">
                <h2>欢迎，{user.name}!</h2>
                <button onClick={handleLogout}>退出登录</button>
              </div>
            ) : (
              // 未登录时的内容
              <div className="auth-modal-options">
                <button className="auth-modal-option-button" onClick={() => setShowRegisterPopup(true)}>
                  注册
                </button>
                <button className="auth-modal-option-button auth-divider" onClick={() => setShowLoginPopup(true)}>
                  登录
                </button>
                <button className="auth-modal-option-button">发布课程需求</button>
                <button className="auth-modal-option-button">帮助中心</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 注册弹窗 */}
      {showRegisterPopup && <RegisterPopup onClose={() => setShowRegisterPopup(false)} />}

      {/* 登录弹窗 */}
      {showLoginPopup && <LoginPopup onClose={() => setShowLoginPopup(false)} onLoginSuccess={handleLoginSuccess} />}
    </div>
  );
};

export default StudentAuthModal;
