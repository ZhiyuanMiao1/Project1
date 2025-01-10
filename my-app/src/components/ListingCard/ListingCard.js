import React from 'react';
import './ListingCard.css';

function ListingCard({ data }) {
  const { title, rating, price, imageUrl, desc } = data;

  return (
    <div className="card listing-card">
      <div className="card-image">
        <img src={imageUrl} alt={title} />
      </div>
      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <p className="card-rating">评分: {rating}</p>
        <p className="card-desc">{desc}</p>
        <p className="card-price">{price} <span className="card-price-suffix">税前总价</span></p>
      </div>
    </div>
  );
}

export default ListingCard;
