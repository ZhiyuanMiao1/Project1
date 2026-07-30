import React, { useEffect, useId, useRef, useState } from 'react';
import { FiCheck, FiCopy, FiX } from 'react-icons/fi';
import { useI18n } from '../../i18n/language';
import alipayLogo from '../../assets/images/AlipayAndAlipayPlus.svg';
import './AlipayTransferModal.css';

const ALIPAY_ACCOUNT = 'pay@mentory.cc';

function AlipayTransferModal({
  open,
  amountCny,
  studentId,
  studentIdLoading,
  submitting = false,
  errorMessage = '',
  onClose,
  onPaid,
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    setCopiedField('');

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose, open, submitting]);

  if (!open) return null;

  const formattedAmount = Number.isFinite(Number(amountCny))
    ? `¥${Number(amountCny).toFixed(2)}`
    : '¥0.00';
  const normalizedStudentId = String(studentId || '').trim();

  const copyValue = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? '' : current)), 1800);
    } catch {
      setCopiedField('');
    }
  };

  const renderCopyButton = (field, value, label) => (
    <button
      type="button"
      className="alipay-transfer-copy"
      onClick={() => copyValue(field, value)}
      disabled={!value}
      aria-label={label}
    >
      {copiedField === field ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      <span>
        {copiedField === field
          ? t('wallet.alipayCopied', '已复制')
          : t('wallet.alipayCopy', '复制')}
      </span>
    </button>
  );

  return (
    <div
      className="alipay-transfer-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose?.();
      }}
    >
      <div
        className="alipay-transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <button
          type="button"
          className="alipay-transfer-close"
          onClick={onClose}
          disabled={submitting}
          aria-label={t('wallet.alipayClose', '关闭支付宝转账指引')}
          ref={closeButtonRef}
        >
          <FiX aria-hidden="true" />
        </button>

        <div className="alipay-transfer-heading">
          <h2 id={titleId} className="alipay-transfer-visually-hidden">
            {t('wallet.alipayTransferTitle', '支付宝转账')}
          </h2>
          <img className="alipay-transfer-logo" src={alipayLogo} alt="Alipay" />
        </div>

        <div className="alipay-transfer-details">
          <div className="alipay-transfer-detail">
            <div className="alipay-transfer-label">{t('wallet.alipayAccount', '打开支付宝搜索')}</div>
            <div className="alipay-transfer-value-row">
              <strong className="alipay-transfer-value">{ALIPAY_ACCOUNT}</strong>
              {renderCopyButton(
                'account',
                ALIPAY_ACCOUNT,
                t('wallet.alipayCopyAccount', '复制支付宝账号')
              )}
            </div>
          </div>

          <div className="alipay-transfer-detail">
            <div className="alipay-transfer-label">{t('wallet.alipayAmount', '应付金额')}</div>
            <strong className="alipay-transfer-amount">{formattedAmount}</strong>
          </div>

          <div className="alipay-transfer-detail alipay-transfer-detail--remark">
            <div className="alipay-transfer-label">{t('wallet.alipayRemark', '转账备注（重要）')}</div>
            <div className="alipay-transfer-value-row">
              <strong className="alipay-transfer-value alipay-transfer-student-id">
                {studentIdLoading
                  ? t('common.loading', '加载中...')
                  : normalizedStudentId || t('wallet.alipayStudentIdUnavailable', 'StudentID 获取失败')}
              </strong>
              {renderCopyButton(
                'studentId',
                normalizedStudentId,
                t('wallet.alipayCopyStudentId', '复制 StudentID')
              )}
            </div>
          </div>
        </div>

        <div className="alipay-transfer-warning" role="note">
          {t('wallet.alipayPaymentNotice', 'Mentory将在确认收款后更新你的课时')}
        </div>
        {errorMessage ? (
          <div className="alipay-transfer-error" role="alert">{errorMessage}</div>
        ) : null}

        <div className="alipay-transfer-actions">
          <button type="button" className="alipay-transfer-cancel" onClick={onClose} disabled={submitting}>
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            className="alipay-transfer-done"
            onClick={onPaid}
            disabled={submitting || studentIdLoading || !normalizedStudentId}
          >
            {submitting
              ? t('wallet.alipayReporting', '正在提交...')
              : t('wallet.alipayPaid', '已付款')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlipayTransferModal;
