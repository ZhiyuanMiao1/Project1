let aliyunRtcSdkPromise = null;

const isRtcEngineClass = (value) => (
  Boolean(value)
  && typeof value.isSupported === 'function'
  && (
    typeof value.createInstance === 'function'
    || typeof value.getInstance === 'function'
  )
);

/**
 * aliyun-rtc-sdk exposes different namespace shapes in webpack development,
 * production ESM, Jest/CommonJS and its UMD build. Normalize them once so the
 * classroom does not depend on `module.default` always being present.
 */
export const normalizeAliyunRtcSdkModule = (rawModule) => {
  const globalModule = typeof window !== 'undefined' ? window.AliRtcEngine : null;
  const candidates = [
    rawModule?.default?.default,
    rawModule?.default,
    rawModule?.AliRtcEngine?.default,
    rawModule?.AliRtcEngine,
    rawModule,
    globalModule?.default,
    globalModule,
  ].filter(Boolean);
  const engine = candidates.find(isRtcEngineClass);
  if (!engine) {
    throw new Error('阿里云实时音视频 SDK 导出无效，请刷新页面后重试');
  }

  const resolveExport = (name) => {
    for (const candidate of [rawModule, rawModule?.default, globalModule, engine]) {
      if (candidate?.[name]) return candidate[name];
    }
    return engine?.[name];
  };

  const normalized = {
    engine,
    AliRtcAudioTrack: resolveExport('AliRtcAudioTrack'),
    AliRtcEngineLocalDeviceExceptionType: resolveExport('AliRtcEngineLocalDeviceExceptionType'),
    AliRtcEngineLocalDeviceType: resolveExport('AliRtcEngineLocalDeviceType'),
    AliRtcPublishState: resolveExport('AliRtcPublishState'),
    AliRtcVideoTrack: resolveExport('AliRtcVideoTrack'),
  };
  if (
    !normalized.AliRtcAudioTrack
    || !normalized.AliRtcEngineLocalDeviceExceptionType
    || !normalized.AliRtcEngineLocalDeviceType
    || !normalized.AliRtcPublishState
    || !normalized.AliRtcVideoTrack
  ) {
    throw new Error('阿里云实时音视频 SDK 枚举导出不完整，请刷新页面后重试');
  }
  return normalized;
};

const loadAliyunRtcSdk = () => {
  if (!aliyunRtcSdkPromise) {
    aliyunRtcSdkPromise = import('aliyun-rtc-sdk')
      .then(normalizeAliyunRtcSdkModule)
      .catch((error) => {
        aliyunRtcSdkPromise = null;
        throw error;
      });
  }
  return aliyunRtcSdkPromise;
};

const hasCameraTrack = (track, videoTrackEnum) => (
  track === videoTrackEnum.AliRtcVideoTrackCamera
  || track === videoTrackEnum.AliRtcVideoTrackBoth
);

const hasScreenTrack = (track, videoTrackEnum) => (
  track === videoTrackEnum.AliRtcVideoTrackScreen
  || track === videoTrackEnum.AliRtcVideoTrackBoth
);

const prepareVideoElement = (element, muted = false) => {
  if (!element) return null;
  element.autoplay = true;
  element.playsInline = true;
  element.muted = muted;
  return element;
};

const normalizeAuthInfo = (value) => {
  const authInfo = value && typeof value === 'object' ? value : {};
  const timestamp = Number(authInfo.timestamp);
  if (
    !String(authInfo.appId || '').trim()
    || !String(authInfo.channelId || '').trim()
    || !String(authInfo.userId || '').trim()
    || !String(authInfo.token || '').trim()
    || !Number.isFinite(timestamp)
  ) {
    throw new Error('Aliyun RTC auth info is incomplete');
  }
  return { ...authInfo, timestamp };
};

// The SDK can dispatch a track-ended device exception shortly after an
// intentional stop. Keep a small, consumable window so a quick off/on sequence
// does not turn that delayed event into a user-visible hardware error.
const EXPECTED_DEVICE_STOP_WINDOW_MS = 2000;

/**
 * Thin classroom adapter for the official aliyun-rtc-sdk.
 *
 * Keep SDK-specific state changes in this file. ClassroomPage retains the old
 * AlivcLivePusher/AlivcLivePlayer branch; backend CLASSROOM_RTC_PROVIDER can
 * switch traffic back to that branch without reverting this source file.
 */
