import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CancelCourseDialog from './CancelCourseDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    t: (_key, fallback) => fallback,
  }),
}));

describe('CancelCourseDialog', () => {
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

  test('explains the result and exposes safe and destructive actions', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    act(() => root.render(
      <CancelCourseDialog
        open
        error="取消失败，请稍后再试"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    ));

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('确定取消这节课吗？');
    expect(container.textContent).toContain('本次取消不会扣除学生课时');
    expect(container.querySelector('[role="alert"]').textContent).toContain('取消失败');

    const buttons = [...container.querySelectorAll('button')];
    const keepButton = buttons.find((button) => button.textContent === '取消');
    const confirmButton = buttons.find((button) => button.textContent === '确认');

    act(() => keepButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('blocks every closing action while cancellation is submitting', () => {
    const onClose = jest.fn();

    act(() => root.render(
      <CancelCourseDialog
        open
        submitting
        onClose={onClose}
        onConfirm={jest.fn()}
      />,
    ));

    const overlay = container.querySelector('.cancel-course-dialog-overlay');
    const buttons = [...container.querySelectorAll('button')];

    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain('取消中…');

    act(() => overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(onClose).not.toHaveBeenCalled();
  });
});
