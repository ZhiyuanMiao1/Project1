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
                  <button type="button" className="nav-btn" aria-label="Prev month" disabled={viewMonth.getFullYear() === todayStart.getFullYear() && viewMonth.getMonth() === todayStart.getMonth()} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>&lsaquo;</button>
                  <button type="button" className="nav-btn" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>&rsaquo;</button>
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
                          <button type="button" className="nav-btn" aria-label="Prev month" disabled={viewMonth.getFullYear() === todayStart.getFullYear() && viewMonth.getMonth() === todayStart.getMonth()} onClick={handlePrevMonth}>&lsaquo;</button>
                          <button type="button" className="nav-btn" aria-label="Next month" onClick={handleNextMonth}>&rsaquo;</button>
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
