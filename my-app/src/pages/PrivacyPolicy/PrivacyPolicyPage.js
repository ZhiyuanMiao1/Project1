import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import SiteFooter from '../../components/common/SiteFooter/SiteFooter';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { getAuthToken } from '../../utils/authStorage';
import { useI18n } from '../../i18n/language';
import './PrivacyPolicyPage.css';

const POLICY_CONTENT = {
  'zh-CN': {
    breadcrumb: ['帮助中心', '规则', '隐私政策'],
    helpPath: '/student/help',
    title: 'Mentory 隐私政策',
    eyebrow: '让每一次学习连接，都建立在信任之上',
    intro: '本隐私政策说明 Mentory 在你使用平台、预约课程、进入在线课堂或与我们联系时，如何收集、使用、共享和保护你的个人信息，以及你可以如何管理自己的信息。',
    updated: '最后更新：2026年8月11日',
    effective: '生效日期：2026年8月11日',
    tocTitle: '本文内容',
    relatedTitle: '还需要帮助？',
    relatedText: '如果你对个人信息处理方式、账户数据或隐私权利有疑问，我们愿意为你提供帮助。',
    relatedAction: '前往帮助中心',
    contactAction: '联系我们',
    top: '返回顶部',
    sections: [
      {
        id: 'scope',
        title: '1. 适用范围',
        paragraphs: [
          '本政策适用于 Mentory 面向学生、导师及访客提供的网站、在线课堂、消息、支付与其他相关服务。若某项服务另有单独的隐私说明，该说明将与本政策一并适用。',
          '使用 Mentory 即表示你已阅读并了解本政策。我们不会因为你不同意非必要的数据处理而降低核心服务质量。',
        ],
      },
      {
        id: 'collection',
        title: '2. 我们收集的信息',
        lead: '我们只收集提供和改进学习服务所合理需要的信息，主要包括：',
        items: [
          ['你主动提供的信息', '例如姓名、邮箱、头像、学校与学位、个人简介、课程需求、可用时间、课件，以及你发送给其他用户或客服的内容。'],
          ['课程与交易信息', '例如预约记录、课堂参与情况、实际课时、评价、钱包余额，以及支付或退款状态。完整支付凭证通常由支付服务商处理。'],
          ['设备与使用信息', '例如浏览器类型、设备信息、IP 地址、访问时间、页面操作、错误日志和必要的 Cookie，用于保障登录、安全与服务稳定。'],
          ['课堂音视频信息', '在明确提示后，为提供课堂、回放、质量保障和争议处理功能，我们可能处理课堂音视频、共享内容与文字评论。'],
        ],
      },
      {
        id: 'use',
        title: '3. 我们如何使用信息',
        lead: '我们会基于提供服务、履行协议、保障安全、遵守法律或取得你的同意来处理信息，包括用于：',
        bullets: [
          '创建和维护账户，验证身份并提供学生或导师功能；',
          '匹配课程需求与导师，安排课堂、发送提醒并同步学习进度；',
          '处理充值、课时结算、导师收入、退款及相关记录；',
          '提供消息、课堂录制与回放、客服和争议处理；',
          '检测欺诈、滥用与安全风险，排查故障并改进产品体验；',
          '在你允许的情况下发送产品动态、活动或个性化推荐。',
        ],
      },
      {
        id: 'sharing',
        title: '4. 信息如何共享',
        paragraphs: ['我们不会出售你的个人信息。仅在完成服务所必需或法律允许的范围内，可能与以下对象共享相关信息：'],
        items: [
          ['与你互动的用户', '学生与导师会看到完成匹配、预约、课堂和评价所需的信息。我们会根据场景限制展示范围。'],
          ['服务提供商', '例如云存储、音视频、邮件、支付、风控和技术支持服务商；他们只能按照我们的指示处理信息。'],
          ['依法披露', '当法律法规、司法或行政机关要求，或为保护用户、平台及公众的合法权益与安全确有必要时。'],
          ['业务变更', '若发生合并、收购或资产转让，我们会采取合理措施确保信息继续受到本政策或不低于本政策的保护。'],
        ],
      },
      {
        id: 'retention',
        title: '5. 保存与安全',
        paragraphs: [
          '我们仅在实现本政策所述目的、履行合同、解决争议及满足法律要求所需的期限内保存个人信息。不同类型信息的保存期限会因服务场景而异；超过必要期限后，我们会删除或匿名化处理。',
          '我们采用访问控制、传输加密、权限隔离、日志审计和备份等合理措施保护信息。互联网服务无法保证绝对安全；如发现可能影响你权益的安全事件，我们会依法及时通知并采取补救措施。',
        ],
      },
      {
        id: 'cookies',
        title: '6. Cookie 与类似技术',
        paragraphs: [
          'Mentory 使用必要的 Cookie 或本地存储来维持登录状态、记住语言与偏好、保障安全。我们也可能使用经过限制的分析技术了解功能表现和改进体验。',
          '你可以通过浏览器管理 Cookie。停用必要 Cookie 可能导致登录、课堂或其他核心功能无法正常使用。',
        ],
      },
      {
        id: 'rights',
        title: '7. 你的选择与权利',
        lead: '在适用法律规定的范围内，你可以：',
        bullets: [
          '在设置中访问、更正或补充账户资料与偏好；',
          '请求获取个人信息副本，或了解我们如何处理你的信息；',
          '请求删除、限制处理或撤回此前给予的同意；',
          '关闭非必要通知或个性化设置；',
          '注销账户，或就个人信息处理提出投诉。',
        ],
        note: '为保护账户安全，我们在响应某些请求前可能需要验证你的身份。部分信息可能因法律义务、交易记录或争议处理需要而继续保存。',
      },
      {
        id: 'children',
        title: '8. 未成年人保护',
        paragraphs: [
          'Mentory 重视未成年人信息保护。未达到所在地法律规定的独立同意年龄的用户，应在父母或监护人的同意和指导下使用服务。',
          '如果你认为我们在未获得适当同意的情况下收集了未成年人的信息，请联系我们，我们会核实并采取适当措施。',
        ],
      },
      {
        id: 'international',
        title: '9. 跨境处理',
        paragraphs: [
          'Mentory 的导师、学生和服务提供商可能位于不同国家或地区，因此信息可能在你所在地区以外被处理。我们会依据适用法律采取合同、权限控制和安全评估等保护措施，确保信息获得适当保护。',
        ],
      },
      {
        id: 'updates',
        title: '10. 政策更新',
        paragraphs: [
          '我们可能因服务变化或法律要求更新本政策。重要变更生效前，我们会通过站内通知、邮件或页面提示等适当方式告知你，并在本页标注更新日期。',
        ],
      },
      {
        id: 'contact',
        title: '11. 联系我们',
        paragraphs: [
          '如对本政策、个人信息或隐私权利有任何问题，请发送邮件至 contact@mentory.cc。我们会在核实你的身份和请求范围后，在适用法律要求的期限内回复。',
        ],
      },
    ],
  },
  en: {
    breadcrumb: ['Help Center', 'Policies', 'Privacy Policy'],
    helpPath: '/student/help',
    title: 'Mentory Privacy Policy',
    eyebrow: 'Every learning connection should begin with trust',
    intro: 'This Privacy Policy explains how Mentory collects, uses, shares, and protects your personal information when you use our platform, book lessons, join online classrooms, or contact us—and how you can manage that information.',
    updated: 'Last updated: August 11, 2026',
    effective: 'Effective: August 11, 2026',
    tocTitle: 'In this article',
    relatedTitle: 'Still need help?',
    relatedText: 'If you have questions about your account data, privacy rights, or how we handle personal information, we are here to help.',
    relatedAction: 'Visit Help Center',
    contactAction: 'Contact us',
    top: 'Back to top',
    sections: [
      { id: 'scope', title: '1. Scope', paragraphs: ['This Policy applies to the website, online classroom, messaging, payments, and related services Mentory provides to students, mentors, and visitors. A service-specific privacy notice, where provided, applies together with this Policy.', 'By using Mentory, you acknowledge that you have read and understood this Policy. We will not reduce the quality of core services because you decline optional data processing.'] },
      { id: 'collection', title: '2. Information we collect', lead: 'We collect only information reasonably needed to provide and improve learning services, including:', items: [['Information you provide', 'Such as your name, email, profile photo, school and degree, bio, lesson requests, availability, course materials, and content you send to other users or support.'], ['Lessons and transactions', 'Such as bookings, classroom participation, actual lesson hours, reviews, wallet balance, and payment or refund status. Full payment credentials are generally handled by payment providers.'], ['Device and usage data', 'Such as browser and device details, IP address, access times, interactions, error logs, and essential cookies used for login, security, and reliability.'], ['Classroom audio and video', 'After clear notice, we may process classroom audio, video, shared content, and comments to provide classes, replays, quality assurance, and dispute handling.']] },
      { id: 'use', title: '3. How we use information', lead: 'We process information to provide services, perform our agreement, protect safety, comply with law, or with your consent, including to:', bullets: ['Create and maintain accounts, verify identity, and provide student or mentor features;', 'Match lesson requests with mentors, schedule classes, send reminders, and sync learning progress;', 'Process top-ups, lesson settlement, mentor earnings, refunds, and related records;', 'Provide messaging, classroom recording and replay, support, and dispute handling;', 'Detect fraud, misuse, and security risks, troubleshoot issues, and improve the product;', 'Send product news, campaigns, or personalized recommendations where you allow it.'] },
      { id: 'sharing', title: '4. How information is shared', paragraphs: ['We do not sell your personal information. We share relevant information only where needed to provide services or as permitted by law:'], items: [['People you interact with', 'Students and mentors see information needed for matching, booking, classes, and reviews. Visibility is limited for each context.'], ['Service providers', 'Such as cloud hosting, video, email, payment, risk, and support providers. They may process information only under our instructions.'], ['Legal disclosures', 'Where required by law or authorities, or where reasonably necessary to protect users, Mentory, or the public.'], ['Business changes', 'If a merger, acquisition, or asset transfer occurs, we take reasonable steps to keep information protected by this Policy or equivalent safeguards.']] },
      { id: 'retention', title: '5. Retention and security', paragraphs: ['We keep personal information only as long as needed for the purposes in this Policy, to perform contracts, resolve disputes, and meet legal requirements. Retention differs by data type and context; information is deleted or anonymized when no longer needed.', 'We use reasonable safeguards such as access controls, encryption in transit, permission separation, audit logs, and backups. No internet service can guarantee absolute security. If an incident may affect your rights, we will provide legally required notice and take remedial action.'] },
      { id: 'cookies', title: '6. Cookies and similar technologies', paragraphs: ['Mentory uses essential cookies or local storage to maintain sessions, remember language and preferences, and protect security. We may also use limited analytics to understand feature performance and improve the experience.', 'You can manage cookies in your browser. Disabling essential cookies may prevent login, classroom, or other core features from working properly.'] },
      { id: 'rights', title: '7. Your choices and rights', lead: 'Subject to applicable law, you may:', bullets: ['Access, correct, or complete profile information and preferences in Settings;', 'Request a copy of your personal information or details about how we process it;', 'Request deletion or restriction, or withdraw consent previously given;', 'Turn off optional notifications or personalization;', 'Close your account or submit a complaint about our handling of personal information.'], note: 'To protect your account, we may verify your identity before responding to certain requests. Some information may be retained for legal obligations, transaction records, or dispute resolution.' },
      { id: 'children', title: '8. Children’s privacy', paragraphs: ['Mentory takes children’s privacy seriously. Users below the age of independent consent in their location should use the service only with a parent or guardian’s consent and guidance.', 'If you believe we collected a child’s information without appropriate consent, contact us so we can investigate and take appropriate action.'] },
      { id: 'international', title: '9. International processing', paragraphs: ['Mentory students, mentors, and providers may be in different countries, so information may be processed outside your region. We use contractual, access-control, and security assessment measures required by applicable law to provide appropriate protection.'] },
      { id: 'updates', title: '10. Changes to this Policy', paragraphs: ['We may update this Policy as our services or legal requirements change. Before material changes take effect, we will provide appropriate notice through the product, email, or this page and update the date shown above.'] },
      { id: 'contact', title: '11. Contact us', paragraphs: ['For questions about this Policy, personal information, or privacy rights, email contact@mentory.cc. After confirming your identity and request scope, we will respond within the period required by applicable law.'] },
    ],
  },
};

