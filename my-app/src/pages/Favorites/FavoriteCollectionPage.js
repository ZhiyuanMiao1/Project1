import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import { deleteFavoriteItem, fetchFavoriteItems } from '../../api/favorites';
import '../RecentVisits/RecentVisitsPage.css';

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [removingId, setRemovingId] = useState(null);

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

  const numericCollectionId = useMemo(() => {
    const n = Number(collectionId);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [collectionId]);

  const collectionTitle = location.state?.title
    || location.state?.name
    || location.state?.collectionName
    || (collectionId === 'recent' ? '最近浏览' : '收藏夹');

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setItems([]);
      setErrorMessage('请登录后查看收藏');
      return () => { alive = false; };
    }
    if (!numericCollectionId) {
      setItems([]);
      setErrorMessage('收藏夹ID无效');
      return () => { alive = false; };
    }

    setLoading(true);
    setErrorMessage('');
    fetchFavoriteItems({ role: preferredRole, collectionId: numericCollectionId })
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data?.items) ? res.data.items : [];
        setItems(list);
      })
      .catch((e) => {
        if (!alive) return;
        const status = e?.response?.status;
        const msg = e?.response?.data?.error;
        if (status === 401) {
          setErrorMessage('请登录后查看收藏');
        } else if (status === 403) {
          setErrorMessage(msg || '当前身份暂无权限访问该收藏夹');
        } else if (status === 404) {
          setErrorMessage(msg || '未找到该收藏夹');
        } else {
          setErrorMessage(msg || '加载失败，请稍后再试');
        }
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => { alive = false; };
  }, [isLoggedIn, preferredRole, numericCollectionId]);

  const removeItem = async (entryId) => {
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }
    setRemovingId(entryId);
    try {
      await deleteFavoriteItem(entryId);
      setItems((prev) => prev.filter((it) => it.id !== entryId));
    } catch (e) {
      const msg = e?.response?.data?.error || '移除失败，请稍后再试';
      alert(msg);
    } finally {
      setRemovingId(null);
    }
  };

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

        {errorMessage && (
          <div
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#991b1b',
              fontSize: 14,
            }}
          >
            {errorMessage}
          </div>
        )}
        {loading && (
          <p style={{ margin: '0 0 12px', color: '#64748b' }}>
            加载中...
          </p>
        )}

        <section className="recent-sections favorite-detail-sections">
          <div className="recent-grid" role="list">
            {!loading && !errorMessage && items.length === 0 && (
              <p style={{ margin: 0, color: '#64748b' }}>
                暂无收藏
              </p>
            )}

            {items.map((item) => {
              const card = (item && typeof item.payload === 'object' && item.payload) ? item.payload : { id: item?.itemId };
              const entryId = item?.id;
              return (
              <div
                className={`recent-card-shell ${editMode ? 'is-editing' : ''}`}
                key={entryId || card?.id}
                role="listitem"
              >
                {editMode && (
                  <button
                    type="button"
                    className="recent-edit-remove"
                    aria-label="移除此记录"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!entryId) return;
                      removeItem(entryId);
                    }}
                    disabled={removingId === entryId}
                  >
                    <span className="recent-edit-remove-icon" aria-hidden="true" />
                  </button>
                )}
                {preferredRole === 'mentor' ? (
                  <MentorListingCard
                    data={card}
                    favoriteRole={preferredRole}
                    favoriteItemType={item?.itemType}
                    favoriteItemId={item?.itemId}
                    initialFavorited
                    onFavoriteChange={(_itemId, favorited) => {
                      if (favorited) return;
                      if (!entryId) return;
                      setItems((prev) => prev.filter((it) => it.id !== entryId));
                    }}
                  />
                ) : (
                  <StudentListingCard
                    data={card}
                    favoriteRole={preferredRole}
                    favoriteItemType={item?.itemType}
                    favoriteItemId={item?.itemId}
                    initialFavorited
                    onFavoriteChange={(_itemId, favorited) => {
                      if (favorited) return;
                      if (!entryId) return;
                      setItems((prev) => prev.filter((it) => it.id !== entryId));
                    }}
                  />
                )}
              </div>
              );
            })}
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
