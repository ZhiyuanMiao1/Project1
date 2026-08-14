import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CourseDisputeModal from './CourseDisputeModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    isEnglish: false,
    t: (_key, fallback, replacements = {}) => Object.entries(replacements).reduce(
      (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
      fallback
    ),
  }),
}));

const course = {
  id: '42',
  title: '编程基础',
  date: '2026-03-19',
  disputeTimeLabel: '16:15-17:15',
  duration: '1h',
  mentorName: '张三',
  mentorPublicId: 'm2',
};

describe('CourseDisputeModal', () => {
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

  test('collects a structured lesson concern before submitting', () => {
    const onSubmit = jest.fn();

    act(() => root.render(
      <CourseDisputeModal course={course} onClose={jest.fn()} onSubmit={onSubmit} />,
    ));

    expect(container.textContent).toContain('编程基础');
    expect(container.textContent).toContain('2026-03-19');
    expect(container.textContent).toContain('16:15-17:15');
    expect(container.textContent).toContain('1h');
    expect(container.textContent).not.toContain('MentorID');
    expect(container.textContent).toContain('m2');
    expect(container.querySelector('input[value="lesson_hours"]')).toBeNull();
    expect(container.querySelector('input[value="feedback_only"]').checked).toBe(true);
    expect(container.querySelector('input[value="lesson_credit"]')).not.toBeNull();
    expect(container.querySelector('input[value="refund_review"]')).not.toBeNull();
    expect(container.querySelector('input[value="platform_review"]')).toBeNull();
    expect(container.querySelector('input[value="reschedule"]')).toBeNull();
    expect(container.querySelector('input[value="partial_refund"]')).toBeNull();
    expect(container.querySelector('input[value="full_refund"]')).toBeNull();
    const submitButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '提交异议');
    expect(submitButton.disabled).toBe(true);

    const reasonInput = container.querySelector('input[value="content_mismatch"]');
    const textarea = container.querySelector('textarea');

    act(() => reasonInput.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(reasonInput.checked).toBe(true);
    act(() => reasonInput.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(reasonInput.checked).toBe(false);
    act(() => reasonInput.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, '异');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const resolutionInput = container.querySelector('input[value="feedback_only"]');
    act(() => resolutionInput.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(resolutionInput.checked).toBe(false);
    expect(submitButton.disabled).toBe(true);
    act(() => resolutionInput.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(resolutionInput.checked).toBe(true);

    expect(submitButton.disabled).toBe(false);
    act(() => submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: 'content_mismatch',
      preferredResolution: 'feedback_only',
      description: '异',
    });
  });

  test('shows an existing concern instead of another submission form', () => {
    act(() => root.render(
      <CourseDisputeModal
        course={{
          ...course,
          courseDispute: {
            id: 'CD123',
            reasonCode: 'lesson_hours',
            description: '实际课程时长与扣除课时不一致',
            preferredResolution: 'platform_review',
            status: 'submitted',
            submittedAt: '2026-08-14T08:00:00.000Z',
          },
        }}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    ));

    expect(container.textContent).toContain('异议已提交');
    expect(container.textContent).toContain('CD123');
    expect(container.querySelector('form')).toBeNull();
  });
});
