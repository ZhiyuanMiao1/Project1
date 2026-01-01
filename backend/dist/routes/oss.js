"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const router = (0, express_1.Router)();
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB
const POLICY_EXPIRE_SECONDS = 120; // 2 minutes
const resolveImageExt = (fileName, contentType) => {
    const allowed = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
    const extFromName = path_1.default.extname(fileName || '').toLowerCase().replace(/^\./, '');
    if (extFromName && allowed.has(extFromName))
        return extFromName === 'jpeg' ? 'jpg' : extFromName;
    const ct = (contentType || '').toLowerCase().trim();
    const map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
    };
    return map[ct] || null;
};
const resolveAttachmentExt = (fileName, contentType) => {
    const allowed = new Set(['pdf', 'ppt', 'pptx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'zip']);
    const extFromName = path_1.default.extname(fileName || '').toLowerCase().replace(/^\./, '');
    if (extFromName && allowed.has(extFromName))
        return extFromName === 'jpeg' ? 'jpg' : extFromName;
    const ct = (contentType || '').toLowerCase().trim();
    const map = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'application/zip': 'zip',
        'application/x-zip-compressed': 'zip',
    };
    return map[ct] || null;
};
const buildOssHost = (bucket, region) => {
    const cleanBucket = (bucket || '').trim();
    const cleanRegion = (region || '').trim();
    if (!cleanBucket || !cleanRegion)
        return null;
    const regionForHost = cleanRegion.startsWith('oss-') ? cleanRegion : `oss-${cleanRegion}`;
    return `https://${cleanBucket}.${regionForHost}.aliyuncs.com`;
};
// POST /api/oss/policy
// Browser direct upload policy for mentor avatar.
router.post('/policy', auth_1.requireAuth, [
    (0, express_validator_1.body)('fileName').isString().trim().isLength({ min: 1, max: 255 }).withMessage('fileName 必填'),
    (0, express_validator_1.body)('contentType').optional().isString().trim().isLength({ max: 100 }),
    (0, express_validator_1.body)('size')
        .optional()
        .isInt({ min: 1, max: MAX_ATTACHMENT_BYTES })
        .custom((value, { req }) => {
        const scopeRaw = typeof req.body?.scope === 'string' ? String(req.body.scope) : '';
        const scope = scopeRaw === 'studentAvatar'
            ? 'studentAvatar'
            : scopeRaw === 'courseRequestAttachment'
                ? 'courseRequestAttachment'
                : 'mentorAvatar';
        const max = scope === 'courseRequestAttachment' ? MAX_ATTACHMENT_BYTES : MAX_AVATAR_BYTES;
        return Number(value) <= max;
    })
        .withMessage('文件过大'),
    (0, express_validator_1.body)('scope').optional().isIn(['mentorAvatar', 'studentAvatar', 'courseRequestAttachment']).withMessage('scope 无效'),
    (0, express_validator_1.body)('requestId').optional().isInt({ min: 1 }),
], async (req, res) => {
    const scopeRaw = typeof req.body?.scope === 'string' ? String(req.body.scope) : '';
    const scope = scopeRaw === 'studentAvatar'
        ? 'studentAvatar'
        : scopeRaw === 'courseRequestAttachment'
            ? 'courseRequestAttachment'
            : 'mentorAvatar';
    if (scope === 'mentorAvatar' && req.user?.role !== 'mentor')
        return res.status(403).json({ error: '仅导师可访问' });
    if (scope === 'courseRequestAttachment' && req.user?.role !== 'student')
        return res.status(403).json({ error: '仅学生可访问' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    try {
        const bucket = process.env.OSS_BUCKET || '';
        const region = process.env.OSS_REGION || '';
        const accessKeyId = process.env.OSS_ACCESS_KEY_ID || '';
        const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || '';
        const host = buildOssHost(bucket, region);
        if (!host || !accessKeyId || !accessKeySecret) {
            return res.status(500).json({ error: 'OSS 未配置' });
        }
        const { fileName, contentType } = req.body;
        const ct = (contentType || '').toLowerCase().trim();
        const ext = scope === 'courseRequestAttachment'
            ? resolveAttachmentExt(fileName, ct)
            : resolveImageExt(fileName, ct);
        if (!ext)
            return res.status(400).json({ error: scope === 'courseRequestAttachment' ? '不支持的文件格式' : '不支持的图片格式' });
        if (scope !== 'courseRequestAttachment' && ct && !ct.startsWith('image/'))
            return res.status(400).json({ error: '仅支持图片文件' });
        let businessId = '';
        let dir = '';
        let maxBytes = MAX_AVATAR_BYTES;
        if (scope === 'mentorAvatar') {
            // 审核 gating + 获取 mentor public_id 作为业务 mentorId
            const roleRows = await (0, db_1.query)("SELECT public_id, mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [req.user.id]);
            const row = roleRows?.[0];
            const approved = row?.mentor_approved === 1 || row?.mentor_approved === true;
            if (!approved)
                return res.status(403).json({ error: '导师审核中，暂不可上传头像' });
            businessId = typeof row?.public_id === 'string' && row.public_id.trim() ? row.public_id.trim() : String(req.user.id);
        }
        else {
            // 获取 student public_id 作为业务 studentId
            const roleRows = await (0, db_1.query)("SELECT public_id FROM user_roles WHERE user_id = ? AND role = 'student' LIMIT 1", [req.user.id]);
            const row = roleRows?.[0];
            businessId = typeof row?.public_id === 'string' && row.public_id.trim() ? row.public_id.trim() : '';
            if (!businessId)
                return res.status(403).json({ error: '未开通学生身份' });
        }
        if (scope === 'courseRequestAttachment') {
            const requestId = Number.parseInt(String(req.body?.requestId || ''), 10);
            if (!Number.isFinite(requestId) || requestId <= 0)
                return res.status(400).json({ error: 'requestId 必填' });
            const rows = await (0, db_1.query)('SELECT id FROM course_requests WHERE id = ? AND user_id = ? LIMIT 1', [requestId, req.user.id]);
            if (!rows?.[0])
                return res.status(404).json({ error: '未找到课程需求' });
            businessId = String(requestId);
            maxBytes = MAX_ATTACHMENT_BYTES;
        }
        const now = new Date();
        const yyyy = String(now.getFullYear());
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const fileId = crypto_1.default.randomUUID().replace(/-/g, '');
        dir = scope === 'mentorAvatar'
            ? `v1/mentors/${businessId}/avatar/${yyyy}/${mm}/`
            : scope === 'studentAvatar'
                ? `v1/students/${businessId}/avatar/${yyyy}/${mm}/`
                : `v1/requests/${businessId}/attachments/${yyyy}/${mm}/`;
        const key = `${dir}${fileId}.${ext}`;
        const expiration = new Date(Date.now() + POLICY_EXPIRE_SECONDS * 1000).toISOString();
        const policyObj = {
            expiration,
            conditions: [
                ['content-length-range', 0, maxBytes],
                ['starts-with', '$key', dir],
            ],
        };
        const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64');
        const signature = crypto_1.default.createHmac('sha1', accessKeySecret).update(policy).digest('base64');
        return res.json({
            host,
            dir,
            key,
            expire: Math.floor(Date.now() / 1000) + POLICY_EXPIRE_SECONDS,
            accessKeyId,
            policy,
            signature,
            fileUrl: `${host}/${key}`,
            maxBytes,
            scope,
            fileId,
            ext,
        });
    }
    catch (e) {
        console.error('OSS policy error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
