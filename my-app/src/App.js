import React from 'react';
import Navbar from './components/Navbar/Navbar';
import CategoryFilters from './components/CategoryFilters/CategoryFilters';
import Listings from './components/Listings/Listings';
import './App.css';

function App() {
  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <Navbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      {/* 房源列表 */}
      <Listings />
    </div>
  );
}

export default App;
