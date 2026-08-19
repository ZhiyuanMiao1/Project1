import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import RegisterPopup from '../../components/RegisterPopup/RegisterPopup';
import LoginPopup from '../../components/LoginPopup/LoginPopup';
import MentorActivationPopup from '../../components/MentorActivationPopup/MentorActivationPopup';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import SiteFooter from '../../components/common/SiteFooter/SiteFooter';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';
import { useI18n } from '../../i18n/language';
import '../PrivacyPolicy/PrivacyPolicyPage.css';

export const ABOUT_CONTENT = {
  introduction: {
    'zh-CN': {
      title: '关于 Mentory',
      tocTitle: '本页内容',
      top: '返回顶部',
      sections: [
        {
          id: 'hello',
          title: '1. 什么是Mentory',
          paragraphs: [
            'Mentory 是一个连接学习者与导师的在线学习平台。我们希望让每个人都能更方便地找到适合自己的导师，也让有专业知识和教学热情的人更轻松地分享经验、开展课程。',
            '无论你正在攻克一门课程、准备一次重要考试、探索新的专业方向，还是希望把自己的知识转化为有价值的教学，Mentory 都希望成为这段旅程中可靠的连接者。',
          ],
        },
        {
          id: 'how-it-works',
          title: '2. Mentory 如何工作',
          lead: '我们围绕真实的学习目标，提供从寻找导师到完成课程的一站式体验：',
          items: [
            ['发现合适的导师', '按时区、专业方向和个人需求浏览导师资料，了解其教育背景、擅长领域与可授课内容。'],
            ['发布课程需求', '描述学习目标、内容和时间安排，让合适的导师主动了解需求并发出邀约。'],
            ['在线沟通与学习', '通过平台消息确认计划，在在线课堂中完成授课、互动与学习资料共享。'],
            ['持续管理学习', '集中查看课程、课时、评价与相关记录，让每一步进展清晰可追踪。'],
          ],
        },
        {
          id: 'values',
          title: '3. 我们重视什么',
          items: [
            ['合适，而不只是更多', '学习体验来自人与目标的匹配。我们关注导师专长、沟通方式和时间安排是否真正适合学习者。'],
            ['清晰与信任', '通过透明的导师资料、课程需求、沟通记录和课时确认，帮助双方建立明确预期。'],
            ['尊重每一种成长路径', '我们相信学习没有唯一模板。不同背景、阶段和目标，都值得获得认真对待。'],
            ['长期价值', 'Mentory 不只帮助完成一节课，也希望促成可以持续积累、彼此启发的学习关系。'],
          ],
        },
        {
          id: 'community',
          title: '4. 学生为什么选择Mentory',
          lead: 'Mentory 从费用、时间、导师选择、退款、隐私和课后复习等方面，为学生提供更清晰、更灵活，也更可控的学习体验：',
          items: [
            ['价格合理透明', '课时收费标准固定明确，充值金额、适用优惠和课时余额清晰可见，让你在开始学习前了解实际费用。'],
            ['时间安排灵活', '根据自己的时区、日程和学习节奏与导师协商上课时间，需要调整时也可以通过平台提出改期。'],
            ['导师选择自由', '主动浏览导师资料并寻找合适的人，或发布具体的课程需求，让具备相关专长的导师主动与你联系。'],
            ['退款流程清晰', '符合条件的未使用课时可在钱包申请退款，提交前查看预计金额，提交后继续查看退款记录与处理状态。'],
            ['Student ID 保护隐私', '使用 Student ID 完成平台识别和相关流程，减少不必要展示真实姓名或其他个人信息，降低隐私暴露。'],
            ['课程内容可以回顾', '课程生成可用回放后，可以返回查看授课内容、复习知识重点，让一次课程产生更持久的学习价值。'],
          ],
        },
        {
          id: 'mentor-choice',
          title: '5. 导师为什么选择Mentory',
          lead: 'Mentory 为导师提供更自主、更灵活的在线教学方式，帮助导师展示专业能力、积累教学口碑，并获得更多发展机会：',
          items: [
            ['自主选择授课机会', '根据自己的专业方向、教学经验、时间安排和能力边界判断课程是否适合，并自主决定是否向学生发出邀约。'],
            ['灵活安排教学时间', '不受固定授课地点限制，可以结合自己的时区、工作和生活安排，与学生协商合适的课程时间。'],
            ['用个人名片展示自己', '通过编辑个人名片展示教育经历、专业方向、擅长领域、可授课内容和个人介绍，让合适的学生更快了解你，提高匹配的概率。'],
            ['持续积累教学口碑', '通过真实的授课经历和学生评价逐步建立可信度，让更多学生了解你的教学方式，并有机会形成长期的学习关系。'],
            ['免费获得官方流量支持', '每位导师都可以自主选择与 Mentory 官方合作，通过平台官方渠道获得免费的流量支持，增加个人名片和教学内容的曝光，接触更多潜在学生。'],
            ['获得更高且固定的时薪', 'Mentory 为导师提供更有竞争力且标准固定的时薪，无需与不同学生反复议价，让你能够把更多精力集中在课程准备和教学质量上。'],
          ],
        },
        {
          id: 'future',
          title: '6. 一起塑造 Mentory',
          paragraphs: [
            'Mentory 仍在持续成长。我们会根据学习者和导师的反馈改进匹配、沟通、课堂与服务体验，让跨地区、跨学科的知识连接更自然。',
          ],
          note: '如果你有产品建议、使用反馈或合作想法，欢迎发送邮件至 contact@mentory.cc',
        },
      ],
    },
    en: {
      title: 'About Mentory',
      tocTitle: 'On this page',
      top: 'Back to top',
      sections: [
        { id: 'hello', title: '1. What is Mentory', paragraphs: ['Mentory is an online learning platform that connects learners with mentors. We make it easier for people to find guidance that fits, while helping knowledgeable and thoughtful mentors share their expertise through meaningful lessons.', 'Whether you are working through a course, preparing for an important exam, exploring a new field, or turning your own expertise into valuable teaching, Mentory aims to be a trusted connection along the way.'] },
        { id: 'how-it-works', title: '2. How Mentory works', lead: 'We support the journey from finding a mentor to completing a lesson around a learner’s real goals:', items: [['Discover the right mentor', 'Browse mentor profiles by time zone, subject, and personal needs, including education, expertise, and lesson topics.'], ['Post a lesson request', 'Describe your goals, subject, and schedule so relevant mentors can understand the need and reach out.'], ['Communicate and learn online', 'Confirm a plan through messages, then teach, interact, and share learning materials in the online classroom.'], ['Manage learning over time', 'Keep lessons, hours, reviews, and related records together so progress stays clear and traceable.']] },
        { id: 'values', title: '3. What matters to us', items: [['Fit, not just choice', 'A good learning experience starts with the right match between expertise, communication style, schedule, and goals.'], ['Clarity and trust', 'Transparent profiles, requests, messages, and lesson-hour confirmation help both sides set clear expectations.'], ['Respect for every path', 'There is no single template for learning. Every background, stage, and ambition deserves thoughtful support.'], ['Lasting value', 'Mentory is not only about finishing one class. We hope to enable learning relationships that build knowledge and confidence over time.']] },
        { id: 'community', title: '4. Why students choose Mentory', lead: 'From pricing and scheduling to mentor choice, refunds, privacy, and lesson review, Mentory gives students a clearer, more flexible, and more manageable learning experience:', items: [['Fair, transparent pricing', 'Lesson-hour pricing follows clear, fixed rules. Top-up totals, applicable discounts, and hour balances are visible, so you understand the cost before learning begins.'], ['Flexible scheduling', 'Coordinate lesson times with a mentor around your time zone, schedule, and learning pace, and propose a change through the platform when plans need to move.'], ['Freedom to choose a mentor', 'Browse mentor profiles and find the right person directly, or post a specific lesson request so mentors with relevant expertise can reach out to you.'], ['A clear refund process', 'Request a refund for eligible unused hours from the Wallet, review the estimated amount before submitting, and follow the refund record and processing status afterward.'], ['Privacy protected by Student ID', 'Use a Student ID for platform identification and related workflows, reducing unnecessary exposure of your real name or other personal information.'], ['Lessons you can revisit', 'Once a lesson replay is available, return to review the session and revisit key ideas so the value of a lesson continues after class.']] },
        { id: 'mentor-choice', title: '5. Why mentors choose Mentory', lead: 'Mentory gives mentors greater independence and flexibility in online teaching, while helping them present their expertise, build a professional reputation, and access more opportunities:', items: [['Choose teaching opportunities independently', 'Decide whether a lesson is right for you based on your subject expertise, teaching experience, availability, and professional boundaries, then choose whether to send the student an invitation.'], ['Teach on a flexible schedule', 'Teach online without being tied to a fixed location, and coordinate lesson times with students around your time zone, work, and personal schedule.'], ['Present yourself with a personal card', 'Edit your personal card to present your education, subject expertise, teaching areas, and introduction, helping suitable students understand you and improving the likelihood of a good match.'], ['Build your teaching reputation', 'Establish credibility through genuine teaching experience and student reviews, helping more students understand your approach and creating opportunities for lasting learning relationships.'], ['Receive free official traffic support', 'Every mentor can choose to collaborate with Mentory and receive free exposure through official platform channels, helping their personal card and teaching content reach more potential students.'], ['Earn a higher, fixed hourly rate', 'Mentory offers mentors a more competitive hourly rate based on a clear, fixed standard. There is no need to renegotiate the rate with each student, so you can focus on lesson preparation and teaching quality.']] },
        { id: 'future', title: '6. Shape Mentory with us', paragraphs: ['Mentory is continuing to grow. We use feedback from learners and mentors to improve matching, communication, classrooms, and support, making knowledge easier to share across regions and disciplines.'], note: 'For product suggestions, feedback, or partnership ideas, email contact@mentory.cc' },
      ],
    },
  },
  mentorOpportunities: {
    'zh-CN': {
      title: '成为 Mentory 导师',
      tocTitle: '本页内容',
      top: '返回顶部',
      sections: [
        {
          id: 'opportunity',
          title: '1. 分享专业知识，帮助真实成长',
          paragraphs: [
            'Mentory 欢迎有扎实专业背景、清晰表达能力和责任心的导师加入。你可以根据自己的专长与时间安排提供一对一或小型在线课程，帮助学习者解决具体问题、建立知识体系并获得继续前进的方法。',
            '导师工作以独立、灵活的方式开展。你可以展示擅长领域，发现学习者发布的课程需求，并在判断自己能够胜任后发出邀约。',
          ],
        },
        {
          id: 'who',
          title: '2. 我们期待这样的导师',
          bullets: [
            '在某一学科、行业或技能领域拥有可靠的知识与实践经验；',
            '能够倾听学习目标，并把复杂内容讲得清楚、有结构；',
            '认真对待时间、承诺、隐私与每一位学习者；',
            '愿意根据反馈调整教学方法，帮助学习者形成自己的能力；',
            '遵守适用法律、平台规则与学术诚信要求。',
          ],
          note: '教育背景和资历会帮助学习者判断匹配度，但我们同样重视真实经验、教学能力与沟通质量',
        },
        {
          id: 'subjects',
          title: '3. 你可以教授什么',
          items: [
            ['学科辅导', '数学、物理、计算机、工程、经济及其他高校或专业课程。'],
            ['研究与升学', '学习规划、研究方法、论文思路、面试准备与学术路径经验。'],
            ['职业与行业技能', '编程、数据分析、产品、设计、商业等可通过在线方式有效教学的能力。'],
            ['语言与跨文化学习', '语言练习、专业表达，以及跨地区学习和工作的经验分享。'],
          ],
        },
        {
          id: 'journey',
          title: '4. 开展教学的基本流程',
          bullets: [
            '注册导师身份并完善公开资料、教育背景、擅长领域和时区；',
            '浏览适合自己的课程需求，或等待学习者查看资料并联系你；',
            '通过平台沟通学习目标、课程范围、时间和预期；',
            '按约定进入在线课堂授课，并在课后完成必要的课时确认；',
            '通过真实评价与持续完善的资料积累个人教学口碑。',
          ],
        },
        {
          id: 'support',
          title: '5. Mentory 提供的支持',
          paragraphs: ['平台提供导师资料展示、课程需求发现、站内消息、在线课堂、课时记录和相关结算工具，帮助你把更多精力放在教学本身。具体功能、费用与结算安排以导师端当时展示的规则为准。'],
        },
        {
          id: 'apply',
          title: '6. 准备开始了吗',
          paragraphs: ['你可以直接进入 Mentory 导师端注册并完善资料。请真实、具体地介绍你的背景、擅长内容和教学方式，这会帮助学习者更准确地了解你。'],
          action: { type: 'mentor-registration', label: '注册导师', ariaLabel: '注册成为 Mentory 导师' },
          note: '如对导师加入、资质展示或平台合作有疑问，请发送邮件至 contact@mentory.cc，并在主题中注明“导师合作”',
        },
      ],
    },
    en: {
      title: 'Become a Mentory mentor',
      tocTitle: 'On this page',
      top: 'Back to top',
      sections: [
        { id: 'opportunity', title: '1. Share expertise. Enable real growth.', paragraphs: ['Mentory welcomes mentors with strong subject knowledge, clear communication, and a dependable approach. Based on your expertise and availability, you can offer one-to-one or small online lessons that help learners solve specific problems, build understanding, and develop a way forward.', 'Mentoring is flexible and independent. Present your areas of expertise, discover lesson requests, and reach out when you are confident you can help.'] },
        { id: 'who', title: '2. What we look for', bullets: ['Reliable knowledge and practical experience in a subject, profession, or skill;', 'The ability to listen to a learner’s goals and explain complex ideas clearly and logically;', 'Respect for time, commitments, privacy, and every learner;', 'A willingness to adapt through feedback and help learners develop their own capabilities;', 'Commitment to applicable law, platform rules, and academic integrity.'], note: 'Education and credentials can help learners judge fit, but practical experience, teaching ability, and communication quality matter just as much' },
        { id: 'subjects', title: '3. What you can teach', items: [['Academic subjects', 'Mathematics, physics, computer science, engineering, economics, and other university or professional subjects.'], ['Research and further study', 'Study planning, research methods, thesis direction, interview preparation, and academic-path experience.'], ['Career and industry skills', 'Programming, data, product, design, business, and other skills that can be taught effectively online.'], ['Language and cross-cultural learning', 'Language practice, professional communication, and experience studying or working across regions.']] },
        { id: 'journey', title: '4. The mentoring journey', bullets: ['Register as a mentor and complete your public profile, education, expertise, and time zone;', 'Browse relevant lesson requests, or let learners discover your profile and contact you;', 'Use platform messages to align on goals, scope, timing, and expectations;', 'Teach in the online classroom and complete the required lesson-hour confirmation afterward;', 'Build a teaching reputation through authentic reviews and an increasingly useful profile.'] },
        { id: 'support', title: '5. Support from Mentory', paragraphs: ['Mentory provides profile presentation, lesson-request discovery, messaging, an online classroom, lesson-hour records, and related settlement tools so you can focus more on teaching. Current mentor-side rules govern specific features, fees, and settlement arrangements.'] },
        { id: 'apply', title: '6. Ready to begin?', paragraphs: ['Go to the Mentory mentor experience, register, and complete your profile. A specific and accurate description of your background, subjects, and teaching style helps learners understand whether you are a good fit.'], action: { type: 'mentor-registration', label: 'Register as a mentor', ariaLabel: 'Register as a Mentory mentor' }, note: 'For questions about joining, credentials, or mentor partnerships, email contact@mentory.cc with “Mentor partnership” in the subject line' },
      ],
    },
  },
  businessCooperation: {
    'zh-CN': {
      title: '与 Mentory 合作',
      tocTitle: '本页内容',
      top: '返回顶部',
      sections: [
        {
          id: 'trusted-connections',
          title: '1. 一起构建更值得信任的学习连接',
          paragraphs: [
            'Mentory 正在构建一个连接学习者与专业导师的在线学习平台。目前，平台已覆盖导师资料展示、课程需求发布、匹配沟通、在线课堂、交易记录与课程回顾等学习环节。',
            '现阶段，我们希望扩大优质导师与专家供给，连接更多真实、明确的学习需求，也期待与认同长期教育价值的伙伴共同验证新的学习场景和可持续合作方式。',
          ],
        },
        {
          id: 'priorities',
          title: '2. 我们重点寻找的合作',
          items: [
            ['导师与专家', '邀请具备专业背景、实践经验和教学能力的导师、研究者及行业专家加入平台，服务真实、具体的学习目标'],
            ['高校与学习社群', '面向高校、学生组织和专业社群，围绕课程辅导、研究方法、升学与职业探索开展小范围学习项目'],
            ['企业与团队学习', '针对团队明确的学科或技能需求，试行导师匹配、专题课程或线上分享，并共同定义验证目标'],
            ['内容、品牌与活动', '共创具有实际学习价值的专题内容、专家访谈、线上活动或品牌教育项目，让专业知识触达合适的人群'],
            ['业务与区域伙伴', '共同拓展特定地区、学科或用户群体，在合作前明确双方投入的资源、责任边界和预期成果'],
            ['核心创业伙伴', '寻找能够在产品、技术、教育运营、增长或国际化方面长期投入的同行者'],
          ],
        },
        {
          id: 'investment',
          title: '3. 投资与战略合作',
          paragraphs: [
            'Mentory 对投资与战略合作保持开放。我们欢迎认同教育长期价值，并能在教育资源、平台技术、市场拓展或国际化方面形成协同的投资人与战略机构，与我们交流。',
            '我们希望资本合作不仅支持平台成长，也能够帮助优质导师、真实学习需求与可靠的在线教学服务形成更健康的连接。具体合作将在充分沟通、必要的尽调与正式约定基础上推进。',
          ],
        },
        {
          id: 'connect',
          title: '4. 选择你的合作方式',
          paragraphs: ['选择与你最匹配的入口。业务、核心创业伙伴及投资线索暂时统一由 contact@mentory.cc 接收，并通过邮件主题分类处理。'],
          actions: [
            { type: 'mentor-registration', title: '分享你的专业知识', description: '注册导师身份，完善你的专业背景、擅长领域与教学方式', label: '成为 Mentory 导师', ariaLabel: '注册成为 Mentory 导师' },
            { type: 'email', title: '共建新的学习场景', description: '适用于高校、社群、团队、内容品牌、业务伙伴及核心创业伙伴', label: '洽谈业务或长期共建', ariaLabel: '发送业务或长期共建合作邮件', email: 'contact@mentory.cc', subject: '商务合作 + 机构/姓名' },
            { type: 'email', title: '探讨长期战略价值', description: '适用于投资机构、战略投资人及能够提供长期资源协同的机构', label: '洽谈投资与战略合作', ariaLabel: '发送投资与战略合作邮件', email: 'contact@mentory.cc', subject: '投资与战略合作 + 机构/姓名' },
          ],
        },
      ],
    },
    en: {
      title: 'Partner with Mentory',
      tocTitle: 'On this page',
      top: 'Back to top',
      sections: [
        { id: 'trusted-connections', title: '1. Build trusted learning connections together', paragraphs: ['Mentory is building an online learning platform that connects learners with professional mentors. Today, the platform supports mentor profiles, lesson requests, matching and communication, online classrooms, transaction records, and lesson review.', 'At this stage, we are focused on growing the supply of high-quality mentors and experts, connecting more real and well-defined learning needs, and working with long-term partners to validate new learning scenarios and sustainable ways to collaborate.'] },
        { id: 'priorities', title: '2. Partnership priorities', items: [['Mentors & experts', 'Invite mentors, researchers, and industry experts with strong subject knowledge, practical experience, and teaching ability to serve real, specific learning goals'], ['Universities & learning communities', 'Run focused learning pilots with universities, student organizations, and professional communities around subject support, research methods, further study, and career exploration'], ['Team learning pilots', 'Test mentor matching, focused lessons, or online talks around a team’s clearly defined subject or skill needs, with shared validation goals'], ['Content, brands & events', 'Co-create educational content, expert conversations, online events, or brand learning projects that bring useful knowledge to the right audience'], ['Business & regional partners', 'Develop a subject, region, or user segment together, with resources, responsibilities, boundaries, and intended outcomes agreed in advance'], ['Core venture partners', 'Meet people ready to contribute over the long term across product, technology, education operations, growth, or international expansion']] },
        { id: 'investment', title: '3. Investment & strategic partnership', paragraphs: ['Mentory is open to investment and strategic conversations with investors and organizations that share a long-term view of education and can contribute complementary resources in education, platform technology, market development, or international expansion.', 'We want capital partnerships to support sustainable platform growth while strengthening the connection between excellent mentors, real learning needs, and reliable online teaching. Any arrangement will proceed through sufficient discussion, appropriate due diligence, and formal agreement.'] },
        { id: 'connect', title: '4. Choose how to connect', paragraphs: ['Choose the route that best fits you. Business, core venture, and investment enquiries are currently received at contact@mentory.cc and routed by email subject.'], actions: [{ type: 'mentor-registration', title: 'Share your expertise', description: 'Register as a mentor and present your professional background, areas of expertise, and teaching approach', label: 'Become a Mentory mentor', ariaLabel: 'Register as a Mentory mentor' }, { type: 'email', title: 'Build a new learning scenario', description: 'For universities, communities, teams, content brands, business partners, and potential core venture partners', label: 'Discuss business or long-term partnership', ariaLabel: 'Send a business or long-term partnership email', email: 'contact@mentory.cc', subject: 'Business partnership + organization/name' }, { type: 'email', title: 'Explore long-term strategic value', description: 'For investment firms, strategic investors, and organizations able to contribute long-term complementary resources', label: 'Discuss investment or strategic partnership', ariaLabel: 'Send an investment or strategic partnership email', email: 'contact@mentory.cc', subject: 'Investment & strategic partnership + organization/name' }] },
      ],
    },
  },
};

