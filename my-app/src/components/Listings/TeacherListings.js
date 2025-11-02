import React, { useEffect, useState } from 'react';
import TeacherListingCard from '../ListingCard/TeacherListingCard';
import './Listings.css';

function TeacherListings() {
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);

  const computeCanView = () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return false;
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      const role = user?.role || (Array.isArray(user?.roles) && user.roles.includes('mentor') ? 'mentor' : undefined);
      return role === 'mentor';
    } catch {
      return false;
    }
  };
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);
  
  // 初始化与监听登录/角色变更
  useEffect(() => {
    setCanView(computeCanView());

    const onAuthChanged = (e) => {
      const isLoggedIn = !!(e?.detail?.isLoggedIn ?? localStorage.getItem('authToken'));
      const role = e?.detail?.role;
      if (isLoggedIn && role === 'mentor') {
        setCanView(true);
      } else {
        setCanView(computeCanView());
      }
    };
    const onStorage = (ev) => {
      if (ev.key === 'authToken' || ev.key === 'authUser') {
        setCanView(computeCanView());
      }
    };
    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
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
      courseType: '选课指导',
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
      courseType: '作业项目',
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
      courseType: '期末复习',
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
      courseType: '课前预习',
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
      courseType: '毕业论文',
    },
    {
      id: 5,
      degree: '硕士',
      school: '加州大学伯克利分校',
      courses: ['机器学习'],
      timezone: 'UTC-8 (加州)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-06',
      requirements: '希望讲解常见模型与调参技巧',
      milestone: '完成一次模型训练与评估',
      courseType: '作业项目',
    },
    {
      id: 6,
      degree: '本科',
      school: '牛津大学',
      courses: ['算法设计'],
      timezone: 'UTC+0 (伦敦)',
      expectedDuration: '2小时',
      expectedTime: '2025-02-07',
      requirements: '带着做几道算法题',
      milestone: '掌握贪心与动态规划',
      courseType: '期末复习',
    },
    {
      id: 7,
      degree: '博士',
      school: '清华大学',
      courses: ['操作系统'],
      timezone: 'UTC+8 (北京)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-08',
      requirements: '辅导课程设计，讲解内核基本概念',
      milestone: '完成内核模块小作业',
      courseType: '课前预习',
    },
    {
      id: 8,
      degree: '硕士',
      school: '普林斯顿大学',
      courses: ['概率论'],
      timezone: 'UTC-5 (纽约)',
      expectedDuration: '1.5小时',
      expectedTime: '2025-02-09',
      requirements: '强化随机变量与分布，结合例题',
      milestone: '能解常见概率题',
      courseType: '选课指导',
    },
    {
      id: 9,
      degree: '本科',
      school: '香港大学',
      courses: ['数据库系统'],
      timezone: 'UTC+8 (香港)',
      expectedDuration: '2小时',
      expectedTime: '2025-02-10',
      requirements: '讲解事务、索引与优化器',
      milestone: '完成一次 SQL 调优',
      courseType: '作业项目',
    },
    {
      id: 10,
      degree: '硕士',
      school: '东京大学',
      courses: ['线性代数'],
      timezone: 'UTC+9 (东京)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-11',
      requirements: '复习矩阵分解与向量空间',
      milestone: '掌握 SVD 与特征值',
      courseType: '期末复习',
    },
    {
      id: 11,
      degree: 'PhD',
      school: '苏黎世联邦理工',
      courses: ['计算机网络'],
      timezone: 'UTC+1 (苏黎世)',
      expectedDuration: '1.5小时',
      expectedTime: '2025-02-12',
      requirements: '带做 Wireshark 抓包实验',
      milestone: '理解 TCP/HTTP 关键机制',
      courseType: '其它类型',
    },
    {
      id: 12,
      degree: '本科',
      school: '北京大学',
      courses: ['数理逻辑'],
      timezone: 'UTC+8 (北京)',
      expectedDuration: '2小时',
      expectedTime: '2025-02-13',
      requirements: '讲常用推理规则与证明方法',
      milestone: '能完成课后题与证明练习',
      courseType: '课前预习',
    },
    {
      id: 13,
      degree: '硕士',
      school: '新加坡国立大学',
      courses: ['数据可视化'],
      timezone: 'UTC+8 (新加坡)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-14',
      requirements: '练习使用 D3/Plotly 实现图表',
      milestone: '完成一个数据看板小项目',
      courseType: '作业项目',
    },
    {
      id: 14,
      degree: '本科',
      school: '复旦大学',
      courses: ['微观经济学'],
      timezone: 'UTC+8 (上海)',
      expectedDuration: '1小时',
      expectedTime: '2025-02-15',
      requirements: '考前速成课，梳理核心模型',
      milestone: '掌握常见题型与解题思路',
      courseType: '期末复习',
    },
  ];

  return (
    <div className="listings container">
      <div className="listing-grid">
        {!canView ? (
          <div
            className="sk-card"
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '160px',
              fontSize: '18px',
              color: '#000000',
              textAlign: 'center',
            }}
          >
            只有完成导师注册的用户才能访问此内容
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherListings;
