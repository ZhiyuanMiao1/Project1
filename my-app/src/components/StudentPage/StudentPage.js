import React from 'react';
import StudentNavbar from '../Navbar/StudentNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import Listings from '../Listings/Listings';
import './StudentPage.css';

function StudentPage() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <StudentNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      {/* 房源列表 */}
      <Listings />
    </div>
  );
}

export default StudentPage;