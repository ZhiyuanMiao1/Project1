import React, { useState } from 'react';
import './Navbar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import TimezoneModal from '../TimezoneModal/TimezoneModal';
import CourseTypeModal from '../CourseTypeModal/CourseTypeModal';
import StartDateModal from '../StartDateModal/StartDateModal'; // 引入 StartDate 弹窗

function Navbar() {
  const [activeTab, setActiveTab] = useState('学生'); // 默认选中
  const [showTimezoneModal, setShowTimezoneModal] = useState(false); // 控制时区弹窗显示
  const [selectedRegion, setSelectedRegion] = useState(''); // 当前选中的区域
  const [showCourseTypeModal, setShowCourseTypeModal] = useState(false); // 控制课程类型弹窗显示
  const [selectedCourseType, setSelectedCourseType] = useState(''); // 当前选中的课程类型
  const [showStartDateModal, setShowStartDateModal] = useState(false); // 控制首课日期弹窗显示
  const [selectedStartDate, setSelectedStartDate] = useState(''); // 当前选中的首课日期
  const [activeFilter, setActiveFilter] = useState(''); // 当前激活的搜索框
  const [isSearchBarActive, setIsSearchBarActive] = useState(false); // 搜索栏是否被激活

  return (
    <header className="navbar">
      {/* 第一行：LOGO + Students/Teacher + 右侧菜单 */}
      <div className="navbar-top container">
        <div className="navbar-left">
          <span className="nav-logo-text">MentorX</span>
        </div>
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
        <div className="navbar-right">
          <span className="nav-link nav-text">发布课程需求</span>
          <span className="icon-circle">
            <i className="fa fa-user"></i>
          </span>
        </div>
      </div>

      {/* 第二行：搜索框 */}
      <div className="navbar-bottom container">
        <div className={`search-bar ${isSearchBarActive ? 'active' : ''}`}>
          <div className="search-filters">
            <div
              className={`search-item timezone ${activeFilter === 'timezone' ? 'active' : ''}`}
              onClick={() => {
                setShowTimezoneModal(true);
                setActiveFilter('timezone'); // 设置当前激活的搜索框
                setIsSearchBarActive(true); // 激活搜索栏
              }}
            >
              <label>时区</label>
              <input
                type="text"
                placeholder="选择时区"
                value={selectedRegion}
                readOnly
              />
            </div>
            
            <div
              className={`search-item course-type ${activeFilter === 'courseType' ? 'active' : ''}`}
              onClick={() => {
                setShowCourseTypeModal(true);
                setActiveFilter('courseType'); // 设置当前激活的搜索框
                setIsSearchBarActive(true); // 激活搜索栏
              }}
            >
              <label>课程类型</label>
              <input
                type="text"
                placeholder="选择课程类型"
                value={selectedCourseType}
                readOnly
              />
            </div>
            
            <div
              className={`search-item start-date ${activeFilter === 'startDate' ? 'active' : ''}`}
              onClick={() => {
                setShowStartDateModal(true);
                setActiveFilter('startDate'); // 设置当前激活的搜索框
                setIsSearchBarActive(true); // 激活搜索栏
              }}
            >
              <label>首课日期</label>
              <input
                type="text"
                placeholder="选择首课日期"
                value={selectedStartDate}
                readOnly
              />
            </div>     

          </div>
          <button className="search-btn">
            <i className="fas fa-search"></i>
          </button>
        </div>
      </div>

      {/* 时区选择弹窗 不用遮罩层*/}
      {showTimezoneModal && (
        <TimezoneModal
          onClose={() => {
            setShowTimezoneModal(false);
            setActiveFilter(''); // 关闭时清空激活状态
            setIsSearchBarActive(false); // 搜索栏恢复默认状态
          }}
          onSelect={(region) => setSelectedRegion(region)}
        />
      )}
      
      {/* 课程类型选择弹窗 */}
      {showCourseTypeModal && (
        <CourseTypeModal
          onClose={() => {
            setShowCourseTypeModal(false);
            setActiveFilter(''); // 关闭时清空激活状态
            setIsSearchBarActive(false); // 搜索栏恢复默认状态
          }}
          onSelect={(courseType) => setSelectedCourseType(courseType)}
        />
      )}
      
      {/* 首课日期选择弹窗 */}
      {showStartDateModal && (
        <StartDateModal
          onClose={() => {
            setShowStartDateModal(false);
            setActiveFilter(''); // 关闭时清空激活状态
            setIsSearchBarActive(false); // 搜索栏恢复默认状态
          }}
          onSelect={(startDate) => setSelectedStartDate(startDate)}
        />
      )}
    </header>
  );
}

export default Navbar;
