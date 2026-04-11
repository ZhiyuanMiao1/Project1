import React, { useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import api from '../../api/client';
import Button from '../common/Button/Button';
import './MentorActivationPopup.css';

const RESUME_ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.zip';

function MentorActivationPopup({ onClose, onSuccess }) {
  const fileInputRef = useRef(null);
  const backdropMouseDownRef = useRef(false);
  const [resumeFiles, setResumeFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isBusy = uploading || !!deletingKey || submitting;

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    if (typeof onClose === 'function') onClose();
  };

  const handlePickResume = () => {
    if (isBusy) return;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const deleteResumeFromOss = async ({ key, fileUrl }) => {
    const nextKey = typeof key === 'string' ? key.trim() : '';
    const nextFileUrl = typeof fileUrl === 'string' ? fileUrl.trim() : '';
    if (!nextKey && !nextFileUrl) return;

    await api.post('/api/oss/delete', {
      scope: 'mentorApplicationResume',
      key: nextKey || undefined,
      fileUrl: nextFileUrl || undefined,
    });
  };

  const uploadResumeFile = async (file) => {
    const signRes = await api.post('/api/oss/policy', {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      scope: 'mentorApplicationResume',
    });

    const { host, key, policy, signature, accessKeyId, fileUrl } = signRes?.data || {};
    if (!host || !key || !policy || !signature || !accessKeyId || !fileUrl) {
      throw new Error('上传签名获取失败');
    }

    const formData = new FormData();
    formData.append('key', key);
    formData.append('policy', policy);
    formData.append('OSSAccessKeyId', accessKeyId);
    formData.append('Signature', signature);
    formData.append('success_action_status', '200');
    formData.append('file', file);

    const uploadRes = await fetch(host, {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      throw new Error('简历上传失败');
    }

    return {
      name: file.name,
      url: fileUrl,
      ossKey: key,
    };
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    try { e.target.value = ''; } catch {}
    if (!files.length) return;

    setErrorMessage('');
    setUploading(true);

    const uploadedFiles = [];
    const failedFileNames = [];

    for (const file of files) {
      try {
        const uploaded = await uploadResumeFile(file);
        uploadedFiles.push(uploaded);
      } catch (error) {
        failedFileNames.push(file.name);
        if (!failedFileNames.length) {
          setErrorMessage(
            error?.response?.data?.error
              || error?.message
              || '简历上传失败，请稍后再试'
          );
        }
      }
    }

    if (uploadedFiles.length) {
      setResumeFiles((current) => {
        const existingKeys = new Set(current.map((item) => item.ossKey || item.url));
        const nextItems = uploadedFiles.filter((item) => !existingKeys.has(item.ossKey || item.url));
        return current.concat(nextItems);
      });
    }

    if (failedFileNames.length) {
      setErrorMessage(`以下文件上传失败：${failedFileNames.join('、')}`);
    }

    setUploading(false);
  };

  const handleDeleteResume = async (file) => {
    const targetKey = file?.ossKey || file?.url || '';
    if (!targetKey || isBusy || deletingKey) return;

    setErrorMessage('');
    setDeletingKey(targetKey);
    try {
      await deleteResumeFromOss({ key: file?.ossKey, fileUrl: file?.url });
      setResumeFiles((current) => current.filter((item) => (item.ossKey || item.url) !== targetKey));
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.error
          || error?.message
          || '删除简历失败，请稍后再试'
      );
    } finally {
      setDeletingKey('');
    }
  };

  const handleSubmit = async () => {
    if (uploading || deletingKey || submitting) return;
    if (!resumeFiles.length) {
      setErrorMessage('请先上传简历');
      return;
    }

    setErrorMessage('');
    setSubmitting(true);
    try {
      const resumeUrls = resumeFiles.map((file) => file.url).filter(Boolean);
      const res = await api.post('/api/account/mentor-activation', {
        resumeUrls,
      });
      if (typeof onSuccess === 'function') onSuccess(res?.data || {});
      if (typeof onClose === 'function') onClose();
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.error
          || error?.message
          || '提交失败，请稍后再试'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="mentor-activation-overlay"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="mentor-activation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="mentor-activation-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <FiX aria-hidden="true" />
        </button>

        <h2 className="mentor-activation-title">欢迎注册Mentory导师</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept={RESUME_ACCEPT}
          multiple
          className="mentor-activation-input"
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="mentor-activation-upload"
          disabled={isBusy}
          onClick={handlePickResume}
        >
          <span className="mentor-activation-upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 15V6m0 0-3.5 3.5M12 6l3.5 3.5M6 18.5h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="mentor-activation-upload-text">
            {uploading ? '上传中...' : '上传简历'}
          </span>
        </button>

        <div className="mentor-activation-status" aria-live="polite">
          {resumeFiles.length ? (
            <div className="mentor-activation-file-list-row">
              <span className="mentor-activation-status-label">已上传：</span>
              <div className="mentor-activation-file-list">
                {resumeFiles.map((file) => {
                  const itemKey = file.ossKey || file.url;
                  const deleting = deletingKey && deletingKey === itemKey;
                  return (
                    <span key={itemKey} className="mentor-activation-file-chip">
                      <span className="mentor-activation-file-name">{file.name}</span>
                      <button
                        type="button"
                        className="mentor-activation-file-remove"
                        onClick={() => handleDeleteResume(file)}
                        disabled={isBusy || deleting}
                        aria-label={`删除文件 ${file.name}`}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : '\u00A0'}
        </div>

        <div className="mentor-activation-error" role={errorMessage ? 'alert' : undefined}>
          {errorMessage || '\u00A0'}
        </div>

        <Button
          className="mentor-activation-submit"
          disabled={uploading || !!deletingKey || submitting}
          onClick={handleSubmit}
          fullWidth
        >
          {submitting ? '提交中...' : '继续'}
        </Button>
      </div>
    </div>
  );
}

export default MentorActivationPopup;
