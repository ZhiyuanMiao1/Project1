import React, { useState } from 'react';
import MentorNavbar from '../../components/Navbar/MentorNavbar';
import './MentorProfileEditorPage.css';

const INITIAL_PROFILE = {
  avatar: '',
  displayName: '',
  tagline: '',
  summary: '',
  expertise: '',
  achievements: '',
  languages: '中文 (普通话)',
  hourlyRate: '',
  sessionFormat: '线上授课',
  availability: '',
  trialLesson: true,
  highlights: '',
};

function MentorProfileEditorPage() {
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [saved, setSaved] = useState(false);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSaved(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSaved(true);
  };

  const handleReset = () => {
    setProfile(INITIAL_PROFILE);
    setSaved(false);
  };

  return (
    <div className="mentor-profile-editor-page">
      <MentorNavbar />

      <main className="profile-editor-content">
        <section className="profile-hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="hero-eyebrow">打造高转化导师名片</span>
              <h1>编辑个人名片，展示你的教学价值</h1>
              <p>
                完整的个人品牌介绍可以帮助学生快速判断匹配度。完善你的学术背景、授课风格以及过往成果，MentorX 将为你推荐更精准的学员。
              </p>
              <ul className="hero-highlights">
                <li>
                  <span className="highlight-icon">💼</span>
                  展示专业背景与成功案例，增强信任感。
                </li>
                <li>
                  <span className="highlight-icon">🗣️</span>
                  多语言能力与授课形式清晰呈现，帮助学生快速选择。
                </li>
                <li>
                  <span className="highlight-icon">⚡</span>
                  智能匹配更高质量的学生需求，提升转化效率。
                </li>
              </ul>
            </div>
            <div className="hero-guidance">
              <h3>名片优化建议</h3>
              <ol>
                <li><span>1</span> 明确你的擅长项目与教学成果</li>
                <li><span>2</span> 说明授课方式与时间安排</li>
                <li><span>3</span> 补充可信的学员评价或案例</li>
                <li><span>4</span> 上传专业形象照强化品牌感</li>
              </ol>
              <p className="hero-tip">完成度越高，曝光与匹配机会越多</p>
            </div>
          </div>
        </section>

        <section className="profile-editor-section">
          <div className="container editor-grid">
            <div className="editor-card">
              <h2>个人名片信息</h2>
              <p className="editor-subtitle">编辑以下内容以展示你的专业能力与教学优势。</p>

              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <label htmlFor="avatar">头像链接</label>
                  <input
                    id="avatar"
                    type="url"
                    placeholder="粘贴一张清晰的专业形象照链接"
                    value={profile.avatar}
                    onChange={handleChange('avatar')}
                  />
                </div>

                <div className="form-row inline">
                  <div className="inline-field">
                    <label htmlFor="displayName">导师称呼</label>
                    <input
                      id="displayName"
                      type="text"
                      placeholder="例如：李老师 / Ms. Li"
                      value={profile.displayName}
                      onChange={handleChange('displayName')}
                      required
                    />
                  </div>
                  <div className="inline-field">
                    <label htmlFor="hourlyRate">期望时薪 (元)</label>
                    <input
                      id="hourlyRate"
                      type="number"
                      min="0"
                      placeholder="例如：400"
                      value={profile.hourlyRate}
                      onChange={handleChange('hourlyRate')}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label htmlFor="tagline">一句话标签</label>
                  <input
                    id="tagline"
                    type="text"
                    placeholder="用一句话总结你的教学亮点"
                    value={profile.tagline}
                    onChange={handleChange('tagline')}
                    required
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="summary">导师简介</label>
                  <textarea
                    id="summary"
                    placeholder="介绍你的教学背景、教育经历以及教学理念"
                    value={profile.summary}
                    onChange={handleChange('summary')}
                    rows="4"
                    required
                  />
                </div>

                <div className="form-row inline">
                  <div className="inline-field">
                    <label htmlFor="expertise">擅长项目</label>
                    <textarea
                      id="expertise"
                      placeholder="列出主要科目或考试项目，例如：AP 微积分、雅思写作"
                      value={profile.expertise}
                      onChange={handleChange('expertise')}
                      rows="3"
                      required
                    />
                  </div>
                  <div className="inline-field">
                    <label htmlFor="achievements">教学成果</label>
                    <textarea
                      id="achievements"
                      placeholder="展示优秀学员案例或成绩提升数据"
                      value={profile.achievements}
                      onChange={handleChange('achievements')}
                      rows="3"
                    />
                  </div>
                </div>

                <div className="form-row inline">
                  <div className="inline-field">
                    <label htmlFor="languages">授课语言</label>
                    <input
                      id="languages"
                      type="text"
                      placeholder="例如：中文、英文、粤语"
                      value={profile.languages}
                      onChange={handleChange('languages')}
                    />
                  </div>
                  <div className="inline-field">
                    <label htmlFor="sessionFormat">授课形式</label>
                    <select
                      id="sessionFormat"
                      value={profile.sessionFormat}
                      onChange={handleChange('sessionFormat')}
                    >
                      <option value="线上授课">线上授课</option>
                      <option value="线下面授">线下面授</option>
                      <option value="线上+线下">线上 + 线下</option>
                    </select>
                  </div>
                </div>

                <div className="form-row inline">
                  <div className="inline-field">
                    <label htmlFor="availability">可授课时间</label>
                    <input
                      id="availability"
                      type="text"
                      placeholder="例如：工作日晚 7-10 点；周末全天"
                      value={profile.availability}
                      onChange={handleChange('availability')}
                    />
                  </div>
                  <div className="inline-field checkbox-field">
                    <label htmlFor="trialLesson">是否提供试课</label>
                    <div className="checkbox-wrapper">
                      <input
                        id="trialLesson"
                        type="checkbox"
                        checked={profile.trialLesson}
                        onChange={handleChange('trialLesson')}
                      />
                      <span>提供一次免费/折扣试课</span>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <label htmlFor="highlights">教学亮点标签</label>
                  <input
                    id="highlights"
                    type="text"
                    placeholder="用逗号分隔多个标签，例如：冲刺提分, 双语授课, 考前陪跑"
                    value={profile.highlights}
                    onChange={handleChange('highlights')}
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-button">保存名片</button>
                  <button type="button" className="secondary-button" onClick={handleReset}>
                    重置内容
                  </button>
                </div>

                {saved && (
                  <div className="save-feedback">
                    <h3>保存成功！</h3>
                    <p>你的名片已更新。MentorX 团队会优先推荐与之匹配的学生。</p>
                  </div>
                )}
              </form>
            </div>

            <aside className="preview-column">
              <div className="preview-card">
                <div className="preview-header">
                  <div className="preview-avatar">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="导师头像" />
                    ) : (
                      <span className="avatar-placeholder">上传头像</span>
                    )}
                  </div>
                  <div className="preview-meta">
                    <h3>{profile.displayName || '导师姓名'}</h3>
                    <p className="preview-tagline">{profile.tagline || '一句话展示你的教学亮点'}</p>
                    <div className="preview-tags">
                      {(profile.highlights || '教学设计, 考试冲刺').split(',').slice(0, 3).map((tag) => (
                        <span key={tag.trim()} className="preview-tag">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="preview-section">
                  <h4>导师介绍</h4>
                  <p>{profile.summary || '介绍你的教学背景、教育经历以及教学理念。'}</p>
                </div>

                <div className="preview-section">
                  <h4>擅长项目</h4>
                  <p>{profile.expertise || '列出主要科目或考试项目，例如：AP 微积分、雅思写作。'}</p>
                </div>

                <div className="preview-section">
                  <h4>教学成果</h4>
                  <p>{profile.achievements || '填写学员提升数据或拿下录取 offer 等案例。'}</p>
                </div>

                <div className="preview-footer">
                  <div className="preview-info">
                    <span>{profile.languages || '授课语言'}</span>
                    <span>{profile.sessionFormat}</span>
                    <span>{profile.trialLesson ? '提供试课' : '暂不提供试课'}</span>
                  </div>
                  <div className="preview-rate">
                    {profile.hourlyRate ? `¥${profile.hourlyRate}/小时` : '设置你的期望时薪'}
                  </div>
                </div>

                <div className="preview-availability">
                  <h4>可授课时间</h4>
                  <p>{profile.availability || '描述你每周的授课时间安排。'}</p>
                </div>
              </div>

              <div className="support-card">
                <h3>导师成长工具</h3>
                <ul>
                  <li>名片文案模板与面试指南</li>
                  <li>教学成果量化表格</li>
                  <li>MentorX 品牌视觉素材下载</li>
                </ul>
                <button className="support-button">下载工具包</button>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

export default MentorProfileEditorPage;
