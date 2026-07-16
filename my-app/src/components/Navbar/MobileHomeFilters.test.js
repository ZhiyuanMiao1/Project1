import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileHomeFilters, MobileSearchSheet } from './MobileHomeFilters';

describe('MobileHomeFilters', () => {
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
    document.body.style.overflow = '';
  });

  test('opens and clears an active filter independently', () => {
    const onOpen = jest.fn();
    const onClear = jest.fn();
    act(() => {
      root.render(
        <MobileHomeFilters
          filters={[{ key: 'timezone', label: '时区', value: '中国', onOpen, onClear }]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    act(() => buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.mobile-filter-chip').classList.contains('is-selected')).toBe(true);
  });

  test('can hide filter chevrons', () => {
    act(() => {
      root.render(
        <MobileHomeFilters
          showChevron={false}
          filters={[{ key: 'timezone', label: '时区', value: '', onOpen: jest.fn() }]}
        />
      );
    });

    expect(container.querySelector('.mobile-filter-chip__chevron')).toBeNull();
  });

  test('shows only the selected value when requested', () => {
    act(() => {
      root.render(
        <MobileHomeFilters
          hideLabelWhenSelected
          filters={[{ key: 'timezone', label: '时区', value: '欧洲', onOpen: jest.fn(), onClear: jest.fn() }]}
        />
      );
    });

    expect(container.querySelector('.mobile-filter-chip__label')).toBeNull();
    expect(container.querySelector('.mobile-filter-chip__value').textContent).toBe('欧洲');
  });

  test('submits exact search and restores body scrolling when closed', () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    act(() => {
      root.render(
        <MobileSearchSheet
          open
          title="精确搜索"
          value="M123"
          placeholder="输入导师"
          onChange={jest.fn()}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );
    });

    expect(document.body.style.overflow).toBe('hidden');
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
