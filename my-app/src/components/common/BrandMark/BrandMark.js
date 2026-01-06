import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import './BrandMark.css';

function BrandMark({ className = '', to = '/student', label = 'Mentory' }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(to);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(to);
    }
  };

  return (
    <span
      className={`brand-mark ${className}`.trim()}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {label}
    </span>
  );
}

BrandMark.propTypes = {
  className: PropTypes.string,
  to: PropTypes.string,
  label: PropTypes.string,
};

export default BrandMark;
