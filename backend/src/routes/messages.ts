import express, { Request, Response } from 'express';
import type { InsertResult } from '../db';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

const isMissingMessagesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('message_threads') || message.includes('message_items');
};

const formatZoomMeetingId = (digits: number) => {
  const text = String(digits).padStart(9, '0').slice(0, 9);
  return `${text.slice(0, 3)} ${text.slice(3, 6)} ${text.slice(6)}`;
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

const toScheduleCard = (row: any, currentUserId: number) => {
  const payload = parseAppointmentPayload(row?.payload_json);
  if (!payload) return null;
  return {
    id: String(row?.id ?? ''),
    direction: Number(row?.sender_user_id) === currentUserId ? 'outgoing' : 'incoming',
    window: String(payload.windowText || '').trim(),
    meetingId: String(payload.meetingId || '').trim(),
    time: row?.created_at ? new Date(row.created_at).toISOString() : '',
    status: 'pending',
    courseDirectionId: typeof payload.courseDirectionId === 'string' ? payload.courseDirectionId : '',
    courseTypeId: typeof payload.courseTypeId === 'string' ? payload.courseTypeId : '',
  };
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
        mu.username AS mentor_username,
        mrole.public_id AS mentor_public_id,
        mp.display_name AS mentor_display_name
      FROM message_threads t
      LEFT JOIN message_items m ON m.id = t.last_message_id
      LEFT JOIN users su ON su.id = t.student_user_id
      LEFT JOIN user_roles srole ON srole.user_id = t.student_user_id AND srole.role = 'student'
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

      const lastAt = r.last_message_at || r.updated_at;

      return {
        id: String(r.thread_id),
        subject: '日程',
        myRole,
        counterpart,
        counterpartId,
        time: lastAt ? new Date(lastAt).toISOString() : '',
        courseDirectionId: '',
        courseTypeId: '',
        schedule: null,
        scheduleHistory: [] as any[],
        messages: [],
      };
    });

    const threadIds = threads
      .map((t) => String(t.id || '').trim())
      .filter((id) => id);

    if (threadIds.length > 0) {
      const placeholders = threadIds.map(() => '?').join(',');
      const items = await query<any[]>(
        `
        SELECT id, thread_id, sender_user_id, payload_json, created_at
        FROM message_items
        WHERE thread_id IN (${placeholders})
          AND message_type = 'appointment_card'
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
