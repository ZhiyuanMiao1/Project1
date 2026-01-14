"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const sanitizeString = (value, maxLen) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw)
        return null;
    return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
};
const sanitizeStringArray = (value, maxItems, maxItemLen) => {
    if (!Array.isArray(value))
        return null;
    const out = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const v = item.trim();
        if (!v)
            continue;
        const clipped = v.length > maxItemLen ? v.slice(0, maxItemLen) : v;
        if (seen.has(clipped))
            continue;
        seen.add(clipped);
        out.push(clipped);
        if (out.length >= maxItems)
            break;
    }
    return out;
};
const parseFiniteNumber = (value) => {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    return null;
};
const mergeBlocksList = (blocks) => {
    if (!Array.isArray(blocks) || blocks.length === 0)
        return [];
    const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = sorted[i];
        if (cur.start <= prev.end + 1) {
            prev.end = Math.max(prev.end, cur.end);
        }
        else {
            merged.push({ ...cur });
        }
    }
    return merged;
};
const isValidDayKey = (key) => {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key))
        return false;
    const [yRaw, mRaw, dRaw] = key.split('-');
    const y = Number.parseInt(yRaw, 10);
    const m = Number.parseInt(mRaw, 10);
    const d = Number.parseInt(dRaw, 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
        return false;
    if (m < 1 || m > 12)
        return false;
    if (d < 1 || d > 31)
        return false;
    const dt = new Date(y, m - 1, d);
    if (!Number.isFinite(dt.getTime()))
        return false;
    const normalized = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return normalized === key;
};
const sanitizeDaySelections = (raw) => {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return out;
    const entries = Object.entries(raw);
    for (const [key, value] of entries) {
        if (!isValidDayKey(key))
            continue;
        if (!Array.isArray(value))
            continue;
        const blocks = [];
        for (const item of value) {
            const start = Number(item?.start);
            const end = Number(item?.end);
            if (!Number.isFinite(start) || !Number.isFinite(end))
                continue;
            const s = Math.max(0, Math.min(95, Math.floor(start)));
            const e = Math.max(0, Math.min(95, Math.floor(end)));
            blocks.push({ start: Math.min(s, e), end: Math.max(s, e) });
            if (blocks.length >= 64)
                break;
        }
        const merged = mergeBlocksList(blocks);
        if (merged.length)
            out[key] = merged;
        if (Object.keys(out).length >= 730)
            break;
    }
    return out;
};
const sanitizeAttachments = (raw, requestId) => {
    if (!Array.isArray(raw))
        return null;
    const out = [];
    const seen = new Set();
    const prefix = `v1/requests/${requestId}/attachments/`;
    for (const item of raw) {
        const input = (item || {});
        const fileId = typeof input.fileId === 'string' ? input.fileId.trim() : '';
        if (!/^[0-9a-fA-F]{32}$/.test(fileId))
            continue;
        const fileName = sanitizeString(input.fileName, 255);
        if (!fileName)
            continue;
        const ext = typeof input.ext === 'string' ? input.ext.trim().toLowerCase() : '';
        if (!ext || ext.length > 10)
            continue;
        const sizeBytes = parseFiniteNumber(input.sizeBytes);
        if (!sizeBytes || sizeBytes < 1 || sizeBytes > 1024 * 1024 * 200)
            continue; // <= 200MB hard cap
        const ossKey = typeof input.ossKey === 'string' ? input.ossKey.trim() : '';
        if (!ossKey || ossKey.length > 1024)
            continue;
        if (!ossKey.startsWith(prefix))
            continue;
        const fileUrl = typeof input.fileUrl === 'string' ? input.fileUrl.trim() : '';
        if (!fileUrl || fileUrl.length > 2048)
            continue;
        if (seen.has(fileId))
            continue;
        seen.add(fileId);
        const contentType = sanitizeString(input.contentType, 100);
        out.push({ fileId, fileName, ext, contentType, sizeBytes: Math.floor(sizeBytes), ossKey, fileUrl });
        if (out.length >= 20)
            break;
    }
    return out;
};
const buildUpdate = (body) => {
    const update = {};
    if (hasOwn(body, 'learningGoal'))
        update.learningGoal = sanitizeString(body.learningGoal, 200);
    if (hasOwn(body, 'courseDirection'))
        update.courseDirection = sanitizeString(body.courseDirection, 64);
    if (hasOwn(body, 'courseType'))
        update.courseType = sanitizeString(body.courseType, 64);
    if (hasOwn(body, 'courseFocus'))
        update.courseFocus = sanitizeString(body.courseFocus, 8000);
    if (hasOwn(body, 'format'))
        update.format = sanitizeString(body.format, 64);
    if (hasOwn(body, 'milestone'))
        update.milestone = sanitizeString(body.milestone, 8000);
    if (hasOwn(body, 'courseTypes')) {
        const courseTypes = sanitizeStringArray(body.courseTypes, 20, 64) || [];
        update.courseTypesJson = JSON.stringify(courseTypes);
    }
    if (hasOwn(body, 'totalCourseHours')) {
        const n = parseFiniteNumber(body.totalCourseHours);
        update.totalCourseHours = n == null ? null : Math.max(0, Math.min(9999, n));
    }
    if (hasOwn(body, 'timeZone'))
        update.timeZone = sanitizeString(body.timeZone, 64);
    if (hasOwn(body, 'sessionDurationHours')) {
        const n = parseFiniteNumber(body.sessionDurationHours);
        update.sessionDurationHours = n == null ? null : Math.max(0.25, Math.min(10, n));
    }
    if (hasOwn(body, 'daySelections')) {
        const daySelections = sanitizeDaySelections(body.daySelections);
        update.scheduleJson = JSON.stringify(daySelections);
    }
    if (hasOwn(body, 'contactName'))
        update.contactName = sanitizeString(body.contactName, 100);
    if (hasOwn(body, 'contactMethod'))
        update.contactMethod = sanitizeString(body.contactMethod, 32);
    if (hasOwn(body, 'contactValue'))
        update.contactValue = sanitizeString(body.contactValue, 200);
    return update;
};
const applyUpdate = async (conn, requestId, userId, update) => {
    const sets = [];
    const args = [];
    const add = (col, value) => {
        sets.push(`${col} = ?`);
        args.push(value);
    };
    if (hasOwn(update, 'learningGoal'))
        add('learning_goal', update.learningGoal);
    if (hasOwn(update, 'courseDirection'))
        add('course_direction', update.courseDirection);
    if (hasOwn(update, 'courseType'))
        add('course_type', update.courseType);
    if (hasOwn(update, 'courseTypesJson'))
        add('course_types_json', update.courseTypesJson);
    if (hasOwn(update, 'courseFocus'))
        add('course_focus', update.courseFocus);
    if (hasOwn(update, 'format'))
        add('format', update.format);
    if (hasOwn(update, 'milestone'))
        add('milestone', update.milestone);
    if (hasOwn(update, 'totalCourseHours'))
        add('total_course_hours', update.totalCourseHours);
    if (hasOwn(update, 'timeZone'))
        add('time_zone', update.timeZone);
    if (hasOwn(update, 'sessionDurationHours'))
        add('session_duration_hours', update.sessionDurationHours);
    if (hasOwn(update, 'scheduleJson'))
        add('schedule_json', update.scheduleJson);
    if (hasOwn(update, 'contactName'))
        add('contact_name', update.contactName);
    if (hasOwn(update, 'contactMethod'))
        add('contact_method', update.contactMethod);
    if (hasOwn(update, 'contactValue'))
        add('contact_value', update.contactValue);
    if (sets.length === 0)
        return;
    await conn.execute(`UPDATE course_requests
     SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`, [...args, requestId, userId]);
};
const ensureAuthed = (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: '未授权' });
        return false;
    }
    return true;
};
router.get('/draft', auth_1.requireAuth, async (req, res) => {
    if (!ensureAuthed(req, res))
        return;
    try {
        const [rows] = await db_1.pool.execute("SELECT * FROM course_requests WHERE user_id = ? AND status = 'draft' ORDER BY updated_at DESC LIMIT 1", [req.user.id]);
        const draft = rows?.[0];
        if (!draft)
            return res.json({ draft: null });
        const [attRows] = await db_1.pool.execute('SELECT file_id, original_file_name, ext, content_type, size_bytes, oss_key, file_url, created_at FROM course_request_attachments WHERE request_id = ? ORDER BY id ASC', [draft.id]);
        let courseTypes = [];
        try {
            courseTypes = draft.course_types_json ? JSON.parse(draft.course_types_json) : [];
        }
        catch {
            courseTypes = [];
        }
        let daySelections = {};
        try {
            daySelections = draft.schedule_json ? JSON.parse(draft.schedule_json) : {};
        }
        catch {
            daySelections = {};
        }
        return res.json({
            draft: {
                id: draft.id,
                status: draft.status,
                learningGoal: draft.learning_goal,
                courseDirection: draft.course_direction,
                courseType: draft.course_type,
                courseTypes,
                courseFocus: draft.course_focus,
                format: draft.format,
                milestone: draft.milestone,
                totalCourseHours: draft.total_course_hours,
                timeZone: draft.time_zone,
                sessionDurationHours: draft.session_duration_hours,
                daySelections,
                contactName: draft.contact_name,
                contactMethod: draft.contact_method,
                contactValue: draft.contact_value,
                attachments: (attRows || []).map((r) => ({
                    fileId: r.file_id,
                    fileName: r.original_file_name,
                    ext: r.ext,
                    contentType: r.content_type,
                    sizeBytes: r.size_bytes,
                    ossKey: r.oss_key,
                    fileUrl: r.file_url,
                    createdAt: r.created_at,
                })),
                createdAt: draft.created_at,
                updatedAt: draft.updated_at,
            },
        });
    }
    catch (e) {
        console.error('Fetch request draft error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/drafts', auth_1.requireAuth, async (req, res) => {
    if (!ensureAuthed(req, res))
        return;
    const rawLimit = typeof req.query?.limit === 'string' ? req.query.limit : '';
    const parsedLimit = rawLimit ? Number(rawLimit) : 20;
    const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(50, Math.floor(parsedLimit)))
        : 20;
    try {
        const [rows] = await db_1.pool.execute(`SELECT id, course_direction, course_type, course_types_json, created_at, updated_at
       FROM course_requests
       WHERE user_id = ? AND status = 'draft'
       ORDER BY updated_at DESC
       LIMIT ${limit}`, [req.user.id]);
        const drafts = (rows || []).map((r) => {
            let courseTypes = [];
            try {
                courseTypes = r.course_types_json ? JSON.parse(r.course_types_json) : [];
            }
            catch {
                courseTypes = [];
            }
            return {
                id: r.id,
                courseDirection: r.course_direction,
                courseType: r.course_type,
                courseTypes,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            };
        });
        return res.json({ drafts });
    }
    catch (e) {
        const message = typeof e?.message === 'string' ? e.message : '';
        if (message.includes('course_requests')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Fetch request drafts error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/save', auth_1.requireAuth, [
    (0, express_validator_1.body)('requestId').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('learningGoal').optional().isString().isLength({ max: 200 }),
    (0, express_validator_1.body)('courseDirection').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('courseType').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('courseTypes').optional().isArray(),
    (0, express_validator_1.body)('courseFocus').optional().isString().isLength({ max: 8000 }),
    (0, express_validator_1.body)('format').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('milestone').optional().isString().isLength({ max: 8000 }),
    (0, express_validator_1.body)('totalCourseHours').optional(),
    (0, express_validator_1.body)('timeZone').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('sessionDurationHours').optional(),
    (0, express_validator_1.body)('daySelections').optional().custom((v) => v && typeof v === 'object' && !Array.isArray(v)),
    (0, express_validator_1.body)('contactName').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('contactMethod').optional().isString().isLength({ max: 32 }),
    (0, express_validator_1.body)('contactValue').optional().isString().isLength({ max: 200 }),
    (0, express_validator_1.body)('attachments').optional().isArray(),
], async (req, res) => {
    if (!ensureAuthed(req, res))
        return;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const userId = req.user.id;
    const requestedId = parseFiniteNumber(req.body?.requestId);
    const requestIdInput = requestedId && requestedId > 0 ? Math.floor(requestedId) : null;
    const update = buildUpdate(req.body);
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        let requestId;
        if (requestIdInput) {
            const [rows] = await conn.execute('SELECT id, status FROM course_requests WHERE id = ? AND user_id = ? LIMIT 1', [requestIdInput, userId]);
            const row = rows?.[0];
            if (!row) {
                await conn.rollback();
                return res.status(404).json({ error: '未找到需求' });
            }
            if (row.status === 'submitted') {
                await conn.rollback();
                return res.status(409).json({ error: '该需求已提交，无法再保存为草稿' });
            }
            requestId = row.id;
        }
        else {
            const [ins] = await conn.execute("INSERT INTO course_requests (user_id, status) VALUES (?, 'draft')", [userId]);
            requestId = Number(ins?.insertId);
        }
        await applyUpdate(conn, requestId, userId, update);
        const hasAttachments = hasOwn(req.body, 'attachments');
        if (hasAttachments) {
            const attachments = sanitizeAttachments(req.body.attachments, requestId) || [];
            await conn.execute('DELETE FROM course_request_attachments WHERE request_id = ?', [requestId]);
            for (const att of attachments) {
                await conn.execute(`INSERT INTO course_request_attachments
              (request_id, file_id, original_file_name, ext, content_type, size_bytes, oss_key, file_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [requestId, att.fileId, att.fileName, att.ext, att.contentType, att.sizeBytes, att.ossKey, att.fileUrl]);
            }
        }
        await conn.commit();
        return res.json({ requestId });
    }
    catch (e) {
        try {
            await conn.rollback();
        }
        catch { }
        const message = typeof e?.message === 'string' ? e.message : '';
        if (message.includes('course_requests') || message.includes('course_request_attachments')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Save request error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
    finally {
        conn.release();
    }
});
router.post('/submit', auth_1.requireAuth, [
    (0, express_validator_1.body)('requestId').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('learningGoal').optional().isString().isLength({ max: 200 }),
    (0, express_validator_1.body)('courseDirection').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('courseType').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('courseTypes').optional().isArray(),
    (0, express_validator_1.body)('courseFocus').optional().isString().isLength({ max: 8000 }),
    (0, express_validator_1.body)('format').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('milestone').optional().isString().isLength({ max: 8000 }),
    (0, express_validator_1.body)('totalCourseHours').optional(),
    (0, express_validator_1.body)('timeZone').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('sessionDurationHours').optional(),
    (0, express_validator_1.body)('daySelections').optional().custom((v) => v && typeof v === 'object' && !Array.isArray(v)),
    (0, express_validator_1.body)('contactName').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('contactMethod').optional().isString().isLength({ max: 32 }),
    (0, express_validator_1.body)('contactValue').optional().isString().isLength({ max: 200 }),
    (0, express_validator_1.body)('attachments').optional().isArray(),
], async (req, res) => {
    if (!ensureAuthed(req, res))
        return;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const userId = req.user.id;
    const requestedId = parseFiniteNumber(req.body?.requestId);
    const requestIdInput = requestedId && requestedId > 0 ? Math.floor(requestedId) : null;
    const update = buildUpdate(req.body);
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        let requestId;
        if (requestIdInput) {
            const [rows] = await conn.execute('SELECT id, status FROM course_requests WHERE id = ? AND user_id = ? LIMIT 1', [requestIdInput, userId]);
            const row = rows?.[0];
            if (!row) {
                await conn.rollback();
                return res.status(404).json({ error: '未找到需求' });
            }
            if (row.status === 'submitted') {
                await conn.rollback();
                return res.status(409).json({ error: '该需求已提交' });
            }
            requestId = row.id;
        }
        else {
            const [ins] = await conn.execute("INSERT INTO course_requests (user_id, status) VALUES (?, 'draft')", [userId]);
            requestId = Number(ins?.insertId);
        }
        await applyUpdate(conn, requestId, userId, update);
        const hasAttachments = hasOwn(req.body, 'attachments');
        if (hasAttachments) {
            const attachments = sanitizeAttachments(req.body.attachments, requestId) || [];
            await conn.execute('DELETE FROM course_request_attachments WHERE request_id = ?', [requestId]);
            for (const att of attachments) {
                await conn.execute(`INSERT INTO course_request_attachments
              (request_id, file_id, original_file_name, ext, content_type, size_bytes, oss_key, file_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [requestId, att.fileId, att.fileName, att.ext, att.contentType, att.sizeBytes, att.ossKey, att.fileUrl]);
            }
        }
        await conn.execute("UPDATE course_requests SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [requestId, userId]);
        await conn.commit();
        return res.json({ requestId });
    }
    catch (e) {
        try {
            await conn.rollback();
        }
        catch { }
        const message = typeof e?.message === 'string' ? e.message : '';
        if (message.includes('course_requests') || message.includes('course_request_attachments')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Submit request error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
    finally {
        conn.release();
    }
});
exports.default = router;
