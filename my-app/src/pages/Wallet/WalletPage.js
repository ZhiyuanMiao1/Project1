import React, { useCallback, useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import SuccessModal from '../../components/SuccessModal/SuccessModal';
import apiClient from '../../api/client';
import { ensurePayPalReady, getPayPalWarmupSnapshot } from '../../services/paypalWarmup';
import { getAuthToken } from '../../utils/authStorage';
import './WalletPage.css';

const FX_ISSUE_CODES = new Set(['FX_QUOTE_EXPIRED', 'FX_QUOTE_CHANGED']);

function WalletPage() {
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTopUpMethod, setSelectedTopUpMethod] = useState('paypal');
  const [topUpHours, setTopUpHours] = useState('1');
  const [topUpNotice, setTopUpNotice] = useState('');
  const [isPaySuccessOpen, setIsPaySuccessOpen] = useState(false);
  const [walletSummary, setWalletSummary] = useState(() => ({
    remainingHours: 0,
    monthTopUpCny: 0,
    totalTopUpCny: 0,
  }));

  const [fxQuote, setFxQuote] = useState(null);
  const [isFxLoading, setIsFxLoading] = useState(false);
  const [fxError, setFxError] = useState('');
  const [fxNowMs, setFxNowMs] = useState(() => Date.now());
  const fxRequestIdRef = useRef(0);

  const menuAnchorRef = useRef(null);
  const paypalSdkInstanceRef = useRef(null);

  const [isPayPalInitializing, setIsPayPalInitializing] = useState(false);
  const [isPayPalEligible, setIsPayPalEligible] = useState(false);
  const [payPalInitError, setPayPalInitError] = useState('');

  const handleClosePaySuccess = useCallback(() => setIsPaySuccessOpen(false), []);

  const normalizeFxQuote = useCallback((payload) => {
    const quoteId = String(payload?.quote_id || '').trim();
    const rate = String(payload?.rate || '').trim();
    const expiresAt = String(payload?.expires_at || '').trim();
    const usd = Number.parseFloat(String(payload?.usd_amount ?? '').trim());
    if (!quoteId || !rate || !expiresAt || !Number.isFinite(usd) || usd <= 0) {
      return null;
    }
    return {
      quote_id: quoteId,
      rate,
      expires_at: expiresAt,
      usd_amount: usd.toFixed(2),
    };
  }, []);

  const requestFxQuote = useCallback(
    async (hours, { silent = false } = {}) => {
      const requestId = ++fxRequestIdRef.current;
      if (!silent) setIsFxLoading(true);
      setFxError('');

      try {
        const data = await apiClient.post('/api/paypal/fx-quote', { hours }).then((res) => res?.data || {});
        const normalized = normalizeFxQuote(data);
        if (!normalized) throw new Error('汇率报价返回数据无效，请重试。');

        if (requestId !== fxRequestIdRef.current) return null;
        setFxQuote(normalized);
        setFxNowMs(Date.now());
        return normalized;
      } catch (err) {
        if (requestId !== fxRequestIdRef.current) return null;
        const message = err?.response?.data?.error || err?.message || '获取汇率报价失败，请稍后重试。';
        setFxQuote(null);
        setFxError(message);
        throw err;
      } finally {
        if (!silent && requestId === fxRequestIdRef.current) setIsFxLoading(false);
      }
    },
    [normalizeFxQuote]
  );

  const refreshFxQuote = useCallback(
    async (hours) => {
      try {
        return await requestFxQuote(hours);
      } catch {
        return null;
      }
    },
    [requestFxQuote]
  );

  const resetFxQuoteState = useCallback(() => {
    fxRequestIdRef.current += 1;
    setFxQuote(null);
    setFxError('');
    setIsFxLoading(false);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    setErrorMessage(isLoggedIn ? '' : '请登录后查看钱包');
  }, [isLoggedIn]);

  useEffect(() => {
    if (!topUpNotice) return undefined;
    const timeoutId = window.setTimeout(() => setTopUpNotice(''), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [topUpNotice]);

  const isPayPalPlainNotice =
    selectedTopUpMethod === 'paypal' && ['正在跳转 PayPal…', '已取消支付'].includes(topUpNotice);

  const formatHours = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(Number(n.toFixed(2)));
  };

  const formatCny = (value) => {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toFixed(2);
  };

  const remainingHours = walletSummary?.remainingHours ?? 0;
  const monthTopUpCny = walletSummary?.monthTopUpCny ?? 0;
  const totalTopUpCny = walletSummary?.totalTopUpCny ?? 0;

  const hoursNumber = Number(topUpHours);
  const isHoursValid = Number.isFinite(hoursNumber) && hoursNumber > 0;
  const unitPriceCny = hoursNumber >= 10 ? 500 : 600;
  const amountCnyNumber = Number.isFinite(hoursNumber) ? Number((hoursNumber * unitPriceCny).toFixed(2)) : 0;
  const amountUsdNumber = Number.parseFloat(String(fxQuote?.usd_amount ?? ''));
  const fxExpiresAtMs = fxQuote?.expires_at ? Date.parse(fxQuote.expires_at) : NaN;
  const isFxQuoteExpired =
    Boolean(fxQuote) && (!Number.isFinite(fxExpiresAtMs) || Number(fxExpiresAtMs) <= fxNowMs);
  const canSubmitTopUp = Boolean(selectedTopUpMethod) && isHoursValid;

  const isLocalhost = typeof window !== 'undefined' && window.location?.hostname === 'localhost';
  const openWith127Url = isLocalhost
    ? `${window.location.protocol}//127.0.0.1${window.location.port ? `:${window.location.port}` : ''}${
        window.location.pathname
      }${window.location.search}${window.location.hash}`
    : '';

  const fetchWalletSummary = useCallback(async () => {
    const res = await apiClient.get('/api/account/wallet-summary');
    const data = res?.data || {};
    setWalletSummary({
      remainingHours: Number(data?.remainingHours) || 0,
      monthTopUpCny: Number(data?.monthTopUpCny) || 0,
      totalTopUpCny: Number(data?.totalTopUpCny) || 0,
    });
    return data;
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setWalletSummary({ remainingHours: 0, monthTopUpCny: 0, totalTopUpCny: 0 });
      return;
    }
    fetchWalletSummary().catch((err) => console.error('Wallet summary load error:', err));
  }, [fetchWalletSummary, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      paypalSdkInstanceRef.current = null;
      setIsPayPalInitializing(false);
      setIsPayPalEligible(false);
      setPayPalInitError('');
      return undefined;
    }

    if (selectedTopUpMethod !== 'paypal') return undefined;

    if (window.location.hostname === 'localhost') {
      paypalSdkInstanceRef.current = null;
      setIsPayPalInitializing(false);
      setIsPayPalEligible(false);
      setPayPalInitError('PayPal sandbox client token 不支持 localhost，请用 127.0.0.1 打开本页面。');
      return undefined;
    }

    const snapshot = getPayPalWarmupSnapshot();
    if (snapshot?.sdkInstance && typeof snapshot?.isEligible === 'boolean' && !snapshot?.initError) {
      paypalSdkInstanceRef.current = snapshot.sdkInstance;
      setIsPayPalInitializing(false);
      setIsPayPalEligible(Boolean(snapshot.isEligible));
      setPayPalInitError('');
      return undefined;
    }

    let canceled = false;

    setIsPayPalInitializing(true);
    setPayPalInitError('');
    setIsPayPalEligible(false);

    ensurePayPalReady()
      .then(({ sdkInstance, isEligible }) => {
        if (canceled) return;
        paypalSdkInstanceRef.current = sdkInstance;
        setIsPayPalEligible(Boolean(isEligible));
      })
      .catch((err) => {
        if (canceled) return;
        console.error('PayPal init error:', err);
        const message = err instanceof Error && err.message ? err.message : 'PayPal 初始化失败，请稍后重试。';
        setPayPalInitError(message);
        setIsPayPalEligible(false);
      })
      .finally(() => {
        if (!canceled) setIsPayPalInitializing(false);
      });

    return () => {
      canceled = true;
    };
  }, [isLoggedIn, selectedTopUpMethod]);

  useEffect(() => {
    if (!isLoggedIn || selectedTopUpMethod !== 'paypal' || !isHoursValid) {
      resetFxQuoteState();
      return undefined;
    }

    const hoursSnapshot = Number(hoursNumber.toFixed(2));
    const timer = window.setTimeout(() => {
      requestFxQuote(hoursSnapshot).catch((err) => {
        console.error('FX quote refresh error:', err);
      });
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hoursNumber, isHoursValid, isLoggedIn, requestFxQuote, resetFxQuoteState, selectedTopUpMethod]);

  useEffect(() => {
    if (!fxQuote?.expires_at) return undefined;
    const timer = window.setInterval(() => setFxNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [fxQuote?.expires_at]);

  const handlePayPalTopUp = async () => {
    if (!isHoursValid) {
      setTopUpNotice('请输入正确的小时数。');
      return;
    }

    if (selectedTopUpMethod !== 'paypal') {
      setSelectedTopUpMethod('paypal');
      return;
    }

    if (isPayPalInitializing) return;

    if (payPalInitError) {
      setTopUpNotice(payPalInitError);
      return;
    }

    if (!isPayPalEligible) {
      setTopUpNotice('PayPal 当前不可用，请稍后重试。');
      return;
    }

    if (isFxLoading) {
      setTopUpNotice('正在获取实时汇率，请稍后重试。');
      return;
    }

    if (fxError) {
      setTopUpNotice(fxError);
      return;
    }

    if (!fxQuote) {
      setTopUpNotice('未获取到汇率报价，请稍后重试。');
      return;
    }

    if (isFxQuoteExpired) {
      setTopUpNotice('汇率报价已过期，正在重新获取。');
      await refreshFxQuote(Number(hoursNumber.toFixed(2)));
      return;
    }

    const sdkInstance = paypalSdkInstanceRef.current;
    if (!sdkInstance) {
      setTopUpNotice('PayPal 尚未初始化完成，请稍后重试。');
      return;
    }

    const hoursSnapshot = Number(hoursNumber.toFixed(2));
    const quoteSnapshot = { ...fxQuote };

    try {
      setIsPaySuccessOpen(false);
      setTopUpNotice('正在跳转 PayPal…');

      const createOrder = async () => {
        try {
          const res = await apiClient.post('/api/paypal-api/checkout/orders/create', {
            hours: hoursSnapshot,
            quote_id: quoteSnapshot.quote_id,
            usd_amount: quoteSnapshot.usd_amount,
          });
          const createData = res?.data || {};
          if (!createData?.id) throw new Error(createData?.error || 'Failed to create PayPal order');
          return { orderId: createData.id };
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          const code = String(err?.response?.data?.code || '').trim();
          const message = err?.response?.data?.error || err?.message || 'Failed to create PayPal order';
          const wrapped = new Error(message);
          wrapped.fxIssue = status === 409 && FX_ISSUE_CODES.has(code);
          wrapped.fxCode = code;
          throw wrapped;
        }
      };

      const orderPromise = createOrder();
      const order = await orderPromise;
      const session = sdkInstance.createPayPalOneTimePaymentSession({
        onApprove: async (data) => {
          try {
            const approvedOrderId = data?.orderId || data?.orderID || order.orderId;
            const captureData = await apiClient
              .post(`/api/paypal-api/checkout/orders/${encodeURIComponent(String(approvedOrderId))}/capture`, {})
              .then((r) => r?.data || {})
              .catch((err) => {
                const message = err?.response?.data?.error || err?.message || 'PayPal capture failed';
                throw new Error(message);
              });
            const status = String(captureData?.status || '').toUpperCase();
            if (status === 'COMPLETED') {
              setTopUpNotice('');
              if (captureData?.wallet) {
                setWalletSummary((prev) => ({ ...(prev || {}), ...captureData.wallet }));
              } else {
                fetchWalletSummary().catch((err) => console.error('Wallet summary refresh error:', err));
              }
              setIsPaySuccessOpen(true);
            } else {
              setTopUpNotice(`支付完成，状态：${status || 'UNKNOWN'}`);
            }
          } catch (err) {
            console.error('PayPal approve/capture error:', err);
            setTopUpNotice('支付已批准，但收款确认失败，请稍后查看余额。');
          }
        },
        onCancel: () => setTopUpNotice('已取消支付'),
        onError: (err) => {
          console.error('PayPal session error:', err);
          setTopUpNotice('支付失败，请稍后重试。');
        },
      });

      await session.start({ presentationMode: 'auto' }, orderPromise);
    } catch (err) {
      if (err?.fxIssue) {
        setTopUpNotice('汇率已变化或过期，请重新获取报价后再支付。');
        await refreshFxQuote(hoursSnapshot);
        return;
      }
      console.error('PayPal click error:', err);
      setTopUpNotice('支付初始化失败，请稍后重试。');
    }
  };

  const topUpMethods = [
    { id: 'paypal', title: 'Paypal', description: '支持国际信用卡与余额' },
    { id: 'alipay', title: '支付宝', description: '推荐国内用户使用' },
    { id: 'wechat', title: '微信', description: '微信支付快捷到账' },
  ];

  const handleTopUp = () => {
    if (!canSubmitTopUp) return;
    const methodLabel = topUpMethods.find((method) => method.id === selectedTopUpMethod)?.title ?? '所选方式';
    setTopUpNotice(
      `已选择 ${methodLabel}，小时数 ${hoursNumber.toFixed(2)}，单价 ${unitPriceCny}元/小时，总计 ¥${amountCnyNumber.toFixed(
        2
      )}。充值功能开发中，敬请期待。`
    );
  };

  const canUsePayPalButton =
    isHoursValid &&
    !isPayPalInitializing &&
    isPayPalEligible &&
    !payPalInitError &&
    !isFxLoading &&
    !fxError &&
    !!fxQuote &&
    !isFxQuoteExpired;

  return (
    <div className="wallet-page">
      <div className="container">
        <header className="wallet-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle wallet-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="wallet-hero">
          <h1>钱包</h1>
        </section>

        {errorMessage && <div className="wallet-alert">{errorMessage}</div>}

        {isLoggedIn && (
          <section className="wallet-layout" aria-label="钱包概览">
            <div className="wallet-left">
              <div className="wallet-panel wallet-balance-card" aria-label="余额">
                <div className="wallet-panel-header">
                  <div>
                    <div className="wallet-panel-eyebrow">剩余课时</div>
                    <div className="wallet-balance-amount">
                      <span className="wallet-balance-value">{formatHours(remainingHours)}</span>
                      <span className="wallet-balance-unit">小时</span>
                    </div>
                  </div>
                </div>

                <div className="wallet-stat-grid" aria-label="余额统计">
                  <div className="wallet-stat">
                    <div className="wallet-stat-label">本月支出</div>
                    <div className="wallet-stat-value">¥ {formatCny(monthTopUpCny)}</div>
                  </div>
                  <div className="wallet-stat">
                    <div className="wallet-stat-label">累计充值</div>
                    <div className="wallet-stat-value">¥ {formatCny(totalTopUpCny)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="wallet-right">
              <div className="wallet-panel wallet-topup-card" aria-label="充值">
                <div className="wallet-panel-title">充值</div>

                <div className="wallet-method-grid" role="group" aria-label="充值方式">
                  {topUpMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      className={`wallet-method-card ${selectedTopUpMethod === method.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedTopUpMethod(method.id)}
                      aria-pressed={selectedTopUpMethod === method.id}
                    >
                      <span className={`wallet-method-icon wallet-method-icon--${method.id}`} aria-hidden="true">
                        {method.id === 'paypal' && (
                          <img
                            className="wallet-method-paypal-icon"
                            src="https://www.paypalobjects.com/webstatic/icon/pp258.png"
                            alt=""
                            loading="lazy"
                          />
                        )}
                        {method.id === 'alipay' && '支'}
                        {method.id === 'wechat' && '微'}
                      </span>
                      <span className="wallet-method-body">
                        <span className="wallet-method-title">{method.title}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="wallet-topup-form" aria-label="充值小时">
                  <label className="wallet-input-label" htmlFor="wallet-topup-amount">
                    充值时长
                  </label>
                  <div className="wallet-hours-row" aria-label="选择小时数">
                    <div className="wallet-quick-amount" aria-label="快捷小时数">
                      {[1, 2, 5, 10, 20].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`wallet-quick-pill ${Number(topUpHours) === value ? 'is-active' : ''}`}
                          onClick={() => setTopUpHours(String(value))}
                        >
                          {value}
                        </button>
                      ))}
                    </div>

                    <div className="wallet-amount-row wallet-hours-input">
                      <span className="wallet-currency" aria-hidden="true">
                        ⏱
                      </span>
                      <input
                        id="wallet-topup-amount"
                        className="wallet-amount-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={topUpHours}
                        onChange={(e) => setTopUpHours(e.target.value)}
                        placeholder="请输入小时数"
                      />
                      <span className="wallet-unit" aria-hidden="true">
                        小时
                      </span>
                    </div>
                  </div>

                  <div className="wallet-derived-amount" aria-label="价格详情">
                    <div className="wallet-derived-label">价格详情</div>
                    <div className="wallet-derived-value">
                      <div className="wallet-derived-rule">
                        <div className="wallet-derived-row">
                          <span className="wallet-derived-left">充值时长 &lt; 10小时</span>
                          <span className="wallet-derived-right">600元/小时</span>
                        </div>
                        <div className="wallet-derived-row">
                          <span className="wallet-derived-left">充值时长 ≥ 10小时</span>
                          <span className="wallet-derived-right">500元/小时</span>
                        </div>
                      </div>
                      <div className="wallet-derived-total wallet-derived-row">
                        <span className="wallet-derived-left">总计</span>
                        <span className="wallet-derived-right">
                          ¥{Number.isFinite(amountCnyNumber) ? amountCnyNumber.toFixed(2) : '0.00'}
                          {Number.isFinite(amountUsdNumber) ? ` ($${amountUsdNumber.toFixed(2)})` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedTopUpMethod === 'paypal' ? (
                    <div className="wallet-paypal" aria-label="PayPal">
                      <button
                        type="button"
                        className="wallet-primary wallet-paypal-primary"
                        onClick={handlePayPalTopUp}
                        disabled={!canUsePayPalButton}
                      >
                        <span className="wallet-paypal-primary-content">
                          <paypal-mark className="wallet-paypal-primary-mark" aria-hidden="true"></paypal-mark>
                          <span>立即充值</span>
                        </span>
                      </button>
                      {!isPayPalInitializing && payPalInitError && (
                        <div className="wallet-empty">
                          <div>{payPalInitError}</div>
                          {isLocalhost && openWith127Url && (
                            <div style={{ marginTop: 8 }}>
                              <a href={openWith127Url}>用 127.0.0.1 打开</a>
                            </div>
                          )}
                        </div>
                      )}
                      {!isPayPalInitializing && !payPalInitError && !isPayPalEligible && (
                        <div className="wallet-empty">PayPal 当前不可用</div>
                      )}
                    </div>
                  ) : (
                    <button type="button" className="wallet-primary" onClick={handleTopUp} disabled={!canSubmitTopUp}>
                      立即充值
                    </button>
                  )}

                  {topUpNotice && (
                    <div className={`wallet-notice${isPayPalPlainNotice ? ' is-plain' : ''}`}>{topUpNotice}</div>
                  )}
                </div>
              </div>

              <div className="wallet-panel wallet-panel-muted" aria-label="温馨提示">
                <div className="wallet-panel-title">温馨提示</div>
                <ul className="wallet-tip-list">
                  <li>充值成功后余额实时到账</li>
                  <li>如遇支付问题，请前往“帮助中心”联系我们</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      <SuccessModal open={isPaySuccessOpen} title="支付成功" autoCloseMs={2200} onClose={handleClosePaySuccess} />
    </div>
  );
}

export default WalletPage;

