import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faCalendarDays,
  faChalkboardUser,
  faChartLine,
  faChartPie,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faClipboardCheck,
  faCoins,
  faCreditCard,
  faEnvelope,
  faEye,
  faFileInvoiceDollar,
  faGaugeHigh,
  faGraduationCap,
  faMagnifyingGlass,
  faMoneyBillTransfer,
  faPercent,
  faPlay,
  faReceipt,
  faRightFromBracket,
  faRotateRight,
  faShieldHalved,
  faStar,
  faTriangleExclamation,
  faUnlock,
  faUserTie,
  faUsers,
  faVideo,
  faWallet,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api, clearSession, getStoredAdmin, getToken, setSession } from './api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: faGaugeHigh },
  { to: '/users', label: '学生管理', icon: faUsers },
  { to: '/mentors/reviews', label: '导师管理', icon: faClipboardCheck },
  { to: '/mentor-payroll', label: '导师薪资', icon: faWallet },
  { to: '/orders', label: '订单管理', icon: faFileInvoiceDollar },
  { to: '/classrooms', label: '课堂管理', icon: faChalkboardUser },
  { to: '/course-disputes', label: '异议管理', icon: faTriangleExclamation },
  { to: '/email-broadcasts', label: '统一邮件', icon: faEnvelope },
  { to: '/audit-logs', label: '审计日志', icon: faChartLine },
];

const statusText = {
  active: '正常',
  suspended: '已封禁',
  pending: '待审简历',
  interview_pending: '待面试',
  approved: '已通过',
  rejected: '简历驳回',
  interview_rejected: '面试未通过',
  open: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  dismissed: '已忽略',
  accepted: '已接受',
  rescheduling: '改期中',
  scheduled: '未开始',
  completed: '已结束',
  cancelled: '已取消',
  none: '无记录',
  confirmed: '已确认',
  disputed: '待导师处理',
  dispute_confirmed: '已确认',
  platform_review: '平台介入',
  submitted: '待受理',
  action_pending: '执行中',
  running: '录制中',
  ready: '已生成',
  reviewed: '已评价',
  partially_refunded: '部分退款',
  refunded: '已退款',
  processing: '退款处理中',
};

const LIVE_SDK_URL = 'https://g.alicdn.com/apsara-media-box/imp-web-live-push/6.4.9/alivc-live-push.js';
let liveSdkPromise = null;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
};

const formatCourseTimeRange = (startsAt, durationHours) => {
  const start = new Date(startsAt);
  const duration = Number(durationHours);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(duration)) return '-';
  const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
  const offsetMinutes = -start.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;
  const timezone = `UTC${offsetMinutes === 0 ? '' : `${offsetSign}${offsetHours}${offsetRemainder ? `:${String(offsetRemainder).padStart(2, '0')}` : ''}`}`;
  const sameDate = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  const endText = sameDate
    ? end.toLocaleTimeString('zh-CN', { hour12: false })
    : formatDate(end);
  return `${timezone} ${formatDate(start)} - ${endText}`;
};

const formatIntegerAmount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
};

const formatHours = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const rounded = Math.round(n * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : String(rounded).replace(/0+$/, '').replace(/\.$/, '')}h`;
};

const formatHourValue = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
};

const courseDirectionLabels = {
  'cs-foundation': '\u7f16\u7a0b\u57fa\u7840',
  algo: '\u6570\u636e\u7ed3\u6784\u4e0e\u7b97\u6cd5',
  ml: '\u673a\u5668\u5b66\u4e60',
  'ai-large-model': 'AI \u5927\u6a21\u578b',
  'data-analysis': '\u6570\u636e\u5206\u6790',
  'business-analytics': '\u5546\u4e1a\u5206\u6790',
  'advanced-math': '\u9ad8\u7b49\u6570\u5b66',
  statistics: '\u6982\u7387\u4e0e\u7edf\u8ba1',
  physics: '\u7269\u7406\u5b66',
  'electrical-electronics': '\u7535\u6c14\u4e0e\u7535\u5b50',
  'mechanical-engineering': '\u673a\u68b0\u5de5\u7a0b',
  'civil-structural': '\u571f\u6728 / \u7ed3\u6784',
  'life-science': '\u751f\u547d\u79d1\u5b66',
  'public-health': '\u5065\u5eb7\u4e0e\u516c\u5171\u536b\u751f',
  chemistry: '\u5316\u5b66',
  'materials-science': '\u6750\u6599\u79d1\u5b66',
  'software-engineering': '\u8f6f\u4ef6\u5de5\u7a0b',
  'cloud-computing': '\u4e91\u8ba1\u7b97',
  cybersecurity: '\u7f51\u7edc\u5b89\u5168',
  finance: '\u91d1\u878d\u5b66',
  accounting: '\u4f1a\u8ba1\u5b66',
  economics: '\u7ecf\u6d4e\u5b66',
  marketing: '\u5e02\u573a\u8425\u9500',
  management: '\u7ba1\u7406\u5b66',
  operations: '\u7ba1\u7406\u5b66',
  'project-management': '\u7ba1\u7406\u5b66',
  psychology: '\u5fc3\u7406\u5b66',
  education: '\u6559\u80b2\u5b66',
  'design-creative': '\u8bbe\u8ba1 / \u521b\u610f',
  linguistics: '\u8bed\u8a00\u5b66',
  'communication-studies': '\u4f20\u64ad\u5b66',
  law: '\u6cd5\u5f8b',
  writing: '\u8bba\u6587\u5199\u4f5c\u4e0e\u6da6\u8272',
  'career-coaching': '\u6c42\u804c\u8f85\u5bfc',
  others: '\u5176\u5b83\u8bfe\u7a0b\u65b9\u5411',
};

const courseTypeLabels = {
  'course-selection': '\u9009\u8bfe\u6307\u5bfc',
  'pre-study': '\u8bfe\u524d\u9884\u4e60',
  'assignment-project': '\u4f5c\u4e1a\u9879\u76ee',
  'final-review': '\u671f\u672b\u590d\u4e60',
  'in-class-support': '\u6bd5\u4e1a\u8bba\u6587',
  others: '\u5176\u5b83\u7c7b\u578b',
};

const formatCourseDirection = (value) => {
  const key = String(value || '').trim();
  if (!key) return '-';
  return courseDirectionLabels[key] || key;
};

const formatCourseType = (value) => {
  const key = String(value || '').trim();
  if (!key) return '-';
  return courseTypeLabels[key] || key;
};

const formatCourseDirectionType = (direction, type) => (
  <div className="course-kind-cell">
    <span>{formatCourseDirection(direction)}</span>
    <span>{formatCourseType(type)}</span>
  </div>
);

const formatFileSize = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const PLATFORM_COMMISSION_RATE = 0.2;

const formatCurrencyCny = (value) => asNumber(value).toLocaleString('zh-CN', {
  maximumFractionDigits: 0,
});

const formatPayrollCurrency = (value) => asNumber(value).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatReviewScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(1);
};

const parseUrlList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {}
  return [text];
};

const buildAdminPreviewUrl = (path, token) => {
  const isLocalDev = ['127.0.0.1', 'localhost'].includes(window.location.hostname) && window.location.port === '3001';
  const origin = isLocalDev ? 'http://127.0.0.1:5000' : window.location.origin;
  const url = new URL(path, origin);
  if (token) url.searchParams.set('token', token);
  return url.toString();
};

const resolveAliyunLiveSdk = () => {
  const sdk = typeof window !== 'undefined' ? window.AlivcLivePush : null;
  return sdk && typeof sdk.AlivcLivePlayer === 'function' ? sdk : null;
};

const loadAliyunLiveSdk = () => {
  const existing = resolveAliyunLiveSdk();
  if (existing) return Promise.resolve(existing);
  if (liveSdkPromise) return liveSdkPromise;
  liveSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIVE_SDK_URL;
    script.async = true;
    script.onload = () => {
      const sdk = resolveAliyunLiveSdk();
      if (sdk) resolve(sdk);
      else reject(new Error('阿里云实时音视频 SDK 加载失败'));
    };
    script.onerror = () => reject(new Error('阿里云实时音视频 SDK 下载失败'));
    document.head.appendChild(script);
  });
  return liveSdkPromise;
};

function useAsync(load, deps) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    load()
      .then((data) => alive && setState({ loading: false, error: '', data }))
      .catch((error) => alive && setState({ loading: false, error: error.message || '加载失败', data: null }));
    return () => {
      alive = false;
    };
    // load and deps are intentionally supplied by each page-level caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Badge({ value }) {
  const key = String(value || '').toLowerCase();
  return <span className={`badge badge-${key}`}>{statusText[key] || value || '-'}</span>;
}

const lessonHoursStatusText = {
  none: '无记录',
  pending: '待学生确认',
  disputed: '待导师处理',
  confirmed: '已确认',
  platform_review: '平台介入',
};

function LessonHoursStatusBadge({ value }) {
  const key = String(value || 'none').toLowerCase();
  return <span className={`badge badge-${key}`}>{lessonHoursStatusText[key] || value || '-'}</span>;
}

const getOrderStatusMeta = (order) => {
  const status = String(order?.status || '').toUpperCase();
  if (order?.credited_at || status === 'COMPLETED' || status === 'CAPTURED') {
    return { key: 'paid', label: '已支付' };
  }
  if (status === 'PENDING_RECEIPT') {
    return { key: 'pending-receipt', label: '待收款' };
  }
  if (status === 'FAILED' || status === 'VOIDED') {
    return { key: 'failed', label: '失败/取消' };
  }
  if (status === 'CREATED' || status === 'APPROVED') {
    return { key: 'pending', label: '待支付' };
  }
  return { key: 'unknown', label: '待确认' };
};

const providerText = {
  paypal: 'PayPal',
  alipay: '支付宝',
  wechat: '微信',
};

function OrderStatusBadge({
  order,
  confirming = false,
  onConfirm,
  completingRefund = false,
  onCompleteRefund,
}) {
  const refundStatus = String(order?.refund_status || '').toUpperCase();
  if (['PENDING', 'PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED'].includes(refundStatus)) {
    return (
      <RefundStatusBadge
        order={order}
        completing={completingRefund}
        onComplete={onCompleteRefund}
      />
    );
  }

  const meta = getOrderStatusMeta(order);
  const providerKey = String(order?.provider || '').toLowerCase();
  const providerLabel = providerText[providerKey] || '人工付款';
  const supportsManualConfirmation = providerKey === 'alipay' || providerKey === 'wechat';
  if ((meta.key === 'pending-receipt' || meta.key === 'pending') && supportsManualConfirmation && typeof onConfirm === 'function') {
    return (
      <button
        type="button"
        className="order-confirm-payment"
        onClick={() => onConfirm(order)}
        disabled={confirming}
        aria-label={`确认${providerLabel}订单 ${order.id} 已收款`}
        title="点击确认收款"
      >
        <span className={`badge badge-order-${meta.key}`}>
          {confirming ? '确认中…' : meta.label}
        </span>
      </button>
    );
  }
  return <span className={`badge badge-order-${meta.key}`}>{meta.label}</span>;
}

function RefundStatusBadge({ order, completing = false, onComplete }) {
  const status = String(order?.refund_status || '').toUpperCase();
  const provider = String(order?.provider || '').toLowerCase();
  const isManualProvider = provider === 'alipay' || provider === 'wechat';
  const isProcessing = status === 'PENDING' || status === 'PROCESSING';

  if (isProcessing && isManualProvider && typeof onComplete === 'function') {
    return (
      <button
        type="button"
        className="manual-refund-status"
        onClick={() => onComplete(order)}
        disabled={completing}
        aria-label={`确认订单 ${order.id} 已完成人工退款`}
        title="点击确认人工退款已完成"
      >
        <span className="badge badge-processing">
          {completing ? '确认中…' : '退款处理中'}
        </span>
      </button>
    );
  }
  if (isProcessing) return <span className="badge badge-processing">退款处理中</span>;
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') {
    return <span className="badge badge-refunded">已退款</span>;
  }
  if (status === 'FAILED') return <span className="badge badge-failed">退款失败</span>;
  return '-';
}

function ProviderBadge({ value }) {
  const key = String(value || '').toLowerCase();
  return <span className={`badge badge-provider-${key}`}>{providerText[key] || value || '-'}</span>;
}

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function SearchBox({ value, onChange, placeholder = '搜索邮箱、ID、关键字' }) {
  return (
    <label className="search-box">
      <FontAwesomeIcon icon={faMagnifyingGlass} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ReasonDialog({ config, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [qsTop100, setQsTop100] = useState(false);
  if (!config) return null;
  const reasonOptions = Array.isArray(config.reasonOptions) ? config.reasonOptions : [];
  const multipleReasons = Boolean(config.multipleReasons);
  const reasonRequired = config.reasonRequired !== false;
  const minLength = reasonRequired ? (config.minLength || 2) : 0;
  const maxLength = config.maxLength || 1000;
  const showQsTop100 = Boolean(config.showQsTop100);
  const showReason = !config.hideReason;
  const resolvedReason = multipleReasons ? selectedReasons.join('；') : reason.trim();
  const payload = showQsTop100 ? { qsTop100, reason: resolvedReason } : resolvedReason;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reason-title">
        <h2 id="reason-title">{config.title}</h2>
        {config.description ? <p>{config.description}</p> : null}
        {showReason && reasonOptions.length && multipleReasons ? (
          <fieldset className="reason-option-list">
            <legend>{config.reasonPlaceholder || '选择操作原因（可多选）'}</legend>
            {reasonOptions.map((option) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              return (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(value)}
                    onChange={(event) => setSelectedReasons((previous) => (
                      event.target.checked
                        ? [...previous, value]
                        : previous.filter((item) => item !== value)
                    ))}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </fieldset>
        ) : showReason && reasonOptions.length ? (
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
            aria-label="选择操作原因"
          >
            <option value="">{config.reasonPlaceholder || '请选择操作原因'}</option>
            {reasonOptions.map((option) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              return <option value={value} key={value}>{label}</option>;
            })}
          </select>
        ) : showReason ? (
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={config.placeholder || '填写操作原因'}
            maxLength={maxLength}
            autoFocus
          />
        ) : null}
        {showQsTop100 ? (
          <label className="modal-checkbox">
            <input
              type="checkbox"
              checked={qsTop100}
              onChange={(event) => setQsTop100(event.target.checked)}
            />
            <span>标记为QS100</span>
          </label>
        ) : null}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>取消</button>
          <button
            onClick={() => onSubmit(payload)}
            disabled={showReason && resolvedReason.length < minLength}
          >
            {config.confirmLabel || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/admin/auth/login', { method: 'POST', body: { username, password } });
      setSession(data);
      onLogin(data.admin);
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div>
            <h1>Mentory Admin</h1>
            <p>本地后台管理系统</p>
          </div>
        </div>
        <label>
          后台账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={busy}>{busy ? '登录中...' : '登录'}</button>
      </form>
    </main>
  );
}

const getTopbarTitle = (pathname) => {
  if (pathname === '/dashboard') return { title: 'Dashboard' };
  if (pathname === '/users') return { title: '学生管理' };
  if (pathname === '/mentors/reviews') return { title: '导师管理' };
  if (pathname === '/mentor-payroll') return { title: '导师薪资' };
  if (pathname === '/orders') return { title: '订单管理' };
  if (pathname === '/classrooms') return { title: '课堂管理' };
  if (pathname === '/course-disputes') return { title: '异议管理' };
  if (pathname === '/email-broadcasts') return { title: '统一邮件' };
  if (pathname === '/audit-logs') return { title: '审计日志', subtitle: '后台写操作记录' };
  const watchMatch = pathname.match(/^\/classrooms\/(\d+)\/watch$/);
  if (watchMatch) return { title: `课堂旁观 #${watchMatch[1]}`, subtitle: '只读模式，不会触发学生或导师操作' };
  return { title: 'Dashboard' };
};

