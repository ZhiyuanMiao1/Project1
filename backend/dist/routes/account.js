"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const express_validator_1 = require("express-validator");
const router = (0, express_1.Router)();
const parseOrderIds = (value) => {
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            return null;
        const seen = new Set();
        const out = [];
        for (const item of parsed) {
            if (typeof item !== 'string')
                continue;
            const id = item.trim();
            if (!id)
                continue;
            if (id.length > 80)
                continue;
            if (seen.has(id))
                continue;
            seen.add(id);
            out.push(id);
            if (out.length >= 200)
                break;
        }
        return out;
    }
    catch {
        return null;
    }
};
const sanitizeOrderIds = (value) => {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const id = item.trim();
        if (!id)
            continue;
        if (id.length > 80)
            continue;
        if (seen.has(id))
            continue;
        seen.add(id);
        out.push(id);
        if (out.length >= 200)
            break;
    }
    return out;
};
let homeCourseOrderColumnEnsured = false;
const isMissingHomeCourseOrderColumnError = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('home_course_order_json');
};
const ensureHomeCourseOrderColumn = async () => {
    if (homeCourseOrderColumnEnsured)
        return true;
    try {
        await (0, db_1.query)('ALTER TABLE account_settings ADD COLUMN home_course_order_json TEXT NULL');
        homeCourseOrderColumnEnsured = true;
        return true;
    }
    catch (e) {
        const code = String(e?.code || '');
        const message = String(e?.message || '');
        if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
            homeCourseOrderColumnEnsured = true;
            return true;
        }
        return false;
    }
};
let availabilityColumnEnsured = false;
const isMissingAvailabilityColumnError = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('availability_json');
};
const ensureAvailabilityColumn = async () => {
    if (availabilityColumnEnsured)
        return true;
    try {
        await (0, db_1.query)('ALTER TABLE account_settings ADD COLUMN availability_json TEXT NULL');
        availabilityColumnEnsured = true;
        return true;
    }
    catch (e) {
        const code = String(e?.code || '');
        const message = String(e?.message || '');
        if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
            availabilityColumnEnsured = true;
            return true;
        }
        return false;
    }
};
const roundToQuarter = (raw, min = 0.25, max = 10, fallback = 2) => {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n))
        return fallback;
    const clamped = Math.max(min, Math.min(max, n));
    return Number((Math.round(clamped / 0.25) * 0.25).toFixed(2));
};
const mergeBlocksList = (blocks) => {
    if (!Array.isArray(blocks) || blocks.length === 0)
        return [];
    const sorted = blocks
        .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
        .sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];
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
const sanitizeAvailabilityPayload = (raw) => {
    const timeZoneRaw = typeof raw?.timeZone === 'string' ? raw.timeZone.trim() : '';
    const timeZone = timeZoneRaw && timeZoneRaw.length <= 64 ? timeZoneRaw : 'Asia/Shanghai';
    const sessionDurationHours = roundToQuarter(raw?.sessionDurationHours);
    const daySelections = sanitizeDaySelections(raw?.daySelections);
    return { timeZone, sessionDurationHours, daySelections };
};
const parseAvailability = (value) => {
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        const parsed = JSON.parse(value);
        return sanitizeAvailabilityPayload(parsed);
    }
    catch {
        return null;
    }
};
router.get('/ids', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const currentRows = await (0, db_1.query)('SELECT id, email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const current = currentRows[0];
        if (!current)
            return res.status(401).json({ error: '登录状态异常，请重新登录' });
        const userId = current.id;
        const email = current.email;
        let settingsRows = [];
        try {
            settingsRows = await (0, db_1.query)('SELECT email_notifications, home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1', [userId]);
        }
        catch (e) {
            if (!isMissingHomeCourseOrderColumnError(e))
                throw e;
            const ensured = await ensureHomeCourseOrderColumn();
            if (ensured) {
                settingsRows = await (0, db_1.query)('SELECT email_notifications, home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1', [userId]);
            }
            else {
                settingsRows = await (0, db_1.query)('SELECT email_notifications FROM account_settings WHERE user_id = ? LIMIT 1', [userId]);
            }
        }
        let emailNotificationsEnabled = false;
        let homeCourseOrderIds = null;
        if (settingsRows.length === 0) {
            await (0, db_1.query)('INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)', [userId, 1]);
            emailNotificationsEnabled = true;
        }
        else {
            emailNotificationsEnabled = !!settingsRows[0]?.email_notifications;
            homeCourseOrderIds = parseOrderIds(settingsRows[0]?.home_course_order_json);
        }
        const rows = await (0, db_1.query)("SELECT role, public_id, created_at FROM user_roles WHERE user_id = ? AND role IN ('student','mentor')", [userId]);
        let studentId = null;
        let mentorId = null;
        let studentCreatedAt = null;
        let mentorCreatedAt = null;
        for (const row of rows) {
            if (row.role === 'student') {
                studentId = row.public_id;
                studentCreatedAt = row.created_at ?? null;
            }
            if (row.role === 'mentor') {
                mentorId = row.public_id;
                mentorCreatedAt = row.created_at ?? null;
            }
        }
        let degree = null;
        let school = null;
        const profRows = await (0, db_1.query)('SELECT user_id, degree, school, updated_at FROM mentor_profiles WHERE user_id = ? LIMIT 1', [userId]);
        const prof = profRows[0];
        if (prof) {
            degree = typeof prof.degree === 'string' && prof.degree.trim() ? prof.degree : null;
            school = typeof prof.school === 'string' && prof.school.trim() ? prof.school : null;
        }
        return res.json({
            email,
            studentId,
            mentorId,
            degree,
            school,
            studentCreatedAt,
            mentorCreatedAt,
            emailNotificationsEnabled,
            homeCourseOrderIds,
        });
    }
    catch (e) {
        console.error('Account ids error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/profile', auth_1.requireAuth, [
    (0, express_validator_1.body)('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    (0, express_validator_1.body)('school').optional().isString().trim().isLength({ max: 200 }).withMessage('学校无效'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const userId = req.user.id;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const hasDegree = Object.prototype.hasOwnProperty.call(req.body, 'degree');
    const hasSchool = Object.prototype.hasOwnProperty.call(req.body, 'school');
    if (!hasDegree && !hasSchool) {
        return res.status(400).json({ error: '没有可保存的字段' });
    }
    const normalize = (value) => {
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    };
    try {
        const userId = req.user.id;
        const patchDegree = hasDegree ? normalize(req.body.degree) : undefined;
        const patchSchool = hasSchool ? normalize(req.body.school) : undefined;
        const existingRows = await (0, db_1.query)('SELECT degree, school FROM mentor_profiles WHERE user_id = ? LIMIT 1', [userId]);
        const existing = existingRows?.[0] || {};
        const existingDegree = normalize(existing.degree);
        const existingSchool = normalize(existing.school);
        const nextDegree = typeof patchDegree !== 'undefined' ? patchDegree : existingDegree;
        const nextSchool = typeof patchSchool !== 'undefined' ? patchSchool : existingSchool;
        await (0, db_1.query)(`INSERT INTO mentor_profiles (user_id, degree, school)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           degree = VALUES(degree),
           school = VALUES(school),
           updated_at = CURRENT_TIMESTAMP`, [userId, nextDegree, nextSchool]);
        return res.json({ message: '保存成功' });
    }
    catch (e) {
        console.error('Account profile save error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/notifications', auth_1.requireAuth, [
    (0, express_validator_1.body)('emailNotificationsEnabled').isBoolean().withMessage('邮件通知设置无效'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const userId = req.user.id;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { emailNotificationsEnabled } = req.body;
    try {
        await (0, db_1.query)(`INSERT INTO account_settings (user_id, email_notifications)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           email_notifications = VALUES(email_notifications),
           updated_at = CURRENT_TIMESTAMP`, [req.user.id, emailNotificationsEnabled ? 1 : 0]);
        return res.json({ message: '保存成功', emailNotificationsEnabled });
    }
    catch (e) {
        console.error('Account notifications update error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/home-course-order', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        await (0, db_1.query)('INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)', [req.user.id, 1]);
        let rows = [];
        try {
            rows = await (0, db_1.query)('SELECT home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1', [req.user.id]);
        }
        catch (e) {
            if (!isMissingHomeCourseOrderColumnError(e))
                throw e;
            const ensured = await ensureHomeCourseOrderColumn();
            if (ensured) {
                rows = await (0, db_1.query)('SELECT home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1', [req.user.id]);
            }
            else {
                return res.json({ orderIds: null });
            }
        }
        const orderIds = parseOrderIds(rows[0]?.home_course_order_json);
        return res.json({ orderIds });
    }
    catch (e) {
        console.error('Account home course order fetch error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/home-course-order', auth_1.requireAuth, [(0, express_validator_1.body)('orderIds').isArray().withMessage('顺序数据无效')], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { orderIds } = req.body;
    const sanitized = sanitizeOrderIds(orderIds);
    try {
        try {
            await (0, db_1.query)(`INSERT INTO account_settings (user_id, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`, [req.user.id, JSON.stringify(sanitized)]);
        }
        catch (e) {
            if (!isMissingHomeCourseOrderColumnError(e))
                throw e;
            const ensured = await ensureHomeCourseOrderColumn();
            if (!ensured) {
                return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 中的 account_settings 迁移' });
            }
            await (0, db_1.query)(`INSERT INTO account_settings (user_id, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`, [req.user.id, JSON.stringify(sanitized)]);
        }
        return res.json({ message: '保存成功', orderIds: sanitized });
    }
    catch (e) {
        console.error('Account home course order save error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/availability', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        await (0, db_1.query)('INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)', [req.user.id, 1]);
        let rows = [];
        try {
            rows = await (0, db_1.query)('SELECT availability_json FROM account_settings WHERE user_id = ? LIMIT 1', [req.user.id]);
        }
        catch (e) {
            if (!isMissingAvailabilityColumnError(e))
                throw e;
            const ensured = await ensureAvailabilityColumn();
            if (!ensured)
                return res.json({ availability: null });
            rows = await (0, db_1.query)('SELECT availability_json FROM account_settings WHERE user_id = ? LIMIT 1', [req.user.id]);
        }
        const availability = parseAvailability(rows[0]?.availability_json);
        return res.json({ availability });
    }
    catch (e) {
        console.error('Account availability fetch error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/availability', auth_1.requireAuth, [
    (0, express_validator_1.body)('timeZone').isString().trim().isLength({ min: 1, max: 64 }).withMessage('时区无效'),
    (0, express_validator_1.body)('sessionDurationHours').isFloat({ min: 0.25, max: 10 }).withMessage('可约时长无效'),
    (0, express_validator_1.body)('daySelections')
        .custom((value) => value && typeof value === 'object' && !Array.isArray(value))
        .withMessage('时间段数据无效'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const userId = req.user.id;
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const payload = sanitizeAvailabilityPayload(req.body);
    try {
        const write = async () => {
            await (0, db_1.query)(`INSERT INTO account_settings (user_id, availability_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             availability_json = VALUES(availability_json),
             updated_at = CURRENT_TIMESTAMP`, [userId, JSON.stringify(payload)]);
        };
        try {
            await write();
        }
        catch (e) {
            if (!isMissingAvailabilityColumnError(e))
                throw e;
            const ensured = await ensureAvailabilityColumn();
            if (!ensured) {
                return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 中的 account_settings 迁移' });
            }
            await write();
        }
        return res.json({ message: '保存成功', availability: payload });
    }
    catch (e) {
        console.error('Account availability save error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.put('/password', auth_1.requireAuth, [
    (0, express_validator_1.body)('newPassword').isString().isLength({ min: 6 }).withMessage('密码至少6位'),
    (0, express_validator_1.body)('confirmPassword')
        .isString()
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('两次输入的密码不一致'),
], async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { newPassword } = req.body;
    try {
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        const result = await (0, db_1.query)('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
        const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
        if (affected === 0) {
            return res.status(404).json({ error: '未找到账号信息' });
        }
        return res.json({ message: '密码已更新' });
    }
    catch (e) {
        console.error('Account password update error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
