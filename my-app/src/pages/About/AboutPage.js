import React, { useEffect, useRef, useState } from 'react';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import SiteFooter from '../../components/common/SiteFooter/SiteFooter';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { getAuthToken } from '../../utils/authStorage';
import { useI18n } from '../../i18n/language';
import '../PrivacyPolicy/PrivacyPolicyPage.css';

const ABOUT_CONTENT = {
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
          title: '4. 面向学习者与导师',
          paragraphs: [
            '对学习者而言，Mentory 提供更灵活的选择：你可以主动寻找导师，也可以先发布需求，让导师根据自己的专长与你联系。',
            '对导师而言，Mentory 提供展示专业背景、发现真实需求、组织课程和管理教学过程的工具。我们期待导师不仅传递答案，也帮助学习者建立方法、信心和独立思考能力。',
          ],
        },
        {
          id: 'future',
          title: '5. 一起塑造 Mentory',
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
        { id: 'hello', title: '1. Make learning go further', paragraphs: ['Mentory is an online learning platform that connects learners with mentors. We make it easier for people to find guidance that fits, while helping knowledgeable and thoughtful mentors share their expertise through meaningful lessons.', 'Whether you are working through a course, preparing for an important exam, exploring a new field, or turning your own expertise into valuable teaching, Mentory aims to be a trusted connection along the way.'] },
        { id: 'how-it-works', title: '2. How Mentory works', lead: 'We support the journey from finding a mentor to completing a lesson around a learner’s real goals:', items: [['Discover the right mentor', 'Browse mentor profiles by time zone, subject, and personal needs, including education, expertise, and lesson topics.'], ['Post a lesson request', 'Describe your goals, subject, and schedule so relevant mentors can understand the need and reach out.'], ['Communicate and learn online', 'Confirm a plan through messages, then teach, interact, and share learning materials in the online classroom.'], ['Manage learning over time', 'Keep lessons, hours, reviews, and related records together so progress stays clear and traceable.']] },
        { id: 'values', title: '3. What matters to us', items: [['Fit, not just choice', 'A good learning experience starts with the right match between expertise, communication style, schedule, and goals.'], ['Clarity and trust', 'Transparent profiles, requests, messages, and lesson-hour confirmation help both sides set clear expectations.'], ['Respect for every path', 'There is no single template for learning. Every background, stage, and ambition deserves thoughtful support.'], ['Lasting value', 'Mentory is not only about finishing one class. We hope to enable learning relationships that build knowledge and confidence over time.']] },
        { id: 'community', title: '4. For learners and mentors', paragraphs: ['Learners can either search for a mentor directly or post a request and let relevant mentors get in touch based on their expertise.', 'Mentors can present their background, discover real learning needs, organize lessons, and manage teaching. We value mentors who help learners build methods, confidence, and independent thinking—not only find an answer.'] },
        { id: 'future', title: '5. Shape Mentory with us', paragraphs: ['Mentory is continuing to grow. We use feedback from learners and mentors to improve matching, communication, classrooms, and support, making knowledge easier to share across regions and disciplines.'], note: 'For product suggestions, feedback, or partnership ideas, email contact@mentory.cc' },
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
        { id: 'apply', title: '6. Ready to begin?', paragraphs: ['Go to the Mentory mentor experience, register, and complete your profile. A specific and accurate description of your background, subjects, and teaching style helps learners understand whether you are a good fit.'], note: 'For questions about joining, credentials, or mentor partnerships, email contact@mentory.cc with “Mentor partnership” in the subject line' },
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
          id: 'possibility',
          title: '1. 让优质知识连接更多人',
          paragraphs: [
            'Mentory 希望与重视教育质量、专业知识和长期价值的机构与团队合作。我们可以围绕导师资源、学习内容、用户社区和在线教学场景，共同探索清晰、可持续的合作方式。',
            '无论你代表高校与学生组织、教育或研究机构、专业社群、内容品牌，还是正在为团队寻找学习支持，我们都愿意先从真实需求出发了解合作可能。',
          ],
        },
        {
          id: 'ways',
          title: '2. 合作方向',
          items: [
            ['导师与专家合作', '邀请具备专业背景的导师、研究者或行业专家入驻，开展主题课程和知识分享。'],
            ['高校与社群合作', '围绕课程辅导、升学经验、研究方法和职业探索，为特定学习群体连接合适导师。'],
            ['内容与活动共创', '共同策划线上分享、专题内容、学习活动或有明确教育价值的品牌项目。'],
            ['团队学习支持', '根据团队的学科或技能需求，探索灵活的导师匹配与在线学习安排。'],
          ],
        },
        {
          id: 'process',
          title: '3. 合作流程',
          bullets: [
            '需求沟通：说明合作背景、目标、受众、时间范围与预期成果；',
            '方案评估：双方确认内容、资源、职责、合规要求与衡量方式；',
            '小范围验证：在适合的情况下先以试点验证用户价值和执行方式；',
            '落地与复盘：按确认的计划推进，并根据反馈持续优化。',
          ],
        },
        {
          id: 'principles',
          title: '4. 我们的合作原则',
          items: [
            ['学习价值优先', '合作内容应当对学习者或导师产生明确、真实的价值。'],
            ['透明与尊重', '清楚说明合作关系、内容边界、数据使用与各方责任。'],
            ['质量与可信度', '不夸大效果，不以误导性宣传替代可靠的课程与专业内容。'],
            ['隐私与安全', '在必要范围内处理信息，并遵守适用法律与 Mentory 平台规则。'],
          ],
        },
        {
          id: 'contact',
          title: '5. 联系商务合作',
          paragraphs: ['请发送邮件至 contact@mentory.cc，并简要介绍你的机构或团队、合作设想、目标受众、计划时间和联系方式。我们会在评估与 Mentory 用户和产品方向的匹配度后回复。'],
          note: '建议在邮件主题中注明“商务合作 + 机构名称”，便于我们更快了解你的来意',
        },
      ],
    },
    en: {
      title: 'Partner with Mentory',
      tocTitle: 'On this page',
      top: 'Back to top',
      sections: [
        { id: 'possibility', title: '1. Connect great knowledge with more people', paragraphs: ['Mentory works with organizations and teams that care about educational quality, professional expertise, and long-term value. Together, we can explore clear and sustainable partnerships around mentors, learning content, communities, and online teaching.', 'Whether you represent a university group, education or research organization, professional community, content brand, or a team seeking learning support, we are happy to begin with the real need and explore what may fit.'] },
        { id: 'ways', title: '2. Ways to partner', items: [['Mentors and experts', 'Bring qualified mentors, researchers, or industry experts onto Mentory for focused lessons and knowledge sharing.'], ['Universities and communities', 'Connect a learning group with relevant mentors for subject support, further study, research methods, or career exploration.'], ['Content and events', 'Co-create online talks, focused learning content, community activities, or brand projects with clear educational value.'], ['Team learning support', 'Explore flexible mentor matching and online learning arrangements around a team’s subject or skill needs.']] },
        { id: 'process', title: '3. How partnerships take shape', bullets: ['Discovery: share the context, goals, audience, timing, and intended outcomes;', 'Assessment: align on content, resources, responsibilities, compliance, and measures of success;', 'Pilot: where useful, begin at a smaller scale to validate learner value and delivery;', 'Delivery and review: execute the agreed plan, learn from feedback, and improve.'] },
        { id: 'principles', title: '4. Our partnership principles', items: [['Learning value first', 'Every partnership should create clear, genuine value for learners or mentors.'], ['Transparency and respect', 'Be clear about the relationship, content boundaries, data use, and responsibilities.'], ['Quality and credibility', 'Do not exaggerate outcomes or replace reliable learning and expertise with misleading promotion.'], ['Privacy and safety', 'Use information only as necessary and follow applicable law and Mentory platform rules.']] },
        { id: 'contact', title: '5. Contact partnerships', paragraphs: ['Email contact@mentory.cc with a short introduction to your organization or team, the partnership idea, target audience, expected timing, and contact details. We will reply after assessing its fit with Mentory’s users and product direction.'], note: 'Use “Business partnership + organization name” in the subject line so we can understand your request more quickly' },
      ],
    },
  },
};

function AboutSection({ section }) {
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
      {section.note ? <aside className="privacy-policy__note">{section.note}</aside> : null}
    </section>
  );
}

function AboutPage({ pageKey = 'introduction' }) {
  const { isEnglish, t } = useI18n();
  const content = ABOUT_CONTENT[pageKey][isEnglish ? 'en' : 'zh-CN'];
  const pageTopId = `about-${pageKey}-top`;
  const menuAnchorRef = useRef(null);
  const tocNavRef = useRef(null);
  const tocLinkRefs = useRef(new Map());
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const [activeSectionId, setActiveSectionId] = useState(content.sections[0].id);
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: ['student'] });

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
              {content.sections.map((section) => <AboutSection key={section.id} section={section} />)}
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
    </div>
  );
}

export default AboutPage;
