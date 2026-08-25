import { useCallback, useEffect, useState } from 'react';
import api from '../../api/client';
import { getAuthToken } from '../../utils/authStorage';
import MentorContractModal from '../../pages/MentorContract/MentorContractModal';

function MentorContractGate() {
  const [authVersion, setAuthVersion] = useState(0);
  const [status, setStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const loadStatus = useCallback(async ({ openRequested = false } = {}) => {
    if (!getAuthToken()) return null;
    const response = await api.get('/api/mentor-contracts/status');
    const next = response?.data || {};
    setStatus(next);
    if (openRequested || (next.approved && next.requiresSignature && !dismissed)) setModalOpen(true);
    return next;
  }, [dismissed]);

  useEffect(() => {
    const refresh = () => {
      setDismissed(false);
      setAuthVersion((value) => value + 1);
    };
    const openContract = () => {
      setDismissed(false);
      void loadStatus({ openRequested: true }).catch((error) => {
        const responseStatus = error?.response?.status;
        if (responseStatus !== 401 && responseStatus !== 403) console.error('Mentor contract open error:', error);
      });
    };
    window.addEventListener('auth:changed', refresh);
    window.addEventListener('mentor-contract:signed', refresh);
    window.addEventListener('mentor-contract:open', openContract);
    return () => {
      window.removeEventListener('auth:changed', refresh);
      window.removeEventListener('mentor-contract:signed', refresh);
      window.removeEventListener('mentor-contract:open', openContract);
    };
  }, [loadStatus]);

  useEffect(() => {
    let active = true;
    if (!getAuthToken()) return () => { active = false; };
    (async () => {
      try {
        const next = await loadStatus();
        if (!active || !next) return;
      } catch (error) {
        const status = error?.response?.status;
        if (status !== 401 && status !== 403) {
          console.error('Mentor contract gate error:', error);
        }
      }
    })();
    return () => { active = false; };
  }, [authVersion, loadStatus]);

  if (!modalOpen) return null;
  return (
    <MentorContractModal
      initialStatus={status}
      onStatusChange={setStatus}
      onClose={() => {
        setModalOpen(false);
        setDismissed(true);
      }}
    />
  );
}

export default MentorContractGate;
