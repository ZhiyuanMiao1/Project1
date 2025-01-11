import React from 'react';
import ListingCard from '../ListingCard/ListingCard';
import './Listings.css';
import tutor1Image from '../../assets/images/tutor1.jpg';
import tutor2Image from '../../assets/images/tutor2.jpg';
import tutor3Image from '../../assets/images/tutor3.jpg';
import tutor4Image from '../../assets/images/tutor4.jpg';
import tutor5Image from '../../assets/images/tutor5.jpg';
import tutor6Image from '../../assets/images/tutor6.jpg';

function Listings() {
  const listingData = [
    {
      id: 1,
      name: '张三',
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
      degree: 'MSc',
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
      degree: 'MSc',
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
      degree: 'MSc',
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
      degree: 'MSc',
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
        {listingData.map((item) => (
          <ListingCard key={item.id} data={item} />
        ))}
      </div>
    </div>
  );
}

export default Listings;

