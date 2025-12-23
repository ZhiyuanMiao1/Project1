import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAward,
  FiBell,
  FiBookOpen,
  FiChevronDown,
  FiCreditCard,
  FiGlobe,
  FiMessageSquare,
  FiShield,
  FiUser,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { fetchAccountProfile } from '../../api/account';
import api from '../../api/client';
import defaultAvatar from '../../assets/images/default-avatar.jpg';
import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../constants/courseMappings';
import './AccountSettingsPage.css';

const SETTINGS_SECTIONS = [
  {
    id: 'profile',
    label: '个人信息',
    icon: FiUser,
  },
  {
    id: 'studentData',
    label: '学生数据',
    icon: FiBookOpen,
  },
  {
    id: 'mentorData',
    label: '导师数据',
    icon: FiAward,
  },
  {
    id: 'security',
    label: '安全与隐私',
    icon: FiShield,
  },
  {
    id: 'notifications',
    label: '通知',
    icon: FiBell,
  },
  {
    id: 'payments',
    label: '付款与账单',
    icon: FiCreditCard,
  },
  {
    id: 'language',
    label: '语言与偏好',
    icon: FiGlobe,
  },
];

const MOCK_RECHARGE_RECORDS = [
  { id: 'topup-2025-12-18-01', timeZone: 'UTC+08:00', time: '2025/12/18 20:10', amount: 200, courseHours: 2 },
  { id: 'topup-2025-12-10-02', timeZone: 'UTC+08:00', time: '2025/12/10 14:32', amount: 300, courseHours: 3 },
  { id: 'topup-2025-11-26-03', timeZone: 'UTC+08:00', time: '2025/11/26 09:05', amount: 150, courseHours: 1.5 },
];

const MOCK_INCOME_RECORDS = [
  {
    id: 'income-2025-12-16-01',
    timeZone: 'UTC+08:00',
    time: '2025/12/16 21:40',
    amount: 360,
    teachingHours: 1.5,
    studentId: 's44',
    courseDirectionId: 'statistics',
    courseTypeId: 'final-review',
  },
  {
    id: 'income-2025-12-03-02',
    timeZone: 'UTC+08:00',
    time: '2025/12/03 18:20',
    amount: 240,
    teachingHours: 1,
    studentId: 's12',
    courseDirectionId: 'algo',
    courseTypeId: 'pre-study',
  },
];

const MOCK_WRITTEN_REVIEWS = [
  { id: 'review-2025-12-12-01', target: '导师 Alex', rating: 5, content: '讲解清晰，反馈及时。', time: '2025/12/12 20:10' },
  { id: 'review-2025-11-20-02', target: '导师 Lily', rating: 4, content: '很耐心，建议更具体一点。', time: '2025/11/20 19:05' },
];

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const formatCny = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return cnyFormatter.format(value);
};

const formatCourseHours = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  return normalized;
};

const formatReviewMonth = (value) => {
  if (typeof value !== 'string' || !value) return '';
  const match = value.match(/(\d{4})[/-](\d{1,2})/);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  return `${year}年${month}月`;
};

const getReviewDisplayName = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^导师\s*/, '').trim();
  return withoutPrefix || trimmed;
};

