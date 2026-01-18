"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const ossClient_1 = require("../services/ossClient");
const router = (0, express_1.Router)();
const SIGNED_URL_EXPIRE_SECONDS = 120; // 2 minutes
const MAX_BATCH_ITEMS = 20;
const isHex32 = (s) => typeof s === 'string' && /^[0-9a-fA-F]{32}$/.test(s);
const canMentorAccessRequestStatus = (status) => status === 'submitted' || status === 'paired';
const ensureOssReady = (res) => {
    const client = (0, ossClient_1.getOssClient)();
    if (!client) {
        res.status(500).json({ error: 'OSS 未配置' });
        return null;
    }
    return client;
};
const authorizeCourseRequestAccess = (req, res, requestRow) => {
    const user = req.user;
    if (!user) {
        res.status(401).json({ error: '未授权' });
        return false;
    }
    const status = String(requestRow?.status || '');
    const studentUserId = Number(requestRow?.user_id);
    if (user.role === 'student') {
        if (!Number.isFinite(studentUserId) || studentUserId !== user.id) {
            res.status(403).json({ error: '无权限' });
            return false;
        }
        return true;
    }
    if (user.role === 'mentor') {
        if (!canMentorAccessRequestStatus(status)) {
            res.status(403).json({ error: '无权限' });
            return false;
        }
        return true;
    }
    res.status(403).json({ error: '无权限' });
    return false;
};
const ensureMentorApproved = async (req, res) => {
    const user = req.user;
    if (!user) {
        res.status(401).json({ error: '未授权' });
        return false;
    }
    if (user.role !== 'mentor')
        return true;
    const rows = await (0, db_1.query)("SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [user.id]);
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) {
        res.status(403).json({ error: '导师审核中' });
        return false;
    }
    return true;
};
// GET /api/attachments/course-requests/:requestId/attachments/:fileId/signed-url
router.get('/course-requests/:requestId/attachments/:fileId/signed-url', auth_1.requireAuth, [(0, express_validator_1.param)('requestId').isInt({ min: 1 }), (0, express_validator_1.param)('fileId').custom(isHex32)], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const client = ensureOssReady(res);
    if (!client)
        return;
    if (!(await ensureMentorApproved(req, res)))
        return;
    const requestId = Number.parseInt(String(req.params.requestId), 10);
    const fileId = String(req.params.fileId).toLowerCase();
    const rows = await (0, db_1.query)(`SELECT r.user_id, r.status, a.file_id, a.original_file_name, a.oss_key
       FROM course_requests r
       JOIN course_request_attachments a ON a.request_id = r.id
       WHERE r.id = ? AND a.file_id = ?
       LIMIT 1`, [requestId, fileId]);
    const row = rows?.[0];
    if (!row)
        return res.status(404).json({ error: '未找到附件' });
    if (!authorizeCourseRequestAccess(req, res, row))
        return;
    const ossKey = String(row.oss_key || '').trim();
    if (!ossKey)
        return res.status(404).json({ error: '未找到附件' });
    const fileName = String(row.original_file_name || '').trim();
    const url = client.signatureUrl(ossKey, {
        expires: SIGNED_URL_EXPIRE_SECONDS,
        response: {
            'content-disposition': (0, ossClient_1.buildContentDisposition)(fileName),
        },
    });
    return res.json({
        url,
        expiresAt: Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRE_SECONDS,
        fileId,
    });
});
// POST /api/attachments/course-requests/:requestId/attachments/signed-urls
router.post('/course-requests/:requestId/attachments/signed-urls', auth_1.requireAuth, [
    (0, express_validator_1.param)('requestId').isInt({ min: 1 }),
    (0, express_validator_1.body)('fileIds').isArray({ min: 1, max: MAX_BATCH_ITEMS }),
    (0, express_validator_1.body)('fileIds.*').custom(isHex32),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const client = ensureOssReady(res);
    if (!client)
        return;
    if (!(await ensureMentorApproved(req, res)))
        return;
    const requestId = Number.parseInt(String(req.params.requestId), 10);
    const fileIds = Array.from(new Set(req.body.fileIds.map((x) => String(x).toLowerCase()))).slice(0, MAX_BATCH_ITEMS);
    const requestRows = await (0, db_1.query)('SELECT user_id, status FROM course_requests WHERE id = ? LIMIT 1', [requestId]);
    const requestRow = requestRows?.[0];
    if (!requestRow)
        return res.status(404).json({ error: '未找到需求' });
    if (!authorizeCourseRequestAccess(req, res, requestRow))
        return;
    const placeholders = fileIds.map(() => '?').join(', ');
    const rows = await (0, db_1.query)(`SELECT file_id, original_file_name, oss_key
       FROM course_request_attachments
       WHERE request_id = ? AND file_id IN (${placeholders})
       ORDER BY id ASC`, [requestId, ...fileIds]);
    const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRE_SECONDS;
    const items = (rows || []).map((r) => {
        const ossKey = String(r.oss_key || '').trim();
        const fileName = String(r.original_file_name || '').trim();
        const url = ossKey
            ? client.signatureUrl(ossKey, {
                expires: SIGNED_URL_EXPIRE_SECONDS,
                response: { 'content-disposition': (0, ossClient_1.buildContentDisposition)(fileName) },
            })
            : '';
        return { fileId: String(r.file_id || '').toLowerCase(), url };
    }).filter((it) => it.fileId && it.url);
    return res.json({ items, expiresAt });
});
exports.default = router;
