import React from 'react';
import './TimezoneModal.css';

// Import all images
import Image1 from '../../assets/images/随便看看.png';
import Image2 from '../../assets/images/欧洲.png';
import Image3 from '../../assets/images/北美.png';
import Image4 from '../../assets/images/东南亚.png';
import Image5 from '../../assets/images/日韩.png';
import Image6 from '../../assets/images/南美.png';

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
            <img src={Image1} alt="随便看看" />
            <span>随便看看</span>
          </button>
          <button onClick={() => handleRegionSelect('欧洲')}>
            <img src={Image2} alt="欧洲" />
            <span>欧洲</span>
          </button>
          <button onClick={() => handleRegionSelect('北美')}>
            <img src={Image3} alt="北美" />
            <span>北美</span>
          </button>
          <button onClick={() => handleRegionSelect('东南亚')}>
            <img src={Image4} alt="东南亚" />
            <span>东南亚</span>
          </button>
          <button onClick={() => handleRegionSelect('日韩')}>
            <img src={Image5} alt="日韩" />
            <span>日韩</span>
          </button>
          <button onClick={() => handleRegionSelect('南美')}>
            <img src={Image6} alt="南美" />
            <span>南美</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimezoneModal;