export const buildPartnershipMailto = ({ email, subject }) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

export function AboutSection({ section, onAction, actionLoading = false }) {
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
        <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : null}
      {section.action ? (
        <button
          type="button"
          className="about-page__text-action"
          onClick={() => onAction?.(section.action)}
          disabled={actionLoading}
          aria-label={section.action.ariaLabel}
          aria-busy={actionLoading}
        >
          {section.action.label}<span aria-hidden="true"> →</span>
        </button>
      ) : null}
      {section.actions ? (
        <div className="about-page__actions">
          {section.actions.map((action) => (
            <div className="about-page__action-card" key={`${action.type}-${action.label}`}>
              <div>
                <h3>{action.title}</h3>
                <p>{action.description}</p>
              </div>
              {action.type === 'email' ? (
                <a
                  className="about-page__action-link"
                  href={buildPartnershipMailto(action)}
                  aria-label={action.ariaLabel}
                >
                  {action.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="about-page__action-link"
                  onClick={() => onAction?.(action)}
                  disabled={actionLoading}
                  aria-label={action.ariaLabel}
                  aria-busy={actionLoading}
                >
                  {action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {section.note ? <aside className="privacy-policy__note">{section.note}</aside> : null}
    </section>
  );
}

function AboutPage({ pageKey = 'introduction' }) {
  const { isEnglish, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const content = ABOUT_CONTENT[pageKey][isEnglish ? 'en' : 'zh-CN'];
  const pageTopId = `about-${pageKey}-top`;
  const menuAnchorRef = useRef(null);
  const tocNavRef = useRef(null);
  const tocLinkRefs = useRef(new Map());
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorRegister, setShowMentorRegister] = useState(false);
  const [showMentorLogin, setShowMentorLogin] = useState(false);
  const [showMentorActivation, setShowMentorActivation] = useState(false);
  const [mentorActionLoading, setMentorActionLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [activeSectionId, setActiveSectionId] = useState(content.sections[0].id);
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: ['student'] });

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.key, pageKey]);

  const handleSectionAction = async (action) => {
    if (action?.type !== 'mentor-registration' || mentorActionLoading) return;
    if (!getAuthToken()) {
      setShowMentorRegister(true);
      return;
    }

    setMentorActionLoading(true);
    try {
      const account = await api.get('/api/account/ids').then((response) => response?.data || {});
      const reviewStatus = String(account.mentorReviewStatus || '').toLowerCase();
      if (!account.mentorId || ['rejected', 'interview_rejected'].includes(reviewStatus)) {
        setShowMentorActivation(true);
        return;
      }

      if (getAuthUser()?.role === 'mentor') {
        navigate('/mentor');
        return;
      }

      setShowMentorLogin(true);
    } catch (error) {
      if (error?.response?.status === 401) {
        setIsLoggedIn(false);
        setShowMentorRegister(true);
      } else {
        alert(error?.response?.data?.error || t('auth.actionFailed', '操作失败，请稍后再试'));
      }
    } finally {
      setMentorActionLoading(false);
    }
  };

  useEffect(() => {
    const handleAuthChanged = (event) => {
      setIsLoggedIn(typeof event?.detail?.isLoggedIn !== 'undefined'
        ? Boolean(event.detail.isLoggedIn)
        : Boolean(getAuthToken()));
    };
    window.addEventListener('auth:changed', handleAuthChanged);
    return () => window.removeEventListener('auth:changed', handleAuthChanged);
  }, []);

  useEffect(() => {
    setActiveSectionId(content.sections[0].id);
    const sectionIds = content.sections.map((section) => section.id);
    let animationFrame = 0;
    let scheduled = false;
    const updateActiveSection = () => {
      scheduled = false;
      const marker = Math.min(window.innerHeight * 0.28, 240);
      const atPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let nextSectionId = sectionIds[0];
      if (atPageBottom) {
        nextSectionId = sectionIds[sectionIds.length - 1];
      } else {
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
  }, [content]);

  useEffect(() => {
    const nav = tocNavRef.current;
    const activeLink = tocLinkRefs.current.get(activeSectionId);
    if (!nav || !activeLink || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({
      left: Math.max(0, activeLink.offsetLeft - ((nav.clientWidth - activeLink.offsetWidth) / 2)),
      behavior: 'smooth',
    });
  }, [activeSectionId]);

  return (
    <div className={`privacy-policy-page about-page about-page--${pageKey}`} id={pageTopId}>
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
              {content.sections.map((section) => (
                <AboutSection
                  key={section.id}
                  section={section}
                  onAction={handleSectionAction}
                  actionLoading={mentorActionLoading}
                />
              ))}
              <a className="privacy-policy__back-top" href={`#${pageTopId}`}>{content.top} ↑</a>
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

      {showMentorRegister ? (
        <RegisterPopup
          initialRole="mentor"
          onClose={() => setShowMentorRegister(false)}
        />
      ) : null}

      {showMentorLogin ? (
        <LoginPopup
          role="mentor"
          onClose={() => setShowMentorLogin(false)}
          onGoRegister={() => {
            setShowMentorLogin(false);
            setShowMentorRegister(true);
          }}
          onSuccess={() => navigate('/mentor')}
        />
      ) : null}

      {showMentorActivation ? (
        <MentorActivationPopup
          onClose={() => setShowMentorActivation(false)}
        />
      ) : null}
    </div>
  );
}

export default AboutPage;
