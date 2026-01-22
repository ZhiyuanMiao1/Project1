import dotenv from 'dotenv';
import { pool, query } from '../db';
import { refreshMentorDirectionScores } from '../services/mentorDirectionScores';

dotenv.config();

const parseArgs = (argv: string[]) => {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
};

type MentorRow = { user_id: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function refreshWithRetry(userId: number, retries = 2) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await refreshMentorDirectionScores({ userId, preferVector: false });
      return;
    } catch (e: any) {
      lastErr = e;
      const code = String(e?.code || '');
      const msg = String(e?.message || '');
      const retryable = code === 'ECONNRESET' || code === 'PROTOCOL_CONNECTION_LOST' || msg.includes('ECONNRESET');
      if (!retryable || attempt >= retries) break;
      const backoff = 500 * (attempt + 1);
      console.warn(`[backfill-mentor-direction-scores] retry user_id=${userId} attempt=${attempt + 1}/${retries} after ${backoff}ms (${code})`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const approvedOnly = Boolean(args.get('approved-only'));
  const dryRun = Boolean(args.get('dry-run'));
  const limitRaw = args.get('limit');
  const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : null;

  try {
    const whereApproved = approvedOnly ? 'AND ur.mentor_approved = 1' : '';
    const rows = await query<MentorRow[]>(
      `
      SELECT ur.user_id
      FROM user_roles ur
      WHERE ur.role = 'mentor'
      ${whereApproved}
      ORDER BY ur.user_id ASC
      `
    );

    const mentors = (rows || []).filter((r) => typeof r.user_id === 'number');
    const sliced = limit && Number.isFinite(limit) && limit > 0 ? mentors.slice(0, limit) : mentors;

    console.log(`[backfill-mentor-direction-scores] mentors=${sliced.length} approvedOnly=${approvedOnly} dryRun=${dryRun}`);

    let done = 0;
    for (const mentor of sliced) {
      const userId = mentor.user_id;
      if (dryRun) {
        console.log(`[dry-run] user_id=${userId}`);
        done++;
        continue;
      }
      await refreshWithRetry(userId, 2);

      done++;
      if (done % 10 === 0 || done === sliced.length) {
        console.log(`[backfill-mentor-direction-scores] progress ${done}/${sliced.length}`);
      }
    }

    console.log('[backfill-mentor-direction-scores] done');
  } finally {
    try {
      await pool.end();
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
