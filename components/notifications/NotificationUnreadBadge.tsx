import React from 'react';
import Badge from 'antd/es/badge';
import type { BadgeProps } from 'antd/es/badge';
import { useNotificationRuntime } from './NotificationRuntimeProvider';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

/** Subscribe at the badge, rather than rerendering the entire workspace on feed updates. */
const NotificationUnreadBadge = React.forwardRef<HTMLSpanElement, Omit<BadgeProps, 'count'> & { kind: 'communication' | 'alerts' }>(function NotificationUnreadBadge({ kind, children, ...props }, ref) {
  const runtime = useNotificationRuntime();
  const count = kind === 'communication' ? runtime.communicationUnread : runtime.alertsUnread;
  return <Badge {...props} ref={ref} count={count > 0 ? toPersianNumber(String(count)) : 0} size="small" color="#c0392b">{children}</Badge>;
});

export default NotificationUnreadBadge;
