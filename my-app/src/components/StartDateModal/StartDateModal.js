import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './StartDateModal.css';
import { useI18n } from '../../i18n/language';

const StartDateModal = ({ onClose, onSelect, anchorRef, presentation = 'anchored' }) => {
  const { t } = useI18n();
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (presentation === 'sheet') return undefined;
    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = contentRef.current?.offsetWidth || 200;
      const modalHeight = contentRef.current?.offsetHeight || 280;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const minGap = 8;
      let left = rect.left;
      const maxLeft = viewportWidth - modalWidth - minGap;
      if (left > maxLeft) left = Math.max(minGap, maxLeft);
      if (left < minGap) left = minGap;
      const belowTop = rect.bottom + 10;
      const aboveTop = rect.top - modalHeight - 10;
      const top = modalHeight <= viewportHeight - belowTop || aboveTop < minGap
        ? Math.min(belowTop, Math.max(minGap, viewportHeight - modalHeight - minGap))
        : Math.max(minGap, aboveTop);
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, presentation]);
  const handleStartDateSelect = (dateOption) => {
    onSelect(dateOption); // 设置选中的首课日期选项
    onClose(); // 关闭弹窗
  };

  // 文档级监听：点击弹窗外关闭（使用 click 冒泡阶段，避免按下瞬间关闭）
  useEffect(() => {
    if (presentation === 'sheet') return undefined;
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
      className={`start-date-modal-overlay ${presentation === 'sheet' ? 'is-sheet' : ''}`}
      onMouseDown={presentation === 'sheet' ? onClose : undefined}
    >
      <div
        className={`start-date-modal-content ${presentation === 'sheet' ? 'mobile-option-sheet' : ''}`}
        ref={contentRef}
        style={presentation === 'sheet' ? undefined : { position: 'fixed', top: position.top, left: position.left }}
        role="dialog"
        aria-modal={presentation === 'sheet' ? 'true' : undefined}
        aria-label={t('nav.firstLessonDate', '首课日期')}
        onMouseDown={(event) => event.stopPropagation()}
        // 交互由文档级监听控制
      >
        <div className="mobile-option-sheet__handle" aria-hidden="true" />
        <div className="mobile-option-sheet__header">
          <h3>{t('nav.firstLessonDate', '首课日期')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close', '关闭')}>×</button>
        </div>
        <div className="start-date-options">
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('0_1')}
          >
            {t('startDate.urgent', '紧急（1天内）')}
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('1_3')}
          >
            {t('startDate.soon', '近期（3天内）')}
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('3_7')}
          >
            {t('startDate.withinWeek', '一周内')}
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('gt7')}
          >
            {t('startDate.longTerm', '长期')}
          </button>
          <button
            className="start-date-option-button"
            onClick={() => handleStartDateSelect('')}
            aria-label={t('startDate.resetAria', '重置首课日期')}
          >
            {t('common.reset', '重置')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartDateModal;

