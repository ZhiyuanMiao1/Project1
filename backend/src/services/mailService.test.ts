import assert from 'node:assert/strict';
import {
  buildAdminBroadcastMail,
  buildMentorContractEmailCodeMail,
  buildRegisterEmailCodeMail,
  DEFAULT_BRAND_LOGO_URL,
} from './mailService';

const originalLogoUrl = process.env.MAIL_BRAND_LOGO_URL;
delete process.env.MAIL_BRAND_LOGO_URL;

const assertStandardMail = ({
  html,
  text,
  title,
  actionLabel,
}: {
  html: string;
  text: string;
  title: string;
  actionLabel: string;
}) => {
  assert.ok(html.includes(`<img src="${DEFAULT_BRAND_LOGO_URL}" alt="Mentory" width="72" height="72"`));
  assert.ok(html.includes(title));
  assert.match(
    html,
    new RegExp(`<a href="https:\\/\\/[^\"]+"[^>]+>${actionLabel}<\\/a>`)
  );
  assert.match(text, new RegExp(`${actionLabel}: https:\\/\\/`));
};

for (const testCase of [
  { locale: 'zh-CN' as const, actionLabel: '打开 Mentory' },
  { locale: 'en' as const, actionLabel: 'Open Mentory' },
]) {
  const subject = testCase.locale === 'en' ? 'Service update' : '服务更新通知';
  const mail = buildAdminBroadcastMail({
    subject,
    body: testCase.locale === 'en' ? 'The service has been updated.' : '服务已完成更新。',
    locale: testCase.locale,
  });

  assertStandardMail({ ...mail, title: subject, actionLabel: testCase.actionLabel });
  assert.ok(!mail.html.includes('Mentory 通知'));
  assert.ok(!mail.html.includes('Mentory update'));
  assert.ok(!mail.html.includes('此邮件由 Mentory 团队发送'));
  assert.ok(!mail.html.includes('This message was sent by the Mentory team'));
  assert.match(mail.html, /background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a;/);
}

const registerMail = buildRegisterEmailCodeMail({ code: '123456', expiresMinutes: 10 });
assertStandardMail({
  ...registerMail,
  title: '欢迎注册Mentory',
  actionLabel: '打开 Mentory',
});

for (const testCase of [
  { locale: 'zh-CN' as const, title: '确认签署导师合作协议', actionLabel: '打开 Mentory' },
  { locale: 'en' as const, title: 'Confirm mentor agreement signing', actionLabel: 'Open Mentory' },
]) {
  const mail = buildMentorContractEmailCodeMail({
    code: '123456',
    contractNumber: 'MTR-2026-0001',
    expiresMinutes: 10,
    locale: testCase.locale,
  });
  assertStandardMail({ ...mail, title: testCase.title, actionLabel: testCase.actionLabel });
  assert.ok(mail.html.includes('/mentor/contract'));
  assert.ok(mail.text.includes('/mentor/contract'));
}

process.env.MAIL_BRAND_LOGO_URL = 'http://insecure.example/logo.png';
const fallbackLogoMail = buildRegisterEmailCodeMail({ code: '123456', expiresMinutes: 10 });
assert.ok(fallbackLogoMail.html.includes(`src="${DEFAULT_BRAND_LOGO_URL}"`));

if (originalLogoUrl === undefined) delete process.env.MAIL_BRAND_LOGO_URL;
else process.env.MAIL_BRAND_LOGO_URL = originalLogoUrl;

console.log('Standard mail template checks passed.');
