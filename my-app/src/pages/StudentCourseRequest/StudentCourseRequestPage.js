import React, { useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import { FaFileAlt, FaGlobe, FaClock, FaCalendarAlt, FaHeart, FaLightbulb, FaGraduationCap, FaTasks } from 'react-icons/fa';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP, COURSE_TYPE_OPTIONS } from '../../constants/courseMappings';
import { fetchAccountProfile } from '../../api/account';
import api from '../../api/client';
import DirectionStep from './steps/DirectionStep';
import DetailsStep from './steps/DetailsStep';
import UploadStep from './steps/UploadStep';
import { ScheduleStepContent, ScheduleStepSidebar } from './steps/ScheduleStep';
import { INITIAL_FORM_STATE, PAGE_TRANSITION_DURATION, PREVIEW_FREEZE_OFFSET, STEPS, generateMockStudentProfile } from './steps/pageConstants';
import {
  DEFAULT_TIME_ZONE,
  buildDateFromTimeZoneNow,
  buildShortUTC,
  buildTimeZoneOptions,
  convertRangeKeysBetweenTimeZones,
  convertSelectionsBetweenTimeZones,
  getZonedParts,
  keyFromParts,
  extractCityName,
  keyToDate,
  orderTimeZoneOptionsAroundSelected,
  shiftDayKeyForTimezone,
} from './steps/timezoneUtils';

// 懒加载 dotlottie React 播放器

const DotLottiePlayer = lazy(async () => {                                     // 懒加载定义
  const mod = await import('@dotlottie/react-player');                         // 动态引入包
  const Cmp =
    // ① 常见：命名导出 Player
    mod?.Player
    // ② 有些版本：默认导出就是组件
    || mod?.default
    // ③ 少数版本：默认导出是对象，其中的 Player 才是组件
    || mod?.default?.Player
    // ④ 极少版本：导出名叫 DotLottiePlayer
    || mod?.DotLottiePlayer;

  if (!Cmp) {                                                                  // 若仍未命中
    // 给出更明确的提示，方便你 ctrl+点击 node_modules 查看 package.json 的 "exports"
    throw new Error('[dotlottie] no found（Tries Player/default/default.Player/DotLottiePlayer）');
  }
  return { default: Cmp };                                                     // 映射为 lazy 需要的 default
});

const toNoonDate = (dateLike) => {
  if (!dateLike) return dateLike;
  const d = new Date(dateLike);
  d.setHours(12, 0, 0, 0);
  return d;
};

const QUARTER_HOUR_MS = 15 * 60 * 1000;

const ATTACHMENT_ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.zip';
const ALLOWED_ATTACHMENT_EXTS = new Set(
  ATTACHMENT_ACCEPT.split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)
);

const getFileExt = (fileName) => {
  if (!fileName) return '';
  const idx = String(fileName).lastIndexOf('.');
  if (idx < 0) return '';
  return String(fileName).slice(idx + 1).toLowerCase();
};

const isAllowedAttachmentFile = (file) => {
  const ext = getFileExt(file?.name);
  return !!ext && ALLOWED_ATTACHMENT_EXTS.has(ext);
};

const normalizeAccountAvailability = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const timeZone = typeof raw.timeZone === 'string' && raw.timeZone.trim() ? raw.timeZone.trim() : DEFAULT_TIME_ZONE;
  const sessionDurationHours = typeof raw.sessionDurationHours === 'number' ? raw.sessionDurationHours : 2;
  const daySelections = raw.daySelections && typeof raw.daySelections === 'object' && !Array.isArray(raw.daySelections)
    ? raw.daySelections
    : {};
  return { timeZone, sessionDurationHours, daySelections };
};

const buildAvailabilityFingerprint = ({ timeZone, sessionDurationHours, daySelections }) => {
  const tz = typeof timeZone === 'string' ? timeZone : '';
  const dur = Number.isFinite(sessionDurationHours) ? Number(sessionDurationHours).toFixed(2) : '';
  const selections = daySelections && typeof daySelections === 'object' ? daySelections : {};
  const keys = Object.keys(selections).sort();
  const parts = [];
  for (const key of keys) {
    const blocks = selections[key];
    if (!Array.isArray(blocks) || blocks.length === 0) continue;
    const blockStr = blocks
      .map((b) => `${Math.floor(Number(b?.start) || 0)}-${Math.floor(Number(b?.end) || 0)}`)
      .join(',');
    parts.push(`${key}:${blockStr}`);
  }
  return `${tz}|${dur}|${parts.join('|')}`;
};



