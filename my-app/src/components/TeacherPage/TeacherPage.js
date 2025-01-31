import React from 'react';
import TeacherNavbar from '../Navbar/TeacherNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import TeacherListings from '../Listings/TeacherListings';
import './TeacherPage.css';

function TeacherPage() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <TeacherNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      <TeacherListings />
    </div>
  );
}

export default TeacherPage;