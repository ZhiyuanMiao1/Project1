import React from 'react';

function NotificationsSection({
  emailNotificationsEnabled,
  emailNotificationsDisabled,
  onToggleEmailNotifications,
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-title">邮件通知</div>
        <div className="settings-row-value">重要更新与课程提醒</div>
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

