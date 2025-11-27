import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiPaperclip, FiSend } from 'react-icons/fi';
import { FaRegCircle } from 'react-icons/fa';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import './MessagesPage.css';

const STUDENT_THREADS = [
  {
    id: 's-01',
    subject: '系统设计作业反馈',
    counterpart: '李老师',
    counterpartMeta: '导师 · 后端方向',
    time: '今天 09:20',
    unread: true,
    tags: ['待确认', '课前准备'],
    summary: '李老师：这周三晚上可以安排一次作业讲评，你看 8 点是否合适？',
    messages: [
      { id: 's-01-1', author: '李老师', from: 'them', time: '09:20', text: '这周三晚上可以安排一次作业讲评，你看 8 点是否合适？' },
      { id: 's-01-2', author: '我', from: 'me', time: '09:32', text: '周三 8 点没问题，我会提前准备好代码实现和问题列表。' },
      { id: 's-01-3', author: '李老师', from: 'them', time: '09:36', text: '好的，记得把接口文档同步在评论里，我会重点看边界条件。' },
    ],
  },
  {
    id: 's-02',
    subject: '首课前确认',
    counterpart: 'Mia 导师',
    counterpartMeta: '导师 · 数据科学',
    time: '昨天 21:05',
    unread: false,
    tags: ['排期确认'],
    summary: 'Mia 导师：下周一或周三均可，一节课 90 分钟，你看哪个时间段舒服？',
    messages: [
      { id: 's-02-1', author: 'Mia 导师', from: 'them', time: '21:05', text: '下周一或周三均可，一节课 90 分钟，你看哪个时间段舒服？' },
      { id: 's-02-2', author: '我', from: 'me', time: '21:17', text: '周三晚上 7 点后都行，麻烦帮我锁一下时间。' },
      { id: 's-02-3', author: 'Mia 导师', from: 'them', time: '21:20', text: '收到，那我先占位 19:30-21:00，到时见。' },
    ],
  },
  {
    id: 's-03',
    subject: '作业批改回传',
    counterpart: '陈老师',
    counterpartMeta: '导师 · 算法刷题',
    time: '周一 10:12',
    unread: false,
    tags: ['已完成'],
    summary: '陈老师：批改已上传，另外补充了两道同类题的题解。',
    messages: [
      { id: 's-03-1', author: '陈老师', from: 'them', time: '10:12', text: '批改已上传，另外补充了两道同类题的题解。' },
      { id: 's-03-2', author: '我', from: 'me', time: '10:20', text: '收到，谢谢老师，我先过一遍，如果有问题再跟您同步。' },
    ],
  },
];

const MENTOR_THREADS = [
  {
    id: 'm-01',
    subject: '算法刷题套餐 - 课后跟进',
    counterpart: 'Alex 同学',
    counterpartMeta: '学生 · 已上 3 节',
    time: '今天 08:40',
    unread: true,
    tags: ['待反馈', '作业跟进'],
    summary: 'Alex：昨晚那道二叉树题还是没想通，能否给点提示？',
    messages: [
      { id: 'm-01-1', author: 'Alex 同学', from: 'them', time: '08:40', text: '昨晚那道二叉树题还是没想通，能否给点提示？' },
      { id: 'm-01-2', author: '我', from: 'me', time: '08:55', text: '可以先尝试递归求左右子树高度，再判断平衡性；今天晚些我补一版讲解。' },
    ],
  },
  {
    id: 'm-02',
    subject: '毕业设计指导预约',
    counterpart: 'Joyce',
    counterpartMeta: '学生 · 新预约',
    time: '昨天 19:10',
    unread: false,
    tags: ['排期确认'],
    summary: 'Joyce：周五下午可否约 1.5 小时，主要想确认技术选型。',
    messages: [
      { id: 'm-02-1', author: 'Joyce', from: 'them', time: '19:10', text: '周五下午可否约 1.5 小时，主要想确认技术选型。' },
      { id: 'm-02-2', author: '我', from: 'me', time: '19:22', text: '周五 15:00-16:30 可以，提前把需求文档发我一下。' },
      { id: 'm-02-3', author: 'Joyce', from: 'them', time: '19:35', text: '已上传草稿版，麻烦帮我看看有没有明显风险。' },
    ],
  },
  {
    id: 'm-03',
    subject: '课程回访',
    counterpart: '王同学',
    counterpartMeta: '学生 · 已结课',
    time: '周二 14:30',
    unread: false,
    tags: ['已完成'],
    summary: '王同学：这周会把作业整理好后发您，辛苦查看。',
    messages: [
      { id: 'm-03-1', author: '王同学', from: 'them', time: '14:30', text: '这周会把作业整理好后发您，辛苦查看。' },
      { id: 'm-03-2', author: '我', from: 'me', time: '14:44', text: '好的，收到。我看完会在周末前给你反馈。' },
    ],
  },
];

