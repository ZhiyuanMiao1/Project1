import React, { useState } from 'react';
import StudentNavbar from '../../components/Navbar/StudentNavbar';
import './StudentCourseRequestPage.css';

const INITIAL_FORM_STATE = {
  subject: '',
  proficiency: '',
  goal: '',
  startTimeframe: '',
  availability: '',
  frequency: '',
  expectedBudget: '',
  preferredTeacher: '',
  contactMethod: 'email',
  notes: '',
};

function StudentCourseRequestPage() {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (event) => {
    setFormData((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM_STATE);
    setSubmitted(false);
  };

  return (
    <div className="course-request-page">
      <StudentNavbar />

      <main className="course-request-content">
        <section className="request-hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="hero-eyebrow">定制化学习从这里开始</span>
              <h1>发布课程需求，匹配理想导师</h1>
              <p>
                填写几项关键信息，MentorX 即可为你推荐合适的导师与课程方案。
                我们的顾问团队会在 24 小时内与你联系确认细节。
              </p>
              <ul className="hero-highlights">
                <li>
                  <span className="highlight-icon">🎯</span>
                  明确学习目标与时间安排，平台为你做智能匹配。
                </li>
                <li>
                  <span className="highlight-icon">🧑‍🏫</span>
                  海量认证导师实时响应，支持多语种与考试项目。
                </li>
                <li>
                  <span className="highlight-icon">🤝</span>
                  专属顾问一对一跟进，确保课程顺利落地。
                </li>
              </ul>
            </div>
            <div className="hero-card">
              <h3>提交流程</h3>
              <ol>
                <li><span>1</span> 填写需求表单</li>
                <li><span>2</span> 顾问回访确认</li>
                <li><span>3</span> 匹配导师方案</li>
                <li><span>4</span> 安排首课体验</li>
              </ol>
              <p className="hero-card-tip">平均匹配时间小于 12 小时</p>
            </div>
          </div>
        </section>

        <section className="request-form-section">
          <div className="container form-grid">
            <div className="form-column">
              <div className="form-card">
                <h2>填写课程需求</h2>
                <p className="form-subtitle">请尽量详细描述你的学习偏好，方便我们精准匹配。</p>

                <form onSubmit={handleSubmit}>
                  <div className="form-row">
                    <label htmlFor="subject">学习科目 / 项目</label>
                    <input
                      id="subject"
                      type="text"
                      placeholder="例如：IB HL Mathematics、雅思口语、商务英语"
                      value={formData.subject}
                      onChange={handleChange('subject')}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <label htmlFor="proficiency">目前水平</label>
                    <select
                      id="proficiency"
                      value={formData.proficiency}
                      onChange={handleChange('proficiency')}
                      required
                    >
                      <option value="">选择一个选项</option>
                      <option value="beginner">入门 / 零基础</option>
                      <option value="intermediate">中级</option>
                      <option value="advanced">高级 / 备考冲刺</option>
                    </select>
                  </div>

                  <div className="form-row">
                    <label htmlFor="goal">学习目标</label>
                    <textarea
                      id="goal"
                      placeholder="描述你希望达成的成果，例如目标分数、技能提升、学校面试等"
                      value={formData.goal}
                      onChange={handleChange('goal')}
                      rows="4"
                      required
                    />
                  </div>

                  <div className="form-row inline">
                    <div className="inline-field">
                      <label htmlFor="startTimeframe">希望开课时间</label>
                      <select
                        id="startTimeframe"
                        value={formData.startTimeframe}
                        onChange={handleChange('startTimeframe')}
                        required
                      >
                        <option value="">请选择</option>
                        <option value="week">一周内</option>
                        <option value="month">一月内</option>
                        <option value="flexible">时间灵活</option>
                      </select>
                    </div>
                    <div className="inline-field">
                      <label htmlFor="frequency">每周上课频率</label>
                      <select
                        id="frequency"
                        value={formData.frequency}
                        onChange={handleChange('frequency')}
                        required
                      >
                        <option value="">请选择</option>
                        <option value="1-2">每周 1-2 次</option>
                        <option value="3-4">每周 3-4 次</option>
                        <option value="intensive">密集冲刺</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row inline">
                    <div className="inline-field">
                      <label htmlFor="availability">可上课时间段</label>
                      <input
                        id="availability"
                        type="text"
                        placeholder="例如：工作日晚 7-9 点；周末全天"
                        value={formData.availability}
                        onChange={handleChange('availability')}
                        required
                      />
                    </div>
                    <div className="inline-field">
                      <label htmlFor="expectedBudget">预算范围</label>
                      <input
                        id="expectedBudget"
                        type="text"
                        placeholder="例如：300-400 元/小时"
                        value={formData.expectedBudget}
                        onChange={handleChange('expectedBudget')}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <label htmlFor="preferredTeacher">导师偏好（可选）</label>
                    <input
                      id="preferredTeacher"
                      type="text"
                      placeholder="学历背景、授课语言或授课风格等"
                      value={formData.preferredTeacher}
                      onChange={handleChange('preferredTeacher')}
                    />
                  </div>

                  <div className="form-row">
                    <label htmlFor="contactMethod">联系方式</label>
                    <div className="contact-options">
                      <label className={`contact-option ${formData.contactMethod === 'email' ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="contactMethod"
                          value="email"
                          checked={formData.contactMethod === 'email'}
                          onChange={handleChange('contactMethod')}
                        />
                        邮箱联系
                      </label>
                      <label className={`contact-option ${formData.contactMethod === 'phone' ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="contactMethod"
                          value="phone"
                          checked={formData.contactMethod === 'phone'}
                          onChange={handleChange('contactMethod')}
                        />
                        电话/微信
                      </label>
                    </div>
                  </div>

                  <div className="form-row">
                    <label htmlFor="notes">补充说明（可选）</label>
                    <textarea
                      id="notes"
                      placeholder="还有什么想让导师或顾问了解的吗？"
                      value={formData.notes}
                      onChange={handleChange('notes')}
                      rows="3"
                    />
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="submit-button">
                      提交需求
                    </button>
                    <button type="button" className="reset-button" onClick={handleReset}>
                      清空表单
                    </button>
                  </div>

                  {submitted && (
                    <div className="submit-feedback">
                      <h3>提交成功！</h3>
                      <p>我们的顾问会在 24 小时内与你取得联系，请保持通讯畅通。</p>
                    </div>
                  )}
                </form>
              </div>
            </div>

            <aside className="info-column">
              <div className="info-card">
                <h3>MentorX 服务承诺</h3>
                <ul>
                  <li>导师资质严格筛选，平均通过率低于 15%。</li>
                  <li>课前提供试听或试教，满意后再确认正式课。</li>
                  <li>全程顾问陪伴，帮你追踪学习进度与成果。</li>
                </ul>
              </div>

              <div className="info-card">
                <h3>热门课程项目</h3>
                <div className="tag-grid">
                  <span className="tag">AP 物理</span>
                  <span className="tag">IB TOK</span>
                  <span className="tag">A-Level Chemistry</span>
                  <span className="tag">雅思口语</span>
                  <span className="tag">托福写作</span>
                  <span className="tag">GMAT</span>
                  <span className="tag">K12 数学</span>
                  <span className="tag">竞赛辅导</span>
                </div>
              </div>

              <div className="support-card">
                <h3>需要帮助？</h3>
                <p>我们在线客服团队 9:00 - 23:00 随时待命，欢迎扫码添加微信或直接拨打顾问热线。</p>
                <button className="support-button">联系顾问</button>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

export default StudentCourseRequestPage;
