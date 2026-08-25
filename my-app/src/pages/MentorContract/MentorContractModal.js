import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiDownload, FiExternalLink, FiMail, FiRefreshCw, FiX } from 'react-icons/fi';
import LoadingText from '../../components/common/LoadingText/LoadingText';
import api from '../../api/client';
import { useI18n } from '../../i18n/language';
import './MentorContractModal.css';

const normalizeLegalName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const maskEmail = (value) => {
  const raw = String(value || '').trim();
  const [local, domain] = raw.split('@');
  if (!local || !domain) return raw;
  if (local.length <= 2) return `${local[0] || ''}*@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
};

const getErrorMessage = async (error, t) => {
  let responseData = error?.response?.data;
  if (typeof Blob !== 'undefined' && responseData instanceof Blob) {
    try {
      responseData = JSON.parse(await responseData.text());
    } catch (_) {
      responseData = null;
    }
  }
  const code = String(responseData?.code || error?.code || '');
  const byCode = {
    MENTOR_CONTRACT_LEGAL_NAME_INVALID: t('mentorContract.legalNameInvalid', '请输入 2 至 120 个字符的真实姓名'),
    MENTOR_CONTRACT_CODE_INVALID: t('mentorContract.codeInvalid', '验证码错误，请重新输入'),
    MENTOR_CONTRACT_CODE_EXPIRED: t('mentorContract.codeExpired', '验证码已过期，请重新发送'),
    MENTOR_CONTRACT_CODE_TOO_MANY_ATTEMPTS: t('mentorContract.codeTooMany', '验证码错误次数过多，请重新发送'),
    MENTOR_CONTRACT_CODE_RATE_LIMIT: t('mentorContract.codeRateLimit', '验证码发送过于频繁，请稍后再试'),
    MENTOR_CONTRACT_CODE_SEND_FAILED: t('mentorContract.codeSendFailed', '验证码发送失败，请稍后再试'),
    MENTOR_CONTRACT_CODE_NOT_FOUND: t('mentorContract.codeNotFound', '验证码不存在或已失效，请重新发送'),
    MENTOR_CONTRACT_CODE_INVALID_FORMAT: t('mentorContract.codeFormat', '请输入 6 位验证码'),
    MENTOR_CONTRACT_CONFIRMATIONS_REQUIRED: t('mentorContract.confirmationsRequired', '请勾选两项确认后再签署'),
    MENTOR_CONTRACT_PROCESSING: t('mentorContract.processing', '合同正在生成，请勿重复提交'),
    MENTOR_CONTRACT_GENERATION_FAILED: t('mentorContract.generationFailed', '合同生成或归档失败，请稍后重试'),
    MENTOR_CONTRACT_PREVIEW_GENERATION_FAILED: t('mentorContract.previewGenerationFailed', '合同个性化预览生成失败，请稍后重试'),
    MENTOR_CONTRACT_NOT_SIGNED: t('mentorContract.notSigned', '尚未找到已签署合同'),
    MENTOR_CONTRACT_OSS_NOT_CONFIGURED: t('mentorContract.storageUnavailable', '合同存储暂不可用，请稍后再试'),
    MENTOR_REQUIRED: t('mentorContract.mentorRequired', '仅导师可访问此功能'),
    MENTOR_NOT_APPROVED: t('mentorContract.notApproved', '导师审核通过后方可签署协议'),
    MENTOR_EMAIL_REQUIRED: t('mentorContract.emailRequired', '导师注册邮箱不存在，请联系 Mentory 支持'),
  };
  return byCode[code] || t('mentorContract.actionFailed', '操作失败，请稍后再试');
};

function MentorContractModal({ initialStatus = null, onClose, onStatusChange }) {
  const { t, isEnglish } = useI18n();
  const codeInputRef = useRef(null);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(!initialStatus);
  const [legalName, setLegalName] = useState(initialStatus?.mentorName || '');
  const [previewedName, setPreviewedName] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewPersonalised, setPreviewPersonalised] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [informationConfirmed, setInformationConfirmed] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [activeCodeIndex, setActiveCodeIndex] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const updateStatus = useCallback((next) => {
    setStatus(next);
    onStatusChange?.(next);
    return next;
  }, [onStatusChange]);

  const loadStatus = useCallback(async () => {
    const response = await api.get('/api/mentor-contracts/status');
    return updateStatus(response?.data || {});
  }, [updateStatus]);

  const loadPdf = useCallback(async ({ signed, name = '' }) => {
    setPdfLoading(true);
    setPreviewError('');
    if (!signed && normalizeLegalName(name)) setPreviewPersonalised(false);
    try {
      const response = signed
        ? await api.get('/api/mentor-contracts/mine.pdf', { responseType: 'blob' })
        : await api.post('/api/mentor-contracts/preview.pdf', { legalName: normalizeLegalName(name) }, { responseType: 'blob' });
      const nextUrl = URL.createObjectURL(response.data);
      const normalizedName = normalizeLegalName(name);
      const personalised = signed || String(response?.headers?.['x-mentory-contract-preview-personalised'] || '') === '1';
      if (!signed && normalizedName && !personalised) {
        URL.revokeObjectURL(nextUrl);
        const previewError = new Error('MENTOR_CONTRACT_PREVIEW_GENERATION_FAILED');
        previewError.code = 'MENTOR_CONTRACT_PREVIEW_GENERATION_FAILED';
        throw previewError;
      }
      setPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setPreviewPersonalised(personalised);
      if (!signed && normalizedName) setPreviewedName(normalizedName);
    } catch (nextError) {
      setPreviewError(await getErrorMessage(nextError, t));
    } finally {
      setPdfLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !signing) onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, signing]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const next = await loadStatus();
        if (!active) return;
        const savedName = next?.mentorName || '';
        if (savedName) setLegalName(savedName);
        if (next?.approved) await loadPdf({ signed: Boolean(next.signed), name: savedName });
      } catch (nextError) {
        if (active) setError(await getErrorMessage(nextError, t));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadPdf, loadStatus, t]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    if (!codeSent) return undefined;
    requestAnimationFrame(() => codeInputRef.current?.focus());
    return undefined;
  }, [codeSent]);

  useEffect(() => {
    if (resendCountdown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCountdown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCountdown]);

  const normalizedName = normalizeLegalName(legalName);
  const legalNameValid = normalizedName.length >= 2 && normalizedName.length <= 120;
  const previewMatchesName = legalNameValid
    && previewPersonalised
    && !previewError
    && previewedName === normalizedName;
  const canSendCode = legalNameValid && previewMatchesName && agreementAccepted && informationConfirmed && !sendingCode && !signing;
  const canSign = canSendCode && codeSent && /^\d{6}$/.test(code);
  const signedAt = useMemo(() => {
    if (!status?.signedAt) return '';
    try {
      return new Intl.DateTimeFormat(isEnglish ? 'en' : 'zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Shanghai',
      }).format(new Date(status.signedAt));
    } catch {
      return String(status.signedAt);
    }
  }, [isEnglish, status?.signedAt]);

  const selectCodeCell = (index) => {
    const input = codeInputRef.current;
    if (!input || signing) return;
    const selectionStart = Math.min(index, code.length);
    const selectionEnd = index < code.length ? selectionStart + 1 : selectionStart;
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
    setActiveCodeIndex(selectionStart < 6 ? selectionStart : -1);
  };

  const handleLegalNameChange = (event) => {
    setLegalName(event.target.value.slice(0, 120));
    setAgreementAccepted(false);
    setInformationConfirmed(false);
    setError('');
    setNotice('');
  };

  const handleRefreshPreview = async () => {
    if (!legalNameValid) {
      setError(t('mentorContract.legalNameInvalid', '请输入 2 至 120 个字符的真实姓名'));
      return;
    }
    setError('');
    await loadPdf({ signed: false, name: normalizedName });
  };

  const handleSendCode = async ({ resend = false } = {}) => {
    if (!canSendCode) return;
    if (resend && resendCountdown > 0) return;
    setSendingCode(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/api/mentor-contracts/send-code', { legalName: normalizedName });
      if (response?.data?.alreadySigned) {
        const next = await loadStatus();
        await loadPdf({ signed: true });
        setNotice(t('mentorContract.alreadySigned', '协议已签署，无需重复提交'));
        return updateStatus(next);
      }
      const nextCountdown = Math.max(0, Number(response?.data?.resendAfterSeconds) || 60);
      setCodeSent(true);
      setResendCountdown(nextCountdown);
      if (resend) {
        setCode('');
        setActiveCodeIndex(0);
      }
      setStatus((current) => ({
        ...(current || {}),
        mentorName: normalizedName,
        contractNumber: response?.data?.contractNumber || current?.contractNumber,
        contractVersion: response?.data?.contractVersion || current?.contractVersion,
      }));
      setNotice('');
    } catch (nextError) {
      setError(await getErrorMessage(nextError, t));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSign = async () => {
    if (!canSign) return;
    setSigning(true);
    setError('');
    setNotice(t('mentorContract.generatingNotice', '正在生成 DOCX、转换 PDF 并安全归档，请勿重复提交…'));
    try {
      await api.post('/api/mentor-contracts/sign', { code, agreementAccepted, informationConfirmed });
      const next = await loadStatus();
      setNotice(t('mentorContract.signedSuccess', '协议签署成功，最终合同已冻结归档'));
      await loadPdf({ signed: true });
      try { window.dispatchEvent(new CustomEvent('mentor-contract:signed')); } catch {}
      updateStatus(next);
    } catch (nextError) {
      setError(await getErrorMessage(nextError, t));
      setNotice('');
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = async () => {
    setError('');
    try {
      const response = await api.get('/api/mentor-contracts/mine.pdf?download=1', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${status?.contractNumber || 'Mentory导师合作协议'}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (nextError) {
      setError(await getErrorMessage(nextError, t));
    }
  };

  const closeLabel = t('mentorContract.closeModal', '关闭导师合作协议');

  return (
    <div className="mentor-contract-modal-overlay" onMouseDown={() => { if (!signing) onClose?.(); }}>
      <section className="mentor-contract-modal" role="dialog" aria-modal="true" aria-labelledby="mentor-contract-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="mentor-contract-modal-header">
          <div>
            <h1 id="mentor-contract-modal-title">{status?.signed ? t('mentorContract.signedTitle', '我的导师合作协议') : t('mentorContract.modalTitle', '阅读并签署导师合作协议')}</h1>
            {status?.signed ? <p>{t('mentorContract.signedSubtitle', '你可以随时查看或下载已冻结归档的最终合同 PDF。')}</p> : null}
          </div>
          <button className="mentor-contract-modal-close" type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} disabled={signing}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="mentor-contract-modal-scroll">
          {loading ? (
            <div className="mentor-contract-state"><LoadingText text={t('common.loading', '加载中...')} /></div>
          ) : !status?.approved ? (
            <div className="mentor-contract-state">
              <h2>{t('mentorContract.pendingApprovalTitle', '导师审核尚未通过')}</h2>
              <p>{t('mentorContract.pendingApprovalText', '审核通过后，系统会引导你阅读并签署导师合作协议。')}</p>
            </div>
          ) : (
            <>
              {status?.signed ? (
                <section className="mentor-contract-success" role="status">
                  <FiCheckCircle aria-hidden="true" />
                  <div>
                    <h2>{t('mentorContract.signed', '已签署并冻结归档')}</h2>
                    <p>{t('mentorContract.signedAt', '签署时间')}：{signedAt || '-'}</p>
                    <p className="mentor-contract-hash">SHA-256：{status?.pdfSha256 || '-'}</p>
                  </div>
                  <button type="button" onClick={handleDownload}><FiDownload /> {t('mentorContract.downloadPdf', '下载最终合同 PDF')}</button>
                </section>
              ) : (
                <section className="mentor-contract-identity">
                  <label htmlFor="mentor-contract-legal-name">{t('mentorContract.legalNameLabel', '合同乙方真实姓名')}</label>
                  <input
                    id="mentor-contract-legal-name"
                    type="text"
                    value={legalName}
                    onChange={handleLegalNameChange}
                    autoComplete="name"
                    maxLength={120}
                    disabled={codeSent || sendingCode || signing}
                    placeholder={t('mentorContract.legalNamePlaceholder', '请输入法定姓名')}
                  />
                  <p>{t('mentorContract.legalNameHelp', '此姓名将写入最终合同。Mentory 昵称或个人名片名称不会自动作为合同姓名')}</p>
                  <button type="button" onClick={handleRefreshPreview} disabled={!legalNameValid || pdfLoading || codeSent}>
                    <FiRefreshCw /> {pdfLoading ? t('mentorContract.refreshingPreview', '正在更新预览...') : t('mentorContract.refreshPreview', '用此姓名更新合同预览')}
                  </button>
                </section>
              )}

              <section className="mentor-contract-document" aria-label={t('mentorContract.documentPreview', '完整合同')}>
                <div className="mentor-contract-document-header">
                  <div>
                    <h2>{t('mentorContract.fullAgreement', '完整正式协议')}</h2>
                  </div>
                  {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noreferrer"><FiExternalLink /> {t('mentorContract.openSeparate', '单独打开')}</a> : null}
                </div>
                {previewError ? (
                  <div className="mentor-contract-preview-error" role="alert">
                    <span>{previewError}</span>
                    <button type="button" onClick={() => loadPdf({ signed: Boolean(status?.signed), name: normalizedName })} disabled={pdfLoading}>
                      {t('mentorContract.retryPreview', '重新加载预览')}
                    </button>
                  </div>
                ) : null}
                {pdfLoading ? (
                  <div className="mentor-contract-pdf-state"><LoadingText text={t('mentorContract.loadingPdf', '正在生成合同预览...')} /></div>
                ) : pdfUrl ? (
                  <object className="mentor-contract-pdf" data={pdfUrl} type="application/pdf">
                    <a href={pdfUrl} target="_blank" rel="noreferrer">{t('mentorContract.openPdfFallback', '打开合同 PDF')}</a>
                  </object>
                ) : (
                  <div className="mentor-contract-pdf-state">
                    <span>{t('mentorContract.previewUnavailable', '合同预览暂不可用，请稍后重试')}</span>
                    <button type="button" onClick={() => loadPdf({ signed: Boolean(status?.signed), name: normalizedName })}>{t('mentorContract.retryPreview', '重新加载预览')}</button>
                  </div>
                )}
              </section>

              {!status?.signed ? (
                <section className="mentor-contract-signing" aria-label={t('mentorContract.signingArea', '签署确认')}>
                  <div className="mentor-contract-confirmations">
                    {!previewMatchesName ? <p className="mentor-contract-step-hint">{t('mentorContract.previewNameFirst', '请先填写真实姓名并更新合同预览')}</p> : null}
                    <label className="mentor-contract-checkbox">
                      <input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} disabled={signing || !previewMatchesName} />
                      <span>{t('mentorContract.agreeCheckbox', '我已阅读并同意《Mentory 导师合作协议》')}</span>
                    </label>
                    <label className="mentor-contract-checkbox">
                      <input type="checkbox" checked={informationConfirmed} onChange={(event) => setInformationConfirmed(event.target.checked)} disabled={signing || !previewMatchesName} />
                      <span>{t('mentorContract.infoCheckboxWithName', '我确认合同乙方姓名“{name}”及相关信息真实准确', { name: normalizedName || '-' })}</span>
                    </label>
                  </div>

                  {!codeSent ? (
                    <button className="mentor-contract-primary" type="button" onClick={() => handleSendCode()} disabled={!canSendCode}>
                      <FiMail /> {sendingCode ? <LoadingText text={t('mentorContract.sendingCode', '正在发送验证码...')} /> : t('mentorContract.nextStep', '下一步')}
                    </button>
                  ) : (
                    <div className="mentor-contract-code-panel">
                      <div className="mentor-contract-code-meta">
                        <p>
                          {t('emailCode.sentToPrefix', '验证码已发送至')}{' '}
                          <strong>{maskEmail(status?.mentorEmail) || status?.mentorEmail || '-'}</strong>
                        </p>
                        <button
                          className="mentor-contract-code-resend"
                          type="button"
                          onClick={() => handleSendCode({ resend: true })}
                          disabled={resendCountdown > 0 || sendingCode || signing}
                        >
                          {sendingCode
                            ? <LoadingText text={t('emailCode.resending', '发送中...')} />
                            : t('emailCode.resend', '重新发送')}
                        </button>
                      </div>
                      <div className="mentor-contract-code-entry">
                        <div className="mentor-contract-code-input-grid">
                          <input
                            ref={codeInputRef}
                            id="mentor-contract-code"
                            className="mentor-contract-code-hidden-input"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(event) => {
                              const nextCode = event.target.value.replace(/\D/g, '').slice(0, 6);
                              const nextIndex = Math.min(event.target.selectionStart ?? nextCode.length, nextCode.length);
                              setCode(nextCode);
                              setActiveCodeIndex(nextIndex < 6 ? nextIndex : -1);
                            }}
                            onSelect={(event) => {
                              const nextIndex = event.currentTarget.selectionStart ?? code.length;
                              setActiveCodeIndex(nextIndex < 6 ? nextIndex : -1);
                            }}
                            disabled={signing}
                            aria-label={t('mentorContract.enterCode', '输入注册邮箱收到的 6 位验证码')}
                          />
                          {Array.from({ length: 6 }).map((_, index) => {
                            const value = code[index] || '';
                            const active = !signing && activeCodeIndex === index;
                            return (
                              <button
                                key={index}
                                type="button"
                                className={`mentor-contract-code-cell${value ? ' filled' : ''}${active ? ' active' : ''}`}
                                onClick={() => selectCodeCell(index)}
                                disabled={signing}
                                tabIndex={-1}
                                aria-label={t('mentorContract.codeDigit', '验证码第 {position} 位', { position: index + 1 })}
                              >
                                <span>{value}</span>
                              </button>
                            );
                          })}
                        </div>
                        <button className="mentor-contract-primary" type="button" onClick={handleSign} disabled={!canSign}>
                          {signing ? <LoadingText text={t('mentorContract.generating', '正在生成并归档合同...')} /> : t('mentorContract.completeSigning', '完成签署')}
                        </button>
                      </div>
                      <div className="mentor-contract-code-footer" aria-live="polite">
                        <span>
                          {resendCountdown > 0
                            ? t('emailCode.resendAfter', '{seconds}s 后可重发', { seconds: resendCountdown })
                            : '\u00A0'}
                        </span>
                      </div>
                    </div>
                  )}
                  {notice ? <div className="mentor-contract-notice" role="status">{notice}</div> : null}
                  {error ? <div className="mentor-contract-error" role="alert">{error}</div> : null}
                </section>
              ) : error ? <div className="mentor-contract-error" role="alert">{error}</div> : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default MentorContractModal;
