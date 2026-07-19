import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SiteFooter from './SiteFooter';

jest.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}), { virtual: true });

describe('SiteFooter', () => {
  let container;
  let root;

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete window.matchMedia;
  });

  const renderFooter = (isPhone) => {
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: isPhone,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    act(() => {
      root.render(<SiteFooter />);
    });
  };

  test('shows mobile footer sections as a single-open accordion', () => {
    renderFooter(true);

    const supportButton = container.querySelector('[aria-controls="site-footer-support-content"]');
    const aboutButton = container.querySelector('[aria-controls="site-footer-about-content"]');
    const supportContent = container.querySelector('#site-footer-support-content');
    const aboutContent = container.querySelector('#site-footer-about-content');

    expect(supportButton.getAttribute('aria-expanded')).toBe('false');
    expect(supportContent.hidden).toBe(true);

    act(() => supportButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(supportButton.getAttribute('aria-expanded')).toBe('true');
    expect(supportContent.hidden).toBe(false);
    expect(container.querySelector('.site-footer__contact-row').textContent).toBe('联系我们contact@mentory.cc');

    act(() => aboutButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(supportButton.getAttribute('aria-expanded')).toBe('false');
    expect(supportContent.hidden).toBe(true);
    expect(aboutButton.getAttribute('aria-expanded')).toBe('true');
    expect(aboutContent.hidden).toBe(false);
  });

  test('keeps all footer content visible without accordion controls above phone width', () => {
    renderFooter(false);

    expect(container.querySelector('.site-footer__column-toggle')).toBeNull();
    expect(container.querySelector('#site-footer-support-content').hidden).toBe(false);
    expect(container.querySelector('#site-footer-about-content').hidden).toBe(false);
    expect(container.querySelector('#site-footer-rules-content').hidden).toBe(false);
  });
});