function RechargeTable({ records = [] }) {
  return (
    <div className="settings-orders-table-wrapper">
      <table className="settings-orders-table">
        <thead>
          <tr>
            <th scope="col">时区</th>
            <th scope="col">时间</th>
            <th scope="col">金额</th>
            <th scope="col">获得课时</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="settings-recharge-timezone">{record.timeZone}</td>
              <td className="settings-orders-time">{record.time}</td>
              <td className="settings-orders-amount">{formatCny(record.amount)}</td>
              <td className="settings-recharge-hours">{formatCourseHours(record.courseHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomeTable({ records = [] }) {
  const [expandedRecordIds, setExpandedRecordIds] = useState(() => ({}));

  const toggleExpanded = (id) => {
    setExpandedRecordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRowKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded(id);
    }
  };

  return (
    <div className="settings-orders-table-wrapper">
      <table className="settings-orders-table">
        <thead>
          <tr>
            <th scope="col">时区</th>
            <th scope="col">时间</th>
            <th scope="col">金额</th>
            <th scope="col">授课时长</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const expanded = !!expandedRecordIds[record.id];
            const directionId = record.courseDirectionId || 'others';
            const courseTypeId = record.courseTypeId || 'others';
            const courseName = DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || '其它课程方向';
            const courseTypeName = COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || '其它类型';
            const DirectionIcon = DIRECTION_ICON_MAP[directionId] || DIRECTION_ICON_MAP.others;
            const CourseTypeIcon = COURSE_TYPE_ICON_MAP[courseTypeId] || COURSE_TYPE_ICON_MAP.others;
            const detailsId = `settings-income-detail-${record.id}`;

            return (
              <React.Fragment key={record.id}>
                <tr
                  className={`settings-income-row ${expanded ? 'is-expanded' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => toggleExpanded(record.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, record.id)}
                >
                  <td className="settings-recharge-timezone">{record.timeZone}</td>
                  <td className="settings-orders-time">{record.time}</td>
                  <td className="settings-orders-amount">{formatCny(record.amount)}</td>
                  <td className="settings-recharge-hours">{formatCourseHours(record.teachingHours)}</td>
                </tr>
                <tr
                  id={detailsId}
                  className="settings-income-detail-row"
                  hidden={!expanded}
                >
                  <td colSpan={4}>
                    <div className="settings-income-detail">
                      <div className="settings-income-detail-item settings-income-detail-item--student">
                        <span className="settings-income-detail-value">{record.studentId || '--'}</span>
                      </div>
                      <div className="settings-income-detail-item settings-income-detail-item--course">
                        <span className="settings-income-detail-icon" aria-hidden="true">
                          {DirectionIcon ? <DirectionIcon size={16} /> : null}
                        </span>
                        <span className="settings-income-detail-value">{courseName}</span>
                      </div>
                      <div className="settings-income-detail-item settings-income-detail-item--type">
                        <span className="settings-income-detail-icon" aria-hidden="true">
                          {CourseTypeIcon ? <CourseTypeIcon size={16} /> : null}
                        </span>
                        <span className="settings-income-detail-value">{courseTypeName}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WrittenReviewsTable({ reviews = [] }) {
  return (
    <ul className="settings-written-reviews-list" aria-label="我撰写的评价列表">
      {reviews.map((review) => {
        const displayName = getReviewDisplayName(review.target) || '导师';
        const monthLabel = formatReviewMonth(review.time);
        const ratingLabel = typeof review.rating === 'number' ? String(review.rating) : String(review.rating || '--');

        return (
          <li key={review.id} className="settings-written-review-item">
            <img className="settings-written-review-avatar" src={defaultAvatar} alt="" />
            <div className="settings-written-review-body">
              <div className="settings-written-review-meta">
                <span className="settings-written-review-name">{displayName}</span>
                {monthLabel ? <span className="settings-written-review-date">{monthLabel}</span> : null}
              </div>
              <div className="settings-written-review-text">{review.content}</div>
            </div>
            <div className="settings-written-review-rating" aria-label={`评分 ${ratingLabel}`}>
              <span className="settings-written-review-rating-star" aria-hidden="true">
                ★
              </span>
              <span className="settings-written-review-rating-value">{ratingLabel}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AccountSettingsPage({ mode = 'student' }) {
  const isMentorView = mode === 'mentor';
  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const toastTimerRef = useRef(null);
  const studentAvatarInputRef = useRef(null);
  const mentorAvatarInputRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [studentAvatarUrl, setStudentAvatarUrl] = useState(null);
  const [mentorAvatarUrl, setMentorAvatarUrl] = useState(null);
  const [accountProfile, setAccountProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      const role = user?.role;
      const publicId = user?.public_id;
      return {
        email: typeof user?.email === 'string' ? user.email : '',
        studentId: role === 'student' && typeof publicId === 'string' ? publicId : '',
        mentorId: role === 'mentor' && typeof publicId === 'string' ? publicId : '',
        degree: '',
        school: '',
        studentCreatedAt: null,
        mentorCreatedAt: null,
      };
    } catch {
      return { email: '', studentId: '', mentorId: '', degree: '', school: '', studentCreatedAt: null, mentorCreatedAt: null };
    }
  });
  const [idsStatus, setIdsStatus] = useState('idle'); // idle | loading | loaded | error
  const [degreeDraft, setDegreeDraft] = useState('');
  const [schoolDraft, setSchoolDraft] = useState('');
  const [editingDegree, setEditingDegree] = useState(false);
  const [editingSchool, setEditingSchool] = useState(false);
  const [savingAccountProfile, setSavingAccountProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [savingEmailNotifications, setSavingEmailNotifications] = useState(false);
  const [toast, setToast] = useState(null); // { id: number, kind: 'success' | 'error', message: string }

  const [activeSectionId, setActiveSectionId] = useState(SETTINGS_SECTIONS[0]?.id || 'profile');
  const [paymentsExpanded, setPaymentsExpanded] = useState(false);
  const [receiptsExpanded, setReceiptsExpanded] = useState(false);
  const [writtenReviewsExpanded, setWrittenReviewsExpanded] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setIdsStatus('idle');
      setAccountProfile({ email: '', studentId: '', mentorId: '', degree: '', school: '', studentCreatedAt: null, mentorCreatedAt: null });
      setEditingPassword(false);
      setNewPasswordDraft('');
      setConfirmPasswordDraft('');
      setSavingPassword(false);
      setPasswordError('');
      setEmailNotificationsEnabled(false);
      setSavingEmailNotifications(false);
      setToast(null);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      return;
    }

    let alive = true;
    setIdsStatus('loading');
    fetchAccountProfile()
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        const next = {
          email: typeof data.email === 'string' ? data.email : '',
          studentId: typeof data.studentId === 'string' ? data.studentId : '',
          mentorId: typeof data.mentorId === 'string' ? data.mentorId : '',
          degree: typeof data.degree === 'string' ? data.degree : '',
          school: typeof data.school === 'string' ? data.school : '',
          studentCreatedAt: typeof data.studentCreatedAt === 'string' ? data.studentCreatedAt : null,
          mentorCreatedAt: typeof data.mentorCreatedAt === 'string' ? data.mentorCreatedAt : null,
        };
        setAccountProfile(next);
        setIdsStatus('loaded');
        setDegreeDraft(typeof data.degree === 'string' ? data.degree : '');
        setSchoolDraft(typeof data.school === 'string' ? data.school : '');
        setEmailNotificationsEnabled(
          typeof data.emailNotificationsEnabled === 'boolean' ? data.emailNotificationsEnabled : false
        );
      })
      .catch(() => {
        if (!alive) return;
        setIdsStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const activeSection = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.id === activeSectionId) || SETTINGS_SECTIONS[0],
    [activeSectionId],
  );

  const studentIdValue = accountProfile.studentId || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const mentorIdValue = accountProfile.mentorId || (idsStatus === 'loading' ? '加载中...' : '暂未开通');
  const emailValue = accountProfile.email || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const degreeValue = accountProfile.degree || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const schoolValue = accountProfile.school || (idsStatus === 'loading' ? '加载中...' : '未提供');
  const canEditEducationProfile = isLoggedIn && idsStatus !== 'loading';
  const emailNotificationsDisabled = !isLoggedIn || idsStatus === 'loading' || savingEmailNotifications;

  const joinedMentorXDays = useMemo(() => {
    const rawCreatedAt = accountProfile.studentCreatedAt || accountProfile.mentorCreatedAt;
    if (!rawCreatedAt) return null;
    const createdAt = new Date(rawCreatedAt).getTime();
    if (!Number.isFinite(createdAt)) return null;
    const diffMs = Math.max(0, Date.now() - createdAt);
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }, [accountProfile.studentCreatedAt, accountProfile.mentorCreatedAt]);

  const joinedMentorXDaysDisplay = idsStatus === 'loading' ? '...' : (joinedMentorXDays ?? '--');

  const mentorJoinedMentorXDays = useMemo(() => {
    const rawCreatedAt = accountProfile.mentorCreatedAt;
    if (!rawCreatedAt) return null;
    const createdAt = new Date(rawCreatedAt).getTime();
    if (!Number.isFinite(createdAt)) return null;
    const diffMs = Math.max(0, Date.now() - createdAt);
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }, [accountProfile.mentorCreatedAt]);

  const mentorJoinedMentorXDaysDisplay = idsStatus === 'loading' ? '...' : (mentorJoinedMentorXDays ?? '--');
  const studentAvatarInitial = (() => {
    const raw = typeof accountProfile.studentId === 'string' ? accountProfile.studentId.trim() : '';
    return (raw ? raw.slice(0, 1) : 'S').toUpperCase();
  })();
  const onPickStudentAvatar = () => {
    if (studentAvatarInputRef.current) studentAvatarInputRef.current.click();
  };

  const onPickMentorAvatar = () => {
    if (mentorAvatarInputRef.current) mentorAvatarInputRef.current.click();
  };

  const onStudentAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      alert('请选择图片文件');
      try { e.target.value = ''; } catch {}
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setStudentAvatarUrl((prev) => {
      try { if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); } catch {}
      return nextUrl;
    });

    try { e.target.value = ''; } catch {}
  };

  const onMentorAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      alert('请选择图片文件');
      try { e.target.value = ''; } catch {}
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setMentorAvatarUrl((prev) => {
      try { if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev); } catch {}
      return nextUrl;
    });

    try { e.target.value = ''; } catch {}
  };

  useEffect(() => () => {
    try { if (studentAvatarUrl && studentAvatarUrl.startsWith('blob:')) URL.revokeObjectURL(studentAvatarUrl); } catch {}
  }, [studentAvatarUrl]);

  useEffect(() => () => {
    try { if (mentorAvatarUrl && mentorAvatarUrl.startsWith('blob:')) URL.revokeObjectURL(mentorAvatarUrl); } catch {}
  }, [mentorAvatarUrl]);

  const DEGREE_OPTIONS = useMemo(() => ([
    { value: '本科', label: '本科' },
    { value: '硕士', label: '硕士' },
    { value: 'PhD', label: 'PhD' },
  ]), []);

  const DegreeSelect = ({ id, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current;
      if (!listEl) return;
      const idx = Math.max(0, DEGREE_OPTIONS.findIndex((o) => o.value === value));
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
      if (!itemEl) return;
      const listH = listEl.clientHeight;
      const top = itemEl.offsetTop;
      const h = itemEl.offsetHeight;
      const target = top - Math.max(0, (listH - h) / 2);
      try { listEl.scrollTo({ top: target, behavior: 'auto' }); } catch { listEl.scrollTop = target; }
    }, [open, value]);

    useEffect(() => {
      const onDoc = (e) => {
        if (!open) return;
        const btn = buttonRef.current;
        const list = listRef.current;
        if (btn && btn.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
      if (!open) return;
      const i = Math.max(0, DEGREE_OPTIONS.findIndex((o) => o.value === value));
      if (e.key === 'ArrowDown') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.min(DEGREE_OPTIONS.length - 1, i + 1)].value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(DEGREE_OPTIONS[Math.max(0, i - 1)].value); }
      else if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
    };

    const selectedLabel = useMemo(() => DEGREE_OPTIONS.find(o => o.value === value)?.label || '', [value]);

    return (
      <div className="mx-select" data-open={open ? 'true' : 'false'}>
        <button
          id={id}
          ref={buttonRef}
          type="button"
          className="mx-select__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={handleKeyDown}
        >
          <span className="mx-select__label">{selectedLabel || '请选择'}</span>
          <span className="mx-select__caret" aria-hidden>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        {open && (
          <div className="mx-select__popover">
            <ul ref={listRef} role="listbox" aria-labelledby={id} className="mx-select__list">
              {DEGREE_OPTIONS.map((opt, index) => {
                const selected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    className={`mx-select__option ${selected ? 'selected' : ''}`}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                  >
                    {opt.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const saveAccountProfilePatch = async (patch) => {
    if (savingAccountProfile) return;
    setSavingAccountProfile(true);
    try {
      await api.put('/api/account/profile', patch);
      setAccountProfile((prev) => ({ ...prev, ...patch }));
    } catch (e) {
      const msg = e?.response?.data?.error || '保存失败，请稍后再试';
      alert(msg);
    } finally {
      setSavingAccountProfile(false);
    }
  };

  const showToast = (message, kind = 'success') => {
    const id = Date.now();
    setToast({ id, kind, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  const toggleEmailNotifications = async () => {
    if (savingEmailNotifications) return;
    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      return;
    }

    const nextValue = !emailNotificationsEnabled;
    setEmailNotificationsEnabled(nextValue);
    setSavingEmailNotifications(true);
    try {
      await api.put('/api/account/notifications', { emailNotificationsEnabled: nextValue });
    } catch (e) {
      setEmailNotificationsEnabled(!nextValue);
      const msg = e?.response?.data?.error || '保存失败，请稍后再试';
      showToast(msg, 'error');
    } finally {
      setSavingEmailNotifications(false);
    }
  };

  const startPasswordEdit = () => {
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }
    setPasswordError('');
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setEditingPassword(true);
  };

  const cancelPasswordEdit = () => {
    setEditingPassword(false);
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setPasswordError('');
  };

  const saveNewPassword = async () => {
    if (savingPassword) return;
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }

    const newPassword = newPasswordDraft;
    const confirmPassword = confirmPasswordDraft;
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      setPasswordError('密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    try {
      await api.put('/api/account/password', { newPassword, confirmPassword });
      cancelPasswordEdit();
      showToast('密码修改成功', 'success');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || '修改失败，请稍后再试';
      setPasswordError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="settings-page">
      {toast && (
        <div
          key={toast.id}
          className={`settings-toast ${toast.kind === 'success' ? 'settings-toast--success' : 'settings-toast--error'}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
      <div className="container">
        <header className="settings-header">
          <BrandMark className="nav-logo-text" to={homeHref} />
          <button
            type="button"
            className="icon-circle settings-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => (isMentorView ? setShowMentorAuth(true) : setShowStudentAuth(true))}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="settings-hero">
          <h1>设置与数据</h1>
        </section>

        <section className="settings-shell" aria-label="设置与数据">
          <div className="settings-nav-pane">
            <nav className="settings-nav" aria-label="设置选项">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`settings-nav-item ${isActive ? 'is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <span className="settings-nav-icon" aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <span className="settings-nav-text">
                      <span className="settings-nav-label">{section.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="settings-divider" aria-hidden="true" />

          <div className="settings-detail-pane">
            <div className="settings-detail-head">
              <div className="settings-detail-title">{activeSection?.label || '设置与数据'}</div>
            </div>

            <div
              className={`settings-card ${activeSectionId === 'profile' ? 'settings-card--profile' : ''}`}
              role="region"
              aria-label={`${activeSection?.label || '设置'}内容`}
            >
              {activeSectionId === 'profile' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">StudentID</div>
                      <div className="settings-row-value">{studentIdValue}</div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">MentorID</div>
                      <div className="settings-row-value">{mentorIdValue}</div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">邮箱</div>
                      <div className="settings-row-value">{emailValue}</div>
                    </div>
                  </div>
                  <div className={`settings-row ${editingDegree ? 'settings-row--overlay' : ''}`}>
                    <div className="settings-row-main">
                      <div className="settings-row-title">学历</div>
                      <div className={`settings-row-value ${canEditEducationProfile && editingDegree ? 'settings-row-value--interactive' : ''}`}>
                        {canEditEducationProfile && editingDegree ? (
                          <DegreeSelect
                            id="mx-degree-inline"
                            value={degreeDraft || ''}
                            onChange={(v) => setDegreeDraft(v)}
                          />
                        ) : (
                          degreeValue
                        )}
                      </div>
                    </div>
                    {canEditEducationProfile && (
                      <button
                        type="button"
                        className="settings-action"
                        disabled={savingAccountProfile}
                        onClick={() => {
                          if (!editingDegree) {
                            setEditingDegree(true);
                            setDegreeDraft(accountProfile.degree || '');
                            return;
                          }
                          saveAccountProfilePatch({ degree: degreeDraft || '' });
                          setEditingDegree(false);
                        }}
                      >
                        {editingDegree ? '保存' : '编辑'}
                      </button>
                    )}
                  </div>
                  <div className={`settings-row ${editingSchool ? 'settings-row--overlay' : ''}`}>
                    <div className="settings-row-main">
                      <div className="settings-row-title">学校</div>
                      <div className={`settings-row-value ${canEditEducationProfile && editingSchool ? 'settings-row-value--interactive' : ''}`}>
                        {canEditEducationProfile && editingSchool ? (
                          <input
                            type="text"
                            className="settings-inline-input"
                            value={schoolDraft}
                            placeholder="可选填"
                            onChange={(e) => setSchoolDraft(e.target.value)}
                          />
                        ) : (
                          schoolValue
                        )}
                      </div>
                    </div>
                    {canEditEducationProfile && (
                      <button
                        type="button"
                        className="settings-action"
                        disabled={savingAccountProfile}
                        onClick={() => {
                          if (!editingSchool) {
                            setEditingSchool(true);
                            setSchoolDraft(accountProfile.school || '');
                            return;
                          }
                          saveAccountProfilePatch({ school: schoolDraft || '' });
                          setEditingSchool(false);
                        }}
                      >
                        {editingSchool ? '保存' : '编辑'}
                      </button>
                    )}
                  </div>
                </>
              )}

              {activeSectionId === 'studentData' && (
                <div className="settings-data-section" aria-label="学生数据">
                  <section className="settings-student-card" aria-label="学生数据概览">
                    <div className="settings-student-card-left">
                      <div className="settings-student-avatar-wrap">
                        <button
                          type="button"
                          className={`settings-student-avatar-btn ${studentAvatarUrl ? 'has-avatar' : ''}`}
                          aria-label="更换头像"
                          onClick={onPickStudentAvatar}
                        >
                          {studentAvatarUrl ? (
                            <img className="settings-student-avatar-img" src={studentAvatarUrl} alt="" />
                          ) : (
                            <span className="settings-student-avatar-initial" aria-hidden="true">{studentAvatarInitial}</span>
                          )}
                        </button>
                        <svg className="settings-student-avatar-camera" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <circle cx="12" cy="12" r="12" fill="currentColor" />
                          <rect x="6" y="8" width="12" height="9" rx="2" ry="2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 8 L10.1 6.6 A1.8 1.8 0 0 1 11.6 5.8 H12.4 A1.8 1.8 0 0 1 13.9 6.6 L15 8" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12.5" r="3" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                        </svg>
                        <input
                          ref={studentAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="settings-student-avatar-input"
                          onChange={onStudentAvatarChange}
                        />
                      </div>
                      <div className="settings-student-main">
                        <div className="settings-student-name">{studentIdValue}</div>
                        <div className="settings-student-subtitle">{schoolValue !== '未提供' ? schoolValue : 'MentorX 学生'}</div>
                      </div>
                    </div>

                    <div className="settings-student-metrics" aria-label="学生数据指标">
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">上课</div>
                        <div className="settings-student-metric-value">
                          3<span className="settings-student-metric-unit">次</span>
                        </div>
                      </div>
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">评价</div>
                        <div className="settings-student-metric-value">
                          2<span className="settings-student-metric-unit">条</span>
                        </div>
                      </div>
                      <div className="settings-student-metric">
                        <div className="settings-student-metric-label">加入MentorX</div>
                        <div className="settings-student-metric-value">
                          {joinedMentorXDaysDisplay}<span className="settings-student-metric-unit">天</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="settings-student-reviews">
                    <div className="settings-student-reviews-divider" aria-hidden="true" />
                    <div className="settings-accordion-item">
                      <button
                        type="button"
                        className="settings-accordion-trigger"
                        aria-expanded={writtenReviewsExpanded}
                        aria-controls="settings-written-reviews"
                        onClick={() => setWrittenReviewsExpanded((prev) => !prev)}
                      >
                        <div className="settings-row-main">
                          <div className="settings-row-title settings-student-reviews-title">
                            <FiMessageSquare aria-hidden="true" focusable="false" strokeWidth={1.5} size={18} />
                            <span>我撰写的评价</span>
                          </div>
                          {!MOCK_WRITTEN_REVIEWS.length ? (
                            <div className="settings-row-value">暂无评价</div>
                          ) : null}
                        </div>
                        <span className="settings-accordion-icon" aria-hidden="true">
                          <FiChevronDown size={18} />
                        </span>
                      </button>
                      <div
                        id="settings-written-reviews"
                        className="settings-accordion-panel"
                        hidden={!writtenReviewsExpanded}
                      >
                        {MOCK_WRITTEN_REVIEWS.length ? (
                          <WrittenReviewsTable reviews={MOCK_WRITTEN_REVIEWS} />
                        ) : (
                          <div className="settings-orders-empty">暂无评价</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSectionId === 'mentorData' && (
                <div className="settings-data-section" aria-label="导师数据">
                  <section className="settings-mentor-card" aria-label="导师数据概览">
                    <div className="settings-mentor-card-left">
                      <div className="settings-mentor-avatar-wrap">
                        <button
                          type="button"
                          className={`settings-mentor-avatar-btn ${mentorAvatarUrl ? 'has-avatar' : ''}`}
                          aria-label="更换头像"
                          onClick={onPickMentorAvatar}
                        >
                          {mentorAvatarUrl ? (
                            <img className="settings-mentor-avatar-img" src={mentorAvatarUrl} alt="" />
                          ) : (
                            <img className="settings-mentor-avatar-img" src={defaultAvatar} alt="" />
                          )}
                        </button>
                        <svg className="settings-mentor-avatar-camera" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <circle cx="12" cy="12" r="12" fill="currentColor" />
                          <rect x="6" y="8" width="12" height="9" rx="2" ry="2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 8 L10.1 6.6 A1.8 1.8 0 0 1 11.6 5.8 H12.4 A1.8 1.8 0 0 1 13.9 6.6 L15 8" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12.5" r="3" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                        </svg>
                        <input
                          ref={mentorAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="settings-mentor-avatar-input"
                          onChange={onMentorAvatarChange}
                        />
                      </div>
                      <div className="settings-mentor-main">
                        <div className="settings-mentor-name">{mentorIdValue}</div>
                        <div className="settings-mentor-subtitle">{schoolValue !== '未提供' ? schoolValue : 'MentorX 导师'}</div>
                      </div>
                    </div>

                    <div className="settings-mentor-metrics" aria-label="导师数据指标">
                      <div className="settings-mentor-metric">
                        <div className="settings-mentor-metric-label">上课</div>
                        <div className="settings-mentor-metric-value">
                          3<span className="settings-mentor-metric-unit">次</span>
                        </div>
                      </div>
                      <div className="settings-mentor-metric">
                        <div className="settings-mentor-metric-label">被评价</div>
                        <div className="settings-mentor-metric-value">
                          2<span className="settings-mentor-metric-unit">条</span>
                        </div>
                      </div>
                      <div className="settings-mentor-metric">
                        <div className="settings-mentor-metric-label">加入MentorX</div>
                        <div className="settings-mentor-metric-value">
                          {mentorJoinedMentorXDaysDisplay}<span className="settings-mentor-metric-unit">天</span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeSectionId === 'security' && (
                <>
                  <div className={`settings-row ${editingPassword ? 'settings-row--overlay' : ''}`}>
                    <div className="settings-row-main">
                      <div className="settings-row-title">登录密码</div>
                      <div className={`settings-row-value ${editingPassword ? 'settings-row-value--interactive' : ''}`}>
                        {editingPassword ? (
                          <div className="settings-password-fields">
                            <input
                              type="password"
                              className="settings-password-input"
                              value={newPasswordDraft}
                              placeholder="新密码（至少6位）"
                              autoComplete="new-password"
                              onChange={(e) => setNewPasswordDraft(e.target.value)}
                            />
                            <input
                              type="password"
                              className="settings-password-input"
                              value={confirmPasswordDraft}
                              placeholder="确认新密码"
                              autoComplete="new-password"
                              onChange={(e) => setConfirmPasswordDraft(e.target.value)}
                            />
                            {passwordError && (
                              <div className="settings-inline-error" role="alert">{passwordError}</div>
                            )}
                          </div>
                        ) : (
                          '已设置'
                        )}
                      </div>
                    </div>
                    {editingPassword ? (
                      <div className="settings-row-actions">
                        <button type="button" className="settings-action" disabled={savingPassword} onClick={saveNewPassword}>
                          {savingPassword ? '保存中...' : '保存'}
                        </button>
                        <button type="button" className="settings-action" disabled={savingPassword} onClick={cancelPasswordEdit}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="settings-action" disabled={!isLoggedIn} onClick={startPasswordEdit}>
                        修改
                      </button>
                    )}
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">数据个性化</div>
                      <div className="settings-row-value">用于优化推荐内容</div>
                    </div>
                    <label className="settings-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                </>
              )}

              {activeSectionId === 'notifications' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">邮件通知</div>
                      <div className="settings-row-value">重要更新与课程提醒</div>
                    </div>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={emailNotificationsEnabled}
                        onChange={toggleEmailNotifications}
                        disabled={emailNotificationsDisabled}
                      />
                      <span className="settings-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                </>
              )}

              {activeSectionId === 'payments' && (
                <>
                  <div className="settings-accordion-item">
                    <button
                      type="button"
                      className="settings-accordion-trigger"
                      aria-expanded={paymentsExpanded}
                      aria-controls="settings-payments-history"
                      onClick={() => setPaymentsExpanded((prev) => !prev)}
                    >
                      <div className="settings-row-main">
                      <div className="settings-row-title">付款</div>
                      <div className="settings-row-value">
                          {MOCK_RECHARGE_RECORDS.length ? `充值记录（${MOCK_RECHARGE_RECORDS.length}）` : '暂无记录'}
                        </div>
                      </div>
                      <span className="settings-accordion-icon" aria-hidden="true">
                        <FiChevronDown size={18} />
                      </span>
                    </button>
                    <div
                      id="settings-payments-history"
                      className="settings-accordion-panel"
                      hidden={!paymentsExpanded}
                    >
                      {MOCK_RECHARGE_RECORDS.length ? (
                        <RechargeTable records={MOCK_RECHARGE_RECORDS} />
                      ) : (
                        <div className="settings-orders-empty">暂无充值记录</div>
                      )}
                    </div>
                  </div>

                  <div className="settings-accordion-item">
                    <button
                      type="button"
                      className="settings-accordion-trigger"
                      aria-expanded={receiptsExpanded}
                      aria-controls="settings-receipts-history"
                      onClick={() => setReceiptsExpanded((prev) => !prev)}
                    >
                      <div className="settings-row-main">
                      <div className="settings-row-title">收款</div>
                      <div className="settings-row-value">
                          {MOCK_INCOME_RECORDS.length ? `入账记录（${MOCK_INCOME_RECORDS.length}）` : '暂无记录'}
                        </div>
                      </div>
                      <span className="settings-accordion-icon" aria-hidden="true">
                        <FiChevronDown size={18} />
                      </span>
                    </button>
                    <div
                      id="settings-receipts-history"
                      className="settings-accordion-panel"
                      hidden={!receiptsExpanded}
                    >
                      {MOCK_INCOME_RECORDS.length ? (
                        <IncomeTable records={MOCK_INCOME_RECORDS} />
                      ) : (
                        <div className="settings-orders-empty">暂无入账记录</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeSectionId === 'language' && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">语言</div>
                      <div className="settings-row-value">简体中文</div>
                    </div>
                    <button type="button" className="settings-action">更改</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">时区</div>
                      <div className="settings-row-value">UTC+08:00</div>
                    </div>
                    <button type="button" className="settings-action">更改</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
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

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default AccountSettingsPage;
