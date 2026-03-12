import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const isObjectLike = (value) => Boolean(value) && typeof value === 'object';
const isErrorLike = (value) => value instanceof Error;
const OPAQUE_RUNTIME_PLACEHOLDER = '[object Object]';
const hasOpaqueRuntimePlaceholder = (value) => safeText(value).includes(OPAQUE_RUNTIME_PLACEHOLDER);
const isOpaqueRuntimePlaceholder = (value) => safeText(value) === OPAQUE_RUNTIME_PLACEHOLDER;

const getRuntimeEventPayload = (event) => (
  typeof event?.error !== 'undefined'
    ? event.error
    : event?.reason
);

const isSuppressibleRuntimePayload = (value) => {
  if (typeof value === 'undefined' || value === null) return false;
  if (isErrorLike(value)) return hasOpaqueRuntimePlaceholder(value?.message);
  if (isObjectLike(value)) return true;
  if (typeof value === 'string') return true;
  return typeof value === 'number' || typeof value === 'boolean';
};

const getClassroomRuntimeGuard = () => {
  if (typeof window === 'undefined') return null;
  return window.__MENTORY_CLASSROOM_RUNTIME_GUARD__ || null;
};

const suppressClassroomOverlayRuntimeError = (error) => {
  const guard = getClassroomRuntimeGuard();
  if (!guard?.active || !guard?.suppressOpaqueRuntimeErrors) return false;

  const message = safeText(error?.message);
  const stack = safeText(error?.stack);
  const isOpaqueClassroomRuntimeError = hasOpaqueRuntimePlaceholder(message)
    || stack.includes('alivc-live-push.js');

  if (!isOpaqueClassroomRuntimeError) return false;

  try {
    guard.handleOpaqueRuntimeError?.({
      error,
      reason: error,
      message: message || OPAQUE_RUNTIME_PLACEHOLDER,
    });
  } catch {}
  return true;
};

const patchReactRefreshRuntimeOverlay = () => {
  if (typeof window === 'undefined') return false;
  const overlay = window.__react_refresh_error_overlay__;
  if (!overlay || overlay.__MENTORY_CLASSROOM_PATCHED__) return Boolean(overlay);
  if (typeof overlay.handleRuntimeError !== 'function') return false;

  const originalHandleRuntimeError = overlay.handleRuntimeError.bind(overlay);
  overlay.handleRuntimeError = (error) => {
    if (suppressClassroomOverlayRuntimeError(error)) return;
    originalHandleRuntimeError(error);
  };
  overlay.__MENTORY_CLASSROOM_PATCHED__ = true;
  return true;
};

const isOpaqueClassroomRuntimeEvent = (event) => {
  const guard = getClassroomRuntimeGuard();
  if (!guard?.active || !guard?.suppressOpaqueRuntimeErrors) return false;

  const rawPayload = getRuntimeEventPayload(event);
  if (isSuppressibleRuntimePayload(rawPayload)) return true;
  if (isOpaqueRuntimePlaceholder(rawPayload)) return true;
  return hasOpaqueRuntimePlaceholder(event?.message);
};

const forwardClassroomRuntimeEvent = (event) => {
  const guard = getClassroomRuntimeGuard();
  if (typeof guard?.handleOpaqueRuntimeError !== 'function') return;
  try {
    guard.handleOpaqueRuntimeError(event);
  } catch {}
};

if (typeof window !== 'undefined') {
  patchReactRefreshRuntimeOverlay();
  window.setTimeout(() => {
    patchReactRefreshRuntimeOverlay();
  }, 0);

  const handleClassroomOpaqueRuntimeEvent = (event) => {
    if (!isOpaqueClassroomRuntimeEvent(event)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    forwardClassroomRuntimeEvent(event);
  };

  window.addEventListener('error', handleClassroomOpaqueRuntimeEvent, true);
  window.addEventListener('unhandledrejection', handleClassroomOpaqueRuntimeEvent, true);
}

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
