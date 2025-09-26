import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentCourseRequestPage.css';
import BrandMark from '../../components/common/BrandMark/BrandMark';

const STEPS = [
  {
    id: 'direction',
    label: '第 1 步',
    title: '明确你的学习方向',
    description:
      '选择你当前最关注的学习目标，我们会据此定制导师推荐与课程方案。',
  },
  {
    id: 'details',
    label: '第 2 步',
    title: '补充课程细节',
    description:
      '告诉我们课程类型、希望的授课方式以及你期望达成的里程碑。',
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

const INITIAL_FORM_STATE = {
  learningGoal: '国际课程 / 升学',
  courseFocus: '',
  format: '线上授课',
  milestone: '',
  availability: '',
  budgetRange: '',
  contactName: '',
  contactMethod: '微信',
  contactValue: '',
};

function StudentCourseRequestPage() {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isCompleted, setIsCompleted] = useState(false);

  const currentStep = useMemo(() => STEPS[currentStepIndex], [currentStepIndex]);

  const handleChange = (field) => (event) => {
    setFormData((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  const handleNext = () => {
    if (currentStepIndex === STEPS.length - 1) {
      setIsCompleted(true);
      return;
    }
    setCurrentStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (currentStepIndex === 0) {
      navigate('/student');
      return;
    }
    setCurrentStepIndex((index) => Math.max(index - 1, 0));
  };

  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'direction':
        return (
          <div className="step-field-group">
            <label className="field-label">学习目标方向</label>
            <div className="pill-options">
              {['国际课程 / 升学', '语言能力提升', '标准化考试冲刺', '兴趣与拓展'].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`pill-option ${formData.learningGoal === option ? 'active' : ''}`}
                  onClick={() => setFormData((previous) => ({ ...previous, learningGoal: option }))}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="helper-text">你可以稍后在提案阶段进一步调整具体项目。</p>
          </div>
        );
      case 'details':
        return (
          <div className="step-field-stack">
            <label className="field-label" htmlFor="courseFocus">想重点提升的内容</label>
            <textarea
              id="courseFocus"
              placeholder="例如：A-Level 数学中函数与微积分模块需要查漏补缺。"
              value={formData.courseFocus}
              onChange={handleChange('courseFocus')}
              rows={4}
            />

            <div className="inline-fields">
              <div className="inline-field">
                <label className="field-label" htmlFor="format">授课形式</label>
                <select id="format" value={formData.format} onChange={handleChange('format')}>
                  <option value="线上授课">线上授课</option>
                  <option value="线下面授">线下面授</option>
                  <option value="线上 + 线下">线上 + 线下</option>
                </select>
              </div>
              <div className="inline-field">
                <label className="field-label" htmlFor="milestone">希望达成的里程碑</label>
                <input
                  id="milestone"
                  type="text"
                  placeholder="例如：6 周后雅思总分达到 7.5"
                  value={formData.milestone}
                  onChange={handleChange('milestone')}
                />
              </div>
            </div>
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
    return (
      <div className="course-request-page">        <main className="completion-content">
          <div className="completion-card">
            <h2>提交成功！</h2>
            <p>我们已经收到你的课程需求，学习顾问会在 24 小时内与你取得联系。</p>
            <div className="completion-actions">
              <button type="button" onClick={() => navigate('/student')}>
                返回学生首页
              </button>
              <button type="button" onClick={() => {
                setIsCompleted(false);
                setCurrentStepIndex(0);
              }}>
                重新填写
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

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

          <section className="step-layout">
            <div className="step-content">
              <span className="step-label">{currentStep.label}</span>
              <h1>{currentStep.title}</h1>
              <p className="step-description">{currentStep.description}</p>

              <div className="step-fields">{renderStepContent()}</div>
            </div>

            <div className="step-illustration" aria-label="插图预留区域">
              <div className="illustration-frame">在此替换为你的插画或课程视觉</div>
            </div>
          </section>

          <footer className="step-footer">
            <div className="step-progress">
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="step-actions">
              <button type="button" className="ghost-button" onClick={handleBack}>
                返回
              </button>
              <button type="button" className="primary-button" onClick={handleNext}>
                {currentStepIndex === STEPS.length - 1 ? '提交需求' : '下一步'}
              </button>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default StudentCourseRequestPage;





