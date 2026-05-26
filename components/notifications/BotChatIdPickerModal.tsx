import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Modal, Skeleton, Tabs, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type SearchResult = {
  id: string;
  title: string;
  moduleId: string;
};

export type BotChatIdSelection = {
  moduleId: string;
  recordId: string;
  displayTitle: string;
};

type BotGroupRow = {
  id: string;
  target_type?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  counterparty_label?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  chatId: string;
  selectedGroup: BotGroupRow | null;
  onSelect: (selection: BotChatIdSelection) => Promise<void> | void;
};

const MODULE_SEARCH_CONFIG: { moduleId: string; label: string; table: string; nameField: string; color: string }[] = [
  { moduleId: 'customers', label: 'مشتری', table: 'customers', nameField: 'full_name', color: 'blue' },
  { moduleId: 'suppliers', label: 'تامین‌کننده', table: 'suppliers', nameField: 'business_name', color: 'green' },
  { moduleId: 'profiles', label: 'کاربر سازمان', table: 'profiles', nameField: 'full_name', color: 'purple' },
];

const useModuleSearch = (moduleId: string, table: string, nameField: string, query: string) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = String(query || '').trim();
    if (!q || q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void supabase
        .from(table)
        .select(`id,${nameField}`)
        .ilike(nameField, `%${q}%`)
        .limit(8)
        .then(({ data }) => {
          setLoading(false);
          setResults(
            (data || []).map((r: any) => ({
              id: String(r.id || ''),
              title: String(r[nameField] || r.id || ''),
              moduleId,
            })),
          );
        }, () => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, moduleId, table, nameField]);

  return { results, loading };
};

const ModuleSearchPane: React.FC<{
  config: typeof MODULE_SEARCH_CONFIG[0];
  saving: boolean;
  onSelect: (result: SearchResult) => void;
  preselectedId?: string | null;
  preselectedTitle?: string | null;
}> = ({ config, saving, onSelect, preselectedId, preselectedTitle }) => {
  const [query, setQuery] = useState('');
  const { results, loading } = useModuleSearch(config.moduleId, config.table, config.nameField, query);

  return (
    <div className="space-y-2">
      {preselectedId && preselectedTitle && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">پیشنهاد (از گروه بات):</div>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSelect({ id: preselectedId, title: preselectedTitle, moduleId: config.moduleId })}
            className="w-full rounded-lg border-2 border-dashed border-[rgb(var(--brand-400-rgb,96,165,250))] bg-[rgba(var(--brand-50-rgb,239,246,255),0.7)] px-3 py-2 text-right transition-colors hover:bg-[rgba(var(--brand-100-rgb,219,234,254),0.7)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[rgba(var(--brand-400-rgb,96,165,250),0.4)] dark:bg-[rgba(var(--brand-900-rgb,30,58,138),0.2)]"
          >
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{preselectedTitle}</span>
          </button>
        </div>
      )}
      <Input
        prefix={<SearchOutlined />}
        placeholder={`جستجو در ${config.label}ها...`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        allowClear
        autoFocus
      />
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : results.length === 0 && query.trim() ? (
        <Empty description="نتیجه‌ای یافت نشد." className="my-3" />
      ) : (
        <div className="space-y-1.5 mt-2">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={saving}
              onClick={() => onSelect(r)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right transition-colors hover:border-[rgb(var(--brand-400-rgb,96,165,250))] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
            >
              <span className="text-sm text-gray-800 dark:text-gray-100">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const BotChatIdPickerModal: React.FC<Props> = ({
  visible,
  onClose,
  chatId,
  selectedGroup,
  onSelect,
}) => {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('customers');

  useEffect(() => {
    if (!visible) return;
    const targetType = String(selectedGroup?.target_type || '').trim();
    if (targetType === 'suppliers') setActiveTab('suppliers');
    else setActiveTab('customers');
  }, [visible, selectedGroup]);

  const handleSelect = useCallback(async (result: SearchResult) => {
    setSaving(true);
    try {
      await onSelect({
        moduleId: result.moduleId,
        recordId: result.id,
        displayTitle: result.title,
      });
      onClose();
    } catch (error: any) {
      void message.error(toFaErrorMessage(error, 'خطا در ذخیره شناسه'));
    } finally {
      setSaving(false);
    }
  }, [message, onClose, onSelect]);

  const groupTargetType = String(selectedGroup?.target_type || '').trim();
  const groupCustomerId = String(selectedGroup?.customer_id || '').trim() || null;
  const groupSupplierId = String(selectedGroup?.supplier_id || '').trim() || null;
  const groupLabel = String(selectedGroup?.counterparty_label || '').trim() || null;

  const tabItems = MODULE_SEARCH_CONFIG.map((cfg) => {
    const isLinkedType =
      (cfg.moduleId === 'customers' && groupTargetType === 'customers' && groupCustomerId) ||
      (cfg.moduleId === 'suppliers' && groupTargetType === 'suppliers' && groupSupplierId);

    return {
      key: cfg.moduleId,
      label: <span><Tag color={cfg.color} className="text-xs">{cfg.label}</Tag></span>,
      children: (
        <ModuleSearchPane
          config={cfg}
          saving={saving}
          onSelect={handleSelect}
          preselectedId={
            isLinkedType
              ? (cfg.moduleId === 'customers' ? groupCustomerId : groupSupplierId)
              : null
          }
          preselectedTitle={isLinkedType ? groupLabel : null}
        />
      ),
    };
  });

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={`شناسایی مخاطب برای شناسه: ${chatId}`}
      footer={null}
      width={460}
      destroyOnClose
    >
      <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        با انتخاب یک رکورد، این شناسه به آن مخاطب متصل می‌شود و پیام‌های بعدی با نام ایشان نمایش داده می‌شوند.
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>بستن</Button>
      </div>
    </Modal>
  );
};

export default React.memo(BotChatIdPickerModal);
