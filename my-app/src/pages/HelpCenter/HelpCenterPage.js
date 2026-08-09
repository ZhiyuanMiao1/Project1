import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import { getAuthToken } from '../../utils/authStorage';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { useI18n } from '../../i18n/language';
import './HelpCenterPage.css';

const HELP_TABS = [
  { key: 'student', label: '学生版', labelEn: 'For Students', path: '/student/help' },
  { key: 'mentor', label: '导师版', labelEn: 'For Mentors', path: '/mentor/help' },
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
            question: '同一门课上了好几节，在课程里如何显示',
            answer:
              '当前版本会对每一堂课分开显示',
          },
          {
            question: '已经预约了和导师的上课时间如何更改',
            answer:
              '在消息页面中找到对应的消息卡片，可以修改时间',
          },
          {
            question: '对最终课程时长有疑问怎么办',
            answer:
              '若学生对导师填写的课时存在不同意见（精确到0.25小时），可以在确认时提交自己认为的实际课时，然后Mentory会根据课堂数据和回放做出最终裁定',
          },
          {
            question: '消息页面发出去的内容多久能撤回',
            answer:
              '没有固定时间，若对方已读且做出回应，则该消息不可撤回',
          },
          {
            question: '课程页对导师的评价还能修改吗',
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
            question: '必须先支付后上课吗',
            answer:
              '是的，课堂开始前，钱包里需要有足够的课时',
          },
          {
            question: '不同导师课时的价格是固定的吗',
            answer:
              '是的，Mentory初期为保证服务质量，对导师做统一定价，后续可能会开放导师自定义价格',
          },
          {
            question: '想用Visa/MasterCard等卡支付怎么办',
            answer:
              '选择Paypal，不通过Paypal账号，也可以用银行卡进行支付',
          },
          {
            question: '申请退款后多久可以到账',
            answer:
              '确认退款后，Mentory会立即将退款提交至PayPal、支付宝、微信支付等，并从钱包扣除相应的未使用课时。退款将原路退回至付款账户，实际到账时间取决于原支付方式和金融机构',
          },
          {
            question: '课堂如何开启录制',
            answer:
              'Mentory课堂会自动开启录制，学生和导师均可在课后的数个月内登录课程页面查看录像',
          },
          {
            question: '如果课堂设备异常怎么办',
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
            question: '如何成为Mentory导师',
            answer:
              '可以通过注册页面选择注册导师，也可以在设置与数据 - 个人信息 - MentorID里开通',
          },
          {
            question: '成为Mentory导师有什么门槛',
            answer:
              '首先我们会对你的简历进行审核，其次会进行一轮线上邀约，若匹配则可以通过',
          },
          {
            question: '想多给学生上课，怎样获取生源',
            answer:
              '导师在判断有足够的能力进行授课后，可以主动通过平台发送邀约，或者联系Mentory进行宣传方面的商务合作',
          },
          {
            question: '导师也可以作为学生上课吗',
            answer:
              '可以的，导师自动也会有StudentID，可在主页切换到学生，然后请教其它导师上课',
          },
          {
            question: '成为Mentory导师后最先应该做什么',
            answer:
              '推荐先完善个人名片，不是所有项都为必填，但是导师资料越完整有更高概率被展示在首页',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: '课程与消息',
        layout: 'grid',
        items: [
          {
            question: '某节课的课时填错了，怎么办',
            answer:
              '学生确认前，导师可以在课程页多次重新填写并提交。新提交的课时会取代前一次待确认的记录',
          },
          {
            question: '已经预约了和学生的上课时间如何更改',
            answer:
              '在消息页面中找到对应的消息卡片，可以修改时间或取消课程',
          },
          {
            question: '如何查看学生的材料以备课',
            answer:
              '点击对应的消息卡片右上方三个点，课程需求详情，即可跳转页面查看学生提交的详细信息',
          },
          {
            question: '什么情况下学生的课时会被消耗',
            answer:
              '当且仅当课堂结束，导师填写课时且学生无异议，才会扣除学生的课时，并计算导师的授课课时',
          },
          {
            question: '什么时候会出现“本节未上课”选项',
            answer:
              '课程预约已被对方接受，已到达课程约定的开始时间，且导师尚未发起本节课的课时确认时会出现',
          },
          {
            question: '选择“本节未上课”会有什么影响',
            answer:
              '若对方确认“未上课”，本节课程将被移除，不扣除学生课时，原课程需求会重新开放。若对方选择“实际已上课”：课程将继续保留，之后仍需由双方确认实际课时',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: '支付与课堂',
        layout: 'grid',
        items: [
          {
            question: '学生一直不确认导致导师无法计入授课课时怎么办',
            answer:
              '无需担心，学生登录后需要确认课时才能进行其它活动。且若1周内未确认或提出异议，系统将按导师提交的课时自动确认并扣除',
          },
          {
            question: '导师在课堂需要注意什么',
            answer:
              '课堂结束时记得不要直接退出，填写完本节课的课时再退出；以及如果学生有后续课程的需求，最好通过按钮提前预约',
          },
          {
            question: '可以用iPad、iPhone共享屏幕授课吗',
            answer:
              'iPhone/iPad不支持主动共享屏幕。移动端浏览器目前无法提供 Mentory 所需的网页屏幕捕获能力，但可以观看别人共享的画面',
          },
          {
            question: '更推荐如何参与课堂',
            answer:
              '由于Mentory暂时没有基于IOS的原生APP，导致iPad共享屏幕受限，如若板书目前更推荐使用Mac及电脑展示',
          },
          {
            question: '学生在课堂上评论区上传的文件课后还会有吗',
            answer:
              '课后短时间内可能还看得到，但文件不是永久保留的。需要保留的课堂文件务必在下课前下载，不要把课堂评论区当作长期网盘',
          },
          {
            question: '如果课堂设备异常怎么办',
            answer:
              '先刷新并重新检查麦克风、摄像头和浏览器权限。如果仍异常，请及时在评论区打字告知学生，并联系平台处理，避免双方等待',
          },
        ],
      },
    ],
  },
};

