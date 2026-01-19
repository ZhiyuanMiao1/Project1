import React, { useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import { FaFileAlt, FaGlobe, FaClock, FaCalendarAlt, FaHeart, FaLightbulb, FaGraduationCap, FaTasks } from 'react-icons/fa';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP, COURSE_TYPE_OPTIONS } from '../../constants/courseMappings';
import { fetchAccountProfile } from '../../api/account';
import api from '../../api/client';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';
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

const buildAttachmentLocalKey = (file) => {
  const name = file?.name || '';
  const size = Number(file?.size) || 0;
  const lastModified = Number(file?.lastModified) || 0;
  return `${name}|${size}|${lastModified}`;
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
  const location = useLocation();
  const resumeRequestId = useMemo(() => {
    try {
      const params = new URLSearchParams(location?.search || '');
      const raw = params.get('requestId') || params.get('draftId') || '';
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
    } catch {
      return null;
    }
  }, [location?.search]);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [accountProfileStatus, setAccountProfileStatus] = useState('idle'); // idle | loading | loaded | error
  const [accountProfile, setAccountProfile] = useState(() => {
    const user = getAuthUser() || {};
    const role = user?.role;
    const publicId = user?.public_id;
    return {
      studentId: role === 'student' && typeof publicId === 'string' ? publicId : '',
      degree: '',
      school: '',
    };
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
  const [requestId, setRequestId] = useState(null);
  const loadedDraftIdRef = useRef(null);
  const draftLoadSeqRef = useRef(0);
  const uploadedAttachmentsRef = useRef(new Map());
  const [requestBusy, setRequestBusy] = useState(false);
  const selectedTimeZone = formData.availability || DEFAULT_TIME_ZONE;
  const previousTimeZoneRef = useRef(selectedTimeZone);

  // Sync schedule availability with Account Settings (/api/account/availability)
  const [pendingAccountAvailability, setPendingAccountAvailability] = useState(null);
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const availabilityHydratingRef = useRef(false);
  const hasEditedAvailabilityRef = useRef(false);
  const lastSavedAvailabilityFingerprintRef = useRef('');

  // Stable mock profile for preview (when student info is missing)
  const mockStudent = useMemo(() => generateMockStudentProfile(), []);

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

  const normalizeAvailabilityBlocks = useCallback((rawBlocks) => {
    if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return [];
    const cleaned = rawBlocks
      .map((b) => ({ start: Number(b?.start), end: Number(b?.end) }))
      .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
      .map((b) => ({
        start: Math.max(0, Math.min(95, Math.floor(Math.min(b.start, b.end)))),
        end: Math.max(0, Math.min(95, Math.floor(Math.max(b.start, b.end)))),
      }));
    if (cleaned.length <= 1) return cleaned;

    const sorted = [...cleaned].sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur.start <= prev.end + 1) prev.end = Math.max(prev.end, cur.end);
      else merged.push({ ...cur });
    }
    return merged;
  }, []);

  const normalizeDaySelectionKeys = useCallback((selections) => {
    const input = (selections && typeof selections === 'object' && !Array.isArray(selections)) ? selections : {};
    const out = {};

    const parseDayKeyLoose = (key) => {
      if (typeof key !== 'string') return null;
      const match = key.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
      if (!match) return null;
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const day = Number.parseInt(match[3], 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      const dt = new Date(year, month - 1, day);
      if (!Number.isFinite(dt.getTime())) return null;
      return dt;
    };

    for (const [rawKey, rawBlocks] of Object.entries(input)) {
      const dt = keyToDateStrict(rawKey) || parseDayKeyLoose(rawKey);
      if (!dt) continue;
      const normalizedKey = buildKey(dt);
      const blocks = normalizeAvailabilityBlocks(rawBlocks);
      if (!blocks.length) continue;

      const existing = out[normalizedKey];
      out[normalizedKey] = existing
        ? normalizeAvailabilityBlocks([...(existing || []), ...blocks])
        : blocks;
    }

    return out;
  }, [buildKey, keyToDateStrict, normalizeAvailabilityBlocks]);

  const prunePastDaySelections = useCallback((selections, todayDateLike) => {
    const today = todayDateLike ? new Date(todayDateLike) : null;
    if (!today) return (selections && typeof selections === 'object' && !Array.isArray(selections)) ? selections : {};

    const todayStartTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const input = (selections && typeof selections === 'object' && !Array.isArray(selections)) ? selections : {};
    const result = {};

    for (const [key, blocks] of Object.entries(input)) {
      if (!Array.isArray(blocks) || blocks.length === 0) continue;
      const dt = keyToDateStrict(key);
      if (!dt) continue;
      const ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      if (ts < todayStartTs) continue;
      result[key] = blocks;
    }

    return result;
  }, [keyToDateStrict]);

  useEffect(() => {
    if (!resumeRequestId) return;
    if (!isLoggedIn) return;
    if (loadedDraftIdRef.current === resumeRequestId) return;

    // NOTE: React 18 StrictMode runs effects twice on mount (setup->cleanup->setup).
    // Use a sequence token so a stale run can't "lock" the UI in `requestBusy=true`.
    const seq = (draftLoadSeqRef.current += 1);
    (async () => {
      setRequestBusy(true);
      try {
        const res = await api.get(`/api/requests/drafts/${encodeURIComponent(String(resumeRequestId))}`);
        const draft = res?.data?.draft || null;
        if (draftLoadSeqRef.current !== seq) return;
        if (!draft) return;

        const safeText = (value) => (typeof value === 'string' ? value : '');
        const tzFromDraft = safeText(draft?.timeZone).trim();
        const scheduleTimeZone = tzFromDraft || previousTimeZoneRef.current || DEFAULT_TIME_ZONE;

        const rawCourseTypes = Array.isArray(draft?.courseTypes) ? draft.courseTypes : [];
        const normalizedCourseTypes = rawCourseTypes.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
        const courseTypeFromSingle = safeText(draft?.courseType).trim();
        const courseTypes = normalizedCourseTypes.length
          ? normalizedCourseTypes
          : (courseTypeFromSingle ? [courseTypeFromSingle] : []);
        const courseType = courseTypeFromSingle || courseTypes[0] || '';

        const totalCourseHours =
          (typeof draft?.totalCourseHours === 'number' && Number.isFinite(draft.totalCourseHours))
            ? String(draft.totalCourseHours)
            : (typeof draft?.totalCourseHours === 'string' && draft.totalCourseHours.trim() ? draft.totalCourseHours.trim() : '');
        let draftSessionDurationHours = null;
        if (typeof draft?.sessionDurationHours === 'number' && Number.isFinite(draft.sessionDurationHours)) {
          draftSessionDurationHours = draft.sessionDurationHours;
        } else if (typeof draft?.sessionDurationHours === 'string' && draft.sessionDurationHours.trim()) {
          const parsed = Number(draft.sessionDurationHours);
          if (Number.isFinite(parsed)) draftSessionDurationHours = parsed;
        }

        const rawDaySelections = (draft?.daySelections && typeof draft.daySelections === 'object' && !Array.isArray(draft.daySelections))
          ? draft.daySelections
          : {};
        const fallbackDate = toNoonDate(buildDateFromTimeZoneNow(scheduleTimeZone));
        const normalizedDaySelections = normalizeDaySelectionKeys(rawDaySelections);
        const nextDaySelections = prunePastDaySelections(normalizedDaySelections, fallbackDate);

        const draftHasScheduleSelections = Object.keys(nextDaySelections)
          .some((k) => Array.isArray(nextDaySelections?.[k]) && nextDaySelections[k].length > 0);

        if (draftHasScheduleSelections) {
          // Prevent account-availability hydration from overriding an existing draft schedule.
          hasEditedAvailabilityRef.current = true;
          availabilityHydratingRef.current = false;
          previousTimeZoneRef.current = scheduleTimeZone;
          setPendingAccountAvailability(null);
          setAvailabilityReady(true);

          setDaySelections(nextDaySelections);

          const candidateDayKeys = Object.keys(nextDaySelections)
            .filter((k) => Array.isArray(nextDaySelections?.[k]) && nextDaySelections[k].length > 0)
            .sort();
          const firstKey = candidateDayKeys[0] || '';
          const firstDate = firstKey ? keyToDateStrict(firstKey) : null;
          const nextSelectedDate = toNoonDate(firstDate || fallbackDate);
          setSelectedDateNoon(nextSelectedDate);
          setViewMonth(new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1));
          const selectedKey = buildKey(nextSelectedDate);
          setSelectedRangeKeys(selectedKey ? [selectedKey] : []);
          setDragStartKey(null);
          setDragEndKey(null);
          setIsDraggingRange(false);
          setDragPreviewKeys(new Set());
          didDragRef.current = false;
        }

        setIsCompleted(false);
        setUploadValidationMessage('');
        setRequestId(draft?.id || resumeRequestId);
        uploadedAttachmentsRef.current.clear();

        setFormData((prev) => ({
          ...prev,
          learningGoal: safeText(draft?.learningGoal) || prev.learningGoal,
          courseDirection: safeText(draft?.courseDirection),
          courseType,
          courseTypes,
          courseFocus: safeText(draft?.courseFocus),
          format: safeText(draft?.format) || prev.format,
          milestone: safeText(draft?.milestone),
          totalCourseHours,
          ...(draftHasScheduleSelections ? { availability: scheduleTimeZone } : null),
          ...(draftHasScheduleSelections && draftSessionDurationHours != null
            ? { sessionDurationHours: draftSessionDurationHours }
            : null),
          contactName: safeText(draft?.contactName),
          contactMethod: safeText(draft?.contactMethod) || prev.contactMethod,
          contactValue: safeText(draft?.contactValue),
          attachments: Array.isArray(draft?.attachments) ? draft.attachments : [],
        }));

        const rawStep = draft?.draftStep;
        const stepNum = Number(rawStep);
        const step = Number.isFinite(stepNum) ? Math.max(0, Math.min(50, Math.floor(stepNum))) : 0;
        if (step <= 2) {
          setCurrentStepIndex(0);
          setIsDirectionSelection(step >= 1);
          setIsCourseTypeSelection(step >= 2);
        } else if (step === 3) {
          setCurrentStepIndex(1);
          setIsDirectionSelection(true);
          setIsCourseTypeSelection(true);
        } else if (step === 4) {
          setCurrentStepIndex(2);
          setIsDirectionSelection(true);
          setIsCourseTypeSelection(true);
        } else {
          setCurrentStepIndex(3);
          setIsDirectionSelection(true);
          setIsCourseTypeSelection(true);
        }

        loadedDraftIdRef.current = resumeRequestId;
      } catch (err) {
        if (draftLoadSeqRef.current !== seq) return;
        const msg = err?.response?.data?.error || err?.message || '加载草稿失败，请稍后再试';
        alert(msg);
      } finally {
        if (draftLoadSeqRef.current !== seq) return;
        setRequestBusy(false);
      }
    })();
  }, [buildKey, isLoggedIn, keyToDateStrict, normalizeDaySelectionKeys, prunePastDaySelections, resumeRequestId, setSelectedDateNoon]);



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

    const fallbackDate = toNoonDate(buildDateFromTimeZoneNow(selectedTimeZone || DEFAULT_TIME_ZONE));
    const normalizedDaySelections = normalizeDaySelectionKeys(pendingAccountAvailability.daySelections || {});
    setDaySelections(prunePastDaySelections(normalizedDaySelections, fallbackDate));
    availabilityHydratingRef.current = false;
    setPendingAccountAvailability(null);
    setAvailabilityReady(true);
  }, [normalizeDaySelectionKeys, pendingAccountAvailability, prunePastDaySelections, selectedTimeZone]);

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

  const flushAvailabilitySave = useCallback(() => {
    if (!isLoggedIn) return;
    if (!availabilityReady) return;
    if (availabilityHydratingRef.current) return;
    if (!hasEditedAvailabilityRef.current) return;

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
    setFormData((prev) => {
      const current = prev.attachments || [];
      const removed = current[index];
      if (removed) {
        const localKey = buildAttachmentLocalKey(removed);
        uploadedAttachmentsRef.current.delete(localKey);
      }
      return {
        ...prev,
        attachments: current.filter((_, i) => i !== index),
      };
    });
  };
  const handleClearAttachments = () => {
    setFormData((prev) => {
      const current = prev.attachments || [];
      for (const file of current) {
        const localKey = buildAttachmentLocalKey(file);
        uploadedAttachmentsRef.current.delete(localKey);
      }
      return { ...prev, attachments: [] };
    });
    setUploadValidationMessage('');
  };

  const buildRequestPayload = (nextRequestId, attachmentsPayload, draftStep) => {
    const courseTypes = Array.isArray(formData.courseTypes) && formData.courseTypes.length
      ? formData.courseTypes
      : (formData.courseType ? [formData.courseType] : []);
    const payload = {
      ...(nextRequestId ? { requestId: nextRequestId } : {}),
      ...(Number.isFinite(Number(draftStep)) ? { draftStep: Math.floor(Number(draftStep)) } : {}),
      learningGoal: formData.learningGoal,
      courseDirection: formData.courseDirection,
      courseType: formData.courseType,
      courseTypes,
      courseFocus: formData.courseFocus,
      format: formData.format,
      milestone: formData.milestone,
      totalCourseHours: formData.totalCourseHours,
      timeZone: formData.availability,
      sessionDurationHours: formData.sessionDurationHours,
      daySelections,
      contactName: formData.contactName,
      contactMethod: formData.contactMethod,
      contactValue: formData.contactValue,
    };
    if (typeof attachmentsPayload !== 'undefined') {
      payload.attachments = attachmentsPayload;
    }
    return payload;
  };

  const ensureDraftRequestId = async () => {
    if (requestId) return requestId;
    const res = await api.post('/api/requests/save', {});
    const id = res?.data?.requestId;
    if (!id) throw new Error('未获取到需求编号');
    setRequestId(id);
    return id;
  };

  const uploadAttachments = async (nextRequestId) => {
    const files = Array.from(formData.attachments || []);
    const out = [];

    for (const file of files) {
      // When resuming a draft, attachments are stored as server-side metadata instead of File objects.
      if (file && typeof file === 'object' && typeof file.fileId === 'string' && typeof file.ossKey === 'string') {
        const sizeBytes = typeof file.sizeBytes === 'number' ? file.sizeBytes : Number(file.sizeBytes);
        out.push({
          fileId: file.fileId,
          fileName: file.fileName || '',
          ext: file.ext || '',
          contentType: file.contentType || null,
          sizeBytes: Number.isFinite(sizeBytes) ? Math.floor(sizeBytes) : 0,
          ossKey: file.ossKey,
          fileUrl: file.fileUrl || '',
        });
        continue;
      }

      const localKey = buildAttachmentLocalKey(file);
      const cached = uploadedAttachmentsRef.current.get(localKey);
      if (cached) {
        out.push(cached);
        continue;
      }

      const signRes = await api.post('/api/oss/policy', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        scope: 'courseRequestAttachment',
        requestId: nextRequestId,
      });

      const { host, key, policy, signature, accessKeyId, fileUrl, fileId, ext } = signRes?.data || {};
      if (!host || !key || !policy || !signature || !accessKeyId || !fileUrl || !fileId || !ext) {
        throw new Error('上传签名响应不完整');
      }

      const formDataBody = new FormData();
      formDataBody.append('key', key);
      formDataBody.append('policy', policy);
      formDataBody.append('OSSAccessKeyId', accessKeyId);
      formDataBody.append('success_action_status', '200');
      formDataBody.append('signature', signature);
      formDataBody.append('file', file);

      const uploadRes = await fetch(host, { method: 'POST', body: formDataBody });
      if (!uploadRes.ok) throw new Error('上传失败');

      const meta = {
        fileId,
        fileName: file.name,
        ext,
        contentType: file.type,
        sizeBytes: file.size,
        ossKey: key,
        fileUrl,
      };
      uploadedAttachmentsRef.current.set(localKey, meta);
      out.push(meta);
    }

    return out;
  };

  const saveRequestDraft = async ({ includeAttachments, draftStep } = {}) => {
    if (!isLoggedIn) {
      alert('请先登录');
      return null;
    }
    if (requestBusy) return null;

    setRequestBusy(true);
    try {
      let nextRequestId = requestId;
      let attachmentsPayload;

      if (includeAttachments) {
        const files = Array.from(formData.attachments || []);
        if (files.length) {
          nextRequestId = await ensureDraftRequestId();
          attachmentsPayload = await uploadAttachments(nextRequestId);
        } else {
          attachmentsPayload = [];
        }
      }

      const payload = buildRequestPayload(nextRequestId, attachmentsPayload, draftStep);
      const res = await api.post('/api/requests/save', payload);
      const savedId = res?.data?.requestId;
      if (savedId) setRequestId(savedId);
      return savedId || null;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '保存失败，请稍后再试';
      alert(msg);
      return null;
    } finally {
      setRequestBusy(false);
    }
  };

  const submitRequest = async () => {
    if (!isLoggedIn) {
      alert('请先登录');
      return;
    }
    if (requestBusy) return;

    setRequestBusy(true);
    try {
      flushAvailabilitySave();
      const files = Array.from(formData.attachments || []);
      let nextRequestId = requestId;
      let attachmentsPayload = [];
      if (files.length) {
        nextRequestId = await ensureDraftRequestId();
        attachmentsPayload = await uploadAttachments(nextRequestId);
      }
      const payload = buildRequestPayload(nextRequestId, attachmentsPayload);
      const res = await api.post('/api/requests/submit', payload);
      const submittedId = res?.data?.requestId;
      if (submittedId) setRequestId(submittedId);

      const origin = location?.state?.origin;
      const mentorId = location?.state?.mentorId;
      const returnTo = location?.state?.returnTo;
      if (origin === 'mentor-detail-onboarding' && mentorId) {
        const target = (typeof returnTo === 'string' && returnTo.trim())
          ? returnTo
          : `/student/mentors/${encodeURIComponent(String(mentorId))}`;
        navigate(target, {
          replace: true,
          state: { courseOnboarding: { open: true, selectedRequestId: submittedId || nextRequestId } },
        });
        return;
      }

      setIsCompleted(true);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '提交失败，请稍后再试';
      alert(msg);
    } finally {
      setRequestBusy(false);
    }
  };

  const handleNext = () => {
    if (requestBusy) return;
    if (currentStepIndex === STEPS.length - 1) {
      submitRequest();
      return;
    }
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
            <p>我们已经收到你的课程需求，若需要可在帮助中心联系学习顾问。</p>
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
                      setIsCourseTypeSelection(false);
                      setFormData(INITIAL_FORM_STATE);
                      setDaySelections({});
                      setSelectedRangeKeys([]);
                      setUploadValidationMessage('');
                      setRequestId(null);
                      uploadedAttachmentsRef.current.clear();
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
                disabled={requestBusy || transitionStage !== 'idle'}
                onClick={async () => {
                  if (!isLoggedIn) {
                    navigate('/student');
                    return;
                  }
                  flushAvailabilitySave();
                  const draftStep = (() => {
                    if (currentStep.id === 'direction') {
                      if (!isDirectionSelection) return 0;
                      if (!isCourseTypeSelection) return 1;
                      return 2;
                    }
                    if (currentStep.id === 'details') return 3;
                    if (currentStep.id === 'schedule') return 4;
                    if (currentStep.id === 'upload') return 5;
                    return 0;
                  })();
                  const savedId = await saveRequestDraft({ includeAttachments: true, draftStep });
                  if (savedId) navigate('/student');
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
                  <button type="button" className="ghost-button" onClick={handleBack} disabled={transitionStage !== 'idle' || requestBusy}>
                    返回
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleNext}
                    disabled={transitionStage !== 'idle' || requestBusy}
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
