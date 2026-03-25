import React, { useRef, useState } from 'react';
import api from '../../api/client';
import './MentorActivationPopup.css';

const RESUME_ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.zip';

function MentorActivationPopup({ onClose, onSuccess }) {
  const fileInputRef = useRef(null);
  const backdropMouseDownRef = useRef(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (!backdropMouseDownRef.current) return;
    if (e.target !== e.currentTarget) return;
    onClose && onClose();
  };

  const handlePickResume = () => {
    if (uploading || submitting) return;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ''; } catch {}
    if (!file) return;

    setErrorMessage('');
    setUploading(true);
    try {
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

      setResumeFileName(file.name);
      setResumeUrl(fileUrl);
    } catch (error) {
      setResumeFileName('');
      setResumeUrl('');
      setErrorMessage(
        error?.response?.data?.error
          || error?.message
          || '简历上传失败，请稍后再试'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (uploading || submitting) return;
    if (!resumeUrl) {
      setErrorMessage('请先上传简历');
      return;
    }

    setErrorMessage('');
    setSubmitting(true);
    try {
      const res = await api.post('/api/account/mentor-activation', {
        resumeUrl,
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
          &times;
        </button>

        <h2 className="mentor-activation-title">欢迎注册Mentory导师</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept={RESUME_ACCEPT}
          className="mentor-activation-input"
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="mentor-activation-upload"
          disabled={uploading || submitting}
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
          {resumeFileName ? `已上传：${resumeFileName}` : '\u00A0'}
        </div>

        <div className="mentor-activation-error" role={errorMessage ? 'alert' : undefined}>
          {errorMessage || '\u00A0'}
        </div>

        <button
          type="button"
          className="mentor-activation-submit"
          disabled={uploading || submitting}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : '继续'}
        </button>
      </div>
    </div>
  );
}

export default MentorActivationPopup;