function StudentCourseRequestPage() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [accountProfileStatus, setAccountProfileStatus] = useState('idle'); // idle | loading | loaded | error
  const [accountProfile, setAccountProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      const role = user?.role;
      const publicId = user?.public_id;
      return {
        studentId: role === 'student' && typeof publicId === 'string' ? publicId : '',
        degree: '',
        school: '',
      };
    } catch {
      return { studentId: '', degree: '', school: '' };
    }
  });
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDirectionSelection, setIsDirectionSelection] = useState(false);
  const [isCourseTypeSelection, setIsCourseTypeSelection] = useState(false);
  const [transitionStage, setTransitionStage] = useState('idle');
  const pendingActionRef = useRef(null);
  const isMountedRef = useRef(true);
  const [uploadValidationMessage, setUploadValidationMessage] = useState('');
  const selectedTimeZone = formData.availability || DEFAULT_TIME_ZONE;
  const previousTimeZoneRef = useRef(selectedTimeZone);

  // Sync schedule availability with Account Settings (/api/account/availability)
  const [pendingAccountAvailability, setPendingAccountAvailability] = useState(null);
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const availabilityHydratingRef = useRef(false);
  const hasEditedAvailabilityRef = useRef(false);
  const availabilitySaveTimerRef = useRef(null);
  const lastSavedAvailabilityFingerprintRef = useRef('');

  // Stable mock profile for preview (when student info is missing)
  const mockStudent = useMemo(() => generateMockStudentProfile(), []);

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

  useEffect(() => {
    setAvailabilityReady(false);
    setPendingAccountAvailability(null);
    availabilityHydratingRef.current = false;

    if (!isLoggedIn) {
      lastSavedAvailabilityFingerprintRef.current = '';
      return undefined;
    }

    let alive = true;
    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const normalized = normalizeAccountAvailability(res?.data?.availability);
        if (normalized) {
          lastSavedAvailabilityFingerprintRef.current = buildAvailabilityFingerprint(normalized);
          if (!hasEditedAvailabilityRef.current) {
            availabilityHydratingRef.current = true;
            setPendingAccountAvailability(normalized);
            setFormData((prev) => ({
              ...prev,
              availability: normalized.timeZone,
              sessionDurationHours: normalized.sessionDurationHours,
            }));
          }
        }
        if (!normalized || hasEditedAvailabilityRef.current) {
          setAvailabilityReady(true);
        }
      })
      .catch(() => {
        if (!alive) return;
        setAvailabilityReady(true);
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setAccountProfileStatus('idle');
      setAccountProfile({ studentId: '', degree: '', school: '' });
      return;
    }

    let alive = true;
    setAccountProfileStatus('loading');
    fetchAccountProfile()
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        setAccountProfile({
          studentId: typeof data.studentId === 'string' ? data.studentId : '',
          degree: typeof data.degree === 'string' ? data.degree : '',
          school: typeof data.school === 'string' ? data.school : '',
        });
        setAccountProfileStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setAccountProfileStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  // ----- Schedule step local states -----
  const [selectedDate, setSelectedDate] = useState(() => toNoonDate(buildDateFromTimeZoneNow(DEFAULT_TIME_ZONE)));
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = buildDateFromTimeZoneNow(DEFAULT_TIME_ZONE);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const setSelectedDateNoon = useCallback((date) => {
    setSelectedDate(date ? toNoonDate(date) : date);
  }, []);
  const timesListRef = useRef(null);
  const defaultTimesScrollDoneRef = useRef(false);
  // 每天对应的已选时间段集合（按索引区间存储）
  const [daySelections, setDaySelections] = useState({}); // key: 'YYYY-MM-DD' -> [{start,end}]
  const getBlocksForDay = useCallback((key) => daySelections[key] || [], [daySelections]);
  const setBlocksForDay = useCallback((key, next) => {
    setDaySelections((prev) => ({ ...prev, [key]: next }));
  }, []);

  // Drag-to-select range across dates
  const [selectedRangeKeys, setSelectedRangeKeys] = useState([]);
  const [dragStartKey, setDragStartKey] = useState(null);
  const [dragEndKey, setDragEndKey] = useState(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [dragPreviewKeys, setDragPreviewKeys] = useState(new Set());
  const didDragRef = useRef(false);

  // Upload step states
  const fileInputRef = useRef(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const buildKey = useCallback((d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,[/*no deps*/]);
  const keyToDateStrict = useCallback((key) => {
    if (!key) return null;
    const [y,m,d] = key.split('-').map((s)=>parseInt(s,10));
    if (!y||!m||!d) return null;
    return new Date(y, m-1, d);
  }, []);



  // Start-of-today reference for past/future checks
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    let timeoutId = null;
    let intervalId = null;

    const scheduleQuarterHourTick = () => {
      const now = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      const nextQuarterMinute = Math.floor(next.getMinutes() / 15) * 15 + 15;
      next.setMinutes(nextQuarterMinute);
      const msUntilNextQuarter = Math.max(0, next.getTime() - now.getTime());

      timeoutId = setTimeout(() => {
        setNowTick(Date.now());
        intervalId = setInterval(() => setNowTick(Date.now()), QUARTER_HOUR_MS);
      }, msUntilNextQuarter);
    };

    scheduleQuarterHourTick();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setNowTick(Date.now());
  }, [selectedTimeZone]);

  const zonedNow = useMemo(() => getZonedParts(selectedTimeZone, new Date(nowTick)), [selectedTimeZone, nowTick]);
  const tzToday = useMemo(() => {
    if (!zonedNow?.year || !zonedNow?.month || !zonedNow?.day) {
      return toNoonDate(buildDateFromTimeZoneNow(selectedTimeZone));
    }
    return toNoonDate(new Date(zonedNow.year, zonedNow.month - 1, zonedNow.day));
  }, [selectedTimeZone, zonedNow?.day, zonedNow?.month, zonedNow?.year]);
  const zonedTodayKey = useMemo(() => {
    if (!zonedNow?.year || !zonedNow?.month || !zonedNow?.day) return '';
    return keyFromParts(zonedNow.year, zonedNow.month, zonedNow.day);
  }, [zonedNow?.day, zonedNow?.month, zonedNow?.year]);
  const zonedNowMinutes = useMemo(() => {
    const h = Number.isFinite(zonedNow.hour) ? zonedNow.hour : 0;
    const m = Number.isFinite(zonedNow.minute) ? zonedNow.minute : 0;
    const s = Number.isFinite(zonedNow.second) ? zonedNow.second : 0;
    // If秒针已走起，向上取整到下一分钟，避免“当前格子”仍可点
    const total = h * 60 + m + (s > 0 ? 1 : 0);
    return Math.max(0, Math.min(1439, total)); // clamp to [0, 1439]
  }, [zonedNow?.hour, zonedNow?.minute, zonedNow?.second]);
  const todayStart = useMemo(() => {
    const t = new Date(tzToday.getFullYear(), tzToday.getMonth(), tzToday.getDate());
    t.setHours(0, 0, 0, 0);
    return t;
  }, [tzToday]);


  
  const enumerateKeysInclusive = useCallback((aKey, bKey) => {
    const a = keyToDateStrict(aKey);
    const b = keyToDateStrict(bKey);
    if (!a || !b) return [];
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    const res = [];
    const cur = new Date(start);
    cur.setHours(0,0,0,0);
    const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    while (cur.getTime() <= endTs) {
      const t = new Date(cur);
      const isPast = (() => { const dd = new Date(t); dd.setHours(0,0,0,0); return dd.getTime() < todayStart.getTime(); })();
      if (!isPast) res.push(buildKey(t));
      cur.setDate(cur.getDate()+1);
    }
    return res;
  }, [buildKey, keyToDateStrict, todayStart]);

  const endDragSelection = useCallback(() => {
    if (!isDraggingRange || !dragStartKey || !dragEndKey) {
      setIsDraggingRange(false);
      setDragPreviewKeys(new Set());
      return;
    }
    const keys = enumerateKeysInclusive(dragStartKey, dragEndKey);
    setSelectedRangeKeys(keys);
    const endDate = keyToDateStrict(dragEndKey);
    if (endDate) setSelectedDateNoon(endDate);
    setIsDraggingRange(false);
    setDragPreviewKeys(new Set());
  }, [dragEndKey, dragStartKey, enumerateKeysInclusive, isDraggingRange, keyToDateStrict, setSelectedDateNoon]);

  useEffect(() => {
    const onUp = () => {
      if (isDraggingRange) {
        endDragSelection();
        didDragRef.current = true;
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [endDragSelection, isDraggingRange]);

  // 时区切换时，同步选中的日期与时间段到新时区的日历上
  useEffect(() => {
    const prevTz = previousTimeZoneRef.current || DEFAULT_TIME_ZONE;
    const nextTz = selectedTimeZone || DEFAULT_TIME_ZONE;
    if (prevTz === nextTz) return;

    const nextTzToday = toNoonDate(buildDateFromTimeZoneNow(nextTz));
    const nextTodayKey = nextTzToday ? buildKey(nextTzToday) : '';
    const nextTodayStart = new Date(nextTzToday.getFullYear(), nextTzToday.getMonth(), nextTzToday.getDate());
    nextTodayStart.setHours(0, 0, 0, 0);

    setDaySelections((prev) => convertSelectionsBetweenTimeZones(prev, prevTz, nextTz));

    const prevSelectedKey = selectedDate ? buildKey(selectedDate) : null;
    const shiftedSelectedKey = prevSelectedKey ? shiftDayKeyForTimezone(prevSelectedKey, prevTz, nextTz) : null;
    let nextSelectedKey = shiftedSelectedKey || nextTodayKey;
    let nextSelectedDate = nextSelectedKey ? (toNoonDate(keyToDate(nextSelectedKey)) || nextTzToday) : nextTzToday;
    // 如果切换时区后，之前选的日期已经落在该时区的“今天”之前，则自动跳到新时区的今天，避免整天被当作过去而全灰
    if (nextSelectedDate && nextSelectedDate.getTime() < nextTodayStart.getTime()) {
      nextSelectedDate = nextTzToday;
      nextSelectedKey = nextTodayKey;
    }
    const nextViewMonth = new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1);

    setSelectedDateNoon(nextSelectedDate);
    setViewMonth(nextViewMonth);
    setSelectedRangeKeys((prev) => {
      const converted = convertRangeKeysBetweenTimeZones(prev, prevTz, nextTz);
      const nonPastKeys = (converted || []).filter((k) => k && (!nextTodayKey || k >= nextTodayKey));

      // 单日选中时：保持 rangeKeys 与 selectedDate 同步，避免出现“昨天/今天同时黑”的视觉问题
      const isSingleSelection = !Array.isArray(prev) || prev.length <= 1;
      if (isSingleSelection) {
        return nextSelectedKey ? [nextSelectedKey] : [];
      }

      // 多日选中：剔除已过期的日期；若全部过期则回到选中日（一般是今天）
      if (!nonPastKeys.length) {
        return nextSelectedKey ? [nextSelectedKey] : [];
      }
      if (nextSelectedKey && !nonPastKeys.includes(nextSelectedKey)) {
        return [nextSelectedKey, ...nonPastKeys];
      }
      return nonPastKeys;
    });
    setDragStartKey(null);
    setDragEndKey(null);
    setDragPreviewKeys(new Set());
    setIsDraggingRange(false);

    previousTimeZoneRef.current = nextTz;
  }, [buildKey, selectedTimeZone, selectedDate, setSelectedDateNoon]);

  // Apply fetched account availability after timezone-switch effect runs (avoid double conversion).
  useEffect(() => {
    if (!pendingAccountAvailability) return;
    if (selectedTimeZone !== pendingAccountAvailability.timeZone) return;

    setDaySelections(pendingAccountAvailability.daySelections || {});
    availabilityHydratingRef.current = false;
    setPendingAccountAvailability(null);
    setAvailabilityReady(true);
  }, [pendingAccountAvailability, selectedTimeZone]);

  // 月份滑动方向：'left' 表示点“下一月”，新网格从右往中滑入；'right' 表示点“上一月”
  const [monthSlideDir, setMonthSlideDir] = useState(null); // 初始为 null，表示无动画方向

  // 每次切月自增 key，强制重挂载 calendar-grid 以触发入场动画
  const [monthSlideKey, setMonthSlideKey] = useState(0);    // 初始为 0
  
  useEffect(() => () => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;   // 卸载时再关掉
    };
  }, []);

  useEffect(() => {
    // 首次进入页面时走一次进入动画
    setTransitionStage('entering');
  }, []);
  
  useEffect(() => {
    if (transitionStage === 'exiting') {
      const timeout = setTimeout(() => {
        const action = pendingActionRef.current;
        if (action) {
          action();
        }
        pendingActionRef.current = null;
        if (!isMountedRef.current) {
          return;
        }
        setTransitionStage('entering');
      }, PAGE_TRANSITION_DURATION);
      return () => clearTimeout(timeout);
    }

    if (transitionStage === 'entering') {
      const timeout = setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }
        setTransitionStage('idle');
      }, PAGE_TRANSITION_DURATION);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [transitionStage]);

  const currentStep = useMemo(() => STEPS[currentStepIndex], [currentStepIndex]);
  // Ordered options based on current selection
  const orderedTimeZoneOptions = useMemo(() => {
    const referenceDate = new Date();
    // Build fresh labels for consistency with any future date logic
    const base = buildTimeZoneOptions(referenceDate);
    return orderTimeZoneOptionsAroundSelected(base, formData.availability, referenceDate);
  }, [formData.availability]);

  const isDirectionStep = currentStep.id === 'direction';  const isDetailsStep = currentStep.id === 'details';
  const isScheduleStep = currentStep.id === 'schedule';
  const isUploadStep = currentStep.id === 'upload';

  const isDirectionSelectionStage = isDirectionStep && isDirectionSelection;

  // Debounced auto-save when user edits availability on schedule step.
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    if (!availabilityReady) return undefined;
    if (!isScheduleStep) return undefined;
    if (availabilityHydratingRef.current) return undefined;
    if (!hasEditedAvailabilityRef.current) return undefined;

    const payload = {
      timeZone: selectedTimeZone || DEFAULT_TIME_ZONE,
      sessionDurationHours: formData.sessionDurationHours,
      daySelections,
    };
    const fingerprint = buildAvailabilityFingerprint(payload);
    if (fingerprint === lastSavedAvailabilityFingerprintRef.current) return undefined;

    if (availabilitySaveTimerRef.current) clearTimeout(availabilitySaveTimerRef.current);
    availabilitySaveTimerRef.current = setTimeout(() => {
      api.put('/api/account/availability', payload)
        .then(() => {
          lastSavedAvailabilityFingerprintRef.current = fingerprint;
        })
        .catch(() => {
          // Keep silent: schedule step has no explicit "save" UX.
        });
    }, 600);

    return () => {
      if (availabilitySaveTimerRef.current) clearTimeout(availabilitySaveTimerRef.current);
    };
  }, [availabilityReady, daySelections, formData.sessionDurationHours, isLoggedIn, isScheduleStep, selectedTimeZone]);

  const flushAvailabilitySave = useCallback(() => {
    if (!isLoggedIn) return;
    if (!availabilityReady) return;
    if (availabilityHydratingRef.current) return;
    if (!hasEditedAvailabilityRef.current) return;

    if (availabilitySaveTimerRef.current) {
      clearTimeout(availabilitySaveTimerRef.current);
      availabilitySaveTimerRef.current = null;
    }

    const payload = {
      timeZone: selectedTimeZone || DEFAULT_TIME_ZONE,
      sessionDurationHours: formData.sessionDurationHours,
      daySelections,
    };
    const fingerprint = buildAvailabilityFingerprint(payload);
    if (fingerprint === lastSavedAvailabilityFingerprintRef.current) return;

    api.put('/api/account/availability', payload)
      .then(() => {
        lastSavedAvailabilityFingerprintRef.current = fingerprint;
      })
      .catch(() => {
        // Silent fail.
      });
  }, [availabilityReady, daySelections, formData.sessionDurationHours, isLoggedIn, selectedTimeZone]);

  useEffect(() => () => {
    if (availabilitySaveTimerRef.current) clearTimeout(availabilitySaveTimerRef.current);
  }, []);
  
  const startPageTransition = (action) => {
    if (typeof action !== 'function') {
      return;
    }
    if (transitionStage !== 'idle') {
      return;
    }
    pendingActionRef.current = action;
    setTransitionStage('exiting');
  };

  const handleChange = (field) => (event) => {
    setFormData((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  // ----- Upload handlers -----
  const handleAddFiles = (filesLike) => {
    const list = Array.from(filesLike || []);
    if (!list.length) return;
    const accepted = list.filter(isAllowedAttachmentFile);
    const rejected = list.filter((f) => !isAllowedAttachmentFile(f));

    if (rejected.length) {
      const names = rejected
        .map((f) => f?.name)
        .filter(Boolean)
        .slice(0, 3)
        .join('、');
      const suffix = rejected.length > 3 ? ' 等' : '';
      setUploadValidationMessage(`不支持的文件：${names}${suffix}（仅支持 ${ATTACHMENT_ACCEPT}）`);
    } else {
      setUploadValidationMessage('');
    }

    if (!accepted.length) return;
    setFormData((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), ...accepted],
    }));
  };

  const handleFileInputChange = (e) => {
    handleAddFiles(e.target.files);
    // reset input so selecting the same file again still triggers change
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
    if (e.dataTransfer && e.dataTransfer.files) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (index) => {
    setFormData((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, i) => i !== index),
    }));
  };
  const handleClearAttachments = () => {
    setFormData((prev) => ({ ...prev, attachments: [] }));
    setUploadValidationMessage('');
  };

  const handleNext = () => {
    startPageTransition(() => {
      if (currentStep.id === 'schedule') {
        flushAvailabilitySave();
      }
      if (currentStep.id === 'direction') {
        // 进入方向选择阶段时，默认选中第一个选项
        if (!isDirectionSelection) {
          setIsDirectionSelection(true);
          if (!formData.courseDirection && DIRECTION_OPTIONS.length > 0) {
            const first = DIRECTION_OPTIONS[0];
            setFormData((previous) => ({
              ...previous,
              courseDirection: first.id,
              learningGoal: first.label,
            }));
          }
          return;
        }
        // 已在选择界面则直接继续
        // 第二次：进入“课程类型”选择界面
        if (!isCourseTypeSelection) {
          setIsCourseTypeSelection(true);
          // 多选模式：不再默认选中任意类型
          return; // 仍停留在 direction 步骤
        }
      // 两个子阶段都完成后才进入下一个大步骤
      }

      if (currentStepIndex === STEPS.length - 1) {
        setIsCompleted(true);
        return;
      }
      setCurrentStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    });
  };

  const handleBack = () => {
    startPageTransition(() => {
      if (currentStep.id === 'direction' && isDirectionSelection && isCourseTypeSelection) {
        setIsCourseTypeSelection(false);
        return;
      }
      if (currentStep.id === 'direction' && isDirectionSelection) {
        setIsDirectionSelection(false);
        return;
      }

      if (currentStepIndex === 0) {
        navigate('/student');
        return;
      }

      if (currentStep.id === 'details' ) {
        setIsDirectionSelection(true);
        setIsCourseTypeSelection(true);
      }
      setCurrentStepIndex((index) => Math.max(index - 1, 0));
    });
  };

  const transitionClassName =
    transitionStage === 'exiting'
      ? 'page-transition-exit'
      : transitionStage === 'entering'
        ? 'page-transition-enter'
        : '';

  const stepLayoutClassName = [
    'step-layout',
    isDirectionSelectionStage ? 'direction-selection-layout' : '',
    isUploadStep ? 'contact-preview-layout' : '',
    transitionClassName,
  ]
    .filter(Boolean)
    .join(' ');
  
  // --- Freeze the preview card's initial top position (desktop) ---
  const previewRef = useRef(null);
  const [frozenTop, setFrozenTop] = useState(null);

  
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = previewRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 视口中心位置 - 卡片半高 = 居中的 top，再加一个可调偏移量(负数=上移)
      const desiredTop =
        window.scrollY + (window.innerHeight - rect.height) / 2 + PREVIEW_FREEZE_OFFSET;
      setFrozenTop(Math.max(0, Math.round(desiredTop)));
    });
   return () => cancelAnimationFrame(id);
  }, []);

  const stepContentClassName = [
    'step-content',
    (isDirectionStep || isDetailsStep) ? 'direction-layout' : '',
    isDirectionSelectionStage ? 'direction-selection' : '',
    isScheduleStep ? 'schedule-content' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const stepFooterClassName = ['step-footer', transitionClassName].filter(Boolean).join(' ');

  const units = currentStepIndex === 0 ? (isDirectionSelection ? (isCourseTypeSelection ? 1 : 0.5) : 0) : currentStepIndex + 1;
  const progress = (units / STEPS.length) * 100;
  //const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  // ---- Data for contact-step preview card ----
  const profileIsLoading = isLoggedIn && accountProfileStatus === 'loading';
  const profileLoadFailed = isLoggedIn && accountProfileStatus === 'error';
  const previewStudentId = isLoggedIn
    ? (accountProfile.studentId || (profileIsLoading ? '加载中...' : (profileLoadFailed ? '加载失败' : '未设置StudentID')))
    : mockStudent.name;
  const previewDegree = isLoggedIn
    ? (accountProfile.degree || (profileIsLoading ? '加载中...' : (profileLoadFailed ? '加载失败' : '未填写学历')))
    : mockStudent.level;
  const previewSchoolRaw = isLoggedIn
    ? (typeof accountProfile.school === 'string' ? accountProfile.school : '')
    : mockStudent.school;
  const previewSchool = (previewSchoolRaw || '').trim();
  const previewAvatarInitial = (accountProfile.studentId || mockStudent.name || 'S').slice(0, 1).toUpperCase();
  const previewDirectionLabel = useMemo(() => {
    const found = DIRECTION_OPTIONS.find((o) => o.id === formData.courseDirection);
    return found?.label || formData.learningGoal || '未选择方向';
  }, [formData.courseDirection, formData.learningGoal]);
  // Selected course type(s) label for preview
  const previewCourseTypeLabel = useMemo(() => {
    const ids = Array.isArray(formData.courseTypes)
      ? formData.courseTypes
      : (formData.courseType ? [formData.courseType] : []);
    const labels = ids
      .map((id) => COURSE_TYPE_OPTIONS.find((o) => o.id === id)?.label)
      .filter(Boolean);
    return labels.join('、');
  }, [formData.courseTypes, formData.courseType]);
  const earliestSelectedDay = useMemo(() => {
    const keys = Object.keys(daySelections || {}).filter((k) => (daySelections[k] || []).length > 0);
    if (!keys.length) return null;
    return keys.sort()[0];
  }, [daySelections]);
  const tzCity = useMemo(() => extractCityName(formData.availability), [formData.availability]);
  const tzShort = useMemo(() => buildShortUTC(formData.availability), [formData.availability]);
  // 仅当“预计课程总时长”有填时才在预览卡展示
  const hasTotalCourseHours = (formData.totalCourseHours !== '' && formData.totalCourseHours != null);
  const previewTotalCourseHours = hasTotalCourseHours ? Number(formData.totalCourseHours) : null;

  // ----- Schedule helpers -----
  const zhDays = ['日', '一', '二', '三', '四', '五', '六'];

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
    return fmt.format(viewMonth);
  }, [viewMonth]);

  const buildCalendarGrid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startIdx = first.getDay(); // 0=Sun
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

    const cells = [];
    for (let i = startIdx - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, dayNum);
      cells.push({ date, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), outside: false });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last);
      next.setDate(last.getDate() + 1);
      cells.push({ date: next, outside: true });
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last);
      next.setDate(last.getDate() + 1);
      cells.push({ date: next, outside: next.getMonth() !== viewMonth.getMonth() });
    }
    return cells;
  }, [viewMonth]);

  const isSameDay = (a, b) => (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );

  // 规范化日期 key（不含时区偏移影响）
  const ymdKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;



  // 点“上一月”按钮时触发
  const handlePrevMonth = () => {                                        // 定义上一月处理函数
    setMonthSlideDir('right');                                            // 设置动画方向为从左滑入（上一月）
    setMonthSlideKey((k) => k + 1);                                       // 自增 key 触发动画
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));  // 视图月份减一
  };
  // 点“下一月”按钮时触发
  const handleNextMonth = () => {                                        // 定义下一月处理函数
    setMonthSlideDir('left');                                            // 设置动画方向为从右滑入（下一月）
    setMonthSlideKey((k) => k + 1);                                      // 自增 key 触发动画
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)); // 视图月份加一
  };

  

  // ✅ 用这个替换你现在的“默认滚动到 09:00”的 useEffect
  useEffect(() => {
    // 只在日程页 & 过场动画结束(transitionStage === 'idle')时执行一次
    if (currentStep.id !== 'schedule' || transitionStage !== 'idle') return;
    if (defaultTimesScrollDoneRef.current) return;
  
    const listEl = timesListRef.current;
    if (!listEl) return;
  
    const targetEl = listEl.querySelector('[data-time-slot="09:00"]');
    if (!targetEl) return;
  
    const apply = () => {
      try {
        // 不要用 smooth，这里要“硬定位”
        listEl.scrollTop = targetEl.offsetTop;
      } catch {}
    };
  
    // 等一帧 -> 设一次 -> 再等一帧 -> 再设一次 -> 再兜底一次
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        setTimeout(apply, 0);
      });
    });
  
    defaultTimesScrollDoneRef.current = true;
  }, [currentStep.id, transitionStage]);





  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'direction':
        return (
          <DirectionStep
            isDirectionSelection={isDirectionSelection}
            isCourseTypeSelection={isCourseTypeSelection}
            formData={formData}
            setFormData={setFormData}
          />
        );
      case 'details':
        return (
          <DetailsStep
            formData={formData}
            onChange={handleChange}
          />
        );
      case 'schedule': {
        return (
          <ScheduleStepContent
            availability={formData.availability}
            onAvailabilityChange={(e) => {
              hasEditedAvailabilityRef.current = true;
              setFormData((prev) => ({ ...prev, availability: e.target.value }));
            }}
            orderedTimeZoneOptions={orderedTimeZoneOptions}
            monthLabel={monthLabel}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            zhDays={zhDays}
            calendarGrid={buildCalendarGrid}
            tzToday={tzToday}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDateNoon}
            viewMonth={viewMonth}
            todayStart={todayStart}
            isSameDay={isSameDay}
            setViewMonth={setViewMonth}
          />
        );
      }
      case 'upload':
        return (
          <UploadStep
            isDraggingFiles={isDraggingFiles}
            fileInputRef={fileInputRef}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileInputChange={handleFileInputChange}
            attachments={formData.attachments}
            onRemoveAttachment={handleRemoveAttachment}
            onClearAttachments={handleClearAttachments}
            accept={ATTACHMENT_ACCEPT}
            validationMessage={uploadValidationMessage}
          />
        );
      default:
        return null;
    }
  };
  if (isCompleted) {
    const completionClassName = ['completion-content', transitionClassName].filter(Boolean).join(' ');
    return (
      <div className="course-request-page">        <main className={completionClassName}>
          <div className="completion-card">
            <h2>提交成功！</h2>
            <p>我们已经收到你的课程需求，学习顾问会在 24 小时内与你取得联系。</p>
            <div className="completion-actions">
              <button type="button" onClick={() => navigate('/student')}>
                返回学生首页
              </button>
              <button
                type="button"
                onClick={() => {
                  startPageTransition(() => {
                    setIsCompleted(false);
                    setCurrentStepIndex(0);
                    setIsDirectionSelection(false);
                  });
                }}
                disabled={transitionStage !== 'idle'}
              >
                重新填写
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  //const isDirectionStep = currentStep.id === 'direction';
  //  //const isDirectionSelectionStage = isDirectionStep && isDirectionSelection;

  return (
    <div className="course-request-page">
      <main className="request-flow">
        <div className="request-shell">
          <header className="step-header">
            <BrandMark to="/student" />
            <div className="step-header-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  flushAvailabilitySave();
                  navigate('/student');
                }}
              >
                保存并退出
              </button>
            </div>
          </header>

          <section className={stepLayoutClassName}>
            {isUploadStep && !isDirectionSelectionStage && (
              <div
                ref={previewRef}
                className="contact-preview-floating"
                aria-label="导师页卡片预览"
                style={frozenTop != null ? { position: 'absolute', top: `${frozenTop}px`, transform: 'none' } : undefined}
               >
                <div className="student-preview-card">
                  <div className="card-fav"><FaHeart /></div>
                  <div className="card-header">
                    <div className="avatar" aria-hidden="true">{previewAvatarInitial}</div>
                    <div className="header-texts">
                      <div className="name">{previewStudentId}</div>
                      <div className="chips">
                        <span className="chip green">{previewDegree}</span>
                        {!!previewSchool && <span className="chip gray">{previewSchool}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="card-list" role="list">
                    <div className="item" role="listitem"><span className="icon"><FaGlobe /></span><span>{tzShort}                  （{tzCity || '时区'}）</span></div>
                    <div className="item" role="listitem"><span className="icon">{(() => { const PrevIcon = DIRECTION_ICON_MAP[formData.courseDirection] || FaFileAlt; return <PrevIcon />; })()}</span><span>{previewDirectionLabel}</span></div>
                    {!!previewCourseTypeLabel && (
                      <div className="item" role="listitem"><span className="icon"><FaGraduationCap /></span><span>{previewCourseTypeLabel}</span></div>
                    )}
                    {hasTotalCourseHours && (
                      <div className="item" role="listitem"><span className="icon"><FaClock /></span><span>预计时长：{previewTotalCourseHours}小时</span></div>
                    )}
                    {!!(formData.courseFocus && formData.courseFocus.trim()) && (
                      <div className="item" role="listitem"><span className="icon"><FaLightbulb /></span><span>具体内容：{formData.courseFocus.trim()}</span></div>
                    )}
                    {!!(formData.milestone && formData.milestone.trim()) && (
                      <div className="item" role="listitem"><span className="icon"><FaTasks /></span><span>学习目标：{formData.milestone.trim()}</span></div>
                    )}
                    {earliestSelectedDay && (
                      <div className="item" role="listitem"><span className="icon"><FaCalendarAlt /></span><span>期望首课：{earliestSelectedDay}</span></div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className={stepContentClassName}>
              <div className="step-intro">
                {!isDirectionSelectionStage && (
                  <React.Fragment>
                    <span className="step-label">{currentStep.label}</span>
                    <h1>{currentStep.title}</h1>
                  </React.Fragment>
                )}
                <p className={`step-description ${isDirectionSelectionStage ? 'direction-question' : ''}`}>
                  {isDirectionSelectionStage
                    ? (isCourseTypeSelection ? '请选择你的课程类型' : '以下哪一项最准确描述了你希望提升的课程？')
                    : currentStep.description}
                </p>
              </div>

              {isDirectionStep ? (
                isDirectionSelectionStage ? renderStepContent() : null
              ) : (
                isDetailsStep ? null : <div className="step-fields">{renderStepContent()}</div>
              )}
            </div>

            {!isDirectionSelectionStage && (
              isDetailsStep ? (
                <div className="details-right-panel">
                  {renderStepContent()}
                </div>
              ) : isScheduleStep ? (
                <div className="schedule-right-panel">
                  <ScheduleStepSidebar
                    monthLabel={monthLabel}
                    monthSlideKey={monthSlideKey}
                    monthSlideDir={monthSlideDir}
                    zhDays={zhDays}
                    calendarGrid={buildCalendarGrid}
                    tzToday={tzToday}
                    selectedDate={selectedDate}
                    selectedRangeKeys={selectedRangeKeys}
                    setSelectedRangeKeys={setSelectedRangeKeys}
                    todayStart={todayStart}
                    isSameDay={isSameDay}
                    viewMonth={viewMonth}
                    onPrevMonth={handlePrevMonth}
                    onNextMonth={handleNextMonth}
                    setSelectedDate={setSelectedDateNoon}
                    setViewMonth={setViewMonth}
                    daySelections={daySelections}
                    setDaySelections={(updater) => {
                      hasEditedAvailabilityRef.current = true;
                      setDaySelections(updater);
                    }}
                    dragPreviewKeys={dragPreviewKeys}
                    setDragPreviewKeys={setDragPreviewKeys}
                    enumerateKeysInclusive={enumerateKeysInclusive}
                    dragStartKey={dragStartKey}
                    setDragStartKey={setDragStartKey}
                    dragEndKey={dragEndKey}
                    setDragEndKey={setDragEndKey}
                    isDraggingRange={isDraggingRange}
                    setIsDraggingRange={setIsDraggingRange}
                    endDragSelection={endDragSelection}
                    didDragRef={didDragRef}
                    ymdKey={ymdKey}
                    timesListRef={timesListRef}
                    sessionDurationHours={formData.sessionDurationHours}
                    setFormData={(updater) => {
                      hasEditedAvailabilityRef.current = true;
                      setFormData(updater);
                    }}
                    getDayBlocks={getBlocksForDay}
                    setDayBlocks={(key, next) => {
                      hasEditedAvailabilityRef.current = true;
                      setBlocksForDay(key, next);
                    }}
                    selectedTimeZone={selectedTimeZone}
                    zonedTodayKey={zonedTodayKey}
                    zonedNowMinutes={zonedNowMinutes}
                  />
                </div>
              ) : (
                <div className="step-illustration" aria-label="插图预留区域">
                  <div className="illustration-frame">
                    <Suspense fallback={<div />}> 
                      <DotLottiePlayer
                        src="/illustrations/Morphing.lottie"
                        autoplay
                        loop
                        style={{ width: '100%', height: '100%', background: 'transparent' }}
                      />
                    </Suspense>
                  </div>
                </div>
              )
            )}
          </section>

          <>
            {isUploadStep && !isDirectionSelectionStage && (
              <div className="contact-preview-floating" aria-label="导师页卡片预览">
                <div className="student-preview-card">
                  <div className="card-fav"><FaHeart /></div>
                  <div className="card-header">
                    <div className="avatar" aria-hidden="true">{previewAvatarInitial}</div>
                    <div className="header-texts">
                      <div className="name">{previewStudentId}</div>
                      <div className="chips">
                        <span className="chip green">{previewDegree}</span>
                        {!!previewSchool && <span className="chip gray">{previewSchool}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="card-list" role="list">
                    <div className="item" role="listitem"><span className="icon"><FaGlobe /></span><span>{tzShort}（{tzCity || '时区'}）</span></div>
                    <div className="item" role="listitem"><span className="icon">{(() => { const PrevIcon = DIRECTION_ICON_MAP[formData.courseDirection] || FaFileAlt; return <PrevIcon />; })()}</span><span>{previewDirectionLabel}</span></div>
                    {!!previewCourseTypeLabel && (
                      <div className="item" role="listitem"><span className="icon"><FaGraduationCap /></span><span>{previewCourseTypeLabel}</span></div>
                    )}
                    {hasTotalCourseHours && (
                      <div className="item" role="listitem"><span className="icon"><FaClock /></span><span>预计时长：{previewTotalCourseHours}小时</span></div>
                    )}
                    {!!(formData.courseFocus && formData.courseFocus.trim()) && (
                      <div className="item" role="listitem"><span className="icon"><FaLightbulb /></span><span>具体内容：{formData.courseFocus.trim()}</span></div>
                    )}
                    {!!(formData.milestone && formData.milestone.trim()) && (
                      <div className="item" role="listitem"><span className="icon"><FaTasks /></span><span>学习目标：{formData.milestone.trim()}</span></div>
                    )}
                    {earliestSelectedDay && (
                      <div className="item" role="listitem"><span className="icon"><FaCalendarAlt /></span><span>期望首课：{earliestSelectedDay}</span></div>
                    )}
                  </div>                
                </div>
              </div>
            )}

            <footer className={stepFooterClassName}>
              <div className="step-footer-shell">
                <div className="step-progress">
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                </div>
  
                <div className="step-actions">
                  <button type="button" className="ghost-button" onClick={handleBack} disabled={transitionStage !== 'idle'}>
                    返回
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleNext}
                    disabled={transitionStage !== 'idle'}
                  >
                    {currentStepIndex === STEPS.length - 1 ? '提交需求' : '下一步'}
                  </button>
                </div>
              </div>
            </footer>
          </>
        </div>
      </main>
    </div>
  );
}

export default StudentCourseRequestPage;
