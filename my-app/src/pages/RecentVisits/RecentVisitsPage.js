import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import tutor1 from '../../assets/images/tutor1.jpg';
import tutor2 from '../../assets/images/tutor2.jpg';
import tutor3 from '../../assets/images/tutor3.jpg';
import tutor4 from '../../assets/images/tutor4.jpg';
import tutor5 from '../../assets/images/tutor5.jpg';
import tutor6 from '../../assets/images/tutor6.jpg';
import './RecentVisitsPage.css';

const RECENT_SECTIONS = [
  {
    id: 'sec-1113',
    dateLabel: '11月13日 星期四',
    visits: [
      {
        id: 'rv-mentor-01',
        name: 'Kelly · 系统设计',
        discipline: '系统设计 / 全栈',
        location: '远程 · 中英双语',
        time: '下午 3:20',
        rating: 4.9,
        students: 182,
        cover: tutor4,
        degree: '硕士',
        school: '斯坦福大学',
        timezone: 'UTC+8 (上海)',
        languages: '中文, 英语',
        tagline: '用真实分布式案例演练面试思路，输出可落地的设计文档。',
        tags: ['系统设计', '面试模拟'],
        defaultLiked: true,
      },
      {
        id: 'rv-mentor-02',
        name: '李老师 · 算法刷题',
        discipline: '算法 / 代码质量',
        location: '远程 · 每周 Evening',
        time: '上午 10:40',
        rating: 4.8,
        students: 236,
        cover: tutor2,
        degree: '硕士',
        school: '麻省理工学院',
        timezone: 'UTC-7 (加州)',
        languages: '英语, 中文',
        tagline: '一小时拆 3 题，讲解思路和高频坑位，附带代码点评。',
        tags: ['LeetCode', '算法班'],
      },
    ],
  },
  {
    id: 'sec-1110',
    dateLabel: '11月10日 星期一',
    visits: [
      {
        id: 'rv-mentor-03',
        name: 'Mia · 产品运营',
        discipline: '产品策略 / 增长',
        location: '可约周末 · 线上',
        time: '晚上 8:05',
        rating: 4.7,
        students: 143,
        cover: tutor3,
        degree: '硕士',
        school: '哥伦比亚大学',
        timezone: 'UTC+8 (上海)',
        languages: '中文, 英语',
        tagline: '把课题拆成复盘、实验和汇报三步走，帮你拿出能说服团队的方案。',
        tags: ['案例拆解', '增长策略'],
      },
      {
        id: 'rv-mentor-04',
        name: '陈老师 · 数据科学',
        discipline: '数据分析 / 可视化',
        location: '远程 · GMT+8',
        time: '下午 2:10',
        rating: 4.9,
        students: 201,
        cover: tutor1,
        degree: 'PhD',
        school: '哈佛大学',
        timezone: 'UTC+8 (上海)',
        languages: '中文, 英语',
        tagline: '用真实业务数据演示 A/B 测试与指标监控，提供仪表盘模板。',
        tags: ['数据分析', '商业案例'],
        defaultLiked: true,
      },
      {
        id: 'rv-mentor-05',
        name: 'Alex · 全栈工程',
        discipline: '前端 / 系统设计',
        location: '可中英文',
        time: '上午 9:15',
        rating: 4.6,
        students: 118,
        cover: tutor5,
        degree: '硕士',
        school: '加州大学伯克利分校',
        timezone: 'UTC+8 (上海)',
        languages: '中文, 英语',
        tagline: '前后端联调、性能优化与上线方案复盘，附带代码走查。',
        tags: ['前端性能', '系统演练'],
      },
      {
        id: 'rv-mentor-06',
        name: 'Joyce · 求职辅导',
        discipline: '面试 / 职业规划',
        location: '远程 · 快速约',
        time: '凌晨 12:20',
        rating: 4.7,
        students: 167,
        cover: tutor6,
        degree: '硕士',
        school: '芝加哥大学',
        timezone: 'UTC+8 (上海)',
        languages: '中文, 英语',
        tagline: '一对一简历精修 + 行业故事库演练，准备即将到来的面试。',
        tags: ['求职', '模拟面试'],
      },
    ],
  },
];

function RecentVisitsPage() {
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return !!localStorage.getItem('authToken');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        try {
          setIsLoggedIn(!!localStorage.getItem('authToken'));
        } catch {
          setIsLoggedIn(false);
        }
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const sections = useMemo(() => RECENT_SECTIONS, []);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/student/favorites');
    }
  };

  const normalizeCardData = (visit) => {
    const cleanName = (() => {
      const raw = visit.name || '';
      const parts = raw.split('·');
      return (parts[0] || raw).trim();
    })();
    return {
      name: cleanName,
      degree: visit.degree || '硕士',
      school: visit.school || '测试大学',
      courses: Array.isArray(visit.tags) && visit.tags.length > 0 ? visit.tags : [],
      timezone: visit.timezone || 'UTC+8 (上海)',
      courseType: '',
      expectedDuration: '',
      requirements: '',
    };
  };

  return (
    <div className="recent-page">
      <div className="container">
        <header className="recent-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle recent-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="recent-hero">
          <div className="recent-hero-left">
            <button
              type="button"
              className="recent-back"
              aria-label="返回收藏"
              onClick={handleBack}
            >
              <FiChevronLeft size={20} />
            </button>
            <div className="recent-hero-text">
              <h1>最近浏览</h1>
            </div>
          </div>
          <button
            type="button"
            className="recent-edit-link recent-hero-edit"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '完成' : '编辑'}
          </button>
        </section>

        <section className="recent-sections">
          {sections.map((section) => (
            <div className="recent-section" key={section.id}>
              <div className="recent-section-head">
                <div className="recent-date">{section.dateLabel}</div>
              </div>
              <div className="recent-grid" role="list">
                {section.visits.map((visit) => {
                  const cardData = normalizeCardData(visit);
                  return (
                    <div
                      className={`recent-card-shell ${editMode ? 'is-editing' : ''}`}
                      key={visit.id}
                      role="listitem"
                    >
                      {editMode && (
                        <button
                          type="button"
                          className="recent-edit-remove"
                          aria-label="移除此记录"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="recent-edit-remove-icon" aria-hidden="true" />
                        </button>
                      )}
                      <MentorListingCard data={cardData} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default RecentVisitsPage;
