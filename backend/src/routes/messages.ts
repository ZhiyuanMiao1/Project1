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
      let payload: any = null;
      try { payload = r.payload_json ? JSON.parse(r.payload_json) : null; } catch { payload = null; }

      const isStudentSide = Number(r.student_user_id) === req.user!.id;
      const myRole = isStudentSide ? 'student' : 'mentor';
      const counterpart = isStudentSide
        ? String(r.mentor_display_name || r.mentor_username || r.mentor_public_id || '导师')
        : String(r.student_username || r.student_public_id || '学生');
      const counterpartId = isStudentSide ? '' : String(r.student_public_id || '');

      const lastAt = r.last_message_at || r.updated_at;
      const schedule = payload && payload.kind === 'appointment_card'
        ? {
            direction: Number(r.sender_user_id) === req.user!.id ? 'outgoing' : 'incoming',
            window: String(payload.windowText || '').trim(),
            meetingId: String(payload.meetingId || '').trim(),
            status: 'pending',
            courseDirectionId: payload.courseDirectionId || '',
            courseTypeId: payload.courseTypeId || '',
          }
        : null;

      return {
        id: String(r.thread_id),
        subject: '日程',
        myRole,
        counterpart,
        counterpartId,
        time: lastAt ? new Date(lastAt).toISOString() : '',
        courseDirectionId: payload?.courseDirectionId || '',
        courseTypeId: payload?.courseTypeId || '',
        schedule,
        scheduleHistory: [],
        messages: [],
      };
    });

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
