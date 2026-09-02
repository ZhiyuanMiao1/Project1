import { pool } from '../db';
import { recomputeMentorCompletedSessionCount } from './mentorRecommendation';
import { isWalletHoursError } from './walletHours';
import { ensureLessonHourReservationSchema, settleLessonHours } from './lessonHourReservations';
import {
  getEmailNotificationPreferencesForUser,
  getPublicAppUrl,
  sendAppointmentNotificationMail,
} from './mailService';

export const LESSON_HOURS_AUTO_CONFIRM_DAYS = 7;
export const LESSON_HOURS_AUTO_CONFIRM_MS = LESSON_HOURS_AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000;

const AUTO_CONFIRM_SCAN_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_CONFIRM_BATCH_SIZE = 100;

type AutoConfirmationResult = {
  confirmed: number;
  insufficientHours: number;
  skipped: number;
};

type AutoConfirmationOutcome = 'confirmed' | 'insufficient_hours';

let autoConfirmationSchemaPromise: Promise<void> | null = null;

const ensureLessonHoursAutoConfirmationSchema = async () => {
  if (!autoConfirmationSchemaPromise) {
    autoConfirmationSchemaPromise = (async () => {
      try {
        await pool.execute(
          `ALTER TABLE lesson_hour_confirmations
           ADD COLUMN auto_confirm_attempted_at TIMESTAMP NULL DEFAULT NULL AFTER settled_at`
        );
      } catch (error: any) {
        const code = String(error?.code || '');
        const message = String(error?.message || '');
        if (code !== 'ER_DUP_FIELDNAME' && !message.includes('Duplicate column name')) throw error;
      }
      try {
        await pool.execute(
          `ALTER TABLE lesson_hour_confirmations
           ADD KEY idx_lesson_hour_confirmations_auto_scan
             (status, auto_confirm_attempted_at, created_at)`
        );
      } catch (error: any) {
        const code = String(error?.code || '');
        const message = String(error?.message || '');
        if (code !== 'ER_DUP_KEYNAME' && !message.includes('Duplicate key name')) throw error;
      }
    })().catch((error) => {
        autoConfirmationSchemaPromise = null;
        throw error;
    });
  }
  return autoConfirmationSchemaPromise;
};

const sendAutoConfirmationResultMailSafely = async ({
  studentUserId,
  mentorUserId,
  proposedHours,
  outcome,
}: {
  studentUserId: number;
  mentorUserId: number;
  proposedHours: number;
  outcome: AutoConfirmationOutcome;
}) => {
  try {
    const preferences = await getEmailNotificationPreferencesForUser(studentUserId);
    if (!preferences.enabled) return;
    const [rows] = await pool.execute<any[]>(
      `SELECT su.email, mr.public_id AS mentor_public_id
       FROM users su
       INNER JOIN users mu ON mu.id = ?
       LEFT JOIN user_roles mr ON mr.user_id = mu.id AND mr.role = 'mentor'
       WHERE su.id = ?
       LIMIT 1`,
      [mentorUserId, studentUserId]
    );
    const to = String(rows?.[0]?.email || '').trim();
    if (!to) return;
    const isEnglish = preferences.locale === 'en';
    const mentorId = String(rows?.[0]?.mentor_public_id || '').trim() || 'Mentor';
    const hourText = Number(proposedHours.toFixed(2));
    const confirmed = outcome === 'confirmed';
    await sendAppointmentNotificationMail({
      recipientUserId: studentUserId,
      to,
      subject: isEnglish
        ? (confirmed ? 'Mentory: Lesson hours automatically confirmed' : 'Mentory: Lesson-hour balance insufficient')
        : (confirmed ? 'Mentory 课时已自动确认' : 'Mentory 课时余额不足，请及时处理'),
      eventTitle: isEnglish
        ? (confirmed ? 'Lesson hours automatically confirmed' : 'Automatic confirmation not completed')
        : (confirmed ? '课时已自动确认' : '课时自动确认未完成'),
      actorDisplayName: mentorId,
      messageUrl: `${getPublicAppUrl()}${confirmed ? '/student/messages' : '/student/wallet'}`,
      description: isEnglish
        ? (confirmed
          ? `You did not respond within the 7-day confirmation period. Mentory automatically confirmed ${hourText} lesson hour${hourText === 1 ? '' : 's'} submitted by ${mentorId} and deducted the hours from your balance.`
          : 'You did not respond within the 7-day confirmation period. Your lesson-hour balance is insufficient. Please top up on Mentory as soon as possible; otherwise, your access to Mentory services may be affected. Thank you.')
        : (confirmed
          ? `您在 7 天确认期内未处理。Mentory 已自动确认 ${mentorId} 提交的 ${hourText} 小时课时，并从您的课时余额中扣除。`
          : '您在 7 天确认期内未处理。由于课时余额不足，请尽快前往 Mentory 页面进行充值，否则将影响您在 Mentory 平台的正常服务，谢谢！'),
      locale: preferences.locale,
      showActorDetails: false,
    });
  } catch (error) {
    console.error('Lesson hours auto-confirmation result mail error:', error);
  }
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
        lhc.auto_confirm_attempted_at,
        lhc.created_at
      FROM lesson_hour_confirmations lhc
      WHERE lhc.id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [confirmationId]
    );
    const row = rows?.[0];
    if (
      !row
      || String(row.status || '').toLowerCase() !== 'pending'
      || row.auto_confirm_attempted_at
    ) {
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

    await conn.query('SAVEPOINT auto_confirm_settlement');
    try {
      await settleLessonHours(
        conn,
        Number(row.student_user_id),
        Number(row.course_session_id),
        proposedHours
      );
    } catch (error) {
      if (!isWalletHoursError(error) || error.code !== 'INSUFFICIENT_HOURS') throw error;
      await conn.query('ROLLBACK TO SAVEPOINT auto_confirm_settlement');
      await conn.execute(
        `UPDATE lesson_hour_confirmations
         SET auto_confirm_attempted_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending' AND auto_confirm_attempted_at IS NULL`,
        [confirmationId]
      );
      await conn.commit();
      await sendAutoConfirmationResultMailSafely({
        studentUserId: Number(row.student_user_id),
        mentorUserId: Number(row.mentor_user_id),
        proposedHours,
        outcome: 'insufficient_hours',
      });
      return 'insufficient_hours';
    }

    await conn.execute(
      `
      UPDATE lesson_hour_confirmations
      SET status = 'confirmed',
          disputed_hours = NULL,
          final_hours = ?,
          responded_by_user_id = NULL,
          responded_at = CURRENT_TIMESTAMP,
          settled_at = CURRENT_TIMESTAMP,
          auto_confirm_attempted_at = CURRENT_TIMESTAMP
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
    await sendAutoConfirmationResultMailSafely({
      studentUserId: Number(row.student_user_id),
      mentorUserId: Number(row.mentor_user_id),
      proposedHours,
      outcome: 'confirmed',
    });
    return 'confirmed';
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    try { conn.release(); } catch {}
  }
};

export const runLessonHoursAutoConfirmation = async (): Promise<AutoConfirmationResult> => {
  await ensureLessonHourReservationSchema();
  await ensureLessonHoursAutoConfirmationSchema();
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
      AND lhc.auto_confirm_attempted_at IS NULL
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
