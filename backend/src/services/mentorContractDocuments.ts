import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import JSZip from 'jszip';
import { getOssClient } from './ossClient';
import {
  MENTOR_CONTRACT_OSS_PREFIX,
  MENTOR_CONTRACT_PREVIEW_PDF_FILE,
  MENTOR_CONTRACT_TEMPLATE_FILE,
} from './mentorContractConfig';

const execFileAsync = promisify(execFile);
const PLACEHOLDERS = [
  'MENTOR_NAME',
  'MENTOR_EMAIL',
  'CONTRACT_NUMBER',
  'CONTRACT_VERSION',
  'SIGNED_AT',
  'EFFECTIVE_AT',
] as const;

type Placeholder = typeof PLACEHOLDERS[number];
export type ContractTemplateValues = Record<Placeholder, string>;

export type GeneratedContractArtifacts = {
  docxBuffer: Buffer;
  docxSha256: string;
  pdfBuffer: Buffer;
  pdfSha256: string;
};

const xmlEscape = (value: string) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const sha256 = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');

export const getMentorContractTemplate = async () => {
  const templateBuffer = await fs.promises.readFile(MENTOR_CONTRACT_TEMPLATE_FILE);
  return {
    templateBuffer,
    templateSha256: sha256(templateBuffer),
    templateFileName: path.basename(MENTOR_CONTRACT_TEMPLATE_FILE),
  };
};

export const getMentorContractPreviewPdf = () => fs.promises.readFile(MENTOR_CONTRACT_PREVIEW_PDF_FILE);

export const fillMentorContractTemplate = async (
  templateBuffer: Buffer,
  values: ContractTemplateValues
) => {
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentPart = zip.file('word/document.xml');
  if (!documentPart) throw new Error('MENTOR_CONTRACT_TEMPLATE_DOCUMENT_MISSING');

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

const findLibreOfficeBinary = () => {
  const configured = String(process.env.LIBREOFFICE_BIN || '').trim();
  if (configured) return configured;
  if (process.platform === 'win32') {
    const programFiles = String(process.env.ProgramFiles || 'C:\\Program Files');
    return path.join(programFiles, 'LibreOffice', 'program', 'soffice.exe');
  }
  return 'libreoffice';
};

const toLibreOfficeFileUrl = (filePath: string) => {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized)}`;
};

export const convertDocxBufferToPdf = async (docxBuffer: Buffer, fileStem: string) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mentory-contract-'));
  const profileDir = path.join(tempRoot, 'lo-profile');
  const outputDir = path.join(tempRoot, 'output');
  const docxPath = path.join(tempRoot, `${fileStem}.docx`);
  const pdfPath = path.join(outputDir, `${fileStem}.pdf`);

  try {
    await fs.promises.mkdir(profileDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(docxPath, docxBuffer, { flag: 'wx' });

    const binary = findLibreOfficeBinary();
    await execFileAsync(
      binary,
      [
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
      ],
      { timeout: 120_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );

    const pdfBuffer = await fs.promises.readFile(pdfPath);
    if (pdfBuffer.length < 1024 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('MENTOR_CONTRACT_PDF_INVALID');
    }
    return pdfBuffer;
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
};

export const generateContractArtifacts = async (
  values: ContractTemplateValues,
  fileStem: string
): Promise<GeneratedContractArtifacts & { templateSha256: string; templateFileName: string }> => {
  const { templateBuffer, templateSha256, templateFileName } = await getMentorContractTemplate();
  const docxBuffer = await fillMentorContractTemplate(templateBuffer, values);
  const pdfBuffer = await convertDocxBufferToPdf(docxBuffer, fileStem);
  return {
    templateSha256,
    templateFileName,
    docxBuffer,
    docxSha256: sha256(docxBuffer),
    pdfBuffer,
    pdfSha256: sha256(pdfBuffer),
  };
};

export const uploadContractArtifacts = async ({
  mentorUserId,
  contractNumber,
  artifacts,
}: {
  mentorUserId: number;
  contractNumber: string;
  artifacts: GeneratedContractArtifacts;
}) => {
  const client = getOssClient();
  if (!client) throw new Error('MENTOR_CONTRACT_OSS_NOT_CONFIGURED');

  const safeNumber = contractNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  const base = `${MENTOR_CONTRACT_OSS_PREFIX}/${mentorUserId}/${safeNumber}`;
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
