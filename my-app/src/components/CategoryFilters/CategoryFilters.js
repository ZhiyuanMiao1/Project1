import React, { useState, useRef } from 'react';
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
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';

function CategoryFilters() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const containerRef = useRef(null);

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

  const scrollLeft = () => {
    if (containerRef.current) {
      // 可以根据实际需求调整滚动距离
      containerRef.current.scrollLeft -= 200;
    }
  };

  const scrollRight = () => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += 200;
    }
  };

  return (
    <div className="category-filters">
      <button className="arrow left" onClick={scrollLeft}>
        <FaChevronLeft />
      </button>

      <div className="container category-container" ref={containerRef}>
        {categories.map((cat, idx) => (
          <div
            key={idx}
            className={`category-item ${selectedCategory === idx ? 'selected' : ''}`}
            onClick={() => setSelectedCategory(idx)}
          >
            <div className="category-icon">{cat.icon}</div>
            <div className="category-text">{cat.name}</div>
          </div>
        ))}
      </div>

      <button className="arrow right" onClick={scrollRight}>
        <FaChevronRight />
      </button>
    </div>
  );
}

export default CategoryFilters;
