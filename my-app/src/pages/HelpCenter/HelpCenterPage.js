import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import { getAuthToken } from '../../utils/authStorage';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
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
            question: '有问题如何联系Mentory',
            answer:
              '可以发送邮件到contact@mentory.cc',
          },
          {
            question: '如何找到心仪导师',
            answer:
              '建议先在设置中完善个人信息和空余时间，然后通过发布课程页面发布，接着可以点进导师的主页发送课程邀约',
          },
          {
            question: '如何找到具体的导师',
            answer:
              '若您知道导师的MentorID，可以直接通过上方的搜索框搜索',
          },
          {
            question: '已经预约课程了想要补充课件材料怎么办',
            answer:
              '可以点击发布课程需求，然后在完善课程需求中更新，或者直接等到开课了在课堂中上传',
          },
          {
            question: '如何快速设置空闲时间',
            answer:
              '如果某些日期有相同的时间安排，可通过鼠标多选日历中的日期',
          },
          {
            question: '导师主页日历里不同颜色的圆点是什么意思',
            answer:
              '粉色表示仅你这一天设置了空余时间，蓝色表示仅导师这一天设置了空余时间，紫色表示你和导师这一天都设置了空余时间',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        layout: 'grid',
        items: [
          {
            question: '最终课时按照课程页面显示的时长扣除吗',
            answer:
              '不是的，课堂完成后导师会填写实际课时，学生确认无误后课程页面会同步更新最终课时，并在钱包中扣除',
          },
          {
            question: '同一门课上了好几节，在课程里如何显示？',
            answer:
              '当前版本会对每一堂课分开显示',
          },
          {
            question: '已经预约了和导师的上课时间如何更改？',
            answer:
              '在消息页面中找到对应的消息卡片，可以修改时间',
          },
          {
            question: '对最终课程时长有疑问怎么办？',
            answer:
              '若学生对导师填写的课时存在不同意见（精确到0.25小时），可以在确认时提交自己认为的实际课时，然后Mentory会根据课堂数据和回放做出最终裁定',
          },
          {
            question: '消息页面发出去的内容多久能撤回？',
            answer:
              '没有固定时间，若对方已读且做出回应，则该消息不可撤回',
          },
          {
            question: '课程页对导师的评价还能修改吗？',
            answer:
              '可以的，修改后会覆盖本次课堂之前对导师的评价',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: '支付与课堂',
        layout: 'grid',
        items: [
          {
            question: '必须先支付后上课吗？',
            answer:
              '是的，课堂开始前，钱包里需要有足够的课时',
          },
          {
            question: '不同导师课时的价格是固定的吗？',
            answer:
              '是的，Mentory初期为保证服务质量，对导师做统一定价，后续可能会开放导师自定义价格',
          },
          {
            question: '想用Visa/MasterCard等卡支付怎么办？',
            answer:
              '选择Paypal，不通过Paypal账号，也可以用银行卡进行支付',
          },
          {
            question: '申请退款后多久可以到账？',
            answer:
              '确认退款后，Mentory会立即将退款提交至PayPal、支付宝、微信支付等，并从钱包扣除相应的未使用课时。退款将原路退回至付款账户，实际到账时间取决于原支付方式和金融机构',
          },
          {
            question: '课堂如何开启录制？',
            answer:
              'Mentory课堂会自动开启录制，学生和导师均可在课后的数个月内登录课程页面查看录像',
          },
          {
            question: '如果课堂设备异常怎么办？',
            answer:
              '先刷新并重新检查麦克风、摄像头和浏览器权限。如果仍异常，请及时在评论区打字告知老师，并联系平台处理，避免双方等待',
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
        title: '开始使用',
        layout: 'grid',
        items: [
          {
            question: '有问题如何联系Mentory',
            answer:
              '可以发送邮件到contact@mentory.cc',
          },
          {
            question: '如何成为Mentory导师？',
            answer:
              '可以通过注册页面选择注册导师，也可以在设置与数据 - 个人信息 - MentorID里开通',
          },
          {
            question: '成为Mentory导师有什么门槛？',
            answer:
              '首先我们会对你的简历进行审核，其次会进行一轮线上邀约，若匹配则可以通过',
          },
          {
            question: '想多给学生上课，怎样获取生源？',
            answer:
              '导师在判断有足够的能力进行授课后，可以主动通过平台发送邀约，或者联系Mentory进行宣传方面的商务合作',
          },
          {
            question: '导师也可以作为学生上课吗？',
            answer:
              '可以的，导师自动也会有StudentID，可在主页切换到学生，然后请教其它导师上课',
          },
          {
            question: '如何减少无效沟通？',
            answer:
              '把课程范围、预期结果、排课方式和材料要求说清楚。前置信息越完整，后续确认成本就越低',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        layout: 'grid',
        items: [
          {
            question: '课程页最适合管理哪些内容？',
            answer:
              '适合管理当前课程、安排变化和课堂入口。建议把它当作每周复盘和排课检查的主入口',
          },
          {
            question: '消息沟通怎样更高效？',
            answer:
              '把时间、作业、反馈和临时改动分点说明，避免信息散落。对重要结论可以单独发一条，方便学生回看',
          },
          {
            question: '什么时候要先看课程页？',
            answer:
              '当你要确认最新安排、课堂入口或课程节奏时，优先查看课程页，比单纯翻消息更容易抓住整体状态',
          },
          {
            question: '如何减少消息来回确认？',
            answer:
              '尽量把时间、目标、材料和行动项一次说清。结构化表达越明确，学生回复时越不容易遗漏重点',
          },
          {
            question: '临时变更安排时怎么同步？',
            answer:
              '先在消息页确认变更内容，再回到课程页核对是否一致。这样可以避免双方理解出现偏差',
          },
          {
            question: '课后消息适合发什么？',
            answer:
              '适合发送本次总结、作业要求、复习建议和下次课准备事项，方便学生课后直接回看执行',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: '课堂准备',
        layout: 'grid',
        items: [
          {
            question: '开始上课前建议检查什么？',
            answer:
              '检查网络、麦克风、摄像头、浏览器权限和共享屏幕是否可用，再确认课件、题目和板书材料已经就绪',
          },
          {
            question: '如果学生临时调整安排，怎样处理更稳妥？',
            answer:
              '先在消息页确认新的时间和影响范围，再回到课程页核对课程节奏，确保双方对下一步安排理解一致',
          },
          {
            question: '什么时候适合提前进入课堂？',
            answer:
              '建议至少提前几分钟进入，留出设备检测、资料打开和共享屏幕测试的时间，正式上课会更从容',
          },
          {
            question: '共享材料前要注意什么？',
            answer:
              '提前打开课件、题目和需要共享的页面，并确认无隐私内容误开，课堂中切换会更顺畅',
          },
          {
            question: '课前还需要和学生确认什么？',
            answer:
              '可以简短确认本次课程目标、要用的材料和是否有临时问题，帮助双方更快进入状态',
          },
          {
            question: '遇到设备问题时怎么处理？',
            answer:
              '先快速排查网络和浏览器权限，再通过消息页同步当前情况。如果短时间无法恢复，应尽快提出替代安排',
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
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: [mode] });
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
            className="icon-circle help-center-menu unread-badge-anchor"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={toggleMenu}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {isLoggedIn ? (
              <UnreadBadge
                count={totalBadgeCount}
                variant="nav"
                className="unread-badge-top-right"
                ariaLabel="待处理提醒"
              />
            ) : null}
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
