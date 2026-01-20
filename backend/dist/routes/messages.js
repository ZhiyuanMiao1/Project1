"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const isMissingMessagesSchemaError = (err) => {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR')
        return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('message_threads') || message.includes('message_items') || message.includes('appointment_statuses');
};
const formatZoomMeetingId = (digits) => {
    const text = String(digits).padStart(9, '0').slice(0, 9);
    return `${text.slice(0, 3)} ${text.slice(3, 6)} ${text.slice(6)}`;
};
const buildDefaultMeetingId = () => {
    const n = Math.floor(100000000 + Math.random() * 900000000);
    return `会议号：${formatZoomMeetingId(n)}`;
};
const safeJsonParse = (value) => {
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
};
const parseAppointmentPayload = (payloadJson) => {
    const parsed = safeJsonParse(payloadJson);
    if (!parsed || typeof parsed !== 'object')
        return null;
    if (parsed.kind !== 'appointment_card')
        return null;
    return parsed;
};
const parseAppointmentDecisionPayload = (payloadJson) => {
    const parsed = safeJsonParse(payloadJson);
    if (!parsed || typeof parsed !== 'object')
        return null;
    if (parsed.kind !== 'appointment_decision')
        return null;
    return parsed;
};
const toScheduleCard = (row, currentUserId) => {
    const payload = parseAppointmentPayload(row?.payload_json);
    if (!payload)
        return null;
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
const normalizeDecisionStatus = (value) => {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'accepted' || raw === 'rejected' || raw === 'rescheduling' || raw === 'pending')
        return raw;
    return '';
};
router.post('/appointments', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const mentorPublicId = typeof req.body?.mentorId === 'string' ? req.body.mentorId.trim() : '';
    const windowText = typeof req.body?.windowText === 'string' ? req.body.windowText.trim() : '';
    const courseDirectionId = typeof req.body?.courseDirectionId === 'string' ? req.body.courseDirectionId.trim() : '';
    const courseTypeId = typeof req.body?.courseTypeId === 'string' ? req.body.courseTypeId.trim() : '';
    const courseRequestIdRaw = req.body?.courseRequestId;
    const courseRequestId = Number.isFinite(Number(courseRequestIdRaw)) ? Number(courseRequestIdRaw) : null;
    const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
        ? String(req.body.meetingId).trim()
        : buildDefaultMeetingId();
    if (!mentorPublicId)
        return res.status(400).json({ error: '缺少导师ID' });
    if (!windowText)
        return res.status(400).json({ error: '缺少预约时间' });
    try {
        const mentorRows = await (0, db_1.query)("SELECT user_id FROM user_roles WHERE role = 'mentor' AND public_id = ? LIMIT 1", [mentorPublicId.toLowerCase()]);
        const mentorUserId = Number(mentorRows?.[0]?.user_id);
        if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) {
            return res.status(404).json({ error: '未找到导师' });
        }
        if (mentorUserId === req.user.id) {
            return res.status(400).json({ error: '不能给自己发送预约' });
        }
        const threadInsert = await (0, db_1.query)(`
      INSERT INTO message_threads (student_user_id, mentor_user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        updated_at = CURRENT_TIMESTAMP
      `, [req.user.id, mentorUserId]);
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
        const msgInsert = await (0, db_1.query)(`
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `, [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]);
        const messageId = Number(msgInsert.insertId);
        await (0, db_1.query)(`
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `, [Number.isFinite(messageId) && messageId > 0 ? messageId : null, threadId]);
        return res.json({ threadId });
    }
    catch (e) {
        if (isMissingMessagesSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Create appointment message error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/threads/:threadId/appointments', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
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
    if (!windowText)
        return res.status(400).json({ error: '缺少预约时间' });
    try {
        const threadRows = await (0, db_1.query)(`
      SELECT id
      FROM message_threads
      WHERE id = ? AND (student_user_id = ? OR mentor_user_id = ?)
      LIMIT 1
      `, [threadId, req.user.id, req.user.id]);
        const thread = threadRows?.[0];
        if (!thread)
            return res.status(404).json({ error: '会话不存在或无权限' });
        const payload = {
            kind: 'appointment_card',
            courseDirectionId,
            courseTypeId,
            courseRequestId,
            windowText,
            meetingId,
        };
        const msgInsert = await (0, db_1.query)(`
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `, [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]);
        const messageId = Number(msgInsert.insertId);
        if (!Number.isFinite(messageId) || messageId <= 0) {
            return res.status(500).json({ error: '发送预约失败' });
        }
        await (0, db_1.query)(`
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `, [messageId, threadId]);
        const appointment = toScheduleCard({
            id: messageId,
            thread_id: threadId,
            sender_user_id: req.user.id,
            payload_json: JSON.stringify(payload),
            created_at: new Date(),
            appointment_status: 'pending',
        }, req.user.id);
        return res.json({ threadId: String(threadId), appointment });
    }
    catch (e) {
        if (isMissingMessagesSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
        }
        console.error('Send appointment message error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/appointments/:appointmentId/decision', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const appointmentId = Number(req.params.appointmentId);
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
        return res.status(400).json({ error: '无效预约ID' });
    }
    const status = normalizeDecisionStatus(req.body?.status ?? req.body?.decision);
    if (!status || status === 'pending') {
        return res.status(400).json({ error: '无效状态' });
    }
    try {
        const rows = await (0, db_1.query)(`
      SELECT mi.id, mi.thread_id, mi.sender_user_id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      `, [appointmentId, req.user.id, req.user.id]);
        const row = rows?.[0];
        if (!row)
            return res.status(404).json({ error: '预约不存在或无权限' });
        if (Number(row.sender_user_id) === req.user.id) {
            return res.status(403).json({ error: '不能对自己发的预约更改状态' });
        }
        await (0, db_1.query)(`
      INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP
      `, [appointmentId, status, req.user.id]);
        const shouldEmitDecisionMessage = status === 'accepted' || status === 'rejected';
        if (shouldEmitDecisionMessage) {
            const payload = {
                kind: 'appointment_decision',
                appointmentId: String(appointmentId),
                status,
            };
            const msgInsert = await (0, db_1.query)(`
        INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
        VALUES (?, ?, ?, ?)
        `, [Number(row.thread_id), req.user.id, 'appointment_decision', JSON.stringify(payload)]);
            const messageId = Number(msgInsert.insertId);
            await (0, db_1.query)(`
        UPDATE message_threads
        SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `, [Number.isFinite(messageId) && messageId > 0 ? messageId : null, Number(row.thread_id)]);
        }
        else {
            await (0, db_1.query)(`UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(row.thread_id)]);
        }
        return res.json({ ok: true, appointmentId: String(appointmentId), status });
    }
    catch (e) {
        if (isMissingMessagesSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
        }
        console.error('Update appointment decision error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/threads', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const rows = await (0, db_1.query)(`
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
      `, [req.user.id, req.user.id]);
        const threads = (rows || []).map((r) => {
            const isStudentSide = Number(r.student_user_id) === req.user.id;
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
                scheduleHistory: [],
                latestDecision: null,
                messages: [],
            };
        });
        const threadIds = threads
            .map((t) => String(t.id || '').trim())
            .filter((id) => id);
        if (threadIds.length > 0) {
            const placeholders = threadIds.map(() => '?').join(',');
            const decisionRows = await (0, db_1.query)(`
        SELECT mi.thread_id, mi.sender_user_id, mi.payload_json, mi.created_at
        FROM message_items mi
        INNER JOIN (
          SELECT thread_id, MAX(id) AS max_id
          FROM message_items
          WHERE thread_id IN (${placeholders})
            AND message_type = 'appointment_decision'
          GROUP BY thread_id
        ) latest ON latest.max_id = mi.id
        `, threadIds);
            const decisionByThread = new Map();
            for (const row of decisionRows || []) {
                const tid = String(row?.thread_id || '').trim();
                if (!tid)
                    continue;
                decisionByThread.set(tid, row);
            }
            const items = await (0, db_1.query)(`
        SELECT mi.id, mi.thread_id, mi.sender_user_id, mi.payload_json, mi.created_at,
          COALESCE(ast.status, 'pending') AS appointment_status
        FROM message_items mi
        LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_card'
        ORDER BY thread_id ASC, created_at ASC, id ASC
        `, threadIds);
            const byThread = new Map();
            for (const row of items || []) {
                const tid = String(row?.thread_id || '').trim();
                if (!tid)
                    continue;
                if (!byThread.has(tid))
                    byThread.set(tid, []);
                byThread.get(tid).push(row);
            }
            const threadMap = new Map();
            for (const t of threads)
                threadMap.set(String(t.id), t);
            for (const [tid, rowsForThread] of byThread.entries()) {
                const thread = threadMap.get(tid);
                if (!thread)
                    continue;
                const MAX_PER_THREAD = 30;
                const recentRows = rowsForThread.length > MAX_PER_THREAD
                    ? rowsForThread.slice(-MAX_PER_THREAD)
                    : rowsForThread;
                const cards = recentRows
                    .map((row) => toScheduleCard(row, req.user.id))
                    .filter(Boolean);
                if (cards.length === 0)
                    continue;
                const last = cards[cards.length - 1];
                const history = cards.slice(0, -1);
                thread.schedule = last;
                thread.scheduleHistory = history;
                thread.courseDirectionId = String(last.courseDirectionId || '');
                thread.courseTypeId = String(last.courseTypeId || '');
            }
            for (const t of threads) {
                const row = decisionByThread.get(String(t.id));
                if (!row)
                    continue;
                const payload = parseAppointmentDecisionPayload(row?.payload_json);
                if (!payload)
                    continue;
                const status = typeof payload.status === 'string' ? payload.status.trim() : '';
                if (!status)
                    continue;
                t.latestDecision = {
                    status,
                    time: row?.created_at ? new Date(row.created_at).toISOString() : '',
                    isByMe: Number(row?.sender_user_id) === req.user.id,
                };
            }
        }
        return res.json({ threads });
    }
    catch (e) {
        if (isMissingMessagesSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Fetch message threads error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
