import { AliyunRtcSdkSession, normalizeAliyunRtcSdkModule } from './aliyunRtcSdkSession';
import MockAliRtcEngine from 'aliyun-rtc-sdk';

let mockEngine;
let mockHandlers;

jest.mock('aliyun-rtc-sdk', () => ({
  __esModule: true,
  AliRtcAudioTrack: { AliRtcAudioTrackNo: 0, AliRtcAudioTrackMic: 1 },
  AliRtcEngineLocalDeviceExceptionType: {
    AliEngineLocalDeviceExceptionTypeMicInterrupt: 2,
    AliEngineLocalDeviceExceptionTypeCameraInterrupt: 10,
    AliEngineLocalDeviceExceptionTypeDisplayException: 12,
  },
  AliRtcEngineLocalDeviceType: {
    AliEngineLocalDeviceTypeMic: 1,
    AliEngineLocalDeviceTypeCamera: 4,
    AliEngineLocalDeviceTypeDisplay: 5,
    AliEngineLocalDeviceTypeVideoDevice: 6,
  },
  AliRtcVideoTrack: {
    AliRtcVideoTrackNo: 0,
    AliRtcVideoTrackCamera: 1,
    AliRtcVideoTrackScreen: 2,
    AliRtcVideoTrackBoth: 3,
  },
  AliRtcPublishState: {
    AliRtcStatePublishIdle: 0,
    AliRtcStateNoPublish: 1,
    AliRtcStatePublishing: 2,
    AliRtcStatePublished: 3,
  },
  default: {
    isSupported: jest.fn(async () => ({ support: true })),
    createInstance: jest.fn(() => mockEngine),
  },
}));

const authInfo = {
  appId: 'app-1',
  channelId: 'course_1',
  userId: 'student-1',
  nonce: '',
  timestamp: 2000000000,
  token: 'token-1',
};

const createMockEngine = () => ({
  on: jest.fn((eventName, handler) => {
    mockHandlers.set(eventName, handler);
  }),
  off: jest.fn(),
  publishLocalAudioStream: jest.fn(async () => undefined),
  publishLocalVideoStream: jest.fn(async () => undefined),
  publishLocalScreenShareStream: jest.fn(async () => undefined),
  setDefaultSubscribeAllRemoteAudioStreams: jest.fn(),
  setDefaultSubscribeAllRemoteVideoStreams: jest.fn(),
  joinChannel: jest.fn(async () => undefined),
  leaveChannel: jest.fn(async () => undefined),
  destroy: jest.fn(async () => undefined),
  muteLocalMic: jest.fn(),
  stopAudioCapture: jest.fn(),
  setLocalViewConfig: jest.fn(async () => undefined),
  startPreview: jest.fn(async () => undefined),
  stopPreview: jest.fn(async () => undefined),
  enableLocalVideo: jest.fn(async () => undefined),
  setScreenShareConfiguration: jest.fn(async () => undefined),
  startPreviewScreen: jest.fn(async () => undefined),
  stopPreviewScreen: jest.fn(async () => undefined),
  stopScreenShare: jest.fn(async () => undefined),
  subscribeRemoteMediaStream: jest.fn(),
  setRemoteViewConfig: jest.fn(),
  resumeRemoteMediaStream: jest.fn(),
});

