import React, { useEffect, useRef, useState } from 'react';
import './LoginPopup.css';
import api from '../../api/client';

const LoginPopup = ({ onClose, onContinue, onSuccess, role, errorMessage = '', errorField = '', onGoRegister }) => {
  // 仅在按下也发生在遮罩层上时，才允许点击关闭
  const backdropMouseDownRef = useRef(false);
  const emailRef = useRef(null);
  const pwRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(errorMessage || '');
  const [errorFieldState, setErrorFieldState] = useState(errorField || '');
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [focusedPw, setFocusedPw] = useState(false);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    onClose && onClose();
  };

  useEffect(() => {
    const target = errorFieldState === 'email' ? emailRef.current : (errorFieldState === 'password' ? pwRef.current : null);
    if (target) requestAnimationFrame(() => target.focus());
  }, [errorFieldState, fieldError]);

  const validate = () => {
    if (!email) return { message: '请输入邮箱', field: 'email' };
    if (!/\S+@\S+\.\S+/.test(email)) return { message: '邮箱格式不正确', field: 'email' };
    if (!password) return { message: '请输入密码', field: 'password' };
    return null;
  };

  const handleContinue = async () => {
    if (submitting) return;
    const v = validate();
    if (v) {
      setFieldError(v.message);
      setErrorFieldState(v.field);
      return;
    }
    setSubmitting(true);
    setFieldError('');
    setErrorFieldState('');
    try {
      const res = await api.post('/api/login', { email, password });
      const { token, user } = res.data || {};
      if (token) {
        try {
          localStorage.setItem('authToken', token);
          localStorage.setItem('authUser', JSON.stringify(user || {}));
        } catch {}
        try { api.defaults.headers.common['Authorization'] = `Bearer ${token}`; } catch {}
        try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: true, role: user?.role, user } })); } catch {}
      }
      if (typeof onSuccess === 'function') {
        onSuccess(res.data);
      }
      if (typeof onContinue === 'function') onContinue();
      onClose && onClose();
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      const serverErrors = Array.isArray(data?.errors) ? data.errors : null;
      if (serverErrors && serverErrors.length > 0) {
        const first = serverErrors[0];
        const message = first?.msg || '提交信息有误';
        let field = '';
        if (first?.param === 'email') field = 'email';
        else if (first?.param === 'password') field = 'password';
        setFieldError(message);
        setErrorFieldState(field);
        setSubmitting(false);
        return;
      }

      if (status === 401) {
        setFieldError(data?.error || '邮箱或密码错误');
        setErrorFieldState('password');
        setSubmitting(false);
        return;
      }

      const fallbackMsg = data?.error || (e?.request && !e?.response ? '网络异常，请检查网络后重试' : '登录失败，请稍后再试');
      setFieldError(fallbackMsg);
      setErrorFieldState('');
    } finally {
      setSubmitting(false);
    }
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
            ref={emailRef}
            type="email"
            placeholder="请输入邮箱、StudentID或MentorID"
            className={`login-input ${errorFieldState === 'email' ? 'error' : ''}`}
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              if (errorFieldState === 'email' && /\S+@\S+\.\S+/.test(v)) {
                setErrorFieldState('');
                setFieldError('');
              }
            }}
          />
          <div className="input-with-toggle">
            <input
              ref={pwRef}
              type={showPw ? 'text' : 'password'}
              placeholder="请输入密码"
              className={`login-input ${errorFieldState === 'password' ? 'error' : ''}`}
              value={password}
              onFocus={() => setFocusedPw(true)}
              onBlur={() => setFocusedPw(false)}
              onChange={(e) => {
                const v = e.target.value;
                setPassword(v);
                if (errorFieldState === 'password' && v) {
                  setErrorFieldState('');
                  setFieldError('');
                }
              }}
            />
            {(focusedPw && password) && (
              <button
                type="button"
                className="toggle-password"
                aria-label={showPw ? '隐藏密码' : '显示密码'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4.5 14.4 Q12 7 19.5 14.4"
                          stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="16" r="3.2"
                            fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4.5 14.4 Q12 7 19.5 14.4"
                          stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="16" r="3.2"
                            fill="none" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M18 10 L6 22"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 顶部辅助链接行：左“忘记密码”，右“前往注册” */}
        <div className="login-helper-row">
          <button
            type="button"
            className="helper-link left"
            onClick={(e) => { e.preventDefault(); /* 预留：忘记密码 */ }}
          >
            忘记密码？
          </button>
          <button
            type="button"
            className="helper-link right"
            onClick={(e) => { e.preventDefault(); if (typeof onGoRegister === 'function') onGoRegister(); }}
          >
            前往注册
          </button>
        </div>

        {/* 错误提示行（下移一行显示） */}
        <div className="login-validation-slot">
          {fieldError ? <span className="validation-error">{fieldError}</span> : null}
        </div>
        <div className="login-continue-area">
          <button className="login-continue-button" onClick={handleContinue} disabled={submitting}>继续</button>
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
