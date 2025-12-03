import React, { useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import { FaFileAlt, FaGlobe, FaClock, FaCalendarAlt, FaHeart, FaLightbulb, FaGraduationCap, FaTasks } from 'react-icons/fa';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP, COURSE_TYPE_OPTIONS } from '../../constants/courseMappings';
import DirectionStep from './steps/DirectionStep';
import DetailsStep from './steps/DetailsStep';
import { ScheduleStepContent, ScheduleStepSidebar } from './steps/ScheduleStep';
import UploadStep from './steps/UploadStep';

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

const STEPS = [
  {
    id: 'direction',
    label: '第 1 步',
    title: '明确你的学习方向',
    description:
      '在这一步，我们会帮助你快速对齐目标与期望，明确你需要学习的学科门类。',
  },  { id: 'details',
    label: '第 2 步',
    title: '补充课程细节',
    description:
      '告诉我们详细的课程类型，以及你期望达成的里程碑。',
  },
  {
    id: 'schedule',
    label: '第 3 步',
    title: '告知时区与可授课时间',
    description:
      'MentorX 会根据你的时区和可授课时间，为你匹配最适合的导师。',
  },
  {
    id: 'upload',
    label: '第 4 步',
    title: '很好！这是最后一步',
    description:
      '你可以预览在导师页面你的个人信息的呈现效果，并在下方上传你的课件。',
  },
];

// Use shared constants for directions and course types


const TIMEZONE_NAME_OVERRIDES = {
  'Asia/Shanghai': '\u4e2d\u56fd\u6807\u51c6\u65f6\u95f4',
  'Asia/Tokyo': '\u65e5\u672c\u6807\u51c6\u65f6\u95f4',
  'Asia/Bangkok': '\u6cf0\u56fd\u65f6\u95f4',
  'Asia/Dubai': '\u6d77\u6e7e\u6807\u51c6\u65f6\u95f4',
  'Europe/London': '\u683c\u6797\u5c3c\u6c0f\u6807\u51c6\u65f6\u95f4',
  'Europe/Berlin': '\u4e2d\u6b27\u6807\u51c6\u65f6\u95f4',
  'Europe/Moscow': '\u83ab\u65af\u79d1\u65f6\u95f4',
  'America/Los_Angeles': '\u7f8e\u56fd\u592a\u5e73\u6d0b\u65f6\u95f4',
  'America/Denver': '\u7f8e\u56fd\u5c71\u5730\u65f6\u95f4',
  'America/Chicago': '\u7f8e\u56fd\u4e2d\u90e8\u65f6\u95f4',
  'America/New_York': '\u7f8e\u56fd\u4e1c\u90e8\u65f6\u95f4',
  'America/Sao_Paulo': '\u5df4\u897f\u5229\u4e9a\u65f6\u95f4',
  'Pacific/Auckland': '\u65b0\u897f\u5170\u6807\u51c6\u65f6\u95f4',
  'Australia/Brisbane': '\u6fb3\u5927\u5229\u4e9a\u4e1c\u90e8\u65f6\u95f4',
  'America/Halifax': '\u52a0\u62ff\u5927\u5927\u897f\u6d0b\u65f6\u95f4',
  'America/Anchorage': '\u7f8e\u56fd\u963f\u62c9\u65af\u52a0\u65f6\u95f4',
  'Pacific/Honolulu': '\u590f\u5a01\u5937\u65f6\u95f4',
  'Pacific/Pago_Pago': '\u8428\u6469\u4e9a\u65f6\u95f4',
  'Atlantic/Azores': '\u4e9a\u901f\u5c14\u7fa4\u5c9b\u65f6\u95f4',
  'Atlantic/South_Georgia': '\u5357\u4e54\u6cbb\u4e9a\u65f6\u95f4',
  'Africa/Johannesburg': '\u5357\u975e\u65f6\u95f4',
  'Asia/Karachi': '\u5df4\u57fa\u65af\u5766\u6807\u51c6\u65f6\u95f4',
  'Asia/Dhaka': '\u5b5f\u52a0\u62c9\u56fd\u6807\u51c6\u65f6\u95f4',
  'Pacific/Guadalcanal': '\u6240\u7f57\u95e8\u7fa4\u5c9b\u65f6\u95f4',
};

