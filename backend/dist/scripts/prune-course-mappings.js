"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
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
        throw new Error(`Cannot find end of ${exportName} array (missing "];"?)`);
    return source.slice(from, end);
}
function extractIds(block) {
    const results = [];
    const re = /\{\s*id:\s*(['"])(.*?)\1\s*,\s*label:\s*(['"])(.*?)\3\s*\}/gms;
    let m = null;
    while ((m = re.exec(block))) {
        const id = String(m[2] || '').trim();
        if (id)
            results.push(id);
    }
    return results;
}
function loadCurrentIds(courseMappingsPath) {
    const source = fs_1.default.readFileSync(courseMappingsPath, 'utf8');
    const directionIds = extractIds(sliceArrayBlock(source, 'DIRECTION_OPTIONS'));
    const courseTypeIds = extractIds(sliceArrayBlock(source, 'COURSE_TYPE_OPTIONS'));
    return {
        direction: new Set(directionIds),
        course_type: new Set(courseTypeIds),
    };
}
async function getExistingIds(kind) {
    const rows = await (0, db_1.query)('SELECT source_id FROM course_embeddings WHERE kind = ? ORDER BY source_id ASC', [kind]);
    return (rows || [])
        .map((r) => (r?.source_id ? String(r.source_id).trim() : ''))
        .filter(Boolean);
}
async function deleteStale(kind, ids, dryRun) {
    if (!ids.length)
        return 0;
    if (dryRun)
        return ids.length;
    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM course_embeddings WHERE kind = ? AND source_id IN (${placeholders})`;
    const res = await (0, db_1.query)(sql, [kind, ...ids]);
    return Number(res?.affectedRows) || 0;
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const dryRun = Boolean(args.get('dry-run'));
    const courseMappingsPath = resolveCourseMappingsPath(typeof args.get('file') === 'string' ? String(args.get('file')) : undefined);
    const current = loadCurrentIds(courseMappingsPath);
    const kinds = ['direction', 'course_type'];
    let totalStale = 0;
    let totalDeleted = 0;
    console.log(`[prune-course-mappings] source=${courseMappingsPath} dryRun=${dryRun}`);
    for (const kind of kinds) {
        const existing = await getExistingIds(kind);
        const stale = existing.filter((id) => !current[kind].has(id));
        totalStale += stale.length;
        if (stale.length) {
            console.log(`[prune-course-mappings] kind=${kind} stale=${stale.length}`);
            stale.forEach((id) => console.log(`  - ${id}`));
        }
        else {
            console.log(`[prune-course-mappings] kind=${kind} stale=0`);
        }
        const deleted = await deleteStale(kind, stale, dryRun);
        totalDeleted += deleted;
        if (stale.length) {
            console.log(`[prune-course-mappings] kind=${kind} ${dryRun ? 'wouldDelete' : 'deleted'}=${dryRun ? stale.length : deleted}`);
        }
    }
    console.log(`[prune-course-mappings] done stale=${totalStale} ${dryRun ? 'wouldDelete' : 'deleted'}=${dryRun ? totalStale : totalDeleted}`);
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(async () => {
    await db_1.pool.end().catch(() => { });
});
