import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { query } from '../db';
import { consumeLessonHours, WalletHoursError } from './walletHours';

const EPSILON = 0.000001;

const toHours = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

let reservationSchemaPromise: Promise<void> | null = null;

export const ensureLessonHourReservationSchema = async () => {
  if (!reservationSchemaPromise) {
    reservationSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS course_session_hour_reservations (
          id BIGINT NOT NULL AUTO_INCREMENT,
          course_session_id BIGINT NOT NULL,
          student_user_id INT NOT NULL,
          reserved_hours DECIMAL(10,2) NOT NULL,
          settled_hours DECIMAL(10,2) NULL,
          status ENUM('active','settled','released') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          settled_at TIMESTAMP NULL DEFAULT NULL,
          released_at TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_course_session_hour_reservation (course_session_id),
          KEY idx_course_session_hour_reservations_student (student_user_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS course_session_hour_reservation_sources (
          id BIGINT NOT NULL AUTO_INCREMENT,
          reservation_id BIGINT NOT NULL,
          source_type ENUM('grant','order') NOT NULL,
          source_id BIGINT NOT NULL,
          hours DECIMAL(10,2) NOT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_course_reservation_source (reservation_id, source_type, source_id),
          KEY idx_course_reservation_sources_reservation (reservation_id),
          CONSTRAINT fk_course_reservation_sources_reservation
            FOREIGN KEY (reservation_id)
            REFERENCES course_session_hour_reservations(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      reservationSchemaPromise = null;
      throw error;
    });
  }
  return reservationSchemaPromise;
};

type ReservationSource = {
  sourceType: 'grant' | 'order';
  sourceId: number;
  hours: number;
};

const restoreSourceHours = async (
  conn: PoolConnection,
  sourceType: 'grant' | 'order',
  sourceId: number,
  hours: number
) => {
  if (hours <= EPSILON) return;
  if (sourceType === 'grant') {
    await conn.query(
      'UPDATE platform_lesson_hour_grants SET remaining_hours = remaining_hours + ? WHERE id = ?',
      [hours, sourceId]
    );
    return;
  }
  await conn.query(
    'UPDATE billing_orders SET remaining_hours = remaining_hours + ? WHERE id = ?',
    [hours, sourceId]
  );
};

export async function releaseLessonHoursReservation(
  conn: PoolConnection,
  courseSessionId: number
) {
  const [reservationRows] = await conn.query<any[]>(
    `SELECT id, student_user_id, reserved_hours, status
     FROM course_session_hour_reservations
     WHERE course_session_id = ?
     LIMIT 1
     FOR UPDATE`,
    [courseSessionId]
  );
  const reservation = reservationRows?.[0];
  if (!reservation || String(reservation.status) !== 'active') return 0;

  const [sourceRows] = await conn.query<any[]>(
    `SELECT source_type, source_id, hours
     FROM course_session_hour_reservation_sources
     WHERE reservation_id = ?
     ORDER BY id ASC
     FOR UPDATE`,
    [Number(reservation.id)]
  );
  const reservedHours = toHours(reservation.reserved_hours);
  const sourceHoursTotal = Number((sourceRows || []).reduce(
    (sum, source) => sum + toHours(source.hours),
    0
  ).toFixed(2));
  if (Math.abs(sourceHoursTotal - reservedHours) > EPSILON) {
    throw new WalletHoursError('HOUR_ALLOCATION_MISMATCH', '冻结课时明细不完整，请联系平台处理');
  }
  for (const source of sourceRows || []) {
    await restoreSourceHours(
      conn,
      String(source.source_type) === 'grant' ? 'grant' : 'order',
      Number(source.source_id),
      toHours(source.hours)
    );
  }

  await conn.query(
    'UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?',
    [reservedHours, Number(reservation.student_user_id)]
  );
  await conn.query(
    `UPDATE course_session_hour_reservations
     SET status = 'released', released_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(reservation.id)]
  );
  return reservedHours;
}

export async function reserveLessonHours(
  conn: PoolConnection,
  studentUserId: number,
  courseSessionId: number,
  rawHours: number
) {
  const hours = toHours(rawHours);
  if (hours <= 0) {
    throw new WalletHoursError('HOUR_ALLOCATION_MISMATCH', '无效课时');
  }

  const [existingRows] = await conn.query<any[]>(
    `SELECT id, reserved_hours, status
     FROM course_session_hour_reservations
     WHERE course_session_id = ?
     LIMIT 1
     FOR UPDATE`,
    [courseSessionId]
  );
  const existing = existingRows?.[0];
  if (
    existing
    && String(existing.status) === 'active'
    && Math.abs(toHours(existing.reserved_hours) - hours) <= EPSILON
  ) {
    return toHours(existing.reserved_hours);
  }
  if (existing && String(existing.status) === 'active') {
    await releaseLessonHoursReservation(conn, courseSessionId);
  }

  const [userRows] = await conn.query<any[]>(
    'SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
    [studentUserId]
  );
  const balance = toHours(userRows?.[0]?.lesson_balance_hours);
  if (balance + EPSILON < hours) {
    throw new WalletHoursError('INSUFFICIENT_HOURS', '剩余课时不足，请先充值后再接受预约');
  }

  let unallocated = hours;
  const sources: ReservationSource[] = [];
  try {
    const [grantRows] = await conn.query<any[]>(
      `SELECT id, remaining_hours
       FROM platform_lesson_hour_grants
       WHERE user_id = ? AND remaining_hours > 0
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [studentUserId]
    );
    for (const grant of grantRows || []) {
      if (unallocated <= EPSILON) break;
      const available = toHours(grant.remaining_hours);
      const allocated = Number(Math.min(available, unallocated).toFixed(2));
      if (allocated <= 0) continue;
      sources.push({ sourceType: 'grant', sourceId: Number(grant.id), hours: allocated });
      unallocated = Number((unallocated - allocated).toFixed(2));
    }
  } catch (error: any) {
    if (String(error?.code || '') !== 'ER_NO_SUCH_TABLE') throw error;
  }

  const [orderRows] = await conn.query<any[]>(
    `SELECT id, remaining_hours
     FROM billing_orders
     WHERE user_id = ?
       AND credited_at IS NOT NULL
       AND remaining_hours > 0
     ORDER BY credited_at ASC, id ASC
     FOR UPDATE`,
    [studentUserId]
  );
  for (const order of orderRows || []) {
    if (unallocated <= EPSILON) break;
    const available = toHours(order.remaining_hours);
    const allocated = Number(Math.min(available, unallocated).toFixed(2));
    if (allocated <= 0) continue;
    sources.push({ sourceType: 'order', sourceId: Number(order.id), hours: allocated });
    unallocated = Number((unallocated - allocated).toFixed(2));
  }
  if (unallocated > EPSILON) {
    throw new WalletHoursError(
      'REFUND_SCHEMA_REQUIRED',
      '钱包课时明细尚未完成升级，请联系平台处理'
    );
  }

  let reservationId = Number(existing?.id || 0);
  if (reservationId > 0) {
    await conn.query(
      `UPDATE course_session_hour_reservations
       SET student_user_id = ?, reserved_hours = ?, settled_hours = NULL,
           status = 'active', settled_at = NULL, released_at = NULL
       WHERE id = ?`,
      [studentUserId, hours, reservationId]
    );
    await conn.query(
      'DELETE FROM course_session_hour_reservation_sources WHERE reservation_id = ?',
      [reservationId]
    );
  } else {
    const [insertResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO course_session_hour_reservations
         (course_session_id, student_user_id, reserved_hours, status)
       VALUES (?, ?, ?, 'active')`,
      [courseSessionId, studentUserId, hours]
    );
    reservationId = Number(insertResult.insertId);
  }

  for (const source of sources) {
    if (source.sourceType === 'grant') {
      await conn.query(
        `UPDATE platform_lesson_hour_grants
         SET remaining_hours = remaining_hours - ?
         WHERE id = ? AND remaining_hours >= ?`,
        [source.hours, source.sourceId, source.hours]
      );
    } else {
      await conn.query(
        `UPDATE billing_orders
         SET remaining_hours = remaining_hours - ?
         WHERE id = ? AND remaining_hours >= ?`,
        [source.hours, source.sourceId, source.hours]
      );
    }
    await conn.query(
      `INSERT INTO course_session_hour_reservation_sources
         (reservation_id, source_type, source_id, hours)
       VALUES (?, ?, ?, ?)`,
      [reservationId, source.sourceType, source.sourceId, source.hours]
    );
  }
  await conn.query(
    `UPDATE users
     SET lesson_balance_hours = lesson_balance_hours - ?
     WHERE id = ? AND lesson_balance_hours >= ?`,
    [hours, studentUserId, hours]
  );
  return hours;
}

export async function settleLessonHours(
  conn: PoolConnection,
  studentUserId: number,
  courseSessionId: number,
  rawHours: number
) {
  const hours = toHours(rawHours);
  if (hours <= 0) {
    throw new WalletHoursError('HOUR_ALLOCATION_MISMATCH', '无效课时');
  }

  const [reservationRows] = await conn.query<any[]>(
    `SELECT id, reserved_hours, status
     FROM course_session_hour_reservations
     WHERE course_session_id = ? AND student_user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [courseSessionId, studentUserId]
  );
  const reservation = reservationRows?.[0];
  if (!reservation || String(reservation.status) !== 'active') {
    return consumeLessonHours(conn, studentUserId, courseSessionId, hours);
  }

  const reservationId = Number(reservation.id);
  const reservedHours = toHours(reservation.reserved_hours);
  const [sourceRows] = await conn.query<any[]>(
    `SELECT source_type, source_id, hours
     FROM course_session_hour_reservation_sources
     WHERE reservation_id = ?
     ORDER BY id ASC
     FOR UPDATE`,
    [reservationId]
  );
  const sourceHoursTotal = Number((sourceRows || []).reduce(
    (sum, source) => sum + toHours(source.hours),
    0
  ).toFixed(2));
  if (Math.abs(sourceHoursTotal - reservedHours) > EPSILON) {
    throw new WalletHoursError('HOUR_ALLOCATION_MISMATCH', '冻结课时明细不完整，请联系平台处理');
  }

  let remainingToSettle = Math.min(hours, reservedHours);
  let releasedHours = 0;
  for (const source of sourceRows || []) {
    const sourceType = String(source.source_type) === 'grant' ? 'grant' : 'order';
    const sourceId = Number(source.source_id);
    const sourceHours = toHours(source.hours);
    const settledFromSource = Number(Math.min(sourceHours, remainingToSettle).toFixed(2));
    const releasedFromSource = Number((sourceHours - settledFromSource).toFixed(2));
    remainingToSettle = Number((remainingToSettle - settledFromSource).toFixed(2));
    releasedHours = Number((releasedHours + releasedFromSource).toFixed(2));

    if (sourceType === 'order' && settledFromSource > EPSILON) {
      await conn.query(
        `INSERT INTO billing_hour_allocations
           (user_id, billing_order_id, course_session_id, allocation_kind, source_key, hours)
         VALUES (?, ?, ?, 'lesson', ?, ?)`,
        [studentUserId, sourceId, courseSessionId, `lesson:${courseSessionId}:reserved`, settledFromSource]
      );
    }
    await restoreSourceHours(conn, sourceType, sourceId, releasedFromSource);
  }

  if (releasedHours > EPSILON) {
    await conn.query(
      'UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?',
      [releasedHours, studentUserId]
    );
  }

  const extraHours = Number((hours - reservedHours).toFixed(2));
  if (extraHours > EPSILON) {
    await consumeLessonHours(conn, studentUserId, courseSessionId, extraHours);
  }

  await conn.query(
    `UPDATE course_session_hour_reservations
     SET status = 'settled', settled_hours = ?, settled_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [hours, reservationId]
  );
  return [];
}