function Shell({ onLogout }) {
  const location = useLocation();
  const topbarTitle = getTopbarTitle(location.pathname);
  const isDashboard = location.pathname === '/dashboard';
  const navigationStats = useAsync(() => api('/api/admin/navigation-stats'), [location.pathname]);
  const navCounts = {
    '/mentors/reviews': navigationStats.data?.mentors,
    '/orders': navigationStats.data?.orders,
    '/course-disputes': navigationStats.data?.disputes,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div>
            <strong>Mentory</strong>
            <span>Admin Console</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <FontAwesomeIcon icon={item.icon} />
              <span>{item.label}</span>
              {navCounts[item.to] > 0 ? <em className="nav-count">{navCounts[item.to]}</em> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={`content ${isDashboard ? 'dashboard-content' : ''}`}>
        <header className={`topbar ${isDashboard ? 'dashboard-topbar' : ''}`}>
          <div className="topbar-title">
            <strong>{topbarTitle.title}</strong>
            {topbarTitle.subtitle ? <span>{topbarTitle.subtitle}</span> : null}
          </div>
          {isDashboard ? <DashboardTopbarDateRangeFilter /> : null}
          <button className="ghost icon-text refresh-button" type="button" onClick={() => window.location.reload()}>
            <FontAwesomeIcon icon={faRotateRight} />
            刷新
          </button>
          <button className="ghost icon-text" type="button" onClick={onLogout}>
            <FontAwesomeIcon icon={faRightFromBracket} />
            退出
          </button>
        </header>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/mentors/reviews" element={<MentorReviewsPage />} />
          <Route path="/mentor-payroll" element={<MentorPayrollPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/classrooms" element={<ClassroomsPage />} />
          <Route path="/course-disputes" element={<CourseDisputesPage />} />
          <Route path="/email-broadcasts" element={<EmailBroadcastsPage />} />
          <Route path="/classrooms/:courseId/watch" element={<ClassroomWatchPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function getCurrentMonthDateRange() {
  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const now = new Date();
  return {
    startDate: formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: formatDateKey(now),
  };
}

function getRecentDaysDateRange(days) {
  const now = new Date();
  return {
    startDate: toLocalDateKey(addDays(now, -(days - 1))),
    endDate: toLocalDateKey(now),
  };
}

function getCurrentYearDateRange() {
  const now = new Date();
  return {
    startDate: toLocalDateKey(new Date(now.getFullYear(), 0, 1)),
    endDate: toLocalDateKey(now),
  };
}

function Dashboard() {
  const initialRange = useMemo(() => getCurrentMonthDateRange(), []);
  const [searchParams] = useSearchParams();
  const rawStartDate = searchParams.get('startDate') || initialRange.startDate;
  const rawEndDate = searchParams.get('endDate') || initialRange.endDate;
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate) ? rawStartDate : initialRange.startDate;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEndDate) ? rawEndDate : initialRange.endDate;
  const { loading, error, data } = useAsync(
    () => api('/api/admin/dashboard/summary', { params: { startDate, endDate } }),
    [startDate, endDate]
  );
  const dashboard = useMemo(() => {
    const d = data || {};
    const orders = d.orders || {};
    const courses = d.courses || {};
    const lessonHours = d.lessonHours || {};
    const comparison = d.comparison || {};
    const gmvThisMonth = asNumber(orders.paidAmountCnyThisMonth ?? orders.paidAmountCny);
    const gmvLastMonth = asNumber(orders.paidAmountCnyLastMonth);
    const platformRevenue = gmvThisMonth * PLATFORM_COMMISSION_RATE;
    const previousPlatformRevenue = gmvLastMonth * PLATFORM_COMMISSION_RATE;
    const mentorPayable = Math.max(gmvThisMonth - platformRevenue, 0);
    const completedThisMonth = asNumber(courses.completedCoursesThisMonth ?? courses.completedCourses);
    const completedLastMonth = asNumber(courses.completedCoursesLastMonth);
    const disputedCount = asNumber(lessonHours.disputedLessonHours);
    const pendingLessonHours = asNumber(lessonHours.pendingLessonHours);
    const scheduledCourses = asNumber(courses.scheduledCourses);
    const failedOrders = asNumber(orders.failedOrders);
    const gmvChange = gmvLastMonth > 0
      ? ((gmvThisMonth - gmvLastMonth) / gmvLastMonth) * 100
      : (gmvThisMonth > 0 ? 100 : 0);
    const platformRevenueChange = previousPlatformRevenue > 0
      ? ((platformRevenue - previousPlatformRevenue) / previousPlatformRevenue) * 100
      : (platformRevenue > 0 ? 100 : 0);
    const completedChange = completedLastMonth > 0
      ? ((completedThisMonth - completedLastMonth) / completedLastMonth) * 100
      : (completedThisMonth > 0 ? 100 : 0);
    const formatDelta = (value) => `${value >= 0 ? '+' : ''}${Math.round(value)}%`;
    const parsedStartDate = parseDateKey(startDate);
    const parsedEndDate = parseDateKey(endDate);
    const isSingleMonthRange = parsedStartDate && parsedEndDate
      && parsedStartDate.getFullYear() === parsedEndDate.getFullYear()
      && parsedStartDate.getMonth() === parsedEndDate.getMonth();
    const now = new Date();
    const isCurrentYearRange = parsedStartDate && endDate === toLocalDateKey(now)
      && parsedStartDate.getFullYear() === now.getFullYear()
      && parsedStartDate.getMonth() === 0
      && parsedStartDate.getDate() === 1;
    const periodComparisonLabel = isCurrentYearRange
      ? '较去年'
      : isSingleMonthRange
        ? '较上月'
        : '';
    const gmvSeries = buildTrendSeries(d.trends, 'gmvCny', Math.max(gmvThisMonth / 12, 280), startDate, endDate);
    const revenueSeries = buildTrendSeries(d.trends, 'platformRevenueCny', Math.max(platformRevenue / 12, 56), startDate, endDate);
    const completedSeries = buildTrendSeries(d.trends, 'completedCourses', Math.max(completedThisMonth / 10, 1), startDate, endDate);

    return {
      cards: [
        {
          label: 'GMV',
          value: formatCurrencyCny(gmvThisMonth),
          hint: periodComparisonLabel,
          delta: periodComparisonLabel ? formatDelta(gmvChange) : '',
          tone: 'blue',
          icon: faWallet,
        },
        {
          label: '平台收入',
          value: formatCurrencyCny(platformRevenue),
          hint: periodComparisonLabel,
          delta: periodComparisonLabel ? formatDelta(platformRevenueChange) : '',
          tone: 'green',
          icon: faCoins,
        },
        {
          label: '待结算导师金额',
          value: formatCurrencyCny(mentorPayable),
          hint: `${pendingLessonHours} 笔待结算`,
          tone: 'orange',
          icon: faUserTie,
        },
        {
          label: '完成课堂',
          value: completedThisMonth,
          hint: completedLastMonth ? `较上月 ${formatDelta(completedChange)}` : '',
          tone: 'slate',
          icon: faGraduationCap,
        },
      ],
      finance: [
        { label: '已收款金额', value: formatCurrencyCny(gmvThisMonth), icon: faCreditCard, tone: 'green' },
        { label: '已确认收入', value: formatCurrencyCny(platformRevenue), icon: faReceipt, tone: 'blue' },
        { label: '平台佣金收入', value: formatCurrencyCny(platformRevenue), icon: faPercent, tone: 'purple' },
        { label: '待结算导师金额', value: formatCurrencyCny(mentorPayable), icon: faUserTie, tone: 'orange' },
        { label: '退款 / 争议金额', value: formatCurrencyCny(0), icon: faMoneyBillTransfer, tone: 'red', hint: `争议课时 ${disputedCount}` },
      ],
      fulfillment: [
        { label: '已排课', value: scheduledCourses, tone: 'blue' },
        { label: '已完成', value: completedThisMonth, tone: 'green' },
        { label: '待确认', value: pendingLessonHours, tone: 'orange' },
        { label: '已取消', value: failedOrders, tone: 'slate' },
        { label: '争议中', value: disputedCount, tone: 'red' },
      ],
      users: [
        { label: '学生总数', value: asNumber(d.roles?.students), hint: '较上月', delta: formatDelta(asNumber(comparison.studentsChange)), icon: faGraduationCap },
        { label: '付费学生', value: asNumber(d.paidStudents?.paidStudents), hint: '较上月', delta: formatDelta(asNumber(comparison.paidStudentsChange)), icon: faWallet },
        { label: '导师总数', value: asNumber(d.roles?.mentors), hint: '较上月', delta: formatDelta(asNumber(comparison.mentorsChange)), icon: faUserTie },
        { label: '已审核导师', value: asNumber(d.mentors?.approvedMentors), hint: '较上月', delta: formatDelta(asNumber(comparison.approvedMentorsChange)), icon: faShieldHalved },
        { label: '活跃导师', value: asNumber(courses.activeMentors), hint: '较上月', delta: formatDelta(asNumber(comparison.activeMentorsChange)), icon: faStar },
      ],
      trends: [
        { label: 'GMV', tone: 'blue', data: gmvSeries },
        { label: '平台收入', tone: 'green', data: revenueSeries },
        { label: '完成课堂', tone: 'purple', data: completedSeries },
      ],
    };
  }, [data, endDate, startDate]);

  return (
    <section className="dashboard-page">
      <PageTitle title="Dashboard" />
      <State loading={loading} error={error}>
        <div className="dashboard-stack">
          <div className="metric-grid dashboard-metric-grid">
            {dashboard.cards.map((card) => (
              <article className={`metric dashboard-metric metric-${card.tone}`} key={card.label}>
                <div className="dashboard-metric-icon">
                  <FontAwesomeIcon icon={card.icon} />
                </div>
                <div>
                  <span>{card.label}</span>
                  <div className="dashboard-metric-value">
                    <strong>{card.value}</strong>
                    {card.hint ? (
                      <small>
                        {card.hint}
                        {card.delta ? <b>{card.delta}</b> : null}
                      </small>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="dashboard-main-grid">
            <article className="dashboard-card finance-card">
              <div className="dashboard-card-heading">
                <div>
                  <FontAwesomeIcon icon={faChartPie} />
                  <h2>财务概览</h2>
                </div>
              </div>
              <div className="finance-list">
                {dashboard.finance.map((item) => (
                  <div className="finance-row" key={item.label}>
                    <div className={`finance-icon finance-${item.tone}`}>
                      <FontAwesomeIcon icon={item.icon} />
                    </div>
                    <div className="finance-copy">
                      <span>{item.label}</span>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </div>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-card fulfillment-card">
              <div className="dashboard-card-heading">
                <div>
                  <FontAwesomeIcon icon={faCalendarDays} />
                  <h2>课程履约</h2>
                </div>
              </div>
              <div className="fulfillment-strip">
                {dashboard.fulfillment.map((item) => (
                  <div className={`fulfillment-item fulfillment-${item.tone}`} key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="dashboard-bottom-grid">
            <article className="dashboard-card supply-card">
              <div className="dashboard-card-heading">
                <div>
                  <FontAwesomeIcon icon={faUsers} />
                  <h2>用户与供给</h2>
                </div>
              </div>
              <div className="supply-grid">
                {dashboard.users.map((item) => (
                  <div className="supply-item" key={item.label}>
                    <div className="supply-icon">
                      <FontAwesomeIcon icon={item.icon} />
                    </div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint} <b>{item.delta}</b></small>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-card combined-trend-card">
              <div className="dashboard-card-heading">
                <div>
                  <FontAwesomeIcon icon={faChartLine} />
                  <h2>近30天趋势</h2>
                </div>
                <div className="trend-legend">
                  {dashboard.trends.map((trend) => (
                    <span className={`legend-${trend.tone}`} key={trend.label}>{trend.label}</span>
                  ))}
                </div>
              </div>
              <MultiTrendSvg series={dashboard.trends} />
            </article>
          </div>
        </div>
      </State>
    </section>
  );
}

function buildTrendSeries(rows = [], metric, fallbackBase, startDate, endDate) {
  const byDay = new Map();
  rows.forEach((row) => {
    const rawDay = row.day ? new Date(row.day) : null;
    if (!rawDay || Number.isNaN(rawDay.getTime())) return;
    const key = rawDay.toISOString().slice(0, 10);
    const gmv = asNumber(row.gmvCny);
    const value = metric === 'platformRevenueCny'
      ? gmv * PLATFORM_COMMISSION_RATE
      : asNumber(row[metric]);
    byDay.set(key, value);
  });

  const hasRealData = byDay.size > 0;
  const parsedStart = parseDateKey(startDate);
  const parsedEnd = parseDateKey(endDate);
  const end = parsedEnd || new Date();
  const start = parsedStart || addDays(end, -29);
  const dayCount = Math.max(1, Math.min(370, Math.round((end.getTime() - start.getTime()) / 86400000) + 1));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    const key = toLocalDateKey(date);
    const mockWave = Math.sin(index / 2.6) * 0.22 + Math.cos(index / 5) * 0.16 + 1;
    const mockRamp = 0.78 + index * 0.012;
    const fallback = Math.max(0, Math.round(asNumber(fallbackBase) * mockWave * mockRamp));
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: hasRealData ? asNumber(byDay.get(key)) : fallback,
    };
  });
}

function MultiTrendSvg({ series }) {
  const width = 680;
  const height = 210;
  const chartLeft = 44;
  const chartRight = 24;
  const chartTop = 18;
  const chartBottom = 34;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;
  const maxBySeries = series.map((trend) => Math.max(...trend.data.map((point) => asNumber(point.value)), 1));
  const pointsBySeries = series.map((trend, trendIndex) => {
    const max = maxBySeries[trendIndex] || 1;
    return trend.data.map((point, index) => {
      const x = chartLeft + (trend.data.length === 1 ? chartWidth : (index / (trend.data.length - 1)) * chartWidth);
      const y = chartTop + chartHeight - (asNumber(point.value) / max) * chartHeight;
      return { x, y, label: point.label };
    });
  });
  const lineFor = (points) => points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(' ');
  const labelSource = pointsBySeries[0] || [];
  const labelIndexes = labelSource.length <= 7
    ? labelSource.map((_, index) => index)
    : Array.from({ length: 7 }, (_, index) => Math.round((index / 6) * (labelSource.length - 1)));

  return (
    <svg className="multi-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近30天趋势">
      {[0, 1, 2, 3].map((index) => {
        const y = chartTop + (chartHeight / 3) * index;
        return (
          <g key={index}>
            <line className="trend-grid-line" x1={chartLeft} x2={width - chartRight} y1={y} y2={y} />
            <text className="trend-axis-label" x="0" y={y + 4}>{`${60 - index * 20}k`}</text>
          </g>
        );
      })}
      <line className="trend-axis-line" x1={chartLeft} x2={width - chartRight} y1={height - chartBottom} y2={height - chartBottom} />
      {pointsBySeries.map((points, index) => (
        <g className={`multi-trend multi-trend-${series[index].tone}`} key={series[index].label}>
          <path d={lineFor(points)} />
          {points.map((point, pointIndex) => (
            pointIndex % 4 === 0 || pointIndex === points.length - 1
              ? <circle key={pointIndex} cx={point.x} cy={point.y} r="2.8" />
              : null
          ))}
        </g>
      ))}
      {labelIndexes.map((index) => {
        const point = pointsBySeries[0]?.[index];
        if (!point) return null;
        return <text className="trend-date-label" key={index} x={point.x} y={height - 10}>{point.label}</text>;
      })}
    </svg>
  );
}

function PageTitle({ title, subtitle }) {
  return (
    <div className="page-title" hidden>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function State({ loading, error, children }) {
  if (loading) return <div className="state">加载中...</div>;
  if (error) return <div className="state error"><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</div>;
  return children;
}

function UsersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [sort, setSort] = useState({ field: 'id', direction: 'desc' });
  const { loading, error, data } = useAsync(
    () => api('/api/admin/users', { params: { q, status, limit: 50 } }),
    [q, status, reload]
  );

  const users = useMemo(() => {
    const sorted = [...(data?.users || [])];
    sorted.sort((a, b) => {
      let left;
      let right;

      if (sort.field === 'created_at') {
        left = new Date(a.created_at).getTime() || 0;
        right = new Date(b.created_at).getTime() || 0;
      } else {
        left = asNumber(a[sort.field]);
        right = asNumber(b[sort.field]);
      }

      return sort.direction === 'asc' ? left - right : right - left;
    });
    return sorted;
  }, [data?.users, sort]);

  const updateSort = (field, direction) => {
    setSort({ field, direction });
  };

  const statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'active', label: '正常' },
    { value: 'suspended', label: '已封禁' },
  ];

  const updateStatus = async (reason) => {
    await api(`/api/admin/users/${dialog.user.id}/status`, {
      method: 'PATCH',
      body: { status: dialog.nextStatus, reason },
    });
    setDialog(null);
    setDetail(null);
    setReload((n) => n + 1);
  };

  return (
    <section>
      <PageTitle title="学生管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} />
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          className="students-table"
          columns={[
            <SortHeader label="StudentID" field="id" sort={sort} onSort={updateSort} />,
            '邮箱',
            <SortHeader label="课时余额" field="lesson_balance_hours" sort={sort} onSort={updateSort} />,
            <SortHeader label="累计充值（CNY）" field="total_paid_cny" sort={sort} onSort={updateSort} />,
            <StatusFilterHeader value={status} options={statusOptions} onChange={setStatus} />,
            <SortHeader label="注册时间" field="created_at" sort={sort} onSort={updateSort} />,
            '操作',
          ]}
          rows={users.map((user) => [
            user.student_id || '-',
            user.email,
            user.lesson_balance_hours,
            asNumber(user.total_paid_cny).toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
            <Badge value={user.account_status} />,
            formatDate(user.created_at),
            <div className="row-actions">
              <button className="ghost" onClick={() => setDetail(user.id)}>详情</button>
              <button
                type="button"
                className="icon-action suspend-action"
                title={user.account_status === 'suspended' ? '解封学生账号' : '封禁学生账号'}
                aria-label={user.account_status === 'suspended' ? '解封学生账号' : '封禁学生账号'}
                onClick={() => setDialog({
                  user,
                  nextStatus: user.account_status === 'suspended' ? 'active' : 'suspended',
                  title: user.account_status === 'suspended' ? '解封学生账号' : '封禁学生账号',
                })}
              >
                <FontAwesomeIcon icon={user.account_status === 'suspended' ? faUnlock : faBan} />
              </button>
            </div>,
          ])}
        />
      </State>
      {detail ? <UserDrawer userId={detail} onClose={() => setDetail(null)} /> : null}
      <ReasonDialog
        config={dialog ? { title: dialog.title, description: `目标用户：${dialog.user.email}` } : null}
        onClose={() => setDialog(null)}
        onSubmit={updateStatus}
      />
    </section>
  );
}

function SortHeader({ label, field, sort, onSort }) {
  const activeDirection = sort.field === field ? sort.direction : '';
  return (
    <span className="sort-header">
      <span>{label}</span>
      <span className="sort-arrows">
        <button
          type="button"
          className={activeDirection === 'asc' ? 'active' : ''}
          onClick={() => onSort(field, 'asc')}
          aria-label={`${label}升序`}
        >
          ▲
        </button>
        <button
          type="button"
          className={activeDirection === 'desc' ? 'active' : ''}
          onClick={() => onSort(field, 'desc')}
          aria-label={`${label}降序`}
        >
          ▼
        </button>
      </span>
    </span>
  );
}

function StatusFilterHeader({ value, options, onChange, defaultLabel = '状态', ariaLabel = '学生状态筛选' }) {
  const activeOption = options.find((option) => option.value === value) || options[0];
  return (
    <span className={[
      'status-filter-header',
      value ? 'active' : '',
      value ? `status-filter-header-${value}` : '',
    ].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="status-filter-trigger"
        aria-haspopup="menu"
        aria-label={ariaLabel}
      >
        <span>{value ? activeOption.label : defaultLabel}</span>
      </button>
      <span className="status-filter-menu" role="menu" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.value || 'all'}
            type="button"
            className={[
              value === option.value ? 'active' : '',
              option.value ? `status-filter-option-${option.value}` : 'status-filter-option-all',
            ].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
            role="menuitemradio"
            aria-checked={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  );
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date, days) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const buildCalendarMonth = (monthDate) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, (_, index) => ({ key: `blank-${index}`, blank: true }));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    cells.push({
      key: toLocalDateKey(date),
      date,
      day,
      value: toLocalDateKey(date),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-tail-${cells.length}`, blank: true });
  }

  return cells;
};

function RangeCalendarMonth({ monthDate, startDate, endDate, onDateSelect }) {
  const startTime = parseDateKey(startDate)?.getTime();
  const endTime = parseDateKey(endDate)?.getTime();
  const today = toLocalDateKey(new Date());

  return (
    <span className="range-calendar-month">
      <span className="range-calendar-title">
        {monthDate.getFullYear()} 年 {monthDate.getMonth() + 1} 月
      </span>
      <span className="range-calendar-weekdays">
        {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </span>
      <span className="range-calendar-grid">
        {buildCalendarMonth(monthDate).map((cell) => {
          if (cell.blank) return <span key={cell.key} className="range-calendar-cell empty" />;

          const cellTime = cell.date.getTime();
          const isStart = cell.value === startDate;
          const isEnd = cell.value === endDate;
          const isInRange = startTime && endTime && cellTime > startTime && cellTime < endTime;
          const isSingleDay = startDate && startDate === endDate && cell.value === startDate;

          return (
            <span
              key={cell.key}
              className={[
                'range-calendar-cell',
                isStart ? 'range-start' : '',
                isEnd ? 'range-end' : '',
                isInRange ? 'in-range' : '',
                isSingleDay ? 'single-day' : '',
                cell.value === today ? 'today' : '',
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                className="range-calendar-day"
                onClick={() => onDateSelect(cell.value)}
                aria-label={`${cell.value} ${isStart || isEnd ? '已选择' : '可选择'}`}
                aria-pressed={isStart || isEnd}
              >
                {cell.day}
              </button>
            </span>
          );
        })}
      </span>
    </span>
  );
}

function DateRangeHeader({ label, field, sort, onSort, startDate, endDate, onStartDateChange, onEndDateChange }) {
  const hasRange = Boolean(startDate || endDate);
  const displayLabel = hasRange ? '已选时间' : label;
  const [isOpen, setIsOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(startDate);
  const [draftEndDate, setDraftEndDate] = useState(endDate);
  const [viewMonth, setViewMonth] = useState(() => {
    const parsedStart = parseDateKey(startDate);
    return parsedStart ? new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const secondMonth = useMemo(() => addMonths(viewMonth, 1), [viewMonth]);

  useEffect(() => {
    if (!isOpen) {
      setDraftStartDate(startDate);
      setDraftEndDate(endDate);
    }
  }, [endDate, isOpen, startDate]);

  const selectDate = (value) => {
    setIsOpen(true);

    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      setDraftStartDate(value);
      setDraftEndDate('');
      return;
    }

    if (value < draftStartDate) {
      setDraftStartDate(value);
      setDraftEndDate('');
      return;
    }

    setDraftEndDate(value);
    onStartDateChange(draftStartDate);
    onEndDateChange(value);
  };

  const applyCenteredRange = (days) => {
    setIsOpen(true);
    const today = new Date();
    if (days === 0) {
      const todayKey = toLocalDateKey(today);
      selectDate(todayKey);
      setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
      return;
    }

    const centeredStart = toLocalDateKey(addDays(today, -days));
    const centeredEnd = toLocalDateKey(addDays(today, days));
    setDraftStartDate(centeredStart);
    setDraftEndDate(centeredEnd);
    onStartDateChange(centeredStart);
    onEndDateChange(centeredEnd);
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  return (
    <span
      className={[
        'date-filter-header',
        hasRange ? 'active' : '',
        isOpen ? 'open' : '',
      ].filter(Boolean).join(' ')}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
    >
      <span className="date-filter-main">
        <button
          type="button"
          className="date-filter-trigger"
          aria-haspopup="menu"
          aria-label={`${label}日期筛选`}
        >
          {displayLabel}
        </button>
        <span className="sort-arrows">
          <button
            type="button"
            className={sort.field === field && sort.direction === 'asc' ? 'active' : ''}
            onClick={() => onSort(field, 'asc')}
            aria-label={`${label}升序`}
          >
            ▲
          </button>
          <button
            type="button"
            className={sort.field === field && sort.direction === 'desc' ? 'active' : ''}
            onClick={() => onSort(field, 'desc')}
            aria-label={`${label}降序`}
          >
            ▼
          </button>
        </span>
      </span>
      <span className="date-filter-menu" role="menu" aria-label={`${label}日期范围筛选`}>
        <span className="range-calendar-nav">
          <button
            type="button"
            className="range-calendar-arrow previous"
            onClick={() => {
              setIsOpen(true);
              setViewMonth((month) => addMonths(month, -1));
            }}
            aria-label="上一个月"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            className="range-calendar-arrow next"
            onClick={() => {
              setIsOpen(true);
              setViewMonth((month) => addMonths(month, 1));
            }}
            aria-label="下一个月"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </span>
        <span className="range-calendar-selected">
          <span>开始日期 <strong>{draftStartDate || 'yyyy/mm/dd'}</strong></span>
          <span>结束日期 <strong>{draftEndDate || 'yyyy/mm/dd'}</strong></span>
        </span>
        <span className="range-calendar-months">
          <RangeCalendarMonth
            monthDate={viewMonth}
            startDate={draftStartDate}
            endDate={draftEndDate}
            onDateSelect={selectDate}
          />
          <RangeCalendarMonth
            monthDate={secondMonth}
            startDate={draftStartDate}
            endDate={draftEndDate}
            onDateSelect={selectDate}
          />
        </span>
        <span className="range-calendar-footer">
          <button
            type="button"
            className="date-filter-clear"
            onClick={() => {
              setIsOpen(true);
              setDraftStartDate('');
              setDraftEndDate('');
              onStartDateChange('');
              onEndDateChange('');
            }}
            disabled={!hasRange && !draftStartDate && !draftEndDate}
          >
            清除
          </button>
          <button
            type="button"
            className="range-calendar-quick"
            onClick={() => applyCenteredRange(0)}
          >
            今天
          </button>
        </span>
      </span>
    </span>
  );
}

function DashboardDateRangeFilter({ className = '', startDate, endDate, onRangeChange }) {
  const currentMonthRange = useMemo(() => getCurrentMonthDateRange(), []);
  const recent30DaysRange = useMemo(() => getRecentDaysDateRange(30), []);
  const currentYearRange = useMemo(() => getCurrentYearDateRange(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(startDate);
  const [draftEndDate, setDraftEndDate] = useState(endDate);
  const [viewMonth, setViewMonth] = useState(() => {
    const parsedStart = parseDateKey(startDate);
    return parsedStart ? new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const secondMonth = useMemo(() => addMonths(viewMonth, 1), [viewMonth]);
  const isCurrentMonth = startDate === currentMonthRange.startDate && endDate === currentMonthRange.endDate;
  const isRecent30Days = startDate === recent30DaysRange.startDate && endDate === recent30DaysRange.endDate;
  const isCurrentYear = startDate === currentYearRange.startDate && endDate === currentYearRange.endDate;
  let displayLabel = `${(startDate || 'yyyy/mm/dd').replace(/-/g, '/')} - ${(endDate || 'yyyy/mm/dd').replace(/-/g, '/')}`;
  if (isCurrentMonth) {
    displayLabel = '本月';
  } else if (isRecent30Days) {
    displayLabel = '30天';
  } else if (isCurrentYear) {
    displayLabel = '本年';
  }

  useEffect(() => {
    if (!isOpen) {
      setDraftStartDate(startDate);
      setDraftEndDate(endDate);
    }
  }, [endDate, isOpen, startDate]);

  const commitRange = (nextStartDate, nextEndDate, shouldClose = false) => {
    onRangeChange(nextStartDate, nextEndDate);
    if (shouldClose) {
      setIsOpen(false);
      document.activeElement?.blur?.();
    }
  };

  const selectDate = (value) => {
    setIsOpen(true);

    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      setDraftStartDate(value);
      setDraftEndDate('');
      return;
    }

    if (value < draftStartDate) {
      setDraftStartDate(value);
      setDraftEndDate('');
      return;
    }

    setDraftEndDate(value);
    commitRange(draftStartDate, value, true);
  };

  const applyPresetRange = (range) => {
    setDraftStartDate(range.startDate);
    setDraftEndDate(range.endDate);
    commitRange(range.startDate, range.endDate, true);
    const parsedStart = parseDateKey(range.startDate);
    if (parsedStart) setViewMonth(new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1));
  };

  return (
    <span
      className={[
        'date-filter-header',
        'dashboard-date-filter',
        className,
        startDate && endDate ? 'active' : '',
        isOpen ? 'open' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
    >
      <button
        type="button"
        className="dashboard-date-filter-trigger"
        aria-haspopup="menu"
        aria-label="Dashboard 日期范围筛选"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{displayLabel}</span>
        <FontAwesomeIcon icon={faChevronDown} />
      </button>
      <span className="date-filter-menu dashboard-date-filter-menu" role="menu" aria-label="Dashboard 日期范围筛选">
        <span className="range-calendar-nav">
          <button
            type="button"
            className="range-calendar-arrow previous"
            onClick={() => {
              setIsOpen(true);
              setViewMonth((month) => addMonths(month, -1));
            }}
            aria-label="上一个月"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            className="range-calendar-arrow next"
            onClick={() => {
              setIsOpen(true);
              setViewMonth((month) => addMonths(month, 1));
            }}
            aria-label="下一个月"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </span>
        <span className="range-calendar-selected">
          <span>开始日期 <strong>{draftStartDate || 'yyyy/mm/dd'}</strong></span>
          <span>结束日期 <strong>{draftEndDate || 'yyyy/mm/dd'}</strong></span>
        </span>
        <span className="range-calendar-months">
          <RangeCalendarMonth
            monthDate={viewMonth}
            startDate={draftStartDate}
            endDate={draftEndDate}
            onDateSelect={selectDate}
          />
          <RangeCalendarMonth
            monthDate={secondMonth}
            startDate={draftStartDate}
            endDate={draftEndDate}
            onDateSelect={selectDate}
          />
        </span>
        <span className="range-calendar-footer">
          <button
            type="button"
            className="range-calendar-quick"
            onClick={() => applyPresetRange(currentMonthRange)}
          >
            本月
          </button>
          <button
            type="button"
            className="range-calendar-quick"
            onClick={() => applyPresetRange(recent30DaysRange)}
          >
            30天
          </button>
          <button
            type="button"
            className="range-calendar-quick"
            onClick={() => applyPresetRange(currentYearRange)}
          >
            本年
          </button>
        </span>
      </span>
    </span>
  );
}

function DashboardTopbarDateRangeFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMonthRange = useMemo(() => getCurrentMonthDateRange(), []);
  const rawStartDate = searchParams.get('startDate') || currentMonthRange.startDate;
  const rawEndDate = searchParams.get('endDate') || currentMonthRange.endDate;
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate) ? rawStartDate : currentMonthRange.startDate;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEndDate) ? rawEndDate : currentMonthRange.endDate;

  const updateRange = (nextStartDate, nextEndDate) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('startDate', nextStartDate);
      next.set('endDate', nextEndDate);
      return next;
    }, { replace: true });
  };

  return (
    <DashboardDateRangeFilter
      className="dashboard-topbar-date-filter"
      startDate={startDate}
      endDate={endDate}
      onRangeChange={updateRange}
    />
  );
}

function UserDrawer({ userId, onClose }) {
  const [reload, setReload] = useState(0);
  const [selectedMentorId, setSelectedMentorId] = useState(null);
  const { loading, error, data } = useAsync(() => api(`/api/admin/users/${userId}`), [userId, reload]);
  return (
    <>
      <aside className="drawer wide-drawer">
        <button className="drawer-close" onClick={onClose}>×</button>
        <State loading={loading} error={error}>
          <h2>{data?.user?.email}</h2>
          <DetailGrid
            items={[
              ['StudentID', data?.roles?.find((role) => role.role === 'student')?.public_id],
              ['状态', <Badge value={data?.user?.account_status} />],
              ['课时余额', data?.user?.lesson_balance_hours],
              ['最近登录', formatDate(data?.user?.last_login_at)],
              ['订单数', data?.orderSummary?.orderCount],
              ['已付金额', `CNY ${asNumber(data?.orderSummary?.paidAmountCny).toFixed(2)}`],
            ]}
          />
          <h3>角色</h3>
          <DataTable
            compact
            columns={['角色', 'Public ID', '导师审核']}
            rows={(data?.roles || []).map((role) => [
              role.role,
              role.public_id,
              role.role === 'mentor' ? <Badge value={role.mentor_review_status || '-'} /> : <span aria-hidden="true" />,
            ])}
          />
          <h3>对导师做出的评价</h3>
          <ReviewHistory
            reviews={data?.reviews || []}
            counterpartLabel="被评价导师"
            showCounterpartEmail={false}
            onCounterpartClick={(review) => setSelectedMentorId(review.counterpart_user_id)}
            onCommentDeleted={() => setReload((value) => value + 1)}
          />
        </State>
      </aside>
      {selectedMentorId ? (
        <MentorDrawer userId={selectedMentorId} onClose={() => setSelectedMentorId(null)} />
      ) : null}
    </>
  );
}

function DetailGrid({ items }) {
  return (
    <dl className="detail-grid">
      {items.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt>{key}</dt>
          <dd>{value || '-'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ReviewHistory({
  reviews,
  counterpartLabel,
  showCounterpartEmail = true,
  onCounterpartClick,
  onCommentDeleted,
}) {
  const [commentToDelete, setCommentToDelete] = useState(null);
  if (!reviews.length) return <div className="state review-empty">暂无评价</div>;

  const deleteComment = async (reason) => {
    await api(`/api/admin/reviews/${commentToDelete.id}/comment`, {
      method: 'DELETE',
      body: { reason },
    });
    setCommentToDelete(null);
    onCommentDeleted?.();
  };

  return (
    <>
      <div className="review-history">
        {reviews.map((review) => (
          <article className="review-card" key={review.id}>
          <div className="review-card-header">
            <div>
              <strong>
                {counterpartLabel}：{' '}
                {onCounterpartClick ? (
                  <button
                    type="button"
                    className="review-counterpart-link"
                    onClick={() => onCounterpartClick(review)}
                  >
                    {review.counterpart_public_id || review.counterpart_name || '-'}
                  </button>
                ) : (review.counterpart_public_id || review.counterpart_name || '-')}
              </strong>
              {showCounterpartEmail ? <span>{review.counterpart_email || review.counterpart_name || '-'}</span> : null}
            </div>
            <div className="review-overall">
              <strong>{formatReviewScore(review.overall_score)}</strong>
              <span>综合评分</span>
            </div>
          </div>
          <div className="review-meta">
            <span>课程 #{review.course_session_id}</span>
            <span>{formatCourseTimeRange(review.starts_at, review.duration_hours)}</span>
          </div>
          <dl className="review-score-grid">
            <div><dt>清晰讲解</dt><dd>{formatReviewScore(review.clarity_score)}</dd></div>
            <div><dt>沟通顺畅</dt><dd>{formatReviewScore(review.communication_score)}</dd></div>
            <div><dt>准备充分</dt><dd>{formatReviewScore(review.preparation_score)}</dd></div>
            <div><dt>专业能力</dt><dd>{formatReviewScore(review.expertise_score)}</dd></div>
            <div><dt>准时程度</dt><dd>{formatReviewScore(review.punctuality_score)}</dd></div>
          </dl>
            <div className="review-comment">
              <div className="review-comment-heading">
                <span>文字评价</span>
                {review.comment_text ? (
                  <button type="button" onClick={() => setCommentToDelete(review)}>删除评论</button>
                ) : null}
              </div>
              <p>{review.comment_text || '未填写文字评价'}</p>
            </div>
          <div className="review-timestamp">评价时间：{formatDate(review.created_at)}</div>
          </article>
        ))}
      </div>
      <ReasonDialog
        key={commentToDelete ? `delete-review-comment-${commentToDelete.id}` : 'delete-review-comment'}
        config={commentToDelete ? {
          title: '删除不当评论',
          reasonPlaceholder: '请选择删除原因',
          multipleReasons: true,
          reasonOptions: [
            '骚扰、辱骂、歧视或威胁',
            '违法、侵权或欺诈内容',
            '虚假、误导或恶意评价',
            '泄露个人隐私或敏感信息',
            '与课程无关或明显不适当',
            '广告、垃圾信息或重复内容',
          ],
          minLength: 1,
          maxLength: 500,
          confirmLabel: '确认删除评论',
        } : null}
        onClose={() => setCommentToDelete(null)}
        onSubmit={deleteComment}
      />
    </>
  );
}

function DataTable({ columns, rows, compact = false, className = '' }) {
  return (
    <div className={`table-wrap ${compact ? 'compact' : ''} ${className}`.trim()}>
      <table>
        <thead>
          <tr>{columns.map((col, index) => <th key={index}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, idx) => (
            <tr key={idx}>{row.map((cell, i) => <td key={i}>{cell || '-'}</td>)}</tr>
          )) : (
            <tr><td colSpan={columns.length} className="empty">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function getMentorStatusValue(mentor) {
  return mentor?.account_status === 'suspended' ? 'suspended' : mentor?.mentor_review_status;
}

function MentorReviewsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('actionable');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [accountDialog, setAccountDialog] = useState(null);
  const [sort, setSort] = useState({ field: 'mentor_created_at', direction: 'asc' });
  const { loading, error, data } = useAsync(
    () => api('/api/admin/mentors/reviews', { params: { q, status, limit: 50 } }),
    [q, status, reload]
  );

  const mentors = useMemo(() => {
    const sorted = [...(data?.mentors || [])];
    sorted.sort((a, b) => {
      let comparison = 0;

      if (sort.field === 'mentor_created_at') {
        comparison = (new Date(a.mentor_created_at).getTime() || 0) - (new Date(b.mentor_created_at).getTime() || 0);
      } else if (sort.field === 'total_teaching_hours') {
        comparison = asNumber(a.total_teaching_hours) - asNumber(b.total_teaching_hours);
      } else if (sort.field === 'school_degree') {
        const left = [a.school, a.degree].filter(Boolean).join(' / ');
        const right = [b.school, b.degree].filter(Boolean).join(' / ');
        comparison = left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
      } else {
        comparison = String(a[sort.field] || '').localeCompare(
          String(b[sort.field] || ''),
          'zh-CN',
          { numeric: true, sensitivity: 'base' }
        );
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [data?.mentors, sort]);

  const updateSort = (field, direction) => {
    setSort({ field, direction });
  };

  const statusOptions = [
    { value: '', label: '全部' },
    { value: 'actionable', label: '全部待处理' },
    { value: 'pending', label: '待审简历' },
    { value: 'interview_pending', label: '待面试' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '简历驳回' },
    { value: 'interview_rejected', label: '面试未通过' },
    { value: 'suspended', label: '已封禁' },
  ];

  const openResume = (mentor) => {
    if (!parseUrlList(mentor.mentor_resume_url).length) return;
    const token = getToken();
    if (!token) {
      window.alert('后台登录已失效');
      return;
    }
    window.open(buildAdminPreviewUrl(`/api/admin/mentors/${mentor.user_id}/resume-preview`, token), '_blank');
  };

  const submitReview = async (payload) => {
    const note = typeof payload === 'string' ? payload.trim() : String(payload?.reason || '').trim();
    const body = {
      stage: dialog.stage,
      decision: dialog.decision,
      ...(note ? { note } : {}),
      ...(dialog.stage === 'interview' && dialog.decision === 'pass'
        ? { qsTop100: Boolean(payload?.qsTop100) }
        : {}),
    };
    await api(`/api/admin/mentors/${dialog.mentor.user_id}/review-decision`, {
      method: 'POST',
      body,
    });
    setDialog(null);
    setDetail(null);
    setReload((n) => n + 1);
  };

  const updateMentorAccountStatus = async (reason) => {
    await api(`/api/admin/users/${accountDialog.mentor.user_id}/status`, {
      method: 'PATCH',
      body: { status: accountDialog.nextStatus, reason },
    });
    setAccountDialog(null);
    setDetail(null);
    setReload((n) => n + 1);
  };

  return (
    <section>
      <PageTitle title="导师管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索邮箱、MentorID、姓名" />
        <div className="mentor-queue-tabs" aria-label="导师审核快捷队列">
          <button
            type="button"
            className={status === 'actionable' ? 'active' : ''}
            onClick={() => setStatus((current) => current === 'actionable' ? '' : 'actionable')}
          >
            全部待处理 <span>{asNumber(data?.summary?.actionable)}</span>
          </button>
          <button
            type="button"
            className={status === 'pending' ? 'active' : ''}
            onClick={() => setStatus((current) => current === 'pending' ? '' : 'pending')}
          >
            待审简历 <span>{asNumber(data?.summary?.resumePending)}</span>
          </button>
          <button
            type="button"
            className={status === 'interview_pending' ? 'active' : ''}
            onClick={() => setStatus((current) => current === 'interview_pending' ? '' : 'interview_pending')}
          >
            待面试 <span>{asNumber(data?.summary?.interviewPending)}</span>
          </button>
        </div>
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          className="mentors-table"
          columns={[
            <SortHeader label="MentorID" field="public_id" sort={sort} onSort={updateSort} />,
            <SortHeader label="邮箱" field="email" sort={sort} onSort={updateSort} />,
            <SortHeader label="学校/学历" field="school_degree" sort={sort} onSort={updateSort} />,
            '简历',
            <SortHeader label="已授课时" field="total_teaching_hours" sort={sort} onSort={updateSort} />,
            <StatusFilterHeader value={status} options={statusOptions} onChange={setStatus} ariaLabel="导师审核状态筛选" />,
            <SortHeader label="申请时间" field="mentor_created_at" sort={sort} onSort={updateSort} />,
            '操作',
          ]}
          rows={mentors.map((mentor) => [
            mentor.public_id,
            mentor.email,
            [mentor.school, mentor.degree].filter(Boolean).join(' / '),
            parseUrlList(mentor.mentor_resume_url).length ? (
              <button type="button" className="link-button" onClick={() => openResume(mentor)}>
                打开简历
              </button>
            ) : null,
            asNumber(mentor.total_teaching_hours).toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
            <Badge value={getMentorStatusValue(mentor)} />,
            formatDate(mentor.mentor_created_at),
            <div className="row-actions">
              <button
                type="button"
                className="text-action detail-action"
                onClick={() => setDetail(mentor.user_id)}
              >
                详情
              </button>
              {mentor.mentor_review_status === 'pending' || mentor.mentor_review_status === 'interview_pending' ? (
                <>
                  <button
                    type="button"
                    className="icon-action approve-action"
                    title={mentor.mentor_review_status === 'pending' ? '简历通过' : '面试通过'}
                    aria-label={mentor.mentor_review_status === 'pending' ? '简历通过' : '面试通过'}
                    onClick={() => setDialog({
                      title: mentor.mentor_review_status === 'pending' ? '确认简历通过' : '记录面试通过',
                      mentor,
                      stage: mentor.mentor_review_status === 'pending' ? 'resume' : 'interview',
                      decision: 'pass',
                    })}
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </button>
                  <button
                    type="button"
                    className="icon-action reject-action"
                    title={mentor.mentor_review_status === 'pending' ? '简历驳回' : '面试未通过'}
                    aria-label={mentor.mentor_review_status === 'pending' ? '简历驳回' : '面试未通过'}
                    onClick={() => setDialog({
                      title: mentor.mentor_review_status === 'pending' ? '驳回导师简历' : '记录面试未通过',
                      mentor,
                      stage: mentor.mentor_review_status === 'pending' ? 'resume' : 'interview',
                      decision: 'reject',
                    })}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="icon-action suspend-action"
                title={mentor.account_status === 'suspended' ? '解封导师账号' : '封禁导师账号'}
                aria-label={mentor.account_status === 'suspended' ? '解封导师账号' : '封禁导师账号'}
                onClick={() => setAccountDialog({
                  mentor,
                  nextStatus: mentor.account_status === 'suspended' ? 'active' : 'suspended',
                  title: mentor.account_status === 'suspended' ? '解封导师账号' : '封禁导师账号',
                })}
              >
                <FontAwesomeIcon icon={mentor.account_status === 'suspended' ? faUnlock : faBan} />
              </button>
            </div>,
          ])}
        />
      </State>
      {detail ? (
        <MentorDrawer
          userId={detail}
          onClose={() => setDetail(null)}
        />
      ) : null}
      <ReasonDialog
        key={dialog ? `${dialog.stage}-${dialog.decision}-${dialog.mentor.user_id}` : 'mentor-review-dialog'}
        config={dialog ? {
          title: dialog.title,
          description: `目标导师：${dialog.mentor.email} (${dialog.mentor.public_id})`,
          reasonRequired: !(dialog.stage === 'resume' && dialog.decision === 'pass'),
          hideReason: dialog.stage === 'resume' && dialog.decision === 'pass',
          minLength: dialog.stage === 'interview' ? 5 : 2,
          maxLength: 500,
          placeholder: dialog.stage === 'interview' ? '填写简短面评' : '填写简历驳回原因',
          showQsTop100: dialog.stage === 'interview' && dialog.decision === 'pass',
          confirmLabel: dialog.stage === 'resume' && dialog.decision === 'pass' ? '进入待面试' : '提交结果',
        } : null}
        onClose={() => setDialog(null)}
        onSubmit={submitReview}
      />
      <ReasonDialog
        key={accountDialog ? `mentor-account-${accountDialog.mentor.user_id}-${accountDialog.nextStatus}` : 'mentor-account-dialog'}
        config={accountDialog ? {
          title: accountDialog.title,
          description: `目标导师：${accountDialog.mentor.email} (${accountDialog.mentor.public_id})`,
        } : null}
        onClose={() => setAccountDialog(null)}
        onSubmit={updateMentorAccountStatus}
      />
    </section>
  );
}

function MentorDrawer({ userId, onClose }) {
  const [reload, setReload] = useState(0);
  const { loading, error, data } = useAsync(() => api(`/api/admin/mentors/${userId}/review`), [userId, reload]);
  const mentor = data?.mentor || {};
  const resumeUrl = parseUrlList(mentor.resumeUrls || mentor.mentor_resume_url)[0] || '';
  const reviewStatus = String(mentor.mentor_review_status || '');
  const resumeResult = reviewStatus === 'pending'
    ? '待审核'
    : reviewStatus === 'rejected'
      ? '已驳回'
      : '已通过';
  const interviewResult = reviewStatus === 'interview_pending'
    ? '待面试'
    : reviewStatus === 'approved'
      ? '已通过'
      : reviewStatus === 'interview_rejected'
        ? '未通过'
        : '-';
  const openResume = async () => {
    if (!resumeUrl) return;
    const token = getToken();
    if (!token) {
      window.alert('后台登录已失效');
      return;
    }
    window.open(buildAdminPreviewUrl(`/api/admin/mentors/${userId}/resume-preview`, token), '_blank');
  };
  return (
    <aside className="drawer wide-drawer">
      <button className="drawer-close" onClick={onClose}>×</button>
      <State loading={loading} error={error}>
        <h2>{mentor.public_id} · {mentor.email}</h2>
        <DetailGrid
          items={[
            ['状态', <Badge value={getMentorStatusValue(mentor)} />],
            ['姓名', mentor.display_name],
            ['学校', mentor.school],
            ['学历', mentor.degree],
            ['时区', mentor.timezone],
            ['评分', mentor.rating],
            ['QS100', mentor.mentor_qs_top100 ? '是' : '否'],
            ['简历', resumeUrl ? <button className="link-button" onClick={openResume}>打开简历</button> : '-'],
            ['简历审核结果', resumeResult],
            ['简历处理时间', formatDate(mentor.mentor_reviewed_at)],
            ['简历驳回原因', mentor.mentor_review_note],
            ['面试结论', interviewResult],
            ['面试处理时间', formatDate(mentor.mentor_interviewed_at)],
            ['面评', mentor.mentor_interview_note],
          ]}
        />
        <h3>课程方向</h3>
        <div className="chip-row">{(mentor.courses || []).map((item) => <span className="chip" key={item}>{item}</span>)}</div>
        <h3>授课语言</h3>
        <div className="chip-row">{(mentor.teachingLanguages || []).map((item) => <span className="chip" key={item}>{item}</span>)}</div>
        <h3>收到的学生评价</h3>
        <ReviewHistory
          reviews={data?.reviews || []}
          counterpartLabel="评价学生"
          onCommentDeleted={() => setReload((value) => value + 1)}
        />
      </State>
    </aside>
  );
}

function MentorPayrollPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [taxStatus, setTaxStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [updatingMentorId, setUpdatingMentorId] = useState(null);
  const [actionError, setActionError] = useState('');
  const { loading, error, data } = useAsync(() => api('/api/admin/mentor-payroll', { params: { month } }), [month, reload]);
  const payroll = useMemo(() => (data?.payroll || []).filter((item) => {
    const keyword = q.trim().toLowerCase();
    const matchesTaxStatus = !taxStatus || (taxStatus === 'yes' ? item.chinaTaxResident : !item.chinaTaxResident);
    return (!keyword || [item.mentorId, item.mentorName, item.email].some((value) => String(value || '').toLowerCase().includes(keyword))) && (!status || item.status === status) && matchesTaxStatus;
  }), [data?.payroll, q, status, taxStatus]);
  const summary = data?.summary || {};
  const statusOptions = [
    { value: '', label: '全部' },
    { value: 'pending', label: '待发放' },
    { value: 'paid', label: '已发放' },
  ];
  const taxStatusOptions = [
    { value: '', label: '全部' },
    { value: 'yes', label: '是' },
    { value: 'no', label: '否' },
  ];
  const togglePaymentStatus = async (item) => {
    if (!item?.mentorUserId || updatingMentorId) return;
    setUpdatingMentorId(item.mentorUserId);
    setActionError('');
    try {
      await api(`/api/admin/mentor-payroll/${item.mentorUserId}/status`, {
        method: 'PATCH',
        body: { month, status: item.status === 'paid' ? 'pending' : 'paid' },
      });
      setReload((value) => value + 1);
    } catch (requestError) {
      setActionError(requestError.message || '发放状态更新失败');
    } finally {
      setUpdatingMentorId(null);
    }
  };
  return (
    <section className="payroll-page">
      <PageTitle title="导师薪资" />
      <div className="payroll-summary" aria-label="当月薪资汇总"><article><span>税前收入</span><strong>¥{formatPayrollCurrency(summary.grossIncomeCny)}</strong></article><article><span>预计预扣个税</span><strong>¥{formatPayrollCurrency(summary.withheldTaxCny)}</strong></article><article><span>实际应发</span><strong>¥{formatPayrollCurrency(summary.netIncomeCny)}</strong></article><article><span>发放进度</span><strong>{summary.paidCount || 0} / {(summary.paidCount || 0) + (summary.pendingCount || 0)}</strong></article></div>
      <Toolbar><input className="payroll-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="薪资月份" /><SearchBox value={q} onChange={setQ} placeholder="搜索导师姓名、邮箱、MentorID" /></Toolbar>
      {actionError ? <div className="page-action-error" role="alert">{actionError}</div> : null}
      <State loading={loading} error={error}>
        <DataTable className="payroll-table" columns={['导师', '结算课时', '税前收入', <StatusFilterHeader value={taxStatus} options={taxStatusOptions} onChange={setTaxStatus} defaultLabel="中国纳税" ariaLabel="中国纳税状态筛选" />, '预扣个税', '实际到手', <StatusFilterHeader value={status} options={statusOptions} onChange={setStatus} defaultLabel="发放状态" ariaLabel="薪资发放状态筛选" />]} rows={payroll.map((item) => [
          <div className="payroll-mentor"><strong>{item.mentorName || item.mentorId}</strong><span>{item.mentorId} · {item.email}</span></div>, `${item.settledHours}h`, <strong>¥{formatPayrollCurrency(item.grossIncomeCny)}</strong>, item.chinaTaxResident ? <span className="tax-resident yes">是</span> : <span className="tax-resident no">否</span>, item.chinaTaxResident ? `¥${formatPayrollCurrency(item.withheldTaxCny)}` : '-', <strong className="payroll-net">¥{formatPayrollCurrency(item.netIncomeCny)}</strong>, <button className="payroll-status-toggle" type="button" onClick={() => togglePaymentStatus(item)} disabled={updatingMentorId === item.mentorUserId} title={item.status === 'paid' ? '点击改为待发放' : '点击改为已发放'}><span className={`badge badge-${item.status === 'paid' ? 'paid' : 'pending'}`}>{updatingMentorId === item.mentorUserId ? '更新中…' : item.status === 'paid' ? '已发放' : '待发放'}</span></button>,
        ])} />
      </State>
      <div className="payroll-tax-note"><strong>税额口径</strong>中国纳税导师按居民个人劳务报酬预扣预缴估算：单月收入不超过 4,000 元减除 800 元，超过 4,000 元减除 20%；预扣率 20% / 30% / 40%，速算扣除数 0 / 2,000 / 7,000 元。年度汇算结果可能不同。</div>
    </section>
  );
}

function OrdersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [sort, setSort] = useState({ field: 'id', direction: 'desc' });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmingOrderId, setConfirmingOrderId] = useState(null);
  const [completingRefundOrderId, setCompletingRefundOrderId] = useState(null);
  const [actionError, setActionError] = useState('');
  const { loading, error, data } = useAsync(
    () => api('/api/admin/orders', { params: { q, status, provider, limit: 50 } }),
    [q, status, provider, refreshNonce]
  );

  const orders = useMemo(() => {
    const sorted = [...(data?.orders || [])];
    sorted.sort((a, b) => {
      let comparison = 0;

      if (sort.field === 'created_at') {
        comparison = (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0);
      } else if (sort.field === 'student_public_id') {
        comparison = String(a.student_public_id || '').localeCompare(
          String(b.student_public_id || ''),
          'zh-CN',
          { numeric: true, sensitivity: 'base' }
        );
      } else {
        comparison = asNumber(a[sort.field]) - asNumber(b[sort.field]);
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [data?.orders, sort]);

  const updateSort = (field, direction) => {
    setSort({ field, direction });
  };

  const confirmManualPayment = async (order) => {
    if (!order?.id || confirmingOrderId) return;
    setConfirmingOrderId(order.id);
    setActionError('');
    try {
      await api(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'POST' });
      setRefreshNonce((value) => value + 1);
    } catch (requestError) {
      setActionError(requestError?.message || '确认收款失败，请稍后重试');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const completeManualRefund = async (order) => {
    if (!order?.id || completingRefundOrderId) return;
    setCompletingRefundOrderId(order.id);
    setActionError('');
    try {
      await api(`/api/admin/orders/${order.id}/complete-manual-refund`, { method: 'POST' });
      setRefreshNonce((value) => value + 1);
    } catch (requestError) {
      setActionError(requestError?.message || '确认人工退款失败，请稍后重试');
    } finally {
      setCompletingRefundOrderId(null);
    }
  };

  const statusOptions = [
    { value: '', label: '全部' },
    { value: 'pending_receipt', label: '待收款' },
    { value: 'pending', label: '待支付' },
    { value: 'paid', label: '已支付' },
    { value: 'refund_processing', label: '退款处理中' },
    { value: 'refunded', label: '已退款' },
    { value: 'failed', label: '失败/取消' },
  ];

  const providerOptions = [
    { value: '', label: '全部 Provider' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'wechat', label: '微信' },
    { value: 'alipay', label: '支付宝' },
  ];

  const orderColumns = [
    <SortHeader label={'\u8ba2\u5355ID'} field="id" sort={sort} onSort={updateSort} />,
    <SortHeader label="StudentID" field="student_public_id" sort={sort} onSort={updateSort} />,
    '\u90ae\u7bb1',
    <StatusFilterHeader
      value={provider}
      options={providerOptions}
      onChange={setProvider}
      defaultLabel="Provider"
      ariaLabel="订单 Provider 筛选"
    />,
    <StatusFilterHeader
      value={status}
      options={statusOptions}
      onChange={setStatus}
      ariaLabel="订单状态筛选"
    />,
    <SortHeader label={'\u8bfe\u65f6'} field="topup_hours" sort={sort} onSort={updateSort} />,
    '可退课时',
    <SortHeader label={'\u91d1\u989d'} field="amount_cny" sort={sort} onSort={updateSort} />,
    '退款',
    <SortHeader label={'\u521b\u5efa\u65f6\u95f4'} field="created_at" sort={sort} onSort={updateSort} />,
  ];

  return (
    <section>
      <PageTitle title="订单管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索邮箱、订单号、StudentID" />
      </Toolbar>
      {actionError ? <div className="page-action-error" role="alert">{actionError}</div> : null}
      <State loading={loading} error={error}>
        <DataTable
          className="orders-table"
          columns={orderColumns}
          rows={orders.map((order) => [
            order.id,
            order.student_public_id || '-',
            order.email || '-',
            <ProviderBadge value={order.provider} />,
            <OrderStatusBadge
              order={order}
              confirming={confirmingOrderId === order.id}
              onConfirm={confirmManualPayment}
              completingRefund={completingRefundOrderId === order.id}
              onCompleteRefund={completeManualRefund}
            />,
            order.topup_hours,
            formatHourValue(order.remaining_hours),
            formatIntegerAmount(order.amount_cny),
            Number(order.refunded_amount_cny) > 0
              ? formatIntegerAmount(order.refunded_amount_cny)
              : Number(order.pending_refund_amount_cny) > 0
                ? formatIntegerAmount(order.pending_refund_amount_cny)
                : '-',
            formatDate(order.created_at),
          ])}
        />
      </State>
    </section>
  );
}

const getLessonHoursSummary = (row) => {
  const parts = [
    `预约 ${formatHours(row.duration_hours)}`,
    row.proposed_hours ? `提交 ${formatHours(row.proposed_hours)}` : '',
    row.disputed_hours ? `争议 ${formatHours(row.disputed_hours)}` : '',
    row.final_hours ? `最终 ${formatHours(row.final_hours)}` : '',
  ].filter(Boolean);
  return (
    <div className="lesson-hours-summary">
      {parts.map((part) => <span key={part}>{part}</span>)}
    </div>
  );
};

function ReplayDialog({ course, onClose }) {
  const courseId = course?.id;
  const { loading, error, data } = useAsync(
    () => api(`/api/admin/classrooms/${courseId}/replay-files`),
    [courseId]
  );
  const files = data?.files || [];
  if (!courseId) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="replay-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button>
        <h2 id="replay-title">课堂回放 #{courseId}</h2>
        <State loading={loading} error={error}>
          <div className="replay-list">
            {files.length ? files.map((file) => (
              <div className="replay-item" key={file.fileId || file.fileName}>
                <FontAwesomeIcon icon={faVideo} />
                <div>
                  <strong>{file.fileName || '课堂回放'}</strong>
                  <span>{formatDate(file.lastModified)} · {formatFileSize(file.sizeBytes)}</span>
                </div>
                <button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')} disabled={!file.url}>
                  <FontAwesomeIcon icon={faPlay} /> 播放
                </button>
              </div>
            )) : <div className="empty">暂无 MP4 回放</div>}
          </div>
        </State>
      </div>
    </div>
  );
}

function PlatformReviewStatus({ classroom, onOpen }) {
  if (classroom.lesson_hours_status !== 'platform_review') {
    return <LessonHoursStatusBadge value={classroom.lesson_hours_status} />;
  }
  return (
    <button
      className="platform-review-status"
      type="button"
      onClick={() => onOpen(classroom)}
      title="处理平台介入"
    >
      <LessonHoursStatusBadge value="platform_review" />
    </button>
  );
}

function LessonHoursReviewDialog({ course, onClose, onSettled }) {
  const courseId = course?.id;
  const detailState = useAsync(() => api(`/api/admin/classrooms/${courseId}`), [courseId]);
  const replayState = useAsync(() => api(`/api/admin/classrooms/${courseId}/replay-files`), [courseId]);
  const [decision, setDecision] = useState('mentor_proposed');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const classroom = detailState.data?.classroom || course || {};
  const lesson = classroom.latestLessonHours || course || {};
  const replayFiles = replayState.data?.files || [];
  const proposedHours = lesson.proposed_hours || course?.proposed_hours;
  const disputedHours = lesson.disputed_hours || course?.disputed_hours;

  if (!courseId) return null;

  const submitDecision = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      await api(`/api/admin/classrooms/${courseId}/lesson-hours/final-decision`, {
        method: 'PATCH',
        body: { decision, reason },
      });
      onSettled();
      onClose();
    } catch (error) {
      setSubmitError(error.message || '处理失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal wide-modal lesson-review-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-review-title" onSubmit={submitDecision}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button>
        <h2 id="lesson-review-title">平台介入处理 #{courseId}</h2>
        <State loading={detailState.loading} error={detailState.error}>
          <div className="lesson-review-content">
            <section className="review-evidence-grid" aria-label="课时争议信息">
              <div>
                <span>预约时长</span>
                <strong>{formatHours(classroom.duration_hours || course?.duration_hours)}</strong>
              </div>
              <div>
                <span>导师提交</span>
                <strong>{formatHours(proposedHours)}</strong>
              </div>
              <div>
                <span>学生争议</span>
                <strong>{formatHours(disputedHours)}</strong>
              </div>
            </section>

            <section className="review-choice-group" aria-label="最终裁决">
              <label className={decision === 'mentor_proposed' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="lesson-hours-decision"
                  value="mentor_proposed"
                  checked={decision === 'mentor_proposed'}
                  onChange={(event) => setDecision(event.target.value)}
                />
                <span>
                  <strong>采信导师提交</strong>
                  <em>{formatHours(proposedHours)}</em>
                </span>
              </label>
              <label className={decision === 'student_disputed' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="lesson-hours-decision"
                  value="student_disputed"
                  checked={decision === 'student_disputed'}
                  onChange={(event) => setDecision(event.target.value)}
                  disabled={!asNumber(disputedHours)}
                />
                <span>
                  <strong>采信学生争议</strong>
                  <em>{formatHours(disputedHours)}</em>
                </span>
              </label>
            </section>

            <section>
              <h3>课堂回放证据</h3>
              <State loading={replayState.loading} error={replayState.error}>
                <div className="replay-list embedded">
                  {replayFiles.length ? replayFiles.map((file) => (
                    <div className="replay-item" key={file.fileId || file.fileName}>
                      <FontAwesomeIcon icon={faVideo} />
                      <div>
                        <strong>{file.fileName || '课堂回放'}</strong>
                        <span>{formatDate(file.lastModified)} · {formatFileSize(file.sizeBytes)}</span>
                      </div>
                      <button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')} disabled={!file.url}>
                        <FontAwesomeIcon icon={faPlay} /> 播放
                      </button>
                    </div>
                  )) : <div className="empty">暂无 MP4 回放</div>}
                </div>
              </State>
            </section>

            <section>
              <h3>录制记录</h3>
              <DataTable
                compact
                columns={['ID', '状态', '开始', '停止']}
                rows={(classroom.recordings || []).map((recording) => [
                  recording.id,
                  <Badge value={recording.status} />,
                  formatDate(recording.startedAt || recording.started_at),
                  formatDate(recording.stoppedAt || recording.stopped_at),
                ])}
              />
            </section>

            <label className="review-reason">
              <span>裁决依据</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="记录参考的回放片段、双方说法和最终判断" required />
            </label>
            {submitError ? <div className="error">{submitError}</div> : null}
          </div>
        </State>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>取消</button>
          <button type="submit" disabled={submitting || detailState.loading}>{submitting ? '处理中...' : '确认裁决'}</button>
        </div>
      </form>
    </div>
  );
}

function ClassroomsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [lessonHoursStatus, setLessonHoursStatus] = useState('');
  const [replayStatus, setReplayStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detail, setDetail] = useState(null);
  const [replayCourse, setReplayCourse] = useState(null);
  const [lessonReviewCourse, setLessonReviewCourse] = useState(null);
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState({ field: 'starts_at', direction: 'desc' });
  const { loading, error, data } = useAsync(
    () => api('/api/admin/classrooms', {
      params: { q, status, lessonHoursStatus, replayStatus, startDate, endDate, limit: 80 },
    }),
    [q, status, lessonHoursStatus, replayStatus, startDate, endDate, reload]
  );

  const classrooms = useMemo(() => {
    const sorted = [...(data?.classrooms || [])];
    sorted.sort((a, b) => {
      let comparison = 0;

      if (sort.field === 'starts_at') {
        comparison = (new Date(a.startsAt || a.starts_at).getTime() || 0) - (new Date(b.startsAt || b.starts_at).getTime() || 0);
      } else {
        comparison = asNumber(a[sort.field]) - asNumber(b[sort.field]);
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [data?.classrooms, sort]);

  const updateSort = (field, direction) => {
    setSort({ field, direction });
  };

  const resolveClassroomOrigin = () => {
    const configuredOrigin = String(process.env.REACT_APP_CLASSROOM_APP_ORIGIN || '').trim();
    if (configuredOrigin) return configuredOrigin.replace(/\/+$/, '');

    try {
      const currentUrl = new URL(window.location.href);
      if ((currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1') && currentUrl.port === '3001') {
        currentUrl.port = '3000';
        currentUrl.pathname = '';
        currentUrl.search = '';
        currentUrl.hash = '';
        return currentUrl.origin;
      }
    } catch {}

    return window.location.origin;
  };

  const openWatch = async (courseId) => {
    const placeholder = window.open('', '_blank');
    try {
      const authData = await api(`/api/admin/classrooms/${encodeURIComponent(courseId)}/observer-auth`);
      const observerToken = String(authData?.observerToken || '').trim();
      if (!observerToken) throw new Error('旁听鉴权失败');

      const classroomOrigin = resolveClassroomOrigin();
      const classroomUrl = new URL(`/classroom/${encodeURIComponent(courseId)}`, classroomOrigin);
      classroomUrl.searchParams.set('observerToken', observerToken);
      if (placeholder) {
        placeholder.opener = null;
        placeholder.location.href = classroomUrl.toString();
      } else {
        window.open(classroomUrl.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (placeholder) placeholder.close();
      alert(error?.message || '进入课堂失败');
    }
  };

  const statusOptions = [
    { value: '', label: '全部' },
    { value: 'scheduled', label: '未开始' },
    { value: 'completed', label: '已结束' },
    { value: 'cancelled', label: '已取消' },
  ];

  const lessonHoursStatusOptions = [
    { value: '', label: '全部课时确认' },
    { value: 'none', label: '无记录' },
    { value: 'pending', label: '待学生确认' },
    { value: 'disputed', label: '待导师处理' },
    { value: 'confirmed', label: '已确认' },
    { value: 'platform_review', label: '平台介入' },
  ];

  const replayStatusOptions = [
    { value: '', label: '全部回放状态' },
    { value: 'none', label: '无录制' },
    { value: 'running', label: '录制中' },
    { value: 'ready', label: '已生成' },
    { value: 'failed', label: '录制失败' },
  ];

  const classroomColumns = [
    <SortHeader label="课堂ID" field="id" sort={sort} onSort={updateSort} />,
    '课程方向 / 类型',
    <DateRangeHeader
      label="上课时间"
      field="starts_at"
      sort={sort}
      onSort={updateSort}
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
    />,
    <SortHeader label="时长" field="duration_hours" sort={sort} onSort={updateSort} />,
    <StatusFilterHeader
      value={status}
      options={statusOptions}
      onChange={setStatus}
      defaultLabel="课堂状态"
      ariaLabel="课堂状态筛选"
    />,
    '学生',
    '导师',
    <StatusFilterHeader
      value={lessonHoursStatus}
      options={lessonHoursStatusOptions}
      onChange={setLessonHoursStatus}
      defaultLabel="课时确认"
      ariaLabel="课时确认筛选"
    />,
    '课时数',
    <StatusFilterHeader
      value={replayStatus}
      options={replayStatusOptions}
      onChange={setReplayStatus}
      defaultLabel="回放"
      ariaLabel="回放状态筛选"
    />,
    '评价',
    '操作',
  ];

  return (
    <section>
      <PageTitle title="课堂管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索课堂ID、邮箱、StudentID、MentorID、导师姓名" />
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={classroomColumns}
          className="classrooms-table"
          rows={classrooms.map((item) => [
            item.id,
            formatCourseDirectionType(item.course_direction, item.course_type),
            formatDate(item.startsAt || item.starts_at),
            formatHourValue(item.duration_hours),
            <Badge value={item.effectiveStatus || item.status} />,
            <strong>{item.student_public_id || '-'}</strong>,
            <div className="stacked-cell"><strong>{item.mentor_public_id || '-'}</strong><span>{item.mentor_display_name || item.mentor_email || '-'}</span></div>,
            <PlatformReviewStatus classroom={item} onOpen={setLessonReviewCourse} />,
            getLessonHoursSummary(item),
            <Badge value={item.replayStatus} />,
            item.reviewStatus === 'reviewed' ? formatReviewScore(item.review_overall_score) : '-',
            <div className="row-actions">
              <button className="ghost" type="button" title="进入课堂" onClick={() => openWatch(item.id)}>
                <FontAwesomeIcon icon={faEye} />
              </button>
              <button className="ghost" type="button" title="查看回放" onClick={() => setReplayCourse(item)}>
                <FontAwesomeIcon icon={faVideo} />
              </button>
              <button className="detail-action" type="button" onClick={() => setDetail(item.id)}>详情</button>
            </div>,
          ])}
        />
      </State>
      {detail ? <ClassroomDrawer courseId={detail} onClose={() => setDetail(null)} /> : null}
      {replayCourse ? <ReplayDialog course={replayCourse} onClose={() => setReplayCourse(null)} /> : null}
      {lessonReviewCourse ? (
        <LessonHoursReviewDialog
          course={lessonReviewCourse}
          onClose={() => setLessonReviewCourse(null)}
          onSettled={() => setReload((value) => value + 1)}
        />
      ) : null}
    </section>
  );
}

function ClassroomDrawer({ courseId, onClose }) {
  const navigate = useNavigate();
  const { loading, error, data } = useAsync(() => api(`/api/admin/classrooms/${courseId}`), [courseId]);
  const replayState = useAsync(() => api(`/api/admin/classrooms/${courseId}/replay-files`), [courseId]);
  const chatState = useAsync(() => api(`/api/admin/classrooms/${courseId}/chat`), [courseId]);
  const classroom = data?.classroom || {};
  const lesson = classroom.latestLessonHours || {};
  const recordings = classroom.recordings || [];
  const replayFiles = replayState.data?.files || [];
  const chatMessages = chatState.data?.messages || [];
  return (
    <aside className="drawer wide-drawer classroom-detail-drawer">
      <button className="drawer-close" onClick={onClose}>×</button>
      <State loading={loading} error={error}>
        <h2>课堂 #{classroom.id}</h2>
        <DetailGrid
          items={[
            ['课程方向', formatCourseDirection(classroom.course_direction)],
            ['课程类型', formatCourseType(classroom.course_type)],
            ['上课时间', formatDate(classroom.startsAt || classroom.starts_at)],
            ['预约时长', formatHours(classroom.duration_hours)],
            ['原始状态', <Badge value={classroom.status} />],
            ['有效状态', <Badge value={classroom.effectiveStatus} />],
            ['创建时间', formatDate(classroom.createdAt || classroom.created_at)],
            ['更新时间', formatDate(classroom.updatedAt || classroom.updated_at)],
          ]}
        />
        <div className="classroom-party-columns">
          <section className="classroom-party-column">
            <h4>学生</h4>
            <DetailGrid
              items={[
                ['用户ID', classroom.student_user_id],
                ['StudentID', classroom.student_public_id],
                ['邮箱', classroom.student_email],
              ]}
            />
          </section>
          <section className="classroom-party-column">
            <h4>导师</h4>
            <DetailGrid
              items={[
                ['用户ID', classroom.mentor_user_id],
                ['MentorID', classroom.mentor_public_id],
                ['姓名', classroom.mentor_display_name || classroom.mentor_username],
                ['邮箱', classroom.mentor_email],
              ]}
            />
          </section>
        </div>
        {classroom.course_dispute_id ? (
          <><h3>课程异议</h3><button type="button" onClick={() => navigate(`/course-disputes?q=${encodeURIComponent(classroom.course_dispute_internal_id || classroom.course_dispute_id)}`)}><Badge value={classroom.course_dispute_status} /> 查看 #{classroom.course_dispute_internal_id || classroom.course_dispute_id}</button></>
        ) : null}
        <h3>最新课时确认</h3>
        <DetailGrid
          items={[
            ['状态', <Badge value={lesson.status || 'none'} />],
            ['提交课时', formatHours(lesson.proposed_hours)],
            ['争议课时', formatHours(lesson.disputed_hours)],
            ['最终课时', formatHours(lesson.final_hours)],
            ['响应人', lesson.responded_by_email || lesson.responded_by_user_id],
            ['响应时间', formatDate(lesson.responded_at)],
            ['结算时间', formatDate(lesson.settled_at)],
          ]}
        />
        <h3>录制记录</h3>
        <DataTable
          compact
          columns={['ID', '状态', '开始', '停止', '错误']}
          rows={recordings.map((recording) => [
            recording.id,
            <Badge value={recording.status} />,
            formatDate(recording.startedAt || recording.started_at),
            formatDate(recording.stoppedAt || recording.stopped_at),
            recording.error_message || '-',
          ])}
        />
        <h3>回放文件</h3>
        <State loading={replayState.loading} error={replayState.error}>
          <div className="replay-list embedded">
            {replayFiles.length ? replayFiles.map((file) => (
              <div className="replay-item" key={file.fileId || file.fileName}>
                <FontAwesomeIcon icon={faVideo} />
                <div><strong>{file.fileName}</strong><span>{formatDate(file.lastModified)} · {formatFileSize(file.sizeBytes)}</span></div>
                <button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}>播放</button>
              </div>
            )) : <div className="empty">暂无 MP4 回放</div>}
          </div>
        </State>
        <h3>评价</h3>
        {classroom.review ? (
          <DetailGrid
            items={[
              ['综合评分', classroom.review.overallScore],
              ['清晰讲解', classroom.review.scores?.clarity],
              ['沟通顺畅', classroom.review.scores?.communication],
              ['准备充分', classroom.review.scores?.preparation],
              ['专业能力', classroom.review.scores?.expertise],
              ['准时程度', classroom.review.scores?.punctuality],
              ['文字评价', classroom.review.comment],
              ['提交时间', formatDate(classroom.review.createdAt)],
              ['更新时间', formatDate(classroom.review.updatedAt)],
            ]}
          />
        ) : <div className="state">未评价</div>}
        <h3>聊天与对话记录{chatState.loading ? '' : `（${chatMessages.length}）`}</h3>
        <State loading={chatState.loading} error={chatState.error}>
          <div className="classroom-chat-history">
            {chatMessages.length ? chatMessages.map((message) => (
              <article className="classroom-chat-history-item" key={message.id}>
                <div className="classroom-chat-history-meta">
                  <div>
                    <strong>{message.senderLabel}</strong>
                    <span>{message.senderRole === 'student' ? '学生' : (message.senderRole === 'mentor' ? '导师' : '课堂成员')}</span>
                  </div>
                  <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                </div>
                {message.messageType === 'file' ? (
                  <div className="classroom-chat-history-file">
                    <strong>{message.file?.fileName || '文件'}</strong>
                    <span>
                      {formatFileSize(message.file?.sizeBytes)}
                      {message.file?.cleanupStatus === 'deleted' ? ' · 文件已清理，仅保留记录' : ''}
                    </span>
                  </div>
                ) : <p>{message.textContent}</p>}
              </article>
            )) : <div className="empty">暂无聊天与对话记录</div>}
          </div>
        </State>
      </State>
    </aside>
  );
}

function ClassroomWatchPage() {
  const { courseId } = useParams();
  const videoRefs = React.useRef({});
  const playersRef = React.useRef([]);
  const [auth, setAuth] = useState(null);
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      api(`/api/admin/classrooms/${courseId}/observer-auth`),
      api(`/api/admin/classrooms/${courseId}/chat`),
    ])
      .then(([authData, chatData]) => {
        if (!alive) return;
        setAuth(authData);
        setChat(chatData?.messages || []);
      })
      .catch((err) => {
        if (alive) setError(err.message || '加载课堂失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId]);

  useEffect(() => {
    let disposed = false;
    playersRef.current.forEach((player) => {
      try { player.stopPlay?.(); } catch {}
      try { player.destroy?.(); } catch {}
    });
    playersRef.current = [];
    setStreamStatus({});

    if (!auth?.streams?.length) return undefined;

    loadAliyunLiveSdk()
      .then(async (sdk) => {
        for (const stream of auth.streams) {
          if (disposed) return;
          const video = videoRefs.current[stream.role];
          if (!video || !stream.playUrl) continue;
          const player = new sdk.AlivcLivePlayer();
          playersRef.current.push(player);
          setStreamStatus((prev) => ({ ...prev, [stream.role]: '连接中' }));
          try {
            await player.startPlay(stream.playUrl, video);
            if (!disposed) setStreamStatus((prev) => ({ ...prev, [stream.role]: '播放中' }));
          } catch (err) {
            if (!disposed) setStreamStatus((prev) => ({ ...prev, [stream.role]: err?.message || '暂无画面' }));
          }
        }
      })
      .catch((err) => {
        if (!disposed) setError(err.message || '直播 SDK 加载失败');
      });

    return () => {
      disposed = true;
      playersRef.current.forEach((player) => {
        try { player.stopPlay?.(); } catch {}
        try { player.destroy?.(); } catch {}
      });
      playersRef.current = [];
    };
  }, [auth]);

  return (
    <section>
      <PageTitle title={`课堂旁观 #${courseId}`} subtitle="只读模式，不会触发学生或导师操作" />
      <State loading={loading} error={error}>
        <div className="watch-layout">
          <div className="watch-grid">
            {(auth?.streams || []).map((stream) => (
              <article className="watch-panel" key={stream.role}>
                <div className="watch-panel-head">
                  <strong>{stream.role === 'student' ? '学生' : '导师'} · {stream.label}</strong>
                  <span>{streamStatus[stream.role] || '等待连接'}</span>
                </div>
                <video
                  ref={(element) => { videoRefs.current[stream.role] = element; }}
                  autoPlay
                  playsInline
                  muted
                />
              </article>
            ))}
          </div>
          <aside className="watch-chat">
            <h2>课堂聊天</h2>
            <div className="watch-chat-list">
              {chat.length ? chat.map((message) => (
                <div className="watch-chat-message" key={message.id}>
                  <div><strong>{message.senderLabel}</strong><span>{formatDate(message.createdAt)}</span></div>
                  {message.messageType === 'file' ? (
                    <p>{message.file?.fileName || '文件'} · {formatFileSize(message.file?.sizeBytes)}</p>
                  ) : <p>{message.textContent}</p>}
                </div>
              )) : <div className="empty">暂无聊天记录</div>}
            </div>
          </aside>
        </div>
      </State>
    </section>
  );
}

const disputeReasonLabels = {
  lesson_not_delivered: '未按约定授课', content_mismatch: '课程内容不佳', mentor_conduct: '导师行为', other: '其他问题',
};
const disputeResolutionLabels = {
  feedback_only: '仅反馈问题', lesson_credit: '补偿课时', refund_review: '评估退款',
};
const disputePreferredOutcomes = { feedback_only: 'feedback_only', lesson_credit: 'lesson_credit', refund_review: 'refund' };
const disputeStatusLabels = { submitted: '待受理', resolved: '已解决', rejected: '不予支持' };
const disputeReasonOptions = [{ value: '', label: '全部' }, ...Object.entries(disputeReasonLabels).map(([value, label]) => ({ value, label }))];
const disputeResolutionOptions = [{ value: '', label: '全部' }, ...Object.entries(disputeResolutionLabels).map(([value, label]) => ({ value, label }))];
const disputeStatusOptions = [{ value: '', label: '全部状态' }, ...Object.entries(disputeStatusLabels).map(([value, label]) => ({ value, label }))];
const DisputeStatusBadge = ({ value }) => <span className={`badge badge-${value || 'none'}`}>{disputeStatusLabels[value] || value || '-'}</span>;
const disputeReasonTones = { lesson_not_delivered: 'red', content_mismatch: 'amber', mentor_conduct: 'red', other: 'neutral' };
const disputeResolutionTones = { feedback_only: 'neutral', lesson_credit: 'green', refund_review: 'amber' };
const DisputeTag = ({ value, labels, tones }) => (
  <span className={`badge badge-dispute-${tones[value] || 'neutral'}`}>{labels[value] || value || '-'}</span>
);
const DisputeReasonTag = ({ value }) => <DisputeTag value={value} labels={disputeReasonLabels} tones={disputeReasonTones} />;
const DisputeResolutionTag = ({ value }) => <DisputeTag value={value} labels={disputeResolutionLabels} tones={disputeResolutionTones} />;
const formatDisputeNumber = (dispute) => dispute?.internalId ? `#${dispute.internalId}` : String(dispute?.id || '-');

function CourseDisputesPage() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [reason, setReason] = useState(searchParams.get('reason') || '');
  const [resolution, setResolution] = useState(searchParams.get('resolution') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [selectedId, setSelectedId] = useState('');
  const [reload, setReload] = useState(0);
  const state = useAsync(() => api('/api/admin/course-disputes', { params: { q, reason, resolution, status, limit: 100 } }), [q, reason, resolution, status, reload]);
  return (
    <section>
      <PageTitle title="异议管理" subtitle="受理课程投诉并执行反馈、课时补偿或退款" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索异议编号、课堂ID、StudentID、MentorID" />
      </Toolbar>
      <State loading={state.loading} error={state.error}>
        <DataTable columns={[
          '异议编号',
          '提交时间',
          '课堂',
          '学生',
          '导师',
          <StatusFilterHeader value={reason} options={disputeReasonOptions} onChange={setReason} defaultLabel="问题类型" ariaLabel="问题类型筛选" />,
          <StatusFilterHeader value={resolution} options={disputeResolutionOptions} onChange={setResolution} defaultLabel="学生期望" ariaLabel="学生期望筛选" />,
          <StatusFilterHeader value={status} options={disputeStatusOptions} onChange={setStatus} defaultLabel="状态" ariaLabel="异议状态筛选" />,
          '操作',
        ]} rows={(state.data?.disputes || []).map((item) => [
          <strong title={item.id}>{formatDisputeNumber(item)}</strong>, formatDate(item.submittedAt), `#${item.course_session_id}`, item.student_public_id || '-', item.mentor_public_id || '-', <DisputeReasonTag value={item.reason_code} />, <DisputeResolutionTag value={item.preferred_resolution} />, <DisputeStatusBadge value={item.status} />, <button className="detail-action" type="button" onClick={() => setSelectedId(item.id)}>处理</button>,
        ])} />
      </State>
      {selectedId ? <CourseDisputeDrawer disputeId={selectedId} onClose={() => setSelectedId('')} onChanged={() => setReload((v) => v + 1)} /> : null}
    </section>
  );
}

function CourseDisputeDrawer({ disputeId, onClose, onChanged }) {
  const [reload, setReload] = useState(0);
  const state = useAsync(() => api(`/api/admin/course-disputes/${encodeURIComponent(disputeId)}`), [disputeId, reload]);
  const replayState = useAsync(() => state.data?.dispute?.course_session_id ? api(`/api/admin/classrooms/${state.data.dispute.course_session_id}/replay-files`) : Promise.resolve({ files: [] }), [state.data?.dispute?.course_session_id]);
  const chatState = useAsync(() => state.data?.dispute?.course_session_id ? api(`/api/admin/classrooms/${state.data.dispute.course_session_id}/chat`) : Promise.resolve({ messages: [] }), [state.data?.dispute?.course_session_id]);
  const [hours, setHours] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const dispute = state.data?.dispute || {};
  const preferredOutcome = disputePreferredOutcomes[dispute.preferred_resolution] || 'feedback_only';
  const hasPendingRefund = dispute.status === 'submitted' && dispute.outcome_code === 'refund';
  const refresh = () => { setReload((v) => v + 1); onChanged(); };
  const run = async (fn) => { setBusy(true); setActionError(''); try { await fn(); refresh(); } catch (e) { setActionError(e.message || '操作失败'); } finally { setBusy(false); } };
  const getQuote = () => run(async () => { const data = await api(`/api/admin/course-disputes/${disputeId}/refund-quote`, { method: 'POST', body: { hours: Number(hours) } }); setQuote(data.quote); });
  const resolve = (outcome) => run(() => api(`/api/admin/course-disputes/${disputeId}/resolve`, { method: 'POST', body: { version: dispute.version, outcome, hours: ['lesson_credit', 'refund'].includes(outcome) ? Number(hours) : undefined, resultMessage } }));
  const refreshRefunds = () => run(() => api(`/api/admin/course-disputes/${disputeId}/refresh-refunds`, { method: 'POST' }));
  return (
    <aside className="drawer wide-drawer dispute-drawer">
      <button className="drawer-close" type="button" onClick={onClose}>×</button>
      <State loading={state.loading} error={state.error}>
        <h2>异议 {formatDisputeNumber(dispute)}</h2>
        <DetailGrid items={[[ '状态', <DisputeStatusBadge value={dispute.status} /> ], ['课堂', `#${dispute.course_session_id}`], ['StudentID', dispute.student_public_id], ['MentorID', dispute.mentor_public_id], ['课程', `${formatCourseDirection(dispute.course_direction)} / ${formatCourseType(dispute.course_type)}`], ['上课时间', formatDate(dispute.startsAt)], ['实际扣除', formatHours(dispute.final_hours || dispute.duration_hours)]]} />
        <h3>学生提交</h3><DetailGrid items={[[ '问题类型', <DisputeReasonTag value={dispute.reason_code} />], ['期望方案', <DisputeResolutionTag value={dispute.preferred_resolution} />], ['情况说明', dispute.description_text]]} />
        <h3>课堂回放</h3><State loading={replayState.loading} error={replayState.error}><div className="replay-list embedded">{(replayState.data?.files || []).map((file) => <div className="replay-item" key={file.fileId || file.fileName}><strong>{file.fileName}</strong><button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}>播放</button></div>)}{!replayState.data?.files?.length ? <div className="empty">暂无回放</div> : null}</div></State>
        <h3>聊天记录</h3><State loading={chatState.loading} error={chatState.error}><div className="classroom-chat-history">{(chatState.data?.messages || []).map((message) => <article className="classroom-chat-history-item" key={message.id}><strong>{message.senderLabel}</strong><time>{formatDate(message.createdAt)}</time><p>{message.textContent || message.file?.fileName || '-'}</p></article>)}{!chatState.data?.messages?.length ? <div className="empty">暂无聊天记录</div> : null}</div></State>
        {hasPendingRefund ? <button type="button" onClick={refreshRefunds} disabled={busy}>刷新 / 重试退款</button> : null}
        {!['resolved', 'rejected'].includes(dispute.status) ? <>
          {!hasPendingRefund ? <><h3>最终裁决</h3><div className="dispute-resolution-form">
            <div className={`dispute-resolution-expectation ${['lesson_credit', 'refund'].includes(preferredOutcome) ? '' : 'full-width'}`}><span>学生期望</span><DisputeResolutionTag value={dispute.preferred_resolution} /></div>
            {['lesson_credit', 'refund'].includes(preferredOutcome) ? <input className="dispute-resolution-hours" type="number" min="0.25" step="0.25" value={hours} onChange={(e) => { setHours(e.target.value); setQuote(null); }} placeholder="处理课时" /> : null}
            {preferredOutcome === 'refund' ? <button className="ghost" type="button" onClick={getQuote} disabled={busy || !hours}>计算退款</button> : null}
            <textarea value={resultMessage} onChange={(e) => setResultMessage(e.target.value)} placeholder="学生和导师均可见的处理说明" />
            {quote ? <div className="refund-quote">可处理 {quote.maxHours}h；{quote.lines.map((line) => `${line.provider} ${line.amountOriginal} ${line.currencyCode}`).join('；')}</div> : null}
            <div className="dispute-resolution-actions">
              <button className="ghost" type="button" onClick={() => resolve('rejected')} disabled={busy || !resultMessage.trim()}>不予支持</button>
              <button type="button" onClick={() => resolve(preferredOutcome)} disabled={busy || !resultMessage.trim() || (['lesson_credit', 'refund'].includes(preferredOutcome) && !hours) || (preferredOutcome === 'refund' && !quote)}>{preferredOutcome === 'lesson_credit' ? '确认补偿课时' : preferredOutcome === 'refund' ? '确认退款' : '确认记录反馈'}</button>
            </div>
          </div></> : null}
        </> : <><h3>最终结果</h3><DetailGrid items={[[ '结果', dispute.outcome_code], ['处理课时', formatHours(dispute.resolved_hours)], ['退款状态', dispute.refund_status || '-'], ['平台说明', dispute.result_message], ['完成时间', formatDate(dispute.resolved_at)]]} /></>}
        {actionError ? <div className="error">{actionError}</div> : null}
      </State>
    </aside>
  );
}

const emailAudienceOptions = [
  {
    value: 'students',
    label: '学生',
    description: '状态正常且已开启邮件通知的学生账号',
  },
  {
    value: 'mentors',
    label: '导师',
    description: '状态正常、审核已通过且已开启邮件通知的导师账号',
  },
  {
    value: 'all',
    label: '全站',
    description: '全部状态正常且已开启邮件通知的账号，按账号去重',
  },
];

function EmailBroadcastPreview({ subject, body }) {
  return (
    <div className="email-preview-shell">
      <div className="email-preview-toolbar">
        <span />
        <span />
        <span />
        <strong>邮件预览</strong>
      </div>
      <div className="email-preview-canvas">
        <article className="email-preview-card">
          <div className="email-preview-brand">
            <strong>Mentory</strong>
            <span>{subject.trim() || '邮件主题会显示在这里'}</span>
          </div>
          <em>Mentory 通知</em>
          <div className={`email-preview-body ${body.trim() ? '' : 'is-placeholder'}`}>
            {body.trim() || '在左侧填写正文后，这里会实时显示邮件效果。换行和段落会被完整保留。'}
          </div>
          <footer>
            此邮件由 Mentory 团队发送。您可以前往设置管理邮件通知。
            <span> 打开 Mentory</span>
          </footer>
        </article>
      </div>
    </div>
  );
}

function EmailBroadcastsPage() {
  const [audience, setAudience] = useState('students');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState(null);
  const countsState = useAsync(() => api('/api/admin/email-broadcasts/audiences'), []);
  const counts = countsState.data?.audiences || {};
  const selectedOption = emailAudienceOptions.find((option) => option.value === audience);
  const selectedCount = Number(counts[audience] || 0);
  const canSubmit = subject.trim().length >= 2 && body.trim().length >= 2 && !sending;

  const requestConfirmation = (event) => {
    event.preventDefault();
    setSendError('');
    setResult(null);
    if (!canSubmit) return;
    setConfirming(true);
  };

  const sendBroadcast = async () => {
    setSending(true);
    setSendError('');
    try {
      const data = await api('/api/admin/email-broadcasts', {
        method: 'POST',
        body: { audience, subject: subject.trim(), body: body.trim() },
      });
      setResult(data);
      setConfirming(false);
    } catch (error) {
      setSendError(error.message || '邮件发送失败，请稍后再试');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="email-broadcast-page">
      <PageTitle title="统一邮件" />

      <div className="email-broadcast-layout">
        <form className="email-broadcast-form" onSubmit={requestConfirmation}>
          <fieldset disabled={sending}>
            <legend>1. 选择收件人</legend>
            <div className="email-audience-grid" role="radiogroup" aria-label="收件人范围">
              {emailAudienceOptions.map((option) => (
                <label className={`email-audience-option ${audience === option.value ? 'active' : ''}`} key={option.value}>
                  <input
                    type="radio"
                    name="email-audience"
                    value={option.value}
                    checked={audience === option.value}
                    onChange={() => setAudience(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <em>{countsState.loading ? '统计中…' : countsState.error ? '人数暂不可用' : `${Number(counts[option.value] || 0).toLocaleString('zh-CN')} 人`}</em>
                  </span>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
            {countsState.error ? <div className="email-inline-warning">{countsState.error}</div> : null}
          </fieldset>

          <fieldset disabled={sending}>
            <legend>2. 填写邮件内容</legend>
            <label className="email-compose-field">
              <span>邮件主题</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={120}
                placeholder="例如：Mentory 课程服务更新通知"
              />
              <small>{subject.length} / 120</small>
            </label>
            <label className="email-compose-field">
              <span>邮件正文</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={10000}
                placeholder={'直接填写要发送的内容。\n\n可以使用换行分段，邮件模板会自动保持排版。'}
              />
              <small>{body.length.toLocaleString('zh-CN')} / 10,000</small>
            </label>
          </fieldset>

          {result ? (
            <div className={`email-send-result ${result.failed ? 'partial' : 'success'}`} role="status">
              <strong>{result.failed ? '发送已完成，部分邮件未送达' : '邮件发送完成'}</strong>
              <span>共 {result.recipients} 位收件人，成功 {result.sent} 封，失败 {result.failed} 封。</span>
            </div>
          ) : null}
          {sendError ? <div className="error" role="alert">{sendError}</div> : null}

          <div className="email-form-actions">
            <span>发送后无法撤回，请在右侧确认最终效果。</span>
            <button type="submit" disabled={!canSubmit || countsState.loading}>
              <FontAwesomeIcon icon={faEnvelope} />
              检查并发送
            </button>
          </div>
        </form>

        <aside className="email-broadcast-preview">
          <div className="email-preview-heading">
            <div>
              <strong>实时预览</strong>
              <span>实际邮件会根据用户语言显示对应的模板说明</span>
            </div>
            <em>{selectedOption?.label || '-'}</em>
          </div>
          <EmailBroadcastPreview subject={subject} body={body} />
        </aside>
      </div>

      {confirming ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal email-broadcast-confirm" role="dialog" aria-modal="true" aria-labelledby="email-confirm-title">
            <h2 id="email-confirm-title">确认发送统一邮件</h2>
            <p>
              即将向 <strong>{selectedOption?.label}</strong> 范围内约 <strong>{selectedCount.toLocaleString('zh-CN')}</strong> 位收件人发送邮件。
              收件人数会在发送时再次按账号状态和邮件偏好校验。
            </p>
            <div className="email-confirm-subject">
              <span>邮件主题</span>
              <strong>{subject.trim()}</strong>
            </div>
            <div className="email-confirm-warning">此操作无法撤回。发送过程中请保持当前页面开启。</div>
            {sendError ? <div className="error" role="alert">{sendError}</div> : null}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setConfirming(false)} disabled={sending}>返回修改</button>
              <button type="button" onClick={sendBroadcast} disabled={sending}>
                {sending ? '正在发送…' : `确认发送给 ${selectedOption?.label}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AuditLogsPage() {
  const [targetType, setTargetType] = useState('');
  const [action, setAction] = useState('');
  const { loading, error, data } = useAsync(
    () => api('/api/admin/audit-logs', { params: { targetType, action, limit: 80 } }),
    [targetType, action]
  );
  return (
    <section>
      <PageTitle title="审计日志" subtitle="后台写操作记录" />
      <Toolbar>
        <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="action" />
        <input value={targetType} onChange={(event) => setTargetType(event.target.value)} placeholder="target type" />
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={['时间', '管理员', 'Action', 'Target', '原因']}
          rows={(data?.logs || []).map((log) => [
            formatDate(log.created_at),
            log.admin_username || log.admin_id,
            log.action,
            `${log.target_type}:${log.target_id}`,
            log.reason,
          ])}
        />
      </State>
    </section>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(() => (getToken() ? getStoredAdmin() : null));
  const isLoggedIn = Boolean(getToken() && admin);

  const logout = useCallback(() => {
    clearSession();
    setAdmin(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const handleLogin = useCallback((nextAdmin) => {
    setAdmin(nextAdmin);
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!getToken()) return;
    api('/api/admin/auth/me')
      .then((data) => {
        if (data?.admin) setAdmin(data.admin);
      })
      .catch((error) => {
        if (error?.status === 401) {
          clearSession();
          setAdmin(null);
        }
      });
  }, []);

  return (
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />
      <Route path="/*" element={isLoggedIn ? <Shell onLogout={logout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
