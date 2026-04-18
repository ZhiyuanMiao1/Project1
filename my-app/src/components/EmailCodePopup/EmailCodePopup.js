import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import {
  getEmailCodeErrorMessage,
  sendRegisterEmailCode,
  verifyRegisterEmailCode,
} from '../../services/emailCodeService';
import { useI18n } from '../../i18n/language';
import './EmailCodePopup.css';

const maskEmail = (value) => {
  const raw = String(value || '').trim();
  const [local, domain] = raw.split('@');
  if (!local || !domain) return raw;
  if (local.length <= 2) return `${local[0] || ''}*@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
};

const translateEmailCodeMessage = (message, t) => {
  const raw = String(message || '').trim();
  const map = {
    '请输入 6 位验证码': t('emailCode.invalidCode', '请输入 6 位验证码'),
    '验证码校验失败，请稍后再试': t('emailCode.verifyFailed', '验证码校验失败，请稍后再试'),
    '验证码发送失败，请稍后再试': t('emailCode.sendFailed', '验证码发送失败，请稍后再试'),
  };
  return map[raw] || raw;
};

function EmailCodePopup({
  email,
  onClose,
  onVerified,
  onResendSuccess,
  sendEmailCode = sendRegisterEmailCode,
  verifyEmailCode = verifyRegisterEmailCode,
  initialCountdownSeconds = 60,
  title = '',
}) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const backdropMouseDownRef = useRef(false);
  const submittedCodeRef = useRef('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(Math.max(0, Number(initialCountdownSeconds) || 0));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
  const displayTitle = title || t('emailCode.title', '邮箱验证码');
  const displayEmail = maskedEmail || email;

  useEffect(() => {
    if (inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    setCountdown(Math.max(0, Number(initialCountdownSeconds) || 0));
  }, [initialCountdownSeconds]);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCountdown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    if (typeof onClose === 'function') onClose();
  };

  const focusCodeInput = useCallback(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const resetCodeInput = () => {
    submittedCodeRef.current = '';
    setCode('');
    setErrorMessage('');
  };

  const handleInputAreaClick = () => {
    if (errorMessage && code.length === 6) {
      resetCodeInput();
      requestAnimationFrame(() => focusCodeInput());
      return;
    }
    focusCodeInput();
  };

  const handleVerify = useCallback(async (nextCode = code) => {
    if (verifying || resending) return;
    if (nextCode.length !== 6) {
      setErrorMessage(t('emailCode.invalidCode', '请输入 6 位验证码'));
      return;
    }

    setVerifying(true);
    setErrorMessage('');
    try {
      const payload = await verifyEmailCode({ email, code: nextCode });
      if (typeof onVerified === 'function') {
        await onVerified(payload || {});
      }
    } catch (error) {
      setErrorMessage(translateEmailCodeMessage(getEmailCodeErrorMessage(error, t('emailCode.verifyFailed', '验证码校验失败，请稍后再试')), t));
      focusCodeInput();
    } finally {
      setVerifying(false);
    }
  }, [code, email, focusCodeInput, onVerified, resending, t, verifyEmailCode, verifying]);

  useEffect(() => {
    if (code.length !== 6) {
      submittedCodeRef.current = '';
      return;
    }
    if (submittedCodeRef.current === code) return;
    submittedCodeRef.current = code;
    handleVerify(code);
  }, [code, handleVerify]);

  const handleResend = async () => {
    if (countdown > 0 || resending || verifying) return;

    setResending(true);
    setErrorMessage('');
    try {
      const payload = await sendEmailCode({ email });
      const nextSeconds = Math.max(0, Number(payload?.resendAfterSeconds) || 60);
      setCountdown(nextSeconds);
      setCode('');
      submittedCodeRef.current = '';
      if (typeof onResendSuccess === 'function') onResendSuccess(nextSeconds);
      requestAnimationFrame(() => focusCodeInput());
    } catch (error) {
      setErrorMessage(translateEmailCodeMessage(getEmailCodeErrorMessage(error, t('emailCode.sendFailed', '验证码发送失败，请稍后再试')), t));
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="email-code-overlay"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="email-code-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="email-code-close"
          onClick={onClose}
          aria-label={t('common.close', '关闭')}
        >
          <FiX aria-hidden="true" />
        </button>

        <h2 className="email-code-title">{displayTitle}</h2>
        <div className="email-code-divider" />
        <div className="email-code-meta">
          <p className="email-code-copy">
            {t('emailCode.sentToPrefix', '验证码已发送至')} <span>{displayEmail}</span>
          </p>
          <button
            type="button"
            className="email-code-resend"
            onClick={handleResend}
            disabled={countdown > 0 || verifying || resending}
          >
            {resending ? t('emailCode.resending', '发送中...') : t('emailCode.resend', '重新发送')}
          </button>
        </div>

        <div className="email-code-input-wrap">
          <div
            className={`email-code-input-grid ${errorMessage ? 'error' : ''} ${verifying ? 'verifying' : ''}`}
            onClick={handleInputAreaClick}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="email-code-hidden-input"
              value={code}
              maxLength={6}
              onKeyDown={(e) => {
                const key = String(e.key || '');
                const isDigit = /^\d$/.test(key);
                if (errorMessage && code.length === 6 && isDigit) {
                  e.preventDefault();
                  submittedCodeRef.current = '';
                  setCode(key);
                  setErrorMessage('');
                  return;
                }
                if (errorMessage && code.length === 6 && (key === 'Backspace' || key === 'Delete')) {
                  e.preventDefault();
                  submittedCodeRef.current = '';
                  setCode('');
                  setErrorMessage('');
                }
              }}
              onChange={(e) => {
                const next = String(e.target.value || '').replace(/\D/g, '').slice(0, 6);
                setCode(next);
                if (errorMessage) setErrorMessage('');
              }}
            />
            {Array.from({ length: 6 }).map((_, index) => {
              const value = code[index] || '';
              const isActive = index === Math.min(code.length, 5) && code.length < 6;
              return (
                <div
                  key={index}
                  className={`email-code-cell ${value ? 'filled' : ''} ${isActive ? 'active' : ''}`}
                >
                  <span>{value || ''}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="email-code-footer">
          <span
            className="email-code-error"
            role={errorMessage ? 'alert' : undefined}
          >
            {errorMessage || (verifying ? t('emailCode.verifying', '验证中...') : '\u00A0')}
          </span>
          <span className="email-code-countdown">
            {countdown > 0 ? t('emailCode.resendAfter', '{seconds}s 后可重发', { seconds: countdown }) : '\u00A0'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default EmailCodePopup;
