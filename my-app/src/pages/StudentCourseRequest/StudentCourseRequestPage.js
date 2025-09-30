import React, { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import {
  FaCode,
  FaProjectDiagram,
  FaCalculator,
  FaChartPie,
  FaRobot,
  FaAtom,
  FaChartBar,
  FaDollarSign,
  FaFileAlt,
  FaEllipsisH,
  FaBullhorn,
  FaCogs,
  FaBalanceScale,
  FaLaptopCode,
  FaShieldAlt,
  FaUniversity,
  FaTasks,
  FaUserTie,
  FaDna,
  FaFlask,
  FaCubes,
  FaPalette,
  FaLanguage,
  FaBrain,
  FaBroadcastTower,
} from 'react-icons/fa';
import { RiAiGenerate } from 'react-icons/ri';

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
  },
  {
    id: 'details',
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
    id: 'contact',
    label: '第 4 步',
    title: '留下联系方式',
    description:
      '我们的学习顾问将在 24 小时内联系你，确认课程安排细节。',
  },
];

const DIRECTION_OPTIONS = [
  { id: 'cs-foundation', label: '编程基础' },
  { id: 'algo', label: '数据结构与算法' },
  { id: 'ml', label: '机器学习' },
  { id: 'ai-large-model', label: 'AI 大模型' },
  { id: 'data-analysis', label: '数据分析' },
  { id: 'advanced-math', label: '高等数学' },
  { id: 'statistics', label: '概率与统计' },
  { id: 'physics', label: '物理学' },
  { id: 'life-science', label: '生命科学' },
  { id: 'chemistry', label: '化学' },
  { id: 'materials-science', label: '材料科学' },
  { id: 'software-engineering', label: '软件工程' },
  { id: 'cybersecurity', label: '网络安全' },
  { id: 'finance', label: '金融学' },
  { id: 'accounting', label: '会计学' },
  { id: 'economics', label: '经济学' },
  { id: 'marketing', label: '市场营销' },
  { id: 'operations', label: '运营管理' },
  { id: 'project-management', label: '项目管理' },
  { id: 'psychology', label: '心理学' },
  { id: 'design-creative', label: '设计 / 创意' },
  { id: 'linguistics', label: '语言学' },
  { id: 'communication-studies', label: '传播学' },
  { id: 'law', label: '法律' },
  { id: 'writing', label: '论文写作与润色' },
  { id: 'career-coaching', label: '求职辅导' },
  { id: 'others', label: '其它课程方向' },
];

// 方向图标映射
const DIRECTION_ICONS = {
  'cs-foundation': <FaCode />,
  'algo': <FaProjectDiagram />,
  'ml': <FaRobot />,
  'ai-large-model': <RiAiGenerate />,
  'data-analysis': <FaChartBar />,
  'advanced-math': <FaCalculator />,
  'statistics': <FaChartPie />,
  'physics': <FaAtom />,
  'life-science': <FaDna />,
  'chemistry': <FaFlask />,
  'materials-science': <FaCubes />,
  'software-engineering': <FaLaptopCode />,
  'cybersecurity': <FaShieldAlt />,
  'finance': <FaDollarSign />,
  'accounting': <FaCalculator />,
  'economics': <FaUniversity />,
  'marketing': <FaBullhorn />,
  'operations': <FaCogs />,
  'project-management': <FaTasks />,
  'psychology': <FaBrain />,
  'design-creative': <FaPalette />,
  'linguistics': <FaLanguage />,
  'communication-studies': <FaBroadcastTower />,
  'law': <FaBalanceScale />,
  'writing': <FaFileAlt />,
  'career-coaching': <FaUserTie />,
  'others': <FaEllipsisH />,
};


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

const DEFAULT_TIME_ZONE = getDefaultTimeZone();


const INITIAL_FORM_STATE = {
  learningGoal: '国际课程 / 升学',
  courseDirection: '',
  courseFocus: '',
  format: '线上授课',
  milestone: '',
  availability: DEFAULT_TIME_ZONE,
  contactName: '',
  contactMethod: '微信',
  contactValue: '',
};

const PAGE_TRANSITION_DURATION = 600;

