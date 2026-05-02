import React, { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import './LoginPopup.css';
import api from '../../api/client';
import Button from '../common/Button/Button';
import LoadingText from '../common/LoadingText/LoadingText';
import { broadcastAuthLogin, setAuthToken, setAuthUser } from '../../utils/authStorage';
import EmailCodePopup from '../EmailCodePopup/EmailCodePopup';
import {
  getEmailCodeErrorMessage,
  sendPasswordResetEmailCode,
  verifyPasswordResetEmailCode,
} from '../../services/emailCodeService';
import { useI18n } from '../../i18n/language';

const translateAuthMessage = (message, t) => {
  const raw = String(message || '').trim();
  const map = {
    '请输入邮箱、StudentID或MentorID': t('auth.emailOrIdRequired', '请输入邮箱、StudentID或MentorID'),
    '请输入注册邮箱': t('auth.registerEmailRequired', '请输入注册邮箱'),
    '邮箱格式不正确': t('auth.emailInvalid', '邮箱格式不正确'),
    '请输入密码': t('auth.passwordRequired', '请输入密码'),
    '请先完成邮箱验证码验证': t('auth.needEmailCodeFirst', '请先完成邮箱验证码验证'),
    '密码至少6位': t('auth.passwordMin', '密码至少6位'),
    '两次输入的密码不一致': t('auth.passwordMismatch', '两次输入的密码不一致'),
    '验证码发送失败，请稍后再试': t('emailCode.sendFailed', '验证码发送失败，请稍后再试'),
    '密码已重置，请使用新密码登录': t('auth.resetDone', '密码已重置，请使用新密码登录'),
    '提交信息有误': t('auth.submitInvalid', '提交信息有误'),
    '网络异常，请检查网络后重试': t('auth.networkError', '网络异常，请检查网络后重试'),
    '密码重置失败，请稍后再试': t('auth.resetFailed', '密码重置失败，请稍后再试'),
    '邮箱或密码错误': t('auth.loginInvalid', '邮箱或密码错误'),
    '登录失败，请稍后再试': t('auth.loginFailed', '登录失败，请稍后再试'),
  };
  return map[raw] || raw;
};

const LoginPopup = ({ onClose, onContinue, onSuccess, role, errorMessage = '', errorField = '', onGoRegister }) => {
  const { t } = useI18n();
  // 仅在按下也发生在遮罩层上时，才允许点击关闭
  const backdropMouseDownRef = useRef(false);
  const emailRef = useRef(null);
  const pwRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(() => translateAuthMessage(errorMessage, t) || '');
  const [errorFieldState, setErrorFieldState] = useState(errorField || '');
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [focusedPw, setFocusedPw] = useState(false);
  const [mode, setMode] = useState('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetCodeAvailableAt, setResetCodeAvailableAt] = useState(0);
  const [showResetCodePopup, setShowResetCodePopup] = useState(false);
  const [resetOk, setResetOk] = useState('');
  const resetEmailRef = useRef(null);
  const resetPwRef = useRef(null);
  const resetConfirmPwRef = useRef(null);

  const handleBackdropPressStart = (e) => {
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
    const v = String(email || '').trim();
    if (!v) return { message: t('auth.emailOrIdRequired', '请输入邮箱、StudentID或MentorID'), field: 'email' };
    if (v.includes('@') && !/\S+@\S+\.\S+/.test(v)) return { message: t('auth.emailInvalid', '邮箱格式不正确'), field: 'email' };
    if (!password) return { message: t('auth.passwordRequired', '请输入密码'), field: 'password' };
    return null;
  };

  const resetLoginFormError = () => {
    setFieldError('');
    setErrorFieldState('');
  };

  const validateResetEmail = () => {
    const v = String(resetEmail || '').trim();
    if (!v) return { message: t('auth.registerEmailRequired', '请输入注册邮箱'), field: 'resetEmail' };
    if (!/^\S+@\S+\.\S+$/.test(v)) return { message: t('auth.emailInvalid', '邮箱格式不正确'), field: 'resetEmail' };
    return null;
  };

  const validateResetPassword = () => {
    if (!resetToken) return { message: t('auth.needEmailCodeFirst', '请先完成邮箱验证码验证'), field: '' };
    if (!resetNewPassword || resetNewPassword.length < 6) return { message: t('auth.passwordMin', '密码至少6位'), field: 'resetNewPassword' };
    if (resetNewPassword !== resetConfirmPassword) return { message: t('auth.passwordMismatch', '两次输入的密码不一致'), field: 'resetConfirmPassword' };
    return null;
  };

  const handleForgotPassword = () => {
    setMode('resetEmail');
    setResetEmail(String(email || '').includes('@') ? String(email || '').trim() : '');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetToken('');
    setResetOk('');
    resetLoginFormError();
  };

  const handleBackToLogin = () => {
    setMode('login');
    setResetOk('');
    resetLoginFormError();
  };

  const handleSendResetCode = async () => {
    if (submitting) return;
    const v = validateResetEmail();
    if (v) {
      setFieldError(v.message);
      setErrorFieldState(v.field);
      return;
    }

    setSubmitting(true);
    resetLoginFormError();
    setResetOk('');
    try {
      const payload = await sendPasswordResetEmailCode({ email: resetEmail });
      setResetCodeAvailableAt(Date.now() + (Math.max(0, Number(payload?.resendAfterSeconds) || 60) * 1000));
      setShowResetCodePopup(true);
    } catch (error) {
      setFieldError(translateAuthMessage(getEmailCodeErrorMessage(error, t('emailCode.sendFailed', '验证码发送失败，请稍后再试')), t));
      setErrorFieldState('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (submitting) return;
    const v = validateResetPassword();
    if (v) {
      setFieldError(v.message);
      setErrorFieldState(v.field);
      return;
    }

    setSubmitting(true);
    resetLoginFormError();
    setResetOk('');
    try {
      const res = await api.post('/api/auth/reset-password', {
        email: resetEmail,
        emailVerificationToken: resetToken,
        newPassword: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });
      setResetOk(translateAuthMessage(res?.data?.message || t('auth.resetDone', '密码已重置，请使用新密码登录'), t));
      setPassword('');
      setEmail(resetEmail);
      setTimeout(() => {
        setMode('login');
        setResetNewPassword('');
        setResetConfirmPassword('');
        setResetToken('');
      }, 1000);
    } catch (e) {
      const data = e?.response?.data;
      const serverErrors = Array.isArray(data?.errors) ? data.errors : null;
      if (serverErrors && serverErrors.length > 0) {
        setFieldError(translateAuthMessage(serverErrors[0]?.msg || t('auth.submitInvalid', '提交信息有误'), t));
      } else {
        setFieldError(translateAuthMessage(data?.error || (e?.request && !e?.response ? t('auth.networkError', '网络异常，请检查网络后重试') : t('auth.resetFailed', '密码重置失败，请稍后再试')), t));
      }
      setErrorFieldState('');
    } finally {
      setSubmitting(false);
    }
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
        setAuthToken(token);
        setAuthUser(user || {});
        broadcastAuthLogin({ token, user });
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
        const message = translateAuthMessage(first?.msg || t('auth.submitInvalid', '提交信息有误'), t);
        let field = '';
        if (first?.param === 'email') field = 'email';
        else if (first?.param === 'password') field = 'password';
        setFieldError(message);
        setErrorFieldState(field);
        setSubmitting(false);
        return;
      }

      if (status === 401) {
        setFieldError(translateAuthMessage(data?.error || t('auth.loginInvalid', '邮箱或密码错误'), t));
        setErrorFieldState('password');
        setSubmitting(false);
        return;
      }

      const fallbackMsg = data?.error || (e?.request && !e?.response ? t('auth.networkError', '网络异常，请检查网络后重试') : t('auth.loginFailed', '登录失败，请稍后再试'));
      setFieldError(translateAuthMessage(fallbackMsg, t));
      setErrorFieldState('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="login-modal-overlay"
      onMouseDown={handleBackdropPressStart}
      onTouchStart={handleBackdropPressStart}
      onClick={handleBackdropClick}
    >
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <FiX aria-hidden="true" />
        </button>
        <h2>{mode === 'login' ? t('auth.loginTitle', '登录') : t('auth.resetTitle', '重置密码')}</h2>
        <div className="login-modal-divider"></div>
        <h3>{mode === 'login'
          ? t('auth.loginWelcome', '欢迎回来，Mentory用户')
          : (mode === 'resetEmail' ? t('auth.resetEmailTitle', '通过邮箱验证身份') : t('auth.resetPasswordTitle', '设置新的登录密码'))}</h3>
        {mode === 'login' ? (
          <div className="login-input-area">
            <input
              ref={emailRef}
              type="text"
              placeholder={t('auth.emailOrIdPlaceholder', '请输入邮箱、StudentID或MentorID')}
              className={`login-input ${errorFieldState === 'email' ? 'error' : ''}`}
              value={email}
              onChange={(e) => {
                const v = e.target.value;
                setEmail(v);
                const vv = String(v || '').trim();
                const ok = vv && (!vv.includes('@') || /\S+@\S+\.\S+/.test(vv));
                if (errorFieldState === 'email' && ok) {
                  setErrorFieldState('');
                  setFieldError('');
                }
              }}
            />
            <div className="input-with-toggle">
              <input
                ref={pwRef}
                type={showPw ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder', '请输入密码')}
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
                  aria-label={showPw ? t('auth.hidePassword', '隐藏密码') : t('auth.showPassword', '显示密码')}
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
        ) : (
          <div className="login-input-area">
            <input
              ref={resetEmailRef}
              type="email"
              placeholder={t('auth.registerEmailPlaceholder', '请输入注册邮箱')}
              className={`login-input ${errorFieldState === 'resetEmail' ? 'error' : ''}`}
              value={resetEmail}
              disabled={mode === 'resetPassword'}
              onChange={(e) => {
                setResetEmail(e.target.value);
                if (errorFieldState === 'resetEmail') resetLoginFormError();
              }}
            />
            {mode === 'resetPassword' && (
              <>
                <input
                  ref={resetPwRef}
                  type="password"
                  placeholder={t('auth.newPasswordPlaceholder', '请输入新密码')}
                  className={`login-input ${errorFieldState === 'resetNewPassword' ? 'error' : ''}`}
                  value={resetNewPassword}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setResetNewPassword(e.target.value);
                    if (errorFieldState === 'resetNewPassword') resetLoginFormError();
                  }}
                />
                <input
                  ref={resetConfirmPwRef}
                  type="password"
                  placeholder={t('auth.confirmNewPasswordPlaceholder', '请再次输入新密码')}
                  className={`login-input ${errorFieldState === 'resetConfirmPassword' ? 'error' : ''}`}
                  value={resetConfirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setResetConfirmPassword(e.target.value);
                    if (errorFieldState === 'resetConfirmPassword') resetLoginFormError();
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* 顶部辅助链接行：左“忘记密码”，右“前往注册” */}
        <div className="login-helper-row">
          <button
            type="button"
            className="helper-link left"
            onClick={(e) => { e.preventDefault(); mode === 'login' ? handleForgotPassword() : handleBackToLogin(); }}
          >
            {mode === 'login' ? t('auth.forgotPassword', '忘记密码？') : t('auth.backToLogin', '返回登录')}
          </button>
          {mode === 'login' ? (
            <button
              type="button"
              className="helper-link right"
              onClick={(e) => { e.preventDefault(); if (typeof onGoRegister === 'function') onGoRegister(); }}
            >
              {t('auth.goRegister', '前往注册')}
            </button>
          ) : null}
        </div>

        {/* 错误提示行（下移一行显示） */}
        <div className="login-validation-slot">
          {fieldError ? <span className="validation-error">{fieldError}</span> : (resetOk ? <span className="validation-success">{resetOk}</span> : null)}
        </div>
        <div className="login-continue-area">
          <Button
            className="login-continue-button"
            onClick={mode === 'login' ? handleContinue : (mode === 'resetEmail' ? handleSendResetCode : handleResetPassword)}
            disabled={submitting}
            fullWidth
          >
            {submitting ? <LoadingText text={t('common.processing', '处理中...')} /> : (mode === 'login' ? t('auth.continue', '继续') : (mode === 'resetEmail' ? t('auth.sendCode', '发送验证码') : t('auth.resetPassword', '重置密码')))}
          </Button>
        </div>
        {mode === 'login' && (
          <>
            <div className="login-modal-divider-with-text">
              <span className="divider-text">{t('auth.socialUnavailable', '或（暂未开放）')}</span>
            </div>
            <div className="social-login-buttons">
              <button className="social-button wechat-login">
                <img src="/images/wechat-icon.png" alt="WeChat" className="social-icon" />
                {t('auth.wechatLogin', '使用微信登录')}
              </button>
              <button className="social-button google-login">
                <img src="/images/google-icon.png" alt="Google" className="social-icon" />
                {t('auth.googleLogin', '使用 Google 账号登录')}
              </button>
            </div>
          </>
        )}
        {showResetCodePopup && (
          <EmailCodePopup
            email={resetEmail}
            title={t('auth.resetCodeTitle', '重置密码验证码')}
            initialCountdownSeconds={Math.max(0, Math.ceil((resetCodeAvailableAt - Date.now()) / 1000))}
            sendEmailCode={sendPasswordResetEmailCode}
            verifyEmailCode={verifyPasswordResetEmailCode}
            onClose={() => setShowResetCodePopup(false)}
            onResendSuccess={(seconds) => setResetCodeAvailableAt(Date.now() + seconds * 1000)}
            onVerified={(payload) => {
              setResetToken(payload?.verificationToken || '');
              setShowResetCodePopup(false);
              setMode('resetPassword');
              resetLoginFormError();
              requestAnimationFrame(() => resetPwRef.current?.focus());
            }}
          />
        )}
      </div>
    </div>
  );
};

export default LoginPopup;
