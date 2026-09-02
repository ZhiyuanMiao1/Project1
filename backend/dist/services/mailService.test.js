"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const mailService_1 = require("./mailService");
const cases = [
    { locale: 'zh-CN', actionLabel: '打开 Mentory' },
    { locale: 'en', actionLabel: 'Open Mentory' },
];
for (const testCase of cases) {
    const subject = testCase.locale === 'en' ? 'Service update' : '服务更新通知';
    const mail = (0, mailService_1.buildAdminBroadcastMail)({
        subject,
        body: testCase.locale === 'en' ? 'The service has been updated.' : '服务已完成更新。',
        locale: testCase.locale,
    });
    strict_1.default.match(mail.html, /<img[^>]+alt="Mentory"/);
    strict_1.default.ok(mail.html.includes(subject));
    strict_1.default.ok(!mail.html.includes('Mentory 通知'));
    strict_1.default.ok(!mail.html.includes('Mentory update'));
    strict_1.default.ok(!mail.html.includes('此邮件由 Mentory 团队发送'));
    strict_1.default.ok(!mail.html.includes('This message was sent by the Mentory team'));
    strict_1.default.match(mail.html, new RegExp(`<a href="https:\\/\\/[^\"]+"[^>]+>${testCase.actionLabel}<\\/a>`));
    strict_1.default.match(mail.html, /background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a;/);
    strict_1.default.match(mail.text, new RegExp(`${testCase.actionLabel}: https:\\/\\/`));
}
console.log('Admin broadcast mail template checks passed.');
