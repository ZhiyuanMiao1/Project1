"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReplayMp4ObjectPrefix = exports.toRecordingDisplayFileName = exports.buildRecordingHlsPrefix = exports.buildRecordingMp4Prefix = void 0;
const normalizePrefix = (value) => (typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : '');
const buildRecordingMp4Prefix = (roomId) => (`recordings/mp4/${roomId}`);
exports.buildRecordingMp4Prefix = buildRecordingMp4Prefix;
const buildRecordingHlsPrefix = (roomId) => (`recordings/hls/${roomId}`);
exports.buildRecordingHlsPrefix = buildRecordingHlsPrefix;
const toRecordingDisplayFileName = (fileName) => {
    const courseChannelIndex = fileName.indexOf('_course_');
    return courseChannelIndex >= 0 ? fileName.slice(courseChannelIndex + 1) : fileName;
};
exports.toRecordingDisplayFileName = toRecordingDisplayFileName;
const resolveReplayMp4ObjectPrefix = (storagePrefix) => {
    const normalizedPrefix = normalizePrefix(storagePrefix);
    if (!normalizedPrefix)
        return '';
    const mp4Directory = normalizedPrefix.startsWith('recordings/mp4/')
        ? normalizedPrefix
        : `${normalizedPrefix}/mp4`;
    return `${mp4Directory}/`;
};
exports.resolveReplayMp4ObjectPrefix = resolveReplayMp4ObjectPrefix;
