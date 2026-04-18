import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaHeart } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import Button from '../../components/common/Button/Button';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import UnreadBadge from '../../components/common/UnreadBadge/UnreadBadge';
import { fetchFavoriteCollections, createFavoriteCollection, deleteFavoriteCollection, fetchFavoriteItems } from '../../api/favorites';
import { fetchRecentVisits } from '../../api/recentVisits';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';
import useMenuBadgeSummary from '../../hooks/useMenuBadgeSummary';
import { buildAvatarPlaceholderSrc } from '../../utils/avatarPlaceholder';
import { useI18n } from '../../i18n/language';
import './FavoritesPage.css';

const RECENT_COLLECTION = {
  id: 'recent',
  title: '最近浏览',
  meta: '今天',
  description: '你最近查看的收藏会暂时保留在这里，方便随时回到上次的位置',
  images: [],
};
const FAVORITES_SKELETON_CARDS = [0, 1, 2];

const getCoverImageUrl = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.imageUrl,
    payload.avatarUrl,
    payload.counterpartAvatarUrl,
    payload.studentAvatar,
    payload.mentorAvatar,
    payload.avatar_url,
    payload.photoUrl,
    payload.photo_url,
    payload.image,
    payload.avatar,
    payload.student?.imageUrl,
    payload.student?.avatarUrl,
    payload.student?.avatar_url,
    payload.mentor?.imageUrl,
    payload.mentor?.avatarUrl,
    payload.mentor?.avatar_url,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  const images = Array.isArray(payload.images) ? payload.images : [];
  const firstImage = images.find((img) => typeof img === 'string' && img.trim());
  return firstImage ? firstImage.trim() : null;
};

const getFallbackCoverImageUrl = (payload, seed = '', role = 'student') => {
  const fallbackId = [payload?.publicId, payload?.counterpartPublicId, payload?.studentId, payload?.mentorId, payload?.id]
    .map((value) => (value == null ? '' : String(value).trim()))
    .find(Boolean) || '';
  const roleAwareFallbackName = (() => {
    if (!fallbackId) return '';
    if (role !== 'mentor') return fallbackId;
    return /^[a-z]/i.test(fallbackId) ? fallbackId : `S${fallbackId}`;
  })();

  const displayName = ([
    payload?.name,
    payload?.displayName,
    payload?.mentorName,
    payload?.studentName,
    payload?.target,
    payload?.counterpart,
    payload?.publicId,
    payload?.counterpartPublicId,
    payload?.student?.name,
    payload?.student?.displayName,
    payload?.student?.publicId,
    payload?.mentor?.name,
    payload?.mentor?.displayName,
    payload?.mentor?.publicId,
    payload?.studentId,
  ].map((value) => (value == null ? '' : String(value).trim())).find(Boolean))
    || roleAwareFallbackName;
  const paletteSeed = [
    payload?.publicId,
    payload?.counterpartPublicId,
    payload?.student?.publicId,
    payload?.mentor?.publicId,
    payload?.studentId,
    payload?.mentorId,
    payload?.id,
    seed,
    displayName,
    'favorite-cover',
  ].map((value) => (value == null ? '' : String(value).trim())).find(Boolean) || 'favorite-cover';

  return buildAvatarPlaceholderSrc({
    name: displayName,
    seed: paletteSeed,
    size: 240,
    borderRadius: 0,
  });
};

const formatCreatedAt = (value, { language = 'zh-CN', t = (_key, fallback) => fallback } = {}) => {
  if (!value) return t('favorites.newCollection', '新建收藏夹');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return t('favorites.newCollection', '新建收藏夹');
  const date = d.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
  return t('favorites.createdAt', `创建于 ${date}`, { date });
};

const getRecentVisitMeta = (value, { language = 'zh-CN', t = (_key, fallback) => fallback } = {}) => {
  const d = new Date(value || '');
  if (Number.isNaN(d.getTime())) return t('favorites.noRecent', '\u6682\u65e0\u6700\u8fd1\u6d4f\u89c8');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - target) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return t('favorites.today', '\u4eca\u5929');
  if (diffDays === 1) return t('favorites.yesterday', '\u6628\u5929');
  return d.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' });
};

