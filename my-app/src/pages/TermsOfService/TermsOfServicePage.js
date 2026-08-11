import React, { useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import SiteFooter from '../../components/common/SiteFooter/SiteFooter';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { getAuthToken } from '../../utils/authStorage';
import { useI18n } from '../../i18n/language';
import '../PrivacyPolicy/PrivacyPolicyPage.css';

const TERMS_CONTENT = {
  'zh-CN': {
    title: '服务条款',
    tocTitle: '本文内容',
    top: '返回顶部',
    sections: [
      {
        id: 'agreement',
        title: '1. 接受本条款',
        paragraphs: [
          '更新日期：2026 年 8 月 11 日。欢迎使用 Mentory。本服务条款是你与 Mentory 之间具有约束力的协议，适用于 Mentory 网站、在线课堂、消息、支付及其他相关服务。',
          '注册、访问或使用 Mentory，即表示你已阅读、理解并同意本条款及本条款引用的政策。如果你代表机构使用服务，你确认有权代表该机构接受本条款。若你不同意，请停止使用服务。',
        ],
        note: '隐私政策说明我们如何处理个人信息；退款或取消规则将在适用的课程页面、结算流程或单独规则中展示，并与本条款一并适用。',
      },
      {
        id: 'accounts',
        title: '2. 资格与账户',
        lead: '为安全、可靠地使用 Mentory，你同意：',
        bullets: [
          '提供真实、准确且最新的注册与个人资料，并在信息变化时及时更新；',
          '妥善保管登录凭证，不共享账户，并对账户下发生的活动负责；',
          '未达到所在地法定独立缔约年龄时，在父母或监护人同意和指导下使用服务；',
          '发现账户被盗用、未经授权访问或其他安全问题时及时联系我们。',
        ],
      },
      {
        id: 'platform',
        title: '3. Mentory 的服务与角色',
        paragraphs: [
          'Mentory 提供帮助学生发现导师、发布学习需求、预约课程、沟通、参加在线课堂、管理课时及完成相关交易的技术平台。具体功能可能因地区、账户类型或服务阶段而不同。',
          '导师以独立服务提供者身份提供教学服务，不是 Mentory 的雇员、代理或合伙人。除非另有明确说明，学生与导师就课程内容、时间及其他约定直接形成服务关系；Mentory 负责平台能力、规则执行和必要的交易支持。',
        ],
      },
      {
        id: 'student-terms',
        title: '4. 学生条款',
        lead: '学生在发布需求、预约或参加课程时，应当：',
        bullets: [
          '在确认前阅读导师资料、课程说明、时间、费用及适用的取消规则；',
          '提供实现学习目标所需的准确信息，并按约定时间参加课程；',
          '尊重导师的合理教学安排、知识产权、隐私和课堂规则；',
          '仅为本人或预约中明确列明的参与者使用课程，不擅自转售或共享访问权限；',
          '及时确认实际课时；如记录不一致，通过平台提供的流程提出异议。',
        ],
      },
      {
        id: 'mentor-terms',
        title: '5. 导师条款',
        lead: '导师发布资料、回应需求或提供课程时，应当：',
        bullets: [
          '确保身份、教育经历、专业能力、课程介绍和可用时间真实准确；',
          '以专业、守时和适合学生目标的方式提供已确认课程；',
          '在提供课程所需的范围内合法使用课件、软件及第三方内容；',
          '遵守适用的税务、许可、消费者保护及其他专业义务；',
          '不得将通过 Mentory 获得的学生信息用于课程之外的营销、骚扰或其他未经授权的目的。',
        ],
      },
      {
        id: 'booking-payment',
        title: '6. 预约、费用与支付',
        paragraphs: [
          '预约确认时，学生同意支付结算页面列明的课程费用及适用费用。价格、币种、课时和费用明细以确认前展示的信息为准。Mentory 可通过第三方支付服务商处理充值、付款、退款和导师结算。',
          '钱包余额、优惠或平台额度应按其展示的用途和有效期使用，除法律要求或相关规则明确允许外，不可转让或兑换现金。导师收入将在课时确认、风控核验及适用结算周期完成后结算。',
        ],
        note: '不要通过平台未支持的方式交换支付凭证。支付服务商可能另有条款；其支付页面将显示适用信息。',
      },
      {
        id: 'changes-cancellations',
        title: '7. 改期、取消与退款',
        paragraphs: [
          '课程改期、取消、缺席和退款以预约时展示的规则、双方确认的变更及适用法律为准。申请处理时，我们可能核对消息、课堂状态、实际课时和其他相关记录。',
          '因安全风险、技术故障、不可抗力或涉嫌违反本条款，Mentory 可暂停、调整或取消课程并采取合理补救措施。任何法定退款权利不受本条款限制。',
        ],
      },
      {
        id: 'classroom',
        title: '8. 在线课堂与沟通',
        paragraphs: [
          '你应使用支持的设备和网络参加课堂，并自行确认音视频环境适合上课。课堂消息、共享内容、评论及在明确提示后生成的录制或回放，可用于提供课程、复盘学习、质量保障和争议处理。',
          '未经所有相关人员同意及适用法律允许，不得在平台之外录制、传播课堂或披露他人的个人信息。请勿在消息或课堂中发送不必要的敏感信息。',
        ],
      },
      {
        id: 'conduct',
        title: '9. 平台行为规范',
        lead: '使用 Mentory 时，你不得：',
        bullets: [
          '骚扰、歧视、威胁、冒充、欺诈或伤害其他用户；',
          '发布违法、侵权、误导、恶意或明显不适合教学场景的内容；',
          '绕过安全、支付、课时确认、访问控制或平台费用机制；',
          '使用机器人、抓取工具、恶意代码或其他方式干扰、过度占用或逆向工程服务；',
          '未经授权收集、使用、出售或公开其他用户的信息；',
          '协助他人违反本条款或适用法律。',
        ],
      },
      {
        id: 'content',
        title: '10. 内容与知识产权',
        paragraphs: [
          '你保留对自己上传内容依法享有的权利，并确认拥有提供该内容所需的权利。为运营、展示、传输、存储和改进服务，你授予 Mentory 在提供服务所需范围内使用该内容的非独占许可；该许可会在内容删除或账户关闭后于合理备份周期内终止，法律另有要求的除外。',
          'Mentory 的品牌、界面、软件和平台内容受知识产权法律保护。除服务明确允许外，你不得复制、出售、再许可或制作衍生产品。若你认为平台内容侵犯你的权利，请通过本页联系方式提交具体说明。',
        ],
      },
      {
        id: 'reviews',
        title: '11. 评价与反馈',
        paragraphs: [
          '评价应基于真实课程体验，保持相关、客观且不包含报复、操纵或未经授权的个人信息。我们可依据平台规则拒绝发布或移除明显虚假、违法、无关或滥用性的评价。',
          '你向 Mentory 提供的产品建议可由我们用于改进服务，但我们不会因此取得你在建议所包含原始作品中的权利。',
        ],
      },
      {
        id: 'enforcement',
        title: '12. 暂停与终止',
        paragraphs: [
          '你可以停止使用服务，并可通过账户设置或联系我们申请注销账户。若你严重或反复违反本条款、造成安全或法律风险、长期未使用账户，或我们停止相关服务，Mentory 可在合理范围内限制、暂停或终止账户及功能。',
          '在适当情况下，我们会说明原因并提供申诉或补救机会。终止不影响终止前已经产生的付款、退款、争议、知识产权或依法应继续有效的义务。',
        ],
      },
      {
        id: 'disclaimers',
        title: '13. 服务保障与责任',
        paragraphs: [
          '我们会以合理的技能和谨慎提供平台，但无法保证服务始终不中断、无错误或满足每一项个人学习目标。导师资料、课程效果及用户内容可能包含由用户提供的信息，你应结合自身需要作出判断。',
          '在适用法律允许的范围内，各方仅对可合理预见且由其违约直接造成的损失承担责任。本条款不排除或限制因欺诈、故意不当行为、人身伤害，或法律规定不得排除或限制的其他责任。',
        ],
      },
      {
        id: 'changes',
        title: '14. 条款变更',
        paragraphs: [
          '我们可能因服务、法律或安全要求变化而更新本条款。重要变更生效前，我们会通过站内通知、邮件或本页提示等适当方式告知你，并更新页面日期。继续使用服务即表示你接受生效后的条款；法律要求另行取得同意的，我们会按要求处理。',
        ],
      },
      {
        id: 'disputes-contact',
        title: '15. 争议解决与联系我们',
        paragraphs: [
          '如发生问题，请先通过平台客服与我们联系，我们会尝试以公平、及时的方式解决。双方仍可使用适用法律提供的消费者投诉、调解、仲裁或司法救济。本条款不剥夺你依法享有的强制性消费者权利。',
          '如对本条款或服务有任何问题，请发送邮件至 contact@mentory.cc。为保护账户和交易安全，我们可能在处理请求前核实你的身份及相关事实。',
        ],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    tocTitle: 'In this article',
    top: 'Back to top',
    sections: [
      { id: 'agreement', title: '1. Accepting these Terms', paragraphs: ['Last updated: August 11, 2026. Welcome to Mentory. These Terms of Service are a binding agreement between you and Mentory and apply to the Mentory website, online classroom, messaging, payments, and related services.', 'By registering for, accessing, or using Mentory, you confirm that you have read, understood, and agreed to these Terms and the policies they reference. If you use the services for an organization, you confirm that you may accept these Terms for it. If you do not agree, stop using the services.'], note: 'Our Privacy Policy explains how we handle personal information. Refund or cancellation rules shown on a lesson page, at checkout, or in a separate policy also apply.' },
      { id: 'accounts', title: '2. Eligibility and accounts', lead: 'To use Mentory safely and reliably, you agree to:', bullets: ['Provide true, accurate, and current registration and profile information, and keep it updated;', 'Protect your login credentials, not share your account, and take responsibility for activity under it;', 'Use the services with a parent or guardian’s consent and guidance if you are below the legal age to contract independently where you live;', 'Contact us promptly if you discover account misuse, unauthorized access, or another security issue.'] },
      { id: 'platform', title: '3. Mentory’s services and role', paragraphs: ['Mentory provides technology that helps students discover mentors, post learning requests, book lessons, communicate, join online classrooms, manage lesson hours, and complete related transactions. Features may differ by region, account type, or service stage.', 'Mentors provide teaching as independent service providers, not as Mentory employees, agents, or partners. Unless clearly stated otherwise, students and mentors contract directly for lesson content, timing, and other arrangements. Mentory provides the platform, enforces platform rules, and offers transaction support where needed.'] },
      { id: 'student-terms', title: '4. Student terms', lead: 'When posting a request, booking, or attending a lesson, students must:', bullets: ['Review the mentor profile, lesson description, schedule, price, and applicable cancellation rules before confirming;', 'Provide accurate information needed to meet the learning goal and attend at the agreed time;', 'Respect the mentor’s reasonable teaching arrangements, intellectual property, privacy, and classroom rules;', 'Use a lesson only for themselves or participants identified in the booking, and not resell or share access;', 'Confirm actual lesson hours promptly and use the platform process to dispute a mismatch.'] },
      { id: 'mentor-terms', title: '5. Mentor terms', lead: 'When publishing a profile, responding to requests, or teaching, mentors must:', bullets: ['Keep identity, education, expertise, lesson descriptions, and availability true and accurate;', 'Deliver confirmed lessons professionally, punctually, and in a way suited to the student’s stated goal;', 'Use teaching materials, software, and third-party content lawfully;', 'Meet applicable tax, licensing, consumer-protection, and other professional obligations;', 'Not use student information obtained through Mentory for unrelated marketing, harassment, or another unauthorized purpose.'] },
      { id: 'booking-payment', title: '6. Bookings, fees, and payments', paragraphs: ['When a booking is confirmed, the student agrees to pay the lesson price and applicable fees shown at checkout. The price, currency, lesson hours, and fee breakdown displayed before confirmation control. Mentory may use third-party payment providers for top-ups, payments, refunds, and mentor payouts.', 'Wallet balances, promotions, or platform credits must be used for their stated purpose and validity period and, unless required by law or expressly allowed, cannot be transferred or redeemed for cash. Mentor earnings are settled after hour confirmation, risk checks, and the applicable payout cycle.'], note: 'Do not exchange payment credentials through unsupported channels. A payment provider may have separate terms displayed on its payment page.' },
      { id: 'changes-cancellations', title: '7. Changes, cancellations, and refunds', paragraphs: ['Lesson changes, cancellations, no-shows, and refunds are governed by the rules shown at booking, changes confirmed by both parties, and applicable law. When reviewing a request, we may check messages, classroom status, actual lesson hours, and other relevant records.', 'Mentory may pause, adjust, or cancel a lesson and take reasonable remedial steps because of safety risks, technical failures, force majeure, or suspected violations of these Terms. Nothing in these Terms limits a refund right required by law.'] },
      { id: 'classroom', title: '8. Online classrooms and communication', paragraphs: ['You should use supported equipment and networks and confirm that your audio and video environment is suitable. Classroom messages, shared content, comments, and recordings or replays made after clear notice may be processed to deliver lessons, support review, assure quality, and resolve disputes.', 'Do not record or distribute a lesson outside the platform, or disclose another person’s information, without all required consent and legal permission. Avoid sending unnecessary sensitive information in messages or classrooms.'] },
      { id: 'conduct', title: '9. Platform conduct', lead: 'When using Mentory, you must not:', bullets: ['Harass, discriminate against, threaten, impersonate, defraud, or harm another person;', 'Post content that is unlawful, infringing, misleading, malicious, or clearly unsuitable for a teaching context;', 'Bypass security, payment, lesson-hour confirmation, access-control, or platform-fee mechanisms;', 'Use bots, scraping tools, malicious code, or other means to disrupt, overload, or reverse engineer the services;', 'Collect, use, sell, or disclose another user’s information without authorization;', 'Help another person violate these Terms or applicable law.'] },
      { id: 'content', title: '10. Content and intellectual property', paragraphs: ['You keep the rights you lawfully hold in content you upload and confirm that you have the rights needed to provide it. You grant Mentory a non-exclusive license to use that content only as needed to operate, display, transmit, store, and improve the services. This license ends after deletion or account closure following a reasonable backup period, unless law requires otherwise.', 'Mentory’s brands, interface, software, and platform content are protected by intellectual-property laws. Unless the service clearly permits it, you may not copy, sell, sublicense, or create derivative works from them. If you believe platform content infringes your rights, send details through the contact method below.'] },
      { id: 'reviews', title: '11. Reviews and feedback', paragraphs: ['Reviews must reflect a genuine lesson experience, remain relevant and objective, and not contain retaliation, manipulation, or unauthorized personal information. We may decline or remove reviews that are clearly false, unlawful, irrelevant, or abusive under platform rules.', 'Mentory may use product suggestions you provide to improve the services, but this does not transfer rights in any original work contained in your feedback.'] },
      { id: 'enforcement', title: '12. Suspension and termination', paragraphs: ['You may stop using the services and can request account closure through Settings or by contacting us. Mentory may reasonably restrict, suspend, or terminate an account or feature for serious or repeated violations, safety or legal risk, prolonged inactivity, or discontinuation of a service.', 'Where appropriate, we will explain the reason and offer an appeal or remedy. Termination does not affect payment, refund, dispute, intellectual-property, or other obligations that arose earlier or must legally continue.'] },
      { id: 'disclaimers', title: '13. Service assurances and liability', paragraphs: ['We provide the platform with reasonable skill and care but cannot promise that it will always be uninterrupted or error-free, or that it will meet every personal learning goal. Mentor profiles, lesson outcomes, and user content may include user-provided information that you should assess for your needs.', 'To the extent permitted by law, each party is responsible only for reasonably foreseeable loss directly caused by its breach. These Terms do not exclude or limit liability for fraud, willful misconduct, personal injury, or any other liability that cannot legally be excluded or limited.'] },
      { id: 'changes', title: '14. Changes to these Terms', paragraphs: ['We may update these Terms as the services, law, or security requirements change. Before material changes take effect, we will provide appropriate notice in the product, by email, or on this page and update the date. Continued use means you accept the effective Terms; where law requires separate consent, we will request it.'] },
      { id: 'disputes-contact', title: '15. Disputes and contact', paragraphs: ['If a problem occurs, please contact platform support first so we can try to resolve it fairly and promptly. Either party may still use consumer complaints, mediation, arbitration, or court remedies available under applicable law. These Terms do not remove mandatory consumer rights.', 'For questions about these Terms or the services, email contact@mentory.cc. To protect accounts and transactions, we may verify your identity and relevant facts before handling a request.'] },
    ],
  },
};

function TermsSection({ section }) {
  return (
    <section id={section.id} className="privacy-policy__section">
      <h2>{section.title}</h2>
      {section.lead ? <p>{section.lead}</p> : null}
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets ? (
        <ul>
          {section.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {section.note ? <aside className="privacy-policy__note">{section.note}</aside> : null}
    </section>
  );
}

function TermsOfServicePage() {
  const { isEnglish, t } = useI18n();
  const content = TERMS_CONTENT[isEnglish ? 'en' : 'zh-CN'];
  const menuAnchorRef = useRef(null);
  const tocNavRef = useRef(null);
  const tocLinkRefs = useRef(new Map());
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [activeSectionId, setActiveSectionId] = useState('agreement');
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

  useEffect(() => {
    const sectionIds = content.sections.map((section) => section.id);
    let animationFrame = 0;
    let scheduled = false;

    const updateActiveSection = () => {
      scheduled = false;
      const marker = Math.min(window.innerHeight * 0.28, 240);
      const atPageBottom = window.innerHeight + window.scrollY
        >= document.documentElement.scrollHeight - 4;
      let nextSectionId = sectionIds[0];

      if (atPageBottom) {
        nextSectionId = sectionIds[sectionIds.length - 1];
      } else {
        sectionIds.forEach((sectionId) => {
          const section = document.getElementById(sectionId);
          if (section && section.getBoundingClientRect().top <= marker) {
            nextSectionId = sectionId;
          }
        });
      }

      setActiveSectionId((current) => (
        current === nextSectionId ? current : nextSectionId
      ));
    };

    const scheduleUpdate = () => {
      if (scheduled) return;
      scheduled = true;
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [content.sections]);

  useEffect(() => {
    const nav = tocNavRef.current;
    const activeLink = tocLinkRefs.current.get(activeSectionId);
    if (!nav || !activeLink || nav.scrollWidth <= nav.clientWidth) return;

    const targetLeft = activeLink.offsetLeft
      - ((nav.clientWidth - activeLink.offsetWidth) / 2);
    nav.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [activeSectionId]);

  return (
    <div className="privacy-policy-page terms-of-service-page" id="terms-of-service-top">
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
          <section className="privacy-policy__hero">
            <h1>{content.title}</h1>
          </section>

          <div className="privacy-policy__layout">
            <aside className="privacy-policy__toc" aria-label={content.tocTitle}>
              <h2>{content.tocTitle}</h2>
              <nav ref={tocNavRef}>
                {content.sections.map((section) => (
                  <a
                    key={section.id}
                    ref={(node) => {
                      if (node) tocLinkRefs.current.set(section.id, node);
                      else tocLinkRefs.current.delete(section.id);
                    }}
                    href={`#${section.id}`}
                    className={activeSectionId === section.id ? 'is-active' : undefined}
                    aria-current={activeSectionId === section.id ? 'location' : undefined}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    {section.title.replace(/^\d+\.\s*/, '')}
                  </a>
                ))}
              </nav>
            </aside>

            <article className="privacy-policy__article">
              {content.sections.map((section) => <TermsSection key={section.id} section={section} />)}
              <a className="privacy-policy__back-top" href="#terms-of-service-top">{content.top} ↑</a>
            </article>
          </div>
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

export default TermsOfServicePage;
