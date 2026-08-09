import React, { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy, FiDownload, FiX } from 'react-icons/fi';
import { useI18n } from '../../i18n/language';
import wechatPayLogo from '../../assets/images/WechatPay.svg';
import wechatMerchantQr from '../../assets/images/wechat-merchant-qr.jpg';
import './WeChatTransferModal.css';

function WeChatTransferModal({
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
  const closeButtonRef = useRef(null);
  const [studentIdCopied, setStudentIdCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';

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

  useEffect(() => {
    if (open) setStudentIdCopied(false);
  }, [open]);

  if (!open) return null;

  const formattedAmount = Number.isFinite(Number(amountCny))
    ? `¥${Number(amountCny).toFixed(2)}`
    : '¥0.00';
  const normalizedStudentId = String(studentId || '').trim();

  const submitPaymentReport = (event) => {
    event.preventDefault();
    if (submitting || studentIdLoading || !normalizedStudentId) return;
    onPaid?.();
  };

  const copyStudentId = async () => {
    if (!normalizedStudentId) return;
    try {
      await navigator.clipboard.writeText(normalizedStudentId);
      setStudentIdCopied(true);
      window.setTimeout(() => setStudentIdCopied(false), 1800);
    } catch {
      setStudentIdCopied(false);
    }
  };

  return (
    <div
      className="wechat-transfer-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose?.();
      }}
    >
      <section
        className="wechat-transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('wallet.wechatPaymentDialog', '微信支付')}
      >
        <button
          type="button"
          className="wechat-transfer-close"
          onClick={onClose}
          disabled={submitting}
          aria-label={t('wallet.wechatClose', '关闭微信支付指引')}
          ref={closeButtonRef}
        >
          <FiX aria-hidden="true" />
        </button>

        <header className="wechat-transfer-heading">
          <img className="wechat-transfer-logo" src={wechatPayLogo} alt="WeChat Pay" />
        </header>

        <div className="wechat-transfer-layout">
          <div className="wechat-transfer-qr-panel">
            <img
              className="wechat-transfer-qr"
              src={wechatMerchantQr}
              alt={t('wallet.wechatQrAlt', 'Mentory的店铺微信商户收款码')}
            />
            <a
              className="wechat-transfer-download"
              href={wechatMerchantQr}
              download="mentory-wechat-merchant-qr.jpg"
            >
              <FiDownload aria-hidden="true" />
              <span>{t('wallet.wechatSaveQr', '保存收款码')}</span>
            </a>
          </div>

          <form className="wechat-transfer-form" onSubmit={submitPaymentReport}>
            <div className="wechat-transfer-details">
              <div className="wechat-transfer-detail-row">
                <span>{t('wallet.wechatAmount', '应付金额')}</span>
                <strong>{formattedAmount}</strong>
              </div>
              <div className="wechat-transfer-detail-row">
                <span>{t('wallet.wechatExpectedMerchant', '请核对收款方')}</span>
                <strong>{t('wallet.wechatMerchantName', 'Mentory的店铺')}</strong>
              </div>
              <div className="wechat-transfer-remark">
                <div>
                  <span>{t('wallet.wechatRemark', '付款备注（重要）')}</span>
                  <strong>
                    {studentIdLoading
                      ? t('common.loading', '加载中...')
                      : normalizedStudentId || t('wallet.wechatStudentIdUnavailable', 'StudentID 获取失败')}
                  </strong>
                </div>
                <button
                  type="button"
                  className="wechat-transfer-copy"
                  onClick={copyStudentId}
                  disabled={studentIdLoading || !normalizedStudentId}
                  aria-label={t('wallet.wechatCopyStudentId', '复制 StudentID')}
                >
                  {studentIdCopied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                  <span>
                    {studentIdCopied
                      ? t('wallet.wechatCopied', '已复制')
                      : t('wallet.wechatCopy', '复制')}
                  </span>
                </button>
              </div>
            </div>

            {errorMessage ? (
              <div className="wechat-transfer-error" role="alert">{errorMessage}</div>
            ) : null}

            <div className="wechat-transfer-actions">
              <button type="button" className="wechat-transfer-cancel" onClick={onClose} disabled={submitting}>
                {t('common.cancel', '取消')}
              </button>
              <button
                type="submit"
                className="wechat-transfer-done"
                disabled={submitting || studentIdLoading || !normalizedStudentId}
              >
                {submitting
                  ? t('wallet.wechatReporting', '正在提交...')
                  : t('wallet.wechatPaid', '我已付款')}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

export default WeChatTransferModal;
