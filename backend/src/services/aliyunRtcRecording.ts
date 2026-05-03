import LiveClient from '@alicloud/live20161101';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import {
  StartRtcCloudRecordingRequest,
  StopRtcCloudRecordingRequest,
  UpdateRtcCloudRecordingRequest,
} from '@alicloud/live20161101/dist/models/model';
import type { ResultSetHeader } from 'mysql2';
import { query as dbQuery } from '../db';
import type { AuthorizedClassroomContext, SessionRole } from './classroomAccess';
import { getAliyunLiveRuntimeConfig } from './aliyunRtc';

export type ClassroomRecordingStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export type ClassroomRecordingPresenceEntry = {
  publicId: string;
  role: SessionRole;
  lastSeenAt: number;
  screenSharing: boolean;
};

type ClassroomRecordingRow = {
  id: number | string;
  course_session_id: number | string;
  task_id: string | null;
  app_id: string;
  channel_id: string;
  status: ClassroomRecordingStatus;
  storage_prefix: string;
  error_message: string | null;
  started_at: Date | string | null;
  stopped_at: Date | string | null;
};

type AliyunRtcRecordingRuntime = {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  endpoint: string;
  ossEndpoint: string;
  ossBucket: string;
  maxIdleSeconds: number;
};

const ACTIVE_RECORDING_STATUSES: ClassroomRecordingStatus[] = ['starting', 'running', 'stopping'];
const MIX_VIDEO_WIDTH = 1280;
const MIX_VIDEO_HEIGHT = 720;
const DEFAULT_MAX_IDLE_SECONDS = 300;

let schemaReadyPromise: Promise<void> | null = null;
let liveClient: LiveClient | null = null;
let liveClientKey = '';

