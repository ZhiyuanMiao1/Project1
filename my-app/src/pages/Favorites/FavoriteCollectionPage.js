import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import {
  deleteFavoriteItem,
  fetchFavoriteCollections,
  fetchFavoriteItems,
  moveFavoriteItems,
} from '../../api/favorites';
import '../RecentVisits/RecentVisitsPage.css';
import './FavoriteCollectionPage.css';

function FavoriteCollectionPage() {
  const { collectionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const menuAnchorRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState(() => new Set());
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
  const [bulkWorking, setBulkWorking] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [collectionsError, setCollectionsError] = useState('');
  const [moveSelectOpen, setMoveSelectOpen] = useState(false);
  const moveSelectButtonRef = useRef(null);
  const moveSelectListRef = useRef(null);

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

  useEffect(() => {
    if (moveModalOpen) return;
    setMoveSelectOpen(false);
  }, [moveModalOpen]);

  useEffect(() => {
    if (!moveSelectOpen) return;
    const onDoc = (event) => {
      const btn = moveSelectButtonRef.current;
      const list = moveSelectListRef.current;
      if (btn && btn.contains(event.target)) return;
      if (list && list.contains(event.target)) return;
      setMoveSelectOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [moveSelectOpen]);

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

  const selectedCount = selectedEntryIds.size;
  const moveTargets = useMemo(
    () => (collections || []).filter((c) => Number(c?.id) !== Number(numericCollectionId)),
    [collections, numericCollectionId],
  );
  const hasMoveTargets = moveTargets.length > 0;
  const moveTargetLabel = useMemo(() => {
    const id = Number(moveTargetId);
    if (!Number.isFinite(id) || id <= 0) return '';
    return moveTargets.find((c) => Number(c?.id) === id)?.name || '';
  }, [moveTargets, moveTargetId]);

  useEffect(() => {
    if (!multiSelectMode) return;
    const aliveIds = new Set(items.map((it) => it?.id).filter((v) => typeof v === 'number' || typeof v === 'string').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0));
    setSelectedEntryIds((prev) => {
      if (!prev?.size) return prev;
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (aliveIds.has(Number(id))) next.add(Number(id));
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items, multiSelectMode]);

  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedEntryIds(new Set());
    setMoveModalOpen(false);
    setMoveSelectOpen(false);
    setMoveTargetId('');
    setCollectionsError('');
  };

  const toggleMultiSelect = () => {
    if (multiSelectMode) {
      exitMultiSelect();
    } else {
      setMultiSelectMode(true);
    }
  };

  const toggleSelected = (entryId) => {
    const id = Number(entryId);
    if (!Number.isFinite(id) || id <= 0) return;
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ensureCollectionsLoaded = async () => {
    if (!isLoggedIn) {
      openAuthModal();
      return false;
    }
    if (collectionsLoading) return false;
    setCollectionsLoading(true);
    setCollectionsError('');
    try {
      const res = await fetchFavoriteCollections(preferredRole);
      const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
      setCollections(list);
      setCollectionsLoaded(true);
      return true;
    } catch (e) {
      const msg = e?.response?.data?.error || '加载收藏夹失败，请稍后再试';
      setCollectionsError(msg);
      setCollections([]);
      setCollectionsLoaded(true);
      return false;
    } finally {
      setCollectionsLoading(false);
    }
  };

  const openMoveModal = async () => {
    if (!multiSelectMode || selectedCount === 0) return;
    setMoveSelectOpen(false);
    setCollectionsLoaded(false);
    setMoveTargetId('');
    setMoveModalOpen(true);
    await ensureCollectionsLoaded();
  };

  const bulkUnfavorite = async () => {
    if (!multiSelectMode || selectedCount === 0) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }
    if (bulkWorking) return;

    const ids = Array.from(selectedEntryIds).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return;

    setBulkWorking(true);
    const results = await Promise.allSettled(ids.map((id) => deleteFavoriteItem(id)));
    const succeeded = [];
    let failed = 0;
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') succeeded.push(ids[idx]);
      else failed += 1;
    });

    if (succeeded.length) {
      const succeededSet = new Set(succeeded);
      setItems((prev) => prev.filter((it) => !succeededSet.has(Number(it?.id))));
      setSelectedEntryIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((id) => next.delete(id));
        return next;
      });
    }

    setBulkWorking(false);
    if (failed) alert(`有 ${failed} 项取消收藏失败，请稍后重试`);
  };

  const confirmMove = async () => {
    if (!moveModalOpen) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }
    const targetIdNum = Number(moveTargetId);
    if (!Number.isFinite(targetIdNum) || targetIdNum <= 0) {
      setCollectionsError('请选择目标收藏夹');
      return;
    }
    if (numericCollectionId && targetIdNum === numericCollectionId) {
      setMoveModalOpen(false);
      setMoveTargetId('');
      return;
    }
    if (bulkWorking) return;

    const ids = Array.from(selectedEntryIds).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return;

    setBulkWorking(true);
    try {
      await moveFavoriteItems({ role: preferredRole, itemIds: ids, targetCollectionId: targetIdNum });
      const movedSet = new Set(ids);
      setItems((prev) => prev.filter((it) => !movedSet.has(Number(it?.id))));
      setSelectedEntryIds(new Set());
      setMoveModalOpen(false);
      setMoveTargetId('');
    } catch (e) {
      const msg = e?.response?.data?.error || '移动失败，请稍后再试';
      setCollectionsError(msg);
    } finally {
      setBulkWorking(false);
    }
  };

  const handleMoveSelectKeyDown = (event) => {
    if (event.key === 'Escape') {
      setMoveSelectOpen(false);
      return;
    }
    if (!moveSelectOpen && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (!bulkWorking) setMoveSelectOpen(true);
      return;
    }
    if (!moveSelectOpen) return;

    const ids = ['', ...moveTargets.map((c) => String(c.id))];
    const cur = ids.indexOf(String(moveTargetId));
    const curIdx = cur >= 0 ? cur : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = ids[Math.min(ids.length - 1, curIdx + 1)];
      setMoveTargetId(next);
      setCollectionsError('');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = ids[Math.max(0, curIdx - 1)];
      setMoveTargetId(next);
      setCollectionsError('');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setMoveSelectOpen(false);
    }
  };

  return (
    <div className={`recent-page favorite-detail-page ${multiSelectMode ? 'is-multi-select' : ''}`}>
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
            onClick={toggleMultiSelect}
          >
            {multiSelectMode ? '完成' : '多选'}
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
              const selected = multiSelectMode && selectedEntryIds.has(Number(entryId));
              return (
              <div
                className={`recent-card-shell favorite-card-shell ${multiSelectMode ? 'is-multi' : ''} ${selected ? 'is-selected' : ''}`}
                key={entryId || card?.id}
                role="listitem"
              >
                {multiSelectMode && (
                  <button
                    type="button"
                    className="favorite-multi-overlay"
                    aria-label={selected ? '取消选中' : '选中'}
                    aria-pressed={selected}
                    onClick={() => toggleSelected(entryId)}
                  >
                    <span className={`favorite-multi-check ${selected ? 'is-selected' : ''}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16" focusable="false" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
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

      {multiSelectMode && (
        <div className="favorite-bulk-bar" role="region" aria-label="批量操作">
          <div className="favorite-bulk-bar-inner">
            <div className="favorite-bulk-count">
              已选 {selectedCount} 项
            </div>
            <div className="favorite-bulk-actions">
              <button
                type="button"
                className="favorite-bulk-btn ghost"
                onClick={bulkUnfavorite}
                disabled={selectedCount === 0 || bulkWorking}
              >
                {bulkWorking ? '处理中...' : '取消收藏'}
              </button>
              <button
                type="button"
                className="favorite-bulk-btn primary"
                onClick={openMoveModal}
                disabled={selectedCount === 0 || bulkWorking}
              >
                移动到...
              </button>
            </div>
          </div>
        </div>
      )}

      {moveModalOpen && (
        <div
          className="favorite-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (bulkWorking) return;
            setMoveModalOpen(false);
            setMoveSelectOpen(false);
            setMoveTargetId('');
            setCollectionsError('');
          }}
        >
          <div
            className="favorite-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="favorite-modal-close"
              aria-label="关闭"
              onClick={() => {
                if (bulkWorking) return;
                setMoveModalOpen(false);
                setMoveSelectOpen(false);
                setMoveTargetId('');
                setCollectionsError('');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="favorite-modal-body">
              <h3 id="move-title">移动到收藏夹</h3>
              {(collectionsLoading || !collectionsLoaded) ? (
                <p className="favorite-modal-hint">加载中...</p>
              ) : (
                <>
                  {!hasMoveTargets ? (
                    <p className="favorite-modal-hint">
                      暂无其它收藏夹，请先返回收藏页新建。
                    </p>
                  ) : (
                    <div className="favorite-select" data-open={moveSelectOpen ? 'true' : 'false'}>
                      <button
                        type="button"
                        className="favorite-select__button"
                        aria-haspopup="listbox"
                        aria-expanded={moveSelectOpen}
                        ref={moveSelectButtonRef}
                        onClick={() => {
                          if (bulkWorking) return;
                          setMoveSelectOpen((v) => !v);
                        }}
                        onKeyDown={handleMoveSelectKeyDown}
                      >
                        <span className="favorite-select__label">{moveTargetLabel || '请选择'}</span>
                        <span className="favorite-select__caret" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                      {moveSelectOpen && (
                        <div className="favorite-select__popover">
                          <ul ref={moveSelectListRef} role="listbox" className="favorite-select__list" aria-label="选择收藏夹">
                            <li
                              role="option"
                              aria-selected={!moveTargetId}
                              className={`favorite-select__option ${!moveTargetId ? 'selected' : ''}`}
                              onClick={() => {
                                setMoveTargetId('');
                                setCollectionsError('');
                                setMoveSelectOpen(false);
                              }}
                            >
                              请选择
                            </li>
                            {moveTargets.map((c) => {
                              const selected = String(c.id) === String(moveTargetId);
                              return (
                                <li
                                  key={c.id}
                                  role="option"
                                  aria-selected={selected}
                                  className={`favorite-select__option ${selected ? 'selected' : ''}`}
                                  onClick={() => {
                                    setMoveTargetId(String(c.id));
                                    setCollectionsError('');
                                    setMoveSelectOpen(false);
                                  }}
                                >
                                  {c.name}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {collectionsError && (
                    <p className="favorite-modal-error">{collectionsError}</p>
                  )}
                </>
              )}
            </div>

            <div className="favorite-modal-footer">
              <button
                type="button"
                className="favorite-bulk-btn ghost"
                onClick={() => {
                  if (bulkWorking) return;
                  setMoveModalOpen(false);
                  setMoveSelectOpen(false);
                  setMoveTargetId('');
                  setCollectionsError('');
                }}
                disabled={bulkWorking}
              >
                取消
              </button>
              <button
                type="button"
                className="favorite-bulk-btn primary"
                onClick={confirmMove}
                disabled={bulkWorking || collectionsLoading || !collectionsLoaded || !hasMoveTargets}
              >
                {bulkWorking ? '移动中...' : '移动'}
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

export default FavoriteCollectionPage;
