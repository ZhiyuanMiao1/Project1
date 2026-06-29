"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAuthUserFromRequest = readAuthUserFromRequest;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const userStatus_1 = require("../services/userStatus");
async function readAuthUserFromRequest(req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token)
        return { error: { status: 401, message: '未授权' } };
    try {
        const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
        const payload = jsonwebtoken_1.default.verify(token, secret);
        if (await (0, userStatus_1.isUserSuspended)(Number(payload.id))) {
            return { error: { status: 403, message: '账号已被平台暂停使用，请联系 Mentory 支持' } };
        }
        return { user: { id: payload.id, role: payload.role } };
    }
    catch (e) {
        return { error: { status: 401, message: '登录已失效，请重新登录' } };
    }
}
async function requireAuth(req, res, next) {
    const result = await readAuthUserFromRequest(req);
    if (result.error)
        return res.status(result.error.status).json({ error: result.error.message });
    req.user = result.user;
    return next();
}
