"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const express_validator_1 = require("express-validator");
const router = (0, express_1.Router)();
// GET /api/mentor/permissions
// Check mentor permissions (e.g., can edit profile card)
router.get('/permissions', auth_1.requireAuth, async (req, res) => {
    const role = req.user?.role;
    if (role !== 'mentor') {
        return res.status(403).json({ error: '仅导师可访问', canEditProfile: false, reason: 'not_mentor' });
    }
    try {
        const rows = await (0, db_1.query)('SELECT mentor_approved FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
        if (!approved) {
            return res.status(403).json({ error: '导师审核中，暂不可编辑个人名片', canEditProfile: false, reason: 'pending_review' });
        }
        return res.json({ canEditProfile: true });
    }
    catch (e) {
        return res.status(500).json({ error: '服务器错误，请稍后再试', canEditProfile: false });
    }
});
// GET /api/mentor/cards — only mentors can access
router.get('/cards', auth_1.requireAuth, async (req, res) => {
    const role = req.user?.role;
    if (role !== 'mentor') {
        return res.status(403).json({ error: '仅导师可访问' });
    }
    // 审核 gating：仅审核通过的导师可查看卡片
    try {
        const rows = await (0, db_1.query)('SELECT mentor_approved FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
        if (!approved) {
            return res.status(403).json({ error: '导师审核中' });
        }
    }
    catch (e) {
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
    // Demo data; replace with DB query if needed
    const cards = [
        { id: 1, degree: 'PhD', school: '哈佛大学', courses: ['编程基础'], timezone: 'UTC+8 (北京)', expectedDuration: '2小时', expectedTime: '2025-02-01', courseType: '选课指导' },
        { id: 2, degree: '硕士', school: '斯坦福大学', courses: ['机器学习'], timezone: 'UTC-7 (加州)', expectedDuration: '1.5小时', expectedTime: '2025-02-02', courseType: '作业项目' },
        { id: 3, degree: '硕士', school: '麻省理工学院', courses: ['数据结构与算法'], timezone: 'UTC-5 (纽约)', expectedDuration: '2小时', expectedTime: '2025-02-03', courseType: '课前预习' },
        { id: 4, degree: 'PhD', school: '牛津大学', courses: ['AI 大模型'], timezone: 'UTC+0 (伦敦)', expectedDuration: '2小时', expectedTime: '2025-02-04', courseType: '期末复习' },
        { id: 5, degree: '硕士', school: '剑桥大学', courses: ['数据分析'], timezone: 'UTC+1 (柏林)', expectedDuration: '1小时', expectedTime: '2025-02-05', courseType: '选课指导' },
        { id: 6, degree: 'PhD', school: '清华大学', courses: ['高等数学'], timezone: 'UTC+8 (北京)', expectedDuration: '2小时', expectedTime: '2025-02-06', courseType: '作业项目' },
        { id: 7, degree: '硕士', school: '北京大学', courses: ['概率与统计'], timezone: 'UTC+8 (北京)', expectedDuration: '1.5小时', expectedTime: '2025-02-07', courseType: '课前预习' },
        { id: 8, degree: 'PhD', school: '加州大学伯克利分校', courses: ['软件工程'], timezone: 'UTC-8 (加州)', expectedDuration: '2小时', expectedTime: '2025-02-08', courseType: '毕业论文' },
        { id: 9, degree: '硕士', school: '帝国理工学院', courses: ['物理学'], timezone: 'UTC+0 (伦敦)', expectedDuration: '2小时', expectedTime: '2025-02-09', courseType: '其它类型' },
        { id: 10, degree: '硕士', school: '多伦多大学', courses: ['生命科学'], timezone: 'UTC-5 (多伦多)', expectedDuration: '1小时', expectedTime: '2025-02-10', courseType: '选课指导' },
        { id: 11, degree: 'PhD', school: '苏黎世联邦理工', courses: ['网络安全'], timezone: 'UTC+1 (苏黎世)', expectedDuration: '1.5小时', expectedTime: '2025-02-11', courseType: '作业项目' },
        { id: 12, degree: '硕士', school: '新加坡国立大学', courses: ['经济学'], timezone: 'UTC+8 (新加坡)', expectedDuration: '2小时', expectedTime: '2025-02-12', courseType: '课前预习' },
    ];
    return res.json({ cards });
});
// ===== Mentor Profile: CRUD (create/update via upsert, get) =====
// GET /api/mentor/profile
router.get('/profile', auth_1.requireAuth, async (req, res) => {
    if (req.user?.role !== 'mentor')
        return res.status(403).json({ error: '仅导师可访问' });
    try {
        const rows = await (0, db_1.query)('SELECT mentor_approved FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
        if (!approved)
            return res.status(403).json({ error: '导师审核中' });
        const prof = await (0, db_1.query)('SELECT user_id, display_name, gender, degree, school, timezone, courses_json, avatar_url, updated_at FROM mentor_profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
        if (prof.length === 0)
            return res.json({ profile: null });
        const row = prof[0];
        let courses = [];
        try {
            courses = row.courses_json ? JSON.parse(row.courses_json) : [];
        }
        catch {
            courses = [];
        }
        return res.json({
            profile: {
                displayName: row.display_name || '',
                gender: row.gender || '',
                degree: row.degree || '',
                school: row.school || '',
                timezone: row.timezone || '',
                courses,
                avatarUrl: row.avatar_url || null,
                updatedAt: row.updated_at,
            }
        });
    }
    catch (e) {
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
// PUT /api/mentor/profile
router.put('/profile', auth_1.requireAuth, [
    (0, express_validator_1.body)('displayName').optional().isString().isLength({ max: 100 }),
    (0, express_validator_1.body)('gender').optional().isIn(['男', '女', '']).withMessage('性别无效'),
    (0, express_validator_1.body)('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    (0, express_validator_1.body)('school').optional().isString().isLength({ max: 200 }),
    (0, express_validator_1.body)('timezone').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.body)('courses').optional().isArray().custom((arr) => arr.every((s) => typeof s === 'string' && s.length <= 100)).withMessage('课程需为字符串数组'),
    (0, express_validator_1.body)('avatarUrl').optional({ nullable: true }).isString().isLength({ max: 500 }),
], async (req, res) => {
    if (req.user?.role !== 'mentor')
        return res.status(403).json({ error: '仅导师可访问' });
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // 审核 gating
        const rows = await (0, db_1.query)('SELECT mentor_approved FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
        if (!approved)
            return res.status(403).json({ error: '导师审核中，暂不可保存' });
        const { displayName, gender, degree, school, timezone, courses, avatarUrl, } = req.body;
        // Merge update: unspecified fields keep existing values.
        const existingRows = await (0, db_1.query)('SELECT display_name, gender, degree, school, timezone, courses_json, avatar_url FROM mentor_profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
        const existing = existingRows?.[0] || {};
        let existingCourses = [];
        try {
            existingCourses = existing.courses_json ? JSON.parse(existing.courses_json) : [];
        }
        catch {
            existingCourses = [];
        }
        const nextDisplayName = (Object.prototype.hasOwnProperty.call(req.body, 'displayName') ? displayName : (existing.display_name || ''));
        const nextGender = (Object.prototype.hasOwnProperty.call(req.body, 'gender') ? gender : (existing.gender || ''));
        const nextDegree = (Object.prototype.hasOwnProperty.call(req.body, 'degree') ? degree : (existing.degree || ''));
        const nextSchool = (Object.prototype.hasOwnProperty.call(req.body, 'school') ? school : (existing.school || ''));
        const nextTimezone = (Object.prototype.hasOwnProperty.call(req.body, 'timezone') ? timezone : (existing.timezone || ''));
        const nextCourses = Object.prototype.hasOwnProperty.call(req.body, 'courses') ? (courses || []) : (Array.isArray(existingCourses) ? existingCourses : []);
        const nextAvatarUrl = Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl') ? (avatarUrl ?? null) : (existing.avatar_url ?? null);
        const coursesJson = JSON.stringify((nextCourses || []).filter(Boolean));
        // Upsert by user_id
        await (0, db_1.query)(`INSERT INTO mentor_profiles (user_id, display_name, gender, degree, school, timezone, courses_json, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            gender = VALUES(gender),
            degree = VALUES(degree),
            school = VALUES(school),
            timezone = VALUES(timezone),
            courses_json = VALUES(courses_json),
            avatar_url = VALUES(avatar_url),
            updated_at = CURRENT_TIMESTAMP`, [req.user.id, nextDisplayName, nextGender || null, nextDegree || null, nextSchool || null, nextTimezone || null, coursesJson, nextAvatarUrl]);
        return res.json({ message: '保存成功' });
    }
    catch (e) {
        console.error('Save mentor profile error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
