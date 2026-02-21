import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './TimezoneModal.css';
import regionRandomImage from '../../assets/regions/region-random.png';
import regionEuropeImage from '../../assets/regions/region-europe.png';
import regionNorthAmericaImage from '../../assets/regions/region-north-america.png';
import regionOceaniaImage from '../../assets/regions/region-oceania.png';
import regionJpKrImage from '../../assets/regions/region-jp-kr.png';
import regionChinaImage from '../../assets/regions/region-china.png';

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
    onSelect(region);
    onClose();
  };

  // 点击弹窗外部时关闭：在 click 冒泡阶段处理
  useEffect(() => {
    const handleDocumentClick = (e) => {
      const panel = contentRef.current;
      const anchorEl = anchorRef?.current;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('click', handleDocumentClick, false);
    return () => document.removeEventListener('click', handleDocumentClick, false);
  }, [onClose, anchorRef]);

  return (
    <div className="timezone-modal-overlay">
      <div
        className="modal-content"
        ref={contentRef}
        style={{ position: 'fixed', top: position.top, left: position.left }}
      >
        <h3>按地区搜索</h3>
        <div className="regions">
          <button onClick={() => handleRegionSelect('随便看看')}>
            <img src={regionRandomImage} alt="随便看看" />
            <span>随便看看</span>
          </button>
          <button onClick={() => handleRegionSelect('欧洲')}>
            <img src={regionEuropeImage} alt="欧洲" />
            <span>欧洲</span>
          </button>
          <button onClick={() => handleRegionSelect('北美')}>
            <img src={regionNorthAmericaImage} alt="北美" />
            <span>北美</span>
          </button>
          <button onClick={() => handleRegionSelect('澳洲')}>
            <img src={regionOceaniaImage} alt="澳洲" />
            <span>澳洲</span>
          </button>
          <button onClick={() => handleRegionSelect('日韩')}>
            <img src={regionJpKrImage} alt="日韩" />
            <span>日韩</span>
          </button>
          <button onClick={() => handleRegionSelect('中国')}>
            <img src={regionChinaImage} alt="中国" />
            <span>中国</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimezoneModal;
