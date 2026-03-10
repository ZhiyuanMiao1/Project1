import type { PoolConnection } from 'mysql2/promise';
import { query } from '../db';

export const MENTOR_RESPONSE_TIME_COLUMN = 'avg_appointment_response_minutes';

let mentorResponseTimeColumnEnsured = false;
let mentorResponseTimeBackfilled = false;

const RESPONSE_TIME_COLUMN_SQL = `ALTER TABLE mentor_profiles ADD COLUMN ${MENTOR_RESPONSE_TIME_COLUMN} DECIMAL(10,2) NULL DEFAULT NULL`;

const RESPONSE_TIME_AGGREGATE_SQL = `
  SELECT
    t.mentor_user_id AS mentor_user_id,
    ROUND(AVG(TIMESTAMPDIFF(SECOND, mi.created_at, ast.updated_at)) / 60, 2) AS avg_response_minutes
  FROM appointment_statuses ast
  INNER JOIN message_items mi
    ON mi.id = ast.appointment_message_id
   AND mi.message_type = 'appointment_card'
  INNER JOIN message_threads t
    ON t.id = mi.thread_id
  WHERE mi.sender_user_id = t.student_user_id
    AND ast.updated_by_user_id = t.mentor_user_id
    AND ast.status IN ('accepted', 'rejected', 'rescheduling')
  GROUP BY t.mentor_user_id
`;

export const isMissingMentorResponseTimeColumnError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column'))
    && message.includes(MENTOR_RESPONSE_TIME_COLUMN);
};

const isMissingResponseTimeAggregateSchemaError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === 'ER_NO_SUCH_TABLE'
    || ((code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && (
      message.includes('appointment_statuses')
      || message.includes('message_items')
      || message.includes('message_threads')
    ))
  );
};

export const ensureMentorResponseTimeColumn = async () => {
  if (mentorResponseTimeColumnEnsured) return true;

  try {
    await query(RESPONSE_TIME_COLUMN_SQL);
    mentorResponseTimeColumnEnsured = true;
    return true;
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
      mentorResponseTimeColumnEnsured = true;
      return true;
    }
    return false;
  }
};

const normalizeResponseMinutes = (raw: unknown) => {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(2));
};

export const backfillMentorResponseTimeAverages = async () => {
  if (mentorResponseTimeBackfilled) return true;

  try {
    await query(
      `
      UPDATE mentor_profiles mp
      LEFT JOIN (${RESPONSE_TIME_AGGREGATE_SQL}) agg
        ON agg.mentor_user_id = mp.user_id
      SET mp.${MENTOR_RESPONSE_TIME_COLUMN} = agg.avg_response_minutes
      `
    );
    mentorResponseTimeBackfilled = true;
    return true;
  } catch (error) {
    if (isMissingResponseTimeAggregateSchemaError(error)) {
      mentorResponseTimeBackfilled = true;
      return false;
    }
    throw error;
  }
};

export const recomputeMentorResponseTimeAverage = async (conn: PoolConnection, mentorUserId: number) => {
  const [rows] = await conn.execute<any[]>(
    `
    SELECT
      ROUND(AVG(TIMESTAMPDIFF(SECOND, mi.created_at, ast.updated_at)) / 60, 2) AS avg_response_minutes
    FROM appointment_statuses ast
    INNER JOIN message_items mi
      ON mi.id = ast.appointment_message_id
     AND mi.message_type = 'appointment_card'
    INNER JOIN message_threads t
      ON t.id = mi.thread_id
    WHERE t.mentor_user_id = ?
      AND mi.sender_user_id = t.student_user_id
      AND ast.updated_by_user_id = t.mentor_user_id
      AND ast.status IN ('accepted', 'rejected', 'rescheduling')
    `,
    [mentorUserId]
  );

  const avgResponseMinutes = normalizeResponseMinutes(rows?.[0]?.avg_response_minutes);

  await conn.execute(
    `
    INSERT INTO mentor_profiles (user_id, ${MENTOR_RESPONSE_TIME_COLUMN})
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      ${MENTOR_RESPONSE_TIME_COLUMN} = VALUES(${MENTOR_RESPONSE_TIME_COLUMN})
    `,
    [mentorUserId, avgResponseMinutes]
  );

  return avgResponseMinutes;
};

export const normalizeMentorResponseMinutes = normalizeResponseMinutes;
