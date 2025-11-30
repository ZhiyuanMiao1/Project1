import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import tutor1 from '../../assets/images/tutor1.jpg';
import tutor2 from '../../assets/images/tutor2.jpg';
import tutor3 from '../../assets/images/tutor3.jpg';
import tutor4 from '../../assets/images/tutor4.jpg';
import tutor5 from '../../assets/images/tutor5.jpg';
import tutor6 from '../../assets/images/tutor6.jpg';
import '../RecentVisits/RecentVisitsPage.css';

const MENTOR_FAVORITES = [
  {
    id: 'fav-mentor-01',
    name: 'S1',
    degree: '硕士',
    school: '斯坦福大学',
    discipline: '设计 / 创意',
    timezone: 'UTC+8 (上海)',
    courseType: '选课指导',
    expectedDuration: '2小时',
  },
  {
    id: 'fav-mentor-02',
    name: 'S2',
    degree: '硕士',
    school: '麻省理工学院',
    discipline: '数据结构与算法',
    timezone: 'UTC-7 (加州)',
    courseType: '课前预习',
    expectedDuration: '1.5小时',
  },
  {
    id: 'fav-mentor-03',
    name: 'S3',
    degree: '硕士',
    school: '哥伦比亚大学',
    discipline: '其它课程方向',
    timezone: 'UTC+8 (上海)',
    courseType: '作业项目',
    expectedDuration: '2小时',
  },
  {
    id: 'fav-mentor-04',
    name: 'S4',
    degree: 'PhD',
    school: '哈佛大学',
    discipline: '数据分析',
    timezone: 'UTC+8 (上海)',
    courseType: '课前预习',
    expectedDuration: '2小时',
  },
  {
    id: 'fav-mentor-05',
    name: 'S5',
    degree: '硕士',
    school: '加州大学伯克利分校',
    discipline: '设计 / 创意',
    timezone: 'UTC+8 (上海)',
    courseType: '作业项目',
    expectedDuration: '2小时',
  },
  {
    id: 'fav-mentor-06',
    name: 'S6',
    degree: '硕士',
    school: '芝加哥大学',
    discipline: '求职辅导',
    timezone: 'UTC+8 (上海)',
    courseType: '求职辅导',
    expectedDuration: '1.5小时',
  },
];

const STUDENT_FAVORITES = [
  {
    id: 'fav-student-01',
    name: '张三',
    gender: '男',
    degree: 'PhD',
    school: '哈佛大学',
    rating: 4.9,
    reviewCount: 120,
    courses: ['Python编程', '机器学习', '深度学习'],
    timezone: 'UTC+8 (北京)',
    languages: '中文, 英语',
    imageUrl: tutor1,
  },
  {
    id: 'fav-student-02',
    name: '李四',
    gender: '女',
    degree: '硕士',
    school: '斯坦福大学',
    rating: 4.8,
    reviewCount: 95,
    courses: ['深度学习', '自然语言处理'],
    timezone: 'UTC-7 (加州)',
    languages: '英语, 西班牙语',
    imageUrl: tutor2,
  },
  {
    id: 'fav-student-03',
    name: '王五',
    gender: '男',
    degree: 'PhD',
    school: '麻省理工学院',
    rating: 4.7,
    reviewCount: 80,
    courses: ['数据分析', '统计建模', '数据可视化'],
    timezone: 'UTC+1 (伦敦)',
    languages: '英语, 德语',
    imageUrl: tutor3,
  },
  {
    id: 'fav-student-04',
    name: '赵六',
    gender: '男',
    degree: '本科',
    school: '清华大学',
    rating: 5.0,
    reviewCount: 150,
    courses: ['算法设计', '高等数学'],
    timezone: 'UTC+8 (北京)',
    languages: '中文, 英语',
    imageUrl: tutor4,
  },
  {
    id: 'fav-student-05',
    name: 'Emily Smith',
    gender: '女',
    degree: 'PhD',
    school: '剑桥大学',
    rating: 4.85,
    reviewCount: 60,
    courses: ['微积分', '高等代数', '线性代数'],
    timezone: 'UTC+0 (伦敦)',
    languages: '英语, 法语',
    imageUrl: tutor5,
  },
  {
    id: 'fav-student-06',
    name: 'Michael Johnson',
    gender: '男',
    degree: '硕士',
    school: '加州理工学院',
    rating: 4.75,
    reviewCount: 45,
    courses: ['数据挖掘'],
    timezone: 'UTC-8 (加州)',
    languages: '英语',
    imageUrl: tutor6,
  },
];