export class AliyunRtcSdkSession {
  static async checkSupport(direction = 'sendrecv') {
    const sdk = await loadAliyunRtcSdk();
    return sdk.engine.isSupported(direction);
  }

  static async create(options = {}) {
    const sdk = await loadAliyunRtcSdk();
    return new AliyunRtcSdkSession(options, sdk);
  }

  constructor(options = {}, sdk) {
    this.options = options;
    this.sdk = sdk;
    this.engine = typeof sdk.engine.createInstance === 'function'
      ? sdk.engine.createInstance()
      : sdk.engine.getInstance();
    this.remoteUserIds = Array.from(new Set((options.remoteUserIds || []).filter(Boolean)));
    this.allowedRemoteUsers = new Set(this.remoteUserIds);
    this.remoteTracks = new Map();
    this.eventBindings = [];
    this.operation = Promise.resolve();
    this.joined = false;
    this.destroyed = false;
    this.microphoneEnabled = false;
    this.cameraEnabled = false;
    this.screenEnabled = false;
    this.microphoneTargetEnabled = false;
    this.cameraTargetEnabled = false;
    this.screenTargetEnabled = false;
    this.expectedDeviceStops = new Map();
    this.bindEngineEvents();
  }

  isAllowedRemoteUser(userId) {
    return this.allowedRemoteUsers.size === 0 || this.allowedRemoteUsers.has(userId);
  }

  bind(eventName, handler) {
    this.engine.on(eventName, handler);
    this.eventBindings.push([eventName, handler]);
  }

  bindEngineEvents() {
    this.bind('connectionStatusChange', (status, reason) => {
      this.options.onConnectionStatusChange?.(status, reason);
    });
    this.bind('remoteUserOnLineNotify', (userId) => {
      if (!this.isAllowedRemoteUser(userId)) return;
      this.options.onRemoteUserOnline?.(userId);
    });
    this.bind('remoteUserOffLineNotify', (userId, reason) => {
      if (!this.isAllowedRemoteUser(userId)) return;
      this.remoteTracks.delete(userId);
      this.engine.setRemoteViewConfig(null, userId, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackCamera);
      this.engine.setRemoteViewConfig(null, userId, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackScreen);
      this.refreshRemoteScreenView();
      this.options.onRemoteUserOffline?.(userId, reason);
    });
    this.bind('remoteTrackAvailableNotify', (userId, audioTrack, videoTrack) => {
      if (!this.isAllowedRemoteUser(userId)) return;
      const cameraAvailable = hasCameraTrack(videoTrack, this.sdk.AliRtcVideoTrack);
      const screenAvailable = hasScreenTrack(videoTrack, this.sdk.AliRtcVideoTrack);
      const audioAvailable = audioTrack !== this.sdk.AliRtcAudioTrack.AliRtcAudioTrackNo;
      this.remoteTracks.set(userId, { cameraAvailable, screenAvailable, audioAvailable });

      this.engine.subscribeRemoteMediaStream(
        userId,
        videoTrack,
        cameraAvailable || screenAvailable,
        audioAvailable
      );

      const cameraElement = prepareVideoElement(
        this.options.getRemoteCameraElement?.(userId),
        Boolean(this.options.observer)
      );
      this.engine.setRemoteViewConfig(
        cameraAvailable ? cameraElement : null,
        userId,
        this.sdk.AliRtcVideoTrack.AliRtcVideoTrackCamera
      );
      this.refreshRemoteScreenView();
      this.options.onRemoteTrackChange?.(userId, {
        audioAvailable,
        cameraAvailable,
        screenAvailable,
      });
    });
    this.bind('userVideoMuted', (userId, muted) => {
      if (this.isAllowedRemoteUser(userId)) this.options.onRemoteCameraMuted?.(userId, muted);
    });
    this.bind('userScreenMuted', (userId, muted) => {
      if (this.isAllowedRemoteUser(userId)) this.options.onRemoteScreenMuted?.(userId, muted);
    });
    this.bind('remoteVideoAutoPlayFail', (userId, track) => {
      if (!this.isAllowedRemoteUser(userId)) return;
      try {
        this.engine.resumeRemoteMediaStream(userId, track);
      } catch (error) {
        this.options.onError?.(error);
      }
    });
    this.bind('screenSharePublishStateChanged', (_oldState, newState) => {
      const stillPublishing = (
        newState === this.sdk.AliRtcPublishState.AliRtcStatePublishing
        || newState === this.sdk.AliRtcPublishState.AliRtcStatePublished
      );
      if (this.screenEnabled && !stillPublishing) {
        this.screenEnabled = false;
        this.screenTargetEnabled = false;
        this.options.onLocalScreenEnded?.();
      }
    });
    this.bind('localDeviceException', (deviceType, exceptionType, description) => {
      const deviceTypes = this.sdk.AliRtcEngineLocalDeviceType;
      const exceptionTypes = this.sdk.AliRtcEngineLocalDeviceExceptionType;
      const isDisplayEnded = (
        deviceType === deviceTypes.AliEngineLocalDeviceTypeDisplay
        && exceptionType === exceptionTypes.AliEngineLocalDeviceExceptionTypeDisplayException
      );
      if (isDisplayEnded) {
        // The browser's own "Stop sharing" button ends the display track and
        // arrives as this SDK exception. It is a state transition, not an error.
        if (this.screenEnabled) {
          this.screenEnabled = false;
          this.screenTargetEnabled = false;
          this.options.onLocalScreenEnded?.();
        }
        return;
      }
      if (this.shouldIgnoreLocalDeviceException(deviceType, exceptionType)) return;
      if (deviceType === deviceTypes.AliEngineLocalDeviceTypeMic) {
        this.microphoneEnabled = false;
        this.microphoneTargetEnabled = false;
      } else if (
        deviceType === deviceTypes.AliEngineLocalDeviceTypeCamera
        || deviceType === deviceTypes.AliEngineLocalDeviceTypeVideoDevice
      ) {
        this.cameraEnabled = false;
        this.cameraTargetEnabled = false;
      }
      if (this.options.onLocalDeviceException) {
        this.options.onLocalDeviceException({ deviceType, exceptionType, description });
        return;
      }
      this.options.onError?.(new Error(description || 'Local media device error'));
    });
  }

