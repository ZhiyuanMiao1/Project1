import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AppointmentCard from './AppointmentCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    t: (_key, fallback, replacements) => {
      const template = typeof fallback === 'string' ? fallback : _key;
      if (!replacements) return template;
      return template.replace(/\{(\w+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(replacements, key)
          ? String(replacements[key])
          : match
      ));
    },
    getCourseDirectionDisplayLabel: (_id, fallback) => fallback,
    getCourseTypeLabel: (_id, fallback) => fallback,
  }),
}));

const baseProps = {
  thread: {
    id: 'thread-1',
    myRole: 'mentor',
    courseDirectionId: 'chemistry',
    courseTypeId: 'assignment',
  },
  scheduleCard: {
    id: '88',
    direction: 'incoming',
    status: 'pending',
    courseRequestId: '42',
    courseDirectionId: 'chemistry',
    courseTypeId: 'assignment',
  },
  activeAvatarSrc: '',
  activeAvatarName: 'S5',
  scheduleTitle: '化学',
  windowText: '2099年7月25日 周六 09:00-10:15 (GMT+01)',
};

describe('AppointmentCard course request details', () => {
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

  test('keeps the title static and exposes details only in the more menu', () => {
    act(() => root.render(<AppointmentCard {...baseProps} />));

    expect(container.querySelector('.schedule-card-title-link')).toBeNull();

    const moreButton = container.querySelector('.schedule-card-more-trigger');
    act(() => moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const menuLink = container.querySelector('.schedule-card-more-menu a');
    expect(menuLink).not.toBeNull();
    expect(menuLink.textContent).toBe('课程需求详情');
    expect(menuLink.getAttribute('href')).toBe('/mentor/requests/42?source=messages');
  });

  test('does not expose the mentor request route on the student side', () => {
    act(() => root.render(
      <AppointmentCard
        {...baseProps}
        thread={{ ...baseProps.thread, myRole: 'student' }}
      />,
    ));

    expect(container.querySelector('.schedule-card-title-link')).toBeNull();
    const moreButton = container.querySelector('.schedule-card-more-trigger');
    act(() => moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('.schedule-card-more-menu a')).toBeNull();
  });

  test('shows cancellation and rescheduling only in the accepted card menu', () => {
    act(() => root.render(
      <AppointmentCard
        {...baseProps}
        scheduleCard={{ ...baseProps.scheduleCard, status: 'accepted' }}
      />,
    ));

    const moreButton = container.querySelector('.schedule-card-more-trigger');
    act(() => moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const labels = [...container.querySelectorAll('.schedule-card-more-item')].map((item) => item.textContent);
    expect(labels).toContain('修改时间');
    expect(labels).toContain('取消课程');
    expect(container.querySelector('.schedule-card-bottom').textContent).toContain('已接受');
  });

  test('lets the receiver revise a rejected proposal from the status control', () => {
    act(() => root.render(
      <AppointmentCard
        {...baseProps}
        scheduleCard={{ ...baseProps.scheduleCard, status: 'rejected' }}
      />,
    ));

    const statusButton = container.querySelector('.schedule-decision-wrapper .schedule-btn.merged');
    expect(statusButton).not.toBeNull();
    expect(statusButton.disabled).toBe(false);

    act(() => statusButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const actions = [...container.querySelectorAll('.schedule-decision-popover .inline-action')]
      .map((item) => item.textContent);
    expect(actions).toEqual(expect.arrayContaining(['接受', '修改时间']));
  });

  test('keeps a source proposal in rescheduling state instead of restoring the initial actions', () => {
    act(() => root.render(
      <AppointmentCard
        {...baseProps}
        scheduleCard={{ ...baseProps.scheduleCard, status: 'rescheduling' }}
      />,
    ));

    const actionButtons = container.querySelectorAll('.schedule-card-bottom .schedule-btn');
    expect(actionButtons).toHaveLength(1);
    expect(actionButtons[0].textContent).toContain('修改时间中');
    expect(actionButtons[0].disabled).toBe(true);
  });
});
