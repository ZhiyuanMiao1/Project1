import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type AppointmentNotificationMailInput = {
  to: string;
  subject: string;
  eventTitle: string;
  actorDisplayName: string;
  windowText?: string;
  messageUrl?: string;
  description: string;
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

const DEFAULT_BRAND_LOGO_URL = 'https://mentory.cc/Logo-removebg.png';
const DEFAULT_PUBLIC_APP_URL = 'https://mentory.cc';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const getPublicAppUrl = () => {
  const explicit = String(process.env.MAIL_PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  return trimTrailingSlash(explicit || DEFAULT_PUBLIC_APP_URL);
};

const getBrandLogoHtml = () => {
  const explicitLogoUrl = String(process.env.MAIL_BRAND_LOGO_URL || '').trim();
  const publicBaseUrl = getPublicAppUrl();
  const logoUrl = explicitLogoUrl || (publicBaseUrl ? `${trimTrailingSlash(publicBaseUrl)}/Logo-removebg.png` : DEFAULT_BRAND_LOGO_URL);

  if (!/^https?:\/\//i.test(logoUrl)) return '';

  return `<img src="${logoUrl}" alt="Mentory" width="88" style="display: block; width: 88px; max-width: 100%; height: auto; border: 0;" />`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildMailHeaderHtml = (title: string) => {
  const safeTitle = escapeHtml(title);
  const brandLogoHtml = getBrandLogoHtml();
  return brandLogoHtml
    ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 18px;">
          <tr>
            <td style="vertical-align: middle; padding-right: 14px;">${brandLogoHtml}</td>
            <td style="vertical-align: middle; font-size: 22px; font-weight: 700; color: #0f172a;">${safeTitle}</td>
          </tr>
        </table>
      `
    : `<div style="font-size: 22px; font-weight: 700; margin-bottom: 10px;">${safeTitle}</div>`;
};

const buildMailCardHtml = (title: string, contentHtml: string) => `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6;">
    <div style="max-width: 520px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
      ${buildMailHeaderHtml(title)}
      ${contentHtml}
    </div>
  </div>
`;

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
  const html = buildMailCardHtml(
    '欢迎注册Mentory',
    `
      <div style="font-size: 14px; color: #475569; margin-bottom: 18px;">您正在进行 Mentory 邮箱注册验证。</div>
      <div style="padding: 18px 20px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
        <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #111827;">${escapeHtml(code)}</div>
      </div>
      <div style="margin-top: 18px; font-size: 14px; color: #475569;">验证码 ${safeMinutes} 分钟内有效，仅可使用一次。如非本人操作，请直接忽略此邮件。</div>
    `
  );

  await sendMail({ to, subject, text, html });
};

export const sendPasswordResetEmailCodeMail = async ({
  to,
  code,
  expiresMinutes,
}: {
  to: string;
  code: string;
  expiresMinutes: number;
}) => {
  const safeMinutes = Math.max(1, Math.floor(expiresMinutes));
  const subject = 'Mentory 重置密码验证码';
  const text = `您的 Mentory 重置密码验证码为 ${code}，${safeMinutes} 分钟内有效。如非本人操作，请忽略此邮件。`;
  const html = buildMailCardHtml(
    '重置Mentory密码',
    `
      <div style="font-size: 14px; color: #475569; margin-bottom: 18px;">您正在通过邮箱重新设置 Mentory 登录密码。</div>
      <div style="padding: 18px 20px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center;">
        <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #111827;">${escapeHtml(code)}</div>
      </div>
      <div style="margin-top: 18px; font-size: 14px; color: #475569;">验证码 ${safeMinutes} 分钟内有效，仅可使用一次。如非本人操作，请直接忽略此邮件。</div>
    `
  );

  await sendMail({ to, subject, text, html });
};

export const sendAppointmentNotificationMail = async ({
  to,
  subject,
  eventTitle,
  actorDisplayName,
  windowText = '',
  messageUrl = '',
  description,
}: AppointmentNotificationMailInput) => {
  const safeActor = actorDisplayName.trim() || '对方';
  const safeWindowText = windowText.trim();
  const safeMessageUrl = /^https?:\/\//i.test(messageUrl.trim()) ? messageUrl.trim() : '';

  const details = [
    { label: '操作人', value: safeActor },
    ...(safeWindowText ? [{ label: '预约时间', value: safeWindowText }] : []),
  ];

  const text = [
    `Mentory ${eventTitle}`,
    description,
    ...details.map((item) => `${item.label}：${item.value}`),
    safeMessageUrl ? `消息页面：${safeMessageUrl}` : '请登录 Mentory 查看完整课程预约消息。',
  ].join('\n');

  const detailRowsHtml = details.map((item) => `
    <tr>
      <td style="width: 84px; padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">${escapeHtml(item.label)}</td>
      <td style="padding: 8px 0; font-size: 14px; color: #0f172a; vertical-align: top;">${escapeHtml(item.value)}</td>
    </tr>
  `).join('');

  const html = buildMailCardHtml(
    eventTitle,
    `
      <div style="font-size: 14px; color: #475569; margin-bottom: 18px;">${escapeHtml(description)}</div>
      <div style="padding: 14px 18px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
          ${detailRowsHtml}
        </table>
      </div>
      <div style="margin-top: 18px; font-size: 14px; color: #475569;">请登录 Mentory 查看完整课程预约消息。</div>
      ${safeMessageUrl ? `
        <div style="margin-top: 18px;">
          <a href="${escapeHtml(safeMessageUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 10px; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; font-size: 14px; font-weight: 700; text-decoration: none;">打开Mentory</a>
        </div>
      ` : ''}
    `
  );

  await sendMail({ to, subject, text, html });
};
