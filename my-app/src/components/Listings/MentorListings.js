import React from 'react';
import MentorListingCard from '../ListingCard/MentorListingCard';
import './Listings.css';

function MentorListings({ data, favoriteIds, onFavoriteChange }) {
  const showSkeleton = data === null;
  const list = Array.isArray(data) ? data : [];

  return (
    <div className="listings container">
      <div className="listing-grid">
        {showSkeleton
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk-card">
                <div className="sk sk-title" style={{ width: '40%', marginTop: 6 }} />
                <div className="sk-chips" style={{ justifyContent: 'flex-start' }}>
                  <div className="sk sk-chip" />
                  <div className="sk sk-chip" />
                </div>
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line long" />
                <div className="sk sk-line short" />
              </div>
            ))
          : list.map((item) => (
              <MentorListingCard
                key={item.id}
                data={item}
                favoriteRole="mentor"
                favoriteItemType="student_request"
                favoriteItemId={item.id}
                initialFavorited={!!favoriteIds?.has?.(String(item.id))}
                onFavoriteChange={onFavoriteChange}
              />
            ))}
      </div>
    </div>
  );
}

export default MentorListings;
