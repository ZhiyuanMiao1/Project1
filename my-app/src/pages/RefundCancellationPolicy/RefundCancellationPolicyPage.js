import React, { useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import SiteFooter from '../../components/common/SiteFooter/SiteFooter';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { getAuthToken } from '../../utils/authStorage';
import { useI18n } from '../../i18n/language';
import '../PrivacyPolicy/PrivacyPolicyPage.css';

const POLICY_CONTENT = {
  'zh-CN': {
    title: '退款/取消规则',
    tocTitle: '本文内容',
    top: '返回顶部',
    sections: [
      {
        id: 'overview',
        title: '1. 规则概述',
        paragraphs: [
          '更新日期：2026 年 8 月 12 日。本规则适用于通过 Mentory 预约的课程、充值课时，以及相关的改期、取消、未上课确认和退款。',
          '课程取消与充值退款是两类不同操作：取消课程会释放相应日程，不会自动退回充值款；充值退款则会从钱包扣除申请退回的未使用课时，并将核准款项按原支付方式退回。',
        ],
        note: '预约页面或结算流程如展示了适用于某项服务的特别规则，以确认操作前展示的规则为准；任何法定消费者权利不受本规则限制',
      },
      {
        id: 'changes',
        title: '2. 课程改期',
        paragraphs: [
          '学生或导师可在消息页面的预约卡片中提出新的课程时间。改期需要另一方确认；在新时间被接受前，原预约仍然有效。',
          '新时间被接受后，原预约将被替换，课程日程同步更新。若改期提议被拒绝或撤回，双方可继续按原预约上课，或另行协商。',
        ],
      },
      {
        id: 'before-start',
        title: '3. 开课前取消',
        paragraphs: [
          '已接受且尚未到开始时间的课程，学生或导师均可在消息页面取消。取消后，该课程从日程中移除，相关课程需求可重新开放。',
          '开课前取消不扣除学生课时，也不会计入导师已完成课时。取消预约本身不等于申请充值退款；如需退回未使用充值款，请另行在钱包中提交退款申请。',
        ],
      },
      {
        id: 'not-held',
        title: '4. 到时未上课与缺席',
        paragraphs: [
          '课程开始时间到达后，不能再按开课前流程直接取消。若课程实际未发生，一方可在预约卡片中发起“本节未上课”确认，由另一方处理。',
          '另一方确认未上课后，课程将被移除，不扣除学生课时；如另一方确认课程实际发生，课程会保留，并继续通过实际课时确认流程结算。发起方也可在对方处理前撤回未上课申请。',
        ],
        note: '如双方对课程是否发生或实际时长存在分歧，Mentory 可根据消息、课堂状态、录制、课时提交和其他相关记录进行核查',
      },
      {
        id: 'lesson-hours',
        title: '5. 课程课时与扣除',
        paragraphs: [
          '课程结束后，导师提交实际授课时长，学生确认后才从钱包扣除相应课时。学生如不同意，可按 0.25 小时为单位填写其认为正确的时长并提交异议。',
          '若学生在一周内既未确认也未提出异议，系统可自动确认导师提交的课时。发生争议时，以平台最终核定的实际课时为准。',
        ],
      },
      {
        id: 'eligibility',
        title: '6. 充值退款资格',
        lead: '登录学生账户后，可在钱包申请退回符合条件的未使用充值课时。通常需要同时满足：',
        bullets: [
          '充值已成功入账，且通过 Mentory 当前支持退款的 PayPal、支付宝或微信支付完成；',
          '所申请课时仍属于对应充值订单的未使用余额，且学生钱包余额足以扣除；',
          '退款课时以 0.25 小时为单位，且不超过页面显示的可退课时；',
          '按原订单优惠重新核算后，仍有不低于支付渠道最低处理金额的可退金额。',
        ],
        note: '钱包会提示退款后的余额是否可能不足以覆盖已预约课程。提交退款不会自动取消未来课程，学生仍应确保开课前余额充足',
      },
      {
        id: 'calculation',
        title: '7. 退款金额计算',
        paragraphs: [
          '退款金额以提交前页面展示的实时计算结果为准。全额退回某笔订单剩余课时时，退款不超过该订单尚未退回的实际支付金额。',
          '课时费用按固定标准计算；如原充值订单享受了满额优惠，部分退款后会根据保留课时重新核算该项优惠。若保留课时不再达到原优惠门槛，原订单的优惠金额会从可退款金额中扣除，因此退款金额可能不等于“退款课时 × 固定课时单价”。',
        ],
        example: {
          label: '示例',
          text: '假设固定课时费为 600 元/小时，购买 10 课时原价 6,000 元，因满足满 10 课时的优惠条件减免 1,000 元，实际支付 5,000 元。申请退回 6 课时后只保留 4 课时，不再满足该优惠条件：可退款金额 = 实付 5,000 元 − 保留课时费用（4 × 600 元）= 2,600 元',
        },
      },
      {
        id: 'processing',
        title: '8. 提交、到账与失败处理',
        paragraphs: [
          '提交退款时，相应课时会先从钱包及原充值订单的可用余额中扣除。核准款项原则上退回原支付账户，不支持改退至其他账户。',
          'Mentory 会开始处理退款；实际到账时间取决于 PayPal、支付宝、微信支付、发卡行或其他金融机构。你可在钱包的退款记录中查看处理中、待处理、成功或失败状态。',
          '若支付渠道确认退款失败，系统会将为该次退款扣除的课时恢复至钱包及对应充值订单。请在重新申请前确认退款记录的最终状态。',
        ],
      },
      {
        id: 'contact',
        title: '9. 异常情况与联系我们',
        paragraphs: [
          '因技术故障、重复交易、安全风险、疑似欺诈、不可抗力或法律要求，Mentory 可暂停退款或课程处理，并在核实后采取退款、恢复课时、调整日程或其他合理措施。',
          '如无法在产品内完成操作，或对取消、课时扣除、退款金额或状态有疑问，请发送邮件至 contact@mentory.cc，并提供账户信息、相关课程或充值订单以及问题说明。为保护账户和交易安全，我们可能先核实你的身份和相关事实。',
        ],
      },
    ],
  },
  en: {
    title: 'Refund / Cancellation Rules',
    tocTitle: 'In this article',
    top: 'Back to top',
    sections: [
      { id: 'overview', title: '1. Overview', paragraphs: ['Last updated: August 12, 2026. These rules apply to lessons booked through Mentory, lesson-hour top-ups, and related rescheduling, cancellation, lesson-not-held confirmation, and refund requests.', 'Lesson cancellation and top-up refunds are separate actions. Cancelling a lesson releases the scheduled time but does not automatically return top-up funds. A top-up refund removes the approved unused hours from the wallet and returns the approved amount to the original payment method.'], note: 'If a booking page or checkout flow shows special rules for a service, the rules shown before confirmation apply. Nothing in these rules limits mandatory consumer rights' },
      { id: 'changes', title: '2. Rescheduling a lesson', paragraphs: ['A student or mentor may propose a new lesson time from the appointment card on the Messages page. The other party must accept the change; the original booking remains valid until the new time is accepted.', 'Once accepted, the new time replaces the original booking and the lesson schedule is updated. If the proposal is rejected or withdrawn, the parties may keep the original booking or agree on another time.'] },
      { id: 'before-start', title: '3. Cancelling before the lesson starts', paragraphs: ['Either the student or mentor may cancel an accepted lesson from the Messages page before its start time. The lesson is removed from the schedule and the related lesson request may reopen.', 'A cancellation before the start time does not deduct student hours or count toward completed mentor hours. Cancelling a booking is not a top-up refund; request a refund separately from the Wallet if you want eligible unused funds returned.'] },
      { id: 'not-held', title: '4. Lessons not held and no-shows', paragraphs: ['After the scheduled start time, the lesson can no longer use the before-start cancellation flow. If it did not take place, either party may start a “Lesson Not Held” confirmation from the appointment card for the other party to review.', 'If the other party confirms that the lesson was not held, the lesson is removed and no student hours are deducted. If they confirm that it did take place, the lesson remains and proceeds through actual-hours confirmation. The requester may withdraw the not-held request before the other party responds.'], note: 'If the parties disagree about whether a lesson took place or its duration, Mentory may review messages, classroom status, recordings, hour submissions, and other relevant records' },
      { id: 'lesson-hours', title: '5. Lesson hours and deductions', paragraphs: ['After a lesson, the mentor submits the actual teaching duration. Hours are deducted from the student wallet after the student confirms it. A student who disagrees may enter the duration they believe is correct in 0.25-hour increments and submit a dispute.', 'If the student neither confirms nor disputes the submission within one week, the system may confirm the mentor’s submitted hours automatically. Where there is a dispute, the hours finally determined by the platform apply.'] },
      { id: 'eligibility', title: '6. Top-up refund eligibility', lead: 'After signing in as a student, you may request a refund of eligible unused top-up hours from the Wallet. Generally, all of the following must apply:', bullets: ['The top-up was successfully credited and paid through a currently refundable Mentory method: PayPal, Alipay, or WeChat Pay;', 'The requested hours remain unused under that top-up order, and the student wallet has enough hours to remove them;', 'The request uses 0.25-hour increments and does not exceed the refundable hours shown;', 'After the original order discount is recalculated, the refundable amount still meets the payment provider’s minimum processing amount.'], note: 'The Wallet warns if the post-refund balance may not cover upcoming lessons. A refund does not cancel future lessons automatically, and the student must still have enough hours before class' },
      { id: 'calculation', title: '7. How the refund amount is calculated', paragraphs: ['The amount shown in the live quote immediately before submission controls. When all remaining hours from an order are refunded, the refund cannot exceed the actual amount from that order that has not already been refunded.', 'Lesson hours are charged at a fixed rate. If the original top-up order received a volume discount, that discount is recalculated after a partial refund based on the hours retained. If the retained hours no longer meet the original discount threshold, the order-level discount is deducted from the refundable amount. The result may therefore differ from “refunded hours × fixed hourly rate.”'], example: { label: 'Example', text: 'Suppose the fixed rate is CNY 600 per hour. Ten hours normally cost CNY 6,000, but a CNY 1,000 discount for buying 10 hours reduces the amount paid to CNY 5,000. If you request a refund for 6 hours, the 4 retained hours no longer qualify for that discount: refund = CNY 5,000 paid − (4 × CNY 600 retained) = CNY 2,600' } },
      { id: 'processing', title: '8. Submission, arrival, and failed refunds', paragraphs: ['When a refund is submitted, the requested hours are first removed from the wallet and the available balance of the original top-up order. Approved funds are generally returned to the original payment account and cannot be redirected to another account.', 'Mentory then begins processing the refund. Arrival time depends on PayPal, Alipay, WeChat Pay, the card issuer, or another financial institution. The Wallet refund history shows whether a request is processing, pending, completed, or failed.', 'If the payment provider confirms that a refund failed, the hours reserved for that request are restored to the wallet and the corresponding top-up order. Check the final status before requesting the refund again.'] },
      { id: 'contact', title: '9. Exceptions and contact', paragraphs: ['Mentory may pause a refund or lesson action because of a technical failure, duplicate transaction, safety risk, suspected fraud, force majeure, or legal requirement. After review, we may refund funds, restore hours, adjust a schedule, or take another reasonable remedial step.', 'If you cannot complete an action in the product, or have questions about a cancellation, hours deduction, refund amount, or status, email contact@mentory.cc with your account details, the relevant lesson or top-up order, and a description of the issue. To protect accounts and transactions, we may verify your identity and relevant facts first.'] },
    ],
  },
};

function PolicySection({ section }) {
  return (
    <section id={section.id} className="privacy-policy__section">
      <h2>{section.title}</h2>
      {section.lead ? <p>{section.lead}</p> : null}
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {section.example ? (
        <aside className="privacy-policy__note privacy-policy__example">
          <strong>{section.example.label}</strong>
          <span>{section.example.text}</span>
        </aside>
      ) : null}
      {section.note ? <aside className="privacy-policy__note">{section.note}</aside> : null}
    </section>
  );
}

function RefundCancellationPolicyPage() {
  const { isEnglish, t } = useI18n();
  const content = POLICY_CONTENT[isEnglish ? 'en' : 'zh-CN'];
  const menuAnchorRef = useRef(null);
  const tocNavRef = useRef(null);
  const tocLinkRefs = useRef(new Map());
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [activeSectionId, setActiveSectionId] = useState('overview');
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: ['student'] });

  useEffect(() => {
    const handleAuthChanged = (event) => setIsLoggedIn(
      typeof event?.detail?.isLoggedIn !== 'undefined'
        ? Boolean(event.detail.isLoggedIn)
        : Boolean(getAuthToken())
    );
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
      const atPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let nextSectionId = atPageBottom ? sectionIds[sectionIds.length - 1] : sectionIds[0];
      if (!atPageBottom) {
        sectionIds.forEach((sectionId) => {
          const section = document.getElementById(sectionId);
          if (section && section.getBoundingClientRect().top <= marker) nextSectionId = sectionId;
        });
      }
      setActiveSectionId((current) => (current === nextSectionId ? current : nextSectionId));
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
    const targetLeft = activeLink.offsetLeft - ((nav.clientWidth - activeLink.offsetWidth) / 2);
    nav.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [activeSectionId]);

  return (
    <div className="privacy-policy-page refund-cancellation-policy-page" id="refund-cancellation-policy-top">
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
            {isLoggedIn ? <UnreadBadge count={totalBadgeCount} variant="nav" className="unread-badge-top-right" ariaLabel={t('common.pendingReminders', '待处理提醒')} /> : null}
          </button>
        </header>

        <main className="privacy-policy__main">
          <section className="privacy-policy__hero"><h1>{content.title}</h1></section>
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
              {content.sections.map((section) => <PolicySection key={section.id} section={section} />)}
              <a className="privacy-policy__back-top" href="#refund-cancellation-policy-top">{content.top} ↑</a>
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

export default RefundCancellationPolicyPage;
