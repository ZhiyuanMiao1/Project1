import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { query } from '../db';

dotenv.config();

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SendNotificationMailInput = SendMailInput & {
  recipientUserId: number;
};

type AdminBroadcastMailInput = {
  to: string;
  subject: string;
  body: string;
  locale?: 'zh-CN' | 'en';
};

type AppointmentNotificationMailInput = {
  recipientUserId: number;
  to: string;
  subject: string;
  eventTitle: string;
  actorDisplayName: string;
  windowText?: string;
  messageUrl?: string;
  description: string;
  locale?: 'zh-CN' | 'en';
};

export type EmailNotificationPreferences = {
  enabled: boolean;
  locale: 'zh-CN' | 'en';
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

const DEFAULT_BRAND_LOGO_URL = 'https://mentory.cc/Logo-Mentory-standard-removebg.png';
const DEFAULT_PUBLIC_APP_URL = 'https://mentory.cc';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const getPublicAppUrl = () => {
  const explicit = String(process.env.MAIL_PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  return trimTrailingSlash(explicit || DEFAULT_PUBLIC_APP_URL);
};

const getBrandLogoHtml = () => {
  const explicitLogoUrl = String(process.env.MAIL_BRAND_LOGO_URL || '').trim();
  const publicBaseUrl = getPublicAppUrl();
  const logoUrl = explicitLogoUrl || (publicBaseUrl
    ? `${trimTrailingSlash(publicBaseUrl)}/Logo-Mentory-standard-removebg.png`
    : DEFAULT_BRAND_LOGO_URL);

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

export const buildAdminBroadcastMail = ({
  subject,
  body,
  locale = 'zh-CN',
}: Omit<AdminBroadcastMailInput, 'to'>) => {
  const isEnglish = locale === 'en';
  const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br />');
  const publicAppUrl = getPublicAppUrl();
  const templateLabel = isEnglish ? 'Mentory update' : 'Mentory 通知';
  const footerText = isEnglish
    ? 'This message was sent by the Mentory team. You can manage email notifications in Settings.'
    : '此邮件由 Mentory 团队发送。您可以前往设置管理邮件通知。';
  const appLinkLabel = isEnglish ? 'Open Mentory' : '打开 Mentory';
  const html = buildMailCardHtml(
    subject,
    `
      <div style="display: inline-block; margin-bottom: 18px; padding: 5px 10px; border-radius: 999px; background: #e8f5f7; color: #11566d; font-size: 12px; font-weight: 700;">${templateLabel}</div>
      <div style="font-size: 15px; color: #334155; line-height: 1.8; overflow-wrap: anywhere;">${safeBody}</div>
      <div style="height: 1px; margin: 24px 0 16px; background: #e2e8f0;"></div>
      <div style="font-size: 12px; color: #64748b; line-height: 1.6;">
        ${footerText}
        <a href="${publicAppUrl}" style="color: #176b87; text-decoration: none;">${appLinkLabel}</a>
      </div>
    `
  );
  const text = `${body}\n\n— Mentory\n${footerText} ${publicAppUrl}`;
  return { subject, text, html };
};

export const sendAdminBroadcastMail = async ({
  to,
  subject,
  body,
  locale = 'zh-CN',
}: AdminBroadcastMailInput) => {
  await sendMail({ to, ...buildAdminBroadcastMail({ subject, body, locale }) });
};

export const areEmailNotificationsEnabledForUser = async (userId: number) => {
  if (!Number.isFinite(userId) || userId <= 0) return false;

  const rows = await query<Array<{ email_notifications: number | string | null }>>(
    `
    SELECT COALESCE(email_notifications, 1) AS email_notifications
    FROM account_settings
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!Array.isArray(rows) || rows.length === 0) return true;
  return Number(rows[0]?.email_notifications) === 1;
};

export const getEmailNotificationPreferencesForUser = async (
  userId: number
): Promise<EmailNotificationPreferences> => {
  if (!Number.isFinite(userId) || userId <= 0) return { enabled: false, locale: 'zh-CN' };

  try {
    const rows = await query<Array<{
      email_notifications: number | string | null;
      preferred_language: string | null;
    }>>(
      `SELECT COALESCE(email_notifications, 1) AS email_notifications, preferred_language
       FROM account_settings
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );
    if (!Array.isArray(rows) || rows.length === 0) return { enabled: true, locale: 'zh-CN' };
    return {
      enabled: Number(rows[0]?.email_notifications) === 1,
      locale: String(rows[0]?.preferred_language || '').toLowerCase() === 'en' ? 'en' : 'zh-CN',
    };
  } catch (error: any) {
    // Keep notifications working during a rolling deployment before the new
    // language column has been applied. The schema default remains Chinese.
    if (String(error?.code || '') !== 'ER_BAD_FIELD_ERROR') throw error;
    return {
      enabled: await areEmailNotificationsEnabledForUser(userId),
      locale: 'zh-CN',
    };
  }
};

export const sendNotificationMail = async ({
  recipientUserId,
  to,
  subject,
  text,
  html,
}: SendNotificationMailInput) => {
  const enabled = await areEmailNotificationsEnabledForUser(recipientUserId);
  if (!enabled) return false;

  await sendMail({ to, subject, text, html });
  return true;
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

export const sendMentorContractEmailCodeMail = async ({
  to,
  code,
  contractNumber,
  expiresMinutes,
  locale = 'zh-CN',
}: {
  to: string;
  code: string;
  contractNumber: string;
  expiresMinutes: number;
  locale?: 'zh-CN' | 'en';
}) => {
  const safeMinutes = Math.max(1, Math.floor(expiresMinutes));
  const isEnglish = locale === 'en';
  const subject = isEnglish ? 'Mentory mentor agreement verification code' : 'Mentory 导师协议签署验证码';
  const title = isEnglish ? 'Confirm mentor agreement signing' : '确认签署导师合作协议';
  const text = isEnglish
    ? `Your verification code for Mentory agreement ${contractNumber} is ${code}. It expires in ${safeMinutes} minutes and can only be used for this agreement.`
    : `您正在签署 Mentory 导师合作协议（合同编号：${contractNumber}）。验证码为 ${code}，${safeMinutes} 分钟内有效，仅可用于本合同。`;
  const html = buildMailCardHtml(
    title,
    `
      <div style="font-size:14px;color:#475569;margin-bottom:8px;">${isEnglish ? 'Agreement number' : '合同编号'}：${escapeHtml(contractNumber)}</div>
      <div style="font-size:14px;color:#475569;margin-bottom:18px;">${isEnglish ? 'Enter this code on Mentory to confirm your signing intent.' : '请在 Mentory 签署页面输入以下验证码，以确认本人签署意愿。'}</div>
      <div style="padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#111827;">${escapeHtml(code)}</div>
      </div>
      <div style="margin-top:18px;font-size:14px;color:#475569;">${isEnglish
        ? `The code expires in ${safeMinutes} minutes, can be used once, and is bound to this agreement. Do not share it with anyone.`
        : `验证码 ${safeMinutes} 分钟内有效、仅可使用一次，并与本合同绑定。请勿向任何人泄露验证码。`}</div>
    `
  );

  await sendMail({ to, subject, text, html });
};

export const sendAppointmentNotificationMail = async ({
  recipientUserId,
  to,
  subject,
  eventTitle,
  actorDisplayName,
  windowText = '',
  messageUrl = '',
  description,
  locale = 'zh-CN',
}: AppointmentNotificationMailInput) => {
  const isEnglish = locale === 'en';
  const safeActor = actorDisplayName.trim() || (isEnglish ? 'The other participant' : '对方');
  const safeWindowText = windowText.trim();
  const safeMessageUrl = /^https?:\/\//i.test(messageUrl.trim()) ? messageUrl.trim() : '';

  const details = [
    { label: isEnglish ? 'From' : '操作人', value: safeActor },
    ...(safeWindowText ? [{ label: isEnglish ? 'Time' : '预约时间', value: safeWindowText }] : []),
  ];

  const text = [
    `Mentory ${eventTitle}`,
    description,
    ...details.map((item) => `${item.label}：${item.value}`),
    safeMessageUrl
      ? `${isEnglish ? 'Messages' : '消息页面'}：${safeMessageUrl}`
      : (isEnglish ? 'Sign in to Mentory to view the full update.' : '请登录 Mentory 查看完整消息。'),
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
      <div style="margin-top: 18px; font-size: 14px; color: #475569;">${isEnglish ? 'Sign in to Mentory to view the full update.' : '请登录 Mentory 查看完整消息。'}</div>
      ${safeMessageUrl ? `
        <div style="margin-top: 18px;">
          <a href="${escapeHtml(safeMessageUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 10px; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; font-size: 14px; font-weight: 700; text-decoration: none;">${isEnglish ? 'Open Mentory' : '打开 Mentory'}</a>
        </div>
      ` : ''}
    `
  );

  await sendNotificationMail({ recipientUserId, to, subject, text, html });
};

export const sendCourseDisputeResultMail = async ({
  recipientUserId,
  to,
  recipientRole,
  recipientPublicId,
  courseName,
  startsAt,
  outcome,
  resolvedHours,
  refundAmountText,
  resultMessage,
}: {
  recipientUserId: number;
  to: string;
  recipientRole: 'student' | 'mentor';
  recipientPublicId: string;
  courseName: string;
  startsAt: Date | string;
  outcome: string;
  resolvedHours?: number;
  refundAmountText?: string;
  resultMessage: string;
}) => {
  if (!to.trim() || !recipientPublicId.trim()) return false;
  const preferences = await getEmailNotificationPreferencesForUser(recipientUserId);
  if (!preferences.enabled) return false;
  const isEnglish = preferences.locale === 'en';
  const isStudent = recipientRole === 'student';
  const safeCourseName = courseName.trim() || (isEnglish ? 'the course' : '相关课程');
  const date = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const lessonTime = Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Shanghai',
    }).format(date);
  const hours = Number(resolvedHours || 0);
  const hoursText = Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
  const outcomeLabels: Record<string, { zh: string; en: string }> = {
    feedback_only: { zh: '已记录反馈', en: 'Feedback recorded' },
    lesson_credit: { zh: '补偿课时', en: 'Lesson credit issued' },
    refund: { zh: '退款', en: 'Refund completed' },
    rejected: { zh: '暂不支持所申请的处理方案', en: 'Requested resolution not approved' },
  };
  const outcomeLabel = outcomeLabels[outcome]?.[isEnglish ? 'en' : 'zh'] || outcome;
  const subject = isEnglish
    ? (isStudent ? 'Mentory course dispute result' : 'Mentory course dispute notice')
    : (isStudent ? 'Mentory 课程异议处理结果' : 'Mentory 课程异议处理通知');
  const greeting = isEnglish
    ? `Mentory user ${recipientPublicId}, hello:`
    : `Mentory用户 ${recipientPublicId}，你好：`;
  const intro = isEnglish
    ? (isStudent
      ? `The course dispute you submitted for “${safeCourseName}” has been resolved.`
      : `The course dispute related to “${safeCourseName}” has been resolved.`)
    : (isStudent
      ? `你针对“${safeCourseName}”提交的课程异议已完成处理。`
      : `与“${safeCourseName}”相关的课程异议已完成处理。`);
  const details = [
    { label: isEnglish ? 'Result' : '处理结果', value: outcomeLabel },
    ...(outcome === 'lesson_credit' || outcome === 'refund'
      ? [{ label: isEnglish ? 'Lesson hours' : (outcome === 'lesson_credit' ? '补偿数量' : '处理课时'), value: `${hoursText} ${isEnglish ? (hours === 1 ? 'hour' : 'hours') : '小时'}` }]
      : []),
    ...(isStudent && outcome === 'refund' && refundAmountText
      ? [{ label: isEnglish ? 'Refund amount' : '退款金额', value: refundAmountText }]
      : []),
    { label: isEnglish ? 'Lesson time' : '上课时间', value: lessonTime },
  ];
  const closingByOutcome: Record<string, { studentZh: string; mentorZh: string; studentEn: string; mentorEn: string }> = {
    feedback_only: {
      studentZh: '相关反馈将用于后续服务质量管理。本次处理不涉及课时补偿或退款。',
      mentorZh: '请结合反馈检查后续授课安排与服务质量。',
      studentEn: 'The feedback will be used for ongoing service quality management. No lesson credit or refund is involved.',
      mentorEn: 'Please review the feedback when planning future lessons and maintaining service quality.',
    },
    lesson_credit: {
      studentZh: '补偿课时已加入你的 Mentory 课时余额。',
      mentorZh: '请根据处理说明做好后续课程与教学安排。',
      studentEn: 'The lesson credit has been added to your Mentory balance.',
      mentorEn: 'Please take the resolution into account in future lesson planning and delivery.',
    },
    refund: {
      studentZh: '退款已按原支付渠道处理，实际到账时间以支付机构为准。',
      mentorZh: '请结合处理结果检查相关授课记录与后续安排。',
      studentEn: 'The refund has been processed through the original payment method. Arrival time is subject to the payment provider.',
      mentorEn: 'Please review the relevant lesson records and any follow-up arrangements.',
    },
    rejected: {
      studentZh: '本次处理不涉及课时补偿或退款。',
      mentorZh: '本次处理不涉及课时补偿或退款。',
      studentEn: 'No lesson credit or refund is involved in this resolution.',
      mentorEn: 'No lesson credit or refund is involved in this resolution.',
    },
  };
  const closing = closingByOutcome[outcome];
  const closingText = closing
    ? closing[isEnglish ? (isStudent ? 'studentEn' : 'mentorEn') : (isStudent ? 'studentZh' : 'mentorZh')]
    : '';
  const thanks = isEnglish
    ? (isStudent ? 'Thank you for your understanding and support.' : 'Thank you for your understanding and cooperation.')
    : (isStudent ? '谢谢你的理解与支持。' : '谢谢你的理解与配合。');
  const text = [
    greeting,
    '',
    intro,
    '',
    ...details.map((item) => `${item.label}：${item.value}`),
    '',
    isEnglish ? 'Mentory note' : '平台说明',
    resultMessage,
    '',
    closingText,
    '',
    thanks,
    isEnglish ? 'Mentory Team' : 'Mentory 团队',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
  const detailRowsHtml = details.map((item) => `
    <tr>
      <td style="width: 96px; padding: 7px 0; font-size: 13px; color: #64748b; vertical-align: top;">${escapeHtml(item.label)}</td>
      <td style="padding: 7px 0; font-size: 14px; color: #0f172a; vertical-align: top;">${escapeHtml(item.value)}</td>
    </tr>
  `).join('');
  const safeResultMessage = escapeHtml(resultMessage).replace(/\r?\n/g, '<br />');
  const html = buildMailCardHtml(
    isEnglish ? 'Course dispute result' : '课程异议处理结果',
    `<div style="font-size:14px;color:#0f172a;margin-bottom:12px;">${escapeHtml(greeting)}</div>
     <div style="font-size:14px;color:#475569;margin-bottom:16px;">${escapeHtml(intro)}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:16px;">${detailRowsHtml}</table>
     <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:8px;">${isEnglish ? 'Mentory note' : '平台说明'}</div>
     <div style="padding:14px 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-size:14px;">${safeResultMessage}</div>
     ${closingText ? `<div style="font-size:14px;color:#475569;margin-top:16px;">${escapeHtml(closingText)}</div>` : ''}
     <div style="font-size:14px;color:#475569;margin-top:16px;">${escapeHtml(thanks)}</div>
     <div style="font-size:14px;color:#0f172a;margin-top:4px;">${isEnglish ? 'Mentory Team' : 'Mentory 团队'}</div>`
  );
  await sendMail({ to, subject, text, html });
  return true;
};

export const sendLessonHoursFinalDecisionMail = async ({
  recipientUserId,
  recipientRole,
  finalHours,
  decision,
  reason,
}: {
  recipientUserId: number;
  recipientRole: 'student' | 'mentor';
  finalHours: number;
  decision: 'mentor_proposed' | 'student_disputed';
  reason: string;
}) => {
  if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) return false;
  const preferences = await getEmailNotificationPreferencesForUser(recipientUserId);
  if (!preferences.enabled) return false;

  const rows = await query<Array<{ email: string | null }>>(
    'SELECT email FROM users WHERE id = ? LIMIT 1',
    [recipientUserId]
  );
  const to = String(rows?.[0]?.email || '').trim();
  if (!to) return false;

  const isEnglish = preferences.locale === 'en';
  const hours = Number(finalHours.toFixed(2));
  const hoursText = Number.isInteger(hours) ? String(hours) : String(hours);
  const decisionText = decision === 'mentor_proposed'
    ? (isEnglish ? "The mentor's submitted hours were accepted" : '采信导师提交课时')
    : (isEnglish ? "The student's disputed hours were accepted" : '采信学生争议课时');
  const subject = isEnglish ? 'Mentory: Lesson-hours review result' : 'Mentory 课时审核结果';
  const title = isEnglish ? 'Lesson-hours review completed' : '课时审核已完成';
  const greeting = isEnglish
    ? (recipientRole === 'student' ? 'Hello,' : 'Hello,')
    : '你好：';
  const intro = isEnglish
    ? 'Mentory has completed its review of the disputed lesson hours.'
    : 'Mentory 平台已完成本次课时异议审核。';
  const details = [
    { label: isEnglish ? 'Decision' : '裁决结果', value: decisionText },
    { label: isEnglish ? 'Final hours' : '最终课时', value: `${hoursText} ${isEnglish ? (hours === 1 ? 'hour' : 'hours') : '小时'}` },
  ];
  const text = [
    greeting,
    '',
    intro,
    ...details.map((item) => `${item.label}: ${item.value}`),
    `${isEnglish ? 'Reason' : '裁决依据'}: ${reason}`,
    '',
    isEnglish
      ? 'The final lesson hours have been applied to the course and deducted from the student lesson balance.'
      : '最终课时已计入课程，并从学生课时余额中扣除。',
    isEnglish ? 'Mentory Team' : 'Mentory 团队',
  ].join('\n');
  const detailRowsHtml = details.map((item) => `
    <tr>
      <td style="width: 96px; padding: 7px 0; font-size: 13px; color: #64748b; vertical-align: top;">${escapeHtml(item.label)}</td>
      <td style="padding: 7px 0; font-size: 14px; color: #0f172a; vertical-align: top;">${escapeHtml(item.value)}</td>
    </tr>
  `).join('');
  const html = buildMailCardHtml(
    title,
    `<div style="font-size:14px;color:#0f172a;margin-bottom:12px;">${escapeHtml(greeting)}</div>
     <div style="font-size:14px;color:#475569;margin-bottom:16px;">${escapeHtml(intro)}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:16px;">${detailRowsHtml}</table>
     <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:8px;">${isEnglish ? 'Reason' : '裁决依据'}</div>
     <div style="padding:14px 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-size:14px;">${escapeHtml(reason).replace(/\r?\n/g, '<br />')}</div>
     <div style="font-size:14px;color:#475569;margin-top:16px;">${isEnglish
       ? 'The final lesson hours have been applied to the course and deducted from the student lesson balance.'
       : '最终课时已计入课程，并从学生课时余额中扣除。'}</div>
     <div style="font-size:14px;color:#0f172a;margin-top:16px;">${isEnglish ? 'Mentory Team' : 'Mentory 团队'}</div>`
  );

  await sendMail({ to, subject, text, html });
  return true;
};
