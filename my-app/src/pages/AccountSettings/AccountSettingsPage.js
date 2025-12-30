import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAward,
  FiBell,
  FiBookOpen,
  FiCreditCard,
  FiGlobe,
  FiShield,
  FiUser,
} from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { fetchAccountProfile, saveHomeCourseOrder } from '../../api/account';
import api from '../../api/client';
import {
  broadcastHomeCourseOrderChanged,
  normalizeHomeCourseOrderIds,
} from '../../utils/homeCourseOrder';
import { getDefaultTimeZone, getZonedParts } from '../StudentCourseRequest/steps/timezoneUtils';
import ProfileSection from './sections/ProfileSection';
import StudentDataSection from './sections/StudentDataSection';
import MentorDataSection from './sections/MentorDataSection';
import SecuritySection from './sections/SecuritySection';
import NotificationsSection from './sections/NotificationsSection';
import PaymentsSection from './sections/PaymentsSection';
import LanguageSection, { DEFAULT_HOME_COURSE_ORDER_IDS } from './sections/LanguageSection';
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

function AccountSettingsPage({ mode = 'student' }) {
  const isMentorView = mode === 'mentor';
  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const toastTimerRef = useRef(null);
  const studentAvatarInputRef = useRef(null);
  const mentorAvatarInputRef = useRef(null);
  const studentAvatarUploadSeqRef = useRef(0);
  const mentorAvatarUploadSeqRef = useRef(0);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [studentAvatarUrl, setStudentAvatarUrl] = useState(null);
  const [mentorAvatarUrl, setMentorAvatarUrl] = useState(null);
  const [studentAvatarUploading, setStudentAvatarUploading] = useState(false);
  const [studentAvatarUploadError, setStudentAvatarUploadError] = useState('');
  const [mentorAvatarUploading, setMentorAvatarUploading] = useState(false);
  const [mentorAvatarUploadError, setMentorAvatarUploadError] = useState('');
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
  const [homeCourseOrderIds, setHomeCourseOrderIds] = useState(() => [...DEFAULT_HOME_COURSE_ORDER_IDS]);
  const [savingHomeCourseOrder, setSavingHomeCourseOrder] = useState(false);
  const [idsStatus, setIdsStatus] = useState('idle'); // idle | loading | loaded | error
  const [savingAccountProfile, setSavingAccountProfile] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [savingEmailNotifications, setSavingEmailNotifications] = useState(false);
  const [toast, setToast] = useState(null); // { id: number, kind: 'success' | 'error', message: string }

  const [activeSectionId, setActiveSectionId] = useState(SETTINGS_SECTIONS[0]?.id || 'profile');
  const [availabilityStatus, setAvailabilityStatus] = useState('idle'); // idle | loading | loaded | error
  const [availability, setAvailability] = useState(() => {
    let timeZone = 'Asia/Shanghai';
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone; } catch {}
    return { timeZone, sessionDurationHours: 2, daySelections: {} };
  });
  const [savingAvailability, setSavingAvailability] = useState(false);

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

  const showToast = (message, kind = 'success') => {
    const id = Date.now();
    setToast({ id, kind, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setIdsStatus('idle');
      setAccountProfile({ email: '', studentId: '', mentorId: '', degree: '', school: '', studentCreatedAt: null, mentorCreatedAt: null });
      setStudentAvatarUrl(null);
      setMentorAvatarUrl(null);
      setStudentAvatarUploading(false);
      setStudentAvatarUploadError('');
      setMentorAvatarUploading(false);
      setMentorAvatarUploadError('');
      setEmailNotificationsEnabled(false);
      setSavingEmailNotifications(false);
      setHomeCourseOrderIds([...DEFAULT_HOME_COURSE_ORDER_IDS]);
      setSavingHomeCourseOrder(false);
      setSavingAccountProfile(false);
      setAvailabilityStatus('idle');
      setAvailability(() => {
        let timeZone = 'Asia/Shanghai';
        try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone; } catch {}
        return { timeZone, sessionDurationHours: 2, daySelections: {} };
      });
      setSavingAvailability(false);
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
        const avatarUrl = typeof data.studentAvatarUrl === 'string' ? data.studentAvatarUrl.trim() : '';
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
        setHomeCourseOrderIds(
          normalizeHomeCourseOrderIds(
            Array.isArray(data.homeCourseOrderIds) ? data.homeCourseOrderIds : null,
            DEFAULT_HOME_COURSE_ORDER_IDS
          )
        );
        setIdsStatus('loaded');
        setEmailNotificationsEnabled(
          typeof data.emailNotificationsEnabled === 'boolean' ? data.emailNotificationsEnabled : false
        );
        setStudentAvatarUrl(avatarUrl || null);
      })
      .catch(() => {
        if (!alive) return;
        setHomeCourseOrderIds([...DEFAULT_HOME_COURSE_ORDER_IDS]);
        setIdsStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    const seq = mentorAvatarUploadSeqRef.current;

    api.get('/api/mentor/profile')
      .then((res) => {
        if (!alive) return;
        if (seq !== mentorAvatarUploadSeqRef.current) return;
        const avatarUrl = res?.data?.profile?.avatarUrl;
        if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
          setMentorAvatarUrl(avatarUrl);
        }
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    setAvailabilityStatus('loading');

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const data = res?.data?.availability;
        if (data && typeof data === 'object') {
          let fallbackTimeZone = 'Asia/Shanghai';
          try { fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || fallbackTimeZone; } catch {}
          const timeZone = typeof data.timeZone === 'string' && data.timeZone.trim() ? data.timeZone.trim() : fallbackTimeZone;
          const sessionDurationHours = typeof data.sessionDurationHours === 'number' ? data.sessionDurationHours : 2;
          const daySelections = data.daySelections && typeof data.daySelections === 'object' && !Array.isArray(data.daySelections)
            ? data.daySelections
            : {};
          setAvailability({ timeZone, sessionDurationHours, daySelections });
        }
        setAvailabilityStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setAvailabilityStatus('error');
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
  const availabilityDaysCount = useMemo(() => {
    const selections = availability?.daySelections;
    if (!selections || typeof selections !== 'object') return 0;

    const timeZone = typeof availability?.timeZone === 'string' && availability.timeZone.trim()
      ? availability.timeZone.trim()
      : getDefaultTimeZone();
    const todayParts = getZonedParts(timeZone, new Date());
    const todayKey = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`;

    return Object.keys(selections).filter((key) => {
      if (typeof key !== 'string' || key < todayKey) return false;
      const blocks = selections[key];
      return Array.isArray(blocks) && blocks.length > 0;
    }).length;
  }, [availability?.daySelections, availability?.timeZone]);
  const availabilitySummary = useMemo(() => {
    if (!isLoggedIn) return '请先登录';
    if (availabilityStatus === 'loading') return '加载中...';
    if (availabilityStatus === 'error') return '加载失败';
    if (!availabilityDaysCount) return '未设置';
    return `已设置 ${availabilityDaysCount} 天`;
  }, [availabilityDaysCount, availabilityStatus, isLoggedIn]);

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
    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      setShowStudentAuth(true);
      return;
    }
    if (studentAvatarInputRef.current) studentAvatarInputRef.current.click();
  };

  const onPickMentorAvatar = () => {
    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      setShowMentorAuth(true);
      return;
    }
    if (mentorAvatarInputRef.current) mentorAvatarInputRef.current.click();
  };

  const onStudentAvatarChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ''; } catch {}
    if (!file) return;

    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      setShowStudentAuth(true);
      return;
    }

    if (studentAvatarUploading) return;

    if (file.size > 5 * 1024 * 1024) {
      const msg = '头像文件需 ≤ 5MB';
      setStudentAvatarUploadError(msg);
      showToast(msg, 'error');
      return;
    }

    if (file.type && !String(file.type).toLowerCase().startsWith('image/')) {
      const msg = '请选择图片文件';
      setStudentAvatarUploadError(msg);
      showToast(msg, 'error');
      return;
    }

    const seq = ++studentAvatarUploadSeqRef.current;
    const prevUrl = studentAvatarUrl;

    const previewUrl = URL.createObjectURL(file);
    setStudentAvatarUrl(previewUrl);
    setStudentAvatarUploadError('');
    setStudentAvatarUploading(true);

    try {
      const signRes = await api.post('/api/oss/policy', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        scope: 'studentAvatar',
      });
      if (seq !== studentAvatarUploadSeqRef.current) return;

      const { host, key, policy, signature, accessKeyId, fileUrl } = signRes?.data || {};
      if (!host || !key || !policy || !signature || !accessKeyId || !fileUrl) {
        throw new Error('签名响应不完整');
      }

      const formData = new FormData();
      formData.append('key', key);
      formData.append('policy', policy);
      formData.append('OSSAccessKeyId', accessKeyId);
      formData.append('success_action_status', '200');
      formData.append('signature', signature);
      formData.append('file', file);

      const uploadRes = await fetch(host, { method: 'POST', body: formData });
      if (seq !== studentAvatarUploadSeqRef.current) return;
      if (!uploadRes.ok) throw new Error('上传失败');

      await api.put('/api/account/student-avatar', { avatarUrl: fileUrl });
      if (seq !== studentAvatarUploadSeqRef.current) return;

      setStudentAvatarUrl(fileUrl);
      showToast('头像已更新', 'success');
    } catch (err) {
      if (seq !== studentAvatarUploadSeqRef.current) return;
      let msg = err?.response?.data?.error || err?.message || '上传失败，请稍后再试';
      if (msg === 'Failed to fetch' || msg === 'NetworkError') {
        msg = '上传失败（请检查 OSS CORS 配置）';
      }
      setStudentAvatarUploadError(msg);
      setStudentAvatarUrl(prevUrl || null);
      showToast(msg, 'error');
    } finally {
      if (seq !== studentAvatarUploadSeqRef.current) return;
      setStudentAvatarUploading(false);
    }
  };

  const onMentorAvatarChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ''; } catch {}
    if (!file) return;

    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      setShowMentorAuth(true);
      return;
    }

    if (mentorAvatarUploading) return;

    if (file.size > 5 * 1024 * 1024) {
      const msg = '头像文件需 ≤ 5MB';
      setMentorAvatarUploadError(msg);
      showToast(msg, 'error');
      return;
    }

    if (file.type && !String(file.type).toLowerCase().startsWith('image/')) {
      const msg = '请选择图片文件';
      setMentorAvatarUploadError(msg);
      showToast(msg, 'error');
      return;
    }

    const seq = ++mentorAvatarUploadSeqRef.current;
    const prevUrl = mentorAvatarUrl;

    const previewUrl = URL.createObjectURL(file);
    setMentorAvatarUrl(previewUrl);
    setMentorAvatarUploadError('');
    setMentorAvatarUploading(true);

    try {
      const signRes = await api.post('/api/oss/policy', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (seq !== mentorAvatarUploadSeqRef.current) return;

      const { host, key, policy, signature, accessKeyId, fileUrl } = signRes?.data || {};
      if (!host || !key || !policy || !signature || !accessKeyId || !fileUrl) {
        throw new Error('签名响应不完整');
      }

      const formData = new FormData();
      formData.append('key', key);
      formData.append('policy', policy);
      formData.append('OSSAccessKeyId', accessKeyId);
      formData.append('success_action_status', '200');
      formData.append('signature', signature);
      formData.append('file', file);

      const uploadRes = await fetch(host, { method: 'POST', body: formData });
      if (seq !== mentorAvatarUploadSeqRef.current) return;
      if (!uploadRes.ok) throw new Error('上传失败');

      await api.put('/api/mentor/profile', { avatarUrl: fileUrl });
      if (seq !== mentorAvatarUploadSeqRef.current) return;

      setMentorAvatarUrl(fileUrl);
      showToast('头像已更新', 'success');
    } catch (err) {
      if (seq !== mentorAvatarUploadSeqRef.current) return;
      let msg = err?.response?.data?.error || err?.message || '上传失败，请稍后再试';
      if (msg === 'Failed to fetch' || msg === 'NetworkError') {
        msg = '上传失败（请检查 OSS CORS 配置）';
      }
      setMentorAvatarUploadError(msg);
      setMentorAvatarUrl(prevUrl || null);
      showToast(msg, 'error');
    } finally {
      if (seq !== mentorAvatarUploadSeqRef.current) return;
      setMentorAvatarUploading(false);
    }
  };

  useEffect(() => () => {
    try { if (studentAvatarUrl && studentAvatarUrl.startsWith('blob:')) URL.revokeObjectURL(studentAvatarUrl); } catch {}
  }, [studentAvatarUrl]);

  useEffect(() => () => {
    try { if (mentorAvatarUrl && mentorAvatarUrl.startsWith('blob:')) URL.revokeObjectURL(mentorAvatarUrl); } catch {}
  }, [mentorAvatarUrl]);

  useEffect(() => () => {
    studentAvatarUploadSeqRef.current += 1;
  }, []);

  useEffect(() => () => {
    mentorAvatarUploadSeqRef.current += 1;
  }, []);

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

  const persistAvailability = async (nextAvailability, { successMessage = '空余时间已保存' } = {}) => {
    if (savingAvailability) return false;
    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      return false;
    }

    const prev = availability;
    setAvailability(nextAvailability);
    setSavingAvailability(true);
    try {
      const res = await api.put('/api/account/availability', nextAvailability);
      const serverAvailability = res?.data?.availability || nextAvailability;
      const timeZone = typeof serverAvailability?.timeZone === 'string' ? serverAvailability.timeZone : (nextAvailability?.timeZone || prev.timeZone);
      const sessionDurationHours = typeof serverAvailability?.sessionDurationHours === 'number'
        ? serverAvailability.sessionDurationHours
        : (typeof nextAvailability?.sessionDurationHours === 'number' ? nextAvailability.sessionDurationHours : prev.sessionDurationHours);
      const daySelections = serverAvailability?.daySelections && typeof serverAvailability.daySelections === 'object' && !Array.isArray(serverAvailability.daySelections)
        ? serverAvailability.daySelections
        : (nextAvailability?.daySelections || prev.daySelections || {});
      setAvailability({ timeZone, sessionDurationHours, daySelections });
      setAvailabilityStatus('loaded');
      showToast(successMessage, 'success');
      return true;
    } catch (e) {
      setAvailability(prev);
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || '保存失败，请稍后再试';
      showToast(msg, 'error');
      return false;
    } finally {
      setSavingAvailability(false);
    }
  };

  const persistHomeCourseOrder = async (nextOrderIds, { successMessage = '首页课程顺序已保存' } = {}) => {
    if (savingHomeCourseOrder) return false;
    if (!isLoggedIn) {
      showToast('请先登录', 'error');
      return false;
    }

    const normalized = normalizeHomeCourseOrderIds(nextOrderIds, DEFAULT_HOME_COURSE_ORDER_IDS);
    const prev = homeCourseOrderIds;
    setHomeCourseOrderIds(normalized);
    setSavingHomeCourseOrder(true);

    try {
      const res = await saveHomeCourseOrder(normalized);
      const serverOrderIds = Array.isArray(res?.data?.orderIds) ? res.data.orderIds : normalized;
      const finalOrder = normalizeHomeCourseOrderIds(serverOrderIds, DEFAULT_HOME_COURSE_ORDER_IDS);
      setHomeCourseOrderIds(finalOrder);
      broadcastHomeCourseOrderChanged({ email: accountProfile.email, orderIds: finalOrder });
      showToast(successMessage, 'success');
      return true;
    } catch (e) {
      setHomeCourseOrderIds(prev);
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || '保存失败，请稍后再试';
      showToast(msg, 'error');
      return false;
    } finally {
      setSavingHomeCourseOrder(false);
    }
  };

  const resetHomeCourseOrder = () => {
    persistHomeCourseOrder([...DEFAULT_HOME_COURSE_ORDER_IDS], { successMessage: '已恢复默认顺序' });
  };

  const homeCourseOrderDisabled = !isLoggedIn || idsStatus === 'loading' || savingHomeCourseOrder;

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
                <ProfileSection
                  studentIdValue={studentIdValue}
                  mentorIdValue={mentorIdValue}
                  emailValue={emailValue}
                  degreeValue={degreeValue}
                  schoolValue={schoolValue}
                  canEditEducationProfile={canEditEducationProfile}
                  savingAccountProfile={savingAccountProfile}
                  accountProfile={accountProfile}
                  onSaveAccountProfilePatch={saveAccountProfilePatch}
                  availability={availability}
                  availabilityStatus={availabilityStatus}
                  savingAvailability={savingAvailability}
                  availabilitySummary={availabilitySummary}
                  isLoggedIn={isLoggedIn}
                  onAvailabilityChange={setAvailability}
                  onPersistAvailability={persistAvailability}
                />
              )}

              {activeSectionId === 'studentData' && (
                <StudentDataSection
                  studentAvatarUrl={studentAvatarUrl}
                  studentAvatarUploading={studentAvatarUploading}
                  studentAvatarUploadError={studentAvatarUploadError}
                  onPickStudentAvatar={onPickStudentAvatar}
                  studentAvatarInputRef={studentAvatarInputRef}
                  onStudentAvatarChange={onStudentAvatarChange}
                  studentAvatarInitial={studentAvatarInitial}
                  studentIdValue={studentIdValue}
                  schoolValue={schoolValue}
                  joinedMentorXDaysDisplay={joinedMentorXDaysDisplay}
                />
              )}

              {activeSectionId === 'mentorData' && (
                <MentorDataSection
                  mentorAvatarUrl={mentorAvatarUrl}
                  mentorAvatarUploading={mentorAvatarUploading}
                  mentorAvatarUploadError={mentorAvatarUploadError}
                  onPickMentorAvatar={onPickMentorAvatar}
                  mentorAvatarInputRef={mentorAvatarInputRef}
                  onMentorAvatarChange={onMentorAvatarChange}
                  mentorIdValue={mentorIdValue}
                  schoolValue={schoolValue}
                  mentorJoinedMentorXDaysDisplay={mentorJoinedMentorXDaysDisplay}
                />
              )}

              {activeSectionId === 'security' && (
                <SecuritySection isLoggedIn={isLoggedIn} onShowToast={showToast} />
              )}

              {activeSectionId === 'notifications' && (
                <NotificationsSection
                  emailNotificationsEnabled={emailNotificationsEnabled}
                  emailNotificationsDisabled={emailNotificationsDisabled}
                  onToggleEmailNotifications={toggleEmailNotifications}
                />
              )}

              {activeSectionId === 'payments' && <PaymentsSection />}

              {activeSectionId === 'language' && (
                <LanguageSection
                  homeCourseOrderIds={homeCourseOrderIds}
                  homeCourseOrderDisabled={homeCourseOrderDisabled}
                  onChangeHomeCourseOrder={persistHomeCourseOrder}
                  onResetHomeCourseOrder={resetHomeCourseOrder}
                />
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
