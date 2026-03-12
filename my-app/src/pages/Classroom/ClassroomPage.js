import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

let liveSdkPromise = null;

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const isObjectLike = (value) => Boolean(value) && typeof value === 'object';
const OPAQUE_RUNTIME_PLACEHOLDER = '[object Object]';
const isOpaqueRuntimePlaceholder = (value) => safeText(value) === OPAQUE_RUNTIME_PLACEHOLDER;

const parseErrorMessage = (error, fallback) => {
  const responseMessage = safeText(error?.response?.data?.error);
  if (responseMessage && !isOpaqueRuntimePlaceholder(responseMessage)) return responseMessage;
  const rawMessage = safeText(error?.message || error?.reason || error?.description || error?.msg);
  const code = Number(error?.code ?? error?.errorCode);
  if (rawMessage && !isOpaqueRuntimePlaceholder(rawMessage) && Number.isFinite(code)) return `${rawMessage} (code: ${code})`;
  if (rawMessage && !isOpaqueRuntimePlaceholder(rawMessage)) return rawMessage;
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

const resolveWindowRuntimePayload = (event) => {
  const rawPayload = getWindowRuntimePayloadCandidate(event);
  const directPayload = unwrapRuntimeErrorPayload(rawPayload);
  if (directPayload) return directPayload;

  const message = safeText(event?.message);
  if (isOpaqueRuntimePlaceholder(rawPayload)) {
    return { message: OPAQUE_RUNTIME_PLACEHOLDER };
  }
  if (isObjectLike(rawPayload)) {
    return rawPayload;
  }

  if (isOpaqueRuntimePlaceholder(message)) {
    return { message };
  }

  return null;
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

const REMOTE_NOT_JOINED_TEXT = '对方暂未加入';
const REMOTE_RECONNECTING_TEXT = '对方网络波动，正在等待重新加入...';
const LOCAL_CAMERA_OFF_TEXT = '摄像头未开启';

const clearVideoElement = (element) => {
  if (!element) return;
  try {
    if (typeof element.pause === 'function') element.pause();
  } catch {}
  try {
    element.srcObject = null;
  } catch {}
  try {
    element.removeAttribute('src');
    if (typeof element.load === 'function') element.load();
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
  const localScreenVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const pusherRef = useRef(null);
  const playerRef = useRef(null);
  const liveAuthRef = useRef(null);
  const screenPreviewStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenTrackEndedHandlerRef = useRef(null);
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const cleaningRef = useRef(false);
  const screenActionPendingRef = useRef(false);
  const screenShareCancelSilenceUntilRef = useRef(0);
  const cameraActionPendingRef = useRef(false);
  const cameraPermissionPrimeAttemptedRef = useRef(false);
  const remoteRetryTimerRef = useRef(0);
  const remoteRecoveryPendingRef = useRef(false);
  const remoteRecoveryTimestampRef = useRef(0);
  const remoteReadyRef = useRef(false);
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

  const [joining, setJoining] = useState(true);
  const [joined, setJoined] = useState(false);
  const [session, setSession] = useState(null);
  const [statusText, setStatusText] = useState('准备进入课堂...');
  const [errorMessage, setErrorMessage] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(true);
  const [remoteReady, setRemoteReady] = useState(false);
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
  const presentationVisible = useMemo(() => remoteScreenReady, [remoteScreenReady]);
  const presentationTitle = useMemo(() => {
    if (remoteScreenReady) return `${remoteLabel}正在共享屏幕`;
    return '共享屏幕';
  }, [remoteLabel, remoteScreenReady]);
  const presentationPlaceholder = useMemo(() => {
    if (remoteScreenReady) return `等待${remoteLabel}的共享画面...`;
    return '暂未开始共享屏幕';
  }, [remoteLabel, remoteScreenReady]);
  remoteReadyRef.current = remoteReady;
  remoteScreenReadyRef.current = remoteScreenReady;
  remoteLabelRef.current = remoteLabel;

  const clearRemotePlaybackRetry = useCallback(() => {
    if (!remoteRetryTimerRef.current) return;
    window.clearTimeout(remoteRetryTimerRef.current);
    remoteRetryTimerRef.current = 0;
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

  const applyRemoteNotJoinedState = useCallback((options = {}) => {
    const nextStatusText = safeText(options.statusText) || REMOTE_NOT_JOINED_TEXT;
    if (!mountedRef.current) return;
    setErrorMessage('');
    setRemoteReady(false);
    markRemoteScreenIdle();
    setStatusText(nextStatusText);
  }, [markRemoteScreenIdle]);

  const detachVisibleCameraPreview = useCallback(() => {
    clearVideoElement(localVideoRef.current);
  }, []);

  const primeCameraPermission = useCallback(async () => {
    if (cameraPermissionPrimeAttemptedRef.current) return;
    cameraPermissionPrimeAttemptedRef.current = true;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      return;
    } finally {
      stream?.getTracks?.().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
  }, []);

  const destroyRemotePlayerInstance = useCallback(async (player) => {
    if (!player) return;
    try {
      if (typeof player.stopPlay === 'function') {
        await player.stopPlay();
      }
    } catch {}
    try {
      if (typeof player.destroy === 'function') {
        player.destroy();
      }
    } catch {}
  }, []);

  const teardownRemotePlayback = useCallback(async () => {
    clearRemotePlaybackRetry();
    clearRemoteScreenMonitor();

    const player = playerRef.current;
    playerRef.current = null;

    await destroyRemotePlayerInstance(player);

    clearVideoElement(remoteVideoRef.current);
    clearVideoElement(remoteScreenVideoRef.current);

    if (mountedRef.current) {
      setRemoteReady(false);
      setRemoteScreenReady(false);
    }
  }, [clearRemotePlaybackRetry, clearRemoteScreenMonitor, destroyRemotePlayerInstance]);

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
      || (remoteReadyRef.current ? REMOTE_RECONNECTING_TEXT : REMOTE_NOT_JOINED_TEXT);
    const now = Date.now();

    applyRemoteNotJoinedState({ statusText: nextStatusText });
    if (!mountedRef.current || !joinedRef.current) return;

    if (remoteRecoveryTimestampRef.current && now - remoteRecoveryTimestampRef.current < minIntervalMs) {
      scheduleRemotePlaybackRetry(Math.max(nextDelayMs, minIntervalMs));
      return;
    }

    if (remoteRecoveryPendingRef.current) {
      scheduleRemotePlaybackRetry(nextDelayMs);
      return;
    }

    remoteRecoveryTimestampRef.current = now;
    remoteRecoveryPendingRef.current = true;
    try {
      await teardownRemotePlayback();
    } finally {
      remoteRecoveryPendingRef.current = false;
      if (mountedRef.current && joinedRef.current) {
        scheduleRemotePlaybackRetry(nextDelayMs);
      }
    }
  }, [applyRemoteNotJoinedState, scheduleRemotePlaybackRetry, teardownRemotePlayback]);

  const startRemotePlayback = useCallback(async () => {
    const sdk = resolveAliyunLiveSdk();
    const liveAuth = liveAuthRef.current;
    const remotePlayUrl = safeText(liveAuth?.remotePlayUrl);
    const remoteUserId = safeText(liveAuth?.remoteUserId);
    const displayName = safeText(remoteLabelRef.current) || '对方';
    const hadRemoteStream = remoteReadyRef.current;
    let player = null;
    let sessionId = 0;
    const isActivePlayerSession = () => (
      Boolean(player)
      && playerRef.current === player
      && remotePlayerSessionRef.current === sessionId
    );

    if (!sdk || !remotePlayUrl || !remoteUserId || !remoteVideoRef.current || !joinedRef.current) return;

    await teardownRemotePlayback();

    try {
      player = new sdk.AlivcLivePlayer();
      sessionId = remotePlayerSessionRef.current + 1;
      remotePlayerSessionRef.current = sessionId;
      playerRef.current = player;

      const playInfo = await player.startPlay(
        remotePlayUrl,
        remoteVideoRef.current,
        remoteScreenVideoRef.current || undefined
      );
      if (!mountedRef.current || !isActivePlayerSession()) {
        await destroyRemotePlayerInstance(player);
        return;
      }

      if (mountedRef.current) {
        setErrorMessage('');
        setStatusText(`已进入课堂，等待${displayName}画面...`);
      }

      bindEmitter(playInfo, 'canplay', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        setRemoteReady(true);
        setErrorMessage('');
        setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'update', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        setRemoteReady(true);
        setErrorMessage('');
        if (joinedRef.current) setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'userleft', () => {
        if (!mountedRef.current || !isActivePlayerSession()) return;
        applyRemoteNotJoinedState({ statusText: `${displayName}已离开课堂` });
        void (async () => {
          if (!isActivePlayerSession()) return;
          await teardownRemotePlayback();
          if (!mountedRef.current || !joinedRef.current || remotePlayerSessionRef.current !== sessionId) return;
          scheduleRemotePlaybackRetry(5000);
        })();
      });
    } catch (error) {
      if (player && !isActivePlayerSession()) {
        await destroyRemotePlayerInstance(player);
        return;
      }
      await teardownRemotePlayback();
      if (!mountedRef.current || !joinedRef.current || (sessionId && remotePlayerSessionRef.current !== sessionId)) return;

      if (isRetryableRemotePlayError(error)) {
        applyRemoteNotJoinedState({
          statusText: hadRemoteStream ? REMOTE_RECONNECTING_TEXT : REMOTE_NOT_JOINED_TEXT,
        });
        scheduleRemotePlaybackRetry(2500);
        return;
      }

      const message = parseErrorMessage(error, '拉取对方画面失败');
      setErrorMessage(message);
      setStatusText(message);
    }
  }, [applyRemoteNotJoinedState, destroyRemotePlayerInstance, scheduleRemotePlaybackRetry, teardownRemotePlayback]);

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
        setStatusText(remoteReadyRef.current ? '双方已进入课堂' : `已停止共享屏幕，等待${safeText(remoteLabelRef.current) || '对方'}加入...`);
      }
    }
  }, [clearScreenTrackListener]);

  const leaveAndDestroy = useCallback(async () => {
    if (cleaningRef.current) return;
    cleaningRef.current = true;
    joinedRef.current = false;

    try {
      clearRemotePlaybackRetry();
      liveAuthRef.current = null;
      remoteRecoveryPendingRef.current = false;
      remoteRecoveryTimestampRef.current = 0;
      screenActionPendingRef.current = false;
      screenShareCancelSilenceUntilRef.current = 0;
      cameraActionPendingRef.current = false;
      cameraPermissionPrimeAttemptedRef.current = false;

      await stopScreenShare({ silent: true });

      await teardownRemotePlayback();

      const pusher = pusherRef.current;
      pusherRef.current = null;
      if (pusher) {
        try {
          if (typeof pusher.stopPush === 'function') await pusher.stopPush();
        } catch {}
        try {
          if (typeof pusher.stopPreview === 'function') await pusher.stopPreview();
        } catch {}
        try {
          if (typeof pusher.destroy === 'function') pusher.destroy();
        } catch {}
      }

      clearVideoElement(localVideoRef.current);
      clearVideoElement(localScreenVideoRef.current);
      clearVideoElement(remoteVideoRef.current);
      clearVideoElement(remoteScreenVideoRef.current);

      if (mountedRef.current) {
        setJoined(false);
        setRemoteReady(false);
        setScreenShareSupported(false);
        setScreenSharing(false);
        setScreenActionPending(false);
        setCameraActionPending(false);
        setLocalScreenReady(false);
        setRemoteScreenReady(false);
      }
    } finally {
      cleaningRef.current = false;
    }
  }, [clearRemotePlaybackRetry, stopScreenShare, teardownRemotePlayback]);

  useEffect(() => {
    if (!joined) {
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
        && staleForMs > 4000
        && (video.readyState === 0 || video.ended)
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
  }, [joined, clearRemoteScreenMonitor, clearRemoteScreenStreamBindings, markRemoteScreenIdle, markRemoteScreenReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOpaqueRuntimeError = () => {
      void recoverRemotePlayback();
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
  }, [recoverRemotePlayback]);

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
        setRemoteReady(false);
        setMicMuted(false);
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
          const displayName = safeText(remoteLabelRef.current) || '对方';
          setStatusText(remoteReadyRef.current ? '双方已进入课堂' : `已进入课堂，等待${displayName}加入...`);
        });

        bindEmitter(pusher?.network, 'reconnectsucceed', () => {
          if (!mountedRef.current) return;
          const displayName = safeText(remoteLabelRef.current) || '对方';
          setErrorMessage('');
          setStatusText(remoteReadyRef.current ? '双方已进入课堂' : `已进入课堂，等待${displayName}加入...`);
        });

        bindEmitter(pusher?.network, 'networkrecovery', () => {
          if (!mountedRef.current) return;
          const displayName = safeText(remoteLabelRef.current) || '对方';
          setStatusText(remoteReadyRef.current ? '双方已进入课堂' : `已进入课堂，等待${displayName}加入...`);
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

        if (!localVideoRef.current) {
          throw new Error('本地预览初始化失败');
        }
        await pusher.startPreview(localVideoRef.current);
        if (cancelled || !mountedRef.current) return;

        setStatusText('正在进入课堂...');
        await pusher.startPush(liveAuth.pushUrl);
        if (cancelled || !mountedRef.current) return;

        joinedRef.current = true;
        setJoined(true);
        setJoining(false);
        setStatusText(`已进入课堂，等待${safeText(remoteLabelRef.current) || '对方'}加入...`);

        void primeCameraPermission().catch(() => {});
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
  }, [courseId, leaveAndDestroy, primeCameraPermission, reportRuntimeIssue, startRemotePlayback]);

  useEffect(() => {
    const isRemoteRuntimeRecoveryActive = () => (
      joinedRef.current && (
        Boolean(playerRef.current)
        || Boolean(remoteRetryTimerRef.current)
        || remoteRecoveryPendingRef.current
      )
    );

    const shouldSuppressOpaqueRuntimeEvent = (event) => {
      const rawPayload = getWindowRuntimePayloadCandidate(event);
      if (isObjectLike(rawPayload)) return true;
      if (isOpaqueRuntimePlaceholder(rawPayload)) return true;
      return isOpaqueRuntimePlaceholder(event?.message);
    };

    const shouldRecoverFromRuntimePayload = (payload) => {
      if (!payload) return false;
      if (isRetryableRemotePlayError(payload)) return true;
      return isRemoteRuntimeRecoveryActive() && isObjectLike(payload);
    };

    const handleUnhandledRejection = (event) => {
      const reason = resolveWindowRuntimePayload(event);
      if (!reason && isRemoteRuntimeRecoveryActive() && shouldSuppressOpaqueRuntimeEvent(event)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        void recoverRemotePlayback();
        return;
      }
      if (!reason) return;
      if (shouldSilenceScreenShareCancelError(reason)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        if (mountedRef.current) setErrorMessage('');
        return;
      }
      if (shouldRecoverFromRuntimePayload(reason)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        void recoverRemotePlayback();
        return;
      }
      reportRuntimeIssue(reason, '课堂连接发生错误，请稍后重试');
    };

    const handleWindowError = (event) => {
      const runtimePayload = resolveWindowRuntimePayload(event);
      if (!runtimePayload && isRemoteRuntimeRecoveryActive() && shouldSuppressOpaqueRuntimeEvent(event)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        void recoverRemotePlayback();
        return;
      }
      if (!runtimePayload) return;
      if (shouldSilenceScreenShareCancelError(runtimePayload)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        if (mountedRef.current) setErrorMessage('');
        return;
      }
      if (shouldRecoverFromRuntimePayload(runtimePayload)) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        void recoverRemotePlayback();
        return;
      }
      reportRuntimeIssue(runtimePayload, '课堂连接发生错误，请稍后重试');
    };

    window.addEventListener('error', handleWindowError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
    return () => {
      window.removeEventListener('error', handleWindowError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, [recoverRemotePlayback, reportRuntimeIssue, shouldSilenceScreenShareCancelError]);

  const handleToggleMic = useCallback(() => {
    const pusher = pusherRef.current;
    if (!pusher || !joinedRef.current) return;

    const nextMuted = !micMuted;
    try {
      pusher.mute(nextMuted);
      if (mountedRef.current) setMicMuted(nextMuted);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '麦克风切换失败'));
    }
  }, [micMuted]);

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
        if (typeof pusher.startPreview === 'function' && localVideoRef.current) {
          await pusher.startPreview(localVideoRef.current);
        }
      }
      if (mountedRef.current) setCameraMuted(nextMuted);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '摄像头切换失败'));
    } finally {
      cameraActionPendingRef.current = false;
      if (mountedRef.current) setCameraActionPending(false);
    }
  }, [cameraMuted, detachVisibleCameraPreview]);

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

      if (mountedRef.current) {
        setScreenSharing(true);
        setErrorMessage('');
        setStatusText('正在共享屏幕');
      }
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
    } finally {
      screenActionPendingRef.current = false;
      if (mountedRef.current) setScreenActionPending(false);
    }
  }, [screenShareSupported, screenSharing, stopScreenShare]);

  const handleLeaveClassroom = useCallback(async () => {
    if (mountedRef.current) setStatusText('正在离开课堂...');
    await leaveAndDestroy();
    navigate(backHref, { replace: true });
  }, [backHref, leaveAndDestroy, navigate]);

  const controlsDisabled = joining || !joined;
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
              {!remoteReady && <div className="classroom-video-placeholder">{REMOTE_NOT_JOINED_TEXT}</div>}
              <video ref={remoteVideoRef} autoPlay playsInline />
            </div>
          </article>
        </section>

        <section className="classroom-controls">
          <button
            type="button"
            className="classroom-control-btn"
            disabled={controlsDisabled}
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
