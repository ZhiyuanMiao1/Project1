import React, { useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import { getAuthToken } from '../../utils/authStorage';
import './WalletPage.css';

function WalletPage() {
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [errorMessage, setErrorMessage] = useState('');
  const menuAnchorRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    setErrorMessage(isLoggedIn ? '' : '请登录后查看钱包');
  }, [isLoggedIn]);

  return (
    <div className="wallet-page">
      <div className="container">
        <header className="wallet-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle wallet-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="wallet-hero">
          <h1>钱包</h1>
        </section>

        {errorMessage && <div className="wallet-alert">{errorMessage}</div>}

        {isLoggedIn && (
          <section className="wallet-card" aria-label="钱包信息">
            <div className="wallet-card-title">钱包功能开发中</div>
            <div className="wallet-card-subtitle">敬请期待。</div>
          </section>
        )}
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default WalletPage;

