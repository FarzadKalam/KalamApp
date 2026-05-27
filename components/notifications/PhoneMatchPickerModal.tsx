import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Modal, Skeleton, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const ENTITY_LABELS: Record<string, string> = {
  customers: 'مشتری',
  suppliers: 'تامین‌کننده',
  profiles: 'کاربر سازمان',
  employees: 'کارمند',
  marketing_leads: 'سرنخ',
};

const ENTITY_COLORS: Record<string, string> = {
  customers: 'blue',
  suppliers: 'green',
  profiles: 'purple',
  employees: 'orange',
  marketing_leads: 'cyan',
};

const ENTITY_PRIORITY: Record<string, number> = {
  profiles: 1,
  employees: 2,
  customers: 3,
  suppliers: 4,
  marketing_leads: 9,
};

type Candidate = {
  id: string;
  entity_type: string;
  entity_id: string;
  display_title: string | null;
  label: string | null;
};

export type PhoneMatchSelection = {
  entityType: string;
  entityId: string;
  displayTitle: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  phoneNumberId: string | null;
  phone: string;
  onSelect: (selection: PhoneMatchSelection) => Promise<void> | void;
};

const PhoneMatchPickerModal: React.FC<Props> = ({
  visible,
  onClose,
  phoneNumberId,
  phone,
  onSelect,
}) => {
  const { message } = App.useApp();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) {
      setCandidates([]);
      setSearch('');
      return;
    }
    if (!phoneNumberId) return;
    setLoading(true);
    supabase
      .from('phone_number_links')
      .select('id,entity_type,entity_id,display_title,label')
      .eq('phone_number_id', phoneNumberId)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          void message.error(toFaErrorMessage(error, 'خطا در بارگذاری مخاطبین'));
          return;
        }
        setCandidates(data || []);
      });
  }, [visible, phoneNumberId, message]);

  const filtered = candidates
    .filter((c) => {
      const q = String(search || '').trim().toLowerCase();
      if (!q) return true;
      return (
        String(c.display_title || '').toLowerCase().includes(q)
        || String(c.label || '').toLowerCase().includes(q)
        || (ENTITY_LABELS[c.entity_type] || '').includes(q)
      );
    })
    .sort((left, right) => {
      const leftPriority = ENTITY_PRIORITY[left.entity_type] || 99;
      const rightPriority = ENTITY_PRIORITY[right.entity_type] || 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.display_title || '').localeCompare(String(right.display_title || ''), 'fa');
    });

  const handleSelect = useCallback(async (candidate: Candidate) => {
    setSaving(true);
    try {
      await onSelect({
        entityType: candidate.entity_type,
        entityId: candidate.entity_id,
        displayTitle: candidate.display_title || candidate.label || candidate.entity_id,
      });
      onClose();
    } catch (error: any) {
      void message.error(toFaErrorMessage(error, 'خطا در ذخیره انتخاب'));
    } finally {
      setSaving(false);
    }
  }, [message, onClose, onSelect]);

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={`انتخاب مخاطب برای شماره ${phone || ''}`}
      footer={null}
      width={420}
      destroyOnClose
    >
      {candidates.length > 3 && (
        <Input
          prefix={<SearchOutlined />}
          placeholder="جستجو در مخاطبین..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
          allowClear
        />
      )}
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : filtered.length === 0 ? (
        <Empty description="مخاطب احتمالی یافت نشد." />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={saving}
              onClick={() => void handleSelect(c)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-right transition-colors hover:border-[rgb(var(--brand-500-rgb,59,130,246))] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            >
              <div className="flex items-center gap-2">
                <Tag
                  color={ENTITY_COLORS[c.entity_type] || 'default'}
                  className="shrink-0 text-xs"
                >
                  {ENTITY_LABELS[c.entity_type] || c.entity_type}
                </Tag>
                <span className="min-w-0 truncate text-sm text-gray-800 dark:text-gray-100">
                  {c.display_title || c.label || c.entity_id}
                </span>
              </div>
              {c.label && c.display_title && c.label !== c.display_title ? (
                <div className="mt-0.5 truncate text-xs text-gray-400">{c.label}</div>
              ) : null}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>بستن</Button>
      </div>
    </Modal>
  );
};

export default React.memo(PhoneMatchPickerModal);
