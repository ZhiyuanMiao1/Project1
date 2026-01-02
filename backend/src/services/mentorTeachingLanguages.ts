import { query } from '../db';

const COLUMN_NAME = 'teaching_languages_json';

export const SUPPORTED_TEACHING_LANGUAGE_CODES = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'es',
  'de',
  'it',
] as const;

const SUPPORTED_SET = new Set<string>(SUPPORTED_TEACHING_LANGUAGE_CODES);

let mentorTeachingLanguagesColumnEnsured = false;

export const isMissingTeachingLanguagesColumnError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column'))) return false;
  return message.includes(COLUMN_NAME);
};

export const ensureMentorTeachingLanguagesColumn = async () => {
  if (mentorTeachingLanguagesColumnEnsured) return true;
  try {
    await query(`ALTER TABLE mentor_profiles ADD COLUMN ${COLUMN_NAME} TEXT NULL`);
    mentorTeachingLanguagesColumnEnsured = true;
    return true;
  } catch (e: any) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
      mentorTeachingLanguagesColumnEnsured = true;
      return true;
    }
    return false;
  }
};

export const sanitizeTeachingLanguageCodes = (raw: any, maxCount = 20): string[] => {
  const input = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const code = String(item ?? '').trim().toLowerCase();
    if (!code) continue;
    if (!SUPPORTED_SET.has(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= maxCount) break;
  }
  return out;
};

export const parseTeachingLanguagesJson = (raw: any): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return sanitizeTeachingLanguageCodes(parsed, 20);
  } catch {
    return [];
  }
};

export const formatTeachingLanguageCodesForCard = (codes: string[]) =>
  (Array.isArray(codes) ? codes : [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean)
    .join(', ');