const normalizeMentorCard = (visit, idx) => {
  const numericId = (() => {
    if (typeof visit.studentId !== 'undefined') return visit.studentId;
    const match = String(visit.id || '').match(/\d+/);
    return match ? match[0] : idx + 1;
  })();
  const studentName = visit.name || `S${numericId}`;
  return {
    id: visit.id || `mentor-${numericId}`,
    name: studentName,
    degree: visit.degree || '硕士',
    school: visit.school || '测试大学',
    courses: visit.discipline ? [visit.discipline] : [],
    timezone: visit.timezone || 'UTC+8 (上海)',
    courseType: visit.courseType || '',
    expectedDuration: visit.expectedDuration || '',
    requirements: visit.requirements || '',
  };
};

function FavoriteCollectionPage() {
  const { collectionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return !!localStorage.getItem('authToken');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        try {
          setIsLoggedIn(!!localStorage.getItem('authToken'));
        } catch {
          setIsLoggedIn(false);
        }
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const preferredRole = useMemo(() => {
    const searchRole = (() => {
      try {
        const params = new URLSearchParams(location.search || '');
        const val = params.get('role');
        if (val === 'mentor' || val === 'student') return val;
      } catch {}
      return null;
    })();

    if (searchRole) return searchRole;
    const fromState = location.state?.fromRole || location.state?.from;
    if (fromState === 'mentor' || fromState === 'student') return fromState;
    try {
      const lastRole = sessionStorage.getItem('favorites:lastRole');
      if (lastRole === 'mentor' || lastRole === 'student') return lastRole;
    } catch {}
    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      return user?.role === 'mentor' ? 'mentor' : 'student';
    } catch {
      return 'student';
    }
  }, [location.search, location.state]);

  const collectionTitle = location.state?.title
    || location.state?.name
    || location.state?.collectionName
    || (collectionId === 'recent' ? '最近浏览' : '收藏夹');

  const mentorCards = useMemo(
    () => MENTOR_FAVORITES.map((item, idx) => normalizeMentorCard(item, idx)),
    [],
  );

  const studentCards = useMemo(() => STUDENT_FAVORITES, []);

  const cardsToShow = preferredRole === 'mentor' ? mentorCards : studentCards;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/student/favorites', { state: { from: preferredRole, fromRole: preferredRole } });
    }
  };

  const openAuthModal = () => {
    if (preferredRole === 'mentor') {
      setShowMentorAuth(true);
    } else {
      setShowStudentAuth(true);
    }
  };

  return (
    <div className="recent-page favorite-detail-page">
      <div className="container">
        <header className="recent-header">
          <BrandMark
            className="nav-logo-text"
            to={preferredRole === 'mentor' ? '/mentor' : '/student'}
          />
          <button
            type="button"
            className="icon-circle recent-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={openAuthModal}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="recent-hero">
          <div className="recent-hero-left">
            <button
              type="button"
              className="recent-back"
              aria-label="返回收藏"
              onClick={handleBack}
            >
              <FiChevronLeft size={20} />
            </button>
            <div className="recent-hero-text">
              <h1>{collectionTitle}</h1>
            </div>
          </div>
          <button
            type="button"
            className="recent-edit-link recent-hero-edit"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '完成' : '编辑'}
          </button>
        </section>

        <section className="recent-sections favorite-detail-sections">
          <div className="recent-grid" role="list">
            {cardsToShow.map((card, idx) => (
              <div
                className={`recent-card-shell ${editMode ? 'is-editing' : ''}`}
                key={card.id || idx}
                role="listitem"
              >
                {editMode && (
                  <button
                    type="button"
                    className="recent-edit-remove"
                    aria-label="移除此记录"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="recent-edit-remove-icon" aria-hidden="true" />
                  </button>
                )}
                {preferredRole === 'mentor' ? (
                  <MentorListingCard data={card} />
                ) : (
                  <StudentListingCard data={card} />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {showStudentAuth && (
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

      {showMentorAuth && (
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

export default FavoriteCollectionPage;
