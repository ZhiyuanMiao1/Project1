import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PendingLessonHoursPrompt from './PendingLessonHoursPrompt';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    language: 'zh-CN',
    t: (_key, fallback) => fallback,
    getCourseDirectionDisplayLabel: (_id, fallback) => fallback,
    getCourseTypeLabel: (_id, fallback) => fallback,
  }),
}));

const confirmation = {
  id: '101',
  actionRole: 'student',
  proposedHours: 1.75,
  startsAt: '2026-08-22T06:00:00.000Z',
  courseDirectionId: 'cs-ai',
  participantName: '导师',
};

describe('PendingLessonHoursPrompt recharge exit', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('routes the primary action to top-up when lesson hours are insufficient', () => {
    const onConfirm = jest.fn();
    const onRecharge = jest.fn();

    act(() => root.render(
      <PendingLessonHoursPrompt
        open
        confirmation={confirmation}
        error="剩余课时不足，请先充值后再确认"
        requiresRecharge
        onConfirm={onConfirm}
        onDispute={jest.fn()}
        onRecharge={onRecharge}
      />,
    ));

    const primaryButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '去充值');
    expect(primaryButton).not.toBeUndefined();

    act(() => primaryButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onRecharge).toHaveBeenCalledWith(confirmation);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('shows processing only on the primary action that was clicked', () => {
    act(() => root.render(
      <PendingLessonHoursPrompt
        open
        confirmation={confirmation}
        busy
        busyAction="primary"
        onConfirm={jest.fn()}
        onDispute={jest.fn()}
      />,
    ));

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons.find((button) => button.textContent === '提出异议')).not.toBeUndefined();
    expect(buttons.filter((button) => button.textContent.includes('处理中'))).toHaveLength(1);
  });
});
