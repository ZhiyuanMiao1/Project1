"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAliyunRtcRuntimeConfig = getAliyunRtcRuntimeConfig;
exports.createAliRtcAuthInfo = createAliRtcAuthInfo;
const crypto_1 = __importDefault(require("crypto"));
const safeTrim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
function getAliyunRtcRuntimeConfig() {
    const appId = safeTrim(process.env.ALIYUN_RTC_APP_ID);
    const appKey = safeTrim(process.env.ALIYUN_RTC_APP_KEY);
    if (!appId || !appKey)
        return null;
    return { appId, appKey };
}
function createAliRtcAuthInfo(params) {
    const appId = safeTrim(params.appId);
    const appKey = safeTrim(params.appKey);
    const channelId = safeTrim(params.channelId);
    const userId = safeTrim(params.userId);
    const timestamp = Number.isFinite(params.timestamp) && params.timestamp > 0
        ? Math.floor(params.timestamp)
        : Math.floor(Date.now() / 1000);
    const role = params.role || 'pub';
    const tokenSeed = `${appId}${appKey}${channelId}${userId}${timestamp}`;
    const token = crypto_1.default.createHash('sha256').update(tokenSeed).digest('hex');
    return {
        appId,
        channelId,
        userId,
        timestamp,
        token,
        role,
    };
}
