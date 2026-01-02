"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTeachingLanguageCodesForCard = exports.parseTeachingLanguagesJson = exports.sanitizeTeachingLanguageCodes = exports.ensureMentorTeachingLanguagesColumn = exports.isMissingTeachingLanguagesColumnError = exports.SUPPORTED_TEACHING_LANGUAGE_CODES = void 0;
const db_1 = require("../db");
const COLUMN_NAME = 'teaching_languages_json';
exports.SUPPORTED_TEACHING_LANGUAGE_CODES = [
    'zh',
    'en',
    'ja',
    'ko',
    'fr',
    'es',
    'de',
    'it',
];
const SUPPORTED_SET = new Set(exports.SUPPORTED_TEACHING_LANGUAGE_CODES);
let mentorTeachingLanguagesColumnEnsured = false;
const isMissingTeachingLanguagesColumnError = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')))
        return false;
    return message.includes(COLUMN_NAME);
};
exports.isMissingTeachingLanguagesColumnError = isMissingTeachingLanguagesColumnError;
const ensureMentorTeachingLanguagesColumn = async () => {
    if (mentorTeachingLanguagesColumnEnsured)
        return true;
    try {
        await (0, db_1.query)(`ALTER TABLE mentor_profiles ADD COLUMN ${COLUMN_NAME} TEXT NULL`);
        mentorTeachingLanguagesColumnEnsured = true;
        return true;
    }
    catch (e) {
        const code = String(e?.code || '');
        const message = String(e?.message || '');
        if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
            mentorTeachingLanguagesColumnEnsured = true;
            return true;
        }
        return false;
    }
};
exports.ensureMentorTeachingLanguagesColumn = ensureMentorTeachingLanguagesColumn;
const sanitizeTeachingLanguageCodes = (raw, maxCount = 20) => {
    const input = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const code = String(item ?? '').trim().toLowerCase();
        if (!code)
            continue;
        if (!SUPPORTED_SET.has(code))
            continue;
        if (seen.has(code))
            continue;
        seen.add(code);
        out.push(code);
        if (out.length >= maxCount)
            break;
    }
    return out;
};
exports.sanitizeTeachingLanguageCodes = sanitizeTeachingLanguageCodes;
const parseTeachingLanguagesJson = (raw) => {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(String(raw));
        return (0, exports.sanitizeTeachingLanguageCodes)(parsed, 20);
    }
    catch {
        return [];
    }
};
exports.parseTeachingLanguagesJson = parseTeachingLanguagesJson;
const formatTeachingLanguageCodesForCard = (codes) => (Array.isArray(codes) ? codes : [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean)
    .join(', ');
exports.formatTeachingLanguageCodesForCard = formatTeachingLanguageCodesForCard;
