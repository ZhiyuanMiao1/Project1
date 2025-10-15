import React, { useState, useRef, useEffect } from 'react';
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
  FaBalanceScale
} from 'react-icons/fa';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io'; // 替代图标

function CategoryFilters() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false); // 控制左侧按钮
  const [showRightArrow, setShowRightArrow] = useState(true); // 控制右侧按钮
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
    { name: '会计学', icon: <FaCalculator /> },
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
      containerRef.current.scrollLeft -= 900;
    }
  };

  const scrollRight = () => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += 900;
    }
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;

      // 检查是否到达左侧或右侧
      setShowLeftArrow(scrollLeft > 0); // 如果滚动位置大于 0，显示左箭头
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth); // 如果还可以滚动，显示右箭头
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }

    // 清理事件监听器
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <div className="category-filters">
      {showLeftArrow && (
      <button className="arrow left" onClick={scrollLeft}>
        <IoIosArrowBack />
      </button>
      )}

      <div className="container category-container" ref={containerRef}>
        {categories.map((cat, idx) => (
          <div
            key={idx}
            className={`category-item ${selectedCategory === idx ? 'selected' : ''}`}
            onClick={() => {
              // Toggle selection: click again to deselect
              setSelectedCategory((prev) => (prev === idx ? null : idx));
            }}
          >
            <div className="category-icon">{cat.icon}</div>
            <div className="category-text">{cat.name}</div>
          </div>
        ))}
      </div>

      {showRightArrow && (
      <button className="arrow right" onClick={scrollRight}>
        <IoIosArrowForward />
      </button>
      )}
    </div>
  );
}

export default CategoryFilters;
