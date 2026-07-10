import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n/language';
import './SiteFooter.css';

const supportEmail = 'contact@mentory.cc';

function SiteFooter({ mode = 'student' }) {
  const { t } = useI18n();
  const isMentorMode = mode === 'mentor';
  const basePath = isMentorMode ? '/mentor' : '/student';

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

        <nav className="site-footer__column" aria-label={t('footer.support', '支持')}>
          <h2>{t('footer.support', '支持')}</h2>
          <Link to={`${basePath}/help`}>{t('footer.helpCenter', '帮助中心')}</Link>
          <a href={`mailto:${supportEmail}`}>{t('footer.contactUs', '联系我们')}</a>
          <span className="site-footer__muted">{supportEmail}</span>
        </nav>

        <section className="site-footer__column" aria-label={t('footer.about', '关于我们')}>
          <h2>{t('footer.about', '关于我们')}</h2>
          <span>{t('footer.introduction', '介绍')}</span>
          <span>{t('footer.mentorOpportunities', '导师工作机会')}</span>
          <span>{t('footer.businessCooperation', '商务合作')}</span>
        </section>

        <section className="site-footer__column" aria-label={t('footer.rules', '规则')}>
          <h2>{t('footer.rules', '规则')}</h2>
          <span>{t('footer.privacy', '隐私政策')}</span>
          <span>{t('footer.terms', '服务条款')}</span>
          <span>{t('footer.refundRules', '退款/取消规则')}</span>
        </section>
      </div>

      <div className="site-footer__bottom">
        <span>{t('footer.copyright', '© 2026 Mentory')}</span>
        <span>{t('footer.compliancePending', '备案与许可证信息待补充')}</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
