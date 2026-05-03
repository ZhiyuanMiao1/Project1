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
    pauseMock = jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    loadMock = jest.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

    authResponse = buildAuthResponse();
    api.get.mockImplementation((url) => {
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

    class MockPusher {
      constructor() {
        this.error = createEmitter();
        this.network = createEmitter();
        this.info = createEmitter();
      }

      init = jest.fn(() => Promise.resolve());

      startPush = startPushMock;

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
    expect(api.post.mock.calls).toEqual(expect.arrayContaining([
      ['/api/rtc/classrooms/42/recording/start'],
    ]));
    expect(getPageText()).toContain('录制中');
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
