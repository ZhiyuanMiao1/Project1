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
    (0, express_validator_1.body)('size').optional().isInt({ min: 1, max: MAX_AVATAR_BYTES }).withMessage('文件过大'),
    (0, express_validator_1.body)('scope').optional().isIn(['mentorAvatar', 'studentAvatar']).withMessage('scope 无效'),
], async (req, res) => {
    const scopeRaw = typeof req.body?.scope === 'string' ? String(req.body.scope) : '';
    const scope = scopeRaw === 'studentAvatar' ? 'studentAvatar' : 'mentorAvatar';
    if (scope === 'mentorAvatar' && req.user?.role !== 'mentor')
        return res.status(403).json({ error: '仅导师可访问' });
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
        if (ct && !ct.startsWith('image/'))
            return res.status(400).json({ error: '仅支持图片文件' });
        const ext = resolveImageExt(fileName, ct);
        if (!ext)
            return res.status(400).json({ error: '不支持的图片格式' });
        let businessId = '';
        let dir = '';
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
        const now = new Date();
        const yyyy = String(now.getFullYear());
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const fileId = crypto_1.default.randomUUID().replace(/-/g, '');
        dir = scope === 'mentorAvatar'
            ? `v1/mentors/${businessId}/avatar/${yyyy}/${mm}/`
            : `v1/students/${businessId}/avatar/${yyyy}/${mm}/`;
        const key = `${dir}${fileId}.${ext}`;
        const expiration = new Date(Date.now() + POLICY_EXPIRE_SECONDS * 1000).toISOString();
        const policyObj = {
            expiration,
            conditions: [
                ['content-length-range', 0, MAX_AVATAR_BYTES],
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
            maxBytes: MAX_AVATAR_BYTES,
            scope,
        });
    }
    catch (e) {
        console.error('OSS policy error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
