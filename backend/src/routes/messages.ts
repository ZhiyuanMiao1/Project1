import express, { Request, Response } from 'express';
import type { InsertResult } from '../db';
import { pool, query } from '../db';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

const isMissingMessagesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return (
    message.includes('message_threads')
    || message.includes('message_items')
    || message.includes('appointment_statuses')
    || message.includes('course_sessions')
  );
};

const formatZoomMeetingId = (digits: number) => {
  const text = String(digits).padStart(9, '0').slice(0, 9);
  return `${text.slice(0, 3)} ${text.slice(3, 6)} ${text.slice(6)}`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatUtcDatetime = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};

const parseTimezoneOffsetMinutes = (raw: string) => {
  const s = String(raw || '')
    .trim()
    .replace(/\uFF0B/g, '+') // fullwidth plus
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\uFF0D]/g, '-'); // minus variants
  if (!s) return null;
  const match = s.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?:[:]\s*(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || hours > 14) return null;
  if (!Number.isFinite(mins) || mins < 0 || mins >= 60) return null;
  return sign * (hours * 60 + mins);
};

type ParsedCourseWindow = {
  startsAtUtc: Date;
  endsAtUtc: Date;
  durationHours: number;
  tzOffsetMinutes: number;
};

const parseCourseWindowText = (windowText: unknown, createdAt: Date): ParsedCourseWindow | null => {
  const raw = typeof windowText === 'string' ? windowText.trim() : '';
  if (!raw) return null;

  const canonical = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\uFF1A/g, ':') // fullwidth colon
    .replace(/[\u2013\u2014\uFF5E]/g, '-') // dash/tilde variants
    .replace(/\uFF0B/g, '+') // fullwidth plus
    .replace(/[\u2212\uFF0D]/g, '-'); // minus variants

  const tzMatch = canonical.match(/\(([^)]+)\)\s*$/);
  const tzLabel = tzMatch ? String(tzMatch[1] || '').trim() : '';
  const tzOffsetMinutes = parseTimezoneOffsetMinutes(tzLabel) ?? parseTimezoneOffsetMinutes(canonical) ?? 0;

  const timeMatch = canonical.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/i);
  if (!timeMatch) return null;
  const startHour = Number.parseInt(timeMatch[1], 10);
  const startMinute = Number.parseInt(timeMatch[2], 10);
  const endHour = Number.parseInt(timeMatch[3], 10);
  const endMinute = Number.parseInt(timeMatch[4], 10);
  if (![startHour, startMinute, endHour, endMinute].every((n) => Number.isFinite(n))) return null;
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) return null;
  if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) return null;

  const cnDateMatch = canonical.match(/(?:(\d{4})\s*\u5E74\s*)?(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65E5/);
  const altDateMatch = canonical.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);

  const parsedYear = cnDateMatch?.[1] || altDateMatch?.[1] || '';
  const monthText = cnDateMatch?.[2] || altDateMatch?.[2] || '';
  const dayText = cnDateMatch?.[3] || altDateMatch?.[3] || '';

  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const buildStartUtc = (year: number) => {
    const utcMillis = Date.UTC(year, month - 1, day, startHour, startMinute, 0) - tzOffsetMinutes * 60_000;
    return new Date(utcMillis);
  };

  const buildEndUtc = (startUtc: Date) => {
    let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationMinutes <= 0) durationMinutes += 24 * 60;
    const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);
    return { durationMinutes, endUtc };
  };

  let year: number | null = null;
  if (parsedYear) {
    const y = Number.parseInt(parsedYear, 10);
    if (Number.isFinite(y) && y >= 1970 && y <= 2100) year = y;
  }

  if (year == null) {
    const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const baseYear = base.getUTCFullYear();
    const candidates = [baseYear - 1, baseYear, baseYear + 1];
    const baseMs = base.getTime();
    const computed = candidates.map((candidateYear) => {
      const startUtc = buildStartUtc(candidateYear);
      return { year: candidateYear, startUtc, diffMs: startUtc.getTime() - baseMs };
    });
    const acceptable = computed
      .filter((c) => c.diffMs >= -36 * 60 * 60 * 1000)
      .sort((a, b) => a.diffMs - b.diffMs);
    year = (acceptable[0] || computed.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs))[0])?.year ?? baseYear;
  }

  const startsAtUtc = buildStartUtc(year);
  if (!Number.isFinite(startsAtUtc.getTime())) return null;

  const { durationMinutes, endUtc } = buildEndUtc(startsAtUtc);
  const durationHours = Math.round((durationMinutes / 60) * 100) / 100;

  return {
    startsAtUtc,
    endsAtUtc: endUtc,
    durationHours,
    tzOffsetMinutes,
  };
};

