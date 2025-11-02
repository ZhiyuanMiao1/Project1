import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './RegisterPopup.css';
import StudentWelcomePopup from '../StudentWelcomePopup/StudentWelcomePopup';
import api from '../../api/client';

const RegisterPopup = ({ onClose, onSuccess }) => {
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

  const validate = () => {
    if (!email) return { message: '请输入邮箱', field: 'email' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { message: '邮箱格式不正确', field: 'email' };
    if (!password || password.length < 6) return { message: '密码至少6位', field: 'password' };
    if (password !== confirmPassword) return { message: '两次输入的密码不一致', field: 'confirmPassword' };
    if (!['student', 'mentor'].includes(role)) return { message: '请选择角色', field: 'role' };
    return null;
  };

  const handleContinue = async () => {
    const v = validate();
    if (v) {
      setFieldError(v.message);
      setErrorField(v.field || '');
      setErrorFocusTick(t => t + 1); // 强制重新聚焦同一字段
      return;
    }
    setSubmitting(true);
    setFieldError('');
    setErrorField('');
    setSubmitError('');
    setOk('');
    try {
      const res = await api.post('/api/register', { email, password, role });

      // 学生注册成功后，自动登录并跳转学生首页（显示2秒三点动画后再跳转）
      if (role === 'student') {
        try {
          const loginRes = await api.post('/api/login', { email, password, role: 'student' });
          const { token, user } = loginRes.data || {};
          if (token) {
            try {
              localStorage.setItem('authToken', token);
              localStorage.setItem('authUser', JSON.stringify(user || {}));
            } catch {}
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
              // 通知全局（含当前标签页）登录状态已变化
              window.dispatchEvent(new CustomEvent('auth:changed', { detail: { isLoggedIn: true, role: 'student', user } }));
            } catch {}
          }
          // 触发成功动画（按钮显示三点），2秒后显示欢迎弹窗
          const pid = (user && user.public_id) || res?.data?.public_id || '';
          setPublicId(pid || '');
          setOk('注册成功，已自动登录');
          setTimeout(() => {
            setShowWelcome(true);
          }, 2000);
          return;
        } catch (loginErr) {
          // 自动登录失败时的提示，但保留注册成功结果
          const data = loginErr?.response?.data;
          const fallbackMsg = data?.error || '注册成功，但自动登录失败，请手动登录';
          setFieldError(fallbackMsg);
          setErrorField('');
          setSubmitError('');
          if (typeof onSuccess === 'function') {
            onSuccess({ ...res.data, autoLoggedIn: false, role: 'student' });
          }
          // 不跳转，保持弹窗以便用户查看提示
          return;
        }
      }

      // 导师注册或其他情况：沿用原有成功提示与自动关闭（2秒）
      setOk('注册成功，正在关闭...');
      if (typeof onSuccess === 'function') setTimeout(() => onSuccess(res.data), 2000);
      setTimeout(() => { onClose && onClose(); }, 2000);
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      // 1) 处理后端字段级校验错误（400，express-validator 的 errors 数组）
      const serverErrors = Array.isArray(data?.errors) ? data.errors : null;
      if (serverErrors && serverErrors.length > 0) {
        const first = serverErrors[0];
        const message = first?.msg || '提交信息有误';
        let field = '';
        if (first?.param === 'email') field = 'email';
        else if (first?.param === 'password') field = 'password';
        // 其余如 role/username 在此表单无对应输入控件，不聚焦具体输入框

        setFieldError(message);
        setErrorField(field);
        setErrorFocusTick((t) => t + 1);
        setSubmitError('');
        return;
      }

      // 2) 邮箱重复（409）— 行内提示并聚焦邮箱
      if (data?.error === '该邮箱已被注册' || status === 409) {
        setFieldError('该邮箱已被注册');
        setErrorField('email');
        setErrorFocusTick((t) => t + 1);
        setSubmitError('');
        return;
      }

      // 3) 服务器或网络等其它错误 — 统一行内提示（不聚焦具体字段）
      const fallbackMsg = data?.error || (e?.request && !e?.response ? '网络异常，请检查网络后重试' : '注册失败，请稍后再试');
      setFieldError(fallbackMsg);
      setErrorField('');
      setSubmitError('');
    } finally {
      setSubmitting(false);
    }
  };

  // mask click-to-close
  const backdropMouseDownRef = useRef(false);
  const handleBackdropMouseDown = (e) => {
    if (showWelcome) { // 欢迎弹窗显示时，禁止通过点击遮罩关闭
      backdropMouseDownRef.current = false;
      return;
    }
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };
  const handleBackdropClick = (e) => {
    if (showWelcome) return; // 欢迎弹窗显示时，点击外侧不关闭
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
    <div className="register-modal-overlay" onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="register-modal-close" onClick={onClose}>&times;</button>
        <h2>注册</h2>
        <div className="register-modal-divider" />
        <h3>MentorX欢迎您</h3>

        <div className="register-input-area">
          <input
            ref={emailRef}
            type="email"
            placeholder="请输入邮箱"
            className={`register-input ${errorField === 'email' ? 'error' : ''}`}
            value={email}
            onFocus={() => setFocusedField('email')}   // 不清空错误
            onBlur={() => setFocusedField('')}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
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
              placeholder="请输入密码"
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
                aria-label={showPw1 ? '隐藏密码' : '显示密码'}
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
              placeholder="请确认密码"
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
                aria-label={showPw2 ? '隐藏密码' : '显示密码'}
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
            <span className="validation-tip">同一邮箱可注册两种身份，需分别完成学生/导师注册</span>
          )}
        </div>

        <div className="register-button-group">
          <button
            className={`register-button student-button ${role === 'student' ? 'active' : ''}`}
            onClick={() => setRole('student')}
            type="button"
          >
            我是学生
          </button>
          <button
            className={`register-button mentor-button ${role === 'mentor' ? 'active' : ''}`}
            onClick={() => setRole('mentor')}
            type="button"
          >
            我是导师（需审核）
          </button>
        </div>

        <div className="register-continue-area">
          <button
            className={`register-continue-button ${successAnim ? 'success-pending' : ''}`}
            onClick={handleContinue}
            disabled={submitting || successAnim}
            type="button"
          >
            继续
          </button>
        </div>

        {submitError && <div className="register-message error">{submitError}</div>}

        <div className="register-modal-divider-with-text"><span className="divider-text">或（暂未开放）</span></div>

        <div className="social-login-buttons">
          <button className="social-button wechat-login" disabled>
            <img src="/images/wechat-icon.png" alt="WeChat" className="social-icon" />
            使用微信登录
          </button>
          <button className="social-button google-login" disabled>
            <img src="/images/google-icon.png" alt="Google" className="social-icon" />
            使用 Google 账号登录
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
            try { navigate('/student'); } catch {}
            try { setTimeout(() => window.dispatchEvent(new Event('home:enter')), 0); } catch {}
          }}
          onClose={() => {
            // 行为同“我知道了”
            setShowWelcome(false);
            if (typeof onSuccess === 'function') {
              try { onSuccess({ autoLoggedIn: true, role: 'student', publicId }); } catch {}
            }
            try { onClose && onClose(); } catch {}
            try { navigate('/student'); } catch {}
            try { setTimeout(() => window.dispatchEvent(new Event('home:enter')), 0); } catch {}
          }}
        />
      )}
    </div>
  );
};

export default RegisterPopup;
