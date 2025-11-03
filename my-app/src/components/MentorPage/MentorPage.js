import React from 'react';
import MentorNavbar from '../Navbar/MentorNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import MentorListings from '../Listings/MentorListings';
import './MentorPage.css';

function MentorPage() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <MentorNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      <MentorListings />
    </div>
  );
}

export default MentorPage;
