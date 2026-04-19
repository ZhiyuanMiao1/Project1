import React from 'react';
import { FaImages } from 'react-icons/fa';
import { RiDeleteBin6Line } from 'react-icons/ri';
import { useI18n } from '../../../i18n/language';

function UploadStep({
  isDraggingFiles,
  fileInputRef,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onFileInputChange,
  attachments,
  onRemoveAttachment,
  onClearAttachments,
  accept,
  validationMessage,
}) {
  const { t } = useI18n();

  return (
    <div className="step-field-stack upload-stack">
      <div
        className={`upload-area ${isDraggingFiles ? 'dragover' : ''}`}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
      >
        <div className="upload-icon" aria-hidden="true"><FaImages /></div>
        <div className="upload-title">{t('courseRequest.upload.drop', '拖放')}</div>
        <div className="upload-subtext">{t('courseRequest.upload.orUpload', '或上传课件')}</div>
        <button type="button" className="primary-button upload-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
          {t('courseRequest.upload.button', '上传')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
        {!!validationMessage && (
          <div className="upload-validation" role="status" aria-live="polite">
            {validationMessage}
          </div>
        )}
      </div>

      {(attachments && attachments.length > 0) && (
        <div className="file-list">
          {attachments.map((f, idx) => (
            <div key={idx} className="file-item">
              <div className="meta">
                <span className="name">{f?.name || f?.fileName || ''}</span>
                <span className="size">{(((typeof f?.size === 'number' ? f.size : Number(f?.sizeBytes)) || 0) / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <button
                type="button"
                className="icon-button remove"
                aria-label={t('courseRequest.upload.remove', '移除文件')}
                title={t('courseRequest.upload.remove', '移除文件')}
                onClick={() => onRemoveAttachment(idx)}
              >
                <RiDeleteBin6Line />
              </button>
            </div>
          ))}
          <div className="file-actions">
            <button type="button" className="ghost-button" onClick={onClearAttachments}>{t('courseRequest.upload.clear', '清空所有')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadStep;
