"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopClassroomRecordingIfIdle = exports.updateClassroomRecordingLayout = exports.startClassroomRecording = exports.getClassroomRecordingStatus = exports.ensureClassroomRecordingsTable = void 0;
const live20161101_1 = __importDefault(require("@alicloud/live20161101"));
const openapi_client_1 = require("@alicloud/openapi-client");
const model_1 = require("@alicloud/live20161101/dist/models/model");
const db_1 = require("../db");
const aliyunRtc_1 = require("./aliyunRtc");
const ACTIVE_RECORDING_STATUSES = ['starting', 'running', 'stopping'];
const MIX_VIDEO_WIDTH = 1280;
const MIX_VIDEO_HEIGHT = 720;
const DEFAULT_MAX_IDLE_SECONDS = 300;
let schemaReadyPromise = null;
let liveClient = null;
let liveClientKey = '';
const safeText = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const parsePositiveInteger = (value, fallback) => {
    const n = Number.parseInt(safeText(value), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const getRecordingRuntime = () => {
    const accessKeyId = safeText(process.env.ALIYUN_LIVE_API_ACCESS_KEY_ID);
    const accessKeySecret = safeText(process.env.ALIYUN_LIVE_API_ACCESS_KEY_SECRET);
    const ossBucket = safeText(process.env.ALIYUN_ARTC_RECORD_OSS_BUCKET) || 'mentory-live-recordings-sg';
    if (!accessKeyId || !accessKeySecret || !ossBucket)
        return null;
    const region = safeText(process.env.ALIYUN_ARTC_RECORD_REGION) || 'ap-southeast-1';
    return {
        accessKeyId,
        accessKeySecret,
        region,
        endpoint: safeText(process.env.ALIYUN_ARTC_RECORD_ENDPOINT) || `live.${region}.aliyuncs.com`,
        ossEndpoint: safeText(process.env.ALIYUN_ARTC_RECORD_OSS_ENDPOINT) || 'oss-ap-southeast-1.aliyuncs.com',
        ossBucket,
        maxIdleSeconds: parsePositiveInteger(process.env.ALIYUN_ARTC_RECORD_MAX_IDLE_SECONDS, DEFAULT_MAX_IDLE_SECONDS),
    };
};
const getLiveClient = (runtime) => {
    const key = `${runtime.accessKeyId}:${runtime.endpoint}:${runtime.region}`;
    if (liveClient && liveClientKey === key)
        return liveClient;
    liveClient = new live20161101_1.default(new openapi_client_1.Config({
        accessKeyId: runtime.accessKeyId,
        accessKeySecret: runtime.accessKeySecret,
        endpoint: runtime.endpoint,
        regionId: runtime.region,
    }));
    liveClientKey = key;
    return liveClient;
};
const ensureClassroomRecordingsTable = async () => {
    if (!schemaReadyPromise) {
        schemaReadyPromise = (0, db_1.query)(`
      CREATE TABLE IF NOT EXISTS classroom_recordings (
        id BIGINT NOT NULL AUTO_INCREMENT,
        course_session_id BIGINT NOT NULL,
        task_id VARCHAR(128) NULL,
        app_id VARCHAR(128) NOT NULL,
        channel_id VARCHAR(128) NOT NULL,
        status ENUM('starting','running','stopping','stopped','failed') NOT NULL DEFAULT 'starting',
        storage_prefix VARCHAR(512) NOT NULL,
        started_by_user_id INT NOT NULL,
        error_message TEXT NULL,
        started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        stop_requested_at TIMESTAMP NULL DEFAULT NULL,
        stopped_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_classroom_recordings_course_status (course_session_id, status),
        KEY idx_classroom_recordings_task (task_id),
        CONSTRAINT fk_classroom_recordings_course FOREIGN KEY (course_session_id) REFERENCES course_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_classroom_recordings_started_by FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).then(() => undefined);
    }
    await schemaReadyPromise;
};
exports.ensureClassroomRecordingsTable = ensureClassroomRecordingsTable;
const extractAliyunErrorMessage = (error) => {
    const candidates = [
        error?.data?.message,
        error?.data?.Message,
        error?.description,
        error?.message,
        error?.code,
    ];
    return candidates.map(safeText).find(Boolean) || '阿里云云端录制调用失败';
};
const getPublicIdsByRole = (context) => {
    const selfRole = context.roleInSession;
    const remoteRole = context.remoteRole;
    return {
        student: selfRole === 'student' ? context.selfUserPublicId : context.remoteUserPublicId,
        mentor: selfRole === 'mentor' ? context.selfUserPublicId : context.remoteUserPublicId,
        byRole: {
            [selfRole]: context.selfUserPublicId,
            [remoteRole]: context.remoteUserPublicId,
        },
    };
};
const buildSubscribeUserIdList = (context) => {
    const { student, mentor } = getPublicIdsByRole(context);
    return [mentor, student].flatMap((userId) => ([
        { userId, sourceType: 0, streamType: 0 },
        { userId, sourceType: 1, streamType: 0 },
    ]));
};
const buildMixLayoutParams = (context, presenceEntries = []) => {
    const { student, mentor, byRole } = getPublicIdsByRole(context);
    const activeScreenEntry = presenceEntries
        .filter((entry) => entry.screenSharing)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0] || null;
    if (activeScreenEntry) {
        const otherRole = activeScreenEntry.role === 'mentor' ? 'student' : 'mentor';
        const otherUserId = byRole[otherRole];
        return {
            userPanes: [
                {
                    userId: activeScreenEntry.publicId,
                    sourceType: 1,
                    x: '0',
                    y: '0',
                    width: '1',
                    height: '1',
                    ZOrder: 0,
                },
                ...(otherUserId ? [{
                        userId: otherUserId,
                        sourceType: 0,
                        x: '0.72',
                        y: '0.68',
                        width: '0.25',
                        height: '0.28',
                        ZOrder: 1,
                    }] : []),
            ],
        };
    }
    return {
        userPanes: [
            {
                userId: mentor,
                sourceType: 0,
                x: '0',
                y: '0',
                width: '0.5',
                height: '1',
                ZOrder: 0,
            },
            {
                userId: student,
                sourceType: 0,
                x: '0.5',
                y: '0',
                width: '0.5',
                height: '1',
                ZOrder: 0,
            },
        ],
    };
};
const buildStartRequest = (context, runtime, presenceEntries) => {
    const liveRuntime = (0, aliyunRtc_1.getAliyunLiveRuntimeConfig)();
    if (!liveRuntime)
        throw new Error('实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY');
    return new model_1.StartRtcCloudRecordingRequest({
        appId: liveRuntime.appId,
        channelId: context.roomId,
        maxIdleTime: runtime.maxIdleSeconds,
        recordParams: {
            recordMode: 1,
            streamType: 0,
            maxFileDuration: 7200,
        },
        mixTranscodeParams: {
            audioBitrate: 128,
            audioChannels: 2,
            audioSampleRate: 48000,
            videoBitrate: 1500,
            videoCodec: 'H.264',
            videoFramerate: 20,
            videoGop: 20,
            videoWidth: MIX_VIDEO_WIDTH,
            videoHeight: MIX_VIDEO_HEIGHT,
        },
        mixLayoutParams: buildMixLayoutParams(context, presenceEntries),
        subscribeParams: {
            subscribeUserIdList: buildSubscribeUserIdList(context),
        },
        storageParams: {
            storageType: 1,
            OSSParams: {
                OSSBucket: runtime.ossBucket,
                OSSEndpoint: runtime.ossEndpoint,
            },
            fileInfo: [
                {
                    format: 'MP4',
                    filePathPrefix: ['classrooms', context.roomId, 'mp4'],
                    fileNamePattern: '{AppId}_{ChannelId}_{StartTime}',
                },
                {
                    format: 'HLS',
                    filePathPrefix: ['classrooms', context.roomId, 'hls'],
                    fileNamePattern: '{AppId}_{ChannelId}_{StartTime}',
                    sliceNamePattern: '{AppId}_{ChannelId}_{StartTime}_{Sequence}',
                    sliceDuration: 30,
                },
            ],
        },
    });
};
const toRecordingPayload = (row) => {
    if (!row)
        return { enabled: false, status: 'idle', taskId: '', storagePrefix: '', errorMessage: '' };
    return {
        enabled: true,
        status: row.status,
        taskId: safeText(row.task_id),
        storagePrefix: safeText(row.storage_prefix),
        errorMessage: safeText(row.error_message),
    };
};
const loadLatestRecording = async (courseId, activeOnly = false) => {
    await (0, exports.ensureClassroomRecordingsTable)();
    const activeFilter = activeOnly
        ? `AND status IN (${ACTIVE_RECORDING_STATUSES.map(() => '?').join(',')})`
        : '';
    const params = [courseId];
    if (activeOnly)
        params.push(...ACTIVE_RECORDING_STATUSES);
    const rows = await (0, db_1.query)(`
    SELECT *
    FROM classroom_recordings
    WHERE course_session_id = ?
      ${activeFilter}
    ORDER BY id DESC
    LIMIT 1
    `, params);
    return rows?.[0] || null;
};
const getClassroomRecordingStatus = async (courseId) => {
    const row = await loadLatestRecording(courseId, false);
    return toRecordingPayload(row);
};
exports.getClassroomRecordingStatus = getClassroomRecordingStatus;
const startClassroomRecording = async (context, startedByUserId, presenceEntries = []) => {
    await (0, exports.ensureClassroomRecordingsTable)();
    const existing = await loadLatestRecording(context.courseId, true);
    if (existing)
        return toRecordingPayload(existing);
    const runtime = getRecordingRuntime();
    if (!runtime)
        throw new Error('ARTC 云端录制配置缺失，请检查 ALIYUN_LIVE_API_ACCESS_KEY_ID / ALIYUN_LIVE_API_ACCESS_KEY_SECRET / ALIYUN_ARTC_RECORD_OSS_BUCKET');
    const liveRuntime = (0, aliyunRtc_1.getAliyunLiveRuntimeConfig)();
    if (!liveRuntime)
        throw new Error('实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY');
    const storagePrefix = `classrooms/${context.roomId}`;
    const insertResult = await (0, db_1.query)(`
    INSERT INTO classroom_recordings
      (course_session_id, app_id, channel_id, status, storage_prefix, started_by_user_id)
    VALUES (?, ?, ?, 'starting', ?, ?)
    `, [context.courseId, liveRuntime.appId, context.roomId, storagePrefix, startedByUserId]);
    const recordingId = Number(insertResult.insertId);
    try {
        const response = await getLiveClient(runtime).startRtcCloudRecording(buildStartRequest(context, runtime, presenceEntries));
        const taskId = safeText(response?.body?.taskId);
        if (!taskId)
            throw new Error('阿里云云端录制未返回 TaskId');
        await (0, db_1.query)(`
      UPDATE classroom_recordings
      SET task_id = ?, status = 'running', error_message = NULL
      WHERE id = ?
      `, [taskId, recordingId]);
        return {
            enabled: true,
            status: 'running',
            taskId,
            storagePrefix,
            errorMessage: '',
        };
    }
    catch (error) {
        const message = extractAliyunErrorMessage(error);
        await (0, db_1.query)(`
      UPDATE classroom_recordings
      SET status = 'failed', error_message = ?
      WHERE id = ?
      `, [message, recordingId]);
        throw new Error(message);
    }
};
exports.startClassroomRecording = startClassroomRecording;
const updateClassroomRecordingLayout = async (context, presenceEntries) => {
    const active = await loadLatestRecording(context.courseId, true);
    const taskId = safeText(active?.task_id);
    if (!active || !taskId || active.status !== 'running')
        return;
    const runtime = getRecordingRuntime();
    if (!runtime)
        return;
    try {
        await getLiveClient(runtime).updateRtcCloudRecording(new model_1.UpdateRtcCloudRecordingRequest({
            taskId,
            subscribeParams: {
                subscribeUserIdList: buildSubscribeUserIdList(context),
            },
            mixLayoutParams: buildMixLayoutParams(context, presenceEntries),
        }));
    }
    catch (error) {
        const message = extractAliyunErrorMessage(error);
        await (0, db_1.query)(`UPDATE classroom_recordings SET error_message = ? WHERE id = ?`, [message, active.id]);
        console.error('ARTC cloud recording layout update failed:', message);
    }
};
exports.updateClassroomRecordingLayout = updateClassroomRecordingLayout;
const stopClassroomRecordingIfIdle = async (context, activePresenceCount) => {
    if (activePresenceCount > 0)
        return;
    const active = await loadLatestRecording(context.courseId, true);
    const taskId = safeText(active?.task_id);
    if (!active || !taskId || active.status === 'stopping')
        return;
    await (0, db_1.query)(`
    UPDATE classroom_recordings
    SET status = 'stopping', stop_requested_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `, [active.id]);
    const runtime = getRecordingRuntime();
    if (!runtime)
        return;
    try {
        await getLiveClient(runtime).stopRtcCloudRecording(new model_1.StopRtcCloudRecordingRequest({ taskId }));
        await (0, db_1.query)(`
      UPDATE classroom_recordings
      SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP, error_message = NULL
      WHERE id = ?
      `, [active.id]);
    }
    catch (error) {
        const message = extractAliyunErrorMessage(error);
        await (0, db_1.query)(`
      UPDATE classroom_recordings
      SET status = 'failed', error_message = ?
      WHERE id = ?
      `, [message, active.id]);
        console.error('ARTC cloud recording stop failed:', message);
    }
};
exports.stopClassroomRecordingIfIdle = stopClassroomRecordingIfIdle;