function MessagesPage({ mode = 'student' }) {
  const isMentorView = mode === 'mentor';
  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const threads = useMemo(
    () => (isMentorView ? MENTOR_THREADS : STUDENT_THREADS),
    [isMentorView],
  );

  const [activeId, setActiveId] = useState(() => threads[0]?.id || null);

  useEffect(() => {
    setActiveId(threads[0]?.id || null);
  }, [threads]);

  const activeThread = threads.find((item) => item.id === activeId) || threads[0];
  const detailAvatarInitial = useMemo(() => {
    const name = activeThread?.counterpart || '';
    return name.trim().charAt(0) || '·';
  }, [activeThread]);
  const scheduleNote = activeThread?.messages?.[0]?.text || '暂无补充说明';
  const scheduleTime = activeThread?.time || '待定';

  return (
    <div className="messages-page">
      <div className="container">
        <header className="messages-header">
          <BrandMark className="nav-logo-text" to={homeHref} />
          <button
            type="button"
            className="icon-circle messages-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => (isMentorView ? setShowMentorAuth(true) : setShowStudentAuth(true))}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="messages-hero">
          <h1>消息</h1>
        </section>

        <section className="messages-shell" aria-label="消息列表与详情">
          <div className="messages-list-pane">
            <div className="messages-list-title">
              <div>
                <div className="messages-title-label">最近</div>
                <div className="messages-title-sub">
                  {isMentorView ? '学生会话' : '导师会话'}
                </div>
              </div>
              <div className="messages-pill">{threads.length} 个会话</div>
            </div>
            <div className="messages-list">
              {threads.map((thread) => {
                const initial = (thread.counterpart || '').trim().charAt(0) || '·';
                const isActive = thread.id === activeThread?.id;
                const rawTime = thread.time || '';
                const timeParts = rawTime.split(/\s+/).filter(Boolean);
                const displayDate = (timeParts[0] === '今天' && timeParts[1]) ? timeParts[1] : (timeParts[0] || rawTime);
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`message-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveId(thread.id)}
                    aria-pressed={isActive}
                  >
                    <div className="message-item-shell">
                      <div className="message-avatar" aria-hidden="true">{initial}</div>
                      <div className="message-content">
                        <div className="message-name">{thread.counterpart}</div>
                        <div className="message-subject">{thread.subject}</div>
                      </div>
                      <div className="message-meta-col">
                        <div className="message-time">{displayDate}</div>
                        <div className="message-more" aria-label="更多操作" role="presentation">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="messages-divider" aria-hidden="true" />

          <div className="messages-detail-pane">
            {activeThread ? (
              <>
                <div className="message-detail-head">
                  <div className="message-detail-identity">
                    <div className="message-detail-avatar" aria-hidden="true">{detailAvatarInitial}</div>
                    <div className="message-detail-name">{activeThread.counterpart}</div>
                  </div>
                </div>

                <div className="message-detail-body">
                  <div className="schedule-row">
                    <div className="message-detail-avatar" aria-hidden="true">{detailAvatarInitial}</div>
                    <div className="schedule-card">
                      <div className="schedule-card-top">
                        <div className="schedule-card-top-info">
                          <div className="schedule-card-title">对方发来日程卡片</div>
                          <div className="schedule-card-sub">{activeThread.subject} · {activeThread.counterpartMeta}</div>
                        </div>
                        <div className="schedule-card-status">待回应</div>
                      </div>

                      <div className="schedule-card-meta">
                        <div className="schedule-field">
                          <div className="field-label">发起人</div>
                          <div className="field-value">{activeThread.counterpart}</div>
                        </div>
                        <div className="schedule-field">
                          <div className="field-label">拟定时间</div>
                          <div className="field-value">{scheduleTime}</div>
                        </div>
                        <div className="schedule-field">
                          <div className="field-label">备注</div>
                          <div className="schedule-note">{scheduleNote}</div>
                        </div>
                      </div>

                      <div className="schedule-actions">
                        <button type="button" className="schedule-btn primary">接受日程</button>
                        <button type="button" className="schedule-btn ghost">不接受</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="message-quick-actions">
                  <button type="button" className="message-action-btn primary">
                    <FiSend size={16} />
                    快速回复
                  </button>
                  <button type="button" className="message-action-btn ghost">
                    <FiPaperclip size={16} />
                    添加备注/附件
                  </button>
                  <button type="button" className="message-action-btn ghost">
                    <FaRegCircle size={14} />
                    标记未读
                  </button>
                </div>
              </>
            ) : (
              <div className="messages-empty">选择左侧的一条会话查看详情</div>
            )}
          </div>
        </section>
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default MessagesPage;
