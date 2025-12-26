import React, { useState } from 'react';
import api from '../../../api/client';

function SecuritySection({ isLoggedIn, onShowToast }) {
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const startPasswordEdit = () => {
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }
    setPasswordError('');
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setEditingPassword(true);
  };

  const cancelPasswordEdit = () => {
    setEditingPassword(false);
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
    setPasswordError('');
  };

  const saveNewPassword = async () => {
    if (savingPassword) return;
    if (!isLoggedIn) {
      setPasswordError('请先登录');
      return;
    }

    const newPassword = newPasswordDraft;
    const confirmPassword = confirmPasswordDraft;
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      setPasswordError('密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    try {
      await api.put('/api/account/password', { newPassword, confirmPassword });
      cancelPasswordEdit();
      if (typeof onShowToast === 'function') onShowToast('密码修改成功', 'success');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || '修改失败，请稍后再试';
      setPasswordError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <div className={`settings-row ${editingPassword ? 'settings-row--overlay' : ''}`}>
        <div className="settings-row-main">
          <div className="settings-row-title">登录密码</div>
          <div className={`settings-row-value ${editingPassword ? 'settings-row-value--interactive' : ''}`}>
            {editingPassword ? (
              <div className="settings-password-fields">
                <input
                  type="password"
                  className="settings-password-input"
                  value={newPasswordDraft}
                  placeholder="新密码（至少6位）"
                  autoComplete="new-password"
                  onChange={(e) => setNewPasswordDraft(e.target.value)}
                />
                <input
                  type="password"
                  className="settings-password-input"
                  value={confirmPasswordDraft}
                  placeholder="确认新密码"
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPasswordDraft(e.target.value)}
                />
                {passwordError && (
                  <div className="settings-inline-error" role="alert">{passwordError}</div>
                )}
              </div>
            ) : (
              '已设置'
            )}
          </div>
        </div>
        {editingPassword ? (
          <div className="settings-row-actions">
            <button type="button" className="settings-action" disabled={savingPassword} onClick={saveNewPassword}>
              {savingPassword ? '保存中...' : '保存'}
            </button>
            <button type="button" className="settings-action" disabled={savingPassword} onClick={cancelPasswordEdit}>
              取消
            </button>
          </div>
        ) : (
          <button type="button" className="settings-action" disabled={!isLoggedIn} onClick={startPasswordEdit}>
            修改
          </button>
        )}
      </div>

      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-title">数据个性化</div>
          <div className="settings-row-value">用于优化推荐内容</div>
        </div>
        <label className="settings-switch">
          <input type="checkbox" defaultChecked />
          <span className="settings-switch-track" aria-hidden="true" />
        </label>
      </div>
    </>
  );
}

export default SecuritySection;

