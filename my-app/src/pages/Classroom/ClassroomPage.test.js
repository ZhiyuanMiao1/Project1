import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClassroomPage from './ClassroomPage';
import api from '../../api/client';
import { AliyunRtcSdkSession as MockAliyunRtcSdkSession } from './aliyunRtcSdkSession';

const mockNavigate = jest.fn();
let mockRtcSdkSessionApi;

jest.mock('./aliyunRtcSdkSession', () => ({
  ALIYUN_RTC_CONNECTED_STATUS: 3,
  ALIYUN_RTC_RECONNECTING_STATUS: 4,
  AliyunRtcSdkSession: {
    checkSupport: jest.fn(async () => ({ support: true })),
    create: jest.fn(async () => mockRtcSdkSessionApi),
  },
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/classroom/42', search: '' }),
  useNavigate: () => mockNavigate,
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

jest.mock('../../i18n/language', () => {
  const t = (_key, fallback, replacements) => {
    const template = typeof fallback === 'string' ? fallback : _key;
    if (!replacements || typeof replacements !== 'object') return template;
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(replacements, key)
        ? String(replacements[key])
        : match
    ));
  };

  return {
    useI18n: () => ({
      language: 'zh-CN',
      isEnglish: false,
      setLanguage: jest.fn(),
      t,
      getCourseDirectionLabel: (_id, fallback) => fallback,
      getCourseDirectionDisplayLabel: (_id, fallback) => fallback,
      getCourseTypeLabel: (_id, fallback) => fallback,
    }),
  };
});

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

const flushPromises = async (iterations = 20) => {
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
      threadId: '',
      roleInSession: 'mentor',
      remoteRole: 'student',
      remoteUserName: '学生A',
    },
  },
});

const buildRtcSdkAuthResponse = () => {
  const response = buildAuthResponse();
  response.data.liveAuth = {
    ...response.data.liveAuth,
    provider: 'aliyun-rtc-sdk',
    remoteUserIds: ['student-1'],
    authInfo: {
      appId: 'demo-app',
      channelId: 'course_42',
      userId: 'mentor-1',
      nonce: '',
      timestamp: 2000000000,
      token: 'rtc-token',
    },
  };
  response.data.userName = '导师A';
  return response;
};

const buildThreadResponse = (threads = []) => ({
  data: {
    threads,
    totalUnreadCount: 0,
  },
});

const buildPresenceResponse = (remotePresent) => ({
  data: {
    remotePresent,
    remoteScreenSharing: false,
  },
});

const buildRecordingResponse = (status = 'running') => ({
  data: {
    recording: {
      enabled: true,
      status,
      taskId: 'recording-task-1',
      storagePrefix: 'classrooms/course_42',
      errorMessage: '',
    },
  },
});

const buildChatResponse = (messages = [], options = {}) => ({
  data: {
    messages,
    chatClosed: false,
    cleanupEligible: false,
    ...options,
  },
});

