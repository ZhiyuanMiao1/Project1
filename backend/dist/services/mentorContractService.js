"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignedContractDownload = exports.logMentorContractDownload = exports.generateMentorContractPreview = exports.signMentorContract = exports.sendMentorContractCode = exports.toContractStatusResponse = exports.getOwnContractSignature = exports.getMentorContractContext = exports.formatContractDateTime = exports.MentorContractError = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
const mailService_1 = require("./mailService");
const mentorContractDocuments_1 = require("./mentorContractDocuments");
const mentorContractConfig_1 = require("./mentorContractConfig");
const mentorContractSchema_1 = require("./mentorContractSchema");
const CONTRACT_CODE_SECRET = String(process.env.MENTOR_CONTRACT_CODE_SECRET
    || process.env.EMAIL_CODE_SECRET
    || process.env.JWT_SECRET
    || 'dev_contract_code_secret_change_me');
class MentorContractError extends Error {
    constructor(code, message, status = 400, details = {}) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
exports.MentorContractError = MentorContractError;
const toDate = (value) => {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
};
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const addSeconds = (date, seconds) => new Date(date.getTime() + seconds * 1000);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeLegalName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const TAX_RESIDENCY_DECLARATION_VERSION = 'v1';
const requireLegalName = (value) => {
    const legalName = normalizeLegalName(value);
    if (legalName.length < 2 || legalName.length > 120 || /[\u0000-\u001f\u007f]/.test(legalName)) {
        throw new MentorContractError('MENTOR_CONTRACT_LEGAL_NAME_INVALID', '请输入 2 至 120 个字符的真实姓名', 400);
    }
    return legalName;
};
const requireChinaTaxResident = (value) => {
    if (typeof value !== 'boolean') {
        throw new MentorContractError('MENTOR_CONTRACT_TAX_RESIDENCY_REQUIRED', '请选择是否为中国税收居民', 400);
    }
    return value;
};
const hashContractCode = ({ signatureId, email, code, salt }) => crypto_1.default.createHmac('sha256', CONTRACT_CODE_SECRET)
    .update(`${salt}:${signatureId}:${normalizeEmail(email)}:${code}`)
    .digest('hex');
const safeEqualHex = (left, right) => {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length > 0 && a.length === b.length && crypto_1.default.timingSafeEqual(a, b);
};
const generateCode = () => String(crypto_1.default.randomInt(0, 1000000)).padStart(6, '0');
const shanghaiDateParts = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}:${get('second')}`,
    };
};
const formatContractDateTime = (date) => {
    const parts = shanghaiDateParts(date);
    return `${parts.date} ${parts.time} (Asia/Shanghai)`;
};
exports.formatContractDateTime = formatContractDateTime;
const buildContractNumber = () => {
    const parts = shanghaiDateParts(new Date());
    return `MC-${parts.date.replace(/-/g, '')}-${crypto_1.default.randomBytes(6).toString('hex').toUpperCase()}`;
};
const getMentorContractContext = async (mentorUserId) => {
    const rows = await (0, db_1.query)(`SELECT u.id,
            u.email,
            ur.public_id,
            ur.mentor_approved,
            ur.mentor_review_status,
            s.preferred_language
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'mentor'
       LEFT JOIN account_settings s ON s.user_id = u.id
      WHERE u.id = ?
      LIMIT 1`, [mentorUserId]);
    const row = rows[0];
    if (!row)
        throw new MentorContractError('MENTOR_REQUIRED', '仅导师可访问', 403);
    const approved = row.mentor_approved === 1 || row.mentor_approved === true || row.mentor_review_status === 'approved';
    const email = normalizeEmail(row.email);
    return {
        mentorUserId,
        mentorPublicId: String(row.public_id || '').trim(),
        email,
        approved,
        locale: String(row.preferred_language || '').toLowerCase() === 'en' ? 'en' : 'zh-CN',
    };
};
exports.getMentorContractContext = getMentorContractContext;
const assertCanSign = (context) => {
    if (!context.approved)
        throw new MentorContractError('MENTOR_NOT_APPROVED', '导师审核通过后方可签署协议', 403);
    if (!context.email)
        throw new MentorContractError('MENTOR_EMAIL_REQUIRED', '导师注册邮箱不存在，请联系 Mentory 支持', 409);
};
const getOwnContractSignature = async (mentorUserId) => {
    await (0, mentorContractSchema_1.ensureMentorContractSchema)();
    const rows = await (0, db_1.query)(`SELECT id, mentor_user_id, mentor_name, mentor_email, contract_number, contract_version,
            template_file_name, template_sha256, status, signing_started_at, signed_at,
            china_tax_resident, tax_residency_declaration_version, tax_residency_declared_at,
            final_docx_oss_key, final_docx_sha256, final_pdf_oss_key, final_pdf_sha256
       FROM mentor_contract_signatures
      WHERE mentor_user_id = ? AND contract_type = ?
      LIMIT 1`, [mentorUserId, mentorContractConfig_1.MENTOR_CONTRACT_TYPE]);
    return rows[0] || null;
};
exports.getOwnContractSignature = getOwnContractSignature;
const toContractStatusResponse = async (mentorUserId) => {
    const context = await (0, exports.getMentorContractContext)(mentorUserId);
    const signature = await (0, exports.getOwnContractSignature)(mentorUserId);
    const signed = signature?.status === 'signed';
    return {
        isMentor: true,
        approved: context.approved,
        requiresSignature: context.approved && !signed,
        signed,
        status: signature?.status || 'not_started',
        mentorName: signature?.mentor_name || '',
        mentorEmail: signature?.mentor_email || context.email,
        mentorPublicId: context.mentorPublicId,
        contractNumber: signature?.contract_number || null,
        contractVersion: signature?.contract_version || mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
        signedAt: signature?.signed_at || null,
        chinaTaxResident: signature?.china_tax_resident == null
            ? null
            : Boolean(Number(signature.china_tax_resident)),
        pdfSha256: signature?.final_pdf_sha256 || null,
        hasPdf: Boolean(signed && signature?.final_pdf_oss_key),
    };
};
exports.toContractStatusResponse = toContractStatusResponse;
const auditContractEvent = async ({ mentorUserId, signatureId, eventType, ip, userAgent, metadata, }) => {
    await (0, mentorContractSchema_1.ensureMentorContractSchema)();
    await (0, db_1.query)(`INSERT INTO mentor_contract_audit_logs
      (mentor_user_id, contract_signature_id, event_type, ip, user_agent, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`, [
        mentorUserId,
        signatureId || null,
        eventType,
        ip || null,
        userAgent || null,
        metadata ? JSON.stringify(metadata) : null,
    ]);
};
const sendMentorContractCode = async ({ mentorUserId, legalName, chinaTaxResident, ip, userAgent, }) => {
    await (0, mentorContractSchema_1.ensureMentorContractSchema)();
    const context = await (0, exports.getMentorContractContext)(mentorUserId);
    assertCanSign(context);
    const verifiedLegalName = requireLegalName(legalName);
    const verifiedChinaTaxResident = requireChinaTaxResident(chinaTaxResident);
    const template = await (0, mentorContractDocuments_1.getMentorContractTemplate)();
    const now = new Date();
    const code = generateCode();
    const conn = await db_1.pool.getConnection();
    let signatureId = 0;
    let contractNumber = '';
    let codeId = 0;
    try {
        await conn.beginTransaction();
        const [signatureRows] = await conn.execute(`SELECT * FROM mentor_contract_signatures
        WHERE mentor_user_id = ? AND contract_type = ?
        LIMIT 1 FOR UPDATE`, [mentorUserId, mentorContractConfig_1.MENTOR_CONTRACT_TYPE]);
        let signature = signatureRows[0];
        if (signature?.status === 'signed') {
            await conn.commit();
            return {
                alreadySigned: true,
                contractNumber: signature.contract_number,
                contractVersion: signature.contract_version,
            };
        }
        if (!signature) {
            contractNumber = buildContractNumber();
            const [insert] = await conn.execute(`INSERT INTO mentor_contract_signatures
          (mentor_user_id, contract_type, mentor_name, mentor_email, contract_number, contract_version,
           template_file_name, template_sha256, china_tax_resident,
           tax_residency_declaration_version, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
                mentorUserId,
                mentorContractConfig_1.MENTOR_CONTRACT_TYPE,
                verifiedLegalName,
                context.email,
                contractNumber,
                mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
                template.templateFileName,
                template.templateSha256,
                verifiedChinaTaxResident ? 1 : 0,
                TAX_RESIDENCY_DECLARATION_VERSION,
            ]);
            signatureId = Number(insert.insertId);
        }
        else {
            signatureId = Number(signature.id);
            contractNumber = signature.contract_number;
            await conn.execute(`UPDATE mentor_contract_signatures
            SET mentor_name = ?, mentor_email = ?, contract_version = ?, template_file_name = ?,
                template_sha256 = ?, china_tax_resident = ?, tax_residency_declaration_version = ?,
                tax_residency_declared_at = NULL, status = 'pending', signing_started_at = NULL,
                signed_at = NULL, signed_ip = NULL, signed_user_agent = NULL,
                email_verification_code_id = NULL, email_verified_at = NULL,
                failure_code = NULL, failure_detail = NULL
          WHERE id = ? AND status <> 'signed'`, [
                verifiedLegalName,
                context.email,
                mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
                template.templateFileName,
                template.templateSha256,
                verifiedChinaTaxResident ? 1 : 0,
                TAX_RESIDENCY_DECLARATION_VERSION,
                signatureId,
            ]);
        }
        const [latestRows] = await conn.execute(`SELECT * FROM mentor_contract_email_codes
        WHERE contract_signature_id = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [signatureId]);
        const latest = latestRows[0];
        const resendAt = toDate(latest?.resend_available_at);
        if (latest && !latest.invalidated_at && resendAt && resendAt.getTime() > now.getTime()) {
            const retryAfterSeconds = Math.max(1, Math.ceil((resendAt.getTime() - now.getTime()) / 1000));
            throw new MentorContractError('MENTOR_CONTRACT_CODE_RATE_LIMIT', `验证码发送过于频繁，请 ${retryAfterSeconds} 秒后再试`, 429, { retryAfterSeconds });
        }
        await conn.execute(`UPDATE mentor_contract_email_codes
          SET invalidated_at = COALESCE(invalidated_at, ?)
        WHERE contract_signature_id = ? AND invalidated_at IS NULL`, [now, signatureId]);
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const codeHash = hashContractCode({ signatureId, email: context.email, code, salt });
        const [codeInsert] = await conn.execute(`INSERT INTO mentor_contract_email_codes
        (contract_signature_id, email, code_hash, code_salt, max_attempts,
         resend_available_at, expires_at, request_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            signatureId,
            context.email,
            codeHash,
            salt,
            mentorContractConfig_1.MENTOR_CONTRACT_CODE_MAX_ATTEMPTS,
            addSeconds(now, mentorContractConfig_1.MENTOR_CONTRACT_CODE_RESEND_SECONDS),
            addMinutes(now, mentorContractConfig_1.MENTOR_CONTRACT_CODE_EXPIRES_MINUTES),
            ip || null,
            userAgent || null,
        ]);
        codeId = Number(codeInsert.insertId);
        await conn.commit();
    }
    catch (error) {
        try {
            await conn.rollback();
        }
        catch { }
        throw error;
    }
    finally {
        conn.release();
    }
    try {
        await (0, mailService_1.sendMentorContractEmailCodeMail)({
            to: context.email,
            code,
            contractNumber,
            expiresMinutes: mentorContractConfig_1.MENTOR_CONTRACT_CODE_EXPIRES_MINUTES,
            locale: context.locale,
        });
        await auditContractEvent({
            mentorUserId,
            signatureId,
            eventType: 'email_code_sent',
            ip,
            userAgent,
            metadata: {
                codeId,
                contractNumber,
                email: context.email,
                chinaTaxResident: verifiedChinaTaxResident,
                taxResidencyDeclarationVersion: TAX_RESIDENCY_DECLARATION_VERSION,
            },
        });
    }
    catch (error) {
        await (0, db_1.query)('UPDATE mentor_contract_email_codes SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?', [new Date(), codeId]).catch(() => { });
        await auditContractEvent({
            mentorUserId,
            signatureId,
            eventType: 'email_code_send_failed',
            ip,
            userAgent,
            metadata: { codeId, contractNumber },
        }).catch(() => { });
        throw new MentorContractError('MENTOR_CONTRACT_CODE_SEND_FAILED', '验证码发送失败，请稍后再试', 500);
    }
    return {
        message: '验证码已发送',
        contractNumber,
        contractVersion: mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
        maskedEmail: context.email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),
        resendAfterSeconds: mentorContractConfig_1.MENTOR_CONTRACT_CODE_RESEND_SECONDS,
        expiresInSeconds: mentorContractConfig_1.MENTOR_CONTRACT_CODE_EXPIRES_MINUTES * 60,
    };
};
exports.sendMentorContractCode = sendMentorContractCode;
const signMentorContract = async ({ mentorUserId, code, agreementAccepted, informationConfirmed, chinaTaxResident, ip, userAgent, }) => {
    if (!agreementAccepted || !informationConfirmed) {
        throw new MentorContractError('MENTOR_CONTRACT_CONFIRMATIONS_REQUIRED', '请勾选两项确认后再签署', 400);
    }
    const verifiedChinaTaxResident = requireChinaTaxResident(chinaTaxResident);
    const normalizedCode = String(code || '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new MentorContractError('MENTOR_CONTRACT_CODE_INVALID_FORMAT', '请输入 6 位验证码', 400);
    }
    await (0, mentorContractSchema_1.ensureMentorContractSchema)();
    const context = await (0, exports.getMentorContractContext)(mentorUserId);
    assertCanSign(context);
    const now = new Date();
    const conn = await db_1.pool.getConnection();
    let signature;
    let codeRow;
    try {
        await conn.beginTransaction();
        const [signatureRows] = await conn.execute(`SELECT * FROM mentor_contract_signatures
        WHERE mentor_user_id = ? AND contract_type = ?
        LIMIT 1 FOR UPDATE`, [mentorUserId, mentorContractConfig_1.MENTOR_CONTRACT_TYPE]);
        signature = signatureRows[0];
        if (!signature)
            throw new MentorContractError('MENTOR_CONTRACT_CODE_REQUIRED', '请先发送邮箱验证码', 409);
        if (signature.status === 'signed') {
            await conn.commit();
            return {
                signed: true,
                alreadySigned: true,
                contractNumber: signature.contract_number,
                contractVersion: signature.contract_version,
                signedAt: signature.signed_at,
                pdfSha256: signature.final_pdf_sha256,
            };
        }
        if (signature.status === 'generating') {
            const startedAt = toDate(signature.signing_started_at);
            const staleBefore = addMinutes(now, -mentorContractConfig_1.MENTOR_CONTRACT_GENERATING_TIMEOUT_MINUTES);
            if (startedAt && startedAt.getTime() > staleBefore.getTime()) {
                throw new MentorContractError('MENTOR_CONTRACT_PROCESSING', '合同正在生成，请勿重复提交', 409);
            }
            await conn.execute(`UPDATE mentor_contract_signatures
            SET status = 'failed', failure_code = 'GENERATION_TIMEOUT', failure_detail = 'Previous generation timed out'
          WHERE id = ? AND status = 'generating'`, [signature.id]);
            signature.status = 'failed';
        }
        if (signature.china_tax_resident == null
            || Boolean(Number(signature.china_tax_resident)) !== verifiedChinaTaxResident) {
            throw new MentorContractError('MENTOR_CONTRACT_TAX_RESIDENCY_CHANGED', '税务居民选择已变化，请重新发送验证码', 409);
        }
        const [codeRows] = await conn.execute(`SELECT * FROM mentor_contract_email_codes
        WHERE contract_signature_id = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [signature.id]);
        codeRow = codeRows[0];
        if (!codeRow || codeRow.invalidated_at) {
            throw new MentorContractError('MENTOR_CONTRACT_CODE_NOT_FOUND', '验证码不存在或已失效', 400);
        }
        const expiresAt = toDate(codeRow.expires_at);
        if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
            await conn.execute('UPDATE mentor_contract_email_codes SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?', [now, codeRow.id]);
            await conn.commit();
            throw new MentorContractError('MENTOR_CONTRACT_CODE_EXPIRED', '验证码已过期，请重新发送', 400);
        }
        if (Number(codeRow.attempt_count) >= Number(codeRow.max_attempts)) {
            throw new MentorContractError('MENTOR_CONTRACT_CODE_TOO_MANY_ATTEMPTS', '验证码错误次数过多，请重新发送', 429);
        }
        const expectedHash = hashContractCode({
            signatureId: signature.id,
            email: codeRow.email,
            code: normalizedCode,
            salt: codeRow.code_salt,
        });
        if (!safeEqualHex(expectedHash, codeRow.code_hash)) {
            const nextAttempts = Number(codeRow.attempt_count || 0) + 1;
            const attemptsRemaining = Math.max(0, Number(codeRow.max_attempts) - nextAttempts);
            await conn.execute(`UPDATE mentor_contract_email_codes
            SET attempt_count = ?, last_attempt_at = ?, invalidated_at = IF(? <= 0, COALESCE(invalidated_at, ?), invalidated_at)
          WHERE id = ?`, [nextAttempts, now, attemptsRemaining, now, codeRow.id]);
            await conn.commit();
            throw new MentorContractError(attemptsRemaining > 0 ? 'MENTOR_CONTRACT_CODE_INVALID' : 'MENTOR_CONTRACT_CODE_TOO_MANY_ATTEMPTS', attemptsRemaining > 0 ? '验证码错误，请重新输入' : '验证码错误次数过多，请重新发送', attemptsRemaining > 0 ? 400 : 429, { attemptsRemaining });
        }
        const signedAt = toDate(signature.signed_at) || now;
        await conn.execute(`UPDATE mentor_contract_email_codes
          SET verified_at = COALESCE(verified_at, ?), last_attempt_at = ?
        WHERE id = ?`, [now, now, codeRow.id]);
        await conn.execute(`UPDATE mentor_contract_signatures
          SET status = 'generating', signing_started_at = ?, signed_at = ?, signed_ip = ?,
              signed_user_agent = ?, email_verification_code_id = ?, email_verified_at = ?,
              tax_residency_declared_at = ?,
              failure_code = NULL, failure_detail = NULL
        WHERE id = ? AND status <> 'signed'`, [now, signedAt, ip || null, userAgent || null, codeRow.id, now, now, signature.id]);
        signature.status = 'generating';
        signature.signing_started_at = now;
        signature.signed_at = signedAt;
        await conn.commit();
    }
    catch (error) {
        try {
            await conn.rollback();
        }
        catch { }
        throw error;
    }
    finally {
        conn.release();
    }
    await auditContractEvent({
        mentorUserId,
        signatureId: signature.id,
        eventType: 'email_code_verified',
        ip,
        userAgent,
        metadata: { codeId: codeRow.id, contractNumber: signature.contract_number },
    }).catch(() => { });
    try {
        const signedAt = toDate(signature.signed_at) || now;
        const signedAtText = (0, exports.formatContractDateTime)(signedAt);
        const artifacts = await (0, mentorContractDocuments_1.generateContractArtifacts)({
            MENTOR_NAME: signature.mentor_name,
            MENTOR_EMAIL: signature.mentor_email,
            CONTRACT_NUMBER: signature.contract_number,
            CONTRACT_VERSION: signature.contract_version,
            SIGNED_AT: signedAtText,
            EFFECTIVE_AT: signedAtText,
        }, signature.contract_number);
        if (artifacts.templateSha256 !== signature.template_sha256) {
            throw new Error('MENTOR_CONTRACT_TEMPLATE_CHANGED_AFTER_CODE_SENT');
        }
        const uploaded = await (0, mentorContractDocuments_1.uploadContractArtifacts)({ mentorUserId, contractNumber: signature.contract_number, artifacts });
        await (0, db_1.query)(`UPDATE mentor_contract_signatures
          SET status = 'signed', final_docx_oss_key = ?, final_docx_sha256 = ?,
              final_pdf_oss_key = ?, final_pdf_sha256 = ?, failure_code = NULL, failure_detail = NULL
        WHERE id = ? AND status = 'generating'`, [uploaded.docxKey, artifacts.docxSha256, uploaded.pdfKey, artifacts.pdfSha256, signature.id]);
        await auditContractEvent({
            mentorUserId,
            signatureId: signature.id,
            eventType: 'contract_signed',
            ip,
            userAgent,
            metadata: {
                contractNumber: signature.contract_number,
                contractVersion: signature.contract_version,
                templateSha256: artifacts.templateSha256,
                docxSha256: artifacts.docxSha256,
                pdfSha256: artifacts.pdfSha256,
                emailVerificationCodeId: codeRow.id,
                chinaTaxResident: verifiedChinaTaxResident,
                taxResidencyDeclarationVersion: TAX_RESIDENCY_DECLARATION_VERSION,
            },
        });
        return {
            signed: true,
            alreadySigned: false,
            contractNumber: signature.contract_number,
            contractVersion: signature.contract_version,
            signedAt,
            pdfSha256: artifacts.pdfSha256,
        };
    }
    catch (error) {
        const errorCode = String(error?.code || error?.message || 'MENTOR_CONTRACT_GENERATION_FAILED').slice(0, 80);
        const detail = String(error?.message || error || 'Contract generation failed').slice(0, 1000);
        await (0, db_1.query)(`UPDATE mentor_contract_signatures
          SET status = 'failed', failure_code = ?, failure_detail = ?
        WHERE id = ? AND status <> 'signed'`, [errorCode, detail, signature.id]).catch(() => { });
        await auditContractEvent({
            mentorUserId,
            signatureId: signature.id,
            eventType: 'contract_generation_failed',
            ip,
            userAgent,
            metadata: { errorCode },
        }).catch(() => { });
        throw new MentorContractError('MENTOR_CONTRACT_GENERATION_FAILED', '合同生成或归档失败，请稍后重试', 500);
    }
};
exports.signMentorContract = signMentorContract;
const previewCache = new Map();
const generateMentorContractPreview = async (mentorUserId, legalName) => {
    const context = await (0, exports.getMentorContractContext)(mentorUserId);
    assertCanSign(context);
    const template = await (0, mentorContractDocuments_1.getMentorContractTemplate)();
    const normalizedLegalName = normalizeLegalName(legalName);
    if (!normalizedLegalName) {
        return { pdfBuffer: await (0, mentorContractDocuments_1.getMentorContractPreviewPdf)(), personalised: false };
    }
    const verifiedLegalName = requireLegalName(normalizedLegalName);
    const cacheKey = (0, mentorContractDocuments_1.sha256)(`${template.templateSha256}:${mentorUserId}:${verifiedLegalName}:${context.email}`);
    const cached = previewCache.get(cacheKey);
    if (cached)
        return { pdfBuffer: cached, personalised: true };
    try {
        const artifacts = await (0, mentorContractDocuments_1.generateContractArtifacts)({
            MENTOR_NAME: verifiedLegalName,
            MENTOR_EMAIL: context.email,
            CONTRACT_NUMBER: context.locale === 'en' ? 'Generated after signing' : '签署时自动生成',
            CONTRACT_VERSION: mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
            SIGNED_AT: context.locale === 'en' ? 'Generated after signing' : '签署完成后生成',
            EFFECTIVE_AT: context.locale === 'en' ? 'Same as signing time' : '与签署时间相同',
        }, `mentor-contract-preview-${mentorUserId}`);
        previewCache.set(cacheKey, artifacts.pdfBuffer);
        while (previewCache.size > 30)
            previewCache.delete(previewCache.keys().next().value);
        return { pdfBuffer: artifacts.pdfBuffer, personalised: true };
    }
    catch (error) {
        console.error('Mentor contract personalised preview generation failed:', error);
        throw new MentorContractError('MENTOR_CONTRACT_PREVIEW_GENERATION_FAILED', '合同个性化预览生成失败，请稍后重试', 503);
    }
};
exports.generateMentorContractPreview = generateMentorContractPreview;
const logMentorContractDownload = async ({ mentorUserId, signatureId, ip, userAgent, }) => auditContractEvent({ mentorUserId, signatureId, eventType: 'contract_pdf_downloaded', ip, userAgent });
exports.logMentorContractDownload = logMentorContractDownload;
const getSignedContractDownload = async (mentorUserId) => {
    const signature = await (0, exports.getOwnContractSignature)(mentorUserId);
    if (!signature || signature.status !== 'signed' || !signature.final_pdf_oss_key) {
        throw new MentorContractError('MENTOR_CONTRACT_NOT_SIGNED', '尚未找到已签署合同', 404);
    }
    return {
        signature,
        fileName: `${signature.contract_number}-${path_1.default.parse(signature.template_file_name).name}.pdf`,
    };
};
exports.getSignedContractDownload = getSignedContractDownload;
