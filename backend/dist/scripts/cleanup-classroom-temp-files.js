"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../db");
const ossClient_1 = require("../services/ossClient");
dotenv_1.default.config();
const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');
const isIgnorableDeleteError = (error) => {
    const code = typeof error?.code === 'string' ? error.code : '';
    const status = Number(error?.status || error?.statusCode || 0);
    const message = typeof error?.message === 'string' ? error.message : '';
    return code === 'NoSuchKey' || status === 404 || message.includes('NoSuchKey');
};
async function processBatch() {
    const client = (0, ossClient_1.getOssClient)();
    if (!client) {
        throw new Error('OSS 未配置');
    }
    const rows = await (0, db_1.query)(`
    SELECT id, classroom_id, file_id, oss_key
    FROM classroom_temp_files
    WHERE cleanup_status = 'ready'
      AND cleanup_after IS NOT NULL
      AND cleanup_after <= CURRENT_TIMESTAMP
    ORDER BY id ASC
    LIMIT ?
    `, [BATCH_SIZE]);
    if (!rows.length) {
        console.log('[cleanup-classroom-temp-files] no files ready for cleanup');
        return 0;
    }
    let processed = 0;
    for (const row of rows) {
        const id = Number(row?.id);
        const classroomId = Number(row?.classroom_id);
        const fileId = String(row?.file_id || '').trim().toLowerCase();
        const ossKey = String(row?.oss_key || '').trim();
        if (!Number.isFinite(id) || !fileId || !ossKey)
            continue;
        if (DRY_RUN) {
            console.log(`[cleanup-classroom-temp-files] dry-run classroom=${classroomId} file=${fileId} key=${ossKey}`);
            processed += 1;
            continue;
        }
        try {
            await client.delete(ossKey);
        }
        catch (error) {
            if (!isIgnorableDeleteError(error)) {
                console.error(`[cleanup-classroom-temp-files] delete failed file=${fileId}:`, error);
                await (0, db_1.query)(`
          UPDATE classroom_temp_files
          SET cleanup_status = 'failed'
          WHERE id = ? AND cleanup_status = 'ready'
          `, [id]);
                processed += 1;
                continue;
            }
        }
        await (0, db_1.query)(`
      UPDATE classroom_temp_files
      SET cleanup_status = 'deleted',
          cleaned_at = CURRENT_TIMESTAMP
      WHERE id = ? AND cleanup_status IN ('ready', 'failed')
      `, [id]);
        console.log(`[cleanup-classroom-temp-files] deleted classroom=${classroomId} file=${fileId}`);
        processed += 1;
    }
    return processed;
}
async function main() {
    let totalProcessed = 0;
    while (true) {
        const processed = await processBatch();
        totalProcessed += processed;
        if (!processed || DRY_RUN)
            break;
    }
    console.log(`[cleanup-classroom-temp-files] done processed=${totalProcessed} dryRun=${DRY_RUN}`);
}
main()
    .catch((error) => {
    console.error('[cleanup-classroom-temp-files] fatal:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await db_1.pool.end();
});