// 24 curated time zones: one representative per UTC hour offset (-11 to +12)
const FALLBACK_TIMEZONES = [
  'Pacific/Pago_Pago',       // UTC-11
  'Pacific/Honolulu',        // UTC-10
  'America/Anchorage',       // UTC-09
  'America/Los_Angeles',     // UTC-08
  'America/Denver',          // UTC-07
  'America/Chicago',         // UTC-06
  'America/New_York',        // UTC-05
  'America/Halifax',         // UTC-04
  'America/Sao_Paulo',       // UTC-03
  'Atlantic/South_Georgia',  // UTC-02
  'Atlantic/Azores',         // UTC-01
  'Europe/London',           // UTC±00
  'Europe/Berlin',           // UTC+01
  'Africa/Johannesburg',     // UTC+02 (no DST)
  'Europe/Moscow',           // UTC+03
  'Asia/Dubai',              // UTC+04
  'Asia/Karachi',            // UTC+05
  'Asia/Dhaka',              // UTC+06
  'Asia/Bangkok',            // UTC+07
  'Asia/Shanghai',           // UTC+08
  'Asia/Tokyo',              // UTC+09
  'Australia/Brisbane',      // UTC+10 (no DST)
  'Pacific/Guadalcanal',     // UTC+11
  'Pacific/Auckland',        // UTC+12
];

const extractCityName = (timeZone) => {
  if (!timeZone) {
    return '';
  }
  const segments = timeZone.split('/');
  if (segments.length <= 1) {
    return timeZone.replace(/_/g, ' ');
  }
  return segments.slice(1).join(' / ').replace(/_/g, ' ');
};

const getTimeZoneOffsetMinutes = (timeZone, referenceDate = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(referenceDate).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});
    const isoString = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(isoString);
    const offsetMinutes = Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);
    return offsetMinutes;
  } catch (error) {
    return 0;
  }
};

const formatTimeZoneOffset = (timeZone, referenceDate = new Date()) => {
  try {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, referenceDate);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const minutes = String(absMinutes % 60).padStart(2, '0');
    return `(UTC${sign}${hours}:${minutes})`;
  } catch (error) {
    return '(UTC+00:00)';
  }
};

const buildTimeZoneLabel = (timeZone, referenceDate) => {
  const offset = formatTimeZoneOffset(timeZone, referenceDate);
  const cityName = extractCityName(timeZone);
  const overrideName = TIMEZONE_NAME_OVERRIDES[timeZone];
  const baseName = overrideName || cityName || timeZone;
  // Append English city name when available to keep clarity
  const suffix = overrideName && cityName && overrideName !== cityName ? ` - ${cityName}` : '';
  return `${offset} ${baseName}${suffix}`;
};

const getDefaultTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch (error) {
    return 'Asia/Shanghai';
  }
};

const buildTimeZoneOptions = (referenceDate = new Date()) => {
  // Only show curated 24 time zones to keep the list clean and simple
  return FALLBACK_TIMEZONES.map((timeZone) => ({
    value: timeZone,
    label: buildTimeZoneLabel(timeZone, referenceDate),
  }));
};

