import React from 'react';
import './StartDateModal.css';

const StartDateModal = ({ onClose, onSelect }) => {
  const handleStartDateSelect = (dateOption) => {
    onSelect(dateOption); // 设置选中的首课日期选项
    onClose(); // 关闭弹窗
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="start-date-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="start-date-options">
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('尽快')}
          >
            尽快
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('1周内')}
          >
            1周内
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('2周内')}
          >
            2周内
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('1个月内')}
          >
            1个月内
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('1个月后')}
          >
            1个月后
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('待定')}
          >
            待定
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartDateModal;

