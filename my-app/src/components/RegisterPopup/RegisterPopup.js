import React, { useRef, useState } from 'react';
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
  const [ok, setOk] = useState('');
  // eye + focus control
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [focusedField, setFocusedField] = useState(''); // 'password' | 'confirmPassword' | ''

  const validate = () => {
    if (!email) return { message: '请输入邮箱', field: 'email' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { message: '邮箱格式不正确', field: 'email' };
    if (!password || password.length < 6) return { message: '密码至少6位', field: 'password' };
    if (password !== confirmPassword) return { message: '两次输入的密码不一致', field: 'confirmPassword' };
    if (!['student', 'teacher'].includes(role)) return { message: '请选择角色', field: 'role' };
    return null;
  };

  const handleContinue = async () => {
    const v = validate();
    if (v) {
      setFieldError(v.message);
      setErrorField(v.field || '');
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
      const msg = e?.response?.data?.error || '注册失败，请稍后再试';
      setSubmitError(msg);
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

  return (
    <div className="register-modal-overlay" onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="register-modal-close" onClick={onClose}>&times;</button>
        <h2>注册</h2>
        <div className="register-modal-divider" />
        <h3>MentorX欢迎您</h3>

        <div className="register-input-area">
          <input
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
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7Z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                  <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                </svg>
              </button>
            )}
          </div>

          {/* 确认密码 */}
          <div className="input-with-toggle">
            <input
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
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7Z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                  <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" fill="none"/>
                </svg>
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
            className={`register-button teacher-button ${role === 'teacher' ? 'active' : ''}`}
            onClick={() => setRole('teacher')}
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

