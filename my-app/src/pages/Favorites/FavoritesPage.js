import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaHeart } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import { fetchFavoriteCollections, createFavoriteCollection, deleteFavoriteCollection } from '../../api/favorites';
import tutor1 from '../../assets/images/tutor1.jpg';
import tutor2 from '../../assets/images/tutor2.jpg';
import tutor3 from '../../assets/images/tutor3.jpg';
import tutor4 from '../../assets/images/tutor4.jpg';
import tutor5 from '../../assets/images/tutor5.jpg';
import tutor6 from '../../assets/images/tutor6.jpg';
import './FavoritesPage.css';

const COVER_POOL = [tutor1, tutor2, tutor3, tutor4, tutor5, tutor6];

const RECENT_COLLECTION = {
  id: 'recent',
  title: '最近浏览',
  meta: '今天',
  description: '你最近查看的收藏会暂时保留在这里，方便随时回到上次的位置。',
  images: [tutor1, tutor2, tutor3, tutor4],
};



const buildCover = (seed = 0) => {
  const covers = [];
  for (let i = 0; i < 4; i += 1) {
    covers.push(COVER_POOL[(seed + i) % COVER_POOL.length]);
  }
  return covers;
};

const formatCreatedAt = (value) => {
  if (!value) return '新建收藏夹';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '新建收藏夹';
  return `创建于 ${d.toLocaleDateString()}`;
};

function FavoritesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [userCollections, setUserCollections] = useState([]);
  const [recentVisitLabel] = useState(RECENT_COLLECTION.meta || '今天');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return !!localStorage.getItem('authToken'); } catch { return false; }
  });
  const menuAnchorRef = useRef(null);

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

    try {
      const raw = localStorage.getItem('authUser');
      const user = raw ? JSON.parse(raw) : {};
      return user?.role === 'mentor' ? 'mentor' : 'student';
    } catch {
      return 'student';
    }
  }, [location.search, location.state]);

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
        try { setIsLoggedIn(!!localStorage.getItem('authToken')); } catch {}
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
    ? '导师收藏与学生收藏完全独立，可在此建立你的学生收藏夹。'
    : '学生收藏与导师收藏互不干扰，按方向或目标建立你的导师收藏夹。';

  const requireAuth = useCallback(() => {
    if (isLoggedIn) return true;
    if (preferredRole === 'mentor') {
      setShowMentorAuth(true);
    } else {
      setShowStudentAuth(true);
    }
    return false;
  }, [isLoggedIn, preferredRole]);

  const loadCollections = useCallback(async () => {
    if (!isLoggedIn) {
      setUserCollections([]);
      setErrorMessage('请登录后查看收藏夹');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetchFavoriteCollections(preferredRole);
      const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
      setUserCollections(list);
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error;
      if (status === 401) {
        setErrorMessage('请登录后查看收藏夹');
      } else if (status === 403) {
        setErrorMessage(msg || '当前身份暂无权限访问收藏夹');
      } else {
        setErrorMessage(msg || '加载收藏夹失败，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, preferredRole]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const normalizedCollections = useMemo(() => {
    const source = Array.isArray(RECENT_COLLECTION.images) && RECENT_COLLECTION.images.length > 0
      ? RECENT_COLLECTION.images
      : COVER_POOL;
    const filled = [...source];
    while (filled.length < 4) {
      filled.push(source[filled.length % source.length]);
    }
    const recentCard = {
      id: RECENT_COLLECTION.id,
      title: RECENT_COLLECTION.title,
      cover: filled.slice(0, 4),
      metaText: `${recentVisitLabel}`,
      isRecent: true,
    };

    const mapped = userCollections.map((item, idx) => ({
      isDefault: !!item.isDefault,
      id: item.id,
      title: item.name,
      cover: buildCover(item.id || idx),
      metaText: item.isDefault ? '系统默认' : formatCreatedAt(item.createdAt),
      isRecent: false,
    }));

    return [recentCard, ...mapped];
  }, [recentVisitLabel, userCollections]);

  const logoTo = preferredRole === 'mentor' ? '/mentor' : '/student';
  const createDesc = preferredRole === 'mentor'
    ? '按课程方向、学生特点或目标，整理出你的学生收藏分组。'
    : '按课程方向、导师风格或目标，整理出你的导师收藏分组。';

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
        closeDeleteModal();
      })
      .catch((e) => {
        const msg = e?.response?.data?.error || '删除失败，请稍后再试';
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
      setCreateError('请填写收藏夹名称');
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
      }
      closeCreateModal();
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || '创建失败，请稍后再试';
      if (status === 401) {
        setCreateError('请登录后再创建收藏夹');
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
            className="icon-circle favorites-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => {
              if (preferredRole === 'mentor') {
                setShowMentorAuth(true);
              } else {
                setShowStudentAuth(true);
              }
            }}
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
          </button>
        </header>

        <section className="favorites-hero">
          <h1>收藏</h1>
          <p>{heroCopy}</p>
        </section>

        {errorMessage && <div className="favorites-alert">{errorMessage}</div>}
        {loading && <p className="favorites-hint">加载中...</p>}

        <section className="favorites-grid">
          {normalizedCollections.map((item) => {
            const isRecent = item.isRecent;
            const isDefault = !!item.isDefault;
            const cardClass = `favorites-card ${isRecent ? 'favorites-card--highlight' : 'favorites-card--removable'}`;
            return (
              <article
                key={item.id}
                className={cardClass}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isRecent) {
                    navigate('/student/recent-visits', { state: { from: preferredRole, fromRole: preferredRole } });
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
                    navigate('/student/recent-visits', { state: { from: preferredRole, fromRole: preferredRole } });
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
                      aria-label="移除收藏"
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
                  <div className="cover-grid">
                    {item.cover.map((src, idx) => (
                      <div key={idx} className={`cover-cell cover-cell-${idx}`}>
                        <img src={src} alt={`${item.title} 封面 ${idx + 1}`} />
                      </div>
                    ))}
                  </div>
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
            <h3>创建新的收藏夹</h3>
            <p className="favorites-desc">{createDesc}</p>
            <button
              type="button"
              className="create-btn"
              onClick={openCreateModal}
            >
              新建收藏
            </button>
          </article>
        </section>
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
              aria-label="关闭"
              onClick={closeDeleteModal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="favorites-modal-body">
              <h3 id="delete-title">删除此收藏夹？</h3>
              <p id="delete-desc">
                「{pendingDelete?.title ?? ''}」将被永久删除。
              </p>
            </div>

            <div className="favorites-modal-footer">
              <button type="button" className="favorites-btn ghost" onClick={closeDeleteModal}>取消</button>
              <button
                type="button"
                className="favorites-btn danger"
                onClick={handleDeleteConfirm}
                disabled={deletingId === pendingDelete?.id}
              >
                {deletingId === pendingDelete?.id ? '删除中...' : '删除'}
              </button>
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
              aria-label="关闭"
              onClick={closeCreateModal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="favorites-modal-body">
              <h3 id="create-title">新建收藏夹</h3>
              <input
                type="text"
                className="favorites-input"
                placeholder="名称"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
              />
              {createError && <p className="favorites-inline-error">{createError}</p>}
            </div>

            <div className="favorites-modal-footer">
              <button type="button" className="favorites-btn ghost" onClick={closeCreateModal}>取消</button>
              <button
                type="button"
                className="favorites-btn danger"
                onClick={handleCreateConfirm}
                disabled={creating}
              >
                {creating ? '创建中...' : '创建'}
              </button>
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
