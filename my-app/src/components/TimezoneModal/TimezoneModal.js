import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './TimezoneModal.css';

const TimezoneModal = ({ onClose, onSelect, anchorRef }) => {
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 根据触发元素定位弹窗：其下方 10px
  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();

      const modalWidth = contentRef.current?.offsetWidth || 360; // 与 CSS 中的默认宽度保持一致
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      let left = rect.left;
      const minGap = 8;
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

  const handleRegionSelect = (region) => {
    onSelect(region); // 回调函数设置选中区域
    onClose(); // 关闭弹窗
  };

  // 点击弹窗外部时关闭，但不阻止外部元素的交互
  useEffect(() => {
    const handleDocumentMouseDown = (e) => {
      const panel = contentRef.current;
      if (!panel) return;
      if (!panel.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [onClose]);

  return (
    <div className="timezone-modal-overlay">
      <div
        className="modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
        // 交互由文档级监听控制，无需阻止冒泡
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
