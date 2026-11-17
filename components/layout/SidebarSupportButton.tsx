import React, { useEffect, useState } from 'react';
import { Badge, Button, Popover } from 'antd';
import { CustomerServiceOutlined, MessageOutlined, PhoneOutlined } from '@ant-design/icons';
import { supabasePublic } from '../../supabaseClient';

type Props = { ticketPath?: string; unread?: number; onNavigate: (path: string) => void };

const SidebarSupportButton: React.FC<Props> = ({ ticketPath, unread = 0, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<{ label: string; href: string } | null>(null);
  useEffect(() => {
    let active = true;
    void supabasePublic.rpc('get_site_footer').then(({ data, error }) => {
      const label = String(data?.phone || '').trim();
      const number = String(data?.phoneHref || label).replace(/^tel:/i, '')
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[\s()\-]/g, '');
      if (active && !error && label && /^\+?\d{7,15}$/.test(number)) setPhone({ label, href: `tel:${number}` });
    }).catch(() => { if (active) setPhone(null); });
    return () => { active = false; };
  }, []);
  return <Popover trigger="click" open={open} onOpenChange={setOpen} placement="leftBottom" zIndex={1400}
    rootClassName="workspace-support-popover" title="پشتیبانی"
    content={<div dir="rtl" className="w-60 space-y-2">
      <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
        <div className="mb-2 flex items-center gap-2 font-medium"><PhoneOutlined /> تماس تلفنی</div>
        {phone ? <><div dir="ltr" className="mb-2 text-right">{phone.label}</div><Button block href={phone.href}>باز کردن شماره‌گیر دستگاه</Button></>
          : <span className="text-xs text-gray-500">شماره پشتیبانی در دسترس نیست.</span>}
      </div>
      {ticketPath && <Button block icon={<MessageOutlined />} onClick={() => { setOpen(false); onNavigate(ticketPath); }}>تیکت‌ها <Badge count={unread} size="small" /></Button>}
    </div>}>
    <button type="button" aria-label="پشتیبانی" aria-expanded={open}
      className="sidebar-support-button">
      <Badge count={unread} size="small"><CustomerServiceOutlined className="text-2xl text-[rgb(var(--brand-600-rgb))] dark:text-white" /></Badge>
      <span>پشتیبانی</span>
    </button>
  </Popover>;
};
export default SidebarSupportButton;
