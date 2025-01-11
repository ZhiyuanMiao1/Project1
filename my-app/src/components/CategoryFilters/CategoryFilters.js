import React, { useState } from 'react';
import './CategoryFilters.css';
import { 
  FaCode, 
  FaProjectDiagram, 
  FaCalculator, 
  FaChartPie, 
  FaRobot, 
  FaAtom, 
  FaChartBar, 
  FaDollarSign, 
  FaFileAlt, 
  FaEllipsisH, 
  FaBuilding, 
  FaBullhorn, 
  FaCogs,  
  FaGlobe,  
  FaBalanceScale,
} from 'react-icons/fa';

function CategoryFilters() {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const categories = [
    { name: '编程基础', icon: <FaCode /> },
    { name: '数据结构与算法', icon: <FaProjectDiagram /> },
    { name: '高等数学', icon: <FaCalculator /> },
    { name: '概率与统计', icon: <FaChartPie /> },
    { name: '机器学习', icon: <FaRobot /> },
    { name: '物理学', icon: <FaAtom /> },
    { name: '数据分析', icon: <FaChartBar /> },
    { name: '金融学', icon: <FaDollarSign /> },
    { name: '论文润色', icon: <FaFileAlt /> },
    { name: '会计基础', icon: <FaCalculator /> },
    { name: '企业管理', icon: <FaBuilding /> },
    { name: '市场营销', icon: <FaBullhorn /> },
    { name: '运营管理', icon: <FaCogs /> },
    { name: '宏观经济学', icon: <FaGlobe /> },
    { name: '微观经济学', icon: <FaChartBar /> },
    { name: '法律', icon: <FaBalanceScale /> },
    { name: '其它', icon: <FaEllipsisH /> },
  ];

  return (
    <div className="category-filters">
      <div className="container category-container">
        {categories.map((cat, idx) => (
          <div
            key={idx}
            className={`category-item ${selectedCategory === idx ? 'selected' : ''}`}
            onClick={() => setSelectedCategory(idx)} // 点击时设置选中状态
          >
            <div className="category-icon">{cat.icon}</div>
            <div className="category-text">{cat.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CategoryFilters;