// Order options so that:
// - time zones later than the selected are listed first (above),
// - selected time zone in the middle,
// - earlier time zones listed after (below).
const orderTimeZoneOptionsAroundSelected = (options, selectedValue, referenceDate = new Date()) => {
  if (!selectedValue) return options;
  const decorated = options.map((o) => ({
    ...o,
    _offset: getTimeZoneOffsetMinutes(o.value, referenceDate),
  }));
  const selectedOffset = getTimeZoneOffsetMinutes(selectedValue, referenceDate);

  const later = decorated.filter((o) => o._offset > selectedOffset).sort((a, b) => b._offset - a._offset);
  const earlier = decorated.filter((o) => o._offset < selectedOffset).sort((a, b) => b._offset - a._offset);

  const selectedInList = decorated.find((o) => o.value === selectedValue);
  const selectedOption =
    selectedInList || {
      value: selectedValue,
      label: buildTimeZoneLabel(selectedValue, referenceDate),
      _offset: selectedOffset,
    };

  const result = [...later, selectedOption, ...earlier].map(({ _offset, ...rest }) => rest);
  // Deduplicate by value in case selected already existed
  const seen = new Set();
  return result.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
};

const SLOT_MINUTES = 15;
const MINUTES_IN_DAY = 24 * 60;

const getZonedParts = (timeZone, date = new Date()) => {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = fmt.formatToParts(date).reduce((acc, cur) => {
      if (cur.type !== 'literal') acc[cur.type] = cur.value;
      return acc;
    }, {});
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
};

const keyFromParts = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const parseKey = (key) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
};
const keyToUtcMidday = (key) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
};
const addDaysToKey = (key, delta) => {
  const parsed = parseKey(key);
  if (!parsed) return key;
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + delta);
  return keyFromParts(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate());
};
const keyToDate = (key) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
};
const mergeBlocksList = (blocks) => {
  if (!blocks || !blocks.length) return [];
  const sorted = [...blocks]
    .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
    .sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
};
const getOffsetForKey = (timeZone, key) => {
  const ref = keyToUtcMidday(key);
  if (!ref) return 0;
  return getTimeZoneOffsetMinutes(timeZone, ref);
};
const convertSelectionsBetweenTimeZones = (selections, fromTz, toTz) => {
  if (!selections || fromTz === toTz) return selections;
  const result = {};
  Object.entries(selections).forEach(([key, blocks]) => {
    if (!Array.isArray(blocks) || !blocks.length) return;
    const oldOffset = getOffsetForKey(fromTz, key);
    const newOffset = getOffsetForKey(toTz, key);
    const delta = newOffset - oldOffset;
    if (!delta) {
      result[key] = mergeBlocksList([...(result[key] || []), ...blocks]);
      return;
    }
    blocks.forEach((block) => {
      const startMin = (block.start ?? 0) * SLOT_MINUTES + delta;
      const endMinExclusive = ((block.end ?? block.start ?? 0) + 1) * SLOT_MINUTES + delta;
      const startDay = Math.floor(startMin / MINUTES_IN_DAY);
      const endDay = Math.floor((endMinExclusive - 1) / MINUTES_IN_DAY);
      for (let dayOffset = startDay; dayOffset <= endDay; dayOffset++) {
        const dayStartMin = dayOffset * MINUTES_IN_DAY;
        const segStartMin = Math.max(startMin, dayStartMin);
        const segEndMin = Math.min(endMinExclusive, dayStartMin + MINUTES_IN_DAY);
        if (segStartMin >= segEndMin) continue;
        const segStartIdx = Math.max(0, Math.floor((segStartMin - dayStartMin) / SLOT_MINUTES));
        const segEndIdx = Math.min(95, Math.ceil((segEndMin - dayStartMin) / SLOT_MINUTES) - 1);
        const targetKey = addDaysToKey(key, dayOffset);
        const existing = result[targetKey] || [];
        result[targetKey] = mergeBlocksList([...existing, { start: segStartIdx, end: segEndIdx }]);
      }
    });
  });
  return result;
};
const shiftDayKeyForTimezone = (key, fromTz, toTz, anchorMinutes = 12 * 60) => {
  if (!key || fromTz === toTz) return key;
  const oldOffset = getOffsetForKey(fromTz, key);
  const newOffset = getOffsetForKey(toTz, key);
  const delta = newOffset - oldOffset;
  if (!delta) return key;
  const minuteMark = anchorMinutes + delta;
  const dayOffset = Math.floor(minuteMark / MINUTES_IN_DAY);
  if (!dayOffset) return key;
  return addDaysToKey(key, dayOffset);
};
const convertRangeKeysBetweenTimeZones = (keys, fromTz, toTz) => {
  if (!Array.isArray(keys) || fromTz === toTz) return keys;
  const converted = keys.map((k) => shiftDayKeyForTimezone(k, fromTz, toTz));
  return Array.from(new Set(converted));
};
const buildDateFromTimeZoneNow = (timeZone) => {
  const parts = getZonedParts(timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
};

const DEFAULT_TIME_ZONE = getDefaultTimeZone();


const INITIAL_FORM_STATE = {
  learningGoal: '国际课程 / 升学',
  courseDirection: '',
  courseType: '',
  courseTypes: [],
  courseFocus: '',
  format: '线上授课',
  milestone: '',
  // 预计课程总时长（小时）
  totalCourseHours: '',
  availability: DEFAULT_TIME_ZONE,
  sessionDurationHours: 2,
  contactName: '',
  contactMethod: '微信',
  contactValue: '',
  attachments: [],
};

const PAGE_TRANSITION_DURATION = 400;
const PREVIEW_FREEZE_OFFSET = -150;

// ---- Preview helpers (mock profile + formatting) ----
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)] || '';
const MOCK_SCHOOLS = ['斯坦福大学', '清华大学', '麻省理工学院', '北京大学', '多伦多大学', '新加坡国立大学'];
const MOCK_LEVELS = ['本科', '硕士', '博士'];

