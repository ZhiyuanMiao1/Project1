import React, { useMemo } from 'react';
import { FaEllipsisH, FaHeart } from 'react-icons/fa';
import BrandMark from '../../components/common/BrandMark/BrandMark';
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
    highlight: true,
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
          <BrandMark className="favorites-logo" to="/student" />
          <button className="favorites-kebab" aria-label="更多菜单">
            <FaEllipsisH />
          </button>
        </header>

        <section className="favorites-hero">
          <h1>收藏</h1>
          <p>把心仪的导师集中放在一个地方，随时回来挑选或继续沟通。</p>
        </section>

        <section className="favorites-grid">
          {normalizedCollections.map((item, index) => (
            <article
              key={item.id}
              className={`favorites-card ${item.highlight ? 'favorites-card--highlight' : ''} ${index === 0 ? 'favorites-card--first' : ''}`}
            >
              <div className="favorites-cover">
                <div className="cover-grid">
                  {item.cover.map((src, idx) => (
                    <div key={idx} className={`cover-cell cover-cell-${idx}`}>
                      <img src={src} alt={`${item.title} 封面 ${idx + 1}`} />
                    </div>
                  ))}
                </div>
                {item.id === 'recent' && <span className="cover-pill">最近浏览</span>}
              </div>
              <div className="favorites-card-body">
                <div className="favorites-card-title">
                  <h3>{item.title}</h3>
                  <span className="favorites-meta">{item.meta}</span>
                </div>
                <p className="favorites-desc">{item.description}</p>
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
    </div>
  );
}

export default FavoritesPage;
