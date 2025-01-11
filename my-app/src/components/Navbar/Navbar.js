import React, { useState } from 'react';
import './Navbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function Navbar() {
  const [activeTab, setActiveTab] = useState('学生'); // 默认选中

  return (
    <header className="navbar">
      {/* 第一行：LOGO + Students/Teacher + 右侧菜单 */}
      <div className="navbar-top container">
        {/* 左侧：LOGO */}
        <div className="navbar-left">
          <span className="nav-logo-text">MentorX</span>
        </div>

        {/* 中间：Students/Teacher */}
        <div className="navbar-center">
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === '学生' ? 'active' : ''}`}
              onClick={() => setActiveTab('学生')}
            >
              学生
            </button>
            <button
              className={`nav-tab ${activeTab === '教师' ? 'active' : ''}`}
              onClick={() => setActiveTab('教师')}
            >
              教师
            </button>
          </nav>
        </div>

        {/* 右侧：发布课程需求 + 用户头像 */}
        <div className="navbar-right">
          <span className="nav-link nav-text">发布课程需求</span>
          <span className="icon-circle">
            <i className="fa fa-user"></i>
          </span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
      <div className="navbar-bottom container">
        <div className="search-bar">
          <div className="search-filters">
            <div className="search-item timezone">
              <label>时区</label>
              <input type="text" placeholder="选择时区" />
            </div>

            <div className="search-item course-type">
              <label>课程类型</label>
              <input type="text" placeholder="选择课程类型" />
            </div>

            <div className="search-item subject">
              <label>科目</label>
              <input type="text" placeholder="选择科目" />
            </div>
          </div>

          <button className="search-btn">
            <i className="fas fa-search"></i>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
