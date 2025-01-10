import React, { useState } from 'react';
import './Navbar.css';

function Navbar() {
  const [activeTab, setActiveTab] = useState('Students'); // 默认选中 Students

  return (
    <header className="navbar">
      {/* 第一行：LOGO + Students/Teacher + 发布课程/登录 */}
      <div className="navbar-top container">
        <div className="navbar-left">
          {/* LOGO 替换为文字 MentorX */}
          <span className="nav-logo-text">MentorX</span>
        </div>

        {/* 居中的 Students 和 Teacher */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'Students' ? 'active' : ''}`}
            onClick={() => setActiveTab('Students')}
          >
            Students
          </button>
          <button
            className={`nav-tab ${activeTab === 'Teacher' ? 'active' : ''}`}
            onClick={() => setActiveTab('Teacher')}
          >
            Teacher
          </button>
        </nav>

        {/* 右侧菜单 */}
        <div className="navbar-right">
          <span className="nav-link">发布课程需求</span>
          <span className="nav-link">登录</span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
      <div className="navbar-bottom container">
        <div className="search-bar">
          {/* 筛选条件：时区 */}
          <div className="search-item">
            <label>时区</label>
            <input type="text" placeholder="选择时区" />
          </div>
      
          {/* 筛选条件：课程类型 */}
          <div className="search-item">
            <label>课程类型</label>
            <input type="text" placeholder="选择课程类型" />
          </div>
      
          {/* 筛选条件：科目 */}
          <div className="search-item">
            <label>科目</label>
            <input type="text" placeholder="选择科目" />
          </div>
      
          {/* 搜索按钮 */}
          <button className="search-btn">搜索</button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
