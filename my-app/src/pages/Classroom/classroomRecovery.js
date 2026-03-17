const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const REMOTE_NOT_JOINED_TEXT = '对方暂未加入';
export const REMOTE_RECONNECTING_TEXT = '对方暂时离线，等待重新加入...';

const REMOTE_UNAVAILABLE_PATTERNS = [
  /no remote user found(?:ed)?/i,
  /remote user .*not.*exist/i,
  /user .*not.*exist/i,
  /no stream/i,
  /stream.*not.*exist/i,
  /timeout/i,
  /wait/i,
  /等待/i,
  /未发布/i,
  /未推流/i,
];

export const getRemotePlayErrorCode = (error) => {
  const code = Number(error?.code ?? error?.errorCode ?? error?.response?.data?.code);
  return Number.isFinite(code) ? code : null;
};

export const getRemotePlayErrorMessage = (error) => (
  [
    safeText(error?.response?.data?.error),
    safeText(error?.message),
    safeText(error?.reason),
    safeText(error?.description),
    safeText(error?.msg),
  ].filter(Boolean).join(' ')
);

export const isRemoteUnavailableError = (error) => {
  if (getRemotePlayErrorCode(error) === 50026) return true;

  const message = getRemotePlayErrorMessage(error);
  return REMOTE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
};

export const isRetryableRemotePlayError = (error) => {
  if (isRemoteUnavailableError(error)) return true;

  const message = getRemotePlayErrorMessage(error);
  if (!message) return true;

  return /not found|timeout|wait|等待|未发布|未推流/i.test(message);
};

export const getRemoteUnavailableStatusText = ({
  hadRemoteStream = false,
  remotePresent = false,
  remoteLabel = '对方',
} = {}) => {
  const displayName = safeText(remoteLabel) || '对方';

  if (hadRemoteStream) return REMOTE_RECONNECTING_TEXT;
  if (remotePresent) return `双方已进入课堂，等待${displayName}画面...`;
  return `已进入课堂，等待${displayName}加入...`;
};
