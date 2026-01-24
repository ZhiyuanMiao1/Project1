import React, { useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import { getAuthToken } from '../../utils/authStorage';
import './WalletPage.css';

function WalletPage() {
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTopUpMethod, setSelectedTopUpMethod] = useState('paypal');
  const [topUpAmount, setTopUpAmount] = useState('100');
  const [topUpNotice, setTopUpNotice] = useState('');
  const menuAnchorRef = useRef(null);

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

  const balanceCny = 0;
  const formattedBalance = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balanceCny);

  const amountNumber = Number(topUpAmount);
  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const canSubmitTopUp = Boolean(selectedTopUpMethod) && isAmountValid;

  const apiBase = process.env.REACT_APP_API_BASE || 'http://localhost:5000';
  const paypalApiBase = `${apiBase}/api/paypal-api`;
  const paypalButtonRef = useRef(null);
  const paypalSdkInstanceRef = useRef(null);
  const [isPayPalInitializing, setIsPayPalInitializing] = useState(false);
  const [isPayPalEligible, setIsPayPalEligible] = useState(false);
  const [payPalInitError, setPayPalInitError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    if (selectedTopUpMethod !== 'paypal') return undefined;

    let canceled = false;
    let detachLoadListener = null;

    setIsPayPalInitializing(true);
    setPayPalInitError('');
    setIsPayPalEligible(false);

    async function onPayPalWebSdkLoaded() {
      if (canceled) return;
      setIsPayPalInitializing(true);
      setPayPalInitError('');
      setIsPayPalEligible(false);

      try {
        const tokenRes = await fetch(`${paypalApiBase}/auth/browser-safe-client-token`);
        const tokenData = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenData?.accessToken) {
          throw new Error(tokenData?.error || 'Failed to fetch PayPal client token');
        }

        const sdkInstance = await window.paypal.createInstance({
          clientToken: tokenData.accessToken,
          components: ['paypal-payments'],
          pageType: 'checkout',
        });
        paypalSdkInstanceRef.current = sdkInstance;

        const methods = await sdkInstance.findEligibleMethods({ currencyCode: 'USD' });
        const eligible = typeof methods?.isEligible === 'function' ? methods.isEligible('paypal') : false;
        if (!canceled) setIsPayPalEligible(Boolean(eligible));
      } catch (err) {
        console.error('PayPal init error:', err);
        if (!canceled) {
          setPayPalInitError('PayPal 初始化失败，请稍后重试。');
          setIsPayPalEligible(false);
        }
      } finally {
        if (!canceled) setIsPayPalInitializing(false);
      }
    }

    window.onPayPalWebSdkLoaded = onPayPalWebSdkLoaded;

    if (window.paypal?.createInstance) {
      onPayPalWebSdkLoaded();
      return () => {
        canceled = true;
        if (typeof detachLoadListener === 'function') detachLoadListener();
        if (window.onPayPalWebSdkLoaded === onPayPalWebSdkLoaded) {
          window.onPayPalWebSdkLoaded = undefined;
        }
      };
    }

    const scriptId = 'paypal-web-sdk-v6-core';
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      const triggerInit = () => window.onPayPalWebSdkLoaded?.();
      existingScript.addEventListener('load', triggerInit, { once: true });
      detachLoadListener = () => existingScript.removeEventListener('load', triggerInit);
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://www.sandbox.paypal.com/web-sdk/v6/core';
      script.onload = () => window.onPayPalWebSdkLoaded?.();
      script.onerror = () => {
        if (canceled) return;
        setIsPayPalInitializing(false);
        setIsPayPalEligible(false);
        setPayPalInitError('PayPal SDK 加载失败，请检查网络后重试。');
      };
      document.body.appendChild(script);
    }

    return () => {
      canceled = true;
      if (typeof detachLoadListener === 'function') detachLoadListener();
      if (window.onPayPalWebSdkLoaded === onPayPalWebSdkLoaded) {
        window.onPayPalWebSdkLoaded = undefined;
      }
    };
  }, [apiBase, isLoggedIn, paypalApiBase, selectedTopUpMethod]);

  useEffect(() => {
    const paypalButton = paypalButtonRef.current;
    if (!paypalButton) return undefined;
    if (!isPayPalEligible || selectedTopUpMethod !== 'paypal') return undefined;

    const handlePayPalClick = async () => {
      if (!isAmountValid) {
        setTopUpNotice('请输入正确的充值金额。');
        return;
      }

      const sdkInstance = paypalSdkInstanceRef.current;
      if (!sdkInstance) {
        setTopUpNotice('PayPal 尚未初始化完成，请稍后重试。');
        return;
      }

      try {
        setTopUpNotice('正在跳转 PayPal…');

        const createOrder = async () => {
          const createRes = await fetch(`${paypalApiBase}/checkout/orders/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'CAPTURE',
              purchase_units: [
                { amount: { currency_code: 'USD', value: amountNumber.toFixed(2) } },
              ],
            }),
          });
          const createData = await createRes.json().catch(() => ({}));
          if (!createRes.ok || !createData?.id) {
            throw new Error(createData?.error || 'Failed to create PayPal order');
          }
          return { orderId: createData.id };
        };

        const order = await createOrder();
        const session = sdkInstance.createPayPalOneTimePaymentSession({
          onApprove: async (data) => {
            try {
              const approvedOrderId = data?.orderId || data?.orderID || order.orderId;
              const captureRes = await fetch(
                `${paypalApiBase}/checkout/orders/${encodeURIComponent(String(approvedOrderId))}/capture`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({}),
                },
              );
              const captureData = await captureRes.json().catch(() => ({}));
              if (!captureRes.ok) {
                throw new Error(captureData?.error || 'PayPal capture failed');
              }
              setTopUpNotice('支付成功');
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

        await session.start({ presentationMode: 'auto' }, order);
      } catch (err) {
        console.error('PayPal click error:', err);
        setTopUpNotice('支付初始化失败，请稍后重试。');
      }
    };

    paypalButton.addEventListener('click', handlePayPalClick);
    return () => paypalButton.removeEventListener('click', handlePayPalClick);
  }, [amountNumber, isAmountValid, isPayPalEligible, paypalApiBase, selectedTopUpMethod]);

  const topUpMethods = [
    { id: 'paypal', title: 'Paypal 充值', description: '支持国际信用卡与余额' },
    { id: 'alipay', title: '支付宝', description: '推荐国内用户使用' },
    { id: 'wechat', title: '微信', description: '微信支付快捷到账' },
  ];

  const handleTopUp = () => {
    if (!canSubmitTopUp) return;
    const methodLabel = topUpMethods.find((method) => method.id === selectedTopUpMethod)?.title ?? '所选方式';
    setTopUpNotice(`已选择 ${methodLabel}，充值金额 ¥${amountNumber.toFixed(2)}。充值功能开发中，敬请期待。`);
  };

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
                    <div className="wallet-panel-eyebrow">当前余额</div>
                    <div className="wallet-balance-amount">¥ {formattedBalance}</div>
                  </div>
                </div>

                <div className="wallet-stat-grid" aria-label="余额统计">
                  <div className="wallet-stat">
                    <div className="wallet-stat-label">本月支出</div>
                    <div className="wallet-stat-value">¥ 0.00</div>
                  </div>
                  <div className="wallet-stat">
                    <div className="wallet-stat-label">累计充值</div>
                    <div className="wallet-stat-value">¥ 0.00</div>
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
                        {method.id === 'paypal' && 'P'}
                        {method.id === 'alipay' && '支'}
                        {method.id === 'wechat' && '微'}
                      </span>
                      <span className="wallet-method-body">
                        <span className="wallet-method-title">{method.title}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="wallet-topup-form" aria-label="充值金额">
                  <label className="wallet-input-label" htmlFor="wallet-topup-amount">
                    充值金额
                  </label>
                  <div className="wallet-amount-row">
                    <span className="wallet-currency" aria-hidden="true">
                      ¥
                    </span>
                    <input
                      id="wallet-topup-amount"
                      className="wallet-amount-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      placeholder="请输入金额"
                    />
                    <span className="wallet-unit" aria-hidden="true">
                      元
                    </span>
                  </div>

                  <div className="wallet-quick-amount" aria-label="快捷金额">
                    {[50, 100, 200, 500].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`wallet-quick-pill ${Number(topUpAmount) === value ? 'is-active' : ''}`}
                        onClick={() => setTopUpAmount(String(value))}
                      >
                        {value}
                      </button>
                    ))}
                  </div>

                  {selectedTopUpMethod === 'paypal' ? (
                    <div className="wallet-paypal" aria-label="PayPal">
                      <paypal-button type="pay" hidden={!isPayPalEligible} ref={paypalButtonRef}></paypal-button>
                      {isPayPalInitializing && <div className="wallet-empty">PayPal 加载中…</div>}
                      {!isPayPalInitializing && payPalInitError && <div className="wallet-empty">{payPalInitError}</div>}
                      {!isPayPalInitializing && !payPalInitError && !isPayPalEligible && (
                        <div className="wallet-empty">PayPal 当前不可用</div>
                      )}
                    </div>
                  ) : (
                    <button type="button" className="wallet-primary" onClick={handleTopUp} disabled={!canSubmitTopUp}>
                      立即充值
                    </button>
                  )}

                  {topUpNotice && <div className="wallet-notice">{topUpNotice}</div>}
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
    </div>
  );
}

export default WalletPage;
