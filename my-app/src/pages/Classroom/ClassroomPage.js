import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiMic, FiMicOff, FiPhoneOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import AliRtcEngine from 'aliyun-rtc-sdk';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import api from '../../api/client';
import './ClassroomPage.css';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const parseErrorMessage = (error, fallback) => {
  const responseMessage = safeText(error?.response?.data?.error);
  if (responseMessage) return responseMessage;
  const errorMessage = safeText(error?.message);
  if (errorMessage) return errorMessage;
  return fallback;
};

function ClassroomPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const engineRef = useRef(null);
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const cleaningRef = useRef(false);
  const remoteUserIdRef = useRef('');
  const listenersRef = useRef([]);

  const [joining, setJoining] = useState(true);
  const [joined, setJoined] = useState(false);
  const [session, setSession] = useState(null);
  const [statusText, setStatusText] = useState('准备进入课堂...');
  const [errorMessage, setErrorMessage] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState('');

  const backHref = useMemo(
    () => (session?.roleInSession === 'mentor' ? '/mentor/courses' : '/student/courses'),
    [session?.roleInSession]
  );

  const detachEngineListeners = useCallback((engine) => {
    if (!engine || typeof engine.off !== 'function') {
      listenersRef.current = [];
      return;
    }
    const listeners = Array.isArray(listenersRef.current) ? listenersRef.current : [];
    listeners.forEach(([eventName, handler]) => {
      try {
        engine.off(eventName, handler);
      } catch {}
    });
    listenersRef.current = [];
  }, []);

  const leaveAndDestroy = useCallback(async () => {
    if (cleaningRef.current) return;
    cleaningRef.current = true;
    try {
      const engine = engineRef.current;
      if (!engine) return;

      detachEngineListeners(engine);

      try {
        if (remoteUserIdRef.current) {
          engine.setRemoteViewConfig(
            null,
            remoteUserIdRef.current,
            AliRtcEngine.AliRtcVideoTrack.AliRtcVideoTrackCamera
          );
        }
      } catch {}
      try {
        await engine.stopPreview();
      } catch {}
      try {
        await engine.setLocalViewConfig(null, AliRtcEngine.AliRtcVideoTrack.AliRtcVideoTrackCamera);
      } catch {}
      try {
        if (joinedRef.current) {
          await engine.leaveChannel();
        }
      } catch {}
      try {
        await engine.destroy();
      } catch {}
      engineRef.current = null;
      joinedRef.current = false;
      remoteUserIdRef.current = '';
      if (mountedRef.current) {
        setJoined(false);
        setRemoteUserId('');
      }
    } finally {
      cleaningRef.current = false;
    }
  }, [detachEngineListeners]);

  const attachEngineListeners = useCallback((engine) => {
    detachEngineListeners(engine);

    const handleConnectionStatusChange = (connectionStatus) => {
      if (!mountedRef.current) return;
      const text = safeText(connectionStatus);
      if (text) setStatusText(`连接状态：${text}`);
    };

    const handleRemoteUserOnLineNotify = (uid) => {
      const normalizedUid = safeText(uid);
      if (!normalizedUid || !mountedRef.current) return;
      remoteUserIdRef.current = normalizedUid;
      setRemoteUserId(normalizedUid);
      setStatusText('对方已进入课堂');
    };

    const handleRemoteTrackAvailableNotify = (uid, _audioTrack, videoTrack) => {
      const normalizedUid = safeText(uid);
      if (!normalizedUid) return;
      remoteUserIdRef.current = normalizedUid;
      if (!mountedRef.current) return;
      setRemoteUserId(normalizedUid);

      const videoTrackEnum = AliRtcEngine.AliRtcVideoTrack;
      if (videoTrack === videoTrackEnum.AliRtcVideoTrackNo) return;
      const trackToRender = videoTrack === videoTrackEnum.AliRtcVideoTrackScreen
        ? videoTrackEnum.AliRtcVideoTrackScreen
        : videoTrackEnum.AliRtcVideoTrackCamera;
      if (!remoteVideoRef.current || !engineRef.current) return;
      try {
        engineRef.current.setRemoteViewConfig(remoteVideoRef.current, normalizedUid, trackToRender);
      } catch {}
    };

    const handleRemoteUserOffLineNotify = (uid) => {
      const normalizedUid = safeText(uid);
      if (!normalizedUid || !mountedRef.current) return;
      if (remoteUserIdRef.current === normalizedUid) {
        remoteUserIdRef.current = '';
        setRemoteUserId('');
        if (engineRef.current) {
          try {
            engineRef.current.setRemoteViewConfig(
              null,
              normalizedUid,
              AliRtcEngine.AliRtcVideoTrack.AliRtcVideoTrackCamera
            );
          } catch {}
        }
      }
      setStatusText('对方已离开课堂');
    };

    const handleOccurError = (error) => {
      if (!mountedRef.current) return;
      const message = parseErrorMessage(error, '课堂连接发生错误，请稍后重试');
      setErrorMessage(message);
      setStatusText(message);
    };

    const listeners = [
      ['connectionStatusChange', handleConnectionStatusChange],
      ['remoteUserOnLineNotify', handleRemoteUserOnLineNotify],
      ['remoteTrackAvailableNotify', handleRemoteTrackAvailableNotify],
      ['remoteUserOffLineNotify', handleRemoteUserOffLineNotify],
      ['occurError', handleOccurError],
      ['onOccurError', handleOccurError],
    ];

    listeners.forEach(([eventName, handler]) => {
      try {
        engine.on(eventName, handler);
      } catch {}
    });
    listenersRef.current = listeners;
  }, [detachEngineListeners]);

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
        setStatusText('正在请求课堂鉴权...');
        setErrorMessage('');
      }

      try {
        const response = await api.get(`/api/rtc/classrooms/${encodeURIComponent(normalizedCourseId)}/auth`);
        if (cancelled || !mountedRef.current) return;

        const authInfo = response?.data?.authInfo || null;
        const userName = safeText(response?.data?.userName);
        const sessionInfo = response?.data?.session && typeof response.data.session === 'object'
          ? response.data.session
          : null;

        if (!authInfo || !safeText(authInfo.appId) || !safeText(authInfo.channelId) || !safeText(authInfo.userId) || !safeText(authInfo.token)) {
          throw new Error('课堂鉴权返回无效');
        }

        setSession(sessionInfo);
        setStatusText('正在初始化课堂...');

        const engine = AliRtcEngine.getInstance();
        engineRef.current = engine;
        attachEngineListeners(engine);

        engine.setChannelProfile(AliRtcEngine.AliRtcSdkChannelProfile.AliRtcSdkCommunication);
        await engine.setClientRole(AliRtcEngine.AliRtcSdkClientRole.AliRtcSdkInteractive);
        engine.setDefaultSubscribeAllRemoteAudioStreams(true);
        engine.setDefaultSubscribeAllRemoteVideoStreams(true);

        if (localVideoRef.current) {
          await engine.setLocalViewConfig(localVideoRef.current, AliRtcEngine.AliRtcVideoTrack.AliRtcVideoTrackCamera);
        }
        await engine.startPreview();

        setStatusText('正在加入课堂...');
        await engine.joinChannel(authInfo, userName || safeText(authInfo.userId));

        if (cancelled || !mountedRef.current) return;
        joinedRef.current = true;
        setJoined(true);
        setStatusText('已进入课堂');
        setJoining(false);
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
  }, [attachEngineListeners, courseId, leaveAndDestroy]);

  const handleToggleMic = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !joinedRef.current) return;
    const nextMuted = !micMuted;
    try {
      engine.muteLocalMic(nextMuted);
      if (mountedRef.current) setMicMuted(nextMuted);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '麦克风切换失败'));
    }
  }, [micMuted]);

  const handleToggleCamera = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !joinedRef.current) return;
    const nextMuted = !cameraMuted;
    try {
      await engine.muteLocalCamera(nextMuted);
      if (mountedRef.current) setCameraMuted(nextMuted);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(parseErrorMessage(error, '摄像头切换失败'));
    }
  }, [cameraMuted]);

  const handleLeaveClassroom = useCallback(async () => {
    if (mountedRef.current) setStatusText('正在离开课堂...');
    await leaveAndDestroy();
    navigate(backHref, { replace: true });
  }, [backHref, leaveAndDestroy, navigate]);

  const controlsDisabled = joining || !joined;
  const courseIdText = safeText(session?.courseId || courseId);

  return (
    <div className="classroom-page">
      <div className="container">
        <header className="classroom-header">
          <BrandMark className="nav-logo-text" to={backHref} />
          <button
            type="button"
            className="classroom-back-btn"
            onClick={() => navigate(backHref)}
            aria-label="返回课程页"
          >
            <FiArrowLeft size={18} />
            <span>返回课程</span>
          </button>
        </header>

        <section className="classroom-meta">
          <h1>课堂</h1>
          <div className="classroom-status">{statusText}</div>
          {courseIdText ? <div className="classroom-course-id">课程ID：{courseIdText}</div> : null}
          {errorMessage ? <div className="classroom-error" role="alert">{errorMessage}</div> : null}
        </section>

        <section className="classroom-stage">
          <article className="classroom-video-panel">
            <div className="classroom-video-title">我的画面</div>
            <div className="classroom-video-box">
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
          </article>

          <article className="classroom-video-panel">
            <div className="classroom-video-title">对方画面</div>
            <div className="classroom-video-box">
              {!remoteUserId && <div className="classroom-video-placeholder">等待对方加入…</div>}
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
            className="classroom-control-btn leave"
            onClick={handleLeaveClassroom}
          >
            <FiPhoneOff size={16} />
            <span>离开课堂</span>
          </button>
        </section>
      </div>
    </div>
  );
}

export default ClassroomPage;
