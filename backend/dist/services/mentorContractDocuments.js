"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadContractArtifacts = exports.generateContractArtifacts = exports.convertDocxBufferToPdf = exports.fillMentorContractTemplate = exports.getMentorContractPreviewPdf = exports.getMentorContractTemplate = exports.sha256 = void 0;
const crypto_1 = __importDefault(require("crypto"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const jszip_1 = __importDefault(require("jszip"));
const ossClient_1 = require("./ossClient");
const mentorContractConfig_1 = require("./mentorContractConfig");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const PLACEHOLDERS = [
    'MENTOR_NAME',
    'MENTOR_EMAIL',
    'CONTRACT_NUMBER',
    'CONTRACT_VERSION',
    'SIGNED_AT',
    'EFFECTIVE_AT',
];
const xmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const sha256 = (value) => crypto_1.default.createHash('sha256').update(value).digest('hex');
exports.sha256 = sha256;
const getMentorContractTemplate = async () => {
    const templateBuffer = await fs_1.default.promises.readFile(mentorContractConfig_1.MENTOR_CONTRACT_TEMPLATE_FILE);
    return {
        templateBuffer,
        templateSha256: (0, exports.sha256)(templateBuffer),
        templateFileName: path_1.default.basename(mentorContractConfig_1.MENTOR_CONTRACT_TEMPLATE_FILE),
    };
};
exports.getMentorContractTemplate = getMentorContractTemplate;
const getMentorContractPreviewPdf = () => fs_1.default.promises.readFile(mentorContractConfig_1.MENTOR_CONTRACT_PREVIEW_PDF_FILE);
exports.getMentorContractPreviewPdf = getMentorContractPreviewPdf;
const fillMentorContractTemplate = async (templateBuffer, values) => {
    const zip = await jszip_1.default.loadAsync(templateBuffer);
    const documentPart = zip.file('word/document.xml');
    if (!documentPart)
        throw new Error('MENTOR_CONTRACT_TEMPLATE_DOCUMENT_MISSING');
    let documentXml = await documentPart.async('string');
    for (const key of PLACEHOLDERS) {
        const token = `{{${key}}}`;
        const occurrences = documentXml.split(token).length - 1;
        if (occurrences !== 1) {
            throw new Error(`MENTOR_CONTRACT_TEMPLATE_TOKEN_${key}_${occurrences}`);
        }
        documentXml = documentXml.replace(token, xmlEscape(values[key]));
    }
    if (/\{\{[A-Z0-9_]+\}\}/.test(documentXml)) {
        throw new Error('MENTOR_CONTRACT_TEMPLATE_UNFILLED_TOKEN');
    }
    zip.file('word/document.xml', documentXml);
    return zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    });
};
exports.fillMentorContractTemplate = fillMentorContractTemplate;
const findLibreOfficeBinary = () => {
    const configured = String(process.env.LIBREOFFICE_BIN || '').trim();
    if (configured)
        return configured;
    if (process.platform === 'win32') {
        const programFiles = String(process.env.ProgramFiles || 'C:\\Program Files');
        return path_1.default.join(programFiles, 'LibreOffice', 'program', 'soffice.exe');
    }
    return 'libreoffice';
};
const toLibreOfficeFileUrl = (filePath) => {
    const normalized = path_1.default.resolve(filePath).replace(/\\/g, '/');
    return `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized)}`;
};
const convertDocxBufferToPdf = async (docxBuffer, fileStem) => {
    const tempRoot = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'mentory-contract-'));
    const profileDir = path_1.default.join(tempRoot, 'lo-profile');
    const outputDir = path_1.default.join(tempRoot, 'output');
    const docxPath = path_1.default.join(tempRoot, `${fileStem}.docx`);
    const pdfPath = path_1.default.join(outputDir, `${fileStem}.pdf`);
    try {
        await fs_1.default.promises.mkdir(profileDir, { recursive: true });
        await fs_1.default.promises.mkdir(outputDir, { recursive: true });
        await fs_1.default.promises.writeFile(docxPath, docxBuffer, { flag: 'wx' });
        const binary = findLibreOfficeBinary();
        await execFileAsync(binary, [
            '--headless',
            '--nologo',
            '--nodefault',
            '--nolockcheck',
            `-env:UserInstallation=${toLibreOfficeFileUrl(profileDir)}`,
            '--convert-to',
            'pdf:writer_pdf_Export',
            '--outdir',
            outputDir,
            docxPath,
        ], { timeout: 120000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
        const pdfBuffer = await fs_1.default.promises.readFile(pdfPath);
        if (pdfBuffer.length < 1024 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
            throw new Error('MENTOR_CONTRACT_PDF_INVALID');
        }
        return pdfBuffer;
    }
    finally {
        await fs_1.default.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => { });
    }
};
exports.convertDocxBufferToPdf = convertDocxBufferToPdf;
const generateContractArtifacts = async (values, fileStem) => {
    const { templateBuffer, templateSha256, templateFileName } = await (0, exports.getMentorContractTemplate)();
    const docxBuffer = await (0, exports.fillMentorContractTemplate)(templateBuffer, values);
    const pdfBuffer = await (0, exports.convertDocxBufferToPdf)(docxBuffer, fileStem);
    return {
        templateSha256,
        templateFileName,
        docxBuffer,
        docxSha256: (0, exports.sha256)(docxBuffer),
        pdfBuffer,
        pdfSha256: (0, exports.sha256)(pdfBuffer),
    };
};
exports.generateContractArtifacts = generateContractArtifacts;
const uploadContractArtifacts = async ({ mentorUserId, contractNumber, artifacts, }) => {
    const client = (0, ossClient_1.getOssClient)();
    if (!client)
        throw new Error('MENTOR_CONTRACT_OSS_NOT_CONFIGURED');
    const safeNumber = contractNumber.replace(/[^A-Za-z0-9_-]/g, '_');
    const base = `${mentorContractConfig_1.MENTOR_CONTRACT_OSS_PREFIX}/${mentorUserId}/${safeNumber}`;
    const docxKey = `${base}/${artifacts.docxSha256}.docx`;
    const pdfKey = `${base}/${artifacts.pdfSha256}.pdf`;
    await client.put(docxKey, artifacts.docxBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Cache-Control': 'private, max-age=31536000, immutable',
        },
    });
    await client.put(pdfKey, artifacts.pdfBuffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'private, max-age=31536000, immutable',
        },
    });
    return { docxKey, pdfKey };
};
exports.uploadContractArtifacts = uploadContractArtifacts;
