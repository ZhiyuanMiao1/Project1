import { pool } from '../db';
import { recomputeMentorCompletedSessionCount } from './mentorRecommendation';
import { isWalletHoursError } from './walletHours';
import { ensureLessonHourReservationSchema, settleLessonHours } from './lessonHourReservations';

export const LESSON_HOURS_AUTO_CONFIRM_DAYS = 7;
export const LESSON_HOURS_AUTO_CONFIRM_MS = LESSON_HOURS_AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000;

const AUTO_CONFIRM_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_CONFIRM_BATCH_SIZE = 100;

type AutoConfirmationResult = {
  confirmed: number;
  insufficientHours: number;
  skipped: number;
};

export const getLessonHoursAutoConfirmAt = (createdAt: unknown) => {
  const createdAtMs = createdAt instanceof Date
    ? createdAt.getTime()
    : new Date(String(createdAt ?? '')).getTime();
  if (!Number.isFinite(createdAtMs)) return null;
  return new Date(createdAtMs + LESSON_HOURS_AUTO_CONFIRM_MS);
};

const autoConfirmOne = async (confirmationId: number): Promise<'confirmed' | 'insufficient_hours' | 'skipped'> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        lhc.id,
        lhc.course_session_id,
        lhc.student_user_id,
        lhc.mentor_user_id,
        lhc.proposed_hours,
        lhc.status,
        lhc.created_at
      FROM lesson_hour_confirmations lhc
      WHERE lhc.id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [confirmationId]
    );
    const row = rows?.[0];
    if (!row || String(row.status || '').toLowerCase() !== 'pending') {
      await conn.rollback();
      return 'skipped';
    }

    const autoConfirmAt = getLessonHoursAutoConfirmAt(row.created_at);
    if (!autoConfirmAt || autoConfirmAt.getTime() > Date.now()) {
      await conn.rollback();
      return 'skipped';
    }

    const [latestRows] = await conn.execute<any[]>(
      `SELECT MAX(id) AS latest_id FROM lesson_hour_confirmations WHERE course_session_id = ?`,
      [Number(row.course_session_id)]
    );
    if (Number(latestRows?.[0]?.latest_id || 0) !== confirmationId) {
      await conn.rollback();
      return 'skipped';
    }

    const proposedHours = Number.parseFloat(String(row.proposed_hours ?? ''));
    if (!Number.isFinite(proposedHours) || proposedHours <= 0) {
      await conn.rollback();
      return 'skipped';
    }

    await settleLessonHours(
      conn,
      Number(row.student_user_id),
      Number(row.course_session_id),
      proposedHours
    );

    await conn.execute(
      `
      UPDATE lesson_hour_confirmations
      SET status = 'confirmed',
          disputed_hours = NULL,
          final_hours = ?,
          responded_by_user_id = NULL,
          responded_at = CURRENT_TIMESTAMP,
          settled_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
      `,
      [proposedHours, confirmationId]
    );
    await conn.execute(
      `UPDATE course_sessions SET duration_hours = ?, status = 'completed' WHERE id = ?`,
      [proposedHours, Number(row.course_session_id)]
    );
    await recomputeMentorCompletedSessionCount(conn, Number(row.mentor_user_id));
    await conn.commit();
    return 'confirmed';
  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (isWalletHoursError(error) && error.code === 'INSUFFICIENT_HOURS') {
      return 'insufficient_hours';
    }
    throw error;
  } finally {
    try { conn.release(); } catch {}
  }
};

export const runLessonHoursAutoConfirmation = async (): Promise<AutoConfirmationResult> => {
  await ensureLessonHourReservationSchema();
  const [candidateRows] = await pool.execute<any[]>(
    `
    SELECT lhc.id
    FROM lesson_hour_confirmations lhc
    INNER JOIN (
      SELECT course_session_id, MAX(id) AS latest_id
      FROM lesson_hour_confirmations
      GROUP BY course_session_id
    ) latest ON latest.latest_id = lhc.id
    WHERE lhc.status = 'pending'
      AND lhc.created_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${LESSON_HOURS_AUTO_CONFIRM_DAYS} DAY)
    ORDER BY lhc.created_at ASC
    LIMIT ${AUTO_CONFIRM_BATCH_SIZE}
    `
  );

  const result: AutoConfirmationResult = { confirmed: 0, insufficientHours: 0, skipped: 0 };
  for (const candidate of candidateRows || []) {
    const confirmationId = Number(candidate?.id || 0);
    if (!Number.isFinite(confirmationId) || confirmationId <= 0) continue;
    const outcome = await autoConfirmOne(confirmationId);
    if (outcome === 'confirmed') result.confirmed += 1;
    else if (outcome === 'insufficient_hours') result.insufficientHours += 1;
    else result.skipped += 1;
  }
  return result;
};

export const startLessonHoursAutoConfirmationWorker = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runLessonHoursAutoConfirmation();
      if (result.confirmed > 0 || result.insufficientHours > 0) {
        console.log('Lesson hours auto-confirmation scan completed', result);
      }
    } catch (error) {
      console.error('Lesson hours auto-confirmation scan failed:', error);
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(() => { void run(); }, AUTO_CONFIRM_SCAN_INTERVAL_MS);
  interval.unref();
  return interval;
};
