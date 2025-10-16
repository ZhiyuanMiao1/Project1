import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './StartDateModal.css';

const StartDateModal = ({ onClose, onSelect, anchorRef }) => {
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 200;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const minGap = 8;
      let left = rect.left;
      const maxLeft = viewportWidth - modalWidth - minGap;
      if (left > maxLeft) left = Math.max(minGap, maxLeft);
      if (left < minGap) left = minGap;
      setPosition({ top: rect.bottom + 10, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef]);
  const handleStartDateSelect = (dateOption) => {
    onSelect(dateOption); // 设置选中的首课日期选项
    onClose(); // 关闭弹窗
  };

  // 文档级监听：点击弹窗外关闭（使用 click 冒泡阶段，避免按下瞬间关闭）
  useEffect(() => {
    const onDocClick = (e) => {
      const panel = contentRef.current;
      const anchorEl = anchorRef?.current;
      if (!panel) return;
      if (panel.contains(e.target)) return; // 点击在弹窗内部
      if (anchorEl && anchorEl.contains(e.target)) return; // 点击在触发元素上（例如首次点击打开）
      onClose();
    };
    document.addEventListener('click', onDocClick, false);
    return () => document.removeEventListener('click', onDocClick, false);
  }, [onClose, anchorRef]);

  return (
    <div className="start-date-modal-overlay">
      <div
        className="start-date-modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
        // 交互由文档级监听控制
      >
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

