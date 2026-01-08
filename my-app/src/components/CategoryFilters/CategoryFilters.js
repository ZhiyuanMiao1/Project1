import React, { useRef, useEffect, useState } from 'react';
import './CategoryFilters.css';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';
import { DIRECTION_OPTIONS, DIRECTION_ICON_MAP } from '../../constants/courseMappings';
import { fetchHomeCourseOrder, saveHomeCourseOrder } from '../../api/account';
import { HOME_COURSE_ORDER_EVENT, normalizeHomeCourseOrderIds } from '../../utils/homeCourseOrder';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';

const DEFAULT_HOME_COURSE_ORDER_IDS = DIRECTION_OPTIONS.map((opt) => opt.id);
const DIRECTION_OPTION_BY_ID = new Map(DIRECTION_OPTIONS.map((opt) => [opt.id, opt]));

const STUDENT_LISTINGS_CATEGORY_EVENT = 'student:listings-category';

function CategoryFilters({ eventName = STUDENT_LISTINGS_CATEGORY_EVENT } = {}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false); // 控制左侧按钮
  const [showRightArrow, setShowRightArrow] = useState(true); // 控制右侧按钮
  const [homeCourseOrderIds, setHomeCourseOrderIds] = useState(() => [...DEFAULT_HOME_COURSE_ORDER_IDS]);
  const containerRef = useRef(null);

  useEffect(() => {
    let alive = true;

    const loadFromServer = async () => {
      const token = getAuthToken();

      if (!token) {
        if (alive) setHomeCourseOrderIds([...DEFAULT_HOME_COURSE_ORDER_IDS]);
        return;
      }

      try {
        const res = await fetchHomeCourseOrder();
        if (!alive) return;
        const orderIds = Array.isArray(res?.data?.orderIds) ? res.data.orderIds : null;
        if (orderIds) {
          setHomeCourseOrderIds(normalizeHomeCourseOrderIds(orderIds, DEFAULT_HOME_COURSE_ORDER_IDS));
          return;
        }

        const getAuthEmail = () => {
          const user = getAuthUser() || {};
          return typeof user?.email === 'string' ? user.email : '';
        };

        const tryReadLegacyOrder = (key) => {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        };

        const email = getAuthEmail();
        const legacyKeys = [];
        if (email && typeof email === 'string') {
          legacyKeys.push(`mx.homeCourseOrder:${email.trim().toLowerCase()}`);
        }
        legacyKeys.push('mx.homeCourseOrder:anonymous');

        let legacyOrderIds = null;
        for (const key of legacyKeys) {
          legacyOrderIds = tryReadLegacyOrder(key);
          if (legacyOrderIds) break;
        }

        if (!legacyOrderIds) {
          setHomeCourseOrderIds([...DEFAULT_HOME_COURSE_ORDER_IDS]);
          return;
        }

        const normalizedLegacy = normalizeHomeCourseOrderIds(legacyOrderIds, DEFAULT_HOME_COURSE_ORDER_IDS);
        setHomeCourseOrderIds(normalizedLegacy);

        try {
          const saved = await saveHomeCourseOrder(normalizedLegacy);
          if (!alive) return;
          const savedIds = Array.isArray(saved?.data?.orderIds) ? saved.data.orderIds : normalizedLegacy;
          setHomeCourseOrderIds(normalizeHomeCourseOrderIds(savedIds, DEFAULT_HOME_COURSE_ORDER_IDS));
          for (const key of legacyKeys) {
            try { localStorage.removeItem(key); } catch {}
          }
        } catch {
          if (!alive) return;
          setHomeCourseOrderIds(normalizedLegacy);
        }
      } catch {
        if (!alive) return;
        setHomeCourseOrderIds([...DEFAULT_HOME_COURSE_ORDER_IDS]);
      }
    };

    const onOrderChanged = (e) => {
      const next = e?.detail?.orderIds;
      if (Array.isArray(next)) {
        setHomeCourseOrderIds(normalizeHomeCourseOrderIds(next, DEFAULT_HOME_COURSE_ORDER_IDS));
        return;
      }
      loadFromServer();
    };

    const onAuthChanged = () => loadFromServer();
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === 'authToken') loadFromServer();
    };

    loadFromServer();
    window.addEventListener(HOME_COURSE_ORDER_EVENT, onOrderChanged);
    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      window.removeEventListener(HOME_COURSE_ORDER_EVENT, onOrderChanged);
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const categories = homeCourseOrderIds
    .map((id) => DIRECTION_OPTION_BY_ID.get(id))
    .filter(Boolean)
    .map((opt) => ({ id: opt.id, name: opt.label }));

  const scrollLeft = () => {
    if (containerRef.current) {
      // 可以根据实际需求调整滚动距离
      containerRef.current.scrollLeft -= 900;
    }
  };

  const scrollRight = () => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += 900;
    }
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;

      // 检查是否到达左侧或右侧
      setShowLeftArrow(scrollLeft > 0); // 如果滚动位置大于 0，显示左箭头
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth); // 如果还可以滚动，显示右箭头
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }

    // 清理事件监听器
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <div className="category-filters">
      {showLeftArrow && (
      <button className="arrow left" onClick={scrollLeft}>
        <IoIosArrowBack />
      </button>
      )}

      <div className="container category-container" ref={containerRef}>
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`category-item ${selectedCategoryId === cat.id ? 'selected' : ''}`}
            onClick={() => {
              // Toggle selection: click again to deselect
              setSelectedCategoryId((prev) => {
                const next = prev === cat.id ? null : cat.id;
                try {
                  window.dispatchEvent(new CustomEvent(eventName, { detail: { categoryId: next } }));
                } catch {}
                return next;
              });
            }}
          >
            <div className="category-icon">{(() => { const Icon = DIRECTION_ICON_MAP[cat.id]; return Icon ? <Icon /> : null; })()}</div>
            <div className="category-text">{cat.name}</div>
          </div>
        ))}
      </div>

      {showRightArrow && (
      <button className="arrow right" onClick={scrollRight}>
        <IoIosArrowForward />
      </button>
      )}
    </div>
  );
}

export default CategoryFilters;