function PolicySection({ section }) {
  return (
    <section id={section.id} className="privacy-policy__section">
      <h2>{section.title}</h2>
      {section.lead ? <p>{section.lead}</p> : null}
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.items ? (
        <div className="privacy-policy__details">
          {section.items.map(([title, description]) => (
            <div key={title} className="privacy-policy__detail">
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      ) : null}
      {section.bullets ? (
        <ul>
          {section.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {section.note ? <aside className="privacy-policy__note">{section.note}</aside> : null}
    </section>
  );
}

function PrivacyPolicyPage() {
  const { isEnglish, t } = useI18n();
  const content = POLICY_CONTENT[isEnglish ? 'en' : 'zh-CN'];
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: ['student'] });

  useEffect(() => {
    const handleAuthChanged = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(Boolean(event.detail.isLoggedIn));
      } else {
        setIsLoggedIn(Boolean(getAuthToken()));
      }
    };

    window.addEventListener('auth:changed', handleAuthChanged);
    return () => window.removeEventListener('auth:changed', handleAuthChanged);
  }, []);

  return (
    <div className="privacy-policy-page" id="privacy-policy-top">
      <div className="privacy-policy__frame">
        <header className="privacy-policy__inner-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle privacy-policy__menu unread-badge-anchor"
            aria-label={t('common.menuMore', '更多菜单')}
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth((current) => !current)}
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

        <main className="privacy-policy__main">
          <nav className="privacy-policy__breadcrumb" aria-label={isEnglish ? 'Breadcrumb' : '面包屑导航'}>
            <Link to={content.helpPath}>{content.breadcrumb[0]}</Link>
            <span aria-hidden="true">/</span>
            <span>{content.breadcrumb[1]}</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{content.breadcrumb[2]}</span>
          </nav>

          <section className="privacy-policy__hero">
            <p className="privacy-policy__eyebrow">{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p className="privacy-policy__intro">{content.intro}</p>
            <div className="privacy-policy__dates">
              <span>{content.updated}</span>
              <span aria-hidden="true">·</span>
              <span>{content.effective}</span>
            </div>
          </section>

          <div className="privacy-policy__layout">
            <aside className="privacy-policy__toc" aria-label={content.tocTitle}>
              <h2>{content.tocTitle}</h2>
              <nav>
                {content.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a>
                ))}
              </nav>
            </aside>

            <article className="privacy-policy__article">
              {content.sections.map((section) => <PolicySection key={section.id} section={section} />)}
              <a className="privacy-policy__back-top" href="#privacy-policy-top">{content.top} ↑</a>
            </article>
          </div>

          <section className="privacy-policy__support" aria-labelledby="privacy-policy-support-title">
            <div>
              <p className="privacy-policy__support-kicker">Mentory Support</p>
              <h2 id="privacy-policy-support-title">{content.relatedTitle}</h2>
              <p>{content.relatedText}</p>
            </div>
            <div className="privacy-policy__support-actions">
              <Link to={content.helpPath}>{content.relatedAction}</Link>
              <a href="mailto:contact@mentory.cc">{content.contactAction}</a>
            </div>
          </section>
        </main>

        <SiteFooter mode="student" />
      </div>

      {showStudentAuth ? (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      ) : null}
    </div>
  );
}

export default PrivacyPolicyPage;
