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
    throw new Error('[dotlottie] 未找到可用导出（尝试了 Player/default/default.Player/DotLottiePlayer）');
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
    title: '告知时间与预算',
    description:
      'MentorX 会根据你的可授课时间与预算，为你匹配最适合的导师。',
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

const INITIAL_FORM_STATE = {
  learningGoal: '国际课程 / 升学',
  courseDirection: '',
  courseFocus: '',
  format: '线上授课',
  milestone: '',
  availability: '',
  budgetRange: '',
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
  
  const isDirectionStep = currentStep.id === 'direction';
  const isDetailsStep = currentStep.id === 'details';
  
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
  ]
    .filter(Boolean)
    .join(' ');

  const stepFooterClassName = ['step-footer', transitionClassName].filter(Boolean).join(' ');

  const units = currentStepIndex === 0 ? (isDirectionSelection ? 1 : 0) : currentStepIndex + 1;
  const progress = (units / STEPS.length) * 100;
  //const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

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
            <input
              id="milestone"
              type="text"
              placeholder="例如：6 周后期末考试稳分达到A"
              value={formData.milestone}
              onChange={handleChange('milestone')}
            />
          </div>
        );
      case 'schedule':
        return (
          <div className="step-field-stack">
            <label className="field-label" htmlFor="availability">可上课时间</label>
            <input
              id="availability"
              type="text"
              placeholder="例如：工作日晚 7-9 点；周六全天可安排"
              value={formData.availability}
              onChange={handleChange('availability')}
            />

            <label className="field-label" htmlFor="budgetRange">预算期望</label>
            <input
              id="budgetRange"
              type="text"
              placeholder="例如：350-450 元/小时"
              value={formData.budgetRange}
              onChange={handleChange('budgetRange')}
            />
          </div>
        );
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







