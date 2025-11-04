import React, { useEffect, useMemo, useState } from 'react';
import './MentorProfileEditorPage.css';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';

function MentorProfileEditorPage() {
  const navigate = useNavigate();

  // 简化的资料字段
  const [name, setName] = useState('');
  const [degree, setDegree] = useState(''); // 本科 / 硕士 / PhD
  const [school, setSchool] = useState('');
  const [timezone, setTimezone] = useState(''); // 例：UTC+8 (北京)
  const [coursesInput, setCoursesInput] = useState(''); // 逗号分隔

  const courses = useMemo(
    () => coursesInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    [coursesInput]
  );

  // 进入页面时校验权限；未登录或审核未通过不允许停留
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/api/mentor/permissions');
        if (!alive) return;
        if (!res?.data?.canEditProfile) {
          alert(res?.data?.error || '暂不可编辑个人名片');
          navigate('/mentor', { replace: true });
        }
      } catch (e) {
        if (!alive) return;
        const status = e?.response?.status;
        const msg = e?.response?.data?.error;
        if (status === 401) {
          try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: '/mentor/profile-editor' } })); } catch {}
          alert('请先登录');
          navigate('/mentor', { replace: true });
          return;
        }
        if (status === 403) {
          alert(msg || '导师审核中，暂不可编辑个人名片');
          navigate('/mentor', { replace: true });
          return;
        }
        alert(msg || '加载失败，请稍后再试');
        navigate('/mentor', { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  const previewData = useMemo(() => ({
    name: name || '导师姓名',
    degree: degree || '',
    school: school || '',
    timezone: timezone || '',
    courses: courses.length ? courses : [],
  }), [name, degree, school, timezone, courses]);

  return (
    <div className="mx-editor-page">
      {/* 顶部仅保留 MentorX 标志，位置与导航一致 */}
      <header className="mx-editor-header">
        <div className="container">
          <BrandMark className="nav-logo-text" to="/mentor" />
        </div>
      </header>

      <main className="mx-editor-main">
        <div className="container mx-editor-grid">
          {/* 左侧：表单 */}
          <section className="mx-editor-form">
            <h2 className="form-title">编辑个人名片</h2>

            <div className="form-row">
              <label htmlFor="mx-name">名字</label>
              <input id="mx-name" type="text" placeholder="请输入姓名"
                     value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-degree">学历</label>
              <select id="mx-degree" value={degree} onChange={(e) => setDegree(e.target.value)}>
                <option value="">选择学历</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="PhD">PhD</option>
              </select>
            </div>

            <div className="form-row">
              <label htmlFor="mx-school">学校名称</label>
              <input id="mx-school" type="text" placeholder="例如：哈佛大学"
                     value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-timezone">时区</label>
              <input id="mx-timezone" type="text" placeholder="例如：UTC+8 (北京)"
                     value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="mx-courses">可授课课程</label>
              <input id="mx-courses" type="text" placeholder="用逗号分隔多个课程，例如：Python编程, 机器学习, 深度学习"
                     value={coursesInput} onChange={(e) => setCoursesInput(e.target.value)} />
              {courses.length > 0 && (
                <div className="chips-preview">
                  {courses.map((c) => (
                    <span key={c} className="chip-item">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 右侧：实时预览 */}
          <aside className="mx-editor-preview">
            <div className="preview-wrap">
              <MentorListingCard data={previewData} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default MentorProfileEditorPage;

