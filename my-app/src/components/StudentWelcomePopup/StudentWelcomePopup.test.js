import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StudentWelcomePopup from './StudentWelcomePopup';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    t: (_key, fallback) => fallback,
  }),
}));

describe('StudentWelcomePopup', () => {
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

  test('shows student guidance and opens inline links in new tabs', () => {
    act(() => root.render(
      <StudentWelcomePopup
        publicId="s57"
        role="student"
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    ));

    expect(container.textContent).toContain('s57');
    expect(container.textContent).toContain('完善个人信息');
    expect(container.textContent).toContain('评价导师得课时');
    expect(container.textContent).toContain('零容忍');
    expect(container.textContent).toContain('垃圾邮件箱');
    expect(container.textContent).not.toContain('提高效率');

    const profileLink = [...container.querySelectorAll('a')]
      .find((link) => link.textContent === '个人信息');
    expect(profileLink.getAttribute('href')).toBe('/student/settings?section=profile');
    expect(profileLink.getAttribute('target')).toBe('_blank');
    expect(profileLink.getAttribute('rel')).toContain('noopener');

    const courseLinks = [...container.querySelectorAll('a')]
      .filter((link) => link.textContent === '课程');
    expect(courseLinks).toHaveLength(2);
    courseLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/student/courses');
      expect(link.getAttribute('target')).toBe('_blank');
    });
  });

  test('shows mentor-specific guidance and actions', () => {
    const onConfirm = jest.fn();
    act(() => root.render(
      <StudentWelcomePopup
        publicId="m18"
        role="mentor"
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    ));

    expect(container.textContent).toContain('m18');
    expect(container.textContent).toContain('提高效率');
    expect(container.textContent).toContain('曼途');
    expect(container.textContent).toContain('导师行为规范');
    expect(container.textContent).not.toContain('评价导师得课时');

    const settingsLink = [...container.querySelectorAll('a')]
      .find((link) => link.textContent === '设置');
    expect(settingsLink.getAttribute('href')).toBe('/mentor/settings?section=profile');
    expect(settingsLink.getAttribute('target')).toBe('_blank');

    const action = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '编辑个人名片');
    act(() => action.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
