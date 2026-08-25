import fs from 'fs';
import path from 'path';
import { formatContractDateTime } from '../services/mentorContractService';
import { generateContractArtifacts } from '../services/mentorContractDocuments';
import { MENTOR_CONTRACT_VERSION } from '../services/mentorContractConfig';

const run = async () => {
  const outputDir = path.resolve(process.cwd(), '.contract-render-test');
  const contractNumber = 'MC-RENDER-TEST';
  const signedAt = formatContractDateTime(new Date('2026-08-25T04:30:00.000Z'));
  const artifacts = await generateContractArtifacts(
    {
      MENTOR_NAME: '真实模板转换测试导师',
      MENTOR_EMAIL: 'mentor.contract.render.test@example.com',
      CONTRACT_NUMBER: contractNumber,
      CONTRACT_VERSION: MENTOR_CONTRACT_VERSION,
      SIGNED_AT: signedAt,
      EFFECTIVE_AT: signedAt,
    },
    contractNumber
  );

  await fs.promises.mkdir(outputDir, { recursive: true });
  const docxPath = path.join(outputDir, `${contractNumber}.docx`);
  const pdfPath = path.join(outputDir, `${contractNumber}.pdf`);
  await fs.promises.writeFile(docxPath, artifacts.docxBuffer);
  await fs.promises.writeFile(pdfPath, artifacts.pdfBuffer);
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

