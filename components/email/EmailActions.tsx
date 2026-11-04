import React from 'react';
import { Button, Tooltip } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { isEmailAddress } from '../../utils/organizationEmail';
import { useEmailComposerStore } from '../../utils/emailComposerStore';
export const EmailComposeButton: React.FC<{ value: unknown; moduleId?: string; recordId?: string }> = ({ value, moduleId, recordId }) => {
  const open = useEmailComposerStore(s => s.open);
  if (!isEmailAddress(value)) return null;
  return <Tooltip title="نوشتن ایمیل"><Button type="text" size="small" aria-label="نوشتن ایمیل" icon={<MailOutlined />} onClick={e => { e.stopPropagation(); e.preventDefault(); open({ to: [value], moduleId, recordId }); }} /></Tooltip>;
};
export const EmailActions: React.FC<{ value: unknown; moduleId?: string; recordId?: string }> = props => <span className="inline-flex min-w-0 items-center gap-1"><span dir="ltr" className="truncate">{String(props.value || '—')}</span><EmailComposeButton {...props} /></span>;
