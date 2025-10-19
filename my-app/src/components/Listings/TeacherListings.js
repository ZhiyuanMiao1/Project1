import React, { useEffect, useState } from 'react';
import TeacherListingCard from '../ListingCard/TeacherListingCard';
import './Listings.css';

function TeacherListings() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);
  const listingData = [
    {
      id: 1,
      degree: 'PhD',
      school: '哈佛大学',
      courses: ['Python编程'],
      timezone: 'UTC+8 (北京)',
      expectedDuration: '2小时',
      expectedTime: '2025-02-01',
      requirements: '需要详细讲解算法原理，最好有课件，能够手把手编写代码 debug',
      milestone: '夯实基础，完成一个小项目',
      courseType: 'Programming',
    },
    {
      id: 32,
      degree: '硕士',
      school: '斯坦福大学',
      courses: ['深度学习'],
      timezone: 'UTC-7 (加州)',
      expectedDuration: '1.5小时',
      expectedTime: '2025-02-02',
      requirements: '希望使用案例教学，提供相关代码',
      milestone: '能独立实现一个 DL 模型小 demo',
      courseType: 'Assignment',
    },
    {
      id: 3,
      degree: '本科',
      school: '麻省理工学院',
      courses: ['数据分析'],
      timezone: 'UTC+1 (伦敦)',
      expectedDuration: '2小时',
      expectedTime: '2025-02-03',
      requirements: '讲解统计建模方法，并提供实战练习',
      milestone: '掌握常用统计模型与评估',
      courseType: 'Exam Review',
    },
    {
      id: 24,
      degree: '高中',
      school: '清华附中',
      courses: ['高等数学'],
      timezone: 'UTC+8 (北京)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-04',
      requirements: '讲解微积分基础，提供练习题',
      milestone: '巩固微积分核心概念，完成题单',
      courseType: 'Pre-class Preparation',
    },
    {
      id: 35,
      degree: 'PhD',
      school: '剑桥大学',
      courses: ['线性代数'],
      timezone: 'UTC+0 (伦敦)',
      expectedDuration: '2.5小时',
      expectedTime: '2025-02-05',
      requirements: '需要详细讲解矩阵运算和概率分布',
      milestone: '能熟练运用线代工具解决问题',
      courseType: 'Graduation Thesis',
    },
  ];

  return (
    <div className="listings container">
      <div className="listing-grid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk-card">
                <div className="sk sk-title" style={{ width: '40%', marginTop: 6 }} />
                <div className="sk-chips" style={{ justifyContent: 'flex-start' }}>
                  <div className="sk sk-chip" />
                  <div className="sk sk-chip" />
                </div>
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line short" />
              </div>
            ))
          : listingData.map((item) => <TeacherListingCard key={item.id} data={item} />)}
      </div>
    </div>
  );
}

export default TeacherListings;
