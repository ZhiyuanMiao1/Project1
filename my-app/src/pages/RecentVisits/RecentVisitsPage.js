import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import { fetchFavoriteItems } from '../../api/favorites';
import { deleteRecentVisit, fetchRecentVisits } from '../../api/recentVisits';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { useI18n } from '../../i18n/language';
import './RecentVisitsPage.css';

const PAGE_SIZE = 10;
const TEXT = {
  older: '\u66f4\u65e9',
  today: '\u4eca\u5929',
  yesterday: '\u6628\u5929',
  heroTitle: '\u6700\u8fd1\u6d4f\u89c8',
  moreMenu: '\u66f4\u591a\u83dc\u5355',
  backToFavorites: '\u8fd4\u56de\u6536\u85cf',
  done: '\u5b8c\u6210',
  edit: '\u7f16\u8f91',
  removeRecord: '\u79fb\u9664\u6b64\u8bb0\u5f55',
  loading: '\u52a0\u8f7d\u4e2d...',
  loginRequired: '\u8bf7\u767b\u5f55\u540e\u67e5\u770b\u6700\u8fd1\u6d4f\u89c8',
  noPermission: '\u5f53\u524d\u8eab\u4efd\u6682\u65e0\u6743\u9650\u67e5\u770b\u6700\u8fd1\u6d4f\u89c8',
  loadFailed: '\u52a0\u8f7d\u6700\u8fd1\u6d4f\u89c8\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5',
  deleteFailed: '\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5',
  mentorHero: '',
  studentHero: '',
  mentorEmpty: '\u8fd8\u6ca1\u6709\u5b66\u751f\u6d4f\u89c8\u8bb0\u5f55',
  studentEmpty: '\u8fd8\u6ca1\u6709\u5bfc\u5e08\u6d4f\u89c8\u8bb0\u5f55',
};

const getPreferredRole = (location) => {
  try {
    const params = new URLSearchParams(location?.search || '');
    const queryRole = params.get('role');
    if (queryRole === 'mentor' || queryRole === 'student') return queryRole;
  } catch {}

  const fromState = location?.state?.fromRole || location?.state?.from;
  if (fromState === 'mentor' || fromState === 'student') return fromState;

  try {
    const lastRole = sessionStorage.getItem('favorites:lastRole');
    if (lastRole === 'mentor' || lastRole === 'student') return lastRole;
  } catch {}

  const user = getAuthUser() || {};
  return user?.role === 'mentor' ? 'mentor' : 'student';
};

const getDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'older';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatSectionLabel = (value, { language = 'zh-CN', t = (_key, fallback) => fallback } = {}) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return t('recent.older', TEXT.older);

  const now = new Date();
  const todayKey = getDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  const targetKey = getDateKey(date);

  if (targetKey === todayKey) return t('favorites.today', TEXT.today);
  if (targetKey === yesterdayKey) return t('favorites.yesterday', TEXT.yesterday);
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
};

const buildStudentCardData = (item) => {
  const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
  const itemId = String(payload?.id ?? item?.itemId ?? '').trim();
  return {
    id: itemId,
    name: payload?.name || itemId || 'Mentor',
    gender: payload?.gender || '',
    degree: payload?.degree || '',
    school: payload?.school || '',
    rating: payload?.rating || 0,
    reviewCount: payload?.reviewCount || 0,
    courses: Array.isArray(payload?.courses) ? payload.courses : [],
    timezone: payload?.timezone || '',
    languages: payload?.languages || '',
    imageUrl: payload?.imageUrl || payload?.avatarUrl || payload?.avatar_url || null,
  };
};

const buildMentorCardData = (item) => {
  const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
  const itemId = String(payload?.id ?? item?.itemId ?? '').trim();
  return {
    ...payload,
    id: itemId,
    name: payload?.name || '',
  };
};

