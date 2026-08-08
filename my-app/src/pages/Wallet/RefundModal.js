import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import apiClient from '../../api/client';
import alipayLogo from '../../assets/images/AlipayAndAlipayPlus.svg';
import wechatPayLogo from '../../assets/images/WechatPay.svg';
import LoadingText from '../../components/common/LoadingText/LoadingText';
import { useI18n } from '../../i18n/language';
import './RefundModal.css';

const ACTIVE_STATUSES = new Set(['PROCESSING', 'PENDING']);

const formatNumber = (value, digits = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return String(Number(parsed.toFixed(digits)));
};

const hasConsumedHours = (order) => Number(order?.consumedHours) > 0.000001;

const createRequestId = () => {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `refund-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const providerLogo = (provider) => {
  const normalized = String(provider || '').toLowerCase();
  if (normalized === 'alipay') return alipayLogo;
  if (normalized === 'wechat') return wechatPayLogo;
  return 'https://www.paypalobjects.com/webstatic/icon/pp258.png';
};

function RefundModal({ open, onClose, onWalletUpdated, onCompleted }) {
  const { t, language } = useI18n();
  const titleId = useId();
  const dialogRef = useRef(null);
  const quoteTimerRef = useRef(null);
  const quoteRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({ orders: [], refunds: [], upcomingScheduledHours: 0 });
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [hours, setHours] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const selectedOrder = useMemo(
    () => data.orders.find((order) => String(order.id) === String(selectedOrderId)) || null,
    [data.orders, selectedOrderId]
  );

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const payload = await apiClient.get('/api/refunds/eligible-orders').then((response) => response?.data || {});
      const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
      setData({
        orders: nextOrders,
        refunds: Array.isArray(payload.refunds) ? payload.refunds : [],
        upcomingScheduledHours: Number(payload.upcomingScheduledHours) || 0,
      });
      if (payload.wallet) onWalletUpdated?.(payload.wallet);
      setSelectedOrderId((current) => {
        if (nextOrders.some((order) => String(order.id) === String(current))) return current;
        return nextOrders[0]?.id ? String(nextOrders[0].id) : '';
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.error || t('wallet.refundLoadFailed', '退款数据加载失败，请稍后重试'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onWalletUpdated, t]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submittingRef.current) onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    loadData();
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(quoteTimerRef.current);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [loadData, onClose, open]);

  useEffect(() => {
    const order = data.orders.find((item) => String(item.id) === String(selectedOrderId)) || null;
    if (!order) {
      setHours('');
      setQuote(null);
      return;
    }
    setHours(formatNumber(order.availableHours));
    setQuote(null);
    setConfirming(false);
    // Only reset the form when the selected order changes, not during status polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId]);

  useEffect(() => {
    if (!open) return undefined;
    const active = data.refunds.filter((refund) => ACTIVE_STATUSES.has(String(refund.status).toUpperCase()));
    if (!active.length) return undefined;

    let stopped = false;
    const refresh = async () => {
      const updates = await Promise.all(
        active.map((refund) => apiClient
          .get(`/api/refunds/${encodeURIComponent(refund.id)}/status`)
          .then((response) => response?.data || null)
          .catch(() => null))
      );
      if (stopped) return;
      const wallet = updates.find((item) => item?.wallet)?.wallet;
      if (wallet) onWalletUpdated?.(wallet);
      await loadData({ silent: true });
    };
    const intervalId = window.setInterval(refresh, 5000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [data.refunds, loadData, onWalletUpdated, open]);

  useEffect(() => {
    window.clearTimeout(quoteTimerRef.current);
    const requestId = ++quoteRequestRef.current;
    setQuote(null);
    setConfirming(false);
    const parsedHours = Number(hours);
    if (
      !open
      || !selectedOrder
      || !Number.isFinite(parsedHours)
      || parsedHours <= 0
      || parsedHours > Number(selectedOrder.availableHours)
      || Math.abs(parsedHours * 4 - Math.round(parsedHours * 4)) > 0.000001
    ) {
      setQuoteLoading(false);
      return undefined;
    }

    setQuoteLoading(true);
    quoteTimerRef.current = window.setTimeout(async () => {
      setError('');
      try {
        const nextQuote = await apiClient
          .post('/api/refunds/quote', { orderId: selectedOrder.id, hours: parsedHours })
          .then((response) => response?.data || null);
        if (quoteRequestRef.current !== requestId) return;
        setQuote(nextQuote);
      } catch (requestError) {
        if (quoteRequestRef.current !== requestId) return;
        setError(requestError?.response?.data?.error || t('wallet.refundQuoteFailed', '退款报价失败，请调整课时后重试'));
      } finally {
        if (quoteRequestRef.current === requestId) setQuoteLoading(false);
      }
    }, 260);
    return () => window.clearTimeout(quoteTimerRef.current);
  }, [hours, open, selectedOrder, t]);

  if (!open) return null;

  const submitRefund = async () => {
    if (!selectedOrder || !quote || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = await apiClient.post('/api/refunds', {
        orderId: selectedOrder.id,
        hours: Number(hours),
        expectedAmount: Number(quote?.amount?.value),
        clientRequestId: createRequestId(),
      }).then((response) => response?.data || {});
      if (payload.wallet) onWalletUpdated?.(payload.wallet);
      const status = String(payload?.refund?.status || '').toUpperCase();
      if (status === 'COMPLETED') onCompleted?.();
      setConfirming(false);
      await loadData({ silent: true });
    } catch (requestError) {
      const message = requestError?.response?.data?.error || t('wallet.refundSubmitFailed', '退款提交失败，请稍后重试');
      setError(message);
      if (requestError?.response?.status === 409) setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return t('wallet.refundCompleted', '退款成功');
    if (normalized === 'FAILED') return t('wallet.refundFailed', '退款失败');
    if (normalized === 'PENDING') return t('wallet.refundPending', '退款处理中');
    return t('wallet.refundProcessing', '正在确认');
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const insufficientForSchedule = quote
    && Number(quote.postRefundBalance) + 0.000001 < Number(quote.upcomingScheduledHours);

  return (
    <div
      className="wallet-refund-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose?.();
      }}
    >
      <section
        className="wallet-refund-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="wallet-refund-header">
          <div>
            <h2 id={titleId}>{t('wallet.refundTitle', '申请退款')}</h2>
          </div>
          <button
            type="button"
            className="wallet-refund-close"
            onClick={() => onClose?.()}
            disabled={submitting}
            aria-label={t('common.close', '关闭')}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="wallet-refund-body">
          {loading ? (
            <div className="wallet-refund-loading"><LoadingText text={t('common.loading', '加载中...')} /></div>
          ) : (
            <>
              <section className="wallet-refund-section">
                <h3>{t('wallet.refundChooseOrder', '选择充值订单')}</h3>
                {data.orders.length ? (
                  <div className="wallet-refund-orders">
                    {data.orders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        className={`wallet-refund-order${String(order.id) === String(selectedOrderId) ? ' is-selected' : ''}`}
                        onClick={() => setSelectedOrderId(String(order.id))}
                      >
                        <span className="wallet-refund-order-details">
                          <strong>{formatDate(order.paidAt)}</strong>
                          <small>
                            {hasConsumedHours(order)
                              ? t(
                                'wallet.refundConsumedOrderSummary',
                                `购买 ${formatNumber(order.purchasedHours)} 小时 / 剩余可退 ${formatNumber(order.availableHours)} 小时 · 共 ¥${Number(order.paidAmountCny).toFixed(2)}`,
                                {
                                  hours: formatNumber(order.purchasedHours),
                                  available: formatNumber(order.availableHours),
                                  amount: Number(order.paidAmountCny).toFixed(2),
                                }
                              )
                              : t(
                                'wallet.refundOrderSummary',
                                `购买 ${formatNumber(order.purchasedHours)} 小时 · 共 ¥${Number(order.paidAmountCny).toFixed(2)}`,
                                {
                                  hours: formatNumber(order.purchasedHours),
                                  amount: Number(order.paidAmountCny).toFixed(2),
                                }
                              )}
                          </small>
                        </span>
                        <img
                          className={`wallet-refund-provider-logo is-${String(order.provider || 'paypal').toLowerCase()}`}
                          src={providerLogo(order.provider)}
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="wallet-refund-empty">
                    {t('wallet.refundNoOrders', '暂无可退款的未使用课时')}
                  </div>
                )}
              </section>

              {selectedOrder && (
                <section className="wallet-refund-section">
                  <div className="wallet-refund-hours-row">
                    <label htmlFor="wallet-refund-hours">{t('wallet.refundHours', '退款课时')}</label>
                    <div className="wallet-refund-input">
                      <input
                        id="wallet-refund-hours"
                        type="number"
                        inputMode="decimal"
                        min="0.25"
                        max={selectedOrder.availableHours}
                        step="0.25"
                        value={hours}
                        onChange={(event) => setHours(event.target.value)}
                        disabled={submitting}
                      />
                      <span>{t('wallet.hours', '小时')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHours(formatNumber(selectedOrder.availableHours))}
                    >
                      {t('wallet.refundAll', '全部可退')}
                    </button>
                  </div>
                  <p className="wallet-refund-help">
                    {t('wallet.refundQuarterHint', '可按 0.25 小时递增；部分退款后会重新计算原订单阶梯优惠')}
                  </p>

                  <div
                    className={`wallet-refund-quote${quoteLoading || !quote ? ' is-loading' : ''}`}
                    aria-busy={quoteLoading || !quote}
                  >
                      <div>
                        <span>{t('wallet.refundReferenceCny', '人民币参考退款')}</span>
                        <strong>
                          {quote
                            ? `¥${Number(quote.amountCny).toFixed(2)}`
                            : <i className="wallet-refund-quote-placeholder" aria-hidden="true" />}
                        </strong>
                      </div>
                      <div>
                        <span>{t('wallet.refundOriginalAmount', '原路退回')}</span>
                        <strong>
                          {quote
                            ? `${quote.amount.currency} ${Number(quote.amount.value).toFixed(2)}`
                            : <i className="wallet-refund-quote-placeholder" aria-hidden="true" />}
                        </strong>
                      </div>
                      <div>
                        <span>{t('wallet.refundRetained', '退款后本单保留')}</span>
                        <strong>
                          {quote
                            ? `${formatNumber(quote.retainedHoursAfter)} ${t('wallet.hours', '小时')}`
                            : <i className="wallet-refund-quote-placeholder" aria-hidden="true" />}
                        </strong>
                      </div>
                      <div>
                        <span>{t('wallet.refundBalanceAfter', '退款后钱包余额')}</span>
                        <strong>
                          {quote
                            ? `${formatNumber(quote.postRefundBalance)} ${t('wallet.hours', '小时')}`
                            : <i className="wallet-refund-quote-placeholder" aria-hidden="true" />}
                        </strong>
                      </div>
                  </div>

                  {insufficientForSchedule && (
                    <div className="wallet-refund-warning">
                      {t(
                        'wallet.refundScheduleWarning',
                        `你已有约 ${formatNumber(quote.upcomingScheduledHours)} 小时待上课程，退款后余额可能不足，届时需再次充值才能进入课堂。`,
                        { hours: formatNumber(quote.upcomingScheduledHours) }
                      )}
                    </div>
                  )}

                  {confirming && quote && (
                    <div className="wallet-refund-confirm">
                      <strong>{t('wallet.refundConfirmTitle', '请确认退款信息')}</strong>
                      <p>
                        {t(
                          'wallet.refundConfirmDescription',
                          `将从钱包扣除 ${formatNumber(hours)} 小时，并原路退回 ${quote.amount.currency} ${Number(quote.amount.value).toFixed(2)}。提交后无法撤销`,
                          {
                            hours: formatNumber(hours),
                            currency: quote.amount.currency,
                            amount: Number(quote.amount.value).toFixed(2),
                          }
                        )}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {!!data.refunds.length && (
                <section className="wallet-refund-section wallet-refund-history">
                  <h3>{t('wallet.refundHistory', '退款记录')}</h3>
                  <div className="wallet-refund-history-list">
                    {data.refunds.map((refund) => (
                      <div className="wallet-refund-history-item" key={refund.id}>
                        <span>
                          <strong>{formatNumber(refund.requestedHours)} {t('wallet.hours', '小时')}</strong>
                          <small>{formatDate(refund.createdAt)} · {refund.amount.currency} {Number(refund.amount.value).toFixed(2)}</small>
                        </span>
                        <em className={`is-${String(refund.status).toLowerCase()}`}>{statusLabel(refund.status)}</em>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {error && <div className="wallet-refund-error" role="alert">{error}</div>}
        </div>

        <footer className="wallet-refund-actions">
          <button type="button" className="wallet-refund-cancel" onClick={() => onClose?.()} disabled={submitting}>
            {t('common.cancel', '取消')}
          </button>
          {confirming ? (
            <button
              type="button"
              className="wallet-refund-submit"
              onClick={submitRefund}
              disabled={!quote || submitting}
            >
              {submitting ? <LoadingText text={t('wallet.refundSubmitting', '正在提交...')} /> : t('wallet.refundConfirmSubmit', '确认退款')}
            </button>
          ) : (
            <button
              type="button"
              className="wallet-refund-submit"
              onClick={() => setConfirming(true)}
              disabled={!quote || quoteLoading || loading}
            >
              {t('wallet.refundContinue', '继续')}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default RefundModal;