const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parsePositiveInteger = (value: unknown, fallback: number) => {
  const n = Number.parseInt(safeText(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const getRecordingRuntime = (): AliyunRtcRecordingRuntime | null => {
  const accessKeyId = safeText(process.env.ALIYUN_LIVE_API_ACCESS_KEY_ID);
  const accessKeySecret = safeText(process.env.ALIYUN_LIVE_API_ACCESS_KEY_SECRET);
  const ossBucket = safeText(process.env.ALIYUN_ARTC_RECORD_OSS_BUCKET) || 'mentory-live-recordings-sg';
  if (!accessKeyId || !accessKeySecret || !ossBucket) return null;

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

const getLiveClient = (runtime: AliyunRtcRecordingRuntime) => {
  const key = `${runtime.accessKeyId}:${runtime.endpoint}:${runtime.region}`;
  if (liveClient && liveClientKey === key) return liveClient;

  liveClient = new LiveClient(new OpenApiConfig({
    accessKeyId: runtime.accessKeyId,
    accessKeySecret: runtime.accessKeySecret,
    endpoint: runtime.endpoint,
    regionId: runtime.region,
  }));
  liveClientKey = key;
  return liveClient;
};

export const ensureClassroomRecordingsTable = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = dbQuery(`
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

const extractAliyunErrorMessage = (error: any) => {
  const candidates = [
    error?.data?.message,
    error?.data?.Message,
    error?.description,
    error?.message,
    error?.code,
  ];
  return candidates.map(safeText).find(Boolean) || '阿里云云端录制调用失败';
};

const getPublicIdsByRole = (context: AuthorizedClassroomContext) => {
  const selfRole = context.roleInSession;
  const remoteRole = context.remoteRole;
  return {
    student: selfRole === 'student' ? context.selfUserPublicId : context.remoteUserPublicId,
    mentor: selfRole === 'mentor' ? context.selfUserPublicId : context.remoteUserPublicId,
    byRole: {
      [selfRole]: context.selfUserPublicId,
      [remoteRole]: context.remoteUserPublicId,
    } as Record<SessionRole, string>,
  };
};

const buildSubscribeUserIdList = (context: AuthorizedClassroomContext) => {
  const { student, mentor } = getPublicIdsByRole(context);
  return [mentor, student].flatMap((userId) => ([
    { userId, sourceType: 0, streamType: 0 },
    { userId, sourceType: 1, streamType: 0 },
  ]));
};

const buildMixLayoutParams = (
  context: AuthorizedClassroomContext,
  presenceEntries: ClassroomRecordingPresenceEntry[] = []
) => {
  const { student, mentor, byRole } = getPublicIdsByRole(context);
  const activeScreenEntry = presenceEntries
    .filter((entry) => entry.screenSharing)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0] || null;

  if (activeScreenEntry) {
    const otherRole: SessionRole = activeScreenEntry.role === 'mentor' ? 'student' : 'mentor';
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

const buildStartRequest = (
  context: AuthorizedClassroomContext,
  runtime: AliyunRtcRecordingRuntime,
  presenceEntries: ClassroomRecordingPresenceEntry[]
) => {
  const liveRuntime = getAliyunLiveRuntimeConfig();
  if (!liveRuntime) throw new Error('实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY');

  return new StartRtcCloudRecordingRequest({
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

const toRecordingPayload = (row: ClassroomRecordingRow | null) => {
  if (!row) return { enabled: false, status: 'idle', taskId: '', storagePrefix: '', errorMessage: '' };
  return {
    enabled: true,
    status: row.status,
    taskId: safeText(row.task_id),
    storagePrefix: safeText(row.storage_prefix),
    errorMessage: safeText(row.error_message),
  };
};

const loadLatestRecording = async (courseId: number, activeOnly = false) => {
  await ensureClassroomRecordingsTable();
  const activeFilter = activeOnly
    ? `AND status IN (${ACTIVE_RECORDING_STATUSES.map(() => '?').join(',')})`
    : '';
  const params: any[] = [courseId];
  if (activeOnly) params.push(...ACTIVE_RECORDING_STATUSES);
  const rows = await dbQuery<ClassroomRecordingRow[]>(
    `
    SELECT *
    FROM classroom_recordings
    WHERE course_session_id = ?
      ${activeFilter}
    ORDER BY id DESC
    LIMIT 1
    `,
    params
  );
  return rows?.[0] || null;
};

export const getClassroomRecordingStatus = async (courseId: number) => {
  const row = await loadLatestRecording(courseId, false);
  return toRecordingPayload(row);
};

export const startClassroomRecording = async (
  context: AuthorizedClassroomContext,
  startedByUserId: number,
  presenceEntries: ClassroomRecordingPresenceEntry[] = []
) => {
  await ensureClassroomRecordingsTable();

  const existing = await loadLatestRecording(context.courseId, true);
  if (existing) return toRecordingPayload(existing);

  const runtime = getRecordingRuntime();
  if (!runtime) throw new Error('ARTC 云端录制配置缺失，请检查 ALIYUN_LIVE_API_ACCESS_KEY_ID / ALIYUN_LIVE_API_ACCESS_KEY_SECRET / ALIYUN_ARTC_RECORD_OSS_BUCKET');
  const liveRuntime = getAliyunLiveRuntimeConfig();
  if (!liveRuntime) throw new Error('实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY');

  const storagePrefix = `classrooms/${context.roomId}`;
  const insertResult = await dbQuery<ResultSetHeader>(
    `
    INSERT INTO classroom_recordings
      (course_session_id, app_id, channel_id, status, storage_prefix, started_by_user_id)
    VALUES (?, ?, ?, 'starting', ?, ?)
    `,
    [context.courseId, liveRuntime.appId, context.roomId, storagePrefix, startedByUserId]
  );
  const recordingId = Number(insertResult.insertId);

  try {
    const response = await getLiveClient(runtime).startRtcCloudRecording(
      buildStartRequest(context, runtime, presenceEntries)
    );
    const taskId = safeText(response?.body?.taskId);
    if (!taskId) throw new Error('阿里云云端录制未返回 TaskId');

    await dbQuery(
      `
      UPDATE classroom_recordings
      SET task_id = ?, status = 'running', error_message = NULL
      WHERE id = ?
      `,
      [taskId, recordingId]
    );

    return {
      enabled: true,
      status: 'running',
      taskId,
      storagePrefix,
      errorMessage: '',
    };
  } catch (error) {
    const message = extractAliyunErrorMessage(error);
    await dbQuery(
      `
      UPDATE classroom_recordings
      SET status = 'failed', error_message = ?
      WHERE id = ?
      `,
      [message, recordingId]
    );
    throw new Error(message);
  }
};

export const updateClassroomRecordingLayout = async (
  context: AuthorizedClassroomContext,
  presenceEntries: ClassroomRecordingPresenceEntry[]
) => {
  const active = await loadLatestRecording(context.courseId, true);
  const taskId = safeText(active?.task_id);
  if (!active || !taskId || active.status !== 'running') return;

  const runtime = getRecordingRuntime();
  if (!runtime) return;

  try {
    await getLiveClient(runtime).updateRtcCloudRecording(new UpdateRtcCloudRecordingRequest({
      taskId,
      subscribeParams: {
        subscribeUserIdList: buildSubscribeUserIdList(context),
      },
      mixLayoutParams: buildMixLayoutParams(context, presenceEntries),
    }));
  } catch (error) {
    const message = extractAliyunErrorMessage(error);
    await dbQuery(
      `UPDATE classroom_recordings SET error_message = ? WHERE id = ?`,
      [message, active.id]
    );
    console.error('ARTC cloud recording layout update failed:', message);
  }
};

export const stopClassroomRecordingIfIdle = async (context: AuthorizedClassroomContext, activePresenceCount: number) => {
  if (activePresenceCount > 0) return;

  const active = await loadLatestRecording(context.courseId, true);
  const taskId = safeText(active?.task_id);
  if (!active || !taskId || active.status === 'stopping') return;

  await dbQuery(
    `
    UPDATE classroom_recordings
    SET status = 'stopping', stop_requested_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [active.id]
  );

  const runtime = getRecordingRuntime();
  if (!runtime) return;

  try {
    await getLiveClient(runtime).stopRtcCloudRecording(new StopRtcCloudRecordingRequest({ taskId }));
    await dbQuery(
      `
      UPDATE classroom_recordings
      SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP, error_message = NULL
      WHERE id = ?
      `,
      [active.id]
    );
  } catch (error) {
    const message = extractAliyunErrorMessage(error);
    await dbQuery(
      `
      UPDATE classroom_recordings
      SET status = 'failed', error_message = ?
      WHERE id = ?
      `,
      [message, active.id]
    );
    console.error('ARTC cloud recording stop failed:', message);
  }
};
