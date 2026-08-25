"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mentorContractService_1 = require("../services/mentorContractService");
const mentorContractDocuments_1 = require("../services/mentorContractDocuments");
const mentorContractConfig_1 = require("../services/mentorContractConfig");
const run = async () => {
    const outputDir = path_1.default.resolve(process.cwd(), '.contract-render-test');
    const contractNumber = 'MC-RENDER-TEST';
    const signedAt = (0, mentorContractService_1.formatContractDateTime)(new Date('2026-08-25T04:30:00.000Z'));
    const artifacts = await (0, mentorContractDocuments_1.generateContractArtifacts)({
        MENTOR_NAME: '真实模板转换测试导师',
        MENTOR_EMAIL: 'mentor.contract.render.test@example.com',
        CONTRACT_NUMBER: contractNumber,
        CONTRACT_VERSION: mentorContractConfig_1.MENTOR_CONTRACT_VERSION,
        SIGNED_AT: signedAt,
        EFFECTIVE_AT: signedAt,
    }, contractNumber);
    await fs_1.default.promises.mkdir(outputDir, { recursive: true });
    const docxPath = path_1.default.join(outputDir, `${contractNumber}.docx`);
    const pdfPath = path_1.default.join(outputDir, `${contractNumber}.pdf`);
    await fs_1.default.promises.writeFile(docxPath, artifacts.docxBuffer);
    await fs_1.default.promises.writeFile(pdfPath, artifacts.pdfBuffer);
    console.log(JSON.stringify({
        docxPath,
        pdfPath,
        templateSha256: artifacts.templateSha256,
        docxSha256: artifacts.docxSha256,
        pdfSha256: artifacts.pdfSha256,
        pdfBytes: artifacts.pdfBuffer.length,
    }, null, 2));
};
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
