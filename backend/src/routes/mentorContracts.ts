import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { buildContentDisposition, getOssClient } from '../services/ossClient';
import {
  generateMentorContractPreview,
  getSignedContractDownload,
  logMentorContractDownload,
  MentorContractError,
  sendMentorContractCode,
  signMentorContract,
  toContractStatusResponse,
} from '../services/mentorContractService';

const router = Router();

const requestIp = (req: Request) => String(req.ip || '').trim().slice(0, 45) || null;
const requestUserAgent = (req: Request) => String(req.get('user-agent') || '').trim().slice(0, 512) || null;

const requireMentor = (req: Request, res: Response) => {
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

const respondError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof MentorContractError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: '服务器错误，请稍后再试' });
};

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  if (!requireMentor(req, res)) return;
  try {
    return res.json(await toContractStatusResponse(req.user!.id));
  } catch (error) {
    return respondError(res, error, 'Mentor contract status error:');
  }
});

const sendPreviewPdf = async (req: Request, res: Response) => {
  if (!requireMentor(req, res)) return;
  try {
    const preview = await generateMentorContractPreview(req.user!.id, req.body?.legalName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(preview.pdfBuffer.length));
    res.setHeader('Content-Disposition', buildContentDisposition('Mentory导师合作协议-待签署.pdf', 'inline'));
    res.setHeader('X-Mentory-Contract-Preview-Personalised', preview.personalised ? '1' : '0');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(preview.pdfBuffer);
  } catch (error) {
    return respondError(res, error, 'Mentor contract preview error:');
  }
};

router.get('/preview.pdf', requireAuth, sendPreviewPdf);
router.post('/preview.pdf', requireAuth, sendPreviewPdf);

router.post('/send-code', requireAuth, async (req: Request, res: Response) => {
  if (!requireMentor(req, res)) return;
  try {
    return res.json(await sendMentorContractCode({
      mentorUserId: req.user!.id,
      legalName: req.body?.legalName,
      chinaTaxResident: req.body?.chinaTaxResident,
      ip: requestIp(req),
      userAgent: requestUserAgent(req),
    }));
  } catch (error) {
    return respondError(res, error, 'Mentor contract send code error:');
  }
});

router.post(
  '/sign',
  requireAuth,
  [
    body('code').isString().trim().matches(/^\d{6}$/).withMessage('请输入 6 位验证码'),
    body('agreementAccepted').custom((value) => value === true).withMessage('请确认已阅读并同意导师合作协议'),
    body('informationConfirmed').custom((value) => value === true).withMessage('请确认合同中的姓名及相关信息真实准确'),
    body('chinaTaxResident').custom((value) => typeof value === 'boolean').withMessage('请选择是否为中国税收居民'),
  ],
  async (req: Request, res: Response) => {
    if (!requireMentor(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: String(errors.array()[0]?.msg || '提交信息有误') });
    }
    try {
      return res.json(await signMentorContract({
        mentorUserId: req.user!.id,
        code: req.body.code,
        agreementAccepted: req.body.agreementAccepted === true,
        informationConfirmed: req.body.informationConfirmed === true,
        chinaTaxResident: req.body.chinaTaxResident,
        ip: requestIp(req),
        userAgent: requestUserAgent(req),
      }));
    } catch (error) {
      return respondError(res, error, 'Mentor contract signing error:');
    }
  }
);

router.get('/mine.pdf', requireAuth, async (req: Request, res: Response) => {
  if (!requireMentor(req, res)) return;
  try {
    const { signature, fileName } = await getSignedContractDownload(req.user!.id);
    const client = getOssClient();
    if (!client) throw new MentorContractError('MENTOR_CONTRACT_OSS_NOT_CONFIGURED', '合同存储暂不可用', 503);

    const result = await client.getStream(signature.final_pdf_oss_key!);
    const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(fileName, disposition));
    res.setHeader('Cache-Control', 'private, no-store');
    void logMentorContractDownload({
      mentorUserId: req.user!.id,
      signatureId: signature.id,
      ip: requestIp(req),
      userAgent: requestUserAgent(req),
    }).catch((error) => console.error('Mentor contract download audit error:', error));
    result.stream.on('error', (error: unknown) => {
      console.error('Mentor contract OSS stream error:', error);
      if (!res.headersSent) res.status(502).end(); else res.end();
    });
    return result.stream.pipe(res);
  } catch (error) {
    return respondError(res, error, 'Mentor contract download error:');
  }
});

export default router;
