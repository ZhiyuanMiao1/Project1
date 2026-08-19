import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AboutPage, { ABOUT_CONTENT, AboutSection, buildPartnershipMailto } from './AboutPage';

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/business-cooperation' }),
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}), { virtual: true });
jest.mock('../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../components/common/BrandMark/BrandMark', () => () => null);
jest.mock('../../components/AuthModal/StudentAuthModal', () => () => null);
jest.mock('../../components/RegisterPopup/RegisterPopup', () => () => null);
jest.mock('../../components/LoginPopup/LoginPopup', () => () => null);
jest.mock('../../components/MentorActivationPopup/MentorActivationPopup', () => () => null);
jest.mock('../../components/common/UnreadBadge/UnreadBadge', () => () => null);
jest.mock('../../components/common/SiteFooter/SiteFooter', () => () => null);
jest.mock('../../hooks/useMenuBadgeSummary', () => () => ({ totalBadgeCount: 0 }));
jest.mock('../../i18n/language', () => ({ useI18n: () => ({ isEnglish: false, t: (_, fallback) => fallback }) }));

describe('business cooperation content and actions', () => {
  let container;
  let root;
  let originalScrollTo;

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    originalScrollTo = window.scrollTo;
    window.scrollTo = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.scrollTo = originalScrollTo;
  });

  test.each([
    ['introduction', '/about'],
    ['mentorOpportunities', '/mentor-opportunities'],
    ['businessCooperation', '/business-cooperation'],
  ])('opens the %s page at the top', (pageKey) => {
    act(() => {
      root.render(<AboutPage pageKey={pageKey} />);
    });

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  test('keeps Chinese and English cooperation sections equivalent', () => {
    const chinese = ABOUT_CONTENT.businessCooperation['zh-CN'];
    const english = ABOUT_CONTENT.businessCooperation.en;

    expect(chinese.sections.map(({ id }) => id)).toEqual([
      'trusted-connections',
      'priorities',
      'investment',
      'connect',
    ]);
    expect(english.sections.map(({ id }) => id)).toEqual(chinese.sections.map(({ id }) => id));
    const chinesePriorities = chinese.sections.find(({ id }) => id === 'priorities').items;
    const englishPriorities = english.sections.find(({ id }) => id === 'priorities').items;
    expect(chinesePriorities).toHaveLength(6);
    expect(englishPriorities).toHaveLength(6);
    expect(chinesePriorities.every(([, description]) => !/[。.\s]$/.test(description))).toBe(true);
    expect(englishPriorities.every(([, description]) => !/[.\s]$/.test(description))).toBe(true);
    expect(chinesePriorities.at(-1)[1]).toBe('寻找能够在产品、技术、教育运营、增长或国际化方面长期投入的同行者');
    expect(chinese.sections.find(({ id }) => id === 'connect').actions).toHaveLength(3);
    expect(english.sections.find(({ id }) => id === 'connect').actions).toHaveLength(3);
    expect(chinese.sections.find(({ id }) => id === 'connect').actions.every(({ description }) => !/[。.\s]$/.test(description))).toBe(true);
    expect(english.sections.find(({ id }) => id === 'connect').actions.every(({ description }) => !/[.\s]$/.test(description))).toBe(true);
  });

  test('renders mentor registration as a button and email routes as encoded links', () => {
    const section = ABOUT_CONTENT.businessCooperation['zh-CN'].sections.find(({ id }) => id === 'connect');
    const onAction = jest.fn();

    act(() => {
      root.render(<AboutSection section={section} onAction={onAction} />);
    });

    const mentorButton = container.querySelector('button[aria-label="注册成为 Mentory 导师"]');
    const emailLinks = Array.from(container.querySelectorAll('a[href^="mailto:"]'));

    expect(mentorButton).not.toBeNull();
    expect(emailLinks).toHaveLength(2);
    expect(emailLinks[0].getAttribute('href')).toBe(buildPartnershipMailto(section.actions[1]));
    expect(emailLinks[1].getAttribute('href')).toBe(buildPartnershipMailto(section.actions[2]));
    expect(emailLinks[0].getAttribute('href')).toContain('%E5%95%86%E5%8A%A1%E5%90%88%E4%BD%9C');
    expect(emailLinks[1].getAttribute('href')).toContain('%E6%8A%95%E8%B5%84%E4%B8%8E%E6%88%98%E7%95%A5%E5%90%88%E4%BD%9C');

    act(() => mentorButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAction).toHaveBeenCalledWith(section.actions[0]);
  });

  test('disables only the mentor action while registration state is loading', () => {
    const section = ABOUT_CONTENT.businessCooperation.en.sections.find(({ id }) => id === 'connect');

    act(() => {
      root.render(<AboutSection section={section} actionLoading />);
    });

    expect(container.querySelector('button[aria-label="Register as a Mentory mentor"]').disabled).toBe(true);
    expect(container.querySelectorAll('a[href^="mailto:"]')).toHaveLength(2);
  });
});
