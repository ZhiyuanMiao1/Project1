import fs from 'fs';
import path from 'path';
import { pool, query } from '../db';

type CourseKind = 'direction' | 'course_type';

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}

function resolveCourseMappingsPath(explicitPath?: string) {
  const candidates = [
    explicitPath,
    process.env.COURSE_MAPPINGS_PATH,
    path.resolve(process.cwd(), 'my-app/src/constants/courseMappings.js'),
    path.resolve(process.cwd(), '../my-app/src/constants/courseMappings.js'),
    path.resolve(__dirname, '../../../my-app/src/constants/courseMappings.js'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Cannot find courseMappings.js. Tried: ${candidates.map((p) => JSON.stringify(p)).join(', ')}`
  );
}

function sliceArrayBlock(source: string, exportName: string) {
  const marker = `export const ${exportName} = [`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Cannot find ${exportName} in courseMappings.js`);
  const from = start + marker.length;
  const end = source.indexOf('];', from);
  if (end < 0) throw new Error(`Cannot find end of ${exportName} array (missing "];"?)`);
  return source.slice(from, end);
}

function extractIds(block: string): string[] {
  const results: string[] = [];
  const re = /\{\s*id:\s*(['"])(.*?)\1\s*,\s*label:\s*(['"])(.*?)\3\s*\}/gms;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(block))) {
    const id = String(m[2] || '').trim();
    if (id) results.push(id);
  }
  return results;
}

function loadCurrentIds(courseMappingsPath: string): Record<CourseKind, Set<string>> {
  const source = fs.readFileSync(courseMappingsPath, 'utf8');
  const directionIds = extractIds(sliceArrayBlock(source, 'DIRECTION_OPTIONS'));
  const courseTypeIds = extractIds(sliceArrayBlock(source, 'COURSE_TYPE_OPTIONS'));
  return {
    direction: new Set(directionIds),
    course_type: new Set(courseTypeIds),
  };
}

async function getExistingIds(kind: CourseKind): Promise<string[]> {
  const rows = await query<any[]>(
    'SELECT source_id FROM course_embeddings WHERE kind = ? ORDER BY source_id ASC',
    [kind]
  );
  return (rows || [])
    .map((r) => (r?.source_id ? String(r.source_id).trim() : ''))
    .filter(Boolean);
}

async function deleteStale(kind: CourseKind, ids: string[], dryRun: boolean) {
  if (!ids.length) return 0;
  if (dryRun) return ids.length;
  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM course_embeddings WHERE kind = ? AND source_id IN (${placeholders})`;
  const res: any = await query(sql, [kind, ...ids]);
  return Number(res?.affectedRows) || 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args.get('dry-run'));
  const courseMappingsPath = resolveCourseMappingsPath(
    typeof args.get('file') === 'string' ? String(args.get('file')) : undefined
  );

  const current = loadCurrentIds(courseMappingsPath);

  const kinds: CourseKind[] = ['direction', 'course_type'];
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
    } else {
      console.log(`[prune-course-mappings] kind=${kind} stale=0`);
    }

    const deleted = await deleteStale(kind, stale, dryRun);
    totalDeleted += deleted;
    if (stale.length) {
      console.log(
        `[prune-course-mappings] kind=${kind} ${dryRun ? 'wouldDelete' : 'deleted'}=${dryRun ? stale.length : deleted}`
      );
    }
  }

  console.log(
    `[prune-course-mappings] done stale=${totalStale} ${dryRun ? 'wouldDelete' : 'deleted'}=${dryRun ? totalStale : totalDeleted}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

