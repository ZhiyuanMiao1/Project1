import React, { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCopy, FiDownload, FiX } from 'react-icons/fi';
import { useI18n } from '../../i18n/language';
import wechatPayLogo from '../../assets/images/WechatPay.svg';
import wechatMerchantQr from '../../assets/images/wechat-merchant-qr.jpg';
import './WeChatTransferModal.css';

function WeChatTransferModal({
  open,
  amountCny,
  paymentReference,
  submitting = false,
  errorMessage = '',
  onClose,
  onPaid,
}) {
  const { t } = useI18n();
  const closeButtonRef = useRef(null);
  const [paymentReferenceCopied, setPaymentReferenceCopied] = useState(false);

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
    if (open) setPaymentReferenceCopied(false);
  }, [open]);

  if (!open) return null;

  const formattedAmount = Number.isFinite(Number(amountCny))
    ? `¥${Number(amountCny).toFixed(2)}`
    : '¥0.00';
  const normalizedPaymentReference = String(paymentReference || '').trim();

  const submitPaymentReport = (event) => {
    event.preventDefault();
    if (submitting || !normalizedPaymentReference) return;
    onPaid?.();
  };

  const copyPaymentReference = async () => {
    if (!normalizedPaymentReference) return;
    try {
      await navigator.clipboard.writeText(normalizedPaymentReference);
      setPaymentReferenceCopied(true);
      window.setTimeout(() => setPaymentReferenceCopied(false), 1800);
    } catch {
      setPaymentReferenceCopied(false);
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
            <div className="wechat-transfer-form-content">
              <div className="wechat-transfer-details">
                <div className="wechat-transfer-detail">
                  <div className="wechat-transfer-label">{t('wallet.wechatAmount', '应付金额')}</div>
                  <strong className="wechat-transfer-amount">{formattedAmount}</strong>
                </div>
                <div className="wechat-transfer-detail">
                  <div className="wechat-transfer-label">{t('wallet.wechatExpectedMerchant', '请核对收款方')}</div>
                  <div className="wechat-transfer-value-row">
                    <strong className="wechat-transfer-value">{t('wallet.wechatMerchantName', 'Mentory的店铺')}</strong>
                  </div>
                </div>
                <div className="wechat-transfer-detail">
                  <div className="wechat-transfer-label">{t('wallet.wechatRemark', '付款备注（重要）')}</div>
                  <div className="wechat-transfer-value-row">
                    <strong className="wechat-transfer-value">
                      {normalizedPaymentReference || t('wallet.paymentReferenceUnavailable', '订单备注获取失败')}
                    </strong>
                    <button
                      type="button"
                      className="wechat-transfer-copy"
                      onClick={copyPaymentReference}
                      disabled={!normalizedPaymentReference}
                      aria-label={t('wallet.copyPaymentReference', '复制订单备注')}
                    >
                      {paymentReferenceCopied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                      <span>
                        {paymentReferenceCopied
                          ? t('wallet.wechatCopied', '已复制')
                          : t('wallet.wechatCopy', '复制')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {errorMessage ? (
                <div className="wechat-transfer-error" role="alert">{errorMessage}</div>
              ) : null}
            </div>

            <div className="wechat-transfer-actions">
              <button type="button" className="wechat-transfer-cancel" onClick={onClose} disabled={submitting}>
                {t('common.cancel', '取消')}
              </button>
              <button
                type="submit"
                className="wechat-transfer-done"
                disabled={submitting || !normalizedPaymentReference}
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
