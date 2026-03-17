import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FiMic, FiMicOff, FiMonitor, FiPhoneOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import api from '../../api/client';
import './ClassroomPage.css';

const LIVE_SDK_URL = 'https://g.alicdn.com/apsara-media-box/imp-web-live-push/6.4.9/alivc-live-push.js';
const SCREEN_SHARE_PROFILE = {
  width: 2560,
  height: 1440,
  bitrateKbps: 3000,
  fps: 15,
};
const REMOTE_STOPPLAY_NOOP = async () => undefined;

let liveSdkPromise = null;

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const isObjectLike = (value) => Boolean(value) && typeof value === 'object';
const isErrorLike = (value) => value instanceof Error;
const OPAQUE_RUNTIME_PLACEHOLDER = '[object Object]';
const hasOpaqueRuntimePlaceholder = (value) => safeText(value).includes(OPAQUE_RUNTIME_PLACEHOLDER);
const resolveAliyunSdkLogLevelNone = (sdk) => (
  sdk?.LogLevel?.NONE
  || sdk?.LogLevel?.none
  || sdk?.AlivcLogLevel?.NONE
  || sdk?.AlivcLogLevel?.none
  || 'none'
);

const parseErrorMessage = (error, fallback) => {
  const responseMessage = safeText(error?.response?.data?.error);
  if (responseMessage && !hasOpaqueRuntimePlaceholder(responseMessage)) return responseMessage;
  const rawMessage = safeText(error?.message || error?.reason || error?.description || error?.msg);
  const code = Number(error?.code ?? error?.errorCode);
  if (rawMessage && !hasOpaqueRuntimePlaceholder(rawMessage) && Number.isFinite(code)) return `${rawMessage} (code: ${code})`;
  if (rawMessage && !hasOpaqueRuntimePlaceholder(rawMessage)) return rawMessage;
  if (Number.isFinite(code)) return `${fallback} (code: ${code})`;
  return fallback;
};

const getErrorCode = (error) => {
  const code = Number(error?.code ?? error?.errorCode ?? error?.response?.data?.code);
  return Number.isFinite(code) ? code : null;
};

const isUserCancelledScreenShareError = (error) => {
  const message = [
    safeText(error?.message),
    safeText(error?.reason),
    safeText(error?.description),
    safeText(error?.msg),
    safeText(error?.name),
    safeText(error?.response?.data?.error),
  ].filter(Boolean).join(' ').toLowerCase();

  if (getErrorCode(error) === 10013) return true;

  return /permission denied by user|denied by user|permission dismissed|notallowederror|aborterror|cancelled|canceled/.test(message);
};

const isInterruptedMediaPlayError = (error) => {
  const message = [
    safeText(error?.message),
    safeText(error?.reason),
    safeText(error?.description),
    safeText(error?.msg),
    safeText(error?.name),
  ].filter(Boolean).join(' ').toLowerCase();

  return (
    /the play\(\) request was interrupted by a call to pause\(\)/.test(message)
    || (getErrorCode(error) === 20 && /play\(\).*pause\(\)/.test(message))
  );
};

const isAlreadyLoggedInPushError = (error) => {
  const message = [
    safeText(error?.message),
    safeText(error?.reason),
    safeText(error?.description),
    safeText(error?.msg),
  ].filter(Boolean).join(' ').toLowerCase();

  return getErrorCode(error) === 20103 || /already logged in/.test(message);
};

const hasActiveLocalPushSession = (pusher) => {
  if (!pusher) return false;

  try {
    const channelId = safeText(typeof pusher.getChannelId === 'function' ? pusher.getChannelId() : '');
    const userId = safeText(typeof pusher.getUserId === 'function' ? pusher.getUserId() : '');
    return Boolean(channelId && userId);
  } catch {
    return false;
  }
};

const hasLiveVideoTrack = (stream) => {
  const tracks = stream?.getVideoTracks?.();
  return Array.isArray(tracks) && tracks.some((track) => track && track.readyState !== 'ended');
};

const resolvePublishMediaStream = (pusher) => {
  if (!pusher || typeof pusher.getPublishMediaStream !== 'function') return null;
  try {
    return pusher.getPublishMediaStream() || null;
  } catch {
    return null;
  }
};

const attachMediaStreamToVideoElement = async (element, stream) => {
  if (!element) return;

  try {
    if (element.srcObject !== stream) {
      element.srcObject = stream || null;
    }
  } catch {}

  if (!stream || typeof element.play !== 'function') return;

  try {
    await Promise.resolve(element.play());
  } catch (error) {
    if (!isInterruptedMediaPlayError(error)) {
      throw error;
    }
  }
};

const looksLikeSdkErrorObject = (value) => {
  if (!value || typeof value !== 'object') return false;
  return [
    'code',
    'errorCode',
    'message',
    'reason',
    'description',
    'msg',
  ].some((key) => typeof value?.[key] !== 'undefined');
};

const unwrapRuntimeErrorPayload = (value) => {
  if (!isObjectLike(value)) return null;
  if (looksLikeSdkErrorObject(value)) return value;

  const nestedCandidates = [
    value.error,
    value.reason,
    value.detail,
    value.details,
    value.data,
    value.payload,
  ];

  for (const candidate of nestedCandidates) {
    if (looksLikeSdkErrorObject(candidate)) return candidate;
  }

  return null;
};

const getWindowRuntimePayloadCandidate = (event) => {
  if (typeof event?.error !== 'undefined') return event.error;
  if (typeof event?.reason !== 'undefined') return event.reason;
  return null;
};

const normalizeWindowRuntimePayload = (value) => {
  if (typeof value === 'undefined' || value === null) return null;
  if (isErrorLike(value)) {
    return hasOpaqueRuntimePlaceholder(value?.message) ? value : null;
  }
  if (isObjectLike(value)) {
    return unwrapRuntimeErrorPayload(value) || value;
  }

  const text = safeText(value);
  if (text) return { message: text };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { message: String(value) };
  }
  return null;
};

const resolveWindowRuntimePayload = (event) => {
  const rawPayload = getWindowRuntimePayloadCandidate(event);
  const normalizedPayload = normalizeWindowRuntimePayload(rawPayload);
  if (normalizedPayload) return normalizedPayload;
  const directPayload = unwrapRuntimeErrorPayload(rawPayload);
  if (directPayload) return directPayload;

  const message = safeText(event?.message);
  if (hasOpaqueRuntimePlaceholder(message)) {
    return { message };
  }

  return null;
};

const isAliyunLogprodWebSocketErrorEvent = (event) => {
  if (event?.type !== 'error' || typeof WebSocket !== 'function') return false;

  const socketTarget = [event?.target, event?.srcElement].find((candidate) => candidate instanceof WebSocket);
  const socketUrl = safeText(socketTarget?.url);

  return Boolean(socketTarget) && socketUrl.includes('logprod.aliyuncs.com/binlog');
};

const resolveAliyunLiveSdk = () => {
  if (typeof window === 'undefined') return null;
  const sdk = window.AlivcLivePush;
  if (
    sdk
    && typeof sdk.AlivcLivePusher === 'function'
    && typeof sdk.AlivcLivePlayer === 'function'
  ) {
    return sdk;
  }
  return null;
};

