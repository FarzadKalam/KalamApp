import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';

type Props = {
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

const CampaignAuditStrip: React.FC<Props> = ({ createdBy, createdAt, updatedBy, updatedAt }) => {
  const ids = useMemo(() => Array.from(new Set([createdBy, updatedBy].map((id) => String(id || '').trim()).filter(Boolean))), [createdBy, updatedBy]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ids.length) return;
    let active = true;
    void supabase.from('profiles').select('id,full_name').in('id', ids).limit(ids.length)
      .then(({ data }) => {
        if (!active) return;
        setLabels(Object.fromEntries((data || []).map((row: any) => [String(row.id), String(row.full_name || '').trim() || 'کاربر سازمان'])));
      });
    return () => { active = false; };
  }, [ids.join('|')]);
  if (!createdAt && !updatedAt) return null;
  const createdActor = createdBy ? labels[String(createdBy)] || 'کاربر سازمان' : 'سامانه';
  const updatedActor = updatedBy ? labels[String(updatedBy)] || 'کاربر سازمان' : 'سامانه';
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-white/10">
      {createdAt ? <span>ایجادکننده: {createdActor} · {safeJalaliFormat(createdAt, 'YYYY/MM/DD HH:mm')}</span> : null}
      {updatedAt ? <span>آخرین ویرایشگر: {updatedActor} · {safeJalaliFormat(updatedAt, 'YYYY/MM/DD HH:mm')}</span> : null}
    </div>
  );
};

export default CampaignAuditStrip;
