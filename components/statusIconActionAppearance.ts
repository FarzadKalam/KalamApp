import type React from 'react';

export const buildStatusIconActionClassName = (className = '') => (
  `task-action-button ${className} !transition-all hover:!scale-110 hover:!ring-2 `
  + 'hover:!ring-[rgba(var(--brand-500-rgb),0.28)] hover:!ring-offset-1 hover:!ring-offset-white '
  + 'dark:hover:!ring-[rgba(var(--brand-300-rgb),0.34)] dark:hover:!ring-offset-slate-950'
);

export const getStatusIconActionStyle = ({
  color = '#6b7280',
  active = false,
  disabled = false,
  size = 30,
}: {
  color?: string;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}): React.CSSProperties => ({
  width: size,
  minWidth: size,
  height: size,
  padding: 0,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  lineHeight: 1,
  color: active ? color : (disabled ? '#cbd5e1' : '#4b5563'),
  backgroundColor: active ? `${color}1a` : 'transparent',
  border: 'none',
  position: 'relative',
  zIndex: active ? 4 : 3,
  boxShadow: active
    ? `0 4px 12px ${color}33`
    : (disabled ? 'none' : '0 3px 10px rgba(15, 23, 42, 0.10)'),
  opacity: disabled ? 0.42 : 1,
  cursor: active ? 'default' : (disabled ? 'not-allowed' : 'pointer'),
});