describe('AliyunRtcSdkSession', () => {
  beforeEach(() => {
    mockHandlers = new Map();
    mockEngine = createMockEngine();
    MockAliRtcEngine.createInstance.mockImplementation(() => mockEngine);
    MockAliRtcEngine.isSupported.mockResolvedValue({ support: true });
  });

  it('joins with every local publication disabled', async () => {
    const session = await AliyunRtcSdkSession.create({ remoteUserIds: ['mentor-1'] });
    await session.join(authInfo, 'Student');

    expect(mockEngine.publishLocalAudioStream).toHaveBeenNthCalledWith(1, false);
    expect(mockEngine.publishLocalVideoStream).toHaveBeenNthCalledWith(1, false);
    expect(mockEngine.publishLocalScreenShareStream).toHaveBeenNthCalledWith(1, false);
    expect(mockEngine.joinChannel).toHaveBeenCalledWith(authInfo, 'Student');
    expect(mockEngine.publishLocalAudioStream.mock.invocationCallOrder[0])
      .toBeLessThan(mockEngine.joinChannel.mock.invocationCallOrder[0]);
  });

  it('normalizes direct and nested SDK engine exports', () => {
    const engineClass = {
      isSupported: jest.fn(),
      createInstance: jest.fn(),
      AliRtcAudioTrack: { AliRtcAudioTrackNo: 0 },
      AliRtcEngineLocalDeviceExceptionType: { AliEngineLocalDeviceExceptionTypeMicInterrupt: 2 },
      AliRtcEngineLocalDeviceType: { AliEngineLocalDeviceTypeMic: 1 },
      AliRtcPublishState: { AliRtcStatePublished: 3 },
      AliRtcVideoTrack: { AliRtcVideoTrackCamera: 1 },
    };

    expect(normalizeAliyunRtcSdkModule(engineClass).engine).toBe(engineClass);
    expect(normalizeAliyunRtcSdkModule({ default: { default: engineClass } }).engine).toBe(engineClass);
  });

  it('supports repeated microphone and camera toggles without rejoining', async () => {
    const localCamera = document.createElement('video');
    const session = await AliyunRtcSdkSession.create({
      remoteUserIds: ['mentor-1'],
      getLocalCameraElement: () => localCamera,
    });
    await session.join(authInfo, 'Student');

    await session.setMicrophoneEnabled(true);
    await session.setMicrophoneEnabled(false);
    await session.setMicrophoneEnabled(true);
    await session.setCameraEnabled(true);
    await session.setCameraEnabled(false);
    await session.setCameraEnabled(true);

    expect(mockEngine.joinChannel).toHaveBeenCalledTimes(1);
    expect(mockEngine.publishLocalAudioStream.mock.calls.map(([enabled]) => enabled))
      .toEqual([false, true, false, true]);
    expect(mockEngine.stopAudioCapture).toHaveBeenCalledTimes(1);
    expect(mockEngine.publishLocalVideoStream.mock.calls.map(([enabled]) => enabled))
      .toEqual([false, true, false, true]);
    expect(mockEngine.startPreview).toHaveBeenCalledTimes(2);
    expect(mockEngine.enableLocalVideo).toHaveBeenCalledWith(false);
  });

  it('ignores delayed track-ended events caused by intentional device stops', async () => {
    const onError = jest.fn();
    const onLocalDeviceException = jest.fn();
    const session = await AliyunRtcSdkSession.create({ onError, onLocalDeviceException });
    await session.join(authInfo, 'Student');

    await session.setMicrophoneEnabled(true);
    await session.setMicrophoneEnabled(false);
    mockHandlers.get('localDeviceException')(1, 2, '');
    await session.setCameraEnabled(true);
    await session.setCameraEnabled(false);
    mockHandlers.get('localDeviceException')(4, 10, '');
    mockHandlers.get('localDeviceException')(5, 12, '');

    expect(onLocalDeviceException).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an unexpected camera interruption while the camera should be on', async () => {
    const onLocalDeviceException = jest.fn();
    const session = await AliyunRtcSdkSession.create({ onLocalDeviceException });
    await session.join(authInfo, 'Student');
    await session.setCameraEnabled(true);

    mockHandlers.get('localDeviceException')(4, 10, 'camera interrupted');

    expect(onLocalDeviceException).toHaveBeenCalledWith({
      deviceType: 4,
      exceptionType: 10,
      description: 'camera interrupted',
    });

    await session.setCameraEnabled(true);
    expect(mockEngine.publishLocalVideoStream.mock.calls.map(([enabled]) => enabled))
      .toEqual([false, true, true]);
  });

  it('treats the browser share-bar stop as a normal local state change', async () => {
    const onError = jest.fn();
    const onLocalDeviceException = jest.fn();
    const onLocalScreenEnded = jest.fn();
    const session = await AliyunRtcSdkSession.create({
      onError,
      onLocalDeviceException,
      onLocalScreenEnded,
    });
    await session.join(authInfo, 'Student');
    await session.setScreenShareEnabled(true);

    mockHandlers.get('localDeviceException')(5, 12, '');

    expect(onLocalScreenEnded).toHaveBeenCalledTimes(1);
    expect(onLocalDeviceException).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('supports sharing, stopping, and sharing again in the same room', async () => {
    const localScreen = document.createElement('video');
    const session = await AliyunRtcSdkSession.create({
      remoteUserIds: ['mentor-1'],
      getLocalScreenElement: () => localScreen,
    });
    await session.join(authInfo, 'Student');

    const profile = { width: 2560, height: 1440, fps: 15, bitrateKbps: 3000 };
    await session.setScreenShareEnabled(true, profile);
    await session.setScreenShareEnabled(false, profile);
    await session.setScreenShareEnabled(true, profile);

    expect(mockEngine.joinChannel).toHaveBeenCalledTimes(1);
    expect(mockEngine.publishLocalScreenShareStream.mock.calls.map(([enabled]) => enabled))
      .toEqual([false, true, false, true]);
    expect(mockEngine.setScreenShareConfiguration).toHaveBeenCalledTimes(2);
    expect(mockEngine.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(mockEngine.startPreviewScreen).toHaveBeenCalledTimes(2);
  });

  it('subscribes and binds camera and screen views after track availability', async () => {
    const remoteCamera = document.createElement('video');
    const remoteScreen = document.createElement('video');
    const onRemoteTrackChange = jest.fn();
    const onRemoteScreenChange = jest.fn();
    const session = await AliyunRtcSdkSession.create({
      remoteUserIds: ['mentor-1'],
      getRemoteCameraElement: () => remoteCamera,
      getRemoteScreenElement: () => remoteScreen,
      onRemoteTrackChange,
      onRemoteScreenChange,
    });
    await session.join(authInfo, 'Student');

    mockHandlers.get('remoteTrackAvailableNotify')('mentor-1', 1, 3);

    expect(mockEngine.subscribeRemoteMediaStream).toHaveBeenCalledWith('mentor-1', 3, true, true);
    expect(mockEngine.setRemoteViewConfig).toHaveBeenCalledWith(remoteCamera, 'mentor-1', 1);
    expect(mockEngine.setRemoteViewConfig).toHaveBeenCalledWith(remoteScreen, 'mentor-1', 2);
    expect(onRemoteTrackChange).toHaveBeenCalledWith('mentor-1', {
      audioAvailable: true,
      cameraAvailable: true,
      screenAvailable: true,
    });
    expect(onRemoteScreenChange).toHaveBeenCalledWith(true, 'mentor-1');
  });

  it('leaves and destroys a joined receive-only observer session', async () => {
    const session = await AliyunRtcSdkSession.create({
      observer: true,
      remoteUserIds: ['student-1', 'mentor-1'],
    });
    await session.join({ ...authInfo, userId: 'observer-1' }, 'Observer');
    await session.destroy();

    expect(mockEngine.leaveChannel).toHaveBeenCalledTimes(1);
    expect(mockEngine.destroy).toHaveBeenCalledTimes(1);
    expect(mockEngine.off).toHaveBeenCalled();
  });
});
