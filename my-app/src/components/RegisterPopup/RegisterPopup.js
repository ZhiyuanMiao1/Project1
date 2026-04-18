import React, { useRef, useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import './RegisterPopup.css';
import StudentWelcomePopup from '../StudentWelcomePopup/StudentWelcomePopup';
import MentorActivationPopup from '../MentorActivationPopup/MentorActivationPopup';
import EmailCodePopup from '../EmailCodePopup/EmailCodePopup';
import Button from '../common/Button/Button';
import api from '../../api/client';
import { broadcastAuthLogin, setAuthToken, setAuthUser } from '../../utils/authStorage';
import { consumePostLoginRedirect } from '../../utils/postLoginRedirect';
import { getEmailCodeErrorMessage, sendRegisterEmailCode } from '../../services/emailCodeService';
import { useI18n } from '../../i18n/language';

const translateAuthMessage = (message, t) => {
  const raw = String(message || '').trim();
  const map = {
    '请输入邮箱': t('auth.emailRequired', '请输入邮箱'),
    '邮箱格式不正确': t('auth.emailInvalid', '邮箱格式不正确'),
    '密码至少6位': t('auth.passwordMin', '密码至少6位'),
    '两次输入的密码不一致': t('auth.passwordMismatch', '两次输入的密码不一致'),
    '请选择角色': t('auth.roleRequired', '请选择角色'),
    '提交信息有误': t('auth.submitInvalid', '提交信息有误'),
    '该邮箱已被注册': t('auth.emailRegistered', '该邮箱已被注册'),
    '网络异常，请检查网络后重试': t('auth.networkError', '网络异常，请检查网络后重试'),
    '注册失败，请稍后再试': t('auth.registerFailed', '注册失败，请稍后再试'),
    '注册成功，已自动登录': t('auth.registerDone', '注册成功，已自动登录'),
    '注册成功，但自动登录失败，请手动登录': t('auth.autoLoginFailed', '注册成功，但自动登录失败，请手动登录'),
    '注册成功，正在关闭...': t('auth.registerClosing', '注册成功，正在关闭...'),
    '验证码发送失败，请稍后再试': t('emailCode.sendFailed', '验证码发送失败，请稍后再试'),
  };
  return map[raw] || raw;
};

const RegisterPopup = ({ onClose, onSuccess }) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('student');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [errorFocusTick, setErrorFocusTick] = useState(0);
  const [ok, setOk] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);
  const [showMentorActivation, setShowMentorActivation] = useState(false);
  const [showEmailCodePopup, setShowEmailCodePopup] = useState(false);
  const [emailCodeAvailableAt, setEmailCodeAvailableAt] = useState(0);
  const [emailVerificationToken, setEmailVerificationToken] = useState('');
  const [pendingEmailCodeEmail, setPendingEmailCodeEmail] = useState('');
  const [publicId, setPublicId] = useState('');
  const successAnim = !!ok;
  // eye + focus control
  const emailRef = useRef(null);
  const pw1Ref   = useRef(null);
  const pw2Ref   = useRef(null);

  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [focusedField, setFocusedField] = useState(''); // 'password' | 'confirmPassword' | ''
  const navigate = useNavigate();
  const pendingUploadKeyRef = useRef(
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID().replace(/-/g, '')
      : `mentor-${Date.now()}`
  );
  const normalizeEmailValue = (value) => String(value || '').trim().toLowerCase();

  const validate = () => {
    if (!email) return { message: t('auth.emailRequired', '请输入邮箱'), field: 'email' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { message: t('auth.emailInvalid', '邮箱格式不正确'), field: 'email' };
    if (!password || password.length < 6) return { message: t('auth.passwordMin', '密码至少6位'), field: 'password' };
    if (password !== confirmPassword) return { message: t('auth.passwordMismatch', '两次输入的密码不一致'), field: 'confirmPassword' };
    if (!['student', 'mentor'].includes(role)) return { message: t('auth.roleRequired', '请选择角色'), field: 'role' };
    return null;
  };

  const submitRegistration = async (extraPayload = {}, options = {}) => {
    const { rethrow = false } = options;
    setSubmitting(true);
    setFieldError('');
    setErrorField('');
    setSubmitError('');
    setOk('');
    try {
      const res = await api.post('/api/register', { email, password, role, ...extraPayload });

      // 学生注册成功后，自动登录并跳转学生首页（显示2秒三点动画后再跳转）
      if (role === 'student') {
        try {
          const loginRes = await api.post('/api/login', { email, password, role: 'student' });
          const { token, user } = loginRes.data || {};
          if (token) {
            setAuthToken(token);
            setAuthUser(user || {});
            broadcastAuthLogin({ token, user });
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
              // 通知全局（含当前标签页）登录状态已变化
              window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: true, role: 'student', user } }));
            } catch {}
          }
          // 触发成功动画（按钮显示三点），2秒后显示欢迎弹窗
          const pid = (user && user.public_id) || res?.data?.public_id || '';
          setPublicId(pid || '');
          setOk(t('auth.registerDone', '注册成功，已自动登录'));
          setTimeout(() => {
            setShowWelcome(true);
          }, 2000);
          return;
        } catch (loginErr) {
          // 自动登录失败时的提示，但保留注册成功结果
          const data = loginErr?.response?.data;
          const fallbackMsg = data?.error || t('auth.autoLoginFailed', '注册成功，但自动登录失败，请手动登录');
          setFieldError(translateAuthMessage(fallbackMsg, t));
          setErrorField('');
          setSubmitError('');
          if (typeof onSuccess === 'function') {
            onSuccess({ ...res.data, autoLoggedIn: false, role: 'student' });
          }
          // 不跳转，保持弹窗以便用户查看提示
          return;
        }
      }

      // 导师注册：自动登录并跳转导师页；导师卡片将因未审核而显示“审核中”
      if (role === 'mentor') {
        try {
          const loginRes = await api.post('/api/login', { email, password, role: 'mentor' });
          const { token, user } = loginRes.data || {};
          if (token) {
            setAuthToken(token);
            setAuthUser(user || {});
            broadcastAuthLogin({ token, user });
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
              window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: true, role: 'mentor', user } }));
            } catch {}
          }
          setOk(t('auth.registerDone', '注册成功，已自动登录'));
          // 三点动画 2 秒后，关闭弹窗并进入导师页
          setTimeout(() => {
            try { onClose && onClose(); } catch {}
            try { onSuccess && onSuccess({ autoLoggedIn: true, role: 'mentor' }); } catch {}
            const target = consumePostLoginRedirect() || '/mentor';
            try { navigate(target, { replace: true }); } catch {}
          }, 2000);
          return;
        } catch (loginErr) {
          const data = loginErr?.response?.data;
          const fallbackMsg = data?.error || t('auth.autoLoginFailed', '注册成功，但自动登录失败，请手动登录');
          setFieldError(translateAuthMessage(fallbackMsg, t));
          setErrorField('');
          setSubmitError('');
          if (typeof onSuccess === 'function') {
            onSuccess({ ...res.data, autoLoggedIn: false, role: 'mentor' });
          }
          return;
        }
      }

      // 其他情况：沿用原有成功提示与自动关闭（2秒）
      setOk(t('auth.registerClosing', '注册成功，正在关闭...'));
      if (typeof onSuccess === 'function') setTimeout(() => onSuccess(res.data), 2000);
      setTimeout(() => { onClose && onClose(); }, 2000);
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      // 1) 处理后端字段级校验错误（400，express-validator 的 errors 数组）
      const serverErrors = Array.isArray(data?.errors) ? data.errors : null;
      if (serverErrors && serverErrors.length > 0) {
        const first = serverErrors[0];
        const message = translateAuthMessage(first?.msg || t('auth.submitInvalid', '提交信息有误'), t);
        let field = '';
        if (first?.param === 'email') field = 'email';
        else if (first?.param === 'password') field = 'password';
        // 其余如 role/username 在此表单无对应输入控件，不聚焦具体输入框

        setFieldError(message);
        setErrorField(field);
        setErrorFocusTick((t) => t + 1);
        setSubmitError('');
        if (rethrow) throw e;
        return;
      }

      // 2) 邮箱重复（409）— 行内提示并聚焦邮箱
      if (data?.error === '该邮箱已被注册' || status === 409) {
        setFieldError(t('auth.emailRegistered', '该邮箱已被注册'));
        setErrorField('email');
        setErrorFocusTick((t) => t + 1);
        setSubmitError('');
        if (rethrow) throw e;
        return;
      }

      // 3) 服务器或网络等其它错误 — 统一行内提示（不聚焦具体字段）
      const fallbackMsg = data?.error || (e?.request && !e?.response ? t('auth.networkError', '网络异常，请检查网络后重试') : t('auth.registerFailed', '注册失败，请稍后再试'));
      setFieldError(translateAuthMessage(fallbackMsg, t));
      setErrorField('');
      setSubmitError('');
      if (rethrow) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = async () => {
    const v = validate();
    if (v) {
      setFieldError(v.message);
      setErrorField(v.field || '');
      setErrorFocusTick(t => t + 1); // 强制重新聚焦同一字段
      return;
    }

    if (emailVerificationToken && normalizeEmailValue(pendingEmailCodeEmail) === normalizeEmailValue(email)) {
      if (role === 'mentor') {
        setFieldError('');
        setErrorField('');
        setSubmitError('');
        setShowMentorActivation(true);
        return;
      }

      await submitRegistration({ emailVerificationToken });
      return;
    }

    if (normalizeEmailValue(pendingEmailCodeEmail) === normalizeEmailValue(email)) {
      setFieldError('');
      setErrorField('');
      setSubmitError('');
      setShowEmailCodePopup(true);
      return;
    }

    setSubmitting(true);
    setFieldError('');
    setErrorField('');
    setSubmitError('');
    setOk('');
    try {
      const payload = await sendRegisterEmailCode({ email });
      setPendingEmailCodeEmail(email);
      setEmailCodeAvailableAt(Date.now() + (Math.max(0, Number(payload?.resendAfterSeconds) || 60) * 1000));
      setShowEmailCodePopup(true);
    } catch (error) {
      setFieldError(translateAuthMessage(getEmailCodeErrorMessage(error, t('emailCode.sendFailed', '验证码发送失败，请稍后再试')), t));
      setErrorField('');
    } finally {
      setSubmitting(false);
    }
  };

  // mask click-to-close
  const backdropMouseDownRef = useRef(false);
  const handleBackdropPressStart = (e) => {
    if (showWelcome || showMentorActivation || showEmailCodePopup) { // 子步骤显示时，禁止通过点击遮罩关闭
      backdropMouseDownRef.current = false;
      return;
    }
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };
  const handleBackdropClick = (e) => {
    if (showWelcome || showMentorActivation || showEmailCodePopup) return; // 子步骤显示时，点击外侧不关闭
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    onClose && onClose();
  };

  useEffect(() => {
    if (!errorField) return;
    const map = { email: emailRef, password: pw1Ref, confirmPassword: pw2Ref };
    const target = map[errorField]?.current;
    if (target) {
      // 下一帧再 focus，确保最新的样式与状态已应用，避免与按钮点击的焦点竞争
      requestAnimationFrame(() => target.focus());
    }
  }, [errorField, errorFocusTick]);

  return (
    <div className="register-modal-overlay" onMouseDown={handleBackdropPressStart} onTouchStart={handleBackdropPressStart} onClick={handleBackdropClick}>
      <div
        className="register-modal-content"
        style={{ display: (showWelcome || showMentorActivation || showEmailCodePopup) ? 'none' : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="register-modal-close" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <FiX aria-hidden="true" />
        </button>
        <h2>{t('auth.registerTitle', '注册')}</h2>
        <div className="register-modal-divider" />
        <h3>{t('auth.registerWelcome', 'Mentory欢迎您')}</h3>

        <div className="register-input-area">
          <input
            ref={emailRef}
            type="email"
            placeholder={t('auth.emailPlaceholder', '请输入邮箱')}
            className={`register-input ${errorField === 'email' ? 'error' : ''}`}
            value={email}
            onFocus={() => setFocusedField('email')}   // 不清空错误
            onBlur={() => setFocusedField('')}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              setPendingEmailCodeEmail('');
              setEmailCodeAvailableAt(0);
              setEmailVerificationToken('');
              if (errorField === 'email') {
                if (/^\S+@\S+\.\S+$/.test(v))  { setErrorField(''); setFieldError(''); }
              }
            }}
          />

          {/* 密码 */}
          <div className="input-with-toggle">
            <input
              ref={pw1Ref}
              type={showPw1 ? 'text' : 'password'}
              placeholder={t('auth.passwordPlaceholder', '请输入密码')}
              className={`register-input ${errorField === 'password' ? 'error' : ''}`}
              value={password}
              onFocus={() => { setFocusedField('password'); }}   // 不清空错误
              onBlur={() => setFocusedField('')}
              onChange={(e) => {
                const v = e.target.value;
                setPassword(v);
                if (errorField === 'password') {
                  if (v && v.length >= 6){ setErrorField(''); setFieldError(''); }
                }
              }}
            />
            {(focusedField === 'password' && password) && (
              <button
                type="button"
                className="toggle-password"
                aria-label={showPw1 ? t('auth.hidePassword', '隐藏密码') : t('auth.showPassword', '显示密码')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPw1((s) => !s)}
              >
                {showPw1 ? (
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

          {/* 确认密码 */}
          <div className="input-with-toggle">
            <input
              ref={pw2Ref}
              type={showPw2 ? 'text' : 'password'}
              placeholder={t('auth.confirmPasswordPlaceholder', '请确认密码')}
              className={`register-input ${errorField === 'confirmPassword' ? 'error' : ''}`}
              value={confirmPassword}
              onFocus={() => { setFocusedField('confirmPassword'); }}   // 不清空错误
              onBlur={() => setFocusedField('')}
              onChange={(e) => {
                const v = e.target.value;
                setConfirmPassword(v);
                if (errorField === 'confirmPassword') { 
                  if (v === password) {setErrorField(''); setFieldError(''); }
                }
              }}
            />
            {(focusedField === 'confirmPassword' && confirmPassword) && (
              <button
                type="button"
                className="toggle-password"
                aria-label={showPw2 ? t('auth.hidePassword', '隐藏密码') : t('auth.showPassword', '显示密码')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPw2((s) => !s)}
              >
                {showPw2 ? (
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

        <div className="register-validation-slot">
          {fieldError ? (
            <span className="validation-error">{fieldError}</span>
          ) : (
            <span className="validation-tip">{t('auth.sameEmailTip', '同一邮箱可注册两种身份，需分别完成学生/导师注册')}</span>
          )}
        </div>

        <div className="register-button-group">
          <button
            className={`register-button student-button ${role === 'student' ? 'active' : ''}`}
            onClick={() => setRole('student')}
            type="button"
          >
            {t('auth.studentRole', '我是学生')}
          </button>
          <button
            className={`register-button mentor-button ${role === 'mentor' ? 'active' : ''}`}
            onClick={() => setRole('mentor')}
            type="button"
          >
            {t('auth.mentorRole', '我是导师（需审核）')}
          </button>
        </div>

        <div className="register-continue-area">
          <Button
            className={`register-continue-button ${successAnim ? 'success-pending' : ''}`}
            onClick={handleContinue}
            disabled={submitting || successAnim}
            fullWidth
          >
            {t('auth.continue', '继续')}
          </Button>
        </div>

        {submitError && <div className="register-message error">{submitError}</div>}

        <div className="register-modal-divider-with-text"><span className="divider-text">{t('auth.socialUnavailable', '或（暂未开放）')}</span></div>

        <div className="social-login-buttons">
          <button className="social-button wechat-login" disabled>
            <img src="/images/wechat-icon.png" alt="WeChat" className="social-icon" />
            {t('auth.wechatLogin', '使用微信登录')}
          </button>
          <button className="social-button google-login" disabled>
            <img src="/images/google-icon.png" alt="Google" className="social-icon" />
            {t('auth.googleLogin', '使用 Google 账号登录')}
          </button>
        </div>
      </div>
      {showWelcome && (
        <StudentWelcomePopup
          publicId={publicId}
          onConfirm={() => {
            // 关闭欢迎弹窗与注册弹窗，进入学生首页，并触发入场动画
            setShowWelcome(false);
            if (typeof onSuccess === 'function') {
              try { onSuccess({ autoLoggedIn: true, role: 'student', publicId }); } catch {}
            }
            try { onClose && onClose(); } catch {}
            const target = consumePostLoginRedirect() || '/student';
            try { navigate(target, { replace: true }); } catch {}
            if (target === '/student') {
              try { setTimeout(() => window.dispatchEvent(new Event('home:enter')), 0); } catch {}
            }
          }}
          onClose={() => {
            // 行为同“我知道了”
            setShowWelcome(false);
            if (typeof onSuccess === 'function') {
              try { onSuccess({ autoLoggedIn: true, role: 'student', publicId }); } catch {}
            }
            try { onClose && onClose(); } catch {}
            const target = consumePostLoginRedirect() || '/student';
            try { navigate(target, { replace: true }); } catch {}
            if (target === '/student') {
              try { setTimeout(() => window.dispatchEvent(new Event('home:enter')), 0); } catch {}
            }
          }}
        />
      )}
      {showEmailCodePopup && (
        <EmailCodePopup
          email={email}
          initialCountdownSeconds={Math.max(0, Math.ceil((emailCodeAvailableAt - Date.now()) / 1000))}
          onClose={() => setShowEmailCodePopup(false)}
          onResendSuccess={(seconds) => {
            setEmailCodeAvailableAt(Date.now() + (Math.max(0, Number(seconds) || 60) * 1000));
          }}
          onVerified={async (payload) => {
            const verificationToken = String(payload?.verificationToken || '');
            setEmailVerificationToken(verificationToken);
            setPendingEmailCodeEmail(email);
            setShowEmailCodePopup(false);

            if (role === 'mentor') {
              setShowMentorActivation(true);
              return;
            }

            await submitRegistration({ emailVerificationToken: verificationToken });
          }}
        />
      )}
      {showMentorActivation && (
        <MentorActivationPopup
          pendingUploadKey={pendingUploadKeyRef.current}
          onClose={() => setShowMentorActivation(false)}
          onSubmit={({ resumeUrls }) => submitRegistration({ resumeUrls, emailVerificationToken }, { rethrow: true })}
          onSuccess={() => {
            setShowMentorActivation(false);
          }}
        />
      )}
    </div>
  );
};

export default RegisterPopup;
