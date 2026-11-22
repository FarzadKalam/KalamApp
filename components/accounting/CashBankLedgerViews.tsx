import React, { useEffect, useState } from 'react';
import { App, Button, Input, Modal, Space } from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { CASH_BANK_LEDGER_PRINT_ID, CASH_BANK_LEDGER_COLUMNS } from '../../utils/cashBankLedger';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AdaptiveSelectField from '../AdaptiveSelectField';

export interface LedgerViewState {
  filters: Record<string, any>;
  sort: { field: string; order: 'asc' | 'desc' };
}

type LedgerView = { id: string; name: string; config: LedgerViewState };

interface Props {
  orgId: string;
  userId: string;
  currentViewId: string | null;
  state: LedgerViewState;
  onSelect: (id: string | null, state: LedgerViewState) => void;
}

const defaultState: LedgerViewState = { filters: {}, sort: { field: 'date', order: 'desc' } };
const allowedColumns = new Set(CASH_BANK_LEDGER_COLUMNS.map(({ key }) => key));
const hasCustomState = (state: LedgerViewState) => Object.values(state.filters).some((value) => value != null)
  || state.sort.field !== defaultState.sort.field || state.sort.order !== defaultState.sort.order;

const CashBankLedgerViews: React.FC<Props> = ({ orgId, userId, currentViewId, state, onSelect }) => {
  const { message, modal } = App.useApp();
  const [views, setViews] = useState<LedgerView[]>([]);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('saved_views').select('id,name,config')
          .eq('org_id', orgId).eq('created_by', userId).eq('module_id', CASH_BANK_LEDGER_PRINT_ID)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (active) setViews(data || []);
      } catch (error) {
        if (active) message.error(toFaErrorMessage(error, 'دریافت نماهای نقد و بانک انجام نشد.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [message, orgId, userId]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('saved_views').insert({
        org_id: orgId, created_by: userId, module_id: CASH_BANK_LEDGER_PRINT_ID,
        name: name.trim(),
        config: {
          filters: Object.fromEntries(Object.entries(state.filters).filter(([key]) => allowedColumns.has(key))),
          sort: state.sort,
        },
      }).select('id,name,config').single();
      if (error) throw error;
      setViews((previous) => [data, ...previous]);
      onSelect(data.id, data.config);
      setOpen(false);
    } catch (error) {
      message.error(toFaErrorMessage(error, 'ذخیرهٔ نما انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!currentViewId) return;
    modal.confirm({
      title: 'حذف نمای انتخاب‌شده',
      okText: 'حذف',
      cancelText: 'انصراف',
      onOk: async () => {
        const { error } = await supabase.from('saved_views').delete().eq('id', currentViewId)
          .eq('org_id', orgId).eq('created_by', userId).eq('module_id', CASH_BANK_LEDGER_PRINT_ID);
        if (error) {
          message.error(toFaErrorMessage(error, 'حذف نما انجام نشد.'));
          return;
        }
        setViews((previous) => previous.filter(({ id }) => id !== currentViewId));
        onSelect(null, defaultState);
      },
    });
  };

  return <>
    <Space wrap className="mb-3">
      <AdaptiveSelectField
        aria-label="نمای نقد و بانک"
        pickerTitle="نمای نقد و بانک"
        className="min-w-40"
        loading={loading}
        value={currentViewId || (hasCustomState(state) ? 'current' : 'default')}
        options={[
          { value: 'default', label: 'همهٔ عملیات' },
          ...(hasCustomState(state) && !currentViewId ? [{ value: 'current', label: 'فیلتر جاری', disabled: true }] : []),
          ...views.map(({ id, name }) => ({ value: id, label: name })),
        ]}
        onChange={(id) => {
          const view = views.find((item) => item.id === id);
          onSelect(view?.id || null, view?.config || defaultState);
        }}
      />
      <Button aria-label="ذخیره به‌عنوان نما" icon={<SaveOutlined />} onClick={() => { setName(''); setOpen(true); }}>ذخیره به‌عنوان نما</Button>
      {currentViewId && <Button danger icon={<DeleteOutlined />} aria-label="حذف نما" onClick={remove} />}
    </Space>
    <Modal open={open} title="ذخیرهٔ نمای نقد و بانک" okText="ذخیره" cancelText="انصراف"
      confirmLoading={saving} okButtonProps={{ disabled: !name.trim() }}
      onCancel={() => { if (!saving) setOpen(false); }} onOk={() => void save()}>
      <label className="block">
        نام نما
        <Input className="mt-1" value={name} maxLength={100} onChange={(event) => setName(event.target.value)}
          onPressEnter={() => void save()} />
      </label>
    </Modal>
  </>;
};

export default CashBankLedgerViews;