  markExpectedDeviceStop(deviceType) {
    this.expectedDeviceStops.set(deviceType, Date.now() + EXPECTED_DEVICE_STOP_WINDOW_MS);
  }

  consumeExpectedDeviceStop(deviceType) {
    const expiresAt = this.expectedDeviceStops.get(deviceType) || 0;
    this.expectedDeviceStops.delete(deviceType);
    return expiresAt >= Date.now();
  }

  shouldIgnoreLocalDeviceException(deviceType, exceptionType) {
    const deviceTypes = this.sdk.AliRtcEngineLocalDeviceType;
    const exceptionTypes = this.sdk.AliRtcEngineLocalDeviceExceptionType;
    const isMicInterrupt = (
      deviceType === deviceTypes.AliEngineLocalDeviceTypeMic
      && exceptionType === exceptionTypes.AliEngineLocalDeviceExceptionTypeMicInterrupt
    );
    const isCameraInterrupt = (
      deviceType === deviceTypes.AliEngineLocalDeviceTypeCamera
      && exceptionType === exceptionTypes.AliEngineLocalDeviceExceptionTypeCameraInterrupt
    );
    if (isMicInterrupt) {
      const expectedStop = this.consumeExpectedDeviceStop(deviceType);
      return expectedStop || !this.microphoneTargetEnabled;
    }
    if (isCameraInterrupt) {
      const expectedStop = this.consumeExpectedDeviceStop(deviceType);
      return expectedStop || !this.cameraTargetEnabled;
    }
    return false;
  }

  refreshRemoteScreenView() {
    const screenOwner = this.remoteUserIds.find((userId) => this.remoteTracks.get(userId)?.screenAvailable)
      || Array.from(this.remoteTracks.entries()).find(([, tracks]) => tracks.screenAvailable)?.[0]
      || '';
    const screenElement = prepareVideoElement(
      this.options.getRemoteScreenElement?.(screenOwner),
      Boolean(this.options.observer)
    );

    this.remoteTracks.forEach((_tracks, userId) => {
      this.engine.setRemoteViewConfig(
        userId === screenOwner ? screenElement : null,
        userId,
        this.sdk.AliRtcVideoTrack.AliRtcVideoTrackScreen
      );
    });
    this.options.onRemoteScreenChange?.(Boolean(screenOwner), screenOwner);
  }

  enqueue(task) {
    const next = this.operation.catch(() => undefined).then(() => {
      if (this.destroyed) throw new Error('Aliyun RTC session has been destroyed');
      return task();
    });
    this.operation = next;
    return next;
  }

