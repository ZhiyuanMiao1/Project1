import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { getAuthToken } from '../../utils/authStorage';
import './HelpCenterPage.css';

const HELP_TABS = [
  { key: 'student', label: '学生版', path: '/student/help' },
  { key: 'mentor', label: '导师版', path: '/mentor/help' },
];

const HELP_CONTENT = {
  student: {
    homePath: '/student',
    sections: [
      {
        id: 'getting-started',
        title: '开始使用',
        layout: 'grid',
        items: [
          {
            question: '怎样更快找到合适的导师？',
            answer:
              '先按课程方向、语言、时区和导师风格筛选，再用收藏功能保留候选名单。比较时重点看课程经验、沟通方式和可预约时间。',
          },
          {
            question: '发布课程需求前要准备什么？',
            answer:
              '建议提前整理学习目标、当前基础、期望频率、可上课时间和参考材料。信息越清楚，导师越容易判断是否匹配。',
          },
          {
            question: '什么时候适合先收藏导师？',
            answer:
              '当你已经确认方向，但还想再横向比较教学风格、学校背景或时间安排时，先收藏更方便后续集中决策。',
          },
          {
            question: '最近浏览适合怎么用？',
            answer:
              '适合快速找回刚看过的导师资料。若只是临时对比，不必立即收藏，可以先通过最近浏览回看。',
          },
          {
            question: '第一次沟通应该说清什么？',
            answer:
              '建议直接说明学习目标、当前基础、希望解决的问题和可上课时间，这样导师更容易快速判断是否匹配。',
          },
          {
            question: '如何提高匹配效率？',
            answer:
              '先缩小课程范围，再结合时区、语言和上课节奏筛选。条件越清楚，越容易找到真正合适的人选。',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        items: [
          {
            question: '课程页适合查看什么？',
            answer:
              '课程页更适合看整体进度，包括待确认课程、历史安排和课堂入口。把它当作你的学习时间轴即可。',
          },
          {
            question: '消息页里建议聊哪些内容？',
            answer:
              '适合确认上课时间、课程重点、作业反馈、材料补充和临时变更。关键信息尽量写清楚，避免只留一句“稍后再说”。',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: '支付与课堂',
        items: [
          {
            question: '什么时候适合先去钱包页？',
            answer:
              '当你已经准备开始上课，或需要确认剩余课时是否充足时，先看钱包页。这样在临近上课时不会因为余额不足而中断安排。',
          },
          {
            question: '进入课堂前建议做哪些检查？',
            answer:
              '提前确认网络、麦克风、摄像头和浏览器权限是否正常，同时准备好课件、题目或笔记。建议至少预留 5 到 10 分钟缓冲时间。',
          },
        ],
      },
    ],
  },
  mentor: {
    homePath: '/mentor',
    sections: [
      {
        id: 'getting-started',
        title: '名片与接单',
        layout: 'grid',
        items: [
          {
            question: '个人名片里最重要的信息是什么？',
            answer:
              '优先写清课程方向、适合的学生阶段、授课语言、可预约时段和你的教学方式。信息越具体，越容易吸引匹配的学生。',
          },
          {
            question: '收到课程需求后，第一步该做什么？',
            answer:
              '先确认目标、基础、时间安排和资料准备是否匹配，再决定是否继续推进。不要在目标尚不明确时直接承诺排课。',
          },
          {
            question: '怎样让名片更容易被理解？',
            answer:
              '尽量少写空泛描述，多写可验证的信息，例如教授过哪些课程、适合哪些阶段的学生，以及你常用的授课方式。',
          },
          {
            question: '第一次回复学生时重点说什么？',
            answer:
              '优先回应目标是否匹配、你能提供的帮助、建议的课程节奏和可安排时间，让沟通尽快进入具体阶段。',
          },
          {
            question: '什么时候适合继续推进？',
            answer:
              '当学生的目标、时间和资料准备已经比较明确时，再推进课程安排会更稳，也能减少后续反复修改。',
          },
          {
            question: '如何减少无效沟通？',
            answer:
              '把课程范围、预期结果、排课方式和材料要求说清楚。前置信息越完整，后续确认成本就越低。',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        items: [
          {
            question: '课程页最适合管理哪些内容？',
            answer:
              '适合管理当前课程、安排变化和课堂入口。建议把它当作每周复盘和排课检查的主入口。',
          },
          {
            question: '消息沟通怎样更高效？',
            answer:
              '把时间、作业、反馈和临时改动分点说明，避免信息散落。对重要结论可以单独发一条，方便学生回看。',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: '课堂准备',
        items: [
          {
            question: '开始上课前建议检查什么？',
            answer:
              '检查网络、麦克风、摄像头、浏览器权限和共享屏幕是否可用，再确认课件、题目和板书材料已经就绪。',
          },
          {
            question: '如果学生临时调整安排，怎样处理更稳妥？',
            answer:
              '先在消息页确认新的时间和影响范围，再回到课程页核对课程节奏，确保双方对下一步安排理解一致。',
          },
        ],
      },
    ],
  },
};

function HelpCenterPage({ mode = 'student' }) {
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const content = useMemo(() => HELP_CONTENT[mode] || HELP_CONTENT.student, [mode]);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };

    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const toggleMenu = () => {
    if (mode === 'mentor') {
      setShowMentorAuth((prev) => !prev);
      return;
    }
    setShowStudentAuth((prev) => !prev);
  };

  return (
    <div className="help-center-page">
      <div className="container">
        <header className="help-center-header">
          <BrandMark className="nav-logo-text" to={content.homePath} />
          <button
            type="button"
            className="icon-circle help-center-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={toggleMenu}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="help-center-hero">
          <h1>帮助中心</h1>
        </section>

        <nav className="help-center-tabs" aria-label="帮助中心身份切换">
          {HELP_TABS.map((tab) => {
            const isActive = tab.key === mode;
            return (
              <button
                key={tab.key}
                type="button"
                className={`help-center-tab${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (isActive) return;
                  navigate(tab.path);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <main className="help-center-main">
          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className="help-center-section">
              <div className="help-center-section-heading">
                <h2>{section.title}</h2>
              </div>
              <div
                className={`help-center-topic-list${section.layout === 'grid' ? ' help-center-topic-list--grid' : ''}`}
              >
                {section.items.map((item) => (
                  <article
                    key={item.question}
                    className={`help-center-topic-card${section.layout === 'grid' ? ' help-center-topic-card--grid' : ''}`}
                  >
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>

      {showStudentAuth && mode === 'student' && (
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

      {showMentorAuth && mode === 'mentor' && (
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

HelpCenterPage.propTypes = {
  mode: PropTypes.oneOf(['student', 'mentor']),
};

export default HelpCenterPage;
