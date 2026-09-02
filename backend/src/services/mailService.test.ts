import assert from 'node:assert/strict';
import { buildAdminBroadcastMail } from './mailService';

const cases = [
  { locale: 'zh-CN' as const, actionLabel: '打开 Mentory' },
  { locale: 'en' as const, actionLabel: 'Open Mentory' },
];

for (const testCase of cases) {
  const subject = testCase.locale === 'en' ? 'Service update' : '服务更新通知';
  const mail = buildAdminBroadcastMail({
    subject,
    body: testCase.locale === 'en' ? 'The service has been updated.' : '服务已完成更新。',
    locale: testCase.locale,
  });

  assert.match(mail.html, /<img[^>]+alt="Mentory"/);
  assert.ok(mail.html.includes(subject));
  assert.ok(!mail.html.includes('Mentory 通知'));
  assert.ok(!mail.html.includes('Mentory update'));
  assert.ok(!mail.html.includes('此邮件由 Mentory 团队发送'));
  assert.ok(!mail.html.includes('This message was sent by the Mentory team'));
  assert.match(
    mail.html,
    new RegExp(`<a href="https:\\/\\/[^\"]+"[^>]+>${testCase.actionLabel}<\\/a>`)
  );
  assert.match(mail.html, /background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a;/);
  assert.match(mail.text, new RegExp(`${testCase.actionLabel}: https:\\/\\/`));
}

console.log('Admin broadcast mail template checks passed.');
