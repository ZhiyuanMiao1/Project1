import React from 'react';
import './TimezoneModal.css';

const TimezoneModal = ({ onClose, onSelect }) => {
  const handleRegionSelect = (region) => {
    onSelect(region); // 回调函数设置选中区域
    onClose(); // 关闭弹窗
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()} // 防止点击弹窗内容关闭弹窗
      >
        <h3>按地区搜索</h3>
        <div className="regions">
          <button onClick={() => handleRegionSelect('随便看看')}>
            <img src="/images/随便看看.png" alt="随便看看" />
            <span>随便看看</span>
          </button>
          <button onClick={() => handleRegionSelect('欧洲')}>
            <img src="/images/欧洲.png" alt="欧洲" />
            <span>欧洲</span>
          </button>
          <button onClick={() => handleRegionSelect('北美')}>
            <img src="/images/北美.png" alt="北美" />
            <span>北美</span>
          </button>
          <button onClick={() => handleRegionSelect('东南亚')}>
            <img src="/images/东南亚.png" alt="东南亚" />
            <span>东南亚</span>
          </button>
          <button onClick={() => handleRegionSelect('日韩')}>
            <img src="/images/日韩.png" alt="日韩" />
            <span>日韩</span>
          </button>
          <button onClick={() => handleRegionSelect('中国')}>
            <img src="/images/中国.png" alt="中国" />
            <span>中国</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimezoneModal;