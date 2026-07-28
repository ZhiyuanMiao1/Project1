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

  test('links the course title and more menu to the read-only mentor detail view', () => {
    act(() => root.render(<AppointmentCard {...baseProps} />));

    const titleLink = container.querySelector('.schedule-card-title-link');
    expect(titleLink).not.toBeNull();
    expect(titleLink.getAttribute('href')).toBe('/mentor/requests/42?source=messages');
    expect(titleLink.getAttribute('target')).toBe('_blank');

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
  });
});
