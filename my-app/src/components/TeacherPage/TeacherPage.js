import React from 'react';
import TeacherNavbar from '../Navbar/TeacherNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import Listings from '../Listings/Listings';
import './TeacherPage.css';

function TeacherPage() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <TeacherNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      {/* 房源列表 */}
      <Listings />
    </div>
  );
}

export default TeacherPage;