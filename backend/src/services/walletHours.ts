import type { PoolConnection } from 'mysql2/promise';

const EPSILON = 0.000001;

export class WalletHoursError extends Error {
  code: 'INSUFFICIENT_HOURS' | 'REFUND_SCHEMA_REQUIRED' | 'HOUR_ALLOCATION_MISMATCH';

  constructor(
    code: 'INSUFFICIENT_HOURS' | 'REFUND_SCHEMA_REQUIRED' | 'HOUR_ALLOCATION_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'WalletHoursError';
    this.code = code;
  }
}

export const isWalletHoursError = (error: unknown): error is WalletHoursError => {
  return error instanceof WalletHoursError;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function consumeLessonHours(
  conn: PoolConnection,
  userId: number,
  courseSessionId: number,
  rawHours: number
) {
  const hours = Number(rawHours.toFixed(2));
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new WalletHoursError('HOUR_ALLOCATION_MISMATCH', '无效课时');
  }

  const [userRows] = await conn.query<any[]>(
    'SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
    [userId]
  );
  const balance = toNumber(userRows?.[0]?.lesson_balance_hours, 0);
  if (balance + EPSILON < hours) {
    throw new WalletHoursError('INSUFFICIENT_HOURS', '剩余课时不足，请先充值后再确认');
  }

  let unallocated = hours;
  try {
    const [grantRows] = await conn.query<any[]>(
      `SELECT id, remaining_hours
       FROM platform_lesson_hour_grants
       WHERE user_id = ? AND remaining_hours > 0
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [userId]
    );
    for (const grant of grantRows || []) {
      if (unallocated <= EPSILON) break;
      const available = toNumber(grant?.remaining_hours, 0);
      const allocated = Number(Math.min(available, unallocated).toFixed(2));
      if (allocated <= 0) continue;
      await conn.query(
        'UPDATE platform_lesson_hour_grants SET remaining_hours = remaining_hours - ? WHERE id = ? AND remaining_hours >= ?',
        [allocated, grant.id, allocated]
      );
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
    [userId]
  );

  const allocations: Array<{ orderId: number; hours: number }> = [];
  for (const order of orderRows || []) {
    if (unallocated <= EPSILON) break;
    const available = toNumber(order?.remaining_hours, 0);
    if (available <= EPSILON) continue;
    const allocated = Number(Math.min(available, unallocated).toFixed(2));
    if (allocated <= 0) continue;
    allocations.push({ orderId: Number(order.id), hours: allocated });
    unallocated = Number((unallocated - allocated).toFixed(2));
  }

  if (unallocated > EPSILON) {
    throw new WalletHoursError(
      'REFUND_SCHEMA_REQUIRED',
      '钱包课时明细尚未完成升级，请联系平台处理'
    );
  }

  const sourceKey = `lesson:${courseSessionId}`;
  for (const allocation of allocations) {
    await conn.query(
      `UPDATE billing_orders
       SET remaining_hours = remaining_hours - ?
       WHERE id = ? AND remaining_hours >= ?`,
      [allocation.hours, allocation.orderId, allocation.hours]
    );
    await conn.query(
      `INSERT INTO billing_hour_allocations
         (user_id, billing_order_id, course_session_id, allocation_kind, source_key, hours)
       VALUES (?, ?, ?, 'lesson', ?, ?)`,
      [userId, allocation.orderId, courseSessionId, sourceKey, allocation.hours]
    );
  }

  await conn.query(
    `UPDATE users
     SET lesson_balance_hours = lesson_balance_hours - ?
     WHERE id = ?`,
    [hours, userId]
  );

  return allocations;
}
