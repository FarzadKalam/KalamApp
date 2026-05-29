import React from 'react';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export const NOTIFICATION_UNREAD_BADGE_COLOR = 'rgb(var(--brand-500-rgb))';

type UnreadCountBadgeProps = {
  count: number;
  className?: string;
};

const UnreadCountBadge: React.FC<UnreadCountBadgeProps> = ({ count, className = '' }) => {
  if (!(Number.isFinite(count) && count > 0)) return null;

  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-[rgb(var(--brand-500-rgb))] px-1.5 text-[10px] font-bold text-white ${className}`.trim()}
    >
      {toPersianNumber(String(Math.floor(count)))}
    </span>
  );
};

export default UnreadCountBadge;
