import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FiBookOpen, FiClock, FiCompass, FiCreditCard, FiMessageCircle, FiShield } from 'react-icons/fi';
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
    quickLinks: [
      {
        href: '#getting-started',
        title: '开始使用',
        description: '先明确目标、时区和课程方向，再进入筛选与收藏。',
        icon: FiCompass,
      },
      {
        href: '#courses-and-messages',
        title: '课程与消息',
        description: '用课程页跟进进度，用消息页确认时间、材料和变更。',
        icon: FiMessageCircle,
      },
      {
        href: '#payments-and-classroom',
        title: '支付与课堂',
        description: '充值课时、查看课堂入口，并为上课前准备留出缓冲。',
        icon: FiCreditCard,
      },
    ],
    sections: [
      {
        id: 'getting-started',
        title: '开始使用',
        summary: '先缩小范围，再联系合适的导师，效率会更高。',
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
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        summary: '所有和推进课程有关的信息，尽量都留在站内，后续更容易回看。',
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
        summary: '支付和开课前准备是两个最容易被忽略的环节。',
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
    faqs: [
      {
        question: '收藏和最近浏览有什么区别？',
        answer: '收藏用于长期保留，最近浏览用于快速回到刚看过的导师或页面，两者用途不同，建议配合使用。',
      },
      {
        question: '登录状态失效怎么办？',
        answer: '重新登录即可。系统会尽量保留你原本想访问的页面路径，登录后通常会自动回到对应位置。',
      },
      {
        question: '页面异常时应该先做什么？',
        answer: '先刷新页面，再记录问题出现前的操作顺序。如果涉及课堂、支付或消息异常，建议同时截图保留信息，方便后续排查。',
      },
      {
        question: '我还没准备好正式上课，可以先沟通吗？',
        answer: '可以。先通过消息页确认目标、课程节奏和资料准备，再决定正式安排，会比直接进入课堂更稳妥。',
      },
    ],
    footerNote:
      '如果你暂时找不到答案，优先从课程页、消息页和设置页回看上下文，通常能更快定位问题发生在哪一步。',
  },
  mentor: {
    homePath: '/mentor',
    quickLinks: [
      {
        href: '#getting-started',
        title: '名片与接单',
        description: '先把个人名片信息写清楚，再处理课程与学生沟通。',
        icon: FiBookOpen,
      },
      {
        href: '#courses-and-messages',
        title: '课程与消息',
        description: '统一在站内确认时间、节奏、资料和后续安排。',
        icon: FiMessageCircle,
      },
      {
        href: '#payments-and-classroom',
        title: '课堂准备',
        description: '上课前检查设备、材料与共享权限，减少课堂中断。',
        icon: FiClock,
      },
    ],
    sections: [
      {
        id: 'getting-started',
        title: '名片与接单',
        summary: '先把可交付内容说清楚，后续沟通成本会明显更低。',
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
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        summary: '课程页负责进度，消息页负责上下文，两者最好配合使用。',
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
        summary: '上课体验稳定，往往取决于上课前的 10 分钟准备。',
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
    faqs: [
      {
        question: '导师审核中时为什么部分功能不可用？',
        answer: '这是为了保证资料完整与身份一致。审核完成后，对应功能会按权限自动恢复。',
      },
      {
        question: '学生收藏和导师收藏是同一套数据吗？',
        answer: '不是。系统会区分不同身份下的收藏内容，避免学生端和导师端相互干扰。',
      },
      {
        question: '课堂前多久进入页面比较合适？',
        answer: '建议至少提前 5 分钟进入，给设备检测、资料打开和临时沟通留出余量。',
      },
      {
        question: '遇到页面异常时，应该如何描述问题？',
        answer: '尽量说明你所在页面、刚执行过的操作、出现的提示和复现频率。信息越完整，越容易快速定位。',
      },
    ],
    footerNote:
      '如果你在多个页面之间切换排查问题，优先按“消息页确认上下文 -> 课程页确认状态 -> 设置页确认资料”的顺序检查。',
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

        <nav className="help-center-quick-links" aria-label="帮助中心导航">
          {content.quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.href} className="help-center-quick-card" href={item.href}>
                <span className="help-center-quick-icon" aria-hidden="true">
                  <Icon />
                </span>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </a>
            );
          })}
        </nav>

        <main className="help-center-layout">
          <div className="help-center-main">
            {content.sections.map((section) => (
              <section key={section.id} id={section.id} className="help-center-section">
                <div className="help-center-section-heading">
                  <h2>{section.title}</h2>
                  <p>{section.summary}</p>
                </div>
                <div className="help-center-topic-list">
                  {section.items.map((item) => (
                    <article key={item.question} className="help-center-topic-card">
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="help-center-aside">
            <section className="help-center-note-card">
              <div className="help-center-note-icon" aria-hidden="true">
                <FiShield />
              </div>
              <h2>查找建议</h2>
              <p>
                遇到问题时，先确认自己当前所在页面，再回想上一条关键操作。按步骤回看，比直接重复点击更容易找到原因。
              </p>
            </section>

            <section id="faq" className="help-center-faq-card">
              <h2>常见问题</h2>
              <div className="help-center-faq-list">
                {content.faqs.map((item) => (
                  <details key={item.question} className="help-center-faq-item">
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="help-center-footer-card">
              <h2>排查小提示</h2>
              <p>{content.footerNote}</p>
            </section>
          </aside>
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
