"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const ossClient_1 = require("../services/ossClient");
const mentorContractService_1 = require("../services/mentorContractService");
const router = (0, express_1.Router)();
const requestIp = (req) => String(req.ip || '').trim().slice(0, 45) || null;
const requestUserAgent = (req) => String(req.get('user-agent') || '').trim().slice(0, 512) || null;
const requireMentor = (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: '未授权' });
        return false;
    }
    if (req.user.role !== 'mentor') {
        res.status(403).json({ error: '仅导师可访问' });
        return false;
    }
    return true;
};
const respondError = (res, error, fallback) => {
    if (error instanceof mentorContractService_1.MentorContractError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
};
router.get('/status', auth_1.requireAuth, async (req, res) => {
    if (!requireMentor(req, res))
        return;
    try {
        return res.json(await (0, mentorContractService_1.toContractStatusResponse)(req.user.id));
    }
    catch (error) {
        return respondError(res, error, 'Mentor contract status error:');
    }
});
const sendPreviewPdf = async (req, res) => {
    if (!requireMentor(req, res))
        return;
    try {
        const preview = await (0, mentorContractService_1.generateMentorContractPreview)(req.user.id, req.body?.legalName);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(preview.pdfBuffer.length));
        res.setHeader('Content-Disposition', (0, ossClient_1.buildContentDisposition)('Mentory导师合作协议-待签署.pdf', 'inline'));
        res.setHeader('X-Mentory-Contract-Preview-Personalised', preview.personalised ? '1' : '0');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(preview.pdfBuffer);
    }
    catch (error) {
        return respondError(res, error, 'Mentor contract preview error:');
    }
};
router.get('/preview.pdf', auth_1.requireAuth, sendPreviewPdf);
router.post('/preview.pdf', auth_1.requireAuth, sendPreviewPdf);
router.post('/send-code', auth_1.requireAuth, async (req, res) => {
    if (!requireMentor(req, res))
        return;
    try {
        return res.json(await (0, mentorContractService_1.sendMentorContractCode)({
            mentorUserId: req.user.id,
            legalName: req.body?.legalName,
            ip: requestIp(req),
            userAgent: requestUserAgent(req),
        }));
    }
    catch (error) {
        return respondError(res, error, 'Mentor contract send code error:');
    }
});
router.post('/sign', auth_1.requireAuth, [
    (0, express_validator_1.body)('code').isString().trim().matches(/^\d{6}$/).withMessage('请输入 6 位验证码'),
    (0, express_validator_1.body)('agreementAccepted').custom((value) => value === true).withMessage('请确认已阅读并同意导师合作协议'),
    (0, express_validator_1.body)('informationConfirmed').custom((value) => value === true).withMessage('请确认合同中的姓名及相关信息真实准确'),
], async (req, res) => {
    if (!requireMentor(req, res))
        return;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: String(errors.array()[0]?.msg || '提交信息有误') });
    }
    try {
        return res.json(await (0, mentorContractService_1.signMentorContract)({
            mentorUserId: req.user.id,
            code: req.body.code,
            agreementAccepted: req.body.agreementAccepted === true,
            informationConfirmed: req.body.informationConfirmed === true,
            ip: requestIp(req),
            userAgent: requestUserAgent(req),
        }));
    }
    catch (error) {
        return respondError(res, error, 'Mentor contract signing error:');
    }
});
router.get('/mine.pdf', auth_1.requireAuth, async (req, res) => {
    if (!requireMentor(req, res))
        return;
    try {
        const { signature, fileName } = await (0, mentorContractService_1.getSignedContractDownload)(req.user.id);
        const client = (0, ossClient_1.getOssClient)();
        if (!client)
            throw new mentorContractService_1.MentorContractError('MENTOR_CONTRACT_OSS_NOT_CONFIGURED', '合同存储暂不可用', 503);
        const result = await client.getStream(signature.final_pdf_oss_key);
        const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', (0, ossClient_1.buildContentDisposition)(fileName, disposition));
        res.setHeader('Cache-Control', 'private, no-store');
        void (0, mentorContractService_1.logMentorContractDownload)({
            mentorUserId: req.user.id,
            signatureId: signature.id,
            ip: requestIp(req),
            userAgent: requestUserAgent(req),
        }).catch((error) => console.error('Mentor contract download audit error:', error));
        result.stream.on('error', (error) => {
            console.error('Mentor contract OSS stream error:', error);
            if (!res.headersSent)
                res.status(502).end();
            else
                res.end();
        });
        return result.stream.pipe(res);
    }
    catch (error) {
        return respondError(res, error, 'Mentor contract download error:');
    }
});
exports.default = router;
