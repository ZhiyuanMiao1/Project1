"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContentDisposition = exports.getRecordingOssClient = exports.getOssClient = void 0;
const ali_oss_1 = __importDefault(require("ali-oss"));
const normalizeRegion = (region) => {
    const clean = (region || '').trim();
    if (!clean)
        return '';
    return clean.startsWith('oss-') ? clean : `oss-${clean}`;
};
let cached = null;
let cachedRecording = null;
let cachedRecordingKey = '';
const getOssClient = () => {
    if (cached)
        return cached;
    const bucket = (process.env.OSS_BUCKET || '').trim();
    const region = normalizeRegion(process.env.OSS_REGION || '');
    const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || '').trim();
    const accessKeySecret = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();
    if (!bucket || !region || !accessKeyId || !accessKeySecret)
        return null;
    cached = new ali_oss_1.default({
        bucket,
        region,
        accessKeyId,
        accessKeySecret,
        secure: true,
    });
    return cached;
};
exports.getOssClient = getOssClient;
const getRecordingOssClient = () => {
    const bucket = (process.env.ALIYUN_ARTC_RECORD_OSS_BUCKET || 'mentory-live-recordings-sg').trim();
    const region = normalizeRegion(process.env.ALIYUN_ARTC_RECORD_REGION || 'ap-southeast-1');
    const accessKeyId = (process.env.ALIYUN_ARTC_RECORD_OSS_ACCESS_KEY_ID
        || process.env.OSS_ACCESS_KEY_ID
        || process.env.ALIYUN_LIVE_API_ACCESS_KEY_ID
        || '').trim();
    const accessKeySecret = (process.env.ALIYUN_ARTC_RECORD_OSS_ACCESS_KEY_SECRET
        || process.env.OSS_ACCESS_KEY_SECRET
        || process.env.ALIYUN_LIVE_API_ACCESS_KEY_SECRET
        || '').trim();
    if (!bucket || !region || !accessKeyId || !accessKeySecret)
        return null;
    const cacheKey = `${bucket}:${region}:${accessKeyId}`;
    if (cachedRecording && cachedRecordingKey === cacheKey)
        return cachedRecording;
    cachedRecording = new ali_oss_1.default({
        bucket,
        region,
        accessKeyId,
        accessKeySecret,
        secure: true,
    });
    cachedRecordingKey = cacheKey;
    return cachedRecording;
};
exports.getRecordingOssClient = getRecordingOssClient;
const buildContentDisposition = (fileName, mode = 'attachment') => {
    const raw = typeof fileName === 'string' ? fileName.trim() : '';
    const safe = raw
        .replace(/[\r\n]+/g, ' ')
        .replace(/[\\"]/g, '_')
        .slice(0, 180) || 'download';
    const encoded = encodeURIComponent(raw || safe).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${mode}; filename="${safe}"; filename*=UTF-8''${encoded}`;
};
exports.buildContentDisposition = buildContentDisposition;