describe('ClassroomPage remote recovery', () => {
  let startPlayMock;
  let startPushMock;
  let pusherInitMock;
  let startMicrophoneMock;
  let stopMicrophoneMock;
  let startScreenShareMock;
  let stopScreenShareMock;
  let updateScreenVideoProfileMock;
  let screenShareCallOrder;
  let container;
  let root;
  let originalConsoleDebug;
  let originalFetch;
  let pauseMock;
  let loadMock;
  let authResponse;

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
    originalFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
    window.close = jest.fn();
    pauseMock = jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    loadMock = jest.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

    authResponse = buildAuthResponse();
    mockRtcSdkSessionApi = {
      join: jest.fn(async () => undefined),
      destroy: jest.fn(async () => undefined),
      setMicrophoneEnabled: jest.fn(async () => undefined),
      setCameraEnabled: jest.fn(async () => undefined),
      setScreenShareEnabled: jest.fn(async () => undefined),
    };
    MockAliyunRtcSdkSession.checkSupport.mockResolvedValue({ support: true });
    MockAliyunRtcSdkSession.create.mockImplementation(async () => mockRtcSdkSessionApi);
    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({
          data: {
            consent: {
              noticeVersion: '2026-08-20',
              currentDecision: 'accepted',
              allAccepted: true,
              hasDeclined: false,
            },
          },
        });
      }
      if (String(url).includes('/recording/status')) {
        return Promise.resolve(buildRecordingResponse());
      }
      if (String(url).includes('/api/rtc/classrooms/')) {
        return Promise.resolve(authResponse);
      }
      if (String(url) === '/api/account/availability') {
        return Promise.resolve({
          data: {
            availability: {
              timeZone: 'Asia/Shanghai',
            },
          },
        });
      }
      if (String(url).includes('/api/classrooms/42/chat')) {
        return Promise.resolve(buildChatResponse());
      }
      if (String(url) === '/api/messages/threads') {
        return Promise.resolve(buildThreadResponse());
      }
      if (String(url).includes('/api/messages/threads/') && String(url).includes('/availability')) {
        return Promise.resolve({
          data: {
            studentAvailability: null,
            mentorAvailability: null,
            studentBusySelections: {},
            mentorBusySelections: {},
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.delete.mockResolvedValue({});
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) {
        return Promise.resolve(buildRecordingResponse());
      }
      if (String(url).includes('/presence')) {
        return Promise.resolve(buildPresenceResponse(false));
      }
      return Promise.resolve({ data: {} });
    });

    startPlayMock = jest.fn();
    startPushMock = jest.fn(() => Promise.resolve());
    pusherInitMock = jest.fn(() => Promise.resolve());
    startMicrophoneMock = jest.fn(() => Promise.resolve());
    stopMicrophoneMock = jest.fn(() => Promise.resolve());
    screenShareCallOrder = [];
    startScreenShareMock = jest.fn(() => {
      screenShareCallOrder.push('start');
      return Promise.resolve();
    });
    stopScreenShareMock = jest.fn(() => {
      screenShareCallOrder.push('stop');
      return Promise.resolve();
    });
    updateScreenVideoProfileMock = jest.fn(() => {
      screenShareCallOrder.push('profile');
      return Promise.resolve();
    });

    class MockPusher {
      constructor() {
        this.error = createEmitter();
        this.network = createEmitter();
        this.info = createEmitter();
      }

      init = pusherInitMock;

      startPush = startPushMock;

      stopPush = jest.fn(() => Promise.resolve());

      startMicrophone = startMicrophoneMock;

      stopMicrophone = stopMicrophoneMock;

      startScreenShare = startScreenShareMock;

      stopScreenShare = stopScreenShareMock;

      updateScreenVideoProfile = updateScreenVideoProfileMock;

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
    global.fetch = originalFetch;
    delete window.AlivcLivePush;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('suppresses recoverable 50026 errors and keeps waiting for the remote user', async () => {
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(buildPresenceResponse(false));
    });
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(startPlayMock).toHaveBeenCalledTimes(1);
    expect(getPageText()).toContain('已进入课堂，等待学生A加入');
    expect(getAlert()).toBeNull();
    expect(getPageText()).not.toContain('50026');
  });

  test('starts cloud recording after local push succeeds', async () => {
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(buildPresenceResponse(false));
    });
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(startPushMock).toHaveBeenCalledWith('artc://push');
    expect(pusherInitMock).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: false,
    }));
    expect(startMicrophoneMock).not.toHaveBeenCalled();
    expect(stopMicrophoneMock).not.toHaveBeenCalled();
    expect(api.post.mock.calls).toEqual(expect.arrayContaining([
      ['/api/rtc/classrooms/42/recording/start'],
    ]));
    expect(getPageText()).toContain('录制中');
  });

  test('uses the official RTC session without changing classroom controls', async () => {
    authResponse = buildRtcSdkAuthResponse();

    await renderClassroomPage();
    await flushPromises();

    expect(MockAliyunRtcSdkSession.create).toHaveBeenCalledWith(expect.objectContaining({
      observer: false,
      remoteUserIds: ['student-1'],
    }));
    expect(mockRtcSdkSessionApi.join).toHaveBeenCalledWith(
      authResponse.data.liveAuth.authInfo,
      '导师A'
    );
    expect(startPushMock).not.toHaveBeenCalled();
    expect(api.post.mock.calls).toEqual(expect.arrayContaining([[
      '/api/rtc/classrooms/42/recording/start',
    ]]));

    const controls = container.querySelector('.classroom-controls');
    const [micButton, cameraButton] = Array.from(controls?.querySelectorAll('.classroom-control-btn') || []);
    await act(async () => {
      micButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    await act(async () => {
      cameraButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(mockRtcSdkSessionApi.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(mockRtcSdkSessionApi.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  test('requires an explicit recording choice before entering the classroom', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({
          data: {
            roleInSession: 'mentor',
            consent: { currentDecision: '', allAccepted: false, hasDeclined: false },
          },
        });
      }
      if (String(url).includes('/api/rtc/classrooms/')) return Promise.resolve(authResponse);
      if (String(url).includes('/api/classrooms/42/chat')) return Promise.resolve(buildChatResponse());
      if (String(url) === '/api/messages/threads') return Promise.resolve(buildThreadResponse());
      return Promise.resolve({ data: {} });
    });
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(getPageText()).toContain('进入课堂前，请确认录制安排');
    expect(startPushMock).not.toHaveBeenCalled();

    const acceptButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').includes('同意录制并进入'));
    await act(async () => {
      acceptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(api.post.mock.calls).toEqual(expect.arrayContaining([[
      '/api/rtc/classrooms/42/recording/consent',
      {
        decision: 'accepted',
        noticeVersion: '2026-08-20',
        locale: 'zh-CN',
      },
    ]]));
    expect(startPushMock).toHaveBeenCalledWith('artc://push');
    expect(getPageText()).not.toContain('进入课堂前，请确认录制安排');
  });

  test('returns to the course list without entering when recording is not accepted', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({
          data: {
            roleInSession: 'mentor',
            consent: { currentDecision: '', allAccepted: false, hasDeclined: false },
          },
        });
      }
      if (String(url).includes('/api/rtc/classrooms/')) return Promise.resolve(authResponse);
      if (String(url).includes('/api/classrooms/42/chat')) return Promise.resolve(buildChatResponse());
      if (String(url) === '/api/messages/threads') return Promise.resolve(buildThreadResponse());
      return Promise.resolve({ data: {} });
    });
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    const returnButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').trim() === '退出');
    await act(async () => {
      returnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(window.close).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/mentor/courses', { replace: true });
    expect(startPushMock).not.toHaveBeenCalled();
    expect(api.post.mock.calls.some(([url]) => String(url).includes('/recording/consent'))).toBe(false);
    expect(api.post.mock.calls.some(([url]) => String(url).includes('/recording/start'))).toBe(false);
  });

  test('keeps requiring consent when an earlier classroom decision was declined', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({ data: { consent: { currentDecision: 'declined', allAccepted: false, hasDeclined: true } } });
      }
      if (String(url).includes('/api/rtc/classrooms/')) return Promise.resolve(authResponse);
      if (String(url).includes('/api/classrooms/42/chat')) return Promise.resolve(buildChatResponse());
      if (String(url) === '/api/messages/threads') return Promise.resolve(buildThreadResponse());
      return Promise.resolve({ data: {} });
    });

    await renderClassroomPage();
    await flushPromises();

    expect(getPageText()).toContain('进入课堂前，请确认录制安排');
    expect(startPushMock).not.toHaveBeenCalled();
  });

  test('toggles microphone without reauthorizing, restarting push, or restarting recording', async () => {
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    const getMicButton = () => Array.from(container.querySelectorAll('button'))
      .find((button) => /开启麦克风|关闭麦克风/.test(button.textContent || ''));
    const getAuthRequestCount = () => api.get.mock.calls.filter(([url]) => (
      String(url) === '/api/rtc/classrooms/42/auth'
    )).length;
    const getRecordingStartCount = () => api.post.mock.calls.filter(([url]) => (
      String(url) === '/api/rtc/classrooms/42/recording/start'
    )).length;

    expect(getAuthRequestCount()).toBe(1);
    expect(getRecordingStartCount()).toBe(1);
    expect(startPushMock).toHaveBeenCalledTimes(1);
    expect(getMicButton()?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      getMicButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(startMicrophoneMock).toHaveBeenCalledTimes(1);
    expect(stopMicrophoneMock).not.toHaveBeenCalled();
    expect(getMicButton()?.textContent || '').toContain('关闭麦克风');
    expect(getMicButton()?.classList.contains('active')).toBe(true);
    expect(getMicButton()?.getAttribute('aria-pressed')).toBe('true');
    expect(getAuthRequestCount()).toBe(1);
    expect(getRecordingStartCount()).toBe(1);
    expect(startPushMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      getMicButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(stopMicrophoneMock).toHaveBeenCalledTimes(1);
    expect(getMicButton()?.textContent || '').toContain('开启麦克风');
    expect(getMicButton()?.classList.contains('active')).toBe(false);
    expect(getMicButton()?.getAttribute('aria-pressed')).toBe('false');
    expect(getAuthRequestCount()).toBe(1);
    expect(getRecordingStartCount()).toBe(1);
    expect(startPushMock).toHaveBeenCalledTimes(1);
  });

  test('renders classroom actions as accessible icon controls with hover tooltips', async () => {
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    const controls = container.querySelector('.classroom-controls');
    const buttons = Array.from(controls?.querySelectorAll('.classroom-control-btn') || []);

    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '开启麦克风',
      '开启摄像头',
      '共享屏幕',
      '预约下节课',
      '结束课堂',
    ]);
    buttons.forEach((button) => {
      expect(button.querySelector('.classroom-control-tooltip')).toBeTruthy();
    });
  });

  test('configures the screen profile before every share, including after stopping once', async () => {
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    const getScreenButton = () => Array.from(container.querySelectorAll('button'))
      .find((button) => /共享屏幕|停止共享/.test(button.getAttribute('aria-label') || ''));

    await act(async () => {
      getScreenButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(getScreenButton()?.getAttribute('aria-label')).toBe('停止共享');

    await act(async () => {
      getScreenButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(getScreenButton()?.getAttribute('aria-label')).toBe('共享屏幕');

    await act(async () => {
      getScreenButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(getScreenButton()?.getAttribute('aria-label')).toBe('停止共享');
    expect(updateScreenVideoProfileMock).toHaveBeenCalledTimes(2);
    expect(updateScreenVideoProfileMock).toHaveBeenNthCalledWith(1, 2560, 1440, 3000, 15);
    expect(updateScreenVideoProfileMock).toHaveBeenNthCalledWith(2, 2560, 1440, 3000, 15);
    expect(startScreenShareMock).toHaveBeenCalledTimes(2);
    expect(stopScreenShareMock).toHaveBeenCalledTimes(1);
    expect(screenShareCallOrder).toEqual(['profile', 'start', 'stop', 'profile', 'start']);
  });

  test('keeps microphone state unchanged when starting the microphone fails', async () => {
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    startMicrophoneMock.mockRejectedValueOnce(new Error('microphone device failed'));

    const micButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').includes('开启麦克风'));

    await act(async () => {
      micButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(micButton.textContent || '').toContain('开启麦克风');
    expect(micButton.getAttribute('aria-pressed')).toBe('false');
    expect(getAlert()?.textContent || '').toContain('microphone device failed');
  });

  test('releases the microphone when media push cannot start after enabling it', async () => {
    startPushMock
      .mockRejectedValueOnce(new Error('initial push failed'))
      .mockRejectedValueOnce(new Error('retry push failed'));
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    const micButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').includes('开启麦克风'));

    await act(async () => {
      micButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(startMicrophoneMock).toHaveBeenCalledTimes(1);
    expect(stopMicrophoneMock).toHaveBeenCalledTimes(1);
    expect(micButton.textContent || '').toContain('开启麦克风');
    expect(micButton.getAttribute('aria-pressed')).toBe('false');
    expect(getAlert()?.textContent || '').toContain('retry push failed');
  });

  test('does not start cloud recording when local push fails', async () => {
    startPushMock.mockRejectedValueOnce(new Error('push failed'));
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(api.post.mock.calls.some(([url]) => String(url).includes('/recording/start'))).toBe(false);
    expect(api.post.mock.calls.some(([url]) => String(url).includes('/presence'))).toBe(true);
  });

  test('keeps classroom usable when cloud recording start fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) {
        return Promise.reject({ response: { data: { error: 'recording unavailable' } } });
      }
      return Promise.resolve(buildPresenceResponse(false));
    });
    startPlayMock.mockRejectedValueOnce(Object.assign(new Error('no remote user founded'), { code: 50026 }));

    await renderClassroomPage();
    await flushPromises();

    expect(getPageText()).toContain('已进入课堂，等待学生A加入');
    expect(getPageText()).toContain('录制启动失败');
    expect(getPageText()).toContain('recording unavailable');
    consoleErrorSpy.mockRestore();
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

    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(presenceQueue.length > 1 ? presenceQueue.shift() : presenceQueue[0]);
    });
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

    expect(getPageText()).toContain('对方暂时离线，等待重新加入');
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
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(buildPresenceResponse(true));
    });
    startPlayMock.mockRejectedValueOnce(new Error('fatal remote playback failed'));

    await renderClassroomPage();
    await flushPromises();

    expect(startPlayMock).toHaveBeenCalledTimes(1);
    expect(getAlert()?.textContent || '').toContain('fatal remote playback failed');
  });

  test('opens the next-lesson drawer when the current course has a linked message thread', async () => {
    authResponse = buildAuthResponse();
    authResponse.data.session.threadId = '99';

    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({ data: { consent: { currentDecision: 'accepted', allAccepted: true, hasDeclined: false } } });
      }
      if (String(url).includes('/api/rtc/classrooms/')) {
        return Promise.resolve(authResponse);
      }
      if (String(url) === '/api/messages/threads') {
        return Promise.resolve(buildThreadResponse([{
          id: '99',
          courseDirectionId: 'others',
          courseTypeId: 'others',
          schedule: {
            id: '501',
            direction: 'incoming',
            window: '3月21日 周六 14:00-15:00 (GMT+08)',
            meetingId: 'meeting-1',
            time: '2026-03-19T08:00:00.000Z',
            status: 'accepted',
            courseSessionId: '42',
            sourceAppointmentId: '',
          },
          scheduleHistory: [],
        }]));
      }
      if (String(url).includes('/api/messages/threads/99/availability')) {
        return Promise.resolve({
          data: {
            studentAvailability: {
              timeZone: 'Asia/Shanghai',
              daySelections: {
                '2026-03-21': [{ start: 56, end: 63 }],
              },
            },
            mentorAvailability: {
              timeZone: 'Asia/Shanghai',
              daySelections: {
                '2026-03-21': [{ start: 56, end: 63 }],
              },
            },
            studentBusySelections: {},
            mentorBusySelections: {},
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(buildPresenceResponse(true));
    });
    startPlayMock.mockResolvedValue(createEmitter());

    await renderClassroomPage();
    await flushPromises();

    const scheduleButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').includes('预约下节课'));

    expect(scheduleButton).toBeTruthy();
    expect(scheduleButton.disabled).toBe(false);

    await act(async () => {
      scheduleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent || '').toContain('发送预约');
  });

  test('renders classroom chat and sends a text message', async () => {
    const chatResponses = [
      buildChatResponse(),
      buildChatResponse([
        {
          id: '1001',
          messageType: 'text',
          senderUserId: 11,
          senderRole: 'mentor',
          createdAt: '2026-03-18T12:05:00.000Z',
          textContent: '今天先看二叉树递归',
        },
      ]),
    ];

    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({ data: { consent: { currentDecision: 'accepted', allAccepted: true, hasDeclined: false } } });
      }
      if (String(url).includes('/api/rtc/classrooms/')) {
        return Promise.resolve(authResponse);
      }
      if (String(url).includes('/api/classrooms/42/chat')) {
        return Promise.resolve(chatResponses.length > 1 ? chatResponses.shift() : chatResponses[0]);
      }
      if (String(url) === '/api/messages/threads') {
        return Promise.resolve(buildThreadResponse());
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) {
        return Promise.resolve(buildRecordingResponse());
      }
      if (String(url).includes('/api/classrooms/42/chat/messages')) {
        return Promise.resolve({ data: { id: 1001, messageType: 'text' } });
      }
      return Promise.resolve(buildPresenceResponse(true));
    });
    startPlayMock.mockResolvedValue(createEmitter());

    await renderClassroomPage();
    await flushPromises();

    const textarea = container.querySelector('textarea');
    const sendButton = Array.from(container.querySelectorAll('button'))
      .find((button) => (button.textContent || '').includes('发送消息'));

    expect(container.textContent || '').toContain('聊天');
    expect(textarea).toBeTruthy();
    expect(sendButton).toBeTruthy();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      valueSetter.call(textarea, '今天先看二叉树递归');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();

    expect(api.post.mock.calls).toEqual(expect.arrayContaining([[
      '/api/classrooms/42/chat/messages',
      {
        messageType: 'text',
        textContent: '今天先看二叉树递归',
      },
    ]]));
    expect(container.textContent || '').toContain('今天先看二叉树递归');
  });

  test('formats classroom chat time using the signed-in user time zone', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/recording/consent')) {
        return Promise.resolve({ data: { consent: { currentDecision: 'accepted', allAccepted: true, hasDeclined: false } } });
      }
      if (String(url).includes('/api/rtc/classrooms/')) {
        return Promise.resolve(authResponse);
      }
      if (String(url) === '/api/account/availability') {
        return Promise.resolve({
          data: {
            availability: {
              timeZone: 'America/New_York',
            },
          },
        });
      }
      if (String(url).includes('/api/classrooms/42/chat')) {
        return Promise.resolve(buildChatResponse([
          {
            id: '1002',
            messageType: 'text',
            senderUserId: 11,
            senderRole: 'mentor',
            createdAt: '2026-03-18T12:05:00.000Z',
            textContent: 'timezone check',
          },
        ]));
      }
      if (String(url) === '/api/messages/threads') {
        return Promise.resolve(buildThreadResponse());
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) return Promise.resolve(buildRecordingResponse());
      return Promise.resolve(buildPresenceResponse(true));
    });
    startPlayMock.mockResolvedValue(createEmitter());

    await renderClassroomPage();
    await flushPromises();

    expect(container.textContent || '').toContain('timezone check');
    expect(container.textContent || '').toContain('08:05');
  });

  test('shows a clearer message when classroom file upload hits a fetch-level network failure', async () => {
    api.post.mockImplementation((url) => {
      if (String(url).includes('/recording/start')) {
        return Promise.resolve(buildRecordingResponse());
      }
      if (String(url) === '/api/oss/policy') {
        return Promise.resolve({
          data: {
            host: 'https://demo-bucket.oss-cn-hongkong.aliyuncs.com',
            key: 'temp/classrooms/42/2026/03/demo.pdf',
            policy: 'policy',
            signature: 'signature',
            accessKeyId: 'ak',
            fileUrl: 'https://demo-bucket.oss-cn-hongkong.aliyuncs.com/temp/classrooms/42/2026/03/demo.pdf',
            fileId: '0123456789abcdef0123456789abcdef',
            ext: 'pdf',
          },
        });
      }
      return Promise.resolve(buildPresenceResponse(true));
    });
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    startPlayMock.mockResolvedValue(createEmitter());

    await renderClassroomPage();
    await flushPromises();

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(['demo'], 'notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushPromises();

    expect(getAlert()?.textContent || '').toContain('上传课堂文件失败，请稍后重试');
  });
});
