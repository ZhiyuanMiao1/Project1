import React, { forwardRef } from 'react';
import './Button.css';

const Button = forwardRef(function Button(
  {
    type = 'button',
    className = '',
    fullWidth = false,
    children,
    ...props
  },
  ref
) {
  const classes = [
    'app-button',
    fullWidth ? 'app-button--full-width' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
