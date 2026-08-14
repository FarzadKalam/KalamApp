import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Radio } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FieldType } from '../../types';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { resolveModalPopupContainer } from '../../utils/popupContainer';
import { supabase } from '../../supabaseClient';

type LinkTarget = { id?: string; target_module_id: 'customers' | 'suppliers' | 'employees'; target_record_id: string | null };

const targetModules = [
  { value: 'customers', label: 'مشتری' },
  { value: 'suppliers', label: 'تأمین‌کننده' },
  { value: 'employees', label: 'کارمند' },
] as const;

const relationField = (targetModule: LinkTarget['target_module_id']) => ({
  key: `instagram_link_${targetModule}`,
  type: FieldType.RELATION,
  labels: { fa: 'رکورد مرتبط' },
  label: 'رکورد مرتبط',
  relationConfig: { targetModule },
} as any);

const InstagramConversationLinkModal: React.FC<{
  open: boolean;
  conversationId: string | null;
  contactName?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}> = ({ open, conversationId, contactName, onClose, onSaved }) => {
  const { message } = App.useApp();
  const [targets, setTargets] = useState<LinkTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !conversationId) return;
    let active = true;
    setLoading(true);
    void supabase.from('instagram_conversation_links')
      .select('id,target_module_id,target_record_id')
      .eq('conversation_id', conversationId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { message.error(error.message || 'اتصال‌های مخاطب بارگذاری نشد.'); return; }
        setTargets((data || []).map((item: any) => ({ id: item.id, target_module_id: item.target_module_id, target_record_id: item.target_record_id })));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, message, open]);

  const validTargets = useMemo(() => targets.filter((item) => item.target_record_id), [targets]);
  const updateTarget = (index: number, patch: Partial<LinkTarget>) => setTargets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const save = async () => {
    if (!conversationId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-boxapi', {
        body: { action: 'save_conversation_links', conversationId, targets: validTargets.map(({ target_module_id, target_record_id }) => ({ target_module_id, target_record_id })) },
      });
      if (error || data?.success === false) throw new Error(data?.message || error?.message || 'ذخیره اتصال مخاطب ناموفق بود.');
      message.success('اتصال مخاطب ذخیره شد.');
      await onSaved();
      onClose();
    } catch (error: any) { message.error(error?.message || 'ذخیره اتصال مخاطب ناموفق بود.'); }
    finally { setSaving(false); }
  };

  return <Modal open={open} title="اتصال گفتگوی اینستاگرام به مخاطب" onCancel={onClose} onOk={() => void save()} okText="ذخیره اتصال" cancelText="انصراف" confirmLoading={saving} destroyOnHidden width={620}>
    <div className="space-y-3" dir="rtl">
      <Alert showIcon type="info" message={contactName ? `گفتگوی ${contactName} را به رکوردهای سازمان متصل کنید.` : 'این گفتگو را به رکوردهای سازمان متصل کنید.'} description="با حذف یک ردیف، اتصال آن رکورد نیز برداشته می‌شود. این اتصال برای ارسال پیام از گردش‌کارها استفاده می‌شود." />
      {loading ? <div className="py-5 text-center text-sm text-slate-400">در حال بارگذاری اتصال‌ها…</div> : null}
      {!loading && targets.map((target, index) => <div key={target.id || `new-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
        <div className="mb-3 flex items-center justify-between gap-2"><Radio.Group value={target.target_module_id} optionType="button" buttonStyle="solid" options={targetModules} onChange={(event) => updateTarget(index, { target_module_id: event.target.value, target_record_id: null })} /><Button type="text" danger icon={<DeleteOutlined />} aria-label="حذف اتصال" onClick={() => setTargets((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div>
        <SmartFieldRenderer field={relationField(target.target_module_id)} value={target.target_record_id || undefined} onChange={(value: any) => updateTarget(index, { target_record_id: String(value || '').trim() || null })} forceEditMode compactMode overlayZIndexBase={15320} popupContainer={resolveModalPopupContainer} preferLocalPopupContainer />
      </div>)}
      {!loading ? <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setTargets((current) => [...current, { target_module_id: 'customers', target_record_id: null }])}>افزودن اتصال مخاطب</Button> : null}
    </div>
  </Modal>;
};

export default InstagramConversationLinkModal;
