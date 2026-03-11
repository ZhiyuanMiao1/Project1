import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMic, FiMicOff, FiMonitor, FiPhoneOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import api from '../../api/client';
import './ClassroomPage.css';

const LIVE_SDK_URL = 'https://g.alicdn.com/apsara-media-box/imp-web-live-push/6.4.9/alivc-live-push.js';
const SCREEN_SHARE_PROFILE = {
  width: 1920,
  height: 1080,
  bitrateKbps: 4000,
  fps: 15,
};

let liveSdkPromise = null;

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const parseErrorMessage = (error, fallback) => {
  const responseMessage = safeText(error?.response?.data?.error);
  if (responseMessage) return responseMessage;
  const rawMessage = safeText(error?.message || error?.reason || error?.description || error?.msg);
  const code = Number(error?.code ?? error?.errorCode);
  if (rawMessage && Number.isFinite(code)) return `${rawMessage} (code: ${code})`;
  if (rawMessage) return rawMessage;
  if (Number.isFinite(code)) return `${fallback} (code: ${code})`;
  return fallback;
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
  const remoteRetryTimerRef = useRef(0);
  const remoteReadyRef = useRef(false);
  const remoteLabelRef = useRef('对方');
  const startRemotePlaybackRef = useRef(async () => {});

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
  const [localScreenReady, setLocalScreenReady] = useState(false);
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
  const localShareNotice = useMemo(() => {
    if (remoteScreenReady) return '';
    if (screenActionPending) return '正在准备共享屏幕...';
    if (screenSharing || localScreenReady) {
      return '你正在共享屏幕。为避免无限镜像，本地大预览已隐藏。';
    }
    return '';
  }, [localScreenReady, remoteScreenReady, screenActionPending, screenSharing]);

  remoteReadyRef.current = remoteReady;
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

  const reportRuntimeIssue = useCallback((error, fallback) => {
    if (!mountedRef.current) return;
    const message = parseErrorMessage(error, fallback);
    setErrorMessage(message);
    setStatusText(message);
  }, []);

  const teardownRemotePlayback = useCallback(async () => {
    clearRemotePlaybackRetry();

    const player = playerRef.current;
    playerRef.current = null;

    if (player) {
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
    }

    clearVideoElement(remoteVideoRef.current);
    clearVideoElement(remoteScreenVideoRef.current);

    if (mountedRef.current) {
      setRemoteReady(false);
      setRemoteScreenReady(false);
    }
  }, [clearRemotePlaybackRetry]);

  const scheduleRemotePlaybackRetry = useCallback((delayMs = 3000) => {
    clearRemotePlaybackRetry();
    if (!mountedRef.current || !joinedRef.current) return;

    remoteRetryTimerRef.current = window.setTimeout(() => {
      remoteRetryTimerRef.current = 0;
      if (!mountedRef.current || !joinedRef.current) return;
      void startRemotePlaybackRef.current();
    }, delayMs);
  }, [clearRemotePlaybackRetry]);

  const startRemotePlayback = useCallback(async () => {
    const sdk = resolveAliyunLiveSdk();
    const liveAuth = liveAuthRef.current;
    const remotePlayUrl = safeText(liveAuth?.remotePlayUrl);
    const remoteUserId = safeText(liveAuth?.remoteUserId);
    const displayName = safeText(remoteLabelRef.current) || '对方';

    if (!sdk || !remotePlayUrl || !remoteUserId || !remoteVideoRef.current || !joinedRef.current) return;

    await teardownRemotePlayback();

    try {
      const player = new sdk.AlivcLivePlayer();
      playerRef.current = player;

      const playInfo = await player.startPlay(
        remotePlayUrl,
        remoteVideoRef.current,
        remoteScreenVideoRef.current || undefined
      );
      if (!mountedRef.current || playerRef.current !== player) {
        try {
          if (typeof player.stopPlay === 'function') await player.stopPlay();
        } catch {}
        try {
          if (typeof player.destroy === 'function') player.destroy();
        } catch {}
        return;
      }

      if (mountedRef.current) {
        setErrorMessage('');
        setStatusText(`已进入课堂，等待${displayName}画面...`);
      }

      bindEmitter(playInfo, 'canplay', () => {
        if (!mountedRef.current) return;
        setRemoteReady(true);
        setErrorMessage('');
        setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'update', () => {
        if (!mountedRef.current) return;
        setRemoteReady(true);
        setErrorMessage('');
        if (joinedRef.current) setStatusText('双方已进入课堂');
      });

      bindEmitter(playInfo, 'userleft', () => {
        if (!mountedRef.current) return;
        setStatusText(`${displayName}已离开课堂`);
        void (async () => {
          await teardownRemotePlayback();
          if (!mountedRef.current || !joinedRef.current) return;
          scheduleRemotePlaybackRetry(2500);
        })();
      });
    } catch (error) {
      await teardownRemotePlayback();
      if (!mountedRef.current || !joinedRef.current) return;

      if (isRetryableRemotePlayError(error)) {
        setErrorMessage('');
        setStatusText(`已进入课堂，等待${displayName}加入...`);
        scheduleRemotePlaybackRetry(2500);
        return;
      }

      const message = parseErrorMessage(error, '拉取对方画面失败');
      setErrorMessage(message);
      setStatusText(message);
    }
  }, [scheduleRemotePlaybackRetry, teardownRemotePlayback]);

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
      screenActionPendingRef.current = false;

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
        setLocalScreenReady(false);
        setRemoteScreenReady(false);
      }
    } finally {
      cleaningRef.current = false;
    }
  }, [clearRemotePlaybackRetry, stopScreenShare, teardownRemotePlayback]);

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
  }, [courseId, leaveAndDestroy, reportRuntimeIssue, startRemotePlayback]);

  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      if (!looksLikeSdkErrorObject(reason)) return;
      event.preventDefault?.();
      reportRuntimeIssue(reason, '课堂连接发生错误，请稍后重试');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [reportRuntimeIssue]);

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
    if (!pusher || !joinedRef.current) return;

    const nextMuted = !cameraMuted;
    try {
      if (nextMuted) {
        await pusher.stopCamera();
      } else {
        await pusher.startCamera();
      }
      if (mountedRef.current) setCameraMuted(nextMuted);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '摄像头切换失败'));
    }
  }, [cameraMuted]);

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

      await pusher.startScreenShare();
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
                onLoadedData={() => setRemoteScreenReady(true)}
                onCanPlay={() => setRemoteScreenReady(true)}
                onPlaying={() => setRemoteScreenReady(true)}
                onEmptied={() => setRemoteScreenReady(false)}
                onEnded={() => setRemoteScreenReady(false)}
              />
              {!remoteScreenReady ? (
                <div className="classroom-video-placeholder">{presentationPlaceholder}</div>
              ) : null}
            </div>
          </article>
        </section>

        {localShareNotice ? (
          <section className="classroom-share-notice" aria-live="polite">
            {localShareNotice}
          </section>
        ) : null}

        <section className={`classroom-stage ${presentationVisible ? 'is-covered' : ''}`}>
          <article className="classroom-video-panel">
            <div className="classroom-video-title">我的画面</div>
            <div className="classroom-video-box">
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
          </article>

          <article className="classroom-video-panel">
            <div className="classroom-video-title">对方画面</div>
            <div className="classroom-video-box">
              {!remoteReady && <div className="classroom-video-placeholder">等待{remoteLabel}加入…</div>}
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
            disabled={controlsDisabled}
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
