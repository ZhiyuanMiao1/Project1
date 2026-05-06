import React, { useEffect } from 'react';
import { FiPlay, FiRefreshCw, FiVideo, FiX } from 'react-icons/fi';
import Button from '../common/Button/Button';
import LoadingText from '../common/LoadingText/LoadingText';
import { useI18n } from '../../i18n/language';
import './CourseReplayModal.css';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const formatFileSize = (value) => {
  const bytes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let next = bytes;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || next >= 10 ? 0 : 1;
  return `${next.toFixed(precision)} ${units[unitIndex]}`;
};

function CourseReplayModal({
  open,
  title,
  files = [],
  loading = false,
  error = '',
  onClose,
  onRetry,
}) {
  const { t, language } = useI18n();

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const formatDate = (value) => {
    const text = safeText(value);
    if (!text) return '';
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return text;
    }
  };

  const handleOpenFile = (file) => {
    const url = safeText(file?.url);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="course-replay-modal__state">
          <LoadingText text={t('courses.replayLoading', '正在加载回放...')} />
        </div>
      );
    }

    if (error) {
      const title = t('courses.replayLoadFailed', '回放加载失败');
      const detail = safeText(error);
      return (
        <div className="course-replay-modal__state">
          <p className="course-replay-modal__state-title">{title}</p>
          {detail && detail !== title ? <p className="course-replay-modal__state-text">{detail}</p> : null}
          <Button className="course-replay-modal__retry" onClick={onRetry}>
            <FiRefreshCw size={15} />
            <span>{t('courses.retry', '重试')}</span>
          </Button>
        </div>
      );
    }

    if (!files.length) {
      return (
        <div className="course-replay-modal__state">
          <FiVideo size={28} aria-hidden="true" />
          <p className="course-replay-modal__state-title">{t('courses.replayEmptyTitle', '暂无 MP4 回放')}</p>
          <p className="course-replay-modal__state-text">{t('courses.replayEmptyDesc', '这节课还没有可播放的 MP4 录制文件')}</p>
        </div>
      );
    }

    return (
      <div className="course-replay-modal__list" role="list">
        {files.map((file, index) => {
          const fileName = safeText(file?.fileName) || t('courses.replayFileFallback', '课堂回放 {index}', { index: index + 1 });
          const sizeText = formatFileSize(file?.sizeBytes);
          const dateText = formatDate(file?.lastModified);
          return (
            <div className="course-replay-modal__item" role="listitem" key={safeText(file?.fileId) || fileName}>
              <div className="course-replay-modal__file-icon" aria-hidden="true">
                <FiVideo size={18} />
              </div>
              <div className="course-replay-modal__file-main">
                <div className="course-replay-modal__file-name">{fileName}</div>
                <div className="course-replay-modal__file-meta">
                  {dateText ? <span>{dateText}</span> : null}
                  {dateText && sizeText ? <span aria-hidden="true">|</span> : null}
                  {sizeText ? <span>{sizeText}</span> : null}
                </div>
              </div>
              <button
                type="button"
                className="course-replay-modal__play"
                onClick={() => handleOpenFile(file)}
                disabled={!safeText(file?.url)}
              >
                <FiPlay size={15} aria-hidden="true" />
                <span>{t('courses.replayPlay', '播放')}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="course-replay-modal__overlay" role="dialog" aria-modal="true" aria-label={t('courses.replayDialogAria', '课程回放')}>
      <div className="course-replay-modal__card">
        <button type="button" className="course-replay-modal__close" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <FiX size={20} />
        </button>
        <div className="course-replay-modal__head">
          <h2 className="course-replay-modal__title">{t('courses.replayDialogTitle', '查看回放')}</h2>
          {title ? <p className="course-replay-modal__subtitle">{title}</p> : null}
        </div>
        {renderBody()}
      </div>
    </div>
  );
}

export default CourseReplayModal;
