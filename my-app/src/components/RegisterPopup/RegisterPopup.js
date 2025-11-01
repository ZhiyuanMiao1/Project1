import React, { useRef, useState, useEffect } from 'react';
import './RegisterPopup.css';
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
  // eye + focus control
  const emailRef = useRef(null);
  const pw1Ref   = useRef(null);
  const pw2Ref   = useRef(null);

  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [focusedField, setFocusedField] = useState(''); // 'password' | 'confirmPassword' | ''

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
      setOk('注册成功，正在关闭...');
      if (typeof onSuccess === 'function') onSuccess(res.data);
      setTimeout(() => { onClose && onClose(); }, 800);
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const msg = data?.error || '注册失败，请稍后再试';

      // 针对“邮箱已被注册”改为与“请输入邮箱”一致的行内错误，并自动聚焦邮箱框
      if (msg === '该邮箱已被注册' || status === 409) {
        setFieldError('该邮箱已被注册');
        setErrorField('email');
        setErrorFocusTick((t) => t + 1);
        setSubmitError(''); // 不在继续按钮下方显示
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // mask click-to-close
  const backdropMouseDownRef = useRef(false);
  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };
  const handleBackdropClick = (e) => {
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
          <button className="register-continue-button" onClick={handleContinue} disabled={submitting} type="button">
            {submitting ? '提交中...' : '继续'}
          </button>
        </div>

        {submitError && <div className="register-message error">{submitError}</div>}
        {ok && <div className="register-message success">{ok}</div>}

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
    </div>
  );
};

export default RegisterPopup;
