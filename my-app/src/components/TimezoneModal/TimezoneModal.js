import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './TimezoneModal.css';
import regionRandomImage from '../../assets/regions/region-random.png';
import regionEuropeImage from '../../assets/regions/region-europe.png';
import regionNorthAmericaImage from '../../assets/regions/region-north-america.png';
import regionOceaniaImage from '../../assets/regions/region-oceania.png';
import regionJpKrImage from '../../assets/regions/region-jp-kr.png';
import regionChinaImage from '../../assets/regions/region-china.png';
import { useI18n } from '../../i18n/language';

const TimezoneModal = ({ onClose, onSelect, anchorRef }) => {
  const { t } = useI18n();
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

  const regionOptions = [
    { value: '随便看看', label: t('timezoneModal.random', '随便看看'), image: regionRandomImage },
    { value: '欧洲', label: t('timezoneModal.europe', '欧洲'), image: regionEuropeImage },
    { value: '北美', label: t('timezoneModal.northAmerica', '北美'), image: regionNorthAmericaImage },
    { value: '澳洲', label: t('timezoneModal.oceania', '澳洲'), image: regionOceaniaImage },
    { value: '日韩', label: t('timezoneModal.japanKorea', '日韩'), image: regionJpKrImage },
    { value: '中国', label: t('timezoneModal.china', '中国'), image: regionChinaImage },
  ];

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
        <h3>{t('timezoneModal.title', '按地区搜索')}</h3>
        <div className="regions">
          {regionOptions.map((region) => (
            <button key={region.value} onClick={() => handleRegionSelect(region.value)}>
              <img src={region.image} alt={region.label} />
              <span>{region.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimezoneModal;
