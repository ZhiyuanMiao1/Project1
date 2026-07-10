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
          <div className="site-footer__logo">Mentory</div>
          <p className="site-footer__description">
            {t('footer.description', '连接学生与导师，让课程支持更清晰、更可靠。')}
          </p>
        </section>

        <nav className="site-footer__column" aria-label={t('footer.support', '支持')}>
          <h2>{t('footer.support', '支持')}</h2>
          <Link to={`${basePath}/help`}>{t('footer.helpCenter', '帮助中心')}</Link>
          <a href={`mailto:${supportEmail}`}>{t('footer.contactUs', '联系我们')}</a>
          <span className="site-footer__muted">{supportEmail}</span>
        </nav>

        <nav className="site-footer__column" aria-label={t('footer.users', '用户')}>
          <h2>{t('footer.users', '用户')}</h2>
          <Link to="/student">{t('footer.studentHome', '学生主页')}</Link>
          <Link to="/mentor">{t('footer.mentorHome', '导师主页')}</Link>
          <Link to={`${basePath}/courses`}>{t('footer.courses', '课程')}</Link>
          <Link to={`${basePath}/messages`}>{t('footer.messages', '消息')}</Link>
        </nav>

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
