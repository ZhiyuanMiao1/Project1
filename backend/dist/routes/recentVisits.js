"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const router = (0, express_1.Router)();
const normalizeRole = (value, fallback) => {
    return value === 'mentor' || value === 'student' ? value : fallback;
};
const getUserById = async (userId) => {
    const rows = await (0, db_1.query)('SELECT id, email, username FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
};
async function resolveTargetUser(req, res, requestedRole) {
    if (!req.user) {
        res.status(401).json({ error: '未授权' });
        return null;
    }
    try {
        const current = await getUserById(req.user.id);
        if (!current) {
            res.status(401).json({ error: '登录状态异常，请重新登录' });
            return null;
        }
        const roleRows = await (0, db_1.query)('SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1', [current.id, requestedRole]);
        if (!roleRows.length) {
            if (requestedRole === 'student') {
                try {
                    await (0, db_1.query)('INSERT IGNORE INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, ?, ?, ?)', [current.id, 'student', 0, '']);
                    return { userId: current.id, role: 'student' };
                }
                catch (err) {
                    console.error('Auto-create student role failed:', err);
                    res.status(500).json({ error: '服务器错误，请稍后再试' });
                    return null;
                }
            }
            res.status(403).json({ error: '当前账号未开通导师身份', reason: 'role_not_available' });
            return null;
        }
        if (requestedRole === 'mentor') {
            const approved = roleRows[0]?.mentor_approved === 1 || roleRows[0]?.mentor_approved === true;
            if (!approved) {
                res.status(403).json({ error: '导师审核中，暂不可使用导师最近浏览', reason: 'mentor_not_approved' });
                return null;
            }
        }
        return { userId: current.id, role: requestedRole };
    }
    catch (e) {
        console.error('Resolve target user failed:', e);
        res.status(500).json({ error: '服务器错误，请稍后再试' });
        return null;
    }
}
const parsePayload = (raw) => {
    if (!raw)
        return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    catch {
        return null;
    }
};
router.post('/record', auth_1.requireAuth, [
    (0, express_validator_1.body)('role').optional().isIn(['student', 'mentor']).withMessage('角色无效'),
    (0, express_validator_1.body)('itemType').isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    (0, express_validator_1.body)('itemId').isString().trim().isLength({ min: 1, max: 100 }).withMessage('itemId无效'),
    (0, express_validator_1.body)('payload').optional(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { itemType, itemId, payload } = req.body;
    const requestedRole = normalizeRole(req.body.role, req.user.role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target)
        return;
    try {
        const payloadJson = typeof payload === 'undefined' ? null : JSON.stringify(payload);
        const result = await (0, db_1.query)(`INSERT INTO recent_visits (user_id, role, item_type, item_id, payload_json, visited_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           payload_json = COALESCE(VALUES(payload_json), payload_json),
           visited_at = CURRENT_TIMESTAMP`, [target.userId, target.role, itemType.trim(), itemId.trim(), payloadJson]);
        const rows = await (0, db_1.query)(`SELECT id, role, item_type, item_id, payload_json, visited_at, created_at, updated_at
         FROM recent_visits
         WHERE id = ?
         LIMIT 1`, [result.insertId]);
        const row = rows[0];
        return res.status(201).json({
            visit: row
                ? {
                    id: row.id,
                    role: row.role,
                    itemType: row.item_type,
                    itemId: String(row.item_id),
                    payload: parsePayload(row.payload_json),
                    visitedAt: row.visited_at,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                }
                : {
                    id: result.insertId,
                    role: target.role,
                    itemType: itemType.trim(),
                    itemId: itemId.trim(),
                    payload: payload ?? null,
                },
        });
    }
    catch (e) {
        console.error('Record recent visit error:', e);
        const message = String(e?.message || '');
        if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/items', auth_1.requireAuth, [
    (0, express_validator_1.query)('role').optional().isIn(['student', 'mentor']),
    (0, express_validator_1.query)('itemType').optional().isString().trim().isLength({ min: 1, max: 50 }).withMessage('itemType无效'),
    (0, express_validator_1.query)('limit').optional().isInt({ gt: 0, lt: 51 }).withMessage('limit无效'),
    (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }).withMessage('offset无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const requestedRole = normalizeRole(req.query.role, req.user.role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target)
        return;
    const itemType = typeof req.query.itemType === 'string' ? req.query.itemType.trim() : '';
    const limitRaw = Number.parseInt(String(req.query.limit ?? '10'), 10);
    const offsetRaw = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    try {
        const params = [target.userId, target.role];
        const where = ['user_id = ?', 'role = ?'];
        if (itemType) {
            where.push('item_type = ?');
            params.push(itemType);
        }
        const rows = await (0, db_1.query)(`SELECT id, role, item_type, item_id, payload_json, visited_at, created_at, updated_at
         FROM recent_visits
         WHERE ${where.join(' AND ')}
         ORDER BY visited_at DESC, id DESC
         LIMIT ${limit + 1} OFFSET ${offset}`, params);
        const hasMore = rows.length > limit;
        const sliced = hasMore ? rows.slice(0, limit) : rows;
        const items = sliced.map((row) => ({
            id: row.id,
            role: row.role,
            itemType: row.item_type,
            itemId: String(row.item_id),
            payload: parsePayload(row.payload_json),
            visitedAt: row.visited_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        return res.json({
            items,
            pagination: {
                limit,
                offset,
                nextOffset: offset + items.length,
                hasMore,
            },
        });
    }
    catch (e) {
        console.error('List recent visits error:', e);
        const message = String(e?.message || '');
        if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.delete('/items/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isInt({ gt: 0 }).withMessage('最近浏览ID无效')], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const id = Number(req.params.id);
    try {
        const rows = await (0, db_1.query)('SELECT id, user_id, role FROM recent_visits WHERE id = ? LIMIT 1', [id]);
        const found = rows[0];
        if (!found) {
            return res.status(404).json({ error: '未找到该最近浏览记录' });
        }
        const target = await resolveTargetUser(req, res, normalizeRole(found.role, req.user.role));
        if (!target)
            return;
        if (found.user_id !== target.userId || found.role !== target.role) {
            return res.status(404).json({ error: '未找到该最近浏览记录' });
        }
        await (0, db_1.query)('DELETE FROM recent_visits WHERE id = ? AND user_id = ?', [id, target.userId]);
        return res.json({ message: '最近浏览已删除', id });
    }
    catch (e) {
        console.error('Delete recent visit error:', e);
        const message = String(e?.message || '');
        if (e?.code === 'ER_NO_SUCH_TABLE' || message.includes('recent_visits')) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
