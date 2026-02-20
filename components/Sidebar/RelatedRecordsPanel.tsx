import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, List, Spin, Empty, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import RelatedRecordCard from './RelatedRecordCard';
import { RelatedTabConfig } from '../../types';
import { getRecordTitle } from '../../utils/recordTitle';

interface RelatedRecordsPanelProps {
  tab: RelatedTabConfig;
  currentRecordId: string;
}

const RelatedRecordsPanel: React.FC<RelatedRecordsPanelProps> = ({ tab, currentRecordId }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const targetConfig = tab.targetModule ? MODULES[tab.targetModule] : undefined;

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '';
    if (Array.isArray(val)) return val.join(' ');
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '';
      }
    }
    return String(val);
  };

  const extractProductIds = (invoiceItems: any[]) => {
    const ids = new Set<string>();
    (invoiceItems || []).forEach((row) => {
      if (row?.product_id) ids.add(String(row.product_id));
    });
    return Array.from(ids);
  };

  const fetchProfileNames = async (records: any[]) => {
    const ids = new Set<string>();
    records.forEach((row) => {
      if (row?.assignee_id) ids.add(String(row.assignee_id));
      if (row?.responsible_id) ids.add(String(row.responsible_id));
    });
    const idList = Array.from(ids);
    if (!idList.length) {
      setProfileNameMap({});
      return;
    }
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', idList);
    const map: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      map[row.id] = row.full_name || row.id;
    });
    setProfileNameMap(map);
  };

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);
      try {
        if (tab.relationType === 'customer_payments') {
          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, name, payments, created_at')
            .eq('customer_id', currentRecordId)
            .order('created_at', { ascending: false });

          const payments = (invoices || []).flatMap((invoice: any) =>
            (invoice.payments || []).map((payment: any, index: number) => ({
              id: `${invoice.id}_${index}`,
              invoice_id: invoice.id,
              invoice_name: invoice.name,
              ...payment,
            }))
          );

          setItems(payments);
          return;
        }

        if (tab.relationType === 'customer_products') {
          const { data: invoices } = await supabase
            .from('invoices')
            .select('invoiceItems')
            .eq('customer_id', currentRecordId);

          const productIds = new Set<string>();
          (invoices || []).forEach((invoice: any) => {
            extractProductIds(invoice.invoiceItems || []).forEach((id) => productIds.add(id));
          });

          const idList = Array.from(productIds);
          if (!idList.length) {
            setItems([]);
            return;
          }

          const { data } = await supabase.from('products').select('*').in('id', idList);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'product_customers') {
          const matchKey = tab.jsonbMatchKey || 'product_id';
          const matchPayload = JSON.stringify([{ [matchKey]: currentRecordId }]);
          const { data: invoices } = await supabase
            .from('invoices')
            .select('customer_id')
            .filter('invoiceItems', 'cs', matchPayload);

          const customerIds = Array.from(new Set((invoices || []).map((row: any) => row.customer_id).filter(Boolean)));
          if (!customerIds.length) {
            setItems([]);
            return;
          }
          const { data } = await supabase.from('customers').select('*').in('id', customerIds);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'join_table' && tab.joinTable && tab.joinSourceKey && tab.joinTargetKey && tab.targetModule) {
          const joinTargetKey = tab.joinTargetKey as string;
          const joinSourceKey = tab.joinSourceKey as string;
          const { data: links, error } = await supabase
            .from(tab.joinTable)
            .select(joinTargetKey)
            .eq(joinSourceKey, currentRecordId);

          if (error) throw error;
          const ids = Array.from(new Set((links || []).map((row: any) => row[joinTargetKey]).filter(Boolean)));
          if (!ids.length) {
            setItems([]);
            return;
          }
          const { data } = await supabase.from(tab.targetModule).select('*').in('id', ids);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'jsonb_contains' && tab.targetModule && tab.jsonbColumn) {
          const matchKey = tab.jsonbMatchKey || 'product_id';
          const matchPayload = JSON.stringify([{ [matchKey]: currentRecordId }]);
          const { data } = await supabase
            .from(tab.targetModule)
            .select('*')
            .filter(tab.jsonbColumn, 'cs', matchPayload);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.targetModule && tab.foreignKey) {
          const { data } = await supabase
            .from(tab.targetModule)
            .select('*')
            .eq(tab.foreignKey, currentRecordId);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRelated();
  }, [tab, currentRecordId]);

  const filteredItems = useMemo(() => {
    if (!searchValue.trim()) return items;
    const term = searchValue.toLowerCase();

    if (tab.relationType === 'customer_payments') {
      return items.filter((item: any) => {
        return [item.invoice_name, item.payment_type, item.status, item.target_account, item.amount, item.date]
          .map(formatValue)
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
    }

    return items.filter((item: any) => {
      const title = getRecordTitle(item, targetConfig, { fallback: '' });
      if (String(title).toLowerCase().includes(term)) return true;
      return (targetConfig?.fields || [])
        .filter((field) => field.isTableColumn)
        .some((field) => formatValue(item?.[field.key]).toLowerCase().includes(term));
    });
  }, [items, searchValue, tab.relationType, targetConfig]);

  if (loading) return <div className="flex justify-center p-10"><Spin /></div>;
  if (!filteredItems.length) return <Empty description="موردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const buildInitialValues = () => {
    if (tab.relationType === 'fk' && tab.foreignKey) {
      return { [tab.foreignKey]: currentRecordId };
    }
    if (tab.relationType === 'jsonb_contains' && tab.targetModule === 'invoices' && tab.jsonbMatchKey) {
      return { invoiceItems: [{ [tab.jsonbMatchKey]: currentRecordId, quantity: 1 }] };
    }
    return {};
  };

  const canCreate = Boolean(tab.targetModule);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-gray-500">{tab.title}</div>
        {canCreate && (
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/${tab.targetModule}/create`, { state: { initialValues: buildInitialValues() } })}
          >
            افزودن
          </Button>
        )}
      </div>
      <Input
        placeholder="جستجو..."
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        className="mb-4 rounded-lg"
      />

      {tab.relationType === 'customer_payments' ? (
        <List
          dataSource={filteredItems}
          renderItem={(item: any) => (
            <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 p-3 rounded-xl mb-3">
              <div className="font-bold text-gray-800 dark:text-gray-200">{item.invoice_name || 'فاکتور'}</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {item.status && <Tag className="text-[10px] m-0" color="blue">{item.status}</Tag>}
                {item.payment_type && <Tag className="text-[10px] m-0">{item.payment_type}</Tag>}
                {item.target_account && <Tag className="text-[10px] m-0">{item.target_account}</Tag>}
                {item.amount && <Tag className="text-[10px] m-0">{item.amount}</Tag>}
                {item.date && <Tag className="text-[10px] m-0">{item.date}</Tag>}
              </div>
            </div>
          )}
        />
      ) : (
        <List
          dataSource={filteredItems}
          renderItem={(item: any) => (
            <RelatedRecordCard
              moduleId={tab.targetModule || ''}
              item={item}
              moduleConfig={targetConfig}
              profileNameMap={profileNameMap}
            />
          )}
        />
      )}
    </div>
  );
};

export default RelatedRecordsPanel;