const buildDefaultMeetingId = () => {
  const n = Math.floor(100_000_000 + Math.random() * 900_000_000);
  return `会议号：${formatZoomMeetingId(n)}`;
};

type AppointmentPayload = {
  kind?: string;
  windowText?: unknown;
  meetingId?: unknown;
  courseDirectionId?: unknown;
  courseTypeId?: unknown;
};

type AppointmentDecisionPayload = {
  kind?: string;
  appointmentId?: unknown;
  status?: unknown;
};

const safeJsonParse = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseAppointmentPayload = (payloadJson: unknown): AppointmentPayload | null => {
  const parsed = safeJsonParse(payloadJson);
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as any).kind !== 'appointment_card') return null;
  return parsed as AppointmentPayload;
};

const parseAppointmentDecisionPayload = (payloadJson: unknown): AppointmentDecisionPayload | null => {
  const parsed = safeJsonParse(payloadJson);
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as any).kind !== 'appointment_decision') return null;
  return parsed as AppointmentDecisionPayload;
};

const toScheduleCard = (row: any, currentUserId: number) => {
  const payload = parseAppointmentPayload(row?.payload_json);
  if (!payload) return null;
  return {
    id: String(row?.id ?? ''),
    direction: Number(row?.sender_user_id) === currentUserId ? 'outgoing' : 'incoming',
    window: String(payload.windowText || '').trim(),
    meetingId: String(payload.meetingId || '').trim(),
    time: row?.created_at ? new Date(row.created_at).toISOString() : '',
    status: typeof row?.appointment_status === 'string' && row.appointment_status.trim()
      ? row.appointment_status.trim()
      : 'pending',
    courseDirectionId: typeof payload.courseDirectionId === 'string' ? payload.courseDirectionId : '',
    courseTypeId: typeof payload.courseTypeId === 'string' ? payload.courseTypeId : '',
  };
};

const normalizeDecisionStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'accepted' || raw === 'rejected' || raw === 'rescheduling' || raw === 'pending') return raw;
  return '';
};

