"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminJwtSecret = void 0;
exports.requireAdminAuth = requireAdminAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const getAdminJwtSecret = () => process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_secret_change_me';
exports.getAdminJwtSecret = getAdminJwtSecret;
async function requireAdminAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token)
        return res.status(401).json({ error: '后台未登录' });
    try {
        const payload = jsonwebtoken_1.default.verify(token, (0, exports.getAdminJwtSecret)());
        const adminId = Number(payload?.adminId || 0);
        if (!adminId || payload?.scope !== 'admin')
            return res.status(401).json({ error: '后台登录已失效' });
        const rows = await (0, db_1.query)('SELECT id, username, is_active FROM admin_users WHERE id = ? LIMIT 1', [adminId]);
        const admin = rows?.[0];
        if (!admin || !(admin.is_active === 1 || admin.is_active === true)) {
            return res.status(401).json({ error: '后台账号不可用' });
        }
        req.admin = { adminId: Number(admin.id), username: String(admin.username || '') };
        return next();
    }
    catch (error) {
        return res.status(401).json({ error: '后台登录已失效' });
    }
}
