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

  // 遮罩点击关闭（避免内部点击穿透）
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
            onFocus={() => setErrorField('')}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errorField === 'email') { setErrorField(''); setFieldError(''); }
            }}
          />
          <input
            type="password"
            placeholder="请输入密码"
            className={`register-input ${errorField === 'password' ? 'error' : ''}`}
            value={password}
            onFocus={() => setErrorField('')}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorField === 'password') { setErrorField(''); setFieldError(''); }
            }}
          />
          <input
            type="password"
            placeholder="请确认密码"
            className={`register-input ${errorField === 'confirmPassword' ? 'error' : ''}`}
            value={confirmPassword}
            onFocus={() => setErrorField('')}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errorField === 'confirmPassword') { setErrorField(''); setFieldError(''); }
            }}
          />
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

