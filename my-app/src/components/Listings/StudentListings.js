import React, { useEffect, useMemo, useState } from 'react';
import StudentListingCard from '../ListingCard/StudentListingCard';
import './Listings.css';
import tutor1Image from '../../assets/images/tutor1.jpg';
import tutor2Image from '../../assets/images/tutor2.jpg';
import tutor3Image from '../../assets/images/tutor3.jpg';
import tutor4Image from '../../assets/images/tutor4.jpg';
import tutor5Image from '../../assets/images/tutor5.jpg';
import tutor6Image from '../../assets/images/tutor6.jpg';
import { fetchFavoriteItems } from '../../api/favorites';

function StudentListings() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());

  // 模拟加载动画，避免页面切换过于生硬
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch { setIsLoggedIn(false); }
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setFavoriteIds(new Set());
      return () => { alive = false; };
    }

    fetchFavoriteItems({ role: 'student', itemType: 'tutor', idsOnly: true })
      .then((res) => {
        if (!alive) return;
        const ids = Array.isArray(res?.data?.ids) ? res.data.ids : [];
        setFavoriteIds(new Set(ids.map(String)));
      })
      .catch(() => {
        if (!alive) return;
        setFavoriteIds(new Set());
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const favoriteIdSet = useMemo(() => favoriteIds, [favoriteIds]);
  const listingData = [
    {
      id: 1,
      name: '张三',
      gender: '男',
      degree: 'PhD',
      school: '哈佛大学',
      rating: 4.9,
      reviewCount: 120,
      courses: ['Python编程', '机器学习', '深度学习'],
      timezone: 'UTC+8 (北京)',
      languages: '中文, 英语',
      imageUrl: tutor1Image,
    },
    {
      id: 2,
      name: '李四',
      gender: '女',
      degree: '硕士',
      school: '斯坦福大学',
      rating: 4.8,
      reviewCount: 95,
      courses: ['深度学习', '自然语言处理'],
      timezone: 'UTC-7 (加州)',
      languages: '英语, 西班牙语',
      imageUrl: tutor2Image,
    },
    {
      id: 3,
      name: '王五',
      gender: '男',
      degree: 'PhD',
      school: '麻省理工学院',
      rating: 4.7,
      reviewCount: 80,
      courses: ['数据分析', '统计建模', '数据可视化', '大数据处理'],
      timezone: 'UTC+1 (伦敦)',
      languages: '英语, 德语',
      imageUrl: tutor3Image,
    },
    {
      id: 4,
      name: '赵六',
      gender: '男',
      degree: '本科',
      school: '清华大学',
      rating: 5.0,
      reviewCount: 150,
      courses: ['算法设计', '高等数学'],
      timezone: 'UTC +8 (北京)',
      languages: '中文, 英语',
      imageUrl: tutor4Image,
    },
    {
      id: 5,
      name: 'Emily Smith',
      gender: '女',
      degree: 'PhD',
      school: '剑桥大学',
      rating: 4.85,
      reviewCount: 60,
      courses: ['微积分', '高等代数', '线性代数', '概率论', '数值分析'],
      timezone: 'UTC+0 (伦敦)',
      languages: '英语, 法语',
      imageUrl: tutor5Image,
    },
    {
      id: 6,
      name: 'Michael Johnson',
      gender: '男',
      degree: '硕士',
      school: '加州理工学院',
      rating: 4.75,
      reviewCount: 45,
      courses: ['数据挖掘'],
      timezone: 'UTC-8 (加州)',
      languages: '英语',
      imageUrl: tutor6Image,
    },
    {
      id: 7,
      name: '刘强',
      gender: '男',
      degree: 'PhD',
      school: '香港大学',
      rating: 4.9,
      reviewCount: 100,
      courses: ['网络安全', '信息加密', '区块链技术', '密码学'],
      timezone: 'UTC+8 (香港)',
      languages: '中文, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 8,
      name: 'Anna Müller',
      gender: '女',
      degree: '本科',
      school: '慕尼黑工业大学',
      rating: 4.6,
      reviewCount: 50,
      courses: ['工程数学', '线性代数'],
      timezone: 'UTC+1 (德国)',
      languages: '德语, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 9,
      name: '田七',
      gender: '男',
      degree: 'PhD',
      school: '东京大学',
      rating: 5.0,
      reviewCount: 120,
      courses: ['物理学', '量子力学', '天体物理', '热力学', '统计力学'],
      timezone: 'UTC+9 (东京)',
      languages: '日语, 英语',
      imageUrl: null, // 使用默认头像
    },
    {
      id: 10,
      name: 'Carlos Lopez',
      gender: '男',
      degree: 'PhD',
      school: '墨西哥国立自治大学',
      rating: 4.8,
      reviewCount: 75,
      courses: ['统计学', '数据挖掘'],
      timezone: 'UTC-6 (墨西哥)',
      languages: '西班牙语, 英语',
      imageUrl: null, // 使用默认头像
    },
  ];

  return (
    <div className="listings container">
      <div className="listing-grid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk-card">
                <div className="sk sk-avatar" />
                <div className="sk sk-title" />
                <div className="sk-chips">
                  <div className="sk sk-chip" />
                  <div className="sk sk-chip" />
                </div>
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line short" />
              </div>
            ))
          : listingData.map((item) => (
              <StudentListingCard
                key={item.id}
                data={item}
                favoriteRole="student"
                favoriteItemType="tutor"
                favoriteItemId={item.id}
                initialFavorited={favoriteIdSet.has(String(item.id))}
                onFavoriteChange={(itemId, favorited) => {
                  setFavoriteIds((prev) => {
                    const next = new Set(prev);
                    if (favorited) next.add(String(itemId));
                    else next.delete(String(itemId));
                    return next;
                  });
                }}
              />
            ))}
      </div>
    </div>
  );
}

export default StudentListings;
