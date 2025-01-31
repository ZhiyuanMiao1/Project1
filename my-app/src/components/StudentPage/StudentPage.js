import React from 'react';
import StudentNavbar from '../Navbar/StudentNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import StudentListings from '../Listings/StudentListings';
import './StudentPage.css';

function StudentPage() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <StudentNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      <StudentListings />
    </div>
  );
}

export default StudentPage;