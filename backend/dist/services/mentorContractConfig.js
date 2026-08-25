"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENTOR_CONTRACT_GENERATING_TIMEOUT_MINUTES = exports.MENTOR_CONTRACT_CODE_MAX_ATTEMPTS = exports.MENTOR_CONTRACT_CODE_RESEND_SECONDS = exports.MENTOR_CONTRACT_CODE_EXPIRES_MINUTES = exports.MENTOR_CONTRACT_OSS_PREFIX = exports.MENTOR_CONTRACT_PREVIEW_PDF_FILE = exports.MENTOR_CONTRACT_TEMPLATE_FILE = exports.MENTOR_CONTRACT_VERSION = exports.MENTOR_CONTRACT_TYPE = void 0;
require("dotenv/config");
const path_1 = __importDefault(require("path"));
exports.MENTOR_CONTRACT_TYPE = 'mentor_cooperation';
exports.MENTOR_CONTRACT_VERSION = String(process.env.MENTOR_CONTRACT_VERSION || 'v1.1').trim() || 'v1.1';
exports.MENTOR_CONTRACT_TEMPLATE_FILE = String(process.env.MENTOR_CONTRACT_TEMPLATE_FILE
    || path_1.default.resolve(__dirname, '..', '..', '..', 'docs', 'contracts', 'templates', 'Mentory导师合作协议-v1.1.docx')).trim();
exports.MENTOR_CONTRACT_PREVIEW_PDF_FILE = String(process.env.MENTOR_CONTRACT_PREVIEW_PDF_FILE
    || path_1.default.resolve(__dirname, '..', '..', '..', 'docs', 'contracts', 'templates', 'Mentory导师合作协议-v1.1-preview.pdf')).trim();
exports.MENTOR_CONTRACT_OSS_PREFIX = String(process.env.MENTOR_CONTRACT_OSS_PREFIX || 'private/contracts/mentors').trim().replace(/^\/+|\/+$/g, '');
exports.MENTOR_CONTRACT_CODE_EXPIRES_MINUTES = 10;
exports.MENTOR_CONTRACT_CODE_RESEND_SECONDS = 60;
exports.MENTOR_CONTRACT_CODE_MAX_ATTEMPTS = 5;
exports.MENTOR_CONTRACT_GENERATING_TIMEOUT_MINUTES = 10;
