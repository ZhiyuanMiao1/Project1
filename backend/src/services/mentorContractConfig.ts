import 'dotenv/config';
import path from 'path';

export const MENTOR_CONTRACT_TYPE = 'mentor_cooperation';
export const MENTOR_CONTRACT_VERSION = String(process.env.MENTOR_CONTRACT_VERSION || 'v1.1').trim() || 'v1.1';
export const MENTOR_CONTRACT_TEMPLATE_FILE = String(
  process.env.MENTOR_CONTRACT_TEMPLATE_FILE
  || path.resolve(__dirname, '..', '..', '..', 'docs', 'contracts', 'templates', 'Mentory导师合作协议-v1.1.docx')
).trim();
export const MENTOR_CONTRACT_PREVIEW_PDF_FILE = String(
  process.env.MENTOR_CONTRACT_PREVIEW_PDF_FILE
  || path.resolve(__dirname, '..', '..', '..', 'docs', 'contracts', 'templates', 'Mentory导师合作协议-v1.1-preview.pdf')
).trim();
export const MENTOR_CONTRACT_OSS_PREFIX = String(
  process.env.MENTOR_CONTRACT_OSS_PREFIX || 'private/contracts/mentors'
).trim().replace(/^\/+|\/+$/g, '');

export const MENTOR_CONTRACT_CODE_EXPIRES_MINUTES = 10;
export const MENTOR_CONTRACT_CODE_RESEND_SECONDS = 60;
export const MENTOR_CONTRACT_CODE_MAX_ATTEMPTS = 5;
export const MENTOR_CONTRACT_GENERATING_TIMEOUT_MINUTES = 10;
