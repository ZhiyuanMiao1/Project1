import React, { useEffect, useState } from 'react';
import StudentNavbar from '../Navbar/StudentNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import StudentListings from '../Listings/StudentListings';
import './StudentPage.css';

function StudentPage() {
  const [homeEnterKey, setHomeEnterKey] = useState(0);

  // 监听“进入主页动画”事件，强制重建列表以重播开场动画
  useEffect(() => {
    const handler = () => setHomeEnterKey((k) => k + 1);
    window.addEventListener('home:enter', handler);
    return () => window.removeEventListener('home:enter', handler);
  }, []);

  return (
    <div className="app">
      {/* 顶部双层导航 */}
      <StudentNavbar />
      
      {/* 分类标签 */}
      <CategoryFilters />

      {/* 通过 key 强制重新挂载，从而重播首页打开动画 */}
      <StudentListings key={homeEnterKey} />
    </div>
  );
}

export default StudentPage;
