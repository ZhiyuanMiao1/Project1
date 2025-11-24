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
    const rows = await (0, db_1.query)('SELECT id, email, role, mentor_approved FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
};
/**
 * 根据当前登录用户 + 请求的 role 决定操作哪个身份的收藏
 * - 若请求的 role 与当前 token 相同，直接用当前用户
 * - 若不同，则基于 email 查找同邮箱下的对应身份账号（为方便用户无需重新登录）
 * - 导师身份仍需通过审核
 */
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
        if (current.role === requestedRole) {
            if (requestedRole === 'mentor') {
                const approved = current.mentor_approved === 1 || current.mentor_approved === true;
                if (!approved) {
                    res.status(403).json({ error: '导师审核中，暂不可使用导师收藏', reason: 'mentor_not_approved' });
                    return null;
                }
            }
            return { userId: current.id, role: current.role };
        }
        // 查找同邮箱的另一身份账号，让用户无需切换登录
        const siblings = await (0, db_1.query)('SELECT id, email, role, mentor_approved FROM users WHERE email = ? AND role = ? LIMIT 1', [current.email, requestedRole]);
        if (!siblings.length) {
            const msg = requestedRole === 'mentor' ? '当前账号未开通导师身份' : '当前账号未开通学生身份';
            res.status(403).json({ error: msg, reason: 'role_not_available' });
            return null;
        }
        const target = siblings[0];
        if (requestedRole === 'mentor') {
            const approved = target.mentor_approved === 1 || target.mentor_approved === true;
            if (!approved) {
                res.status(403).json({ error: '导师审核中，暂不可使用导师收藏', reason: 'mentor_not_approved' });
                return null;
            }
        }
        return { userId: target.id, role: target.role };
    }
    catch (e) {
        console.error('Resolve target user failed:', e);
        res.status(500).json({ error: '服务器错误，请稍后再试' });
        return null;
    }
}
// 获取收藏夹列表（按身份隔离）
router.get('/collections', auth_1.requireAuth, [(0, express_validator_1.query)('role').optional().isIn(['student', 'mentor'])], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const requestedRole = normalizeRole(req.query.role, req.user.role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target)
        return;
    try {
        const rows = await (0, db_1.query)(`SELECT id, name, role, created_at
         FROM favorite_collections
         WHERE user_id = ? AND role = ?
         ORDER BY created_at DESC, id DESC`, [target.userId, target.role]);
        const collections = rows.map((row) => ({
            id: row.id,
            name: row.name,
            role: row.role,
            createdAt: row.created_at,
        }));
        return res.json({ collections });
    }
    catch (e) {
        console.error('List favorite collections error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
// 创建收藏夹
router.post('/collections', auth_1.requireAuth, [
    (0, express_validator_1.body)('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('收藏夹名称长度需在1-100之间'),
    (0, express_validator_1.body)('role').optional().isIn(['student', 'mentor']).withMessage('角色无效'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name } = req.body;
    const requestedRole = normalizeRole(req.body.role, req.user.role);
    const target = await resolveTargetUser(req, res, requestedRole);
    if (!target)
        return;
    try {
        const result = await (0, db_1.query)('INSERT INTO favorite_collections (user_id, role, name) VALUES (?, ?, ?)', [target.userId, target.role, name.trim()]);
        const rows = await (0, db_1.query)('SELECT id, name, role, created_at FROM favorite_collections WHERE id = ? LIMIT 1', [result.insertId]);
        const created = rows[0] || null;
        return res.status(201).json({
            message: '收藏夹已创建',
            collection: created
                ? {
                    id: created.id,
                    name: created.name,
                    role: created.role,
                    createdAt: created.created_at,
                }
                : {
                    id: result.insertId,
                    name,
                    role: requestedRole,
                    createdAt: new Date().toISOString(),
                },
        });
    }
    catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '同名收藏夹已存在' });
        }
        console.error('Create favorite collection error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
// 删除收藏夹
router.delete('/collections/:id', auth_1.requireAuth, [(0, express_validator_1.param)('id').isInt({ gt: 0 }).withMessage('收藏夹ID无效')], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const id = Number(req.params.id);
    try {
        const rows = await (0, db_1.query)('SELECT id, user_id, role FROM favorite_collections WHERE id = ? LIMIT 1', [id]);
        const found = rows[0];
        if (!found) {
            return res.status(404).json({ error: '未找到该收藏夹' });
        }
        const target = await resolveTargetUser(req, res, normalizeRole(found.role, req.user.role));
        if (!target)
            return;
        if (found.user_id !== target.userId || found.role !== target.role) {
            return res.status(404).json({ error: '未找到该收藏夹' });
        }
        await (0, db_1.query)('DELETE FROM favorite_collections WHERE id = ? AND user_id = ?', [id, target.userId]);
        return res.json({ message: '收藏夹已删除', id });
    }
    catch (e) {
        console.error('Delete favorite collection error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