const buildShortUTC = (timeZone) => {
  if (!timeZone) return 'UTC±0';
  try {
    const offMin = getTimeZoneOffsetMinutes(timeZone, new Date());
    const sign = offMin >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offMin) / 60);
    const mins = Math.abs(offMin) % 60;
    const minsPart = mins ? `:${String(mins).padStart(2, '0')}` : '';
    return `UTC${sign}${hours}${minsPart}`;
  } catch (e) {
    return 'UTC±0';
  }
};

const generateMockStudentProfile = () => {
  const id = Math.floor(10 + Math.random() * 90);
  return {
    name: `Student${id}`,
    level: pickOne(MOCK_LEVELS),
    school: pickOne(MOCK_SCHOOLS),
  };
};

function StudentCourseRequestPage() {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDirectionSelection, setIsDirectionSelection] = useState(false);
  const [isCourseTypeSelection, setIsCourseTypeSelection] = useState(false);
  const [transitionStage, setTransitionStage] = useState('idle');
  const pendingActionRef = useRef(null);
  const isMountedRef = useRef(true);
  const selectedTimeZone = formData.availability || DEFAULT_TIME_ZONE;
  const previousTimeZoneRef = useRef(selectedTimeZone);

  // Stable mock profile for preview (when student info is missing)
  const mockStudent = useMemo(() => generateMockStudentProfile(), []);

  // ----- Schedule step local states -----
  const [selectedDate, setSelectedDate] = useState(() => buildDateFromTimeZoneNow(DEFAULT_TIME_ZONE));
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = buildDateFromTimeZoneNow(DEFAULT_TIME_ZONE);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
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
  const tzToday = useMemo(() => buildDateFromTimeZoneNow(selectedTimeZone), [selectedTimeZone]);
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
    if (endDate) setSelectedDate(endDate);
    setIsDraggingRange(false);
    setDragPreviewKeys(new Set());
  }, [dragEndKey, dragStartKey, enumerateKeysInclusive, isDraggingRange, keyToDateStrict]);

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

    setDaySelections((prev) => convertSelectionsBetweenTimeZones(prev, prevTz, nextTz));
    setSelectedRangeKeys((prev) => convertRangeKeysBetweenTimeZones(prev, prevTz, nextTz));

    const prevSelectedKey = selectedDate ? buildKey(selectedDate) : null;
    const shiftedSelectedKey = prevSelectedKey ? shiftDayKeyForTimezone(prevSelectedKey, prevTz, nextTz) : null;
    const nextSelectedDate = shiftedSelectedKey ? (keyToDate(shiftedSelectedKey) || buildDateFromTimeZoneNow(nextTz)) : buildDateFromTimeZoneNow(nextTz);
    const nextViewMonth = new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1);

    setSelectedDate(nextSelectedDate);
    setViewMonth(nextViewMonth);
    setDragStartKey(null);
    setDragEndKey(null);
    setDragPreviewKeys(new Set());
    setIsDraggingRange(false);

    previousTimeZoneRef.current = nextTz;
  }, [buildKey, selectedTimeZone, selectedDate]);

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
    setFormData((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), ...list],
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
  };

  const handleNext = () => {
    startPageTransition(() => {
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
  const previewName = formData.contactName?.trim() || mockStudent.name;
  const previewLevel = mockStudent.level;
  const previewSchool = mockStudent.school;
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
            onAvailabilityChange={handleChange("availability")}
            orderedTimeZoneOptions={orderedTimeZoneOptions}
            monthLabel={monthLabel}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            zhDays={zhDays}
            calendarGrid={buildCalendarGrid}
            tzToday={tzToday}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
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
                onClick={() => navigate('/student')}
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
                    <div className="avatar" aria-hidden="true">{previewName.slice(0,1).toUpperCase()}</div>
                    <div className="header-texts">
                      <div className="name">{previewName}</div>
                      <div className="chips">
                        <span className="chip green">{previewLevel}</span>
                        <span className="chip gray">{previewSchool}</span>
                      </div>
                    </div>
                  </div>
                  <div className="card-list" role="list">
                    <div className="item" role="listitem"><span className="icon"><FaGlobe /></span><span>{tzShort}                  （{tzCity || '时区'}）</span></div>
                    <div className="item" role="listitem"><span className="icon">{(() => { const PrevIcon = DIRECTION_ICON_MAP[formData.courseDirection] || FaFileAlt; return <PrevIcon />; })()}</span><span>{previewDirectionLabel}</span></div>
                    {!!previewCourseTypeLabel && (
                      <div className="item" role="listitem"><span className="icon"><FaGraduationCap /></span><span>课程类型：{previewCourseTypeLabel}</span></div>
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
                    setSelectedDate={setSelectedDate}
                    setViewMonth={setViewMonth}
                    daySelections={daySelections}
                    setDaySelections={setDaySelections}
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
                    setFormData={setFormData}
                    getDayBlocks={getBlocksForDay}
                    setDayBlocks={setBlocksForDay}
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
                    <div className="avatar" aria-hidden="true">{previewName.slice(0,1).toUpperCase()}</div>
                    <div className="header-texts">
                      <div className="name">{previewName}</div>
                      <div className="chips">
                        <span className="chip green">{previewLevel}</span>
                        <span className="chip gray">{previewSchool}</span>
                      </div>
                    </div>
                  </div>
                  <div className="card-list" role="list">
                    <div className="item" role="listitem"><span className="icon"><FaGlobe /></span><span>{tzShort}（{tzCity || '时区'}）</span></div>
                    <div className="item" role="listitem"><span className="icon">{(() => { const PrevIcon = DIRECTION_ICON_MAP[formData.courseDirection] || FaFileAlt; return <PrevIcon />; })()}</span><span>{previewDirectionLabel}</span></div>
                    {!!previewCourseTypeLabel && (
                      <div className="item" role="listitem"><span className="icon"><FaGraduationCap /></span><span>课程类型：{previewCourseTypeLabel}</span></div>
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


