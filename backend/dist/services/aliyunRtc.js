"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAliRtcAuthInfo = exports.getAliyunRtcRuntimeConfig = void 0;
exports.getAliyunLiveRuntimeConfig = getAliyunLiveRuntimeConfig;
exports.createAliyunLiveStreamAuthInfo = createAliyunLiveStreamAuthInfo;
const crypto_1 = __importDefault(require("crypto"));
const MAX_IDENTIFIER_LENGTH = 64;
const LIVE_PUSH_PREFIX = 'artc://live.aliyun.com/push';
const LIVE_PLAY_PREFIX = 'artc://live.aliyun.com/play';
const APP_ID_ENV_NAMES = [
    'ALIYUN_LIVE_ARTC_APP_ID',
    'ALIYUN_ARTC_APP_ID',
    'ALIYUN_LIVE_APP_ID',
    'ALIYUN_RTC_APP_ID',
];
const APP_KEY_ENV_NAMES = [
    'ALIYUN_LIVE_ARTC_APP_KEY',
    'ALIYUN_ARTC_APP_KEY',
    'ALIYUN_LIVE_APP_KEY',
    'ALIYUN_RTC_APP_KEY',
];
const safeTrim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const readFirstEnv = (names) => {
    for (const name of names) {
        const value = safeTrim(process.env[name]);
        if (value)
            return value;
    }
    return '';
};
const normalizeRoomId = (value, fallback) => {
    const normalized = safeTrim(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_IDENTIFIER_LENGTH);
    return normalized || fallback;
};
const normalizeUserId = (value, fallback) => {
    const normalized = safeTrim(value).replace(/[^A-Za-z0-9_=-]/g, '_').slice(0, MAX_IDENTIFIER_LENGTH);
    return normalized || fallback;
};
const buildLiveQuery = (params) => {
    const query = new URLSearchParams();
    query.set('sdkAppId', params.appId);
    query.set('userId', params.userId);
    if (params.nonce)
        query.set('nonce', params.nonce);
    query.set('timestamp', String(params.timestamp));
    query.set('token', params.token);
    return query.toString();
};
const buildLiveUrl = (prefix, params) => `${prefix}/${params.roomId}?${buildLiveQuery(params)}`;
function getAliyunLiveRuntimeConfig() {
    const appId = readFirstEnv(APP_ID_ENV_NAMES);
    const appKey = readFirstEnv(APP_KEY_ENV_NAMES);
    if (!appId || !appKey)
        return null;
    return { appId, appKey };
}
function createAliyunLiveStreamAuthInfo(params) {
    const appId = safeTrim(params.appId);
    const appKey = safeTrim(params.appKey);
    const roomId = normalizeRoomId(params.roomId, 'room');
    const userId = normalizeUserId(params.userId, 'user');
    const nonce = safeTrim(params.nonce);
    const timestamp = Number.isFinite(params.timestamp) && params.timestamp > 0
        ? Math.floor(params.timestamp)
        : Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const tokenSeed = `${appId}${appKey}${roomId}${userId}${nonce}${timestamp}`;
    const token = crypto_1.default.createHash('sha256').update(tokenSeed).digest('hex');
    return {
        appId,
        roomId,
        userId,
        nonce,
        timestamp,
        token,
        pushUrl: buildLiveUrl(LIVE_PUSH_PREFIX, {
            appId,
            roomId,
            userId,
            nonce,
            timestamp,
            token,
        }),
        playUrl: buildLiveUrl(LIVE_PLAY_PREFIX, {
            appId,
            roomId,
            userId,
            nonce,
            timestamp,
            token,
        }),
    };
}
exports.getAliyunRtcRuntimeConfig = getAliyunLiveRuntimeConfig;
exports.createAliRtcAuthInfo = createAliyunLiveStreamAuthInfo;