const mergeItems = (prev, next) => {
  const merged = Array.isArray(prev) ? [...prev] : [];
  const seen = new Set(merged.map((item) => String(item?.id)));
  next.forEach((item) => {
    const key = String(item?.id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
};

function RecentVisitsPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const sentinelRef = useRef(null);
  const nextOffsetRef = useRef(0);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loading, setLoading] = useState(() => !!getAuthToken());
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAuthToken());
  const preferredRole = useMemo(() => getPreferredRole(location), [location]);
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: [preferredRole] });
  const favoriteItemType = preferredRole === 'mentor' ? 'student_request' : 'tutor';
  const logoTo = preferredRole === 'mentor' ? '/mentor' : '/student';
  const heroCopy = preferredRole === 'mentor' ? TEXT.mentorHero : TEXT.studentHero;
  const emptyCopy = preferredRole === 'mentor'
    ? t('recent.mentorEmpty', TEXT.mentorEmpty)
    : t('recent.studentEmpty', TEXT.studentEmpty);

  useEffect(() => {
    if (!preferredRole) return;
    try {
      sessionStorage.setItem('favorites:lastRole', preferredRole);
    } catch {}
  }, [preferredRole]);

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  const loadVisits = useCallback(async (reset = false) => {
    if (!isLoggedIn) {
      setItems([]);
      setFavoriteIds(new Set());
      setErrorMessage(t('recent.loginRequired', TEXT.loginRequired));
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      nextOffsetRef.current = 0;
      return;
    }

    const requestOffset = reset ? 0 : nextOffsetRef.current;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setErrorMessage('');

    try {
      const res = await fetchRecentVisits({
        role: preferredRole,
        limit: PAGE_SIZE,
        offset: requestOffset,
      });
      const list = Array.isArray(res?.data?.items) ? res.data.items : [];
      const pagination = res?.data?.pagination || {};
      const resolvedNextOffset = Number.isFinite(Number(pagination.nextOffset))
        ? Number(pagination.nextOffset)
        : requestOffset + list.length;

      setItems((prev) => (reset ? list : mergeItems(prev, list)));
      setHasMore(!!pagination.hasMore);
      nextOffsetRef.current = resolvedNextOffset;
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 401) {
        setErrorMessage(t('recent.loginRequired', TEXT.loginRequired));
      } else if (status === 403) {
        setErrorMessage(msg || t('recent.noPermission', TEXT.noPermission));
      } else {
        setErrorMessage(msg || t('recent.loadFailed', TEXT.loadFailed));
      }
      if (reset) {
        setItems([]);
        setHasMore(false);
        nextOffsetRef.current = 0;
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isLoggedIn, preferredRole, t]);

  useEffect(() => {
    setEditMode(false);
    setItems([]);
    setFavoriteIds(new Set());
    nextOffsetRef.current = 0;
    setHasMore(false);
    loadVisits(true);
  }, [loadVisits, preferredRole]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setFavoriteIds(new Set());
      return () => { alive = false; };
    }

    fetchFavoriteItems({ role: preferredRole, itemType: favoriteItemType, idsOnly: true })
      .then((res) => {
        if (!alive) return;
        const ids = Array.isArray(res?.data?.ids) ? res.data.ids : [];
        setFavoriteIds(new Set(ids.map(String)));
      })
      .catch(() => {
        if (!alive) return;
        setFavoriteIds(new Set());
      });

    return () => { alive = false; };
  }, [favoriteItemType, isLoggedIn, preferredRole]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore || errorMessage) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (!first?.isIntersecting) return;
      loadVisits(false);
    }, { rootMargin: '240px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [errorMessage, hasMore, loadVisits, loading, loadingMore]);

  const sections = useMemo(() => {
    const groups = [];
    const indexMap = new Map();

    items.forEach((item) => {
      const visitedAt = item?.visitedAt || item?.updatedAt || item?.createdAt;
      const key = getDateKey(visitedAt);
      if (!indexMap.has(key)) {
        const section = {
          id: key,
          dateLabel: formatSectionLabel(visitedAt, { language, t }),
          visits: [],
        };
        indexMap.set(key, section);
        groups.push(section);
      }
      indexMap.get(key).visits.push(item);
    });

    return groups;
  }, [items, language, t]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(`/student/favorites?role=${preferredRole}`, {
        state: { from: preferredRole, fromRole: preferredRole },
      });
    }
  };

  const openAuthModal = () => {
    if (preferredRole === 'mentor') {
      setShowMentorAuth(true);
    } else {
      setShowStudentAuth(true);
    }
  };

  const toggleMenuAuthModal = () => {
    if (preferredRole === 'mentor') {
      setShowMentorAuth((prev) => !prev);
      return;
    }
    setShowStudentAuth((prev) => !prev);
  };

  const handleDelete = async (id) => {
    if (!id) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deleteRecentVisit(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      const msg = e?.response?.data?.error || t('recent.deleteFailed', TEXT.deleteFailed);
      alert(msg);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="recent-page">
      <div className="container">
        <header className="recent-header">
          <BrandMark className="nav-logo-text" to={logoTo} />
          <button
            type="button"
            className="icon-circle recent-menu unread-badge-anchor"
            aria-label={t('common.menuMore', TEXT.moreMenu)}
            ref={menuAnchorRef}
            onClick={toggleMenuAuthModal}
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

        <section className="recent-hero">
          <div className="recent-hero-left">
            <button type="button" className="recent-back" aria-label={t('favorites.back', TEXT.backToFavorites)} onClick={handleBack}>
              <FiChevronLeft size={20} />
            </button>
            <div className="recent-hero-text">
              <h1>{t('recent.title', TEXT.heroTitle)}</h1>
              <p className="recent-hero-sub">{heroCopy}</p>
            </div>
          </div>
          <button
            type="button"
            className="recent-edit-link recent-hero-edit"
            onClick={() => setEditMode((value) => !value)}
          >
            {editMode ? t('common.done', TEXT.done) : t('recent.edit', TEXT.edit)}
          </button>
        </section>

        {errorMessage ? <div className="recent-alert">{errorMessage}</div> : null}

        {!loading && !errorMessage && sections.length === 0 ? (
          <section className="recent-empty" aria-live="polite">
            {emptyCopy}
          </section>
        ) : null}

        <section className="recent-sections">
          {sections.map((section) => (
            <div className="recent-section" key={section.id}>
              <div className="recent-section-head">
                <div className="recent-date">{section.dateLabel}</div>
              </div>
              <div className="recent-grid" role="list">
                {section.visits.map((visit) => {
                  const cardData = preferredRole === 'mentor'
                    ? buildMentorCardData(visit)
                    : buildStudentCardData(visit);
                  const isDeleting = deletingIds.has(visit.id);

                  return (
                    <div
                      className={`recent-card-shell ${editMode ? 'is-editing' : ''} ${isDeleting ? 'is-deleting' : ''}`}
                      key={visit.id}
                      role="listitem"
                    >
                      {editMode ? (
                        <button
                          type="button"
                          className="recent-edit-remove"
                          aria-label={t('recent.removeRecord', TEXT.removeRecord)}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(visit.id);
                          }}
                        >
                          <span className="recent-edit-remove-icon" aria-hidden="true" />
                        </button>
                      ) : null}

                      {preferredRole === 'mentor' ? (
                        <MentorListingCard
                          data={cardData}
                          favoriteRole="mentor"
                          favoriteItemType="student_request"
                          favoriteItemId={visit?.itemId}
                          initialFavorited={favoriteIds.has(String(visit?.itemId))}
                          onFavoriteChange={(itemId, favorited) => {
                            setFavoriteIds((prev) => {
                              const next = new Set(prev);
                              if (favorited) next.add(String(itemId));
                              else next.delete(String(itemId));
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <StudentListingCard
                          data={cardData}
                          favoriteRole="student"
                          favoriteItemType="tutor"
                          favoriteItemId={visit?.itemId}
                          initialFavorited={favoriteIds.has(String(visit?.itemId))}
                          onFavoriteChange={(itemId, favorited) => {
                            setFavoriteIds((prev) => {
                              const next = new Set(prev);
                              if (favorited) next.add(String(itemId));
                              else next.delete(String(itemId));
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {(loading || loadingMore) && !errorMessage ? (
          <div className="recent-loading-more" aria-live="polite">
            {t('common.loading', TEXT.loading)}
          </div>
        ) : null}

        <div ref={sentinelRef} className="recent-sentinel" aria-hidden="true" />
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

      {showMentorAuth ? (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      ) : null}
    </div>
  );
}

export default RecentVisitsPage;
