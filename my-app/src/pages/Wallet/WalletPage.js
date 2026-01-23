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
                    <div className="wallet-panel-subtitle">余额可用于预约课程、购买服务。</div>
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
                <div className="wallet-panel-subtitle">选择一种方式并输入金额。</div>

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
                        <span className="wallet-method-desc">{method.description}</span>
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

                  <button type="button" className="wallet-primary" onClick={handleTopUp} disabled={!canSubmitTopUp}>
                    立即充值
                  </button>

                  {topUpNotice && <div className="wallet-notice">{topUpNotice}</div>}
                </div>
              </div>

              <div className="wallet-panel wallet-panel-muted" aria-label="温馨提示">
                <div className="wallet-panel-title">温馨提示</div>
                <ul className="wallet-tip-list">
                  <li>充值成功后余额实时到账。</li>
                  <li>如遇支付问题，请联系在线客服。</li>
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
