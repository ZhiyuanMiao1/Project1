import React from 'react';
import { useI18n } from '../../../i18n/language';

function NotificationsSection({
  emailNotificationsEnabled,
  emailNotificationsDisabled,
  onToggleEmailNotifications,
}) {
  const { t } = useI18n();
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-title">{t('notifications.email', '邮件通知')}</div>
        <div className="settings-row-value">{t('notifications.emailValue', '重要更新与课程提醒，验证码除外')}</div>
      </div>
      <label className="settings-switch">
        <input
          type="checkbox"
          checked={emailNotificationsEnabled}
          onChange={onToggleEmailNotifications}
          disabled={emailNotificationsDisabled}
        />
        <span className="settings-switch-track" aria-hidden="true" />
      </label>
    </div>
  );
}

export default NotificationsSection;
