import crypto from 'crypto';

export type AliyunLiveRuntimeConfig = {
  appId: string;
  appKey: string;
};

export type AliyunLiveStreamAuthInfo = {
  appId: string;
  roomId: string;
  userId: string;
  nonce: string;
  timestamp: number;
  token: string;
  pushUrl: string;
  playUrl: string;
};

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

const safeTrim = (value: unknown) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

const readFirstEnv = (names: string[]) => {
  for (const name of names) {
    const value = safeTrim(process.env[name]);
    if (value) return value;
  }
  return '';
};

const normalizeRoomId = (value: unknown, fallback: string) => {
  const normalized = safeTrim(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_IDENTIFIER_LENGTH);
  return normalized || fallback;
};

const normalizeUserId = (value: unknown, fallback: string) => {
  const normalized = safeTrim(value).replace(/[^A-Za-z0-9_=-]/g, '_').slice(0, MAX_IDENTIFIER_LENGTH);
  return normalized || fallback;
};

const buildLiveQuery = (params: {
  appId: string;
  userId: string;
  nonce: string;
  timestamp: number;
  token: string;
}) => {
  const query = new URLSearchParams();
  query.set('sdkAppId', params.appId);
  query.set('userId', params.userId);
  if (params.nonce) query.set('nonce', params.nonce);
  query.set('timestamp', String(params.timestamp));
  query.set('token', params.token);
  return query.toString();
};

const buildLiveUrl = (
  prefix: string,
  params: {
    appId: string;
    roomId: string;
    userId: string;
    nonce: string;
    timestamp: number;
    token: string;
  }
) => `${prefix}/${params.roomId}?${buildLiveQuery(params)}`;

export function getAliyunLiveRuntimeConfig(): AliyunLiveRuntimeConfig | null {
  const appId = readFirstEnv(APP_ID_ENV_NAMES);
  const appKey = readFirstEnv(APP_KEY_ENV_NAMES);
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

export function createAliyunLiveStreamAuthInfo(params: {
  appId: string;
  appKey: string;
  roomId: string;
  userId: string;
  nonce?: string;
  timestamp: number;
}): AliyunLiveStreamAuthInfo {
  const appId = safeTrim(params.appId);
  const appKey = safeTrim(params.appKey);
  const roomId = normalizeRoomId(params.roomId, 'room');
  const userId = normalizeUserId(params.userId, 'user');
  const nonce = safeTrim(params.nonce);
  const timestamp = Number.isFinite(params.timestamp) && params.timestamp > 0
    ? Math.floor(params.timestamp)
    : Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const tokenSeed = `${appId}${appKey}${roomId}${userId}${nonce}${timestamp}`;
  const token = crypto.createHash('sha256').update(tokenSeed).digest('hex');

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

export const getAliyunRtcRuntimeConfig = getAliyunLiveRuntimeConfig;
export const createAliRtcAuthInfo = createAliyunLiveStreamAuthInfo;
