import React, { useState } from 'react';
import './Navbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

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

        {/* 右侧菜单 */}
        <div className="navbar-right">
          <span className="nav-link nav-text">发布课程需求</span> {/* 添加单独的 class nav-text */}
          <span className="icon-circle"> {/* 只保留 icon-circle */}
            <i className="fa fa-user"></i> {/* Font Awesome 图标 */}
          </span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
      <div className="navbar-bottom container">
        <div className="search-bar">
          {/* 这里加一层 search-filters，用来包裹三列 */}
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

          {/* 搜索按钮 */}
          <button className="search-btn">
            <i className="fas fa-search"></i> {/* 放大镜图标 */}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;

