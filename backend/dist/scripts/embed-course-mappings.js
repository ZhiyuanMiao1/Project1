"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
const DEFAULT_MODEL = 'text-embedding-v4';
const DEFAULT_EMBEDDINGS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
function requiredEnv(name) {
    const value = process.env[name];
    if (!value || !value.trim())
        throw new Error(`Missing env var: ${name}`);
    return value.trim();
}
function sha256Hex(input) {
    return crypto_1.default.createHash('sha256').update(input).digest('hex');
}
function parseArgs(argv) {
    const args = new Map();
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--'))
            continue;
        const key = token.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args.set(key, true);
        }
        else {
            args.set(key, next);
            i++;
        }
    }
    return args;
}
function resolveCourseMappingsPath(explicitPath) {
    const candidates = [
        explicitPath,
        process.env.COURSE_MAPPINGS_PATH,
        path_1.default.resolve(process.cwd(), 'my-app/src/constants/courseMappings.js'),
        path_1.default.resolve(process.cwd(), '../my-app/src/constants/courseMappings.js'),
        path_1.default.resolve(__dirname, '../../../my-app/src/constants/courseMappings.js'),
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs_1.default.existsSync(p))
            return p;
    }
    throw new Error(`Cannot find courseMappings.js. Tried: ${candidates.map((p) => JSON.stringify(p)).join(', ')}`);
}
function sliceArrayBlock(source, exportName) {
    const marker = `export const ${exportName} = [`;
    const start = source.indexOf(marker);
    if (start < 0)
        throw new Error(`Cannot find ${exportName} in courseMappings.js`);
    const from = start + marker.length;
    const end = source.indexOf('];', from);
    if (end < 0)
        throw new Error(`Cannot find end of ${exportName} array (missing \"];\"?)`);
    return source.slice(from, end);
}
function extractIdLabelPairs(block) {
    const results = [];
    const re = /\{\s*id:\s*(['"])(.*?)\1\s*,\s*label:\s*(['"])(.*?)\3\s*\}/gms;
    let m = null;
    while ((m = re.exec(block))) {
        const id = String(m[2] || '').trim();
        const label = String(m[4] || '').trim();
        if (!id || !label)
            continue;
        results.push({ id, label });
    }
    return results;
}
function loadCourseRows(courseMappingsPath) {
    const source = fs_1.default.readFileSync(courseMappingsPath, 'utf8');
    const directionPairs = extractIdLabelPairs(sliceArrayBlock(source, 'DIRECTION_OPTIONS'));
    const courseTypePairs = extractIdLabelPairs(sliceArrayBlock(source, 'COURSE_TYPE_OPTIONS'));
    const toRows = (kind, pairs) => pairs.map((p) => ({
        kind,
        sourceId: p.id,
        label: p.label,
        text: p.label,
    }));
    return [...toRows('direction', directionPairs), ...toRows('course_type', courseTypePairs)];
}
async function ensureTable() {
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS \`course_embeddings\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`kind\` ENUM('direction','course_type') NOT NULL,
      \`source_id\` VARCHAR(64) NOT NULL,
      \`label\` VARCHAR(255) NOT NULL,
      \`model\` VARCHAR(64) NOT NULL,
      \`embedding_dim\` INT NOT NULL,
      \`embedding\` JSON NOT NULL,
      \`text\` VARCHAR(512) NOT NULL,
      \`text_hash\` CHAR(64) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_course_embeddings_kind_source\` (\`kind\`, \`source_id\`),
      KEY \`idx_course_embeddings_label\` (\`label\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
async function fetchEmbedding(opts) {
    const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: opts.model,
            input: { texts: [opts.text] },
        }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
        throw new Error(`[dashscope] HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
    }
    let data;
    try {
        data = JSON.parse(bodyText);
    }
    catch {
        throw new Error(`[dashscope] Invalid JSON response: ${bodyText.slice(0, 500)}`);
    }
    const embedding = data?.output?.embeddings?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`[dashscope] Missing embedding in response: ${bodyText.slice(0, 500)}`);
    }
    return embedding;
}
async function getExistingTextHash(kind, sourceId) {
    const rows = await (0, db_1.query)('SELECT text_hash FROM course_embeddings WHERE kind = ? AND source_id = ? LIMIT 1', [kind, sourceId]);
    const row = rows?.[0];
    return row?.text_hash ? String(row.text_hash) : null;
}
async function upsertEmbedding(row, model, embedding, textHash) {
    const embeddingJson = JSON.stringify(embedding);
    await (0, db_1.query)(`
      INSERT INTO course_embeddings (kind, source_id, label, model, embedding_dim, embedding, text, text_hash)
      VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        model = VALUES(model),
        embedding_dim = VALUES(embedding_dim),
        embedding = VALUES(embedding),
        text = VALUES(text),
        text_hash = VALUES(text_hash)
    `, [row.kind, row.sourceId, row.label, model, embedding.length, embeddingJson, row.text, textHash]);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const force = Boolean(args.get('force'));
    const dryRun = Boolean(args.get('dry-run'));
    const limitRaw = args.get('limit');
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : null;
    const model = (typeof args.get('model') === 'string' ? String(args.get('model')) : DEFAULT_MODEL).trim();
    const embeddingsUrl = String(process.env.DASHSCOPE_EMBEDDINGS_URL || DEFAULT_EMBEDDINGS_URL).trim();
    const apiKey = requiredEnv('DASHSCOPE_API_KEY');
    const courseMappingsPath = resolveCourseMappingsPath(typeof args.get('file') === 'string' ? String(args.get('file')) : undefined);
    const rowsAll = loadCourseRows(courseMappingsPath);
    const rows = limit && Number.isFinite(limit) && limit > 0 ? rowsAll.slice(0, limit) : rowsAll;
    await ensureTable();
    console.log(`[embed-course-mappings] source=${courseMappingsPath}`);
    console.log(`[embed-course-mappings] model=${model} url=${embeddingsUrl}`);
    console.log(`[embed-course-mappings] total=${rows.length} force=${force} dryRun=${dryRun}`);
    let embedded = 0;
    let skipped = 0;
    for (const row of rows) {
        const textHash = sha256Hex(`${model}\n${row.text}`);
        const existing = await getExistingTextHash(row.kind, row.sourceId);
        if (!force && existing && existing === textHash) {
            skipped++;
            continue;
        }
        if (dryRun) {
            console.log(`[dry-run] ${row.kind}:${row.sourceId} ${row.label}`);
            embedded++;
            continue;
        }
        const embedding = await fetchEmbedding({ text: row.text, model, apiKey, url: embeddingsUrl });
        await upsertEmbedding(row, model, embedding, textHash);
        embedded++;
        if (embedded % 5 === 0 || embedded === rows.length) {
            console.log(`[embed-course-mappings] progress embedded=${embedded} skipped=${skipped}/${rows.length}`);
        }
    }
    console.log(`[embed-course-mappings] done embedded=${embedded} skipped=${skipped} total=${rows.length}`);
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
