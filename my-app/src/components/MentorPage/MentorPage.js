import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MentorNavbar from '../Navbar/MentorNavbar';
import CategoryFilters from '../CategoryFilters/CategoryFilters';
import MentorListings from '../Listings/MentorListings';
import api from '../../api/client';
import './MentorPage.css';

function MentorPage() {
  const [status, setStatus] = useState('loading'); // loading | ok | unauthenticated | forbidden | pending | error
  const [cards, setCards] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const askedLoginRef = useRef(false);

  const currentPath = useMemo(() => {
    try {
      const { pathname, search, hash } = window.location;
      return `${pathname}${search || ''}${hash || ''}`;
    } catch {
      return location?.pathname || '/mentor';
    }
  }, [location]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api.get('/api/mentor/cards');
        if (!alive) return;
        setCards(Array.isArray(res.data?.cards) ? res.data.cards : []);
        setStatus('ok');
      } catch (e) {
        if (!alive) return;
        const status = e?.response?.status;
        if (status === 401) {
          setStatus('unauthenticated');
          // remember intended url for post-login redirect
          try { sessionStorage.setItem('postLoginRedirect', currentPath); } catch {}
          try { sessionStorage.setItem('requiredRole', 'mentor'); } catch {}
          // put state.from in history state
          try { navigate('/mentor', { replace: true, state: { from: currentPath } }); } catch {}
          // prompt login dialog (global event for navbars)
          if (!askedLoginRef.current) {
            askedLoginRef.current = true;
            try { window.dispatchEvent(new CustomEvent('auth:login-required', { detail: { from: currentPath } })); } catch {}
          }
          return;
        }
        if (status === 403) {
          const msg = e?.response?.data?.error || '';
          if (msg && (msg.includes('审核') || msg.toLowerCase().includes('pending'))) {
            setStatus('pending');
          } else {
            setStatus('forbidden');
          }
          return;
        }
        setStatus('error');
      }
    }

    load();
    return () => { alive = false; };
  }, [currentPath, navigate]);

  return (
    <div className="app">
      <MentorNavbar />
      <CategoryFilters />

      {status === 'ok' && (
        <MentorListings data={cards} />
      )}

      {status === 'forbidden' && (
        <div className="container" style={{ padding: '40px 0', textAlign: 'center', color: '#374151' }}>
          仅导师可访问，请用导师身份登录/注册
        </div>
      )}

      {status === 'pending' && (
        <div className="container mentor-pending-wrap">
          <div className="mentor-pending">
            <svg className="mentor-pending-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 2h12v2l-4 4 4 4v2H6v-2l4-4-4-4V2z" />
              <path d="M8 20h8" />
            </svg>
            <div className="mentor-pending-title">审核中</div>
          </div>
        </div>
      )}

      {(status === 'loading') && (
        <MentorListings data={null} />
      )}
    </div>
  );
}

export default MentorPage;
