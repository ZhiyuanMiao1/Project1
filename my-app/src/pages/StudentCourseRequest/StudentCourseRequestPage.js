import React, { useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import { FaFileAlt, FaGlobe, FaClock, FaCalendarAlt, FaHeart, FaLightbulb, FaGraduationCap, FaTasks } from 'react-icons/fa';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP, COURSE_TYPE_OPTIONS } from '../../constants/courseMappings';
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


