import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n/language';
import useMediaQuery from '../../../hooks/useMediaQuery';
import './SiteFooter.css';

const supportEmail = 'contact@mentory.cc';

function FooterColumn({ as: Element = 'section', id, title, isPhone, expandedSection, onToggle, children }) {
  const isExpanded = !isPhone || expandedSection === id;
  const contentId = `site-footer-${id}-content`;

  return (
    <Element className="site-footer__column" aria-label={title}>
      <h2>
        {isPhone ? (
          <button
            type="button"
            className="site-footer__column-toggle"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            onClick={() => onToggle(id)}
          >
            <span>{title}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 6l4.5 4 4.5-4" />
            </svg>
          </button>
        ) : title}
      </h2>
      <div id={contentId} className="site-footer__column-content" hidden={!isExpanded}>
        {children}
      </div>
    </Element>
  );
}

function SiteFooter({ mode = 'student' }) {
  const { t } = useI18n();
  const isPhone = useMediaQuery('(max-width: 599px)');
  const [expandedSection, setExpandedSection] = useState(null);
  const isMentorMode = mode === 'mentor';
  const basePath = isMentorMode ? '/mentor' : '/student';
  const toggleSection = (sectionId) => {
    setExpandedSection((currentSection) => (currentSection === sectionId ? null : sectionId));
  };

  return (
    <footer className="site-footer" aria-label={t('footer.aria', 'Mentory 页脚')}>
      <div className="site-footer__main">
        <section className="site-footer__brand" aria-label={t('footer.brandAria', 'Mentory')}>
          <div className="site-footer__logo">
            <img src="/Logo_standard-removebg.png" alt="" aria-hidden="true" />
            <span>Mentory</span>
          </div>
          <p className="site-footer__description">
            {t('footer.description', 'Make learning go further.')}
          </p>
        </section>

        <FooterColumn
          as="nav"
          id="support"
          title={t('footer.support', '支持')}
          isPhone={isPhone}
          expandedSection={expandedSection}
          onToggle={toggleSection}
        >
          <Link to={`${basePath}/help`}>{t('footer.helpCenter', '帮助中心')}</Link>
          <div className="site-footer__contact-row">
            <a href={`mailto:${supportEmail}`}>{t('footer.contactUs', '联系我们')}</a>
            <span className="site-footer__muted">{supportEmail}</span>
          </div>
        </FooterColumn>

        <FooterColumn
          id="about"
          title={t('footer.about', '关于我们')}
          isPhone={isPhone}
          expandedSection={expandedSection}
          onToggle={toggleSection}
        >
          <span>{t('footer.introduction', '介绍')}</span>
          <span>{t('footer.mentorOpportunities', '导师工作机会')}</span>
          <span>{t('footer.businessCooperation', '商务合作')}</span>
        </FooterColumn>

        <FooterColumn
          id="rules"
          title={t('footer.rules', '规则')}
          isPhone={isPhone}
          expandedSection={expandedSection}
          onToggle={toggleSection}
        >
          <span>{t('footer.privacy', '隐私政策')}</span>
          <span>{t('footer.terms', '服务条款')}</span>
          <span>{t('footer.refundRules', '退款/取消规则')}</span>
        </FooterColumn>
      </div>

      <div className="site-footer__bottom">
        <span>{t('footer.copyright', '© 2026 Mentory')}</span>
        <span>{t('footer.compliancePending', '备案与许可证信息待补充')}</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
