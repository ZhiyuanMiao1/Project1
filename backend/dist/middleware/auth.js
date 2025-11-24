"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token)
        return res.status(401).json({ error: '未授权' });
    try {
        const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.user = { id: payload.id, role: payload.role };
        return next();
    }
    catch (e) {
        return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
}
