import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faCheck,
  faClipboardCheck,
  faFileInvoiceDollar,
  faGaugeHigh,
  faMagnifyingGlass,
  faRightFromBracket,
  faRotateRight,
  faShieldHalved,
  faTriangleExclamation,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { api, clearSession, getStoredAdmin, getToken, setSession } from './api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: faGaugeHigh },
  { to: '/users', label: '用户管理', icon: faUsers },
  { to: '/mentors/reviews', label: '导师审核', icon: faClipboardCheck },
  { to: '/orders', label: '订单管理', icon: faFileInvoiceDollar },
  { to: '/reports', label: '举报风控', icon: faShieldHalved },
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
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
};

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  return (
    <button type="button" className="ghost refresh-button" onClick={onClick} disabled={loading}>
      <FontAwesomeIcon icon={faRotateRight} className={loading ? 'spin' : ''} />
      {loading ? '刷新中...' : '刷新'}
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
          <div className="brand-mark">M</div>
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
          <Route path="/reports" element={<ReportsPage />} />
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
      ['风控工单', asNumber(d.reports?.openReports), 'open / reviewing'],
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
        <p>{subtitle}</p>
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
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const { loading, error, data } = useAsync(
    () => api('/api/admin/users', { params: { q, role, status, limit: 50 } }),
    [q, role, status, reload]
  );

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
      <PageTitle title="用户管理" subtitle="检索用户、查看资料、封禁或解封账号" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} />
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">全部角色</option>
          <option value="student">学生</option>
          <option value="mentor">导师</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="suspended">已封禁</option>
        </select>
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={['ID', '邮箱', '角色', '课时', '状态', '注册时间', '操作']}
          rows={(data?.users || []).map((user) => [
            user.id,
            user.email,
            user.roles?.map((r) => `${r.role}:${r.publicId}`).join(' / ') || '-',
            user.lesson_balance_hours,
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

function UserDrawer({ userId, onClose }) {
  const { loading, error, data } = useAsync(() => api(`/api/admin/users/${userId}`), [userId]);
  return (
    <aside className="drawer">
      <button className="drawer-close" onClick={onClose}>×</button>
      <State loading={loading} error={error}>
        <h2>{data?.user?.email}</h2>
        <DetailGrid
          items={[
            ['User ID', data?.user?.id],
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
        {data?.mentorProfile ? (
          <>
            <h3>导师资料</h3>
            <DetailGrid
              items={[
                ['展示名', data.mentorProfile.display_name],
                ['学校', data.mentorProfile.school],
                ['学历', data.mentorProfile.degree],
                ['评分', data.mentorProfile.rating],
                ['课程数', data.mentorProfile.courses?.length || 0],
              ]}
            />
          </>
        ) : null}
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

function DataTable({ columns, rows, compact = false }) {
  return (
    <div className={`table-wrap ${compact ? 'compact' : ''}`}>
      <table>
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
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
  const [status, setStatus] = useState('pending');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const { loading, error, data } = useAsync(
    () => api('/api/admin/mentors/reviews', { params: { q, status, limit: 50 } }),
    [q, status, reload]
  );

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
      <PageTitle title="导师审核" subtitle="审核导师申请和简历资料" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索邮箱、MentorID、姓名" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="">全部</option>
        </select>
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={['User ID', 'MentorID', '邮箱', '学校/学历', '状态', '申请时间', '操作']}
          rows={(data?.mentors || []).map((mentor) => [
            mentor.user_id,
            mentor.public_id,
            mentor.email,
            `${mentor.school || '-'} / ${mentor.degree || '-'}`,
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
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState(null);
  const { loading, error, data } = useAsync(
    () => api('/api/admin/orders', { params: { q, status, limit: 50 } }),
    [q, status, reload]
  );

  const submitStatus = async (reason) => {
    await api(`/api/admin/orders/${dialog.order.id}/status`, {
      method: 'PATCH',
      body: { status: dialog.status, reason },
    });
    setDialog(null);
    setReload((n) => n + 1);
  };

  return (
    <section>
      <PageTitle title="订单管理" subtitle="查看充值订单并进行人工状态处理" />
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
          columns={['订单ID', '用户', 'Provider', '状态', '课时', 'CNY/USD', '创建时间', '操作']}
          rows={(data?.orders || []).map((order) => [
            order.id,
            `${order.email} ${order.student_public_id || ''}`,
            order.provider,
            <Badge value={order.status} />,
            order.topup_hours,
            `CNY ${order.amount_cny} / ${order.currency_code} ${order.amount_usd}`,
            formatDate(order.created_at),
            <select
              value=""
              onChange={(event) => event.target.value && setDialog({ title: '调整订单状态', order, status: event.target.value })}
            >
              <option value="">调整</option>
              <option value="CREATED">CREATED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CAPTURED">CAPTURED</option>
              <option value="FAILED">FAILED</option>
              <option value="VOIDED">VOIDED</option>
            </select>,
          ])}
        />
      </State>
      <ReasonDialog
        config={dialog ? { title: dialog.title, description: `订单 ${dialog.order.id} 将调整为 ${dialog.status}` } : null}
        onClose={() => setDialog(null)}
        onSubmit={submitStatus}
      />
    </section>
  );
}

function ReportsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ title: '', severity: 'medium', targetType: 'user', targetId: '', targetUserId: '', description: '', reason: '' });
  const { loading, error, data } = useAsync(
    () => api('/api/admin/reports', { params: { q, status, severity, limit: 50 } }),
    [q, status, severity, reload]
  );

  const createReport = async (event) => {
    event.preventDefault();
    await api('/api/admin/reports', {
      method: 'POST',
      body: {
        title: form.title,
        severity: form.severity,
        targetType: form.targetType,
        targetId: form.targetId,
        targetUserId: form.targetUserId,
        description: form.description,
        reason: form.reason,
      },
    });
    setForm({ title: '', severity: 'medium', targetType: 'user', targetId: '', targetUserId: '', description: '', reason: '' });
    setReload((n) => n + 1);
  };

  const updateReport = async (reason) => {
    await api(`/api/admin/reports/${dialog.report.id}`, {
      method: 'PATCH',
      body: { status: dialog.status, reason },
    });
    setDialog(null);
    setReload((n) => n + 1);
  };

  return (
    <section>
      <PageTitle title="举报 / 风控中心" subtitle="人工创建和处理风控工单" />
      <form className="inline-form" onSubmit={createReport}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="工单标题" />
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <input value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })} placeholder="目标类型 user/order/appointment" />
        <input value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} placeholder="目标ID" />
        <input value={form.targetUserId} onChange={(e) => setForm({ ...form, targetUserId: e.target.value })} placeholder="目标用户ID" />
        <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="创建原因" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="描述" />
        <button type="submit" disabled={!form.title || !form.targetType || !form.targetId || form.reason.trim().length < 2}>创建工单</button>
      </form>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="搜索工单、目标、用户邮箱" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="open">open</option>
          <option value="reviewing">reviewing</option>
          <option value="resolved">resolved</option>
          <option value="dismissed">dismissed</option>
        </select>
        <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="">全部等级</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </Toolbar>
      <State loading={loading} error={error}>
        <DataTable
          columns={['工单ID', '标题', '等级', '状态', '目标', '用户', '创建时间', '操作']}
          rows={(data?.reports || []).map((report) => [
            report.id,
            report.title,
            <Badge value={report.severity} />,
            <Badge value={report.status} />,
            `${report.target_type}:${report.target_id}`,
            report.target_user_email || report.target_user_id || '-',
            formatDate(report.created_at),
            <select
              value=""
              onChange={(event) => event.target.value && setDialog({ title: '更新风控工单', report, status: event.target.value })}
            >
              <option value="">处理</option>
              <option value="open">open</option>
              <option value="reviewing">reviewing</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </select>,
          ])}
        />
      </State>
      <ReasonDialog
        config={dialog ? { title: dialog.title, description: `工单 ${dialog.report.id} 将调整为 ${dialog.status}` } : null}
        onClose={() => setDialog(null)}
        onSubmit={updateReport}
      />
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
      .catch(() => {
        clearSession();
        setAdmin(null);
      });
  }, []);

  return (
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />
      <Route path="/*" element={isLoggedIn ? <Shell admin={admin} onLogout={logout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
