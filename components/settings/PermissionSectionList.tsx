import React from 'react';
import { Collapse, Empty, Spin } from 'antd';
import { normalizePermissionSearch } from '../../utils/fieldAccess';

const nodeText = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  return React.isValidElement<{ children?: React.ReactNode }>(node) ? nodeText(node.props.children) : '';
};

const PermissionSectionList: React.FC<{
  children: React.ReactNode; search: string; ready: boolean; error: boolean;
  allowed: (key: string) => boolean; initialKey?: string | null;
}> = ({ children, search, ready, error, allowed, initialKey }) => {
  if (error) return <Empty description="دریافت قابلیت‌های فعال سازمان ناموفق بود؛ صفحه را دوباره بارگذاری کنید." />;
  if (!ready) return <div className="p-6 text-center"><Spin /></div>;
  const panels = React.Children.toArray(children).filter((child) => {
    if (!React.isValidElement<{ header?: React.ReactNode }>(child)) return false;
    // Children.toArray prefixes the original React key.
    const key = String(child.key || '').split('$').pop() || '';
    return allowed(key) && normalizePermissionSearch(nodeText(child.props.header)).includes(normalizePermissionSearch(search));
  }).map((child) => React.isValidElement(child) ? React.cloneElement(child, { key: String(child.key || '').split('$').pop() }) : child);
  if (!panels.length) return <Empty description="بخشی با این جستجو در قابلیت‌های فعال سازمان پیدا نشد." />;
  return <Collapse defaultActiveKey={initialKey ? [initialKey] : []} className="dark:border-gray-800 dark:bg-transparent">{panels}</Collapse>;
};
export default PermissionSectionList;