const loadAliyunLiveSdk = () => {
  const existingSdk = resolveAliyunLiveSdk();
  if (existingSdk) return Promise.resolve(existingSdk);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('当前环境不支持浏览器实时音视频'));
  }
  if (liveSdkPromise) return liveSdkPromise;

  liveSdkPromise = new Promise((resolve, reject) => {
    const handleReady = () => {
      const sdk = resolveAliyunLiveSdk();
      if (sdk) {
        resolve(sdk);
        return;
      }
      liveSdkPromise = null;
      reject(new Error('阿里云实时音视频 SDK 加载失败'));
    };

    const handleError = () => {
      liveSdkPromise = null;
      reject(new Error('阿里云实时音视频 SDK 下载失败'));
    };

    const existingScript = document.querySelector('script[data-aliyun-live-sdk="1"]');
    if (existingScript) {
      existingScript.addEventListener('load', handleReady, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      if (existingScript.getAttribute('data-loaded') === '1') {
        window.setTimeout(handleReady, 0);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = LIVE_SDK_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-aliyun-live-sdk', '1');
    script.addEventListener(
      'load',
      () => {
        script.setAttribute('data-loaded', '1');
        handleReady();
      },
      { once: true }
    );
    script.addEventListener('error', handleError, { once: true });
    document.body.appendChild(script);
  });

  return liveSdkPromise;
};

const normalizeSupportResult = (raw) => {
  if (typeof raw === 'boolean') return { supported: raw, reason: '' };
  if (raw && typeof raw === 'object') {
    const supported = raw.support !== false && raw.isSupported !== false;
    const reason = safeText(raw.reason || raw.message || raw.error);
    const unsupportedKeys = Array.isArray(raw.unsupportedKeys) ? raw.unsupportedKeys.join(', ') : '';
    return {
      supported,
      reason: reason || unsupportedKeys,
    };
  }
  return { supported: true, reason: '' };
};

const isRetryableRemotePlayError = (error) => {
  const message = parseErrorMessage(error, '');
  if (!message) return true;
  return /not found|no stream|stream.*not.*exist|user.*not.*exist|timeout|wait|等待|不存在|未发布|未推流/i.test(message);
};

const isIgnorableRemoteStopPlayError = (error) => {
  const message = [
    safeText(error?.message),
    safeText(error?.reason),
    safeText(error?.description),
    safeText(error?.msg),
  ].filter(Boolean).join(' ').toLowerCase();

  return getErrorCode(error) === 20701
    || (
      /remote stream stop play failed/.test(message)
      && /remote user does not exist|remote user.*not.*exist|user does not exist/.test(message)
    );
};

const hasRemoteUserForPlayer = (player, remoteUserId) => {
  if (!player || !remoteUserId) return false;

  const getRemoteUser = player?.userManager?.getRemoteUser;
  if (typeof getRemoteUser !== 'function') return true;

  try {
    return Boolean(getRemoteUser.call(player.userManager, remoteUserId));
  } catch {
    return false;
  }
};

const REMOTE_NOT_JOINED_TEXT = '对方暂未加入';
const REMOTE_RECONNECTING_TEXT = '对方网络波动，正在等待重新加入...';
const LOCAL_CAMERA_OFF_TEXT = '摄像头未开启';
const PRESENCE_HEARTBEAT_INTERVAL_MS = 2000;
const REMOTE_SCREEN_STALE_TIMEOUT_MS = 4000;

const clearVideoElement = (element, options = {}) => {
  const { pause = true, reload = true } = options;
  if (!element) return;
  try {
    if (pause && typeof element.pause === 'function') element.pause();
  } catch {}
  try {
    element.srcObject = null;
  } catch {}
  try {
    element.removeAttribute('src');
    if (reload && typeof element.load === 'function') element.load();
  } catch {}
};

const toLiveAuthInfo = (rawAuthInfo) => {
  const roomId = safeText(rawAuthInfo?.roomId);
  const selfUserId = safeText(rawAuthInfo?.selfUserId);
  const remoteUserId = safeText(rawAuthInfo?.remoteUserId);
  const pushUrl = safeText(rawAuthInfo?.pushUrl);
  const remotePlayUrl = safeText(rawAuthInfo?.remotePlayUrl);
  const selfPlayUrl = safeText(rawAuthInfo?.selfPlayUrl);
  const expiresAt = safeText(rawAuthInfo?.expiresAt);
  const sdkAppId = safeText(rawAuthInfo?.sdkAppId);
  const mode = safeText(rawAuthInfo?.mode) || 'aliyun-live-artc';

  if (!roomId || !selfUserId || !remoteUserId || !pushUrl || !remotePlayUrl) return null;

  return {
    mode,
    roomId,
    sdkAppId,
    selfUserId,
    remoteUserId,
    pushUrl,
    remotePlayUrl,
    selfPlayUrl,
    expiresAt,
  };
};

const bindEmitter = (emitter, eventName, handler) => {
  if (!emitter || typeof emitter.on !== 'function') return;
  try {
    emitter.on(eventName, handler);
  } catch {}
};

function ClassroomPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const localVideoRef = useRef(null);
  const localCameraPreviewRef = useRef(null);
  const localScreenVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const pusherRef = useRef(null);
  const playerRef = useRef(null);
  const liveAuthRef = useRef(null);
  const screenPreviewStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenTrackEndedHandlerRef = useRef(null);
  const presenceHeartbeatTimerRef = useRef(0);
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const cleaningRef = useRef(false);
  const screenActionPendingRef = useRef(false);
  const screenShareCancelSilenceUntilRef = useRef(0);
  const cameraActionPendingRef = useRef(false);
  const remoteRetryTimerRef = useRef(0);
  const remoteRecoveryPendingRef = useRef(false);
  const remoteRecoveryTimestampRef = useRef(0);
  const remotePresentRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const screenSharingRef = useRef(false);
  const remoteScreenSharingRef = useRef(false);
  const remoteScreenReadyRef = useRef(false);
  const remoteLabelRef = useRef('对方');
  const startRemotePlaybackRef = useRef(async () => {});
  const remoteScreenMonitorTimerRef = useRef(0);
  const remoteScreenFrameCallbackIdRef = useRef(null);
  const remoteScreenHeartbeatRef = useRef(0);
  const remoteScreenLastTimeRef = useRef(0);
  const remoteScreenObservedStreamRef = useRef(null);
  const remoteScreenStreamCleanupRef = useRef(null);
  const remotePlayerSessionRef = useRef(0);
  const remoteMediaMonitorTimerRef = useRef(0);
  const remoteMediaHeartbeatRef = useRef(0);
  const remoteMediaLastTimeRef = useRef(0);
  const currentRemoteUserIdRef = useRef('');
  const remotePlaybackActiveRef = useRef(false);
  const remoteStopInFlightRef = useRef(false);
  const localPushActiveRef = useRef(false);
  const cameraMutedRef = useRef(true);

  const [joining, setJoining] = useState(true);
  const [joined, setJoined] = useState(false);
  const [session, setSession] = useState(null);
  const [statusText, setStatusText] = useState('准备进入课堂...');
  const [errorMessage, setErrorMessage] = useState('');
  const [micMuted, setMicMuted] = useState(true);
  const [cameraMuted, setCameraMuted] = useState(true);
  const [remotePresent, setRemotePresent] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [screenShareSupported, setScreenShareSupported] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenActionPending, setScreenActionPending] = useState(false);
  const [cameraActionPending, setCameraActionPending] = useState(false);
  const [, setLocalScreenReady] = useState(false);
  const [remoteScreenReady, setRemoteScreenReady] = useState(false);

  const backHref = useMemo(
    () => (session?.roleInSession === 'mentor' ? '/mentor/courses' : '/student/courses'),
    [session?.roleInSession]
  );
  const remoteLabel = useMemo(() => safeText(session?.remoteUserName) || '对方', [session?.remoteUserName]);
  const presentationActive = useMemo(
    () => remoteScreenSharing || remoteScreenReady,
    [remoteScreenReady, remoteScreenSharing]
  );
  const presentationVisible = useMemo(() => presentationActive, [presentationActive]);
  const presentationTitle = useMemo(() => {
    if (presentationActive) return `${remoteLabel}正在共享屏幕`;
    return '共享屏幕';
  }, [presentationActive, remoteLabel]);
  const presentationPlaceholder = useMemo(() => {
    if (presentationActive) return `等待${remoteLabel}的共享画面...`;
    return '暂未开始共享屏幕';
  }, [presentationActive, remoteLabel]);
  const remoteVideoPlaceholder = useMemo(() => {
    if (remotePresent) return `${remoteLabel}已进入课堂，等待画面...`;
    return REMOTE_NOT_JOINED_TEXT;
  }, [remoteLabel, remotePresent]);
  remotePresentRef.current = remotePresent;
  remoteReadyRef.current = remoteReady;
  screenSharingRef.current = screenSharing;
  remoteScreenSharingRef.current = remoteScreenSharing;
  remoteScreenReadyRef.current = remoteScreenReady;
  remoteLabelRef.current = remoteLabel;
  cameraMutedRef.current = cameraMuted;

  const logRemoteCleanup = useCallback((functionName, details = {}) => {
    const player = typeof details.player === 'undefined' ? playerRef.current : details.player;
    const videoElement = typeof details.videoElement === 'undefined'
      ? (remoteVideoRef.current || remoteScreenVideoRef.current || null)
      : details.videoElement;
    const error = details.error;

    console.debug('[MentoryRemoteCleanup]', {
      functionName,
      timestamp: new Date().toISOString(),
      remoteUserId: safeText(details.remoteUserId) || currentRemoteUserIdRef.current,
      currentRemoteUserId: currentRemoteUserIdRef.current,
      remotePlaybackActive: remotePlaybackActiveRef.current,
      playerRefExists: Boolean(playerRef.current),
      playerExists: Boolean(player),
      playerMatchesPlayerRef: Boolean(player && playerRef.current === player),
      videoElementExists: Boolean(videoElement),
      willStopPlay: Boolean(details.willStopPlay),
      willDestroy: Boolean(details.willDestroy),
      remoteStopInFlight: remoteStopInFlightRef.current,
      playerHasStopPlay: Boolean(player && typeof player.stopPlay === 'function'),
      playerHasDestroy: Boolean(player && typeof player.destroy === 'function'),
      playerStopPlayIsNoop: Boolean(player && player.stopPlay === REMOTE_STOPPLAY_NOOP),
      errorCode: error ? getErrorCode(error) : null,
      errorMessage: error ? safeText(error?.message || error?.reason || error?.description || error?.msg) : '',
      errorParams: error?.params,
      ...details,
      player: undefined,
      videoElement: undefined,
      error: undefined,
    });
  }, []);

  const clearRemotePlaybackRetry = useCallback(() => {
    if (!remoteRetryTimerRef.current) return;
    window.clearTimeout(remoteRetryTimerRef.current);
    remoteRetryTimerRef.current = 0;
  }, []);

  const clearPresenceHeartbeat = useCallback(() => {
    if (!presenceHeartbeatTimerRef.current) return;
    window.clearTimeout(presenceHeartbeatTimerRef.current);
    presenceHeartbeatTimerRef.current = 0;
  }, []);

  const clearRemoteMediaMonitor = useCallback(() => {
    if (!remoteMediaMonitorTimerRef.current) return;
    window.clearInterval(remoteMediaMonitorTimerRef.current);
    remoteMediaMonitorTimerRef.current = 0;
  }, []);

  const markRemoteMediaProgress = useCallback(() => {
    const video = remoteVideoRef.current;
    remoteMediaHeartbeatRef.current = Date.now();
    remoteMediaLastTimeRef.current = Number.isFinite(video?.currentTime) ? video.currentTime : 0;
  }, []);

  const clearScreenTrackListener = useCallback(() => {
    const track = screenTrackRef.current;
    const handler = screenTrackEndedHandlerRef.current;
    if (track && handler) {
      try {
        track.removeEventListener('ended', handler);
      } catch {}
    }
    screenTrackRef.current = null;
    screenTrackEndedHandlerRef.current = null;
    screenPreviewStreamRef.current = null;
  }, []);

  const clearRemoteScreenStreamBindings = useCallback(() => {
    const cleanup = remoteScreenStreamCleanupRef.current;
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch {}
    }
    remoteScreenStreamCleanupRef.current = null;
    remoteScreenObservedStreamRef.current = null;
  }, []);

  const clearRemoteScreenFrameCallback = useCallback(() => {
    const video = remoteScreenVideoRef.current;
    const callbackId = remoteScreenFrameCallbackIdRef.current;
    if (
      video
      && callbackId !== null
      && typeof video.cancelVideoFrameCallback === 'function'
    ) {
      try {
        video.cancelVideoFrameCallback(callbackId);
      } catch {}
    }
    remoteScreenFrameCallbackIdRef.current = null;
  }, []);

  const clearRemoteScreenMonitor = useCallback(() => {
    if (remoteScreenMonitorTimerRef.current) {
      window.clearInterval(remoteScreenMonitorTimerRef.current);
      remoteScreenMonitorTimerRef.current = 0;
    }
    clearRemoteScreenFrameCallback();
    clearRemoteScreenStreamBindings();
  }, [clearRemoteScreenFrameCallback, clearRemoteScreenStreamBindings]);

  const markRemoteScreenReady = useCallback(() => {
    const video = remoteScreenVideoRef.current;
    remoteScreenHeartbeatRef.current = Date.now();
    if (video) {
      remoteScreenLastTimeRef.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    }
    if (mountedRef.current) setRemoteScreenReady(true);
  }, []);

  const markRemoteScreenIdle = useCallback((options = {}) => {
    const { clearElement = false } = options;
    remoteScreenHeartbeatRef.current = 0;
    remoteScreenLastTimeRef.current = 0;
    clearRemoteScreenFrameCallback();
    clearRemoteScreenStreamBindings();
    if (clearElement) {
      clearVideoElement(remoteScreenVideoRef.current);
    }
    if (mountedRef.current) setRemoteScreenReady(false);
  }, [clearRemoteScreenFrameCallback, clearRemoteScreenStreamBindings]);

  const shouldSilenceScreenShareCancelError = useCallback((error) => {
    if (!isUserCancelledScreenShareError(error)) return false;
    return screenActionPendingRef.current || Date.now() <= screenShareCancelSilenceUntilRef.current;
  }, []);

  const reportRuntimeIssue = useCallback((error, fallback) => {
    if (!mountedRef.current) return;
    if (shouldSilenceScreenShareCancelError(error)) {
      setErrorMessage('');
      return;
    }
    const message = parseErrorMessage(error, fallback);
    setErrorMessage(message);
    setStatusText(message);
  }, [shouldSilenceScreenShareCancelError]);

  const buildJoinedStatusText = useCallback((options = {}) => {
    const displayName = safeText(options.remoteLabel) || safeText(remoteLabelRef.current) || '对方';
    const nextRemoteReady = typeof options.remoteReady === 'boolean' ? options.remoteReady : remoteReadyRef.current;
    const nextRemotePresent = typeof options.remotePresent === 'boolean' ? options.remotePresent : remotePresentRef.current;

    if (nextRemoteReady) return '双方已进入课堂';
    if (nextRemotePresent) return `双方已进入课堂，等待${displayName}画面...`;
    return `已进入课堂，等待${displayName}加入...`;
  }, []);

  const applyRemoteNotJoinedState = useCallback((options = {}) => {
    const nextStatusText = safeText(options.statusText) || buildJoinedStatusText({ remoteReady: false });
    if (!mountedRef.current) return;
    remoteMediaHeartbeatRef.current = 0;
    remoteMediaLastTimeRef.current = 0;
    setErrorMessage('');
    setRemoteReady(false);
    setRemoteScreenSharing(false);
    markRemoteScreenIdle();
    setStatusText(nextStatusText);
  }, [buildJoinedStatusText, markRemoteScreenIdle]);

  const syncClassroomPresence = useCallback(async (options = {}) => {
    const normalizedCourseId = safeText(courseId);
    if (!normalizedCourseId || !mountedRef.current || !joinedRef.current) return;

    try {
      const nextLocalScreenSharing = typeof options.screenSharing === 'boolean'
        ? options.screenSharing
        : screenSharingRef.current;
      const response = await api.post(
        `/api/rtc/classrooms/${encodeURIComponent(normalizedCourseId)}/presence`,
        { screenSharing: nextLocalScreenSharing }
      );
      if (!mountedRef.current || !joinedRef.current) return;

      const nextRemotePresent = Boolean(response?.data?.remotePresent);
      const nextRemoteScreenSharing = Boolean(response?.data?.remoteScreenSharing);
      setRemotePresent(nextRemotePresent);
      setRemoteScreenSharing(nextRemoteScreenSharing);
      if (remoteScreenSharingRef.current && !nextRemoteScreenSharing) {
        markRemoteScreenIdle();
      }
      if (!remoteReadyRef.current) {
        setStatusText(buildJoinedStatusText({ remotePresent: nextRemotePresent, remoteReady: false }));
      }
    } catch {}
  }, [buildJoinedStatusText, courseId, markRemoteScreenIdle]);

  const detachVisibleCameraPreview = useCallback(() => {
    clearVideoElement(localVideoRef.current, { pause: false, reload: false });
    clearVideoElement(localCameraPreviewRef.current, { pause: false, reload: false });
  }, []);

  const startVisibleCameraPreview = useCallback(async (options = {}) => {
    const pusher = pusherRef.current;
    const visibleElement = localVideoRef.current;

    if (!pusher || !visibleElement) return null;

    const startedAt = Date.now();
    let previewStream = resolvePublishMediaStream(pusher);

    while (!hasLiveVideoTrack(previewStream) && Date.now() - startedAt < 3000) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      previewStream = resolvePublishMediaStream(pusher);
    }

    if (!hasLiveVideoTrack(previewStream)) {
      throw new Error('本地摄像头预览初始化失败');
    }

    await attachMediaStreamToVideoElement(visibleElement, previewStream);
    return previewStream;
  }, []);

  const startLocalPush = useCallback(async () => {
    const pusher = pusherRef.current;
    const pushUrl = safeText(liveAuthRef.current?.pushUrl);
    if (!pusher || !pushUrl) {
      throw new Error('课堂推流尚未就绪');
    }

    if (localPushActiveRef.current || hasActiveLocalPushSession(pusher)) {
      localPushActiveRef.current = true;
      return;
    }

    try {
      await pusher.startPush(pushUrl);
      localPushActiveRef.current = true;
    } catch (error) {
      if (isAlreadyLoggedInPushError(error) || hasActiveLocalPushSession(pusher)) {
        localPushActiveRef.current = true;
        return;
      }
      throw error;
    }
  }, []);

  const stopLocalPush = useCallback(async () => {
    const pusher = pusherRef.current;
    if (!pusher || typeof pusher.stopPush !== 'function') return;
    if (!localPushActiveRef.current && !hasActiveLocalPushSession(pusher)) return;

    try {
      await pusher.stopPush();
    } catch {}
    localPushActiveRef.current = false;
  }, []);

  const syncLocalMicMuteState = useCallback((muted) => {
    const pusher = pusherRef.current;
    if (!pusher || typeof pusher.mute !== 'function') return;

    try {
      pusher.mute(Boolean(muted));
    } catch {}
  }, []);

  const destroyRemotePlayerInstance = useCallback(async (player, options = {}) => {
    if (!player) {
      logRemoteCleanup('destroyRemotePlayerInstance', {
        stage: 'skip-no-player',
        remoteUserId: options.remoteUserId,
        videoElement: options.videoElement || null,
        willStopPlay: false,
        willDestroy: false,
      });
      return;
    }

    const remoteUserId = safeText(options.remoteUserId);
    const videoElement = options.videoElement || null;
    const playbackActive = options.playbackActive === true;
    const remoteUserExists = hasRemoteUserForPlayer(player, remoteUserId);
    const canStopPlay = (
      playbackActive
      && !remoteStopInFlightRef.current
      && typeof player.stopPlay === 'function'
      && Boolean(videoElement)
      && Boolean(remoteUserId)
      && remoteUserExists
    );

    logRemoteCleanup('destroyRemotePlayerInstance', {
      stage: 'enter',
      player,
      remoteUserId,
      videoElement,
      playbackActive,
      remoteUserExists,
      canStopPlay,
      willStopPlay: canStopPlay,
      willDestroy: typeof player.destroy === 'function',
    });

    if (canStopPlay) {
      remoteStopInFlightRef.current = true;
      logRemoteCleanup('destroyRemotePlayerInstance', {
        stage: 'before-stopPlay',
        player,
        remoteUserId,
        videoElement,
        playbackActive,
        remoteUserExists,
        willStopPlay: true,
        willDestroy: typeof player.destroy === 'function',
      });
      try {
        await player.stopPlay();
        logRemoteCleanup('destroyRemotePlayerInstance', {
          stage: 'after-stopPlay',
          player,
          remoteUserId,
          videoElement,
          playbackActive,
          remoteUserExists,
          willStopPlay: false,
          willDestroy: typeof player.destroy === 'function',
        });
      } catch (error) {
        logRemoteCleanup('destroyRemotePlayerInstance', {
          stage: 'stopPlay-catch',
          player,
          remoteUserId,
          videoElement,
          playbackActive,
          remoteUserExists,
          willStopPlay: true,
          willDestroy: typeof player.destroy === 'function',
          error,
        });
        if (!isIgnorableRemoteStopPlayError(error)) {
          console.warn('Failed to stop remote playback', error);
        }
      } finally {
        remoteStopInFlightRef.current = false;
      }
    } else {
      logRemoteCleanup('destroyRemotePlayerInstance', {
        stage: 'skip-stopPlay',
        player,
        remoteUserId,
        videoElement,
        playbackActive,
        remoteUserExists,
        willStopPlay: false,
        willDestroy: typeof player.destroy === 'function',
      });
    }

    if (typeof player.stopPlay === 'function') {
      try {
        player.stopPlay = REMOTE_STOPPLAY_NOOP;
      } catch {}
    }

    logRemoteCleanup('destroyRemotePlayerInstance', {
      stage: 'before-destroy',
      player,
      remoteUserId,
      videoElement,
      playbackActive,
      remoteUserExists,
      willStopPlay: false,
      willDestroy: typeof player.destroy === 'function',
    });

    try {
      if (typeof player.destroy === 'function') {
        await Promise.resolve(player.destroy());
        logRemoteCleanup('destroyRemotePlayerInstance', {
          stage: 'after-destroy',
          player,
          remoteUserId,
          videoElement,
          playbackActive,
          remoteUserExists,
          willStopPlay: false,
          willDestroy: false,
        });
      }
    } catch (error) {
      logRemoteCleanup('destroyRemotePlayerInstance', {
        stage: 'destroy-catch',
        player,
        remoteUserId,
        videoElement,
        playbackActive,
        remoteUserExists,
        willStopPlay: false,
        willDestroy: true,
        error,
      });
      if (!isIgnorableRemoteStopPlayError(error)) {
        console.warn('Failed to destroy remote playback', error);
      }
    }
  }, [logRemoteCleanup]);

  const teardownRemotePlayback = useCallback(async () => {
    clearRemotePlaybackRetry();
    clearRemoteScreenMonitor();

    const player = playerRef.current;
    const remoteUserId = currentRemoteUserIdRef.current;
    const playbackActive = remotePlaybackActiveRef.current;
    const videoElement = remoteVideoRef.current || remoteScreenVideoRef.current || null;

    logRemoteCleanup('teardownRemotePlayback', {
      stage: 'enter',
      player,
      remoteUserId,
      videoElement,
      playbackActive,
      willStopPlay: playbackActive,
      willDestroy: Boolean(player),
    });

    playerRef.current = null;
    currentRemoteUserIdRef.current = '';
    remotePlaybackActiveRef.current = false;

    logRemoteCleanup('teardownRemotePlayback', {
      stage: 'after-ref-clear',
      player,
      remoteUserId,
      videoElement,
      playbackActive,
      willStopPlay: playbackActive,
      willDestroy: Boolean(player),
    });

    await destroyRemotePlayerInstance(player, {
      remoteUserId,
      playbackActive,
      videoElement,
    });
    remoteStopInFlightRef.current = false;

    logRemoteCleanup('teardownRemotePlayback', {
      stage: 'after-destroyRemotePlayerInstance',
      player,
      remoteUserId,
      videoElement,
      playbackActive: false,
      willStopPlay: false,
      willDestroy: false,
    });

    remoteMediaHeartbeatRef.current = 0;
    remoteMediaLastTimeRef.current = 0;
    clearVideoElement(remoteVideoRef.current);
    clearVideoElement(remoteScreenVideoRef.current);

    if (mountedRef.current) {
      setRemoteReady(false);
      setRemoteScreenReady(false);
    }
  }, [clearRemotePlaybackRetry, clearRemoteScreenMonitor, destroyRemotePlayerInstance, logRemoteCleanup]);

  const scheduleRemotePlaybackRetry = useCallback((delayMs = 3000) => {
    clearRemotePlaybackRetry();
    if (!mountedRef.current || !joinedRef.current) return;

    remoteRetryTimerRef.current = window.setTimeout(() => {
      remoteRetryTimerRef.current = 0;
      if (!mountedRef.current || !joinedRef.current) return;
      void startRemotePlaybackRef.current();
    }, delayMs);
  }, [clearRemotePlaybackRetry]);

  const recoverRemotePlayback = useCallback(async (options = {}) => {
    const nextDelayMs = Number.isFinite(options.delayMs) ? options.delayMs : 2500;
    const minIntervalMs = Number.isFinite(options.minIntervalMs) ? options.minIntervalMs : 1200;
    const nextStatusText = safeText(options.statusText)
      || (remoteReadyRef.current ? REMOTE_RECONNECTING_TEXT : buildJoinedStatusText({ remoteReady: false }));
    const now = Date.now();

    logRemoteCleanup('recoverRemotePlayback', {
      stage: 'enter',
      remoteUserId: currentRemoteUserIdRef.current,
      playbackActive: remotePlaybackActiveRef.current,
      nextDelayMs,
      minIntervalMs,
      nextStatusText,
      willStopPlay: remotePlaybackActiveRef.current,
      willDestroy: Boolean(playerRef.current),
    });

    if (!mountedRef.current || !joinedRef.current) {
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'skip-not-mounted-or-joined',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: false,
        willDestroy: false,
      });
      return;
    }

    if (!remotePlaybackActiveRef.current) {
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'skip-inactive-playback',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: false,
        willDestroy: false,
      });
      return;
    }

    applyRemoteNotJoinedState({ statusText: nextStatusText });

    if (remoteRecoveryTimestampRef.current && now - remoteRecoveryTimestampRef.current < minIntervalMs) {
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'skip-rate-limited',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        nextDelayMs,
        minIntervalMs,
        willStopPlay: false,
        willDestroy: false,
      });
      scheduleRemotePlaybackRetry(Math.max(nextDelayMs, minIntervalMs));
      return;
    }

    if (remoteRecoveryPendingRef.current) {
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'skip-pending',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        nextDelayMs,
        willStopPlay: false,
        willDestroy: false,
      });
      scheduleRemotePlaybackRetry(nextDelayMs);
      return;
    }

    remoteRecoveryTimestampRef.current = now;
    remoteRecoveryPendingRef.current = true;
    try {
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'before-teardownRemotePlayback',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: remotePlaybackActiveRef.current,
        willDestroy: Boolean(playerRef.current),
      });
      await teardownRemotePlayback();
    } finally {
      remoteRecoveryPendingRef.current = false;
      logRemoteCleanup('recoverRemotePlayback', {
        stage: 'finally',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        nextDelayMs,
        willStopPlay: false,
        willDestroy: false,
      });
      if (mountedRef.current && joinedRef.current) {
        scheduleRemotePlaybackRetry(nextDelayMs);
      }
    }
  }, [applyRemoteNotJoinedState, buildJoinedStatusText, logRemoteCleanup, scheduleRemotePlaybackRetry, teardownRemotePlayback]);

  const isRemoteRuntimeRecoveryActive = useCallback(() => (
    joinedRef.current && remotePlaybackActiveRef.current && (
      Boolean(playerRef.current)
      || Boolean(remoteRetryTimerRef.current)
      || remoteRecoveryPendingRef.current
    )
  ), []);

  const hasEstablishedRemotePlayback = useCallback(() => (
    remoteReadyRef.current || remoteMediaHeartbeatRef.current > 0
  ), []);

  const shouldSuppressOpaqueRuntimeEvent = useCallback((event) => {
    if (isAliyunLogprodWebSocketErrorEvent(event)) return true;
    const rawPayload = getWindowRuntimePayloadCandidate(event);
    if (isInterruptedMediaPlayError(rawPayload)) return true;
    if (normalizeWindowRuntimePayload(rawPayload)) return true;
    if (isInterruptedMediaPlayError({ message: event?.message })) return true;
    return hasOpaqueRuntimePlaceholder(event?.message);
  }, []);

  const shouldRecoverFromRuntimePayload = useCallback((payload) => {
    if (!payload || !isRemoteRuntimeRecoveryActive()) return false;
    if (isRetryableRemotePlayError(payload)) return hasEstablishedRemotePlayback();
    return hasEstablishedRemotePlayback() && isObjectLike(payload);
  }, [hasEstablishedRemotePlayback, isRemoteRuntimeRecoveryActive]);

  const processRuntimeEvent = useCallback((event, options = {}) => {
    const { alreadySuppressed = false } = options;
    const silenceEvent = () => {
      if (alreadySuppressed) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    };

    if (isAliyunLogprodWebSocketErrorEvent(event)) {
      silenceEvent();
      if (mountedRef.current) setErrorMessage('');
      return true;
    }

    const runtimePayload = resolveWindowRuntimePayload(event);
    const suppressOpaqueRuntime = shouldSuppressOpaqueRuntimeEvent(event);

    if (isInterruptedMediaPlayError(runtimePayload) || isInterruptedMediaPlayError({ message: event?.message })) {
      silenceEvent();
      if (mountedRef.current) setErrorMessage('');
      return true;
    }

    if (!runtimePayload) {
      if (!suppressOpaqueRuntime) return false;
      silenceEvent();
      if (hasEstablishedRemotePlayback() && isRemoteRuntimeRecoveryActive()) {
        void recoverRemotePlayback({
          statusText: remoteReadyRef.current ? REMOTE_RECONNECTING_TEXT : buildJoinedStatusText({ remoteReady: false }),
        });
      } else if (mountedRef.current) {
        setErrorMessage('');
      }
      return true;
    }

    if (shouldSilenceScreenShareCancelError(runtimePayload)) {
      silenceEvent();
      if (mountedRef.current) setErrorMessage('');
      return true;
    }

    if (shouldRecoverFromRuntimePayload(runtimePayload)) {
      silenceEvent();
      void recoverRemotePlayback({
        statusText: remoteReadyRef.current ? REMOTE_RECONNECTING_TEXT : buildJoinedStatusText({ remoteReady: false }),
      });
      return true;
    }

    if (suppressOpaqueRuntime) {
      silenceEvent();
      if (mountedRef.current) setErrorMessage('');
      return true;
    }

    reportRuntimeIssue(runtimePayload, '课堂连接发生错误，请稍后重试');
    return true;
  }, [
    hasEstablishedRemotePlayback,
    isRemoteRuntimeRecoveryActive,
    recoverRemotePlayback,
    buildJoinedStatusText,
    reportRuntimeIssue,
    shouldRecoverFromRuntimePayload,
    shouldSilenceScreenShareCancelError,
    shouldSuppressOpaqueRuntimeEvent,
  ]);

  const startRemotePlayback = useCallback(async () => {
    const sdk = resolveAliyunLiveSdk();
    const liveAuth = liveAuthRef.current;
    const remotePlayUrl = safeText(liveAuth?.remotePlayUrl);
    const remoteUserId = safeText(liveAuth?.remoteUserId);
    const displayName = safeText(remoteLabelRef.current) || '对方';
    const hadRemoteStream = remoteReadyRef.current;
    let player = null;
    let sessionId = 0;
    let playbackStarted = false;
    let playbackCommitted = false;
    const isLatestPlaybackAttempt = () => remotePlayerSessionRef.current === sessionId;
    const isActivePlayerSession = () => (
      playbackCommitted
      && Boolean(player)
      && playerRef.current === player
      && isLatestPlaybackAttempt()
    );

    logRemoteCleanup('startRemotePlayback', {
      stage: 'enter',
      remoteUserId,
      playbackActive: remotePlaybackActiveRef.current,
      hasSdk: Boolean(sdk),
      hasRemotePlayUrl: Boolean(remotePlayUrl),
      hasRemoteVideoElement: Boolean(remoteVideoRef.current),
      willStopPlay: remotePlaybackActiveRef.current,
      willDestroy: Boolean(playerRef.current),
    });

    if (!sdk || !remotePlayUrl || !remoteUserId || !remoteVideoRef.current || !joinedRef.current) return;

    logRemoteCleanup('startRemotePlayback', {
      stage: 'before-initial-teardownRemotePlayback',
      remoteUserId,
      playbackActive: remotePlaybackActiveRef.current,
      willStopPlay: remotePlaybackActiveRef.current,
      willDestroy: Boolean(playerRef.current),
    });
    await teardownRemotePlayback();

    try {
      player = new sdk.AlivcLivePlayer();
      sessionId = remotePlayerSessionRef.current + 1;
      remotePlayerSessionRef.current = sessionId;
      remoteStopInFlightRef.current = false;

      logRemoteCleanup('startRemotePlayback', {
        stage: 'player-created',
        player,
        remoteUserId,
        sessionId,
        playbackActive: false,
        willStopPlay: false,
        willDestroy: false,
      });

      const playInfo = await player.startPlay(
        remotePlayUrl,
        remoteVideoRef.current,
        remoteScreenVideoRef.current || undefined
      );
      playbackStarted = true;
      logRemoteCleanup('startRemotePlayback', {
        stage: 'after-startPlay',
        player,
        remoteUserId,
        sessionId,
        playbackActive: playbackStarted,
        videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
        willStopPlay: false,
        willDestroy: false,
      });
      if (!mountedRef.current || !joinedRef.current || !isLatestPlaybackAttempt()) {
        logRemoteCleanup('startRemotePlayback', {
          stage: 'inactive-session-destroyRemotePlayerInstance',
          player,
          remoteUserId,
          sessionId,
          playbackActive: false,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
          willStopPlay: false,
          willDestroy: true,
        });
        await destroyRemotePlayerInstance(player, {
          remoteUserId,
          playbackActive: false,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
        });
        return;
      }
      playerRef.current = player;
      currentRemoteUserIdRef.current = remoteUserId;
      remotePlaybackActiveRef.current = true;
      playbackCommitted = true;

      logRemoteCleanup('startRemotePlayback', {
        stage: 'commit-active-session',
        player,
        remoteUserId,
        sessionId,
        playbackActive: true,
        videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
        willStopPlay: false,
        willDestroy: false,
      });

      if (mountedRef.current) {
        setErrorMessage('');
        setStatusText(buildJoinedStatusText({ remotePresent: true, remoteReady: false, remoteLabel: displayName }));
      }

      bindEmitter(playInfo, 'canplay', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        markRemoteMediaProgress();
        setRemotePresent(true);
        setRemoteReady(true);
        setErrorMessage('');
        setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'update', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        markRemoteMediaProgress();
        setRemotePresent(true);
        setRemoteReady(true);
        setErrorMessage('');
        if (joinedRef.current) setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'userleft', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        logRemoteCleanup('startRemotePlayback.userleft', {
          stage: 'enter',
          player,
          remoteUserId,
          sessionId,
          playbackActive: remotePlaybackActiveRef.current,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
          willStopPlay: remotePlaybackActiveRef.current,
          willDestroy: true,
        });
        currentRemoteUserIdRef.current = '';
        remotePlaybackActiveRef.current = false;
        applyRemoteNotJoinedState();
        void (async () => {
          if (!isActivePlayerSession()) return;
          logRemoteCleanup('startRemotePlayback.userleft', {
            stage: 'before-teardownRemotePlayback',
            player,
            remoteUserId,
            sessionId,
            playbackActive: false,
            videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
            willStopPlay: false,
            willDestroy: true,
          });
          await teardownRemotePlayback();
          if (!mountedRef.current || !joinedRef.current || remotePlayerSessionRef.current !== sessionId) return;
          scheduleRemotePlaybackRetry(5000);
        })();
      });
    } catch (error) {
      logRemoteCleanup('startRemotePlayback', {
        stage: 'catch',
        player,
        remoteUserId,
        sessionId,
        playbackActive: playbackCommitted,
        videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
        willStopPlay: playbackCommitted,
        willDestroy: Boolean(player),
        error,
      });
      if (player && !playbackCommitted) {
        logRemoteCleanup('startRemotePlayback', {
          stage: 'catch-pending-player-destroyRemotePlayerInstance',
          player,
          remoteUserId,
          sessionId,
          playbackActive: false,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
          willStopPlay: false,
          willDestroy: true,
        });
        await destroyRemotePlayerInstance(player, {
          remoteUserId,
          playbackActive: false,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
        });
      } else {
        logRemoteCleanup('startRemotePlayback', {
          stage: 'catch-before-teardownRemotePlayback',
          player,
          remoteUserId,
          sessionId,
          playbackActive: true,
          videoElement: remoteVideoRef.current || remoteScreenVideoRef.current || null,
          willStopPlay: true,
          willDestroy: Boolean(playerRef.current),
        });
        await teardownRemotePlayback();
      }
      if (!mountedRef.current || !joinedRef.current || (sessionId && !isLatestPlaybackAttempt())) return;

      if (isRetryableRemotePlayError(error)) {
        applyRemoteNotJoinedState({
          statusText: hadRemoteStream ? REMOTE_RECONNECTING_TEXT : buildJoinedStatusText({ remoteReady: false }),
        });
        scheduleRemotePlaybackRetry(2500);
        return;
      }

      const message = parseErrorMessage(error, '拉取对方画面失败');
      setErrorMessage(message);
      setStatusText(message);
    }
  }, [applyRemoteNotJoinedState, buildJoinedStatusText, destroyRemotePlayerInstance, logRemoteCleanup, markRemoteMediaProgress, scheduleRemotePlaybackRetry, teardownRemotePlayback]);

  startRemotePlaybackRef.current = startRemotePlayback;

  const stopScreenShare = useCallback(async (options = {}) => {
    const { silent = false } = options;
    const pusher = pusherRef.current;

    clearScreenTrackListener();
    clearVideoElement(localScreenVideoRef.current);

    if (pusher && joinedRef.current) {
      try {
        if (typeof pusher.stopScreenShare === 'function') {
          await pusher.stopScreenShare();
        }
      } catch {}
    }

    if (mountedRef.current) {
      setScreenSharing(false);
      setLocalScreenReady(false);
      screenShareCancelSilenceUntilRef.current = 0;
      if (!silent) {
        setErrorMessage('');
        setStatusText(buildJoinedStatusText());
      }
    }
    void syncClassroomPresence({ screenSharing: false });
  }, [buildJoinedStatusText, clearScreenTrackListener, syncClassroomPresence]);

  const leaveAndDestroy = useCallback(async () => {
    if (cleaningRef.current) {
      logRemoteCleanup('leaveAndDestroy', {
        stage: 'skip-already-cleaning',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: false,
        willDestroy: false,
      });
      return;
    }
    cleaningRef.current = true;
    joinedRef.current = false;
    clearPresenceHeartbeat();

    logRemoteCleanup('leaveAndDestroy', {
      stage: 'enter',
      remoteUserId: currentRemoteUserIdRef.current,
      playbackActive: remotePlaybackActiveRef.current,
      willStopPlay: remotePlaybackActiveRef.current,
      willDestroy: Boolean(playerRef.current),
    });

    try {
      const normalizedCourseId = safeText(courseId);
      if (normalizedCourseId) {
        void api.delete(`/api/rtc/classrooms/${encodeURIComponent(normalizedCourseId)}/presence`).catch(() => {});
      }
      clearRemotePlaybackRetry();
      liveAuthRef.current = null;
      remoteRecoveryPendingRef.current = false;
      remoteRecoveryTimestampRef.current = 0;
      screenActionPendingRef.current = false;
      screenShareCancelSilenceUntilRef.current = 0;
      cameraActionPendingRef.current = false;

      await stopScreenShare({ silent: true });

      logRemoteCleanup('leaveAndDestroy', {
        stage: 'before-teardownRemotePlayback',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: remotePlaybackActiveRef.current,
        willDestroy: Boolean(playerRef.current),
      });
      await teardownRemotePlayback();

      const pusher = pusherRef.current;
      if (pusher) {
        await stopLocalPush();
        try {
          if (typeof pusher.stopPreview === 'function') await pusher.stopPreview();
        } catch {}
        try {
          if (typeof pusher.destroy === 'function') pusher.destroy();
        } catch {}
      }
      pusherRef.current = null;
      localPushActiveRef.current = false;

      clearVideoElement(localVideoRef.current);
      clearVideoElement(localCameraPreviewRef.current);
      clearVideoElement(localScreenVideoRef.current);
      clearVideoElement(remoteVideoRef.current);
      clearVideoElement(remoteScreenVideoRef.current);

      if (mountedRef.current) {
        setJoined(false);
        setMicMuted(true);
        setCameraMuted(true);
        setRemotePresent(false);
        setRemoteReady(false);
        setRemoteScreenSharing(false);
        setScreenShareSupported(false);
        setScreenSharing(false);
        setScreenActionPending(false);
        setCameraActionPending(false);
        setLocalScreenReady(false);
        setRemoteScreenReady(false);
      }
    } finally {
      localPushActiveRef.current = false;
      logRemoteCleanup('leaveAndDestroy', {
        stage: 'finally',
        remoteUserId: currentRemoteUserIdRef.current,
        playbackActive: remotePlaybackActiveRef.current,
        willStopPlay: false,
        willDestroy: false,
      });
      cleaningRef.current = false;
    }
  }, [clearPresenceHeartbeat, clearRemotePlaybackRetry, courseId, logRemoteCleanup, stopLocalPush, stopScreenShare, teardownRemotePlayback]);

  useEffect(() => {
    if (!joined) {
      clearRemoteMediaMonitor();
      remoteMediaHeartbeatRef.current = 0;
      remoteMediaLastTimeRef.current = 0;
      clearRemoteScreenMonitor();
      remoteScreenHeartbeatRef.current = 0;
      remoteScreenLastTimeRef.current = 0;
      return undefined;
    }

    const video = remoteScreenVideoRef.current;
    if (!video) return undefined;

    let disposed = false;

    const handleTrackEnded = () => {
      if (disposed) return;
      markRemoteScreenIdle();
    };

    const handleTrackMuted = () => {
      if (disposed) return;
      markRemoteScreenIdle();
    };

    const handleTrackUnmuted = () => {
      if (disposed) return;
      markRemoteScreenReady();
    };

    const bindCurrentStream = () => {
      const nextStream = video.srcObject || null;
      if (remoteScreenObservedStreamRef.current === nextStream) return;

      clearRemoteScreenStreamBindings();

      if (!nextStream || typeof nextStream.getVideoTracks !== 'function') {
        if (!nextStream && remoteScreenReadyRef.current) {
          markRemoteScreenIdle();
        }
        return;
      }

      const removers = [];
      const addListener = (target, eventName, handler) => {
        if (!target || typeof target.addEventListener !== 'function') return;
        try {
          target.addEventListener(eventName, handler);
          removers.push(() => {
            try {
              target.removeEventListener(eventName, handler);
            } catch {}
          });
        } catch {}
      };

      nextStream.getVideoTracks().forEach((track) => {
        addListener(track, 'ended', handleTrackEnded);
        addListener(track, 'mute', handleTrackMuted);
        addListener(track, 'unmute', handleTrackUnmuted);
      });
      addListener(nextStream, 'removetrack', handleTrackEnded);
      addListener(nextStream, 'inactive', handleTrackEnded);

      remoteScreenObservedStreamRef.current = nextStream;
      remoteScreenStreamCleanupRef.current = () => {
        removers.forEach((remove) => remove());
      };
      scheduleFrameWatch();
    };

    const scheduleFrameWatch = () => {
      if (disposed || typeof video.requestVideoFrameCallback !== 'function') return;
      try {
        remoteScreenFrameCallbackIdRef.current = video.requestVideoFrameCallback(() => {
          remoteScreenFrameCallbackIdRef.current = null;
          if (disposed) return;
          markRemoteScreenReady();
          scheduleFrameWatch();
        });
      } catch {}
    };

    const inspectRemoteScreen = () => {
      if (disposed) return;

      bindCurrentStream();

      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      if (currentTime > remoteScreenLastTimeRef.current) {
        markRemoteScreenReady();
      }

      const stream = remoteScreenObservedStreamRef.current;
      const liveTracks = stream?.getVideoTracks?.().filter((track) => track.readyState === 'live') || [];
      const hasMutedTrack = liveTracks.some((track) => track.muted);
      const hasSource = Boolean(stream || safeText(video.currentSrc) || safeText(video.src));
      const hasUsableTracks = stream ? liveTracks.length > 0 : true;

      if (!hasSource || !hasUsableTracks || hasMutedTrack) {
        if (remoteScreenReadyRef.current) {
          markRemoteScreenIdle();
        }
        return;
      }

      const staleForMs = Date.now() - remoteScreenHeartbeatRef.current;
      if (
        remoteScreenReadyRef.current
        && remoteScreenHeartbeatRef.current
        && staleForMs > REMOTE_SCREEN_STALE_TIMEOUT_MS
      ) {
        markRemoteScreenIdle();
      }
    };

    bindCurrentStream();
    scheduleFrameWatch();
    remoteScreenMonitorTimerRef.current = window.setInterval(inspectRemoteScreen, 1000);
    inspectRemoteScreen();

    return () => {
      disposed = true;
      clearRemoteScreenMonitor();
    };
  }, [joined, clearRemoteMediaMonitor, clearRemoteScreenMonitor, clearRemoteScreenStreamBindings, markRemoteScreenIdle, markRemoteScreenReady]);

  useEffect(() => {
    if (!joined) return undefined;

    const video = remoteVideoRef.current;
    if (!video) return undefined;

    let disposed = false;

    const handleRemotePlaybackMissing = () => {
      if (disposed || !mountedRef.current || !joinedRef.current || !remoteReadyRef.current) return;
      void recoverRemotePlayback({
        statusText: buildJoinedStatusText({ remoteReady: false }),
        delayMs: 5000,
        minIntervalMs: 3500,
      });
    };

    const handleProgress = () => {
      if (disposed) return;
      markRemoteMediaProgress();
      if (mountedRef.current) {
        setRemoteReady(true);
      }
    };

    const inspectRemotePlayback = () => {
      if (disposed || !remoteReadyRef.current) return;

      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      if (currentTime > remoteMediaLastTimeRef.current) {
        handleProgress();
        return;
      }

      const hasSource = Boolean(video.srcObject || safeText(video.currentSrc) || safeText(video.src));
      const readyState = Number.isFinite(video.readyState) ? video.readyState : 0;
      const networkState = Number.isFinite(video.networkState) ? video.networkState : 0;
      const staleForMs = Date.now() - remoteMediaHeartbeatRef.current;

      if (!hasSource || video.ended || networkState === 3) {
        handleRemotePlaybackMissing();
        return;
      }

      if (remoteMediaHeartbeatRef.current && staleForMs > 4500 && readyState < 2) {
        handleRemotePlaybackMissing();
      }
    };

    const handleFault = () => {
      if (disposed) return;
      handleRemotePlaybackMissing();
    };

    const progressEvents = ['loadeddata', 'canplay', 'playing', 'timeupdate'];
    const faultEvents = ['emptied', 'ended', 'abort', 'error', 'stalled'];

    progressEvents.forEach((eventName) => {
      video.addEventListener(eventName, handleProgress);
    });
    faultEvents.forEach((eventName) => {
      video.addEventListener(eventName, handleFault);
    });

    remoteMediaMonitorTimerRef.current = window.setInterval(inspectRemotePlayback, 1000);
    inspectRemotePlayback();

    return () => {
      disposed = true;
      clearRemoteMediaMonitor();
      progressEvents.forEach((eventName) => {
        video.removeEventListener(eventName, handleProgress);
      });
      faultEvents.forEach((eventName) => {
        video.removeEventListener(eventName, handleFault);
      });
    };
  }, [buildJoinedStatusText, joined, clearRemoteMediaMonitor, markRemoteMediaProgress, recoverRemotePlayback]);

  useEffect(() => {
    if (!joined) {
      clearPresenceHeartbeat();
      setRemotePresent(false);
      setRemoteScreenSharing(false);
      return undefined;
    }

    let disposed = false;

    const heartbeat = async () => {
      if (disposed || !mountedRef.current || !joinedRef.current) return;
      await syncClassroomPresence();
      if (disposed || !mountedRef.current || !joinedRef.current) return;
      presenceHeartbeatTimerRef.current = window.setTimeout(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    };

    void heartbeat();

    return () => {
      disposed = true;
      clearPresenceHeartbeat();
    };
  }, [clearPresenceHeartbeat, joined, syncClassroomPresence]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOpaqueRuntimeError = (event) => {
      processRuntimeEvent(event, { alreadySuppressed: true });
    };

    const previousGuard = window.__MENTORY_CLASSROOM_RUNTIME_GUARD__;
    window.__MENTORY_CLASSROOM_RUNTIME_GUARD__ = {
      ...(previousGuard && typeof previousGuard === 'object' ? previousGuard : {}),
      active: true,
      suppressOpaqueRuntimeErrors: true,
      handleOpaqueRuntimeError,
    };

    return () => {
      const currentGuard = window.__MENTORY_CLASSROOM_RUNTIME_GUARD__;
      if (!currentGuard || currentGuard.handleOpaqueRuntimeError !== handleOpaqueRuntimeError) return;
      window.__MENTORY_CLASSROOM_RUNTIME_GUARD__ = {
        ...currentGuard,
        active: false,
        suppressOpaqueRuntimeErrors: false,
        handleOpaqueRuntimeError: null,
      };
    };
  }, [processRuntimeEvent]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      const normalizedCourseId = safeText(courseId);
      if (!normalizedCourseId) {
        if (!cancelled && mountedRef.current) {
          setErrorMessage('无效课程ID');
          setStatusText('无效课程ID');
          setJoining(false);
        }
        return;
      }

      if (!cancelled && mountedRef.current) {
        setJoining(true);
        setJoined(false);
        setRemotePresent(false);
        setRemoteReady(false);
        setRemoteScreenSharing(false);
        setMicMuted(true);
        setCameraMuted(true);
        setScreenShareSupported(false);
        setScreenSharing(false);
        setScreenActionPending(false);
        setCameraActionPending(false);
        setLocalScreenReady(false);
        setRemoteScreenReady(false);
        setErrorMessage('');
        setStatusText('正在请求课堂鉴权...');
      }

      try {
        const response = await api.get(`/api/rtc/classrooms/${encodeURIComponent(normalizedCourseId)}/auth`);
        if (cancelled || !mountedRef.current) return;

        const sessionInfo = response?.data?.session && typeof response.data.session === 'object'
          ? response.data.session
          : null;
        const liveAuth = toLiveAuthInfo(response?.data?.liveAuth);

        if (!liveAuth) {
          throw new Error('课堂鉴权返回无效');
        }

        liveAuthRef.current = liveAuth;
        setSession(sessionInfo);
        setStatusText('正在加载实时音视频 SDK...');

        const sdk = await loadAliyunLiveSdk();
        if (cancelled || !mountedRef.current) return;

        const supportResult = normalizeSupportResult(
          typeof sdk.AlivcLivePusher?.checkSystemRequirements === 'function'
            ? await sdk.AlivcLivePusher.checkSystemRequirements()
            : true
        );
        if (!supportResult.supported) {
          const reason = supportResult.reason ? `：${supportResult.reason}` : '';
          throw new Error(`当前浏览器不支持阿里云实时音视频${reason}`);
        }

        setStatusText('正在初始化本地设备...');
        setScreenShareSupported(
          typeof sdk.AlivcLivePusher?.checkScreenShareSupported === 'function'
            ? Boolean(sdk.AlivcLivePusher.checkScreenShareSupported())
            : typeof navigator?.mediaDevices?.getDisplayMedia === 'function'
        );

        const pusher = new sdk.AlivcLivePusher();
        pusherRef.current = pusher;

        bindEmitter(pusher?.error, 'system', (error) => {
          reportRuntimeIssue(error, '课堂连接发生错误，请稍后重试');
        });

        bindEmitter(pusher?.error, 'sdk', (error) => {
          reportRuntimeIssue(error, '实时音视频 SDK 内部错误，请重新进入课堂');
        });

        bindEmitter(pusher?.network, 'connectionlost', () => {
          if (!mountedRef.current) return;
          setStatusText('网络波动，正在重连课堂...');
        });

        bindEmitter(pusher?.network, 'reconnectstart', () => {
          if (!mountedRef.current) return;
          setStatusText('课堂重连中...');
        });

        bindEmitter(pusher?.network, 'reconnectfail', (error) => {
          reportRuntimeIssue(error, '课堂重连失败，请检查网络后重新进入');
        });

        bindEmitter(pusher?.network, 'reconnectend', () => {
          if (!mountedRef.current) return;
          setStatusText(buildJoinedStatusText());
        });

        bindEmitter(pusher?.network, 'reconnectsucceed', () => {
          if (!mountedRef.current) return;
          setErrorMessage('');
          setStatusText(buildJoinedStatusText());
        });

        bindEmitter(pusher?.network, 'networkrecovery', () => {
          if (!mountedRef.current) return;
          setStatusText(buildJoinedStatusText());
        });

        bindEmitter(pusher?.info, 'bye', (_code, reason) => {
          if (!mountedRef.current) return;
          const message = safeText(reason) || '课堂已断开';
          setErrorMessage(message);
          setStatusText(message);
        });

        const initConfig = {
          audio: true,
          video: false,
          connectRetryCount: 3,
          logLevel: resolveAliyunSdkLogLevelNone(sdk),
        };
        if (sdk.AlivcResolutionEnum?.RESOLUTION_720P) {
          initConfig.resolution = sdk.AlivcResolutionEnum.RESOLUTION_720P;
        }
        if (sdk.AlivcFpsEnum?.FPS_20) {
          initConfig.fps = sdk.AlivcFpsEnum.FPS_20;
        } else if (sdk.AlivcFpsEnum?.FPS_15) {
          initConfig.fps = sdk.AlivcFpsEnum.FPS_15;
        }

        await pusher.init(initConfig);
        if (cancelled || !mountedRef.current) return;
        syncLocalMicMuteState(true);

        if (cancelled || !mountedRef.current) return;

        setStatusText('正在进入课堂...');
        if (cancelled || !mountedRef.current) return;

        joinedRef.current = true;
        setJoined(true);
        setJoining(false);
        setStatusText(buildJoinedStatusText({ remotePresent: false, remoteReady: false }));

        try {
          await startLocalPush();
          syncLocalMicMuteState(true);
        } catch (pushError) {
          if (mountedRef.current) {
            setErrorMessage(parseErrorMessage(pushError, '课堂媒体上线失败，可尝试重新进入课堂'));
          }
        }

        void startRemotePlayback();
      } catch (error) {
        const message = parseErrorMessage(error, '进入课堂失败，请稍后重试');
        if (!cancelled && mountedRef.current) {
          setErrorMessage(message);
          setStatusText(message);
          setJoining(false);
        }
        await leaveAndDestroy();
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      void leaveAndDestroy();
    };
  }, [buildJoinedStatusText, courseId, leaveAndDestroy, reportRuntimeIssue, startLocalPush, startRemotePlayback, syncLocalMicMuteState]);

  useEffect(() => {
    const handleWindowRuntimeEvent = (event) => {
      processRuntimeEvent(event);
    };

    window.addEventListener('error', handleWindowRuntimeEvent, true);
    window.addEventListener('unhandledrejection', handleWindowRuntimeEvent, true);
    return () => {
      window.removeEventListener('error', handleWindowRuntimeEvent, true);
      window.removeEventListener('unhandledrejection', handleWindowRuntimeEvent, true);
    };
  }, [processRuntimeEvent]);

  const handleToggleMic = useCallback(async () => {
    const pusher = pusherRef.current;
    if (!pusher || !joinedRef.current) return;

    const nextMuted = !micMuted;
    try {
      if (!nextMuted && !localPushActiveRef.current && !hasActiveLocalPushSession(pusher)) {
        await startLocalPush();
      }

      if (localPushActiveRef.current || hasActiveLocalPushSession(pusher) || !cameraMuted || screenSharing) {
        syncLocalMicMuteState(nextMuted);
      }
      if (mountedRef.current) {
        setMicMuted(nextMuted);
        setErrorMessage('');
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '麦克风切换失败'));
    }
  }, [cameraMuted, micMuted, screenSharing, startLocalPush, syncLocalMicMuteState]);

  const handleToggleCamera = useCallback(async () => {
    const pusher = pusherRef.current;
    if (!pusher || !joinedRef.current || cameraActionPendingRef.current) return;

    const nextMuted = !cameraMuted;
    cameraActionPendingRef.current = true;
    if (mountedRef.current) setCameraActionPending(true);

    try {
      if (nextMuted) {
        await pusher.stopCamera();
        detachVisibleCameraPreview();
      } else {
        await pusher.startCamera();
        await startLocalPush();
        syncLocalMicMuteState(micMuted);
        await startVisibleCameraPreview();
      }
      if (mountedRef.current) {
        setCameraMuted(nextMuted);
        setErrorMessage('');
      }
    } catch (error) {
      if (!nextMuted) {
        try {
          await pusher.stopCamera();
        } catch {}
        detachVisibleCameraPreview();
      }
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '摄像头切换失败'));
    } finally {
      cameraActionPendingRef.current = false;
      if (mountedRef.current) setCameraActionPending(false);
    }
  }, [cameraMuted, detachVisibleCameraPreview, micMuted, startLocalPush, startVisibleCameraPreview, syncLocalMicMuteState]);

  const handleToggleScreenShare = useCallback(async () => {
    const pusher = pusherRef.current;
    if (!pusher || !joinedRef.current || screenActionPendingRef.current) return;

    if (!screenShareSupported) {
      if (mountedRef.current) {
        setErrorMessage('当前浏览器不支持共享屏幕');
      }
      return;
    }

    screenActionPendingRef.current = true;
    if (mountedRef.current) setScreenActionPending(true);

    try {
      if (screenSharing) {
        await stopScreenShare();
        return;
      }

      if (typeof pusher.startScreenShare !== 'function') {
        throw new Error('当前阿里云音视频 SDK 不支持共享屏幕');
      }

      screenShareCancelSilenceUntilRef.current = Date.now() + 3000;
      await pusher.startScreenShare();
      screenShareCancelSilenceUntilRef.current = 0;
      if (typeof pusher.updateScreenVideoProfile === 'function') {
        try {
          await pusher.updateScreenVideoProfile(
            SCREEN_SHARE_PROFILE.width,
            SCREEN_SHARE_PROFILE.height,
            SCREEN_SHARE_PROFILE.bitrateKbps,
            SCREEN_SHARE_PROFILE.fps
          );
        } catch {}
      }

      if (localScreenVideoRef.current && typeof pusher.startPreview === 'function') {
        const previewStream = await pusher.startPreview(localScreenVideoRef.current, true);
        screenPreviewStreamRef.current = previewStream || null;

        const screenTrack = previewStream?.getVideoTracks?.()?.[0] || null;
        if (screenTrack) {
          const endedHandler = () => {
            void stopScreenShare();
          };
          screenTrackRef.current = screenTrack;
          screenTrackEndedHandlerRef.current = endedHandler;
          try {
            screenTrack.addEventListener('ended', endedHandler, { once: true });
          } catch {}
        }
      }

      syncLocalMicMuteState(micMuted);
      await startLocalPush();

      if (mountedRef.current) {
        setScreenSharing(true);
        setErrorMessage('');
        setStatusText('正在共享屏幕');
      }
      void syncClassroomPresence({ screenSharing: true });
    } catch (error) {
      await stopScreenShare({ silent: true });
      if (isUserCancelledScreenShareError(error)) {
        if (mountedRef.current) setErrorMessage('');
        return;
      }
      screenShareCancelSilenceUntilRef.current = 0;
      if (mountedRef.current) {
        setErrorMessage(parseErrorMessage(error, '共享屏幕失败'));
      }
      void syncClassroomPresence({ screenSharing: false });
    } finally {
      screenActionPendingRef.current = false;
      if (mountedRef.current) setScreenActionPending(false);
    }
  }, [micMuted, screenShareSupported, screenSharing, startLocalPush, stopScreenShare, syncClassroomPresence, syncLocalMicMuteState]);

  const handleLeaveClassroom = useCallback(async () => {
    if (mountedRef.current) setStatusText('正在离开课堂...');
    await leaveAndDestroy();
    navigate(backHref, { replace: true });
  }, [backHref, leaveAndDestroy, navigate]);

  const controlsDisabled = joining || !joined;
  const micControlDisabled = controlsDisabled;
  const cameraControlDisabled = controlsDisabled || cameraActionPending;
  const screenControlDisabled = controlsDisabled || !screenShareSupported || screenActionPending;

  return (
    <div className="classroom-page">
      <div className="container">
        <header className="classroom-header">
          <BrandMark className="nav-logo-text" to={backHref} />
        </header>

        <section className="classroom-meta">
          <h1>课堂</h1>
          <div className="classroom-status">{statusText}</div>
          {errorMessage ? <div className="classroom-error" role="alert">{errorMessage}</div> : null}
        </section>

        <section className={`classroom-presentation-stage ${presentationVisible ? 'is-visible' : ''}`}>
          <article className="classroom-video-panel classroom-video-panel--presentation">
            <div className="classroom-video-title">{presentationTitle}</div>
            <div className="classroom-video-box classroom-video-box--presentation">
              <video
                ref={remoteScreenVideoRef}
                autoPlay
                playsInline
                className={`classroom-presentation-video ${remoteScreenReady ? 'is-active' : ''}`}
                onLoadedData={markRemoteScreenReady}
                onCanPlay={markRemoteScreenReady}
                onPlaying={markRemoteScreenReady}
                onEmptied={() => markRemoteScreenIdle()}
                onEnded={() => markRemoteScreenIdle()}
                onAbort={() => markRemoteScreenIdle()}
              />
              {!remoteScreenReady ? (
                <div className="classroom-video-placeholder">{presentationPlaceholder}</div>
              ) : null}
            </div>
          </article>
        </section>

        <section className={`classroom-stage ${presentationVisible ? 'is-covered' : ''}`}>
          <article className="classroom-video-panel">
            <div className="classroom-video-title">我的画面</div>
            <div className="classroom-video-box">
              {cameraMuted ? <div className="classroom-video-placeholder">{LOCAL_CAMERA_OFF_TEXT}</div> : null}
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
          </article>

          <article className="classroom-video-panel">
            <div className="classroom-video-title">对方画面</div>
            <div className="classroom-video-box">
              {!remoteReady && <div className="classroom-video-placeholder">{remoteVideoPlaceholder}</div>}
              <video ref={remoteVideoRef} autoPlay playsInline />
            </div>
          </article>
        </section>

        <section className="classroom-controls">
          <button
            type="button"
            className="classroom-control-btn"
            disabled={micControlDisabled}
            onClick={handleToggleMic}
          >
            {micMuted ? <FiMicOff size={16} /> : <FiMic size={16} />}
            <span>{micMuted ? '开启麦克风' : '关闭麦克风'}</span>
          </button>

          <button
            type="button"
            className="classroom-control-btn"
            disabled={cameraControlDisabled}
            onClick={handleToggleCamera}
          >
            {cameraMuted ? <FiVideoOff size={16} /> : <FiVideo size={16} />}
            <span>{cameraMuted ? '开启摄像头' : '关闭摄像头'}</span>
          </button>

          <button
            type="button"
            className={`classroom-control-btn ${screenSharing ? 'active' : ''}`}
            disabled={screenControlDisabled}
            onClick={handleToggleScreenShare}
            title={!screenShareSupported ? '当前浏览器不支持共享屏幕' : ''}
          >
            <FiMonitor size={16} />
            <span>{screenSharing ? '停止共享' : '共享屏幕'}</span>
          </button>

          <button
            type="button"
            className="classroom-control-btn leave"
            onClick={handleLeaveClassroom}
          >
            <FiPhoneOff size={16} />
            <span>离开课堂</span>
          </button>
        </section>

        <div className="classroom-hidden-preview" aria-hidden="true">
          <video
            ref={localCameraPreviewRef}
            autoPlay
            playsInline
            muted
          />
          <video
            ref={localScreenVideoRef}
            autoPlay
            playsInline
            muted
            onLoadedData={() => setLocalScreenReady(true)}
            onCanPlay={() => setLocalScreenReady(true)}
            onPlaying={() => setLocalScreenReady(true)}
            onEmptied={() => setLocalScreenReady(false)}
            onEnded={() => setLocalScreenReady(false)}
          />
        </div>
      </div>
    </div>
  );
}

export default ClassroomPage;
