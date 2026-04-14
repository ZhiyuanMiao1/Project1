"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRegisterEmailCodeMail = exports.sendMail = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const nodemailer_1 = __importDefault(require("nodemailer"));
dotenv_1.default.config();
const parseBoolean = (value, fallback = false) => {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '').trim().toLowerCase();
    if (!raw)
        return fallback;
    if (raw === 'true' || raw === '1' || raw === 'yes')
        return true;
    if (raw === 'false' || raw === '0' || raw === 'no')
        return false;
    return fallback;
};
const parsePort = (value, fallback = 465) => {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const getMailRuntimeConfig = () => {
    const host = String(process.env.MAIL_HOST || '').trim();
    const port = parsePort(process.env.MAIL_PORT, 465);
    const secure = parseBoolean(process.env.MAIL_SECURE, port === 465);
    const user = String(process.env.MAIL_USER || '').trim();
    const pass = String(process.env.MAIL_PASS || '').trim();
    const from = String(process.env.MAIL_FROM || '').trim() || user;
    return { host, port, secure, user, pass, from };
};
let transporter = null;
const getTransporter = () => {
    if (transporter)
        return transporter;
    const config = getMailRuntimeConfig();
    if (!config.host || !config.user || !config.pass || !config.from) {
        throw new Error('MAIL_NOT_CONFIGURED');
    }
    transporter = nodemailer_1.default.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass,
        },
    });
    return transporter;
};
const sendMail = async ({ to, subject, text, html }) => {
    const transport = getTransporter();
    const config = getMailRuntimeConfig();
    await transport.sendMail({
        from: config.from,
        to,
        subject,
        text,
        html,
    });
};
exports.sendMail = sendMail;
const sendRegisterEmailCodeMail = async ({ to, code, expiresMinutes, }) => {
    const safeMinutes = Math.max(1, Math.floor(expiresMinutes));
    const subject = 'Mentory 注册验证码';
    const text = `您的 Mentory 注册验证码为 ${code}，${safeMinutes} 分钟内有效。如非本人操作，请忽略此邮件。`;
    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6;">
      <div style="max-width: 520px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <div style="font-size: 22px; font-weight: 700; margin-bottom: 10px;">Mentory 注册验证码</div>
        <div style="font-size: 14px; color: #475569; margin-bottom: 18px;">您正在进行 Mentory 邮箱注册验证。</div>
        <div style="padding: 18px 20px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
          <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</div>
        </div>
        <div style="margin-top: 18px; font-size: 14px; color: #475569;">验证码 ${safeMinutes} 分钟内有效，仅可使用一次。如非本人操作，请直接忽略此邮件。</div>
      </div>
    </div>
  `;
    await (0, exports.sendMail)({ to, subject, text, html });
};
exports.sendRegisterEmailCodeMail = sendRegisterEmailCodeMail;
