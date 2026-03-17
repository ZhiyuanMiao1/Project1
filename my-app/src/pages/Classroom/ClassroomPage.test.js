import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClassroomPage from './ClassroomPage';
import api from '../../api/client';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ courseId: '42' }),
}), { virtual: true });

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../components/common/BrandMark/BrandMark', () => (
  function MockBrandMark() {
    return <div>Mentory</div>;
  }
));

const createEmitter = () => {
  const handlers = {};

  return {
    on: jest.fn((eventName, handler) => {
      if (!handlers[eventName]) handlers[eventName] = [];
      handlers[eventName].push(handler);
    }),
    emit: (eventName, ...args) => {
      (handlers[eventName] || []).forEach((handler) => handler(...args));
    },
  };
};

const flushPromises = async (iterations = 8) => {
  for (let index = 0; index < iterations; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const advanceTime = async (ms) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flushPromises();
};

const buildAuthResponse = () => ({
  data: {
    liveAuth: {
      mode: 'aliyun-live-artc',
      sdkAppId: 'demo-app',
      roomId: 'course_42',
      selfUserId: 'mentor-1',
      remoteUserId: 'student-1',
      pushUrl: 'artc://push',
      remotePlayUrl: 'artc://play/student-1',
      selfPlayUrl: 'artc://play/mentor-1',
      expiresAt: '2026-03-18T12:00:00.000Z',
    },
    session: {
      courseId: '42',
      status: 'scheduled',
      startsAt: '2026-03-18T12:00:00.000Z',
      durationHours: 1,
      roleInSession: 'mentor',
      remoteRole: 'student',
      remoteUserName: '学生A',
    },
  },
});

const buildPresenceResponse = (remotePresent) => ({
  data: {
    remotePresent,
    remoteScreenSharing: false,
  },
});

describe('ClassroomPage remote recovery', () => {
  let startPlayMock;
  let container;
  let root;
  let originalConsoleDebug;
  let pauseMock;
  let loadMock;

  const renderClassroomPage = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<ClassroomPage />);
    });
  };

  const getPageText = () => (container?.textContent || '');

  const getAlert = () => container?.querySelector('[role="alert"]') || null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalConsoleDebug = console.debug;
    console.debug = jest.fn();
    pauseMock = jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    loadMock = jest.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

    api.get.mockResolvedValue(buildAuthResponse());
    api.delete.mockResolvedValue({});

    startPlayMock = jest.fn();

    class MockPusher {
      constructor() {
        this.error = createEmitter();
        this.network = createEmitter();
        this.info = createEmitter();
      }

      init = jest.fn(() => Promise.resolve());

      startPush = jest.fn(() => Promise.resolve());

      stopPush = jest.fn(() => Promise.resolve());

      mute = jest.fn();

      destroy = jest.fn();

      stopPreview = jest.fn(() => Promise.resolve());

      stopCamera = jest.fn(() => Promise.resolve());

      startCamera = jest.fn(() => Promise.resolve());

      getPublishMediaStream = jest.fn(() => null);
    }

    MockPusher.checkSystemRequirements = jest.fn(() => true);
    MockPusher.checkScreenShareSupported = jest.fn(() => true);

    class MockPlayer {
      constructor() {
        this.userManager = {
          getRemoteUser: jest.fn(() => true),
        };
      }

      startPlay = startPlayMock;

      stopPlay = jest.fn(() => Promise.resolve());

      destroy = jest.fn(() => Promise.resolve());
    }

    window.AlivcLivePush = {
      AlivcLivePusher: MockPusher,
      AlivcLivePlayer: MockPlayer,
      LogLevel: { NONE: 'none' },
    };
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container) {
      container.remove();
    }
    root = null;
    container = null;
    pauseMock.mockRestore();
    loadMock.mockRestore();
    console.debug = originalConsoleDebug;
    delete window.AlivcLivePush;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('suppresses recoverable 50026 errors and keeps waiting for the remote user', async () => {
    api.post.mockResolvedValue(buildPresenceResponse(false));
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(startPlayMock).toHaveBeenCalledTimes(1);
    expect(getPageText()).toContain('已进入课堂，等待学生A加入...');
    expect(getAlert()).toBeNull();
    expect(getPageText()).not.toContain('50026');
  });

  test('tears down the remote view on disconnect and restores it after the remote user rejoins', async () => {
    const playInfo1 = createEmitter();
    const playInfo2 = createEmitter();
    const presenceQueue = [
      buildPresenceResponse(true),
      buildPresenceResponse(false),
      buildPresenceResponse(true),
      buildPresenceResponse(true),
    ];

    api.post.mockImplementation(() => Promise.resolve(
      presenceQueue.length > 1 ? presenceQueue.shift() : presenceQueue[0]
    ));
    startPlayMock
      .mockResolvedValueOnce(playInfo1)
      .mockResolvedValueOnce(playInfo2);

    await renderClassroomPage();
    await flushPromises();

    expect(startPlayMock).toHaveBeenCalledTimes(1);

    act(() => {
      playInfo1.emit('canplay');
    });
    await flushPromises();

    expect(getPageText()).toContain('双方已进入课堂');

    await advanceTime(2000);

    expect(getPageText()).toContain('对方暂时离线，等待重新加入...');
    expect(getAlert()).toBeNull();

    await advanceTime(2000);

    expect(startPlayMock).toHaveBeenCalledTimes(2);

    act(() => {
      playInfo2.emit('canplay');
    });
    await flushPromises();

    expect(getPageText()).toContain('双方已进入课堂');
    expect(getAlert()).toBeNull();
  });

  test('still shows unrecoverable remote playback failures', async () => {
    api.post.mockResolvedValue(buildPresenceResponse(true));
    startPlayMock.mockRejectedValueOnce(new Error('fatal remote playback failed'));

    await renderClassroomPage();
    await flushPromises();

    expect(startPlayMock).toHaveBeenCalledTimes(1);
    expect(getAlert()?.textContent || '').toContain('fatal remote playback failed');
  });
});
