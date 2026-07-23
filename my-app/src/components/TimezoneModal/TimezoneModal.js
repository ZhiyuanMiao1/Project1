import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './TimezoneModal.css';
import regionRandomImage from '../../assets/regions/region-random.png';
import regionEuropeImage from '../../assets/regions/region-europe.png';
import regionNorthAmericaImage from '../../assets/regions/region-north-america.png';
import regionOceaniaImage from '../../assets/regions/region-oceania.png';
import regionJpKrImage from '../../assets/regions/region-jp-kr.png';
import regionChinaImage from '../../assets/regions/region-china.png';
import { useI18n } from '../../i18n/language';
import { getTimezoneRegionLabel } from '../../utils/timezoneRegion';

const TimezoneModal = ({ onClose, onSelect, anchorRef, presentation = 'anchored' }) => {
  const { t } = useI18n();
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 根据触发元素定位弹窗：其下方 10px
  useLayoutEffect(() => {
    if (presentation === 'sheet') return undefined;
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
  }, [anchorRef, presentation]);

  const handleRegionSelect = (region) => {
    onSelect(region);
    onClose();
  };

  const regionOptions = [
    { value: '随便看看', image: regionRandomImage },
    { value: '欧洲', image: regionEuropeImage },
    { value: '北美', image: regionNorthAmericaImage },
    { value: '澳洲', image: regionOceaniaImage },
    { value: '日韩', image: regionJpKrImage },
    { value: '中国', image: regionChinaImage },
  ].map((region) => ({
    ...region,
    label: getTimezoneRegionLabel(region.value, t),
  }));

  // 点击弹窗外部时关闭：在 click 冒泡阶段处理
  useEffect(() => {
    if (presentation === 'sheet') return undefined;
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
  }, [onClose, anchorRef, presentation]);

  useEffect(() => {
    if (presentation !== 'sheet') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, presentation]);

  return (
    <div
      className={`timezone-modal-overlay ${presentation === 'sheet' ? 'is-sheet' : ''}`}
      onMouseDown={presentation === 'sheet' ? onClose : undefined}
    >
      <div
        className={`modal-content ${presentation === 'sheet' ? 'mobile-option-sheet' : ''}`}
        ref={contentRef}
        style={presentation === 'sheet' ? undefined : { position: 'fixed', top: position.top, left: position.left }}
        role="dialog"
        aria-modal={presentation === 'sheet' ? 'true' : undefined}
        aria-label={t('timezoneModal.title', '按地区搜索')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mobile-option-sheet__handle" aria-hidden="true" />
        <div className="mobile-option-sheet__header">
          <h3>{t('timezoneModal.title', '按地区搜索')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close', '关闭')}>×</button>
        </div>
        <h3 className="anchored-modal-title">{t('timezoneModal.title', '按地区搜索')}</h3>
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
