import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function MentorContractPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/mentor', { replace: true });
    window.setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('mentor-contract:open')); } catch {}
    }, 0);
  }, [navigate]);

  return null;
}

export default MentorContractPage;
