import { getVerticalVisibilityRatio, isMessageRectVisible } from './messageVisibilityUtils';

describe('message visibility', () => {
  const rootRect = { top: 100, bottom: 500 };

  test('marks a final notice as visible when it sits at the bottom of a non-scrollable viewport', () => {
    const noticeRect = { top: 470, bottom: 500, height: 30 };

    expect(getVerticalVisibilityRatio(noticeRect, rootRect)).toBe(1);
    expect(isMessageRectVisible(noticeRect, rootRect)).toBe(true);
  });

  test('accepts a message when at least 55 percent is visible', () => {
    const noticeRect = { top: 489, bottom: 509, height: 20 };

    expect(getVerticalVisibilityRatio(noticeRect, rootRect)).toBeCloseTo(0.55);
    expect(isMessageRectVisible(noticeRect, rootRect)).toBe(true);
  });

  test('does not mark a mostly hidden message as read', () => {
    const noticeRect = { top: 495, bottom: 515, height: 20 };

    expect(getVerticalVisibilityRatio(noticeRect, rootRect)).toBeCloseTo(0.25);
    expect(isMessageRectVisible(noticeRect, rootRect)).toBe(false);
  });
});