router.post('/appointments', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const mentorPublicId = typeof req.body?.mentorId === 'string' ? req.body.mentorId.trim() : '';
  const windowText = typeof req.body?.windowText === 'string' ? req.body.windowText.trim() : '';
  const courseDirectionId = typeof req.body?.courseDirectionId === 'string' ? req.body.courseDirectionId.trim() : '';
  const courseTypeId = typeof req.body?.courseTypeId === 'string' ? req.body.courseTypeId.trim() : '';
  const courseRequestIdRaw = req.body?.courseRequestId;
  const courseRequestId = Number.isFinite(Number(courseRequestIdRaw)) ? Number(courseRequestIdRaw) : null;
  const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
    ? String(req.body.meetingId).trim()
    : buildDefaultMeetingId();

  if (!mentorPublicId) return res.status(400).json({ error: '缺少导师ID' });
  if (!windowText) return res.status(400).json({ error: '缺少预约时间' });

  try {
    const mentorRows = await query<any[]>(
      "SELECT user_id FROM user_roles WHERE role = 'mentor' AND public_id = ? LIMIT 1",
      [mentorPublicId.toLowerCase()]
    );
    const mentorUserId = Number(mentorRows?.[0]?.user_id);
    if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) {
      return res.status(404).json({ error: '未找到导师' });
    }
    if (mentorUserId === req.user.id) {
      return res.status(400).json({ error: '不能给自己发送预约' });
    }

    const threadInsert = await query<InsertResult>(
      `
      INSERT INTO message_threads (student_user_id, mentor_user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [req.user.id, mentorUserId]
    );
    const threadId = Number(threadInsert.insertId);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return res.status(500).json({ error: '创建会话失败' });
    }

    const payload = {
      kind: 'appointment_card',
      mentorId: mentorPublicId,
      courseDirectionId,
      courseTypeId,
      courseRequestId,
      windowText,
      meetingId,
    };

    const msgInsert = await query<InsertResult>(
      `
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `,
      [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]
    );
    const messageId = Number(msgInsert.insertId);

    await query(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [Number.isFinite(messageId) && messageId > 0 ? messageId : null, threadId]
    );

    return res.json({ threadId });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Create appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/threads/:threadId/appointments', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

  const windowText = typeof req.body?.windowText === 'string' ? req.body.windowText.trim() : '';
  const courseDirectionId = typeof req.body?.courseDirectionId === 'string' ? req.body.courseDirectionId.trim() : '';
  const courseTypeId = typeof req.body?.courseTypeId === 'string' ? req.body.courseTypeId.trim() : '';
  const courseRequestIdRaw = req.body?.courseRequestId;
  const courseRequestId = Number.isFinite(Number(courseRequestIdRaw)) ? Number(courseRequestIdRaw) : null;
  const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
    ? String(req.body.meetingId).trim()
    : buildDefaultMeetingId();

  if (!windowText) return res.status(400).json({ error: '缺少预约时间' });

  try {
    const threadRows = await query<any[]>(
      `
      SELECT id
      FROM message_threads
      WHERE id = ? AND (student_user_id = ? OR mentor_user_id = ?)
      LIMIT 1
      `,
      [threadId, req.user.id, req.user.id]
    );

    const thread = threadRows?.[0];
    if (!thread) return res.status(404).json({ error: '会话不存在或无权限' });

    const payload = {
      kind: 'appointment_card',
      courseDirectionId,
      courseTypeId,
      courseRequestId,
      windowText,
      meetingId,
    };

    const msgInsert = await query<InsertResult>(
      `
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `,
      [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]
    );
    const messageId = Number(msgInsert.insertId);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return res.status(500).json({ error: '发送预约失败' });
    }

    await query(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [messageId, threadId]
    );

    const appointment = toScheduleCard(
      {
        id: messageId,
        thread_id: threadId,
        sender_user_id: req.user.id,
        payload_json: JSON.stringify(payload),
        created_at: new Date(),
        appointment_status: 'pending',
      },
      req.user.id
    );

    return res.json({ threadId: String(threadId), appointment });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
    }
    console.error('Send appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/appointments/:appointmentId/decision', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: '无效预约ID' });
  }

  const status = normalizeDecisionStatus(req.body?.status ?? req.body?.decision);
  if (!status || status === 'pending') {
    return res.status(400).json({ error: '无效状态' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        mi.sender_user_id,
        mi.payload_json,
        mi.created_at,
        t.student_user_id,
        t.mentor_user_id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      `,
      [appointmentId, req.user.id, req.user.id]
    );

    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
    }
    if (!row) return res.status(404).json({ error: '预约不存在或无权限' });

    if (Number(row.sender_user_id) === req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '不能对自己发的预约更改状态' });
    }

    await conn.execute(
      `
      INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [appointmentId, status, req.user.id]
    );

    if (status === 'accepted') {
      const payload = parseAppointmentPayload(row?.payload_json);
      if (!payload) {
        throw new Error('Invalid appointment payload');
      }
      const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
      const parsed = parseCourseWindowText(payload?.windowText, createdAt);

      if (!parsed) {
        throw new Error('Invalid schedule windowText');
      } else {
        const studentUserId = Number(row?.student_user_id);
        const mentorUserId = Number(row?.mentor_user_id);

        if (!Number.isFinite(studentUserId) || studentUserId <= 0 || !Number.isFinite(mentorUserId) || mentorUserId <= 0) {
          throw new Error('Invalid thread users');
        } else {
          const startsAt = formatUtcDatetime(parsed.startsAtUtc);
          const sessionStatus = parsed.endsAtUtc.getTime() <= Date.now() ? 'completed' : 'scheduled';

          try {
            const [existing] = await conn.execute<any[]>(
              'SELECT id FROM course_sessions WHERE student_user_id = ? AND mentor_user_id = ? AND starts_at = ? LIMIT 1',
              [studentUserId, mentorUserId, startsAt]
            );

            if (!existing || existing.length === 0) {
              await conn.execute(
                `
                INSERT INTO course_sessions
                  (student_user_id, mentor_user_id, course_direction, course_type, starts_at, duration_hours, status)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                  studentUserId,
                  mentorUserId,
                  typeof payload?.courseDirectionId === 'string' && payload.courseDirectionId.trim()
                    ? payload.courseDirectionId.trim()
                    : null,
                  typeof payload?.courseTypeId === 'string' && payload.courseTypeId.trim()
                    ? payload.courseTypeId.trim()
                    : null,
                  startsAt,
                  parsed.durationHours,
                  sessionStatus,
                ]
              );
            }
          } catch (e: any) {
            const code = String(e?.code || '');
            const message = String(e?.message || '');
            const isMissingCourseSessions = code === 'ER_NO_SUCH_TABLE' || message.includes('course_sessions');
            if (isMissingCourseSessions) {
              throw e;
              return res.status(500).json({ error: '鏁版嵁搴撴湭鍗囩骇锛岃鍏堟墽琛宐ackend/schema.sql' });
            }
            console.error('Insert course session error:', e);
            throw e;
          }
        }
      }
    }

    const shouldEmitDecisionMessage = status === 'accepted' || status === 'rejected';
    if (shouldEmitDecisionMessage) {
      const payload = {
        kind: 'appointment_decision',
        appointmentId: String(appointmentId),
        status,
      };

      const [msgInsert] = await conn.execute<InsertResult>(
        `
        INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
        VALUES (?, ?, ?, ?)
        `,
        [Number(row.thread_id), req.user.id, 'appointment_decision', JSON.stringify(payload)]
      );
      const messageId = Number(msgInsert.insertId);

      await conn.execute(
        `
        UPDATE message_threads
        SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [Number.isFinite(messageId) && messageId > 0 ? messageId : null, Number(row.thread_id)]
      );
    } else {
      await conn.execute(
        `UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [Number(row.thread_id)]
      );
    }

    await conn.commit();
    return res.json({ ok: true, appointmentId: String(appointmentId), status });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
    }
    console.error('Update appointment decision error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.get('/threads', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const rows = await query<any[]>(
      `
      SELECT
        t.id AS thread_id,
        t.student_user_id,
        t.mentor_user_id,
        t.last_message_at,
        t.updated_at,
        m.sender_user_id,
        m.payload_json,
        su.username AS student_username,
        srole.public_id AS student_public_id,
        sas.student_avatar_url AS student_avatar_url,
        mu.username AS mentor_username,
        mrole.public_id AS mentor_public_id,
        mp.display_name AS mentor_display_name,
        mp.avatar_url AS mentor_avatar_url
      FROM message_threads t
      LEFT JOIN message_items m ON m.id = t.last_message_id
      LEFT JOIN users su ON su.id = t.student_user_id
      LEFT JOIN user_roles srole ON srole.user_id = t.student_user_id AND srole.role = 'student'
      LEFT JOIN account_settings sas ON sas.user_id = t.student_user_id
      LEFT JOIN users mu ON mu.id = t.mentor_user_id
      LEFT JOIN user_roles mrole ON mrole.user_id = t.mentor_user_id AND mrole.role = 'mentor'
      LEFT JOIN mentor_profiles mp ON mp.user_id = t.mentor_user_id
      WHERE t.student_user_id = ? OR t.mentor_user_id = ?
      ORDER BY COALESCE(t.last_message_at, t.updated_at) DESC
      LIMIT 100
      `,
      [req.user.id, req.user.id]
    );

    const threads = (rows || []).map((r) => {
      const isStudentSide = Number(r.student_user_id) === req.user!.id;
      const myRole = isStudentSide ? 'student' : 'mentor';
      const counterpart = isStudentSide
        ? String(r.mentor_display_name || r.mentor_username || r.mentor_public_id || '导师')
        : String(r.student_username || r.student_public_id || '学生');
      const counterpartId = isStudentSide ? '' : String(r.student_public_id || '');
      const counterpartAvatarUrl = isStudentSide
        ? String(r.mentor_avatar_url || '')
        : String(r.student_avatar_url || '');

      const lastAt = r.last_message_at || r.updated_at;

      return {
        id: String(r.thread_id),
        subject: '日程',
        myRole,
        counterpart,
        counterpartId,
        counterpartAvatarUrl,
        time: lastAt ? new Date(lastAt).toISOString() : '',
        courseDirectionId: '',
        courseTypeId: '',
        schedule: null,
        scheduleHistory: [] as any[],
        latestDecision: null as any,
        messages: [],
      };
    });

    const threadIds = threads
      .map((t) => String(t.id || '').trim())
      .filter((id) => id);

    if (threadIds.length > 0) {
      const placeholders = threadIds.map(() => '?').join(',');

      const decisionRows = await query<any[]>(
        `
        SELECT mi.thread_id, mi.sender_user_id, mi.payload_json, mi.created_at
        FROM message_items mi
        INNER JOIN (
          SELECT thread_id, MAX(id) AS max_id
          FROM message_items
          WHERE thread_id IN (${placeholders})
            AND message_type = 'appointment_decision'
          GROUP BY thread_id
        ) latest ON latest.max_id = mi.id
        `,
        threadIds
      );

      const decisionByThread = new Map<string, any>();
      for (const row of decisionRows || []) {
        const tid = String(row?.thread_id || '').trim();
        if (!tid) continue;
        decisionByThread.set(tid, row);
      }

      const items = await query<any[]>(
        `
        SELECT mi.id, mi.thread_id, mi.sender_user_id, mi.payload_json, mi.created_at,
          COALESCE(ast.status, 'pending') AS appointment_status
        FROM message_items mi
        LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_card'
        ORDER BY thread_id ASC, created_at ASC, id ASC
        `,
        threadIds
      );

      const byThread = new Map<string, any[]>();
      for (const row of items || []) {
        const tid = String(row?.thread_id || '').trim();
        if (!tid) continue;
        if (!byThread.has(tid)) byThread.set(tid, []);
        byThread.get(tid)!.push(row);
      }

      const threadMap = new Map<string, any>();
      for (const t of threads) threadMap.set(String(t.id), t);

      for (const [tid, rowsForThread] of byThread.entries()) {
        const thread = threadMap.get(tid);
        if (!thread) continue;

        const MAX_PER_THREAD = 30;
        const recentRows = rowsForThread.length > MAX_PER_THREAD
          ? rowsForThread.slice(-MAX_PER_THREAD)
          : rowsForThread;

        const cards = recentRows
          .map((row) => toScheduleCard(row, req.user!.id))
          .filter(Boolean) as any[];

        if (cards.length === 0) continue;

        const last = cards[cards.length - 1];
        const history = cards.slice(0, -1);

        thread.schedule = last;
        thread.scheduleHistory = history;
        thread.courseDirectionId = String(last.courseDirectionId || '');
        thread.courseTypeId = String(last.courseTypeId || '');
      }

      for (const t of threads) {
        const row = decisionByThread.get(String(t.id));
        if (!row) continue;
        const payload = parseAppointmentDecisionPayload(row?.payload_json);
        if (!payload) continue;
        const status = typeof payload.status === 'string' ? payload.status.trim() : '';
        if (!status) continue;
        t.latestDecision = {
          status,
          time: row?.created_at ? new Date(row.created_at).toISOString() : '',
          isByMe: Number(row?.sender_user_id) === req.user!.id,
        };
      }
    }

    return res.json({ threads });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch message threads error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
