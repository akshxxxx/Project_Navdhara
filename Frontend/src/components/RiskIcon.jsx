import React from 'react';
import { LEVEL_META } from '../api/adapters';

const SHAPES = {
  0: <circle cx="10" cy="10" r="8" />,
  1: <path d="M10 2 L18.5 17 H1.5 Z" strokeLinejoin="round" />,
  2: <path d="M10 1.5 L18.5 10 L10 18.5 L1.5 10 Z" />,
  3: <path d="M6.5 2 H13.5 L18 6.5 V13.5 L13.5 18 H6.5 L2 13.5 V6.5 Z" />,
  closed: (
    <>
      <rect x="2" y="2" width="16" height="16" rx="2" />
      <rect x="5" y="8.6" width="10" height="2.8" fill="#fff" />
    </>
  ),
};

export function RiskIcon({ level, size = 20, className = '', ariaLabel }) {
  const meta = LEVEL_META[level] ?? LEVEL_META[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={meta.color}
      className={className}
      aria-label={ariaLabel || `${meta.label} risk`}
      role="img"
    >
      {SHAPES[level] ?? SHAPES[0]}
    </svg>
  );
}

export function RiskBadge({ level, showVerdict = false, size = 'sm' }) {
  const meta = LEVEL_META[level] ?? LEVEL_META[0];
  const label = showVerdict ? meta.verdict : meta.label;
  const isLg = size === 'lg';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-condensed font-semibold ${isLg ? 'text-base' : 'text-xs'}`}
      style={{ backgroundColor: meta.tint, color: '#1B2A33' }}
    >
      <RiskIcon level={level} size={isLg ? 16 : 12} />
      {label}
    </span>
  );
}
