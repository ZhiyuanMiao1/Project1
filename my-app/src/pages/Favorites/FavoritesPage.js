import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaHeart } from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import tutor1 from '../../assets/images/tutor1.jpg';
import tutor2 from '../../assets/images/tutor2.jpg';
import tutor3 from '../../assets/images/tutor3.jpg';
import tutor4 from '../../assets/images/tutor4.jpg';
import tutor5 from '../../assets/images/tutor5.jpg';
import tutor6 from '../../assets/images/tutor6.jpg';
import './FavoritesPage.css';

const collections = [
  {
    id: 'recent',
    title: '最近浏览',
    meta: '1周前',
    description: '你最近看过的导师会暂时保留在这里，方便随时回到上次的位置。',
    images: [tutor1, tutor2, tutor3, tutor4],
  },
  {
    id: 'ml',
    title: 'AI / 机器学习',
    meta: '已收藏 6 位导师',
    description: '算法、建模、科研写作的灵感随时可见。',
    images: [tutor6, tutor3, tutor2],
  },
  {
    id: 'communication',
    title: '语言与表达',
    meta: '已收藏 3 位导师',
    description: '演讲、写作与表达力训练集合。',
    images: [tutor4, tutor5, tutor1],
  },
];

function FavoritesPage() {
  const location = useLocation();
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const menuAnchorRef = useRef(null);

  const preferredRole = useMemo(() => {
    const fromState = location.state?.from;
    if (fromState === 'mentor' || fromState === 'student') return fromState;
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      return user?.role === 'mentor' ? 'mentor' : 'student';
    } catch {
      return 'student';
    }
  }, [location.state]);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const normalizedCollections = useMemo(() => {
    return collections.map((item) => {
      const source = Array.isArray(item.images) && item.images.length > 0 ? item.images : [tutor1, tutor2, tutor3, tutor4];
      const filled = [...source];
      while (filled.length < 4) {
        filled.push(source[filled.length % source.length]);
      }
      return { ...item, cover: filled.slice(0, 4) };
    });
  }, []);

  return (
    <div className="favorites-page">
      <div className="container">
        <header className="favorites-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle favorites-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => {
              if (preferredRole === 'mentor') {
                setShowMentorAuth(true);
              } else {
                setShowStudentAuth(true);
              }
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8"  x2="20" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="favorites-hero">
          <h1>收藏</h1>
        </section>

        <section className="favorites-grid">
          {normalizedCollections.map((item) => (
            <article
              key={item.id}
              className={`favorites-card ${item.id === 'recent' ? 'favorites-card--highlight' : ''}`}
            >
              <div className="favorites-cover">
                <div className="cover-grid">
                  {item.cover.map((src, idx) => (
                    <div key={idx} className={`cover-cell cover-cell-${idx}`}>
                      <img src={src} alt={`${item.title} 封面 ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="favorites-card-body">
                <div className="favorites-card-title">
                  <h3>{item.title}</h3>
                </div>
                <div className="favorites-meta recent-meta">{item.meta}</div>
              </div>
            </article>
          ))}

          <article className="favorites-card favorites-card--create">
            <div className="create-icon">
              <FaHeart />
            </div>
            <h3>创建新的收藏夹</h3>
            <p className="favorites-desc">按课程方向、导师风格或目标，整理出你的收藏分组。</p>
            <button type="button" className="create-btn">新建收藏</button>
          </article>
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
          alignOffset={20}
        />
      )}

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={20}
        />
      )}
    </div>
  );
}

export default FavoritesPage;
