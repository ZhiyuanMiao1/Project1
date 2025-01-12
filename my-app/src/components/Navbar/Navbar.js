import React, { useState } from 'react';
import './Navbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function Navbar() {
  const [activeTab, setActiveTab] = useState('学生'); // 默认选中
  const [showTimezoneModal, setShowTimezoneModal] = useState(false); // 控制时区弹窗显示
  const [selectedRegion, setSelectedRegion] = useState(''); // 当前选中的区域
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false); // 控制课程类型弹窗显示
  const [selectedCourseType, setSelectedCourseType] = useState(''); // 当前选中的课程类型

  const handleRegionSelect = (region) => {
    setSelectedRegion(region); // 设置选中区域
    setShowTimezoneModal(false); // 关闭弹窗
  };

  const handleCourseTypeSelect = (courseType) => {
    setSelectedCourseType(courseType); // 设置选中课程类型
    setShowCourseTypeModal(false); // 关闭课程类型弹窗
  };

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
            {/* 点击显示时区弹窗 */}
            <div className="search-item timezone">
              <label>时区</label>
              <input
                type="text"
                placeholder="选择时区"
                value={selectedRegion}
                readOnly
                onClick={() => setShowTimezoneModal(true)}
              />
            </div>

             {/* 点击显示课程类型弹窗 */}
            <div className="search-item course-type">
              <label>课程类型</label>
              <input
                type="text"
                placeholder="选择课程类型"
                value={selectedCourseType}
                readOnly
                onClick={() => setShowCourseTypeModal(true)}
              />
            </div>

            <div className="search-item tutor">
              <label>导师要求</label>
              <input type="text" placeholder="导师要求" />
            </div>
          </div>

          <button className="search-btn">
            <i className="fas fa-search"></i>
          </button>
        </div>
      </div>

      {/* 弹窗 */}
      {showTimezoneModal && (
        <div className="modal-overlay" onClick={() => setShowTimezoneModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()} // 防止点击弹窗内容关闭弹窗
          >
            <h3>按地区搜索</h3>
            <div className="regions">
              <button onClick={() => handleRegionSelect('随便看看')}>
                <img src={require('../../assets/images/随便看看.png')} alt="随便看看" />
                <span>随便看看</span>
              </button>
              <button onClick={() => handleRegionSelect('欧洲')}>
                <img src={require('../../assets/images/欧洲.png')} alt="欧洲" />
                <span>欧洲</span>
              </button>
              <button onClick={() => handleRegionSelect('北美')}>
                <img src={require('../../assets/images/北美.png')} alt="北美" />
                <span>北美</span>
              </button>
              <button onClick={() => handleRegionSelect('东南亚')}>
                <img src={require('../../assets/images/东南亚.png')} alt="东南亚" />
                <span>东南亚</span>
              </button>
              <button onClick={() => handleRegionSelect('日韩')}>
                <img src={require('../../assets/images/日韩.png')} alt="日韩" />
                <span>日韩</span>
              </button>
              <button onClick={() => handleRegionSelect('南美')}>
                <img src={require('../../assets/images/南美.png')} alt="南美" />
                <span>南美</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 课程类型选择弹窗 */}
      {showCourseTypeModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCourseTypeModal(false)}
        >
          <div
            className="course-types-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="course-types">
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Pre-class Preparation and Tutoring')}>
              Pre-class Preparation
              <i className="fas fa-chalkboard-teacher"></i>
            </button>
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Assignment Guidance')}>
              Assignment
              <i className="fas fa-book"></i>
            </button>
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Exam Review and Preparation')}>
              Exam Review
              <i className="fas fa-graduation-cap"></i>
            </button>
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Programming Skills Tutoring')}>
              Programming Skills
              <i className="fas fa-code"></i>
            </button>
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Course Selection Advice and Planning')}>
              Course Selection Advice and Planning
              <i className="fas fa-lightbulb"></i>
            </button>
            <button className="course-type-button" onClick={() => handleCourseTypeSelect('Graduation Thesis or Research Guidance')}>
              Graduation Thesis
              <i className="fas fa-pen"></i>
            </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
