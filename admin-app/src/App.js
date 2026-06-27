import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChalkboardUser,
  faChartLine,
  faCheck,
  faClipboardCheck,
  faEye,
  faFileInvoiceDollar,
  faGaugeHigh,
  faMagnifyingGlass,
  faPlay,
  faRightFromBracket,
  faRotateRight,
  faTriangleExclamation,
  faUsers,
  faVideo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api, clearSession, getStoredAdmin, getToken, setSession } from './api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: faGaugeHigh },
  { to: '/users', label: '学生管理', icon: faUsers },
  { to: '/mentors/reviews', label: '导师管理', icon: faClipboardCheck },
  { to: '/orders', label: '订单管理', icon: faFileInvoiceDollar },
  { to: '/classrooms', label: '课堂管理', icon: faChalkboardUser },
  { to: '/audit-logs', label: '审计日志', icon: faChartLine },
];

const statusText = {
  active: '正常',
  suspended: '已封禁',
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
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
  disputed: '有争议',
  dispute_confirmed: '争议已确认',
  platform_review: '平台处理中',
  running: '录制中',
  ready: '已生成',
  reviewed: '已评价',
};

const LIVE_SDK_URL = 'https://g.alicdn.com/apsara-media-box/imp-web-live-push/6.4.9/alivc-live-push.js';
let liveSdkPromise = null;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
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

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function RefreshButton({ onClick, loading }) {
  const label = loading ? '刷新中...' : '刷新';
  return (
    <button
      type="button"
      className="ghost refresh-button icon-only"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      title={label}
    >
      <FontAwesomeIcon icon={faRotateRight} className={loading ? 'spin' : ''} />
    </button>
  );
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
  if (!config) return null;
  const reasonRequired = config.reasonRequired !== false;
  const minLength = reasonRequired ? 2 : 0;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reason-title">
        <h2 id="reason-title">{config.title}</h2>
        <p>{config.description}</p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={config.placeholder || '填写操作原因'}
          autoFocus
        />
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>取消</button>
          <button onClick={() => onSubmit(reason)} disabled={reason.trim().length < minLength}>确认</button>
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

function Shell({ admin, onLogout }) {
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
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <strong>{admin?.displayName || admin?.username || 'Admin'}</strong>
            <span>本地环境</span>
          </div>
          <button className="ghost icon-text refresh-button" type="button" onClick={() => window.location.reload()}>
            <FontAwesomeIcon icon={faRotateRight} />
            刷新
          </button>
          <button className="ghost icon-text" onClick={onLogout}>
            <FontAwesomeIcon icon={faRightFromBracket} />
            退出
          </button>
        </header>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/mentors/reviews" element={<MentorReviewsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/classrooms" element={<ClassroomsPage />} />
          <Route path="/classrooms/:courseId/watch" element={<ClassroomWatchPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard() {
  const [reload, setReload] = useState(0);
  const { loading, error, data } = useAsync(() => api('/api/admin/dashboard/summary'), [reload]);
  const cards = useMemo(() => {
    const d = data || {};
    return [
      ['用户总数', asNumber(d.users?.totalUsers), `今日新增 ${asNumber(d.users?.newUsersToday)}，7日新增 ${asNumber(d.users?.newUsers7d)}`],
      ['学生 / 导师', `${asNumber(d.roles?.students)} / ${asNumber(d.roles?.mentors)}`, `待审核导师 ${asNumber(d.mentors?.pendingMentors)}`],
      ['已支付订单', asNumber(d.orders?.paidOrders), `累计 CNY ${asNumber(d.orders?.paidAmountCny).toFixed(2)}`],
      ['课程排期', asNumber(d.courses?.scheduledCourses), 'scheduled'],
      ['课时确认', asNumber(d.lessonHours?.pendingLessonHours), 'pending / disputed / platform_review'],
    ];
  }, [data]);

  return (
    <section>
      <PageTitle title="Dashboard" subtitle="平台运营数据概览" />
      <Toolbar>
        <RefreshButton onClick={() => setReload((n) => n + 1)} loading={loading} />
      </Toolbar>
      <State loading={loading} error={error}>
        <div className="metric-grid">
          {cards.map(([label, value, hint]) => (
            <article className="metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{hint}</small>
            </article>
          ))}
        </div>
      </State>
    </section>
  );
}

function PageTitle({ title, subtitle }) {
  return (
    <div className="page-title">
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
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="suspended">已封禁</option>
        </select>
        <RefreshButton onClick={() => setReload((n) => n + 1)} loading={loading} />
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={[
            <SortHeader label="StudentID" field="id" sort={sort} onSort={updateSort} />,
            '邮箱',
            <SortHeader label="课时余额" field="lesson_balance_hours" sort={sort} onSort={updateSort} />,
            <SortHeader label="累计充值（CNY）" field="total_paid_cny" sort={sort} onSort={updateSort} />,
            '状态',
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
              <button onClick={() => setDialog({ title: user.account_status === 'suspended' ? '解封用户' : '封禁用户', user, nextStatus: user.account_status === 'suspended' ? 'active' : 'suspended' })}>
                {user.account_status === 'suspended' ? '解封' : '封禁'}
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

function UserDrawer({ userId, onClose }) {
  const { loading, error, data } = useAsync(() => api(`/api/admin/users/${userId}`), [userId]);
  return (
    <aside className="drawer">
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
          rows={(data?.roles || []).map((role) => [role.role, role.public_id, <Badge value={role.mentor_review_status || '-'} />])}
        />
      </State>
    </aside>
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

function MentorReviewsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [sort, setSort] = useState({ field: 'mentor_created_at', direction: 'desc' });
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

  const openResume = (mentor) => {
    if (!parseUrlList(mentor.mentor_resume_url).length) return;
    const token = getToken();
    if (!token) {
      window.alert('后台登录已失效');
      return;
    }
    window.open(buildAdminPreviewUrl(`/api/admin/mentors/${mentor.user_id}/resume-preview`, token), '_blank');
  };

  const submitReview = async (reason) => {
    await api(`/api/admin/mentors/${dialog.mentor.user_id}/${dialog.action}`, {
      method: 'POST',
      body: { reason },
    });
    setDialog(null);
    setDetail(null);
    setReload((n) => n + 1);
  };

  return (
    <section>
      <PageTitle title="导师管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索邮箱、MentorID、姓名" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
        <RefreshButton onClick={() => setReload((n) => n + 1)} loading={loading} />
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={[
            <SortHeader label="MentorID" field="public_id" sort={sort} onSort={updateSort} />,
            <SortHeader label="邮箱" field="email" sort={sort} onSort={updateSort} />,
            <SortHeader label="学校/学历" field="school_degree" sort={sort} onSort={updateSort} />,
            '简历',
            <SortHeader label="已授课时" field="total_teaching_hours" sort={sort} onSort={updateSort} />,
            <SortHeader label="状态" field="mentor_review_status" sort={sort} onSort={updateSort} />,
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
            <Badge value={mentor.mentor_review_status} />,
            formatDate(mentor.mentor_created_at),
            <div className="row-actions">
              <button
                type="button"
                className="text-action detail-action"
                onClick={() => setDetail(mentor.user_id)}
              >
                详情
              </button>
              {mentor.mentor_review_status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="icon-action approve-action"
                    title="通过"
                    aria-label="通过"
                    onClick={() => setDialog({ title: '通过导师审核', mentor, action: 'approve' })}
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </button>
                  <button
                    type="button"
                    className="icon-action reject-action"
                    title="驳回"
                    aria-label="驳回"
                    onClick={() => setDialog({ title: '驳回导师审核', mentor, action: 'reject' })}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </>
              ) : null}
            </div>,
          ])}
        />
      </State>
      {detail ? <MentorDrawer userId={detail} onClose={() => setDetail(null)} /> : null}
      <ReasonDialog
        config={dialog ? {
          title: dialog.title,
          description: `目标导师：${dialog.mentor.email} (${dialog.mentor.public_id})`,
          reasonRequired: dialog.action === 'reject',
          placeholder: dialog.action === 'reject' ? '填写驳回原因' : '可选填写通过备注',
        } : null}
        onClose={() => setDialog(null)}
        onSubmit={submitReview}
      />
    </section>
  );
}

function MentorDrawer({ userId, onClose }) {
  const { loading, error, data } = useAsync(() => api(`/api/admin/mentors/${userId}/review`), [userId]);
  const mentor = data?.mentor || {};
  const resumeUrl = parseUrlList(mentor.resumeUrls || mentor.mentor_resume_url)[0] || '';
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
    <aside className="drawer">
      <button className="drawer-close" onClick={onClose}>×</button>
      <State loading={loading} error={error}>
        <h2>{mentor.public_id} · {mentor.email}</h2>
        <DetailGrid
          items={[
            ['审核状态', <Badge value={mentor.mentor_review_status} />],
            ['姓名', mentor.display_name],
            ['学校', mentor.school],
            ['学历', mentor.degree],
            ['时区', mentor.timezone],
            ['评分', mentor.rating],
            ['简历', resumeUrl ? <button className="link-button" onClick={openResume}>打开简历</button> : '-'],
            ['审核备注', mentor.mentor_review_note],
          ]}
        />
        <h3>课程方向</h3>
        <div className="chip-row">{(mentor.courses || []).map((item) => <span className="chip" key={item}>{item}</span>)}</div>
        <h3>授课语言</h3>
        <div className="chip-row">{(mentor.teachingLanguages || []).map((item) => <span className="chip" key={item}>{item}</span>)}</div>
      </State>
    </aside>
  );
}

function OrdersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ field: 'id', direction: 'desc' });
  const { loading, error, data } = useAsync(
    () => api('/api/admin/orders', { params: { q, status, limit: 50 } }),
    [q, status]
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

  const orderColumns = [
    <SortHeader label={'\u8ba2\u5355ID'} field="id" sort={sort} onSort={updateSort} />,
    <SortHeader label="StudentID" field="student_public_id" sort={sort} onSort={updateSort} />,
    '\u90ae\u7bb1',
    'Provider',
    '\u72b6\u6001',
    <SortHeader label={'\u8bfe\u65f6'} field="topup_hours" sort={sort} onSort={updateSort} />,
    <SortHeader label={'\u91d1\u989d'} field="amount_cny" sort={sort} onSort={updateSort} />,
    <SortHeader label={'\u521b\u5efa\u65f6\u95f4'} field="created_at" sort={sort} onSort={updateSort} />,
  ];

  return (
    <section>
      <PageTitle title="订单管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索邮箱、订单号、StudentID" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="CREATED">CREATED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CAPTURED">CAPTURED</option>
          <option value="FAILED">FAILED</option>
        </select>
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={orderColumns}
          rows={orders.map((order) => [
            order.id,
            order.student_public_id || '-',
            order.email || '-',
            order.provider,
            <Badge value={order.status} />,
            order.topup_hours,
            formatIntegerAmount(order.amount_cny),
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

function ClassroomsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [lessonHoursStatus, setLessonHoursStatus] = useState('');
  const [replayStatus, setReplayStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [replayCourse, setReplayCourse] = useState(null);
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

  const classroomColumns = [
    <SortHeader label="课堂ID" field="id" sort={sort} onSort={updateSort} />,
    '课程方向 / 类型',
    <SortHeader label="上课时间" field="starts_at" sort={sort} onSort={updateSort} />,
    <SortHeader label="时长" field="duration_hours" sort={sort} onSort={updateSort} />,
    '课堂状态',
    '学生',
    '导师',
    '课时确认',
    '课时数',
    '回放',
    '评价',
    '操作',
  ];

  const openWatch = (courseId) => {
    window.open(`/classrooms/${encodeURIComponent(courseId)}/watch`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section>
      <PageTitle title="课堂管理" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索课堂ID、邮箱、StudentID、MentorID、导师姓名" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部课堂状态</option>
          <option value="scheduled">未开始</option>
          <option value="completed">已结束</option>
          <option value="cancelled">已取消</option>
        </select>
        <select value={lessonHoursStatus} onChange={(event) => setLessonHoursStatus(event.target.value)}>
          <option value="">全部课时确认</option>
          <option value="none">无记录</option>
          <option value="pending">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="disputed">有争议</option>
          <option value="dispute_confirmed">争议已确认</option>
          <option value="platform_review">平台处理中</option>
        </select>
        <select value={replayStatus} onChange={(event) => setReplayStatus(event.target.value)}>
          <option value="">全部回放状态</option>
          <option value="none">无录制</option>
          <option value="running">录制中</option>
          <option value="ready">已生成</option>
          <option value="failed">录制失败</option>
        </select>
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="开始日期" />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="结束日期" />
        <RefreshButton onClick={() => setReload((n) => n + 1)} loading={loading} />
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
            <Badge value={item.lesson_hours_status || 'none'} />,
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
    </section>
  );
}

function ClassroomDrawer({ courseId, onClose }) {
  const { loading, error, data } = useAsync(() => api(`/api/admin/classrooms/${courseId}`), [courseId]);
  const replayState = useAsync(() => api(`/api/admin/classrooms/${courseId}/replay-files`), [courseId]);
  const classroom = data?.classroom || {};
  const lesson = classroom.latestLessonHours || {};
  const recordings = classroom.recordings || [];
  const replayFiles = replayState.data?.files || [];
  return (
    <aside className="drawer wide-drawer">
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
        <h3>学生 / 导师</h3>
        <DetailGrid
          items={[
            ['学生用户ID', classroom.student_user_id],
            ['StudentID', classroom.student_public_id],
            ['学生邮箱', classroom.student_email],
            ['导师用户ID', classroom.mentor_user_id],
            ['MentorID', classroom.mentor_public_id],
            ['导师', classroom.mentor_display_name || classroom.mentor_username],
            ['导师邮箱', classroom.mentor_email],
          ]}
        />
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
      <Route path="/*" element={isLoggedIn ? <Shell admin={admin} onLogout={logout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
