import React, { useState, useRef, useEffect } from 'react';
import './CategoryFilters.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP } from '../../constants/courseMappings';

function CategoryFilters() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false); // 控制左侧按钮
  const [showRightArrow, setShowRightArrow] = useState(true); // 控制右侧按钮
  const containerRef = useRef(null);

  // 使用共享常量：学科方向列表 + 图标映射
  const categories = DIRECTION_OPTIONS.map((opt) => ({ id: opt.id, name: opt.label }));

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
            <div className="category-icon">{(() => { const Icon = DIRECTION_ICON_MAP[cat.id]; return Icon ? <Icon /> : null; })()}</div>
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