const HELP_CONTENT_EN = {
  student: {
    homePath: '/student',
    sections: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        layout: 'grid',
        items: [
          {
            question: 'How to contact Mentory',
            answer: 'Email us at contact@mentory.cc.',
          },
          {
            question: 'How to find the right mentor',
            answer: 'First complete your profile and availability in Settings. Then post your request from the Post Request page, or visit a mentor’s profile and send a course invitation.',
          },
          {
            question: 'How to find a specific mentor',
            answer: 'If you know the mentor’s MentorID, enter it directly in the search bar above.',
          },
          {
            question: 'How to add course materials after booking a class',
            answer: 'Open Post Request and update the materials under Complete Course Request, or upload them in the classroom after the class starts.',
          },
          {
            question: 'How to set availability quickly',
            answer: 'If several dates share the same schedule, select multiple dates on the calendar with your mouse.',
          },
          {
            question: 'What the colored dots on a mentor’s calendar mean',
            answer: 'Pink means only you are available that day, blue means only the mentor is available, and purple means both you and the mentor are available.',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: 'Courses & Messages',
        layout: 'grid',
        items: [
          {
            question: 'Whether the displayed course duration is the final amount deducted',
            answer: 'No. After class, the mentor submits the actual duration. Once the student confirms it, the course page updates and the final hours are deducted from the wallet.',
          },
          {
            question: 'How multiple sessions of the same course are displayed',
            answer: 'In the current version, each session is displayed separately.',
          },
          {
            question: 'How to change a booked class time with a mentor',
            answer: 'Find the corresponding card on the Messages page and change the time there.',
          },
          {
            question: 'What to do if you disagree with the final course duration',
            answer: 'If you disagree with the hours submitted by the mentor, you can enter the duration you believe is correct in 0.25-hour increments during confirmation. Mentory will make a final decision based on classroom data and the recording.',
          },
          {
            question: 'How long a sent message can be recalled',
            answer: 'There is no fixed time limit. A message cannot be recalled after the other person has read and responded to it.',
          },
          {
            question: 'Whether a mentor review can be edited',
            answer: 'Yes. The updated review will replace your previous review of the mentor from before this session.',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: 'Payments & Classroom',
        layout: 'grid',
        items: [
          {
            question: 'Whether payment is required before class',
            answer: 'Yes. Your wallet must contain enough hours before the class begins.',
          },
          {
            question: 'Whether all mentors have the same hourly price',
            answer: 'Yes. To maintain service quality during Mentory’s early stage, mentor pricing is standardized. Mentors may be able to set their own prices in the future.',
          },
          {
            question: 'How to pay with a Visa or Mastercard',
            answer: 'Select PayPal. You can pay with a bank card without using a PayPal account.',
          },
          {
            question: 'How long a refund takes to arrive',
            answer: 'Once confirmed, Mentory immediately submits the refund to the original provider, such as PayPal, Alipay, or WeChat Pay, and deducts the unused hours from your wallet. The arrival time depends on the payment method and financial institution.',
          },
          {
            question: 'How classroom recording starts',
            answer: 'Mentory records classes automatically. Students and mentors can view the recording from the course page for several months after class.',
          },
          {
            question: 'What to do if classroom equipment is not working',
            answer: 'Refresh the page and check your microphone, camera, and browser permissions again. If the issue continues, tell the mentor in the comments and contact Mentory promptly so neither side is left waiting.',
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
        title: 'Getting Started',
        layout: 'grid',
        items: [
          {
            question: 'How to contact Mentory',
            answer: 'Email us at contact@mentory.cc.',
          },
          {
            question: 'How to become a Mentory mentor',
            answer: 'Choose mentor registration on the sign-up page, or activate mentoring from Settings & Data – Personal Information – MentorID.',
          },
          {
            question: 'Requirements for becoming a Mentory mentor',
            answer: 'We first review your résumé, followed by an online interview. You can join as a mentor if there is a good match.',
          },
          {
            question: 'How to find more students',
            answer: 'Once you are confident you can teach a course, you can proactively send invitations through the platform or contact Mentory about promotional partnerships.',
          },
          {
            question: 'Whether mentors can also take classes as students',
            answer: 'Yes. Every mentor automatically receives a StudentID. Switch to the student view from the home page to take classes with other mentors.',
          },
          {
            question: 'What to do first after becoming a Mentory mentor',
            answer: 'We recommend completing your profile card first. Not every field is required, but a more complete profile is more likely to be featured on the home page.',
          },
        ],
      },
      {
        id: 'courses-and-messages',
        title: 'Courses & Messages',
        layout: 'grid',
        items: [
          {
            question: 'What to do if the duration for a session was entered incorrectly',
            answer: 'Before the student confirms, the mentor can update and resubmit the duration from the course page. The latest submission replaces the previous pending record.',
          },
          {
            question: 'How to change a booked class time with a student',
            answer: 'Find the corresponding card on the Messages page to change the time or cancel the course.',
          },
          {
            question: 'How to view a student’s materials when preparing for class',
            answer: 'Open the three-dot menu in the top-right corner of the relevant message card and select Course Request Details to view the information submitted by the student.',
          },
          {
            question: 'When a student’s hours are deducted',
            answer: 'Hours are deducted and counted toward the mentor’s teaching total only after the class ends, the mentor submits the duration, and the student raises no objection.',
          },
          {
            question: 'When the “Class Did Not Take Place” option appears',
            answer: 'It appears when the other person has accepted the booking, the scheduled start time has arrived, and the mentor has not yet submitted the session duration for confirmation.',
          },
          {
            question: 'What happens after selecting “Class Did Not Take Place”',
            answer: 'If the other person confirms that the class did not take place, the session is removed, no student hours are deducted, and the original course request reopens. If they select “Class Actually Took Place,” the session remains and both parties must still confirm the actual duration.',
          },
        ],
      },
      {
        id: 'payments-and-classroom',
        title: 'Payments & Classroom',
        layout: 'grid',
        items: [
          {
            question: 'What happens if a student does not confirm the duration',
            answer: 'There is no need to worry. Students must confirm pending hours after logging in before they can continue with other activities. If they neither confirm nor dispute the duration within one week, the system automatically confirms the mentor’s submission and deducts the hours.',
          },
          {
            question: 'What mentors should remember during class',
            answer: 'At the end of class, submit the session duration before leaving. If the student needs another session, it is best to schedule it in advance using the booking button.',
          },
          {
            question: 'Whether an iPad or iPhone can share its screen in class',
            answer: 'iPhones and iPads cannot initiate screen sharing. Mobile browsers currently do not provide the web screen-capture capabilities Mentory requires, though they can display another participant’s shared screen.',
          },
          {
            question: 'Recommended way to join a class',
            answer: 'Mentory does not currently have a native iOS app, so screen sharing from an iPad is limited. For handwriting or visual demonstrations, we recommend presenting from a Mac or another computer.',
          },
          {
            question: 'Whether files uploaded in classroom comments remain available after class',
            answer: 'They may remain visible for a short time, but they are not stored permanently. Download any files you need before class ends and do not use classroom comments as long-term storage.',
          },
          {
            question: 'What to do if classroom equipment is not working',
            answer: 'Refresh the page and check your microphone, camera, and browser permissions again. If the issue continues, tell the student in the comments and contact Mentory promptly so neither side is left waiting.',
          },
        ],
      },
    ],
  },
};

function HelpCenterPage({ mode = 'student' }) {
  const { isEnglish, t } = useI18n();
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: [mode] });
  const content = useMemo(() => {
    const localizedContent = isEnglish ? HELP_CONTENT_EN : HELP_CONTENT;
    return localizedContent[mode] || localizedContent.student;
  }, [isEnglish, mode]);

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
            aria-label={t('common.menuMore', '更多菜单')}
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
                ariaLabel={t('common.pendingReminders', '待处理提醒')}
              />
            ) : null}
          </button>
        </header>

        <section className="help-center-hero">
          <h1>{t('app.route.help', '帮助中心')}</h1>
        </section>

        <nav
          className="help-center-tabs"
          aria-label={isEnglish ? 'Switch Help Center role' : '帮助中心身份切换'}
        >
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
                {isEnglish ? tab.labelEn : tab.label}
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
