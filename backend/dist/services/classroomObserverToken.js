"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyClassroomObserverToken = exports.createClassroomObserverToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const OBSERVER_SCOPE = 'classroom-observer';
const OBSERVER_TOKEN_EXPIRES_IN = '2h';
const getClassroomObserverSecret = () => (process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_secret_change_me');
const createClassroomObserverToken = (courseId, adminId) => (jsonwebtoken_1.default.sign({ scope: OBSERVER_SCOPE, courseId, adminId }, getClassroomObserverSecret(), { expiresIn: OBSERVER_TOKEN_EXPIRES_IN }));
exports.createClassroomObserverToken = createClassroomObserverToken;
const verifyClassroomObserverToken = (token, courseId) => {
    const rawToken = typeof token === 'string' ? token.trim() : '';
    if (!rawToken)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(rawToken, getClassroomObserverSecret());
        const payloadCourseId = Number(payload?.courseId || 0);
        const adminId = Number(payload?.adminId || 0);
        if (payload?.scope !== OBSERVER_SCOPE || payloadCourseId !== courseId || !adminId)
            return null;
        return { courseId: payloadCourseId, adminId };
    }
    catch {
        return null;
    }
};
exports.verifyClassroomObserverToken = verifyClassroomObserverToken;
