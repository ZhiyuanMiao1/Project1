import React from 'react';
import { FiBell, FiClock, FiGift, FiShield, FiUser, FiX } from 'react-icons/fi';
import '../RegisterPopup/RegisterPopup.css';
import './StudentWelcomePopup.css';
import Button from '../common/Button/Button';
import { useI18n } from '../../i18n/language';

const StudentWelcomePopup = ({ publicId, role = 'student', onConfirm, onClose }) => {
  const { t } = useI18n();
  const isMentor = role === 'mentor';

  return (
    <div
      className="register-modal-overlay student-welcome-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
      onClick={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <div
        className="register-modal-content student-welcome-content"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button type="button" className="register-modal-close" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <FiX aria-hidden="true" />
        </button>
        <h3>{isMentor ? t('auth.mentorWelcomeTitle', '欢迎成为 Mentory 导师！') : t('auth.studentWelcomeTitle', '欢迎来到 Mentory！')}</h3>

        <div className="student-welcome-body">
          <div className="student-welcome-id-card">
            <p className="student-welcome-line">
              {isMentor ? t('auth.mentorIdLine', '这是你的 MentorID：') : t('auth.studentIdLine', '这是你的 StudentID：')}
              <span className="student-welcome-id">{publicId || '—'}</span>
            </p>
            <p className="student-welcome-id-help">
              {isMentor
                ? t('welcome.mentorIdHelp', 'MentorID 是你在 Mentory 的专属身份标识，可用于展示和搜索')
                : t('welcome.studentIdHelp', 'StudentID 是你在 Mentory 的专属身份标识，可在个人信息中查看')}
            </p>
          </div>

          <h4 className="student-welcome-section-title">
            {isMentor ? t('welcome.mentorNoticeTitle', '开始授课前，请注意') : t('welcome.studentNoticeTitle', '开始使用前，请注意')}
          </h4>

          {isMentor ? (
            <div className="student-welcome-notices">
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon"><FiUser aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.mentorProfileTitle', '完善导师资料')}</h5>
                  <p>{t('welcome.mentorProfileBody', '完善教育经历、擅长领域和个人介绍，让学生更快了解你')}</p>
                </div>
              </section>
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon"><FiClock aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.mentorEfficiencyTitle', '提高效率')}</h5>
                  <p>
                    {t('welcome.mentorEfficiencyPrefix', '建议在')}
                    <a className="student-welcome-inline-link" href="/mentor/settings?section=profile" target="_blank" rel="noopener noreferrer">{t('welcome.settingsLink', '设置')}</a>
                    {t('welcome.mentorEfficiencyBody', '个人信息页面提前设置可授课的时间段，提高预约效率；可微信搜索“曼途”，关注官方服务号，及时获得与你专业相关的课程需求推送')}
                  </p>
                </div>
              </section>
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon student-welcome-notice-icon--warning"><FiShield aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.mentorRulesTitle', '导师行为规范')}</h5>
                  <p>{t('welcome.mentorRulesBody', 'Mentory 对代写、私下接触学生等行为零容忍，请始终通过平台完成沟通、预约与授课，违规行为将按平台规则处理')}</p>
                </div>
              </section>
            </div>
          ) : (
            <div className="student-welcome-notices">
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon"><FiUser aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.studentProfileTitle', '完善个人信息')}</h5>
                  <p>
                    <a className="student-welcome-inline-link" href="/student/settings?section=profile" target="_blank" rel="noopener noreferrer">{t('welcome.profileLink', '个人信息')}</a>
                    {t('welcome.studentProfileBody', '有助于导师了解你的学习背景与需求')}
                  </p>
                </div>
              </section>
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon"><FiGift aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.studentReviewRewardTitle', '评价导师得课时')}</h5>
                  <p>
                    {t('welcome.studentReviewRewardPrefix', '限时活动：完成课程后，在')}
                    <a className="student-welcome-inline-link" href="/student/courses" target="_blank" rel="noopener noreferrer">{t('welcome.coursesLink', '课程')}</a>
                    {t('welcome.studentReviewRewardBody', '页面评价导师，即可免费获得课时')}
                  </p>
                </div>
              </section>
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon student-welcome-notice-icon--warning"><FiShield aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.studentSafetyTitle', '保障交易安全')}</h5>
                  <p>
                    {t('welcome.studentSafetyPrefix', 'Mentory 对导师代写、私下接触等行为零容忍。如发现相关行为或对教学质量不满意，可在')}
                    <a className="student-welcome-inline-link" href="/student/courses" target="_blank" rel="noopener noreferrer">{t('welcome.coursesLink', '课程')}</a>
                    {t('welcome.studentSafetyBody', '页面进行投诉，平台会给予充分的奖励')}
                  </p>
                </div>
              </section>
              <section className="student-welcome-notice">
                <span className="student-welcome-notice-icon"><FiBell aria-hidden="true" /></span>
                <div>
                  <h5>{t('welcome.studentEmailTitle', '及时接收邮件提醒')}</h5>
                  <p>{t('welcome.studentEmailBody', '约课过程中，平台会及时发送邮件提醒；若未收到，请检查垃圾邮件箱')}</p>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="register-continue-area student-welcome-action">
          <Button className="register-continue-button" onClick={onConfirm} fullWidth>
            {isMentor ? t('welcome.editProfileCard', '编辑个人名片') : t('welcome.exploreMentors', '开始探索导师')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StudentWelcomePopup;
