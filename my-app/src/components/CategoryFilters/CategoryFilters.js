import React from 'react';
import './CategoryFilters.css';

function CategoryFilters() {
  const categories = [
    '绝美景观', '王牌', '魅力泳池', 'OMG 妙啊！', '冲浪胜地',
    '住宿加早餐', '小木屋', '庄园豪宅', '海景民宿', '原生态', 
    '临湖',
  ];

  return (
    <div className="category-filters">
      <div className="container category-container">
        {categories.map((cat, idx) => (
          <button key={idx} className="category-btn">
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}

export default CategoryFilters;
