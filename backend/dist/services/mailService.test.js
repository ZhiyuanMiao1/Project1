"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const mailService_1 = require("./mailService");
const originalLogoUrl = process.env.MAIL_BRAND_LOGO_URL;
delete process.env.MAIL_BRAND_LOGO_URL;
const assertStandardMail = ({ html, text, title, actionLabel, }) => {
    strict_1.default.ok(html.includes(`<img src="${mailService_1.DEFAULT_BRAND_LOGO_URL}" alt="Mentory" width="72" height="72"`));
    strict_1.default.ok(html.includes(title));
    strict_1.default.match(html, new RegExp(`<a href="https:\\/\\/[^\"]+"[^>]+>${actionLabel}<\\/a>`));
    strict_1.default.match(text, new RegExp(`${actionLabel}: https:\\/\\/`));
};
for (const testCase of [
    { locale: 'zh-CN', actionLabel: '打开 Mentory' },
    { locale: 'en', actionLabel: 'Open Mentory' },
]) {
    const subject = testCase.locale === 'en' ? 'Service update' : '服务更新通知';
    const mail = (0, mailService_1.buildAdminBroadcastMail)({
        subject,
        body: testCase.locale === 'en' ? 'The service has been updated.' : '服务已完成更新。',
        locale: testCase.locale,
    });
    assertStandardMail({ ...mail, title: subject, actionLabel: testCase.actionLabel });
    strict_1.default.ok(!mail.html.includes('Mentory 通知'));
    strict_1.default.ok(!mail.html.includes('Mentory update'));
    strict_1.default.ok(!mail.html.includes('此邮件由 Mentory 团队发送'));
    strict_1.default.ok(!mail.html.includes('This message was sent by the Mentory team'));
    strict_1.default.match(mail.html, /background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a;/);
}
const registerMail = (0, mailService_1.buildRegisterEmailCodeMail)({ code: '123456', expiresMinutes: 10 });
assertStandardMail({
    ...registerMail,
    title: '欢迎注册Mentory',
    actionLabel: '打开 Mentory',
});
for (const testCase of [
    { locale: 'zh-CN', title: '确认签署导师合作协议', actionLabel: '打开 Mentory' },
    { locale: 'en', title: 'Confirm mentor agreement signing', actionLabel: 'Open Mentory' },
]) {
    const mail = (0, mailService_1.buildMentorContractEmailCodeMail)({
        code: '123456',
        contractNumber: 'MTR-2026-0001',
        expiresMinutes: 10,
        locale: testCase.locale,
    });
    assertStandardMail({ ...mail, title: testCase.title, actionLabel: testCase.actionLabel });
    strict_1.default.ok(mail.html.includes('/mentor/contract'));
    strict_1.default.ok(mail.text.includes('/mentor/contract'));
}
process.env.MAIL_BRAND_LOGO_URL = 'http://insecure.example/logo.png';
const fallbackLogoMail = (0, mailService_1.buildRegisterEmailCodeMail)({ code: '123456', expiresMinutes: 10 });
strict_1.default.ok(fallbackLogoMail.html.includes(`src="${mailService_1.DEFAULT_BRAND_LOGO_URL}"`));
if (originalLogoUrl === undefined)
    delete process.env.MAIL_BRAND_LOGO_URL;
else
    process.env.MAIL_BRAND_LOGO_URL = originalLogoUrl;
console.log('Standard mail template checks passed.');
