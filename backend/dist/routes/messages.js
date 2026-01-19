"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const ensureMessagesTables = async () => {
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS \`message_threads\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`student_user_id\` INT NOT NULL,
      \`mentor_user_id\` INT NOT NULL,
      \`last_message_id\` BIGINT NULL,
      \`last_message_at\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_message_threads_pair\` (\`student_user_id\`, \`mentor_user_id\`),
      KEY \`idx_message_threads_student\` (\`student_user_id\`),
      KEY \`idx_message_threads_mentor\` (\`mentor_user_id\`),
      CONSTRAINT \`fk_message_threads_student\` FOREIGN KEY (\`student_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_message_threads_mentor\` FOREIGN KEY (\`mentor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS \`message_items\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`thread_id\` BIGINT NOT NULL,
      \`sender_user_id\` INT NOT NULL,
      \`message_type\` VARCHAR(50) NOT NULL,
      \`payload_json\` TEXT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_message_items_thread\` (\`thread_id\`),
      CONSTRAINT \`fk_message_items_thread\` FOREIGN KEY (\`thread_id\`) REFERENCES \`message_threads\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_message_items_sender\` FOREIGN KEY (\`sender_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};
// Best-effort: the rest of the app already runs without an explicit migration step.
ensureMessagesTables().catch((e) => {
    console.error('ensureMessagesTables failed:', e);
});
const formatZoomMeetingId = (digits) => {
    const text = String(digits).padStart(9, '0').slice(0, 9);
    return `${text.slice(0, 3)} ${text.slice(3, 6)} ${text.slice(6)}`;
};
const buildDefaultMeetingId = () => {
    const n = Math.floor(100000000 + Math.random() * 900000000);
    return `会议号：${formatZoomMeetingId(n)}`;
};
router.post('/appointments', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    if (req.user.role !== 'student')
        return res.status(403).json({ error: '仅学生可发送预约' });
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
        console.error('Create appointment message error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/threads', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        if (req.user.role === 'student') {
            const rows = await (0, db_1.query)(`
        SELECT
          t.id AS thread_id,
          t.last_message_at,
          t.updated_at,
          m.sender_user_id,
          m.payload_json,
          u.username AS mentor_username,
          ur.public_id AS mentor_public_id,
          mp.display_name AS mentor_display_name
        FROM message_threads t
        LEFT JOIN message_items m ON m.id = t.last_message_id
        LEFT JOIN users u ON u.id = t.mentor_user_id
        LEFT JOIN user_roles ur ON ur.user_id = t.mentor_user_id AND ur.role = 'mentor'
        LEFT JOIN mentor_profiles mp ON mp.user_id = t.mentor_user_id
        WHERE t.student_user_id = ?
        ORDER BY COALESCE(t.last_message_at, t.updated_at) DESC
        LIMIT 50
        `, [req.user.id]);
            const threads = (rows || []).map((r) => {
                let payload = null;
                try {
                    payload = r.payload_json ? JSON.parse(r.payload_json) : null;
                }
                catch {
                    payload = null;
                }
                const counterpart = String(r.mentor_display_name || r.mentor_username || r.mentor_public_id || '导师');
                const lastAt = r.last_message_at || r.updated_at;
                const schedule = payload && payload.kind === 'appointment_card'
                    ? {
                        direction: Number(r.sender_user_id) === req.user.id ? 'outgoing' : 'incoming',
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
                    counterpart,
                    time: lastAt ? new Date(lastAt).toISOString() : '',
                    courseDirectionId: payload?.courseDirectionId || '',
                    courseTypeId: payload?.courseTypeId || '',
                    schedule,
                    scheduleHistory: [],
                    messages: [],
                };
            });
            return res.json({ threads });
        }
        const rows = await (0, db_1.query)(`
      SELECT
        t.id AS thread_id,
        t.last_message_at,
        t.updated_at,
        m.sender_user_id,
        m.payload_json,
        u.username AS student_username,
        ur.public_id AS student_public_id
      FROM message_threads t
      LEFT JOIN message_items m ON m.id = t.last_message_id
      LEFT JOIN users u ON u.id = t.student_user_id
      LEFT JOIN user_roles ur ON ur.user_id = t.student_user_id AND ur.role = 'student'
      WHERE t.mentor_user_id = ?
      ORDER BY COALESCE(t.last_message_at, t.updated_at) DESC
      LIMIT 50
      `, [req.user.id]);
        const threads = (rows || []).map((r) => {
            let payload = null;
            try {
                payload = r.payload_json ? JSON.parse(r.payload_json) : null;
            }
            catch {
                payload = null;
            }
            const counterpart = String(r.student_username || r.student_public_id || '学生');
            const lastAt = r.last_message_at || r.updated_at;
            const schedule = payload && payload.kind === 'appointment_card'
                ? {
                    direction: Number(r.sender_user_id) === req.user.id ? 'outgoing' : 'incoming',
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
                counterpart,
                counterpartId: String(r.student_public_id || ''),
                time: lastAt ? new Date(lastAt).toISOString() : '',
                courseDirectionId: payload?.courseDirectionId || '',
                courseTypeId: payload?.courseTypeId || '',
                schedule,
                scheduleHistory: [],
                messages: [],
            };
        });
        return res.json({ threads });
    }
    catch (e) {
        console.error('Fetch message threads error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