function StudentCourseRequestPage() {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDirectionSelection, setIsDirectionSelection] = useState(false);
  const [transitionStage, setTransitionStage] = useState('idle');
  const pendingActionRef = useRef(null);
  const isMountedRef = useRef(true);

  // ----- Schedule step local states -----
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [is24h, setIs24h] = useState(true);

  useEffect(() => () => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;   // 卸载时再关掉
    };
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

  // Custom Select: Time zone dropdown that centers current option
  const TimeZoneSelect = ({ id, value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
      if (!open) return;
      const listEl = listRef.current;
      if (!listEl) return;
      const idx = options.findIndex((o) => o.value === value);
      if (idx === -1) return;
      const itemEl = listEl.querySelector(`[data-index="${idx}"]`);
      if (!itemEl) return;
      // Scroll so that selected item is approximately centered
      const listHeight = listEl.clientHeight;
      const itemTop = itemEl.offsetTop;
      const itemHeight = itemEl.offsetHeight;
      const targetScroll = itemTop - Math.max(0, (listHeight - itemHeight) / 2);
      try {
        listEl.scrollTo({ top: targetScroll, behavior: 'auto' });
      } catch (_) {
        listEl.scrollTop = targetScroll;
      }
    }, [open, options, value]);

    useEffect(() => {
      const onDocClick = (e) => {
        if (!open) return;
        const btn = buttonRef.current;
        const list = listRef.current;
        if (btn && btn.contains(e.target)) return;
        if (list && list.contains(e.target)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', onDocClick);
      return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    const selectedLabel = useMemo(() => {
      const found = options.find((o) => o.value === value);
      return found ? found.label : '';
    }, [options, value]);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (!open && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (!open) return;
      const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(options.length - 1, currentIndex + 1);
        onChange({ target: { value: options[next].value } });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(0, currentIndex - 1);
        onChange({ target: { value: options[prev].value } });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setOpen(false);
      }
    };

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
          <span className="mx-select__caret" aria-hidden>▾</span>
        </button>
        {open && (
          <div className="mx-select__popover">
            <ul
              ref={listRef}
              role="listbox"
              aria-labelledby={id}
              className="mx-select__list"
            >
              {options.map((opt, index) => {
                const selected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    className={`mx-select__option ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange({ target: { value: opt.value } });
                      setOpen(false);
                    }}
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
  
  const isDirectionStep = currentStep.id === 'direction';
  const isDetailsStep = currentStep.id === 'details';
  const isScheduleStep = currentStep.id === 'schedule';
  
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
      if (currentStep.id === 'direction' && isDirectionSelection) {
        setIsDirectionSelection(false);
        return;
      }

      if (currentStepIndex === 0) {
        navigate('/student');
        return;
      }

      if (currentStep.id === 'details') {
        setIsDirectionSelection(true);
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
    transitionClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const stepContentClassName = [
    'step-content',
    (isDirectionStep || isDetailsStep) ? 'direction-layout' : '',
    isDirectionSelectionStage ? 'direction-selection' : '',
    isScheduleStep ? 'schedule-content' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const stepFooterClassName = ['step-footer', transitionClassName].filter(Boolean).join(' ');

  const units = currentStepIndex === 0 ? (isDirectionSelection ? 1 : 0) : currentStepIndex + 1;
  const progress = (units / STEPS.length) * 100;
  //const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

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

  // Start-of-today reference for past/future checks
  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const handlePrevMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const handleNextMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const formatTime = (h, m) => {
    if (is24h) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const hour12 = (h % 12) || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const timeSlots = useMemo(() => {
    const arr = [];
    for (let h = 9; h <= 23; h++) {
      for (let m = 0; m < 60; m += 15) {
        arr.push({ h, m, label: formatTime(h, m) });
      }
    }
    return arr;
  }, [is24h]);

  const ScheduleTimesPanel = () => {
    const weekday = zhDays[selectedDate.getDay()];
    const day = selectedDate.getDate();
    return (
      <div className="schedule-times-panel">
        <div className="times-panel-header">
          <div className="day-title">{weekday} {day}</div>
          <div className="time-format-toggle" role="group" aria-label="时间格式">
            <button
              type="button"
              className={`toggle-btn ${!is24h ? 'active' : ''}`}
              onClick={() => setIs24h(false)}
            >
              12 小时
            </button>
            <button
              type="button"
              className={`toggle-btn ${is24h ? 'active' : ''}`}
              onClick={() => setIs24h(true)}
            >
              24 小时
            </button>
          </div>
        </div>
        <div className="times-list" role="list">
          {timeSlots.map((t, idx) => (
            <div key={`${t.h}-${t.m}-${idx}`} role="listitem" className="time-slot">
              <span className="dot" aria-hidden></span>
              <span className="time-text">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'direction':
        if (!isDirectionSelection) {
          return null;
        }
        return (
          <div className="direction-select">
            <div className="direction-grid" role="list">
              {DIRECTION_OPTIONS.map((option, index) => {
                const isActive = formData.courseDirection === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="listitem"
                    className={`direction-card ${isActive ? 'active' : ''}`}
                    style={{ '--card-index': index }}
                    onClick={() => {
                      setFormData((previous) => ({
                        ...previous,
                        courseDirection: option.id,
                        learningGoal: option.label,
                      }));
                    }}
                  >
                    <span className="direction-card__icon" aria-hidden="true">
                      {DIRECTION_ICONS[option.id] || <FaEllipsisH />}
                    </span>
                    <span className="direction-card__title">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case 'details':
        return (
          <div className="step-field-stack">
            <label className="field-label" htmlFor="courseFocus">想重点提升的内容</label>
            <textarea
              id="courseFocus"
              placeholder="例如： Biomedical Engineering这门课的Quiz1和Quiz2需要讲解。"
              value={formData.courseFocus}
              onChange={handleChange('courseFocus')}
              rows={5}
            />

            <label className="field-label" htmlFor="milestone">希望达成的目标或里程碑</label>
            <textarea
              id="milestone"
              type="text"
              placeholder="例如：6周后期末考试稳分达到A"
              value={formData.milestone}
              onChange={handleChange('milestone')}
            />
          </div>
        );
      case 'schedule': {
        return (
          <div className="step-field-stack">
            <label className="field-label" htmlFor="availability">选择首课时区</label>
            <TimeZoneSelect
              id="availability"
              value={formData.availability}
              onChange={handleChange('availability')}
              options={orderedTimeZoneOptions}
            />
            <div className="calendar-card" aria-label="可授课时间日历">
              <div className="calendar-header">
                <div className="month-label">{monthLabel}</div>
                <div className="calendar-nav">
                  <button type="button" className="nav-btn" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="上个月">‹</button>
                  <button type="button" className="nav-btn" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="下个月">›</button>
                </div>
              </div>
              <div className="calendar-grid">
                {zhDays.map((d) => (
                  <div key={d} className="day-name">{d}</div>
                ))}
                {buildCalendarGrid.map(({ date, outside }) => {
                  if (outside) {
                    return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
                  }
                  const isToday = isSameDay(date, new Date());
                  const selected = isSameDay(date, selectedDate);
                  const isPast = (() => {
                    const d = new Date(date);
                    d.setHours(0, 0, 0, 0);
                    return d.getTime() < todayStart.getTime();
                  })();
                  const cls = [
                    'date-cell',
                    isToday ? 'today' : '',
                    selected ? 'selected' : '',
                    isPast ? 'past' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      className={cls}
                      onClick={() => {
                        setSelectedDate(date);
                        if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                          setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                        }
                      }}
                    >
                      <span className="date-number">{date.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }
      case 'contact':
        return (
          <div className="step-field-stack">
            <div className="inline-fields">
              <div className="inline-field">
                <label className="field-label" htmlFor="contactName">称呼</label>
                <input
                  id="contactName"
                  type="text"
                  placeholder="填写你的姓名或昵称"
                  value={formData.contactName}
                  onChange={handleChange('contactName')}
                />
              </div>
              <div className="inline-field">
                <label className="field-label" htmlFor="contactMethod">联系偏好</label>
                <select id="contactMethod" value={formData.contactMethod} onChange={handleChange('contactMethod')}>
                  <option value="微信">微信</option>
                  <option value="邮箱">邮箱</option>
                  <option value="手机号">手机号</option>
                </select>
              </div>
            </div>

            <label className="field-label" htmlFor="contactValue">联系方式</label>
            <input
              id="contactValue"
              type="text"
              placeholder="请输入你的微信号、邮箱或手机号"
              value={formData.contactValue}
              onChange={handleChange('contactValue')}
            />

            <p className="helper-text">信息仅用于 MentorX 学习顾问联系你，不会对外公开。</p>
          </div>
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
  //const isDirectionSelectionStage = isDirectionStep && isDirectionSelection;

  return (
    <div className="course-request-page">
      <main className="request-flow">
        <div className="request-shell">
          <header className="step-header">
            <BrandMark to="/student" />
            <div className="step-header-actions">
              <button type="button" className="ghost-button">保存并退出</button>
            </div>
          </header>

          <section className={stepLayoutClassName}>
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
                    ? '以下哪一项最准确描述了你希望提升的课程？'
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
                  <div className="schedule-sidebar">
                    <div className="calendar-card slim" aria-label="可授课时间日历">
                      <div className="calendar-header">
                        <div className="month-label">{monthLabel}</div>
                        <div className="calendar-nav">
                          <button type="button" className="nav-btn" onClick={handlePrevMonth} aria-label="上个月">‹</button>
                          <button type="button" className="nav-btn" onClick={handleNextMonth} aria-label="下个月">›</button>
                        </div>
                      </div>
                      <div className="calendar-grid">
                        {zhDays.map((d) => (
                          <div key={d} className="day-name">{d}</div>
                        ))}
                        {buildCalendarGrid.map(({ date, outside }) => {
                          if (outside) {
                            return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
                          }
                          const isToday = isSameDay(date, new Date());
                          const selected = isSameDay(date, selectedDate);
                          const isPast = (() => {
                            const d = new Date(date);
                            d.setHours(0, 0, 0, 0);
                            return d.getTime() < todayStart.getTime();
                          })();
                          const cls = [
                            'date-cell',
                            isToday ? 'today' : '',
                            selected ? 'selected' : '',
                            isPast ? 'past' : '',
                          ].filter(Boolean).join(' ');
                          return (
                            <button
                              key={date.toISOString()}
                              type="button"
                              className={cls}
                              onClick={() => {
                                setSelectedDate(date);
                                if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                                  setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                                }
                              }}
                            >
                              <span className="date-number">{date.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <ScheduleTimesPanel />
                  </div>
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
        </div>
      </main>
    </div>
  );
}

export default StudentCourseRequestPage;







