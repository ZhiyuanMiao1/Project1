import React, { useEffect, useMemo, useState } from 'react';
import { FiChevronDown, FiMenu } from 'react-icons/fi';
import { DIRECTION_ICON_MAP, DIRECTION_OPTIONS } from '../../../constants/courseMappings';
import { LANGUAGE_OPTIONS, useI18n } from '../../../i18n/language';

export const DEFAULT_HOME_COURSE_ORDER_IDS = DIRECTION_OPTIONS.map((opt) => opt.id);

function HomeCourseOrderEditor({ orderIds = [], disabled = false, onChangeOrder, onResetOrder }) {
  const { getCourseDirectionLabel, t } = useI18n();
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const optionById = useMemo(() => new Map(DIRECTION_OPTIONS.map((opt) => [opt.id, opt])), []);
  const orderedOptions = useMemo(
    () => orderIds.map((id) => optionById.get(id)).filter(Boolean),
    [orderIds, optionById],
  );

  const moveItem = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return null;
    const fromIndex = orderIds.indexOf(fromId);
    const toIndex = orderIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
    const next = [...orderIds];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    return next;
  };

  const handleDragStart = (e, id) => {
    if (disabled) return;
    setDraggingId(id);
    setDragOverId(null);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    } catch {}
  };

  const handleDragOver = (e, id) => {
    if (disabled) return;
    e.preventDefault();
    if (dragOverId !== id) setDragOverId(id);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {}
  };

  const handleDrop = (e, id) => {
    if (disabled) return;
    e.preventDefault();
    let fromId = draggingId;
    if (!fromId) {
      try {
        fromId = e.dataTransfer.getData('text/plain');
      } catch {}
    }
    const next = moveItem(fromId, id);
    setDraggingId(null);
    setDragOverId(null);
    if (!next) return;
    if (typeof onChangeOrder === 'function') onChangeOrder(next);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className={`settings-course-order ${disabled ? 'is-disabled' : ''}`}>
      <div className="settings-course-order-head">
        <div className="settings-course-order-hint">{t('language.homeOrderHint', '拖动课程卡片调整首页课程顺序（自动保存）')}</div>
        <button
          type="button"
          className="settings-action"
          onClick={onResetOrder}
          disabled={disabled}
        >
          {t('language.restoreDefault', '恢复默认')}
        </button>
      </div>

      <ul className="settings-course-order-grid" aria-label={t('language.orderAria', '首页课程排序')}>
        {orderedOptions.map((opt) => {
          const Icon = DIRECTION_ICON_MAP[opt.id];
          const label = getCourseDirectionLabel(opt.id, opt.label);
          const isDragging = draggingId === opt.id;
          const isDropTarget = dragOverId === opt.id && draggingId && draggingId !== opt.id;
          return (
            <li key={opt.id} className="settings-course-order-cell">
              <button
                type="button"
                className={`settings-course-order-item ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(e, opt.id)}
                onDragOver={(e) => handleDragOver(e, opt.id)}
                onDrop={(e) => handleDrop(e, opt.id)}
                onDragEnd={handleDragEnd}
                aria-label={t('language.dragAria', `拖动排序：${label}`, { label })}
              >
                <span className="settings-course-order-item-icon" aria-hidden="true">
                  {Icon ? <Icon size={16} /> : null}
                </span>
                <span className="settings-course-order-item-label">{label}</span>
                <span className="settings-course-order-item-handle" aria-hidden="true">
                  <FiMenu size={16} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LanguageDialog({ open, value, onCancel, onConfirm }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value || 'zh-CN');

  useEffect(() => {
    if (open) setDraft(value || 'zh-CN');
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="settings-language-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="settings-language-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-language-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-language-modal-head">
          <div id="settings-language-modal-title" className="settings-language-modal-title">
            {t('language.dialogTitle', '更改语言')}
          </div>
          <div className="settings-language-modal-desc">
            {t('language.dialogDescription', '选择此设备上 Mentory 使用的系统语言')}
          </div>
        </div>

        <div className="settings-language-options" role="radiogroup" aria-labelledby="settings-language-modal-title">
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.value === draft;
            const label = t(`language.option.${option.value}`, option.label);
            return (
              <button
                key={option.value}
                type="button"
                className={`settings-language-option ${selected ? 'is-selected' : ''}`}
                role="radio"
                aria-checked={selected}
                onClick={() => setDraft(option.value)}
              >
                <span className="settings-language-option-label">{label}</span>
                <span className="settings-language-option-mark" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="settings-language-modal-actions">
          <button type="button" className="settings-action" onClick={onCancel}>
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            className="settings-language-primary"
            onClick={() => onConfirm(draft)}
          >
            {t('common.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LanguageSection({
  homeCourseOrderIds,
  homeCourseOrderDisabled,
  onChangeHomeCourseOrder,
  onResetHomeCourseOrder,
  onShowToast,
}) {
  const { language, setLanguage, t } = useI18n();
  const [homeCourseOrderExpanded, setHomeCourseOrderExpanded] = useState(false);
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);

  const isHomeCourseOrderCustomized = useMemo(() => {
    if (!Array.isArray(homeCourseOrderIds) || homeCourseOrderIds.length !== DEFAULT_HOME_COURSE_ORDER_IDS.length) return false;
    for (let i = 0; i < DEFAULT_HOME_COURSE_ORDER_IDS.length; i += 1) {
      if (homeCourseOrderIds[i] !== DEFAULT_HOME_COURSE_ORDER_IDS[i]) return true;
    }
    return false;
  }, [homeCourseOrderIds]);

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-title">{t('language.language', '语言')}</div>
          <div className="settings-row-value">{t(`language.current.${language}`, language === 'en' ? 'English' : '简体中文')}</div>
        </div>
        <button type="button" className="settings-action" onClick={() => setLanguageDialogOpen(true)}>
          {t('common.change', '更改')}
        </button>
      </div>

      <div className="settings-accordion-item">
        <button
          type="button"
          className="settings-accordion-trigger"
          aria-expanded={homeCourseOrderExpanded}
          aria-controls="settings-home-course-order"
          onClick={() => setHomeCourseOrderExpanded((prev) => !prev)}
        >
          <div className="settings-row-main">
            <div className="settings-row-title">{t('language.homeOrder', '首页课程排序')}</div>
            <div className="settings-row-value">
              {isHomeCourseOrderCustomized
                ? t('language.homeOrder.custom', '自定义')
                : t('language.homeOrder.default', '默认顺序')}
            </div>
          </div>
          <span className="settings-accordion-icon" aria-hidden="true">
            <FiChevronDown size={18} />
          </span>
        </button>
        <div
          id="settings-home-course-order"
          className="settings-accordion-panel"
          hidden={!homeCourseOrderExpanded}
        >
          <HomeCourseOrderEditor
            orderIds={homeCourseOrderIds}
            disabled={homeCourseOrderDisabled}
            onChangeOrder={onChangeHomeCourseOrder}
            onResetOrder={onResetHomeCourseOrder}
          />
        </div>
      </div>

      <LanguageDialog
        open={languageDialogOpen}
        value={language}
        onCancel={() => setLanguageDialogOpen(false)}
        onConfirm={(nextLanguage) => {
          setLanguage(nextLanguage);
          setLanguageDialogOpen(false);
          if (typeof onShowToast === 'function') onShowToast(nextLanguage === 'en' ? 'Language changed' : '语言已更改', 'success');
        }}
      />
    </>
  );
}

export default LanguageSection;
