import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const parseBoolean = (value: any, fallback = false) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
};

const parsePort = (value: any, fallback = 465) => {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getBrandLogoHtml = () => {
  const explicitLogoUrl = String(process.env.MAIL_BRAND_LOGO_URL || '').trim();
  const publicBaseUrl = String(process.env.MAIL_PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  const logoUrl = explicitLogoUrl || (publicBaseUrl ? `${trimTrailingSlash(publicBaseUrl)}/Logo-removebg.png` : '');

  if (!/^https?:\/\//i.test(logoUrl)) return '';

  return `<img src="${logoUrl}" alt="Mentory" width="132" style="display: block; width: 132px; max-width: 100%; height: auto; border: 0;" />`;
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

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const config = getMailRuntimeConfig();
  if (!config.host || !config.user || !config.pass || !config.from) {
    throw new Error('MAIL_NOT_CONFIGURED');
  }

  transporter = nodemailer.createTransport({
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

export const sendMail = async ({ to, subject, text, html }: SendMailInput) => {
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

export const sendRegisterEmailCodeMail = async ({
  to,
  code,
  expiresMinutes,
}: {
  to: string;
  code: string;
  expiresMinutes: number;
}) => {
  const safeMinutes = Math.max(1, Math.floor(expiresMinutes));
  const subject = 'Mentory 注册验证码';
  const text = `您的 Mentory 注册验证码为 ${code}，${safeMinutes} 分钟内有效。如非本人操作，请忽略此邮件。`;
  const brandLogoHtml = getBrandLogoHtml();
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6;">
      <div style="max-width: 520px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        ${brandLogoHtml ? `<div style="margin-bottom: 22px;">${brandLogoHtml}</div>` : ''}
        <div style="font-size: 22px; font-weight: 700; margin-bottom: 10px;">欢迎注册Mentory</div>
        <div style="font-size: 14px; color: #475569; margin-bottom: 18px;">您正在进行 Mentory 邮箱注册验证。</div>
        <div style="padding: 18px 20px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
          <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</div>
        </div>
        <div style="margin-top: 18px; font-size: 14px; color: #475569;">验证码 ${safeMinutes} 分钟内有效，仅可使用一次。如非本人操作，请直接忽略此邮件。</div>
      </div>
    </div>
  `;

  await sendMail({ to, subject, text, html });
};
