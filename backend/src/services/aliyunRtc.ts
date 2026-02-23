import crypto from 'crypto';

export type AliRtcTokenRole = 'pub' | 'sub' | 'relay';

export type AliRtcAuthInfo = {
  appId: string;
  channelId: string;
  userId: string;
  nonce: string;
  timestamp: number;
  token: string;
  role: AliRtcTokenRole;
};

export type AliyunRtcRuntimeConfig = {
  appId: string;
  appKey: string;
};

const safeTrim = (value: unknown) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

export function getAliyunRtcRuntimeConfig(): AliyunRtcRuntimeConfig | null {
  const appId = safeTrim(process.env.ALIYUN_RTC_APP_ID);
  const appKey = safeTrim(process.env.ALIYUN_RTC_APP_KEY);
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

export function createAliRtcAuthInfo(params: {
  appId: string;
  appKey: string;
  channelId: string;
  userId: string;
  nonce?: string;
  timestamp: number;
  role?: AliRtcTokenRole;
}): AliRtcAuthInfo {
  const appId = safeTrim(params.appId);
  const appKey = safeTrim(params.appKey);
  const channelId = safeTrim(params.channelId);
  const userId = safeTrim(params.userId);
  const nonce = safeTrim(params.nonce) || crypto.randomBytes(8).toString('hex');
  const timestamp = Number.isFinite(params.timestamp) && params.timestamp > 0
    ? Math.floor(params.timestamp)
    : Math.floor(Date.now() / 1000);
  const role: AliRtcTokenRole = params.role || 'pub';

  const tokenSeed = `${appId}${appKey}${channelId}${userId}${nonce}${timestamp}`;
  const token = crypto.createHash('sha256').update(tokenSeed).digest('hex');

  return {
    appId,
    channelId,
    userId,
    nonce,
    timestamp,
    token,
    role,
  };
}
