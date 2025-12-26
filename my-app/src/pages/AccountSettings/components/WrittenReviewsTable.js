import React from 'react';
import defaultAvatar from '../../../assets/images/default-avatar.jpg';

const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

const formatReviewMonth = (value) => {
  if (typeof value !== 'string' || !value) return '';
  const match = value.match(/(\d{4})[/-](\d{1,2})/);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  return `${year}年${month}月`;
};

const getReviewDisplayName = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^导师\s*/, '').trim();
  return withoutPrefix || trimmed;
};

function WrittenReviewsTable({ reviews = [], ariaLabel = '评价列表', nameFallback = '导师' }) {
  return (
    <ul className="settings-written-reviews-list" aria-label={ariaLabel}>
      {reviews.map((review) => {
        const displayName = getReviewDisplayName(review.target) || nameFallback;
        const monthLabel = formatReviewMonth(review.time);
        const ratingLabel = typeof review.rating === 'number' ? String(review.rating) : String(review.rating || '--');
        const numericRating = Number(review.rating);
        const clampedRating = Number.isFinite(numericRating) ? Math.max(0, Math.min(5, numericRating)) : 0;
        const ratingForStars = Math.round(clampedRating * 10) / 10;

        return (
          <li key={review.id} className="settings-written-review-item">
            <img className="settings-written-review-avatar" src={defaultAvatar} alt="" />
            <div className="settings-written-review-body">
              <div className="settings-written-review-meta">
                <span className="settings-written-review-name">{displayName}</span>
                {monthLabel ? <span className="settings-written-review-date">{monthLabel}</span> : null}
              </div>
              <div className="settings-written-review-text">{review.content}</div>
            </div>
            <div className="settings-written-review-rating" aria-label={`评分 ${ratingLabel}`}>
              <div className="settings-written-review-stars" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, starIndex) => {
                  const fillRatio = Math.max(0, Math.min(1, ratingForStars - starIndex));
                  const fillWidth = 24 * fillRatio;
                  const showDivider = fillRatio > 0 && fillRatio < 1;
                  const idPrefix = `settings-written-review-${review.id}-star-${starIndex}`;

                  return (
                    <svg
                      key={starIndex}
                      className="settings-written-review-star"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <defs>
                        <clipPath id={`${idPrefix}-fill`}>
                          <rect x="0" y="0" width={fillWidth} height="24" />
                        </clipPath>
                        <clipPath id={`${idPrefix}-shape`}>
                          <path d={STAR_PATH} />
                        </clipPath>
                      </defs>
                      <path className="settings-written-review-star-base" d={STAR_PATH} />
                      <path className="settings-written-review-star-fill" d={STAR_PATH} clipPath={`url(#${idPrefix}-fill)`} />
                      {showDivider ? (
                        <g clipPath={`url(#${idPrefix}-shape)`}>
                          <line
                            className="settings-written-review-star-divider"
                            x1={fillWidth}
                            x2={fillWidth}
                            y1="2"
                            y2="22"
                          />
                        </g>
                      ) : null}
                    </svg>
                  );
                })}
              </div>
              <span className="settings-written-review-rating-value">{ratingLabel}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default WrittenReviewsTable;