  async join(authInfo, userName = '') {
    const normalizedAuthInfo = normalizeAuthInfo(authInfo);
    await this.engine.publishLocalAudioStream(false);
    await this.engine.publishLocalVideoStream(false);
    await this.engine.publishLocalScreenShareStream(false);
    this.engine.setDefaultSubscribeAllRemoteAudioStreams(true);
    this.engine.setDefaultSubscribeAllRemoteVideoStreams(true);
    await this.engine.joinChannel(normalizedAuthInfo, userName);
    this.joined = true;
  }

  setMicrophoneEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    this.microphoneTargetEnabled = nextEnabled;
    return this.enqueue(async () => {
      if (nextEnabled === this.microphoneEnabled) return;
      if (nextEnabled) {
        await this.engine.publishLocalAudioStream(true);
        this.engine.muteLocalMic(false);
      } else {
        this.markExpectedDeviceStop(this.sdk.AliRtcEngineLocalDeviceType.AliEngineLocalDeviceTypeMic);
        await this.engine.publishLocalAudioStream(false);
        this.engine.stopAudioCapture();
      }
      this.microphoneEnabled = nextEnabled;
    });
  }

  setCameraEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    this.cameraTargetEnabled = nextEnabled;
    return this.enqueue(async () => {
      if (nextEnabled === this.cameraEnabled) return;
      const cameraElement = prepareVideoElement(this.options.getLocalCameraElement?.(), true);
      if (nextEnabled) {
        await this.engine.setLocalViewConfig(cameraElement, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackCamera);
        await this.engine.publishLocalVideoStream(true);
        await this.engine.startPreview();
      } else {
        this.markExpectedDeviceStop(this.sdk.AliRtcEngineLocalDeviceType.AliEngineLocalDeviceTypeCamera);
        await this.engine.publishLocalVideoStream(false);
        await this.engine.stopPreview();
        await this.engine.enableLocalVideo(false);
        await this.engine.setLocalViewConfig(null, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackCamera);
      }
      this.cameraEnabled = nextEnabled;
    });
  }

  setScreenShareEnabled(enabled, profile = {}) {
    const nextEnabled = Boolean(enabled);
    this.screenTargetEnabled = nextEnabled;
    return this.enqueue(async () => {
      if (nextEnabled === this.screenEnabled) return;
      if (nextEnabled) {
        const screenElement = prepareVideoElement(this.options.getLocalScreenElement?.(), true);
        await this.engine.setScreenShareConfiguration({
          width: profile.width || 1920,
          height: profile.height || 1080,
          frameRate: profile.fps || 15,
          bitrate: profile.bitrateKbps || 3000,
        });
        await this.engine.setLocalViewConfig(screenElement, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackScreen);
        try {
          await this.engine.publishLocalScreenShareStream(true, { audio: false });
          await this.engine.startPreviewScreen({ audio: false });
          this.screenEnabled = true;
        } catch (error) {
          this.screenEnabled = false;
          this.screenTargetEnabled = false;
          try { await this.engine.publishLocalScreenShareStream(false); } catch {}
          try { await this.engine.stopScreenShare(); } catch {}
          try { await this.engine.setLocalViewConfig(null, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackScreen); } catch {}
          throw error;
        }
      } else {
        await this.engine.publishLocalScreenShareStream(false);
        await this.engine.stopPreviewScreen();
        await this.engine.stopScreenShare();
        await this.engine.setLocalViewConfig(null, this.sdk.AliRtcVideoTrack.AliRtcVideoTrackScreen);
        this.screenEnabled = false;
      }
    });
  }

  async destroy() {
    if (this.destroyed) return;
    await this.operation.catch(() => undefined);
    this.destroyed = true;
    this.eventBindings.forEach(([eventName, handler]) => {
      this.engine.off(eventName, handler);
    });
    this.eventBindings = [];
    if (this.joined) {
      try { await this.engine.leaveChannel(); } catch {}
    }
    try { await this.engine.destroy(); } catch {}
    this.joined = false;
    this.microphoneTargetEnabled = false;
    this.cameraTargetEnabled = false;
    this.screenTargetEnabled = false;
    this.expectedDeviceStops.clear();
    this.remoteTracks.clear();
  }
}

// Numeric values are part of the public SDK enum and keep this module lazy-loadable.
export const ALIYUN_RTC_CONNECTED_STATUS = 3;
export const ALIYUN_RTC_RECONNECTING_STATUS = 4;
