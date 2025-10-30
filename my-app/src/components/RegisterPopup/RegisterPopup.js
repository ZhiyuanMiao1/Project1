import React, { useState } from 'react';
import './RegisterPopup.css';
import api from '../../api/client';

const RegisterPopup = ({ onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('student');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState(''); // 邮箱/密码等字段校验错误
  const [errorField, setErrorField] = useState(''); // 标记哪个输入框有错误
  const [submitError, setSubmitError] = useState(''); // 提交或服务端错误
  const [ok, setOk] = useState('');

  const validate = () => {
    // 返回 { message, field }，便于为对应输入框加样式
    if (!email) return { message: '请输入邮箱', field: 'email' };
    // very light email check; backend validates too
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: '邮箱格式不正确', field: 'email' };
    if (!password || password.length < 6) return { message: '密码至少6位', field: 'password' };
    if (password !== confirmPassword) return { message: '两次输入的密码不一致', field: 'confirmPassword' };
    if (!['student', 'teacher'].includes(role)) return { message: '请选择角色', field: 'role' };
    return null;
  };

  const handleContinue = async () => {
    const v = validate();
    if (v) {
      // 仅作为表单校验错误，显示在输入区域与角色按钮之间
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
      const res = await api.post('/api/register', {
        email,
        password,
        role,
      });
      setOk('注册成功，正在关闭...');
      if (typeof onSuccess === 'function') onSuccess(res.data);
      setTimeout(() => {
        onClose && onClose();
      }, 800);
    } catch (e) {
      const msg = e?.response?.data?.error || '注册失败，请稍后再试';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register-modal-overlay" onClick={onClose}>
      <div className="register-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="register-modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>注册</h2>
        <div className="register-modal-divider"></div>
        <h3>MentorX欢迎您</h3>
        <div className="register-input-area">
          <input
            type="email"
            placeholder="请输入邮箱"
            className={`register-input ${errorField === 'email' ? 'error' : ''}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errorField === 'email') {
                setErrorField('');
                setFieldError('');
              }
            }}
          />
          <input
            type="password"
            placeholder="请输入密码"
            className={`register-input ${errorField === 'password' ? 'error' : ''}`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorField === 'password') {
                setErrorField('');
                setFieldError('');
              }
            }}
          />
          <input
            type="password"
            placeholder="请确认密码"
            className={`register-input ${errorField === 'confirmPassword' ? 'error' : ''}`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errorField === 'confirmPassword') {
                setErrorField('');
                setFieldError('');
              }
            }}
          />
        </div>
        {/* 表单校验信息的预留空隙（位于输入区域和角色按钮之间） */}
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
          <button
            className="register-continue-button"
            onClick={handleContinue}
            disabled={submitting}
            type="button"
          >
            {submitting ? '提交中...' : '继续'}
          </button>
        </div>
        {submitError && <div className="register-message error">{submitError}</div>}
        {ok && <div className="register-message success">{ok}</div>}
        <div className="register-modal-divider-with-text">
          <span className="divider-text">或（暂未开放）</span>
        </div>
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