const normalizeRecentMetaText = (value, { t = (_key, fallback) => fallback } = {}) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return t('favorites.noRecent', '\u6682\u65e0\u6700\u8fd1\u6d4f\u89c8');
  if (/^(閺|鎏|鏆|鏈€|杩戞祻瑙)/.test(raw)) return t('favorites.noRecent', '\u6682\u65e0\u6700\u8fd1\u6d4f\u89c8');
  if (raw === '暂无最近浏览') return t('favorites.noRecent', '暂无最近浏览');
  if (/^(娴|浠)/.test(raw) || raw === '今天') return t('favorites.today', '\u4eca\u5929');
  if (/^(閺勩劌|鏄)/.test(raw) || raw === '昨天') return t('favorites.yesterday', '\u6628\u5929');
  return raw;
};

const normalizeCollectionTitle = (value, t = (_key, fallback) => fallback) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '最近浏览') return t('favorites.recent', '最近浏览');
  if (raw === '默认收藏夹') return t('favorites.defaultCollection', '默认收藏夹');
  if (raw === '默认 收藏夹') return t('favorites.defaultCollectionSpaced', '默认 收藏夹');
  return raw;
};

function FavoritesPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [userCollections, setUserCollections] = useState([]);
  const [collectionCovers, setCollectionCovers] = useState(() => ({}));
  const [recentVisitMetaLabel, setRecentVisitMetaLabel] = useState('\u6682\u65e0\u6700\u8fd1\u6d4f\u89c8');
  const [recentVisitCover, setRecentVisitCover] = useState([]);
  const recentVisitLabel = t('favorites.today', RECENT_COLLECTION.meta || '今天');
  const [loading, setLoading] = useState(() => !!getAuthToken());
  const [errorMessage, setErrorMessage] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const menuAnchorRef = useRef(null);
  const loadSeqRef = useRef(0);

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

    const fromState = location.state?.from;
    if (fromState === 'mentor' || fromState === 'student') return fromState;

    const user = getAuthUser() || {};
    return user?.role === 'mentor' ? 'mentor' : 'student';
  }, [location.search, location.state]);
  const { totalBadgeCount } = useMenuBadgeSummary({ enabled: isLoggedIn, courseViews: [preferredRole] });

  useEffect(() => {
    if (!preferredRole) return;
    try {
      sessionStorage.setItem('favorites:lastRole', preferredRole);
    } catch {}
  }, [preferredRole]);

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && (showDeleteModal || showCreateModal)) {
        setShowDeleteModal(false);
        setShowCreateModal(false);
        setPendingDelete(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDeleteModal, showCreateModal]);

  const heroCopy = preferredRole === 'mentor'
    ? t('favorites.heroMentor', '导师收藏与学生收藏完全独立，可在此建立你的学生收藏夹')
    : t('favorites.heroStudent', '学生收藏与导师收藏互不干扰，按方向或目标建立你的导师收藏夹');

  const requireAuth = useCallback(() => {
    if (isLoggedIn) return true;
    if (preferredRole === 'mentor') {
      setShowMentorAuth(true);
    } else {
      setShowStudentAuth(true);
    }
    return false;
  }, [isLoggedIn, preferredRole]);

  const toggleMenuAuthModal = () => {
    if (preferredRole === 'mentor') {
      setShowMentorAuth((prev) => !prev);
      return;
    }
    setShowStudentAuth((prev) => !prev);
  };

  const loadCollections = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    if (!isLoggedIn) {
      setUserCollections([]);
      setCollectionCovers({});
      setErrorMessage(t('favorites.loginRequiredCollections', '请登录后查看收藏夹'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchFavoriteCollections(preferredRole);
      const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
      const coverEntries = await Promise.all(
        list.map(async (collection) => {
          const collectionId = collection?.id;
          if (!collectionId) return [String(collectionId ?? ''), []];
          try {
            const itemsRes = await fetchFavoriteItems({ role: preferredRole, collectionId, limit: 4 });
            const items = Array.isArray(itemsRes?.data?.items) ? itemsRes.data.items : [];
            const cover = items
              .slice(0, 4)
              .map((item) => getCoverImageUrl(item?.payload) || getFallbackCoverImageUrl(item?.payload, collectionId, preferredRole));
            return [String(collectionId), cover];
          } catch {
            return [String(collectionId), []];
          }
        })
      );

      if (loadSeqRef.current !== seq) return;
      setUserCollections(list);
      setCollectionCovers(Object.fromEntries(coverEntries));
    } catch (e) {
      if (loadSeqRef.current !== seq) return;
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 401) {
        setErrorMessage(t('favorites.loginRequiredCollections', '请登录后查看收藏夹'));
      } else if (status === 403) {
        setErrorMessage(msg || t('favorites.noPermissionCollections', '当前身份暂无权限访问收藏夹'));
      } else {
        setErrorMessage(msg || t('favorites.loadCollectionsFailed', '加载收藏夹失败，请稍后再试'));
      }
      setUserCollections([]);
      setCollectionCovers({});
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  }, [isLoggedIn, preferredRole, t]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    let alive = true;

    if (!isLoggedIn) {
      setRecentVisitMetaLabel(recentVisitLabel);
      setRecentVisitCover([]);
      return () => { alive = false; };
    }

    fetchRecentVisits({ role: preferredRole, limit: 4, offset: 0 })
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data?.items) ? res.data.items : [];
        if (!list.length) {
          setRecentVisitMetaLabel(t('favorites.noRecent', '\u6682\u65e0\u6700\u8fd1\u6d4f\u89c8'));
          setRecentVisitCover([]);
          return;
        }

        const cover = list
          .map((item) => getCoverImageUrl(item?.payload) || getFallbackCoverImageUrl(item?.payload, item?.id, preferredRole))
          .slice(0, 4);
        const latestVisitedAt = list[0]?.visitedAt || list[0]?.updatedAt || list[0]?.createdAt;

        setRecentVisitMetaLabel(getRecentVisitMeta(latestVisitedAt, { language, t }));
        setRecentVisitCover(cover);
      })
      .catch(() => {
        if (!alive) return;
        setRecentVisitMetaLabel(recentVisitLabel);
        setRecentVisitCover([]);
      });

    return () => { alive = false; };
  }, [isLoggedIn, language, preferredRole, recentVisitLabel, t]);

  const normalizedCollections = useMemo(() => {
    const recentCard = {
      id: RECENT_COLLECTION.id,
      title: t('favorites.recent', RECENT_COLLECTION.title),
      cover: Array.isArray(recentVisitCover) ? recentVisitCover : [],
      metaText: normalizeRecentMetaText(recentVisitMetaLabel, { t }),
      isRecent: true,
    };

    const mapped = userCollections.map((item) => ({
      isDefault: !!item.isDefault,
      id: item.id,
      title: normalizeCollectionTitle(item.name, t),
      cover: Array.isArray(collectionCovers?.[String(item.id)]) ? collectionCovers[String(item.id)] : [],
      metaText: item.isDefault ? t('favorites.systemDefault', '系统默认') : formatCreatedAt(item.createdAt, { language, t }),
      isRecent: false,
    }));

    return [recentCard, ...mapped];
  }, [collectionCovers, language, recentVisitCover, recentVisitMetaLabel, t, userCollections]);

  const logoTo = preferredRole === 'mentor' ? '/mentor' : '/student';
  const createDesc = preferredRole === 'mentor'
    ? t('favorites.createStudentDesc', '按课程方向、学生特点或目标，整理出你的学生收藏分组')
    : t('favorites.createMentorDesc', '按课程方向、导师风格或目标，整理出你的导师收藏分组');
  const showGridSkeleton = loading && !errorMessage;

  const openDeleteModal = (item) => {
    if (!requireAuth()) return;
    setPendingDelete(item);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setPendingDelete(null);
  };

  const handleDeleteConfirm = () => {
    if (!pendingDelete) return;
    if (!requireAuth()) return;
    setDeletingId(pendingDelete.id);
    deleteFavoriteCollection(pendingDelete.id)
      .then(() => {
        setUserCollections((prev) => prev.filter((c) => c.id !== pendingDelete.id));
        setCollectionCovers((prev) => {
          const next = { ...(prev || {}) };
          delete next[String(pendingDelete.id)];
          return next;
        });
        closeDeleteModal();
      })
      .catch((e) => {
        const msg = e?.response?.data?.error || t('favorites.deleteFailed', '删除失败，请稍后再试');
        alert(msg); // 快速反馈给用户
      })
      .finally(() => setDeletingId(null));
  };

  const openCreateModal = () => {
    if (!requireAuth()) return;
    setCreateError('');
    setNewCollectionName('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewCollectionName('');
    setCreateError('');
  };

  const handleCreateConfirm = async () => {
    if (!newCollectionName.trim()) {
      setCreateError(t('favorites.nameRequired', '请填写收藏夹名称'));
      return;
    }
    if (!requireAuth()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await createFavoriteCollection(newCollectionName.trim(), preferredRole);
      const created = res?.data?.collection;
      if (created) {
        setUserCollections((prev) => [created, ...prev]);
        setCollectionCovers((prev) => ({ ...(prev || {}), [String(created.id)]: [] }));
      }
      closeCreateModal();
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || t('favorites.createFailed', '创建失败，请稍后再试');
      if (status === 401) {
        setCreateError(t('favorites.loginBeforeCreate', '请登录后再创建收藏夹'));
      } else if (status === 409) {
        setCreateError(msg);
      } else if (status === 403) {
        setCreateError(msg);
      } else {
        setCreateError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="favorites-page">
      <div className="container">
        <header className="favorites-header">
          <BrandMark className="nav-logo-text" to={logoTo} />
          <button
            type="button"
            className="icon-circle favorites-menu unread-badge-anchor"
            aria-label={t('common.menuMore', '更多菜单')}
            ref={menuAnchorRef}
            onClick={toggleMenuAuthModal}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8"  x2="20" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

        <section className="favorites-hero">
          <h1>{t('favorites.title', '收藏')}</h1>
          <p>{heroCopy}</p>
        </section>

        {errorMessage && <div className="favorites-alert">{errorMessage}</div>}

        {showGridSkeleton ? (
          <section className="favorites-grid favorites-grid--skeleton" aria-busy="true" aria-label={t('favorites.loadingCollections', '收藏夹加载中')}>
            <span className="favorites-sr-only">{t('favorites.loadingCollections', '收藏夹加载中')}</span>
            {FAVORITES_SKELETON_CARDS.map((item) => (
              <article key={`skeleton-card-${item}`} className="favorites-card favorites-card--skeleton" aria-hidden="true">
                <div className="favorites-cover favorites-cover--skeleton">
                  <div className="cover-grid cover-grid--skeleton" data-count="4">
                    {Array.from({ length: 4 }, (_, idx) => (
                      <div key={idx} className={`cover-cell cover-cell-${idx} cover-cell--skeleton`} />
                    ))}
                  </div>
                </div>
                <div className="favorites-card-body favorites-card-body--skeleton">
                  <span className="favorites-skeleton-line favorites-skeleton-line--title" />
                  <span className="favorites-skeleton-line favorites-skeleton-line--meta" />
                </div>
              </article>
            ))}

            <article className="favorites-card favorites-card--create favorites-card--skeleton favorites-card--skeleton-create" aria-hidden="true">
              <div className="favorites-skeleton-icon" />
              <span className="favorites-skeleton-line favorites-skeleton-line--title favorites-skeleton-line--create-title" />
              <span className="favorites-skeleton-line favorites-skeleton-line--desc" />
              <span className="favorites-skeleton-line favorites-skeleton-line--desc favorites-skeleton-line--desc-short" />
              <span className="favorites-skeleton-pill" />
            </article>
          </section>
        ) : (
          <section className="favorites-grid favorites-grid--loaded">
            {normalizedCollections.map((item) => {
              const isRecent = item.isRecent;
              const isDefault = !!item.isDefault;
              const cover = Array.isArray(item.cover) ? item.cover.slice(0, 4) : [];
              const coverCount = cover.length;
              const cardClass = `favorites-card ${isRecent ? 'favorites-card--highlight' : 'favorites-card--removable'}`;
              return (
                <article
                  key={item.id}
                  className={cardClass}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isRecent) {
                      navigate(`/student/recent-visits?role=${preferredRole}`, {
                        state: { from: preferredRole, fromRole: preferredRole },
                      });
                      return;
                    }
                    if (!requireAuth()) return;
                    const roleParam = preferredRole || 'student';
                    navigate(`/student/favorites/${item.id}?role=${roleParam}`, {
                      state: { title: item.title, from: roleParam, fromRole: roleParam },
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (isRecent) {
                      navigate(`/student/recent-visits?role=${preferredRole}`, {
                        state: { from: preferredRole, fromRole: preferredRole },
                      });
                      return;
                    }
                    if (!requireAuth()) return;
                    const roleParam = preferredRole || 'student';
                    navigate(`/student/favorites/${item.id}?role=${roleParam}`, {
                      state: { title: item.title, from: roleParam, fromRole: roleParam },
                    });
                  }}
                >
                  <div className="favorites-cover">
                    {!isRecent && !isDefault && (
                      <button
                        type="button"
                        className="favorites-remove"
                        aria-label={t('favorites.removeFavorite', '移除收藏')}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(item);
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                    {coverCount === 0 ? (
                      <div className="cover-empty" aria-label={t('favorites.emptyCollection', '空收藏夹')}>
                        <div className="cover-empty-icon" aria-hidden="true">
                          <svg className="cover-empty-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className="cover-grid" data-count={coverCount}>
                        {cover.map((src, idx) => (
                          <div key={idx} className={`cover-cell cover-cell-${idx}`}>
                            <img src={src} alt={t('favorites.coverAlt', `${item.title} 封面 ${idx + 1}`, { title: item.title, index: idx + 1 })} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="favorites-card-body">
                    <div className="favorites-card-title">
                      <h3>{item.title}</h3>
                    </div>
                    <div className="favorites-meta recent-meta">{item.metaText}</div>
                  </div>
                </article>
              );
            })}

            <article className="favorites-card favorites-card--create">
              <div className="create-icon">
                <FaHeart />
              </div>
              <h3>{t('favorites.createNewTitle', '创建新的收藏夹')}</h3>
              <p className="favorites-desc">{createDesc}</p>
              <button
                type="button"
                className="create-btn"
                onClick={openCreateModal}
              >
                {t('favorites.newFavorite', '新建收藏')}
              </button>
            </article>
          </section>
        )}
      </div>

      {showDeleteModal && (
        <div className="favorites-modal-backdrop" role="presentation" onClick={closeDeleteModal}>
          <div
            className="favorites-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="favorites-modal-close"
              aria-label={t('common.close', '关闭')}
              onClick={closeDeleteModal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="favorites-modal-body">
              <h3 id="delete-title">{t('favorites.deleteTitle', '删除此收藏夹？')}</h3>
              <p id="delete-desc">
                {t('favorites.deleteDesc', `「${pendingDelete?.title ?? ''}」将被永久删除`, { title: pendingDelete?.title ?? '' })}
              </p>
            </div>

            <div className="favorites-modal-footer">
              <Button className="favorites-btn ghost" onClick={closeDeleteModal}>{t('common.cancel', '取消')}</Button>
              <Button className="favorites-btn danger"
                onClick={handleDeleteConfirm}
                disabled={deletingId === pendingDelete?.id}
              >
                {deletingId === pendingDelete?.id ? t('common.deleting', '删除中...') : t('common.delete', '删除')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="favorites-modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div
            className="favorites-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            aria-describedby="create-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="favorites-modal-close"
              aria-label={t('common.close', '关闭')}
              onClick={closeCreateModal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="favorites-modal-body">
              <h3 id="create-title">{t('favorites.createTitle', '新建收藏夹')}</h3>
              <input
                type="text"
                className="favorites-input"
                placeholder={t('favorites.namePlaceholder', '名称')}
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
              />
              {createError && <p className="favorites-inline-error">{createError}</p>}
            </div>

            <div className="favorites-modal-footer">
              <Button className="favorites-btn ghost" onClick={closeCreateModal}>{t('common.cancel', '取消')}</Button>
              <Button className="favorites-btn danger"
                onClick={handleCreateConfirm}
                disabled={creating}
              >
                {creating ? t('common.creating', '创建中...') : t('common.create', '创建')}
              </Button>
            </div>
          </div>
        </div>
      )}

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

export default FavoritesPage;
