import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Legacy DOM-based schedule time-slot disabler disabled.
// The schedule page now handles timezone-aware disabling in React.
/*
// --- Global helper: disable past time slots for 'today' ---
// This observes the schedule UI and toggles disabled state + class on time-slot buttons.
(function setupTimeSlotDisabler(){
  const computeNowMinutes = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

  const refresh = () => {
    try {
      // Detect if today is the selected day in the right-side calendar
      const rightPanel = document.querySelector('.schedule-right-panel');
      if (!rightPanel) return; // not on the schedule step

      const isTodaySelected = !!rightPanel.querySelector('.calendar-card .date-cell.selected.today');
      const list = rightPanel.querySelector('.times-list');
      if (!list) return;

      const nowMinutes = computeNowMinutes();
      const buttons = list.querySelectorAll('button.time-slot');
      buttons.forEach((btn) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!Number.isFinite(idx)) return;
        const shouldDisable = isTodaySelected && (idx * 15 < nowMinutes);
        if (shouldDisable) {
          if (!btn.disabled) btn.disabled = true;
          btn.classList.add('disabled');
        } else {
          if (btn.disabled) btn.disabled = false;
          btn.classList.remove('disabled');
        }
      });
    } catch (_) {}
  };

  const observer = new MutationObserver(refresh);
  const startObserver = () => {
    // 仅监听右侧日历面板（或根节点），不要监听 body 的 class 变化
    const container = document.querySelector('.schedule-right-panel') || document.getElementById('root');
    if (!container) return;
    observer.observe(container, { subtree: true, childList: true }); // 不监听 attributes
  };

  // Kick off
  window.addEventListener('load', () => {
    startObserver();
    refresh();
    // Also update periodically so slots flip as time passes
    setInterval(refresh, 30000);
  });
})();
*/
