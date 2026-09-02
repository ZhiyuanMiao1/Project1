import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CourseReviewModal from './CourseReviewModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../i18n/language', () => ({
  useI18n: () => ({
    t: (_key, fallback) => fallback,
  }),
}));

describe('CourseReviewModal reward notice', () => {
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

  test('shows the 0.25-hour reward only for an eligible first review', () => {
    act(() => root.render(
      <CourseReviewModal
        course={{ id: '42', mentorName: '导师 M1', reviewRewardEligible: true }}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    ));

    expect(container.textContent).toContain('首次评价该导师，提交后奖励 0.25 课时');
    expect(container.querySelector('.course-review-modal__head .course-review-modal__reward-note')).not.toBeNull();

    act(() => root.render(
      <CourseReviewModal
        course={{
          id: '42',
          mentorName: '导师 M1',
          reviewRewardEligible: false,
          reviewSubmittedAt: '2026-09-01T08:00:00.000Z',
        }}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    ));

    expect(container.textContent).not.toContain('首次评价该导师，提交后奖励 0.25 课时');
  });
});
