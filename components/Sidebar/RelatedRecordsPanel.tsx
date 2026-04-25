import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, List, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import RelatedRecordCard from './RelatedRecordCard';
import { FieldType, RelatedTabConfig, RelatedTabFilterConfig } from '../../types';
import {
  buildRelationValueMap,
  formatRecordDisplayValue,
  formatRecordFieldValue,
  RelationValueMap,
  resolveOptionLabel,
} from '../../utils/recordDisplayFormatter';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { getTaskStatusOption } from '../../utils/processTaskStatusOptions';
import { getModuleCardSummaryFields } from '../../utils/recordCardHelpers';
import { getRecordDisplayLabel } from '../../utils/recordLabel';

interface RelatedRecordsPanelProps {
  tab: RelatedTabConfig;
  currentRecordId: string;
  currentModuleId: string;
}

const SALES_PRODUCT_STATUSES = new Set(['confirmed', 'final', 'settled', 'completed']);
const PURCHASE_PRODUCT_STATUSES = new Set(['final', 'settled', 'completed']);
const PAYMENT_RELATION_TYPES = new Set(['customer_payments', 'customer_payments_from_field', 'supplier_payments']);
const PRODUCT_AGGREGATE_RELATION_TYPES = new Set(['customer_products', 'supplier_products']);
const PAYMENT_VISIBLE_KEYS = [
  'payment_type',
  'cheque_id',
  'barter_id',
  'target_account',
  'source_account',
  'spent_cheque_id',
  'responsible_id',
  'cheque_status',
  'date',
  'amount',
  'description',
];
const RELATION_BATCH_SIZE = 100;

const chunkValues = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getModuleTableName = (moduleId?: string | null) => {
  const normalized = String(moduleId || '').trim();
  return MODULES[normalized]?.table || normalized;
};

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const applyTabFilters = (query: any, filters?: RelatedTabFilterConfig[]) => {
  let nextQuery = query;
  (filters || []).forEach((filter) => {
    const field = String(filter?.field || '').trim();
    if (!field) return;
    const operator = String(filter?.operator || 'eq').trim();
    if (operator === 'neq') {
      nextQuery = nextQuery.neq(field, filter?.value);
      return;
    }
    if (operator === 'in') {
      const values = Array.isArray(filter?.value) ? filter.value : [filter?.value];
      const safeValues = values.filter((value) => value !== undefined);
      if (safeValues.length > 0) {
        nextQuery = nextQuery.in(field, safeValues);
      }
      return;
    }
    if (operator === 'is') {
      nextQuery = nextQuery.is(field, filter?.value ?? null);
      return;
    }
    nextQuery = nextQuery.eq(field, filter?.value);
  });
  return nextQuery;
};

const isMissingColumnError = (error: any) => {
  if (!error) return false;
  const code = String(error?.code || '').trim();
  if (code === '42703') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') && message.includes('column');
};

const fetchRecordPhoneNumberIds = async (entityType: string, entityId: string) => {
  const { data, error } = await supabase
    .from('phone_number_links')
    .select('phone_number_id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => String(row?.phone_number_id || '').trim()).filter(Boolean)));
};

const buildPaymentRows = (invoices: any[], relationLabel: string) => (
  (invoices || []).flatMap((invoice: any) =>
    (invoice.payments || []).map((payment: any, index: number) => ({
      id: `${invoice.id}_${index}`,
      invoice_id: invoice.id,
      invoice_name: invoice.name,
      __moduleId: invoice.__moduleId || 'invoices',
      __relationLabel: relationLabel,
      ...payment,
    })),
  )
);

const resolveStatusMeta = (item: any, moduleId: string) => {
  const moduleConfig = MODULES[moduleId];
  const statusField = (moduleConfig?.fields || []).find((field: any) => String(field?.key || '') === 'status');
  const rawValue = item?.status;
  if (!statusField || rawValue === undefined || rawValue === null || rawValue === '') return null;
  const option = moduleId === 'tasks'
    ? getTaskStatusOption(rawValue, item, statusField.options || [])
    : (statusField.options || []).find((entry: any) => String(entry?.value || '') === String(rawValue));
  return option
    ? { label: String(option.label || rawValue), color: String(option.color || 'default') }
    : null;
};

const RelatedRecordsPanel: React.FC<RelatedRecordsPanelProps> = ({ tab, currentRecordId, currentModuleId }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const [sourceFieldValue, setSourceFieldValue] = useState<any>(null);
  const [sourceFieldLoading, setSourceFieldLoading] = useState(false);
  const [relationValueMap, setRelationValueMap] = useState<RelationValueMap>({});
  const [paymentRelationValueMap, setPaymentRelationValueMap] = useState<RelationValueMap>({});
  const targetConfig = tab.targetModule ? MODULES[tab.targetModule] : undefined;
  const sourceConfig = MODULES[currentModuleId];
  const paymentModuleId = tab.relationType === 'supplier_payments' ? 'purchase_invoices' : 'invoices';
  const paymentBlock = useMemo(
    () => MODULES[paymentModuleId]?.blocks?.find((block: any) => String(block?.id || '') === 'payments'),
    [paymentModuleId],
  );
  const paymentColumns = useMemo(() => paymentBlock?.tableColumns || [], [paymentBlock]);
  const paymentColumnMap = useMemo(
    () => Object.fromEntries((paymentColumns || []).map((column: any) => [String(column.key), column])),
    [paymentColumns],
  );

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

  const aggregateSalesProducts = async (invoices: any[]) => {
    const aggregates = new Map<string, any>();
    const productIds = new Set<string>();

    (invoices || []).forEach((invoice: any) => {
      (invoice.invoiceItems || []).forEach((row: any) => {
        const productId = String(row?.product_id || '').trim();
        if (!productId) return;
        const key = productId;
        productIds.add(productId);
        const existing = aggregates.get(key) || {
          id: productId,
          __purchase_count: 0,
          __total_purchased_amount: 0,
        };
        existing.__purchase_count += 1;
        existing.__total_purchased_amount += toNumber(row?.total_price || (toNumber(row?.quantity) * toNumber(row?.unit_price)));
        aggregates.set(key, existing);
      });
    });

    const ids = Array.from(productIds);
    if (!ids.length) return [];

    const [productsRes, billboardsRes, bundlesRes] = await Promise.all([
      supabase.from('products').select('*').in('id', ids),
      supabase.from('billboards').select('*').in('id', ids),
      supabase.from('product_bundles').select('*').in('id', ids),
    ]);

    const recordMap = new Map<string, { moduleId: string; row: any }>();
    (productsRes.data || []).forEach((row: any) => recordMap.set(String(row.id), { moduleId: 'products', row }));
    (billboardsRes.data || []).forEach((row: any) => recordMap.set(String(row.id), { moduleId: 'billboards', row }));
    (bundlesRes.data || []).forEach((row: any) => {
      if (!recordMap.has(String(row.id))) {
        recordMap.set(String(row.id), { moduleId: 'product_bundles', row });
      }
    });

    return Array.from(aggregates.values())
      .map((item) => {
        const resolved = recordMap.get(String(item.id));
        if (!resolved) return null;
        return {
          ...resolved.row,
          __moduleId: resolved.moduleId,
          __purchase_count: item.__purchase_count,
          __total_purchased_amount: item.__total_purchased_amount,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => toNumber(b?.__total_purchased_amount) - toNumber(a?.__total_purchased_amount));
  };

  const aggregatePurchaseProducts = async (purchaseInvoices: any[]) => {
    const aggregates = new Map<string, any>();
    const productIds = new Set<string>();

    (purchaseInvoices || []).forEach((invoice: any) => {
      (invoice.invoiceItems || []).forEach((row: any) => {
        const productId = String(row?.product_id || '').trim();
        if (!productId) return;
        productIds.add(productId);
        const existing = aggregates.get(productId) || {
          id: productId,
          __purchase_count: 0,
          __total_purchased_amount: 0,
        };
        existing.__purchase_count += 1;
        existing.__total_purchased_amount += toNumber(row?.total_price || (toNumber(row?.quantity) * toNumber(row?.unit_price)));
        aggregates.set(productId, existing);
      });
    });

    const ids = Array.from(productIds);
    if (!ids.length) return [];

    const { data } = await supabase.from('products').select('*').in('id', ids);
    const byId = new Map((data || []).map((row: any) => [String(row.id), row]));

    return Array.from(aggregates.values())
      .map((item) => {
        const row = byId.get(String(item.id));
        if (!row) return null;
        return {
          ...row,
          __moduleId: 'products',
          __purchase_count: item.__purchase_count,
          __total_purchased_amount: item.__total_purchased_amount,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => toNumber(b?.__total_purchased_amount) - toNumber(a?.__total_purchased_amount));
  };

  useEffect(() => {
    const loadSourceField = async () => {
      if (!tab.sourceField) {
        setSourceFieldValue(null);
        return;
      }
      setSourceFieldLoading(true);
      try {
        const sourceTable = sourceConfig?.table || currentModuleId;
        const { data, error } = await (supabase
          .from(sourceTable as any)
          .select(tab.sourceField)
          .eq('id', currentRecordId)
          .maybeSingle() as any);
        if (error) throw error;
        setSourceFieldValue((data as any)?.[tab.sourceField] ?? null);
      } catch (err) {
        console.warn('Could not load source field for related tab', err);
        setSourceFieldValue(null);
      } finally {
        setSourceFieldLoading(false);
      }
    };

    void loadSourceField();
  }, [currentModuleId, currentRecordId, sourceConfig?.table, tab.sourceField]);

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);
      try {
        if (tab.relationType === 'customer_payments' || tab.relationType === 'customer_payments_from_field') {
          const customerId = tab.relationType === 'customer_payments_from_field' ? sourceFieldValue : currentRecordId;
          if (!customerId) {
            setItems([]);
            return;
          }

          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, name, payments, created_at')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false });

          setItems(buildPaymentRows((invoices || []).map((row: any) => ({ ...row, __moduleId: 'invoices' })), 'دریافت مرتبط'));
          return;
        }

        if (tab.relationType === 'supplier_payments') {
          const { data: invoices } = await supabase
            .from('purchase_invoices')
            .select('id, name, payments, created_at')
            .eq('supplier_id', currentRecordId)
            .order('created_at', { ascending: false });

          setItems(buildPaymentRows((invoices || []).map((row: any) => ({ ...row, __moduleId: 'purchase_invoices' })), 'پرداخت مرتبط'));
          return;
        }

        if (tab.relationType === 'customer_products') {
          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, name, status, invoiceItems, created_at')
            .eq('customer_id', currentRecordId)
            .in('status', Array.from(SALES_PRODUCT_STATUSES))
            .order('created_at', { ascending: false });

          setItems(await aggregateSalesProducts(invoices || []));
          return;
        }

        if (tab.relationType === 'supplier_products') {
          const { data: invoices } = await supabase
            .from('purchase_invoices')
            .select('id, name, status, invoiceItems, created_at')
            .eq('supplier_id', currentRecordId)
            .in('status', Array.from(PURCHASE_PRODUCT_STATUSES))
            .order('created_at', { ascending: false });

          setItems(await aggregatePurchaseProducts(invoices || []));
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
          const customerRows: any[] = [];
          for (const idBatch of chunkValues(customerIds, RELATION_BATCH_SIZE)) {
            const { data, error } = await supabase.from('customers').select('*').in('id', idBatch);
            if (error) throw error;
            customerRows.push(...(data || []));
          }
          setItems(customerRows);
          await fetchProfileNames(customerRows);
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
          const { data } = await supabase.from(getModuleTableName(tab.targetModule)).select('*').in('id', ids);
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'jsonb_contains' && tab.targetModule && tab.jsonbColumn) {
          const matchKey = tab.jsonbMatchKey || 'product_id';
          const matchPayload = JSON.stringify([{ [matchKey]: currentRecordId }]);
          const { data } = await applyTabFilters(
            supabase
              .from(getModuleTableName(tab.targetModule))
              .select('*')
              .filter(tab.jsonbColumn, 'cs', matchPayload),
            tab.filters,
          );
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'fk_from_field' && tab.targetModule && tab.foreignKey) {
          if (!sourceFieldValue) {
            setItems([]);
            return;
          }
          let query = applyTabFilters(
            supabase
              .from(getModuleTableName(tab.targetModule))
              .select('*')
              .eq(tab.foreignKey, sourceFieldValue),
            tab.filters,
          );
          if (tab.targetModule === currentModuleId) {
            query = query.neq('id', currentRecordId);
          }
          const { data } = await query;
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'record_context' && tab.targetModule) {
          const { data } = await applyTabFilters(
            supabase
              .from(getModuleTableName(tab.targetModule))
              .select('*')
              .eq('module_id', currentModuleId)
              .eq('record_id', currentRecordId),
            tab.filters,
          ).order('created_at', { ascending: false });
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.relationType === 'phone_directory' && tab.targetModule) {
          const phoneNumberIds = await fetchRecordPhoneNumberIds(currentModuleId, currentRecordId);
          if (!phoneNumberIds.length) {
            setItems([]);
            return;
          }

          const orderField = tab.targetModule === 'sms_delivery_reports' ? 'message_at' : 'created_at';
          const { data } = await applyTabFilters(
            supabase
              .from(getModuleTableName(tab.targetModule))
              .select('*')
              .in('phone_number_id', phoneNumberIds),
            tab.filters,
          ).order(orderField, { ascending: false });
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        if (tab.targetModule && tab.foreignKey) {
          const { data } = await applyTabFilters(
            supabase
              .from(getModuleTableName(tab.targetModule))
              .select('*')
              .eq(tab.foreignKey, currentRecordId),
            tab.filters,
          );
          setItems(data || []);
          await fetchProfileNames(data || []);
          return;
        }

        setItems([]);
      } catch (error: any) {
        if (isMissingColumnError(error)) {
          console.warn('Related tab query skipped because a configured column does not exist', {
            tabKey: tab?.id || tab?.title || tab?.targetModule,
            relationType: tab?.relationType,
            targetModule: tab?.targetModule,
            error,
          });
        } else {
          console.warn('Could not load related records', error);
        }
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchRelated();
  }, [tab, currentRecordId, currentModuleId, sourceFieldValue]);

  useEffect(() => {
    let cancelled = false;

    const loadRelationMaps = async () => {
      if (!items.length) {
        setRelationValueMap({});
        setPaymentRelationValueMap({});
        return;
      }

      if (PAYMENT_RELATION_TYPES.has(String(tab.relationType || ''))) {
        const paymentMap = await buildRelationValueMap(supabase, paymentColumns, items);
        if (!cancelled) {
          setPaymentRelationValueMap(paymentMap);
          setRelationValueMap({});
        }
        return;
      }

      if (PRODUCT_AGGREGATE_RELATION_TYPES.has(String(tab.relationType || ''))) {
        setRelationValueMap({});
        setPaymentRelationValueMap({});
        return;
      }

      const summaryFields = getModuleCardSummaryFields(targetConfig, ['status', 'full_name'], 8);
      const fields = Array.from(
        new Map(
          [...(summaryFields || []), ...(targetConfig?.fields || []).filter((field: any) => field?.isKey)]
            .filter((field: any) => field?.key)
            .map((field: any) => [String(field.key), field])
        ).values()
      );
      if (!fields.length) {
        setRelationValueMap({});
        return;
      }

      const genericMap = await buildRelationValueMap(supabase, fields, items);
      if (!cancelled) {
        setRelationValueMap(genericMap);
        setPaymentRelationValueMap({});
      }
    };

    void loadRelationMaps();
    return () => {
      cancelled = true;
    };
  }, [items, paymentColumns, tab.relationType, targetConfig]);

  const filteredItems = useMemo(() => {
    if (!searchValue.trim()) return items;
    const term = searchValue.toLowerCase();

    if (PAYMENT_RELATION_TYPES.has(String(tab.relationType || ''))) {
      return items.filter((item: any) => {
        return [item.invoice_name, item.payment_type, item.status, item.target_account, item.source_account, item.amount, item.date]
          .map(formatValue)
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
    }

    if (PRODUCT_AGGREGATE_RELATION_TYPES.has(String(tab.relationType || ''))) {
      return items.filter((item: any) => {
        const moduleId = String(item?.__moduleId || '');
        const moduleConfig = MODULES[moduleId];
        const title = getRecordDisplayLabel(item, moduleId, { fallback: '' });
        return [
          title,
          moduleConfig?.titles?.faSingular,
          item?.system_code,
          item?.manual_code,
        ].map(formatValue).join(' ').toLowerCase().includes(term);
      });
    }

    return items.filter((item: any) => {
      const title = getRecordDisplayLabel(item, tab.targetModule, { fallback: '' });
      if (String(title).toLowerCase().includes(term)) return true;
      return (targetConfig?.fields || [])
        .filter((field) => field.isTableColumn)
        .some((field) => formatValue(item?.[field.key]).toLowerCase().includes(term));
    });
  }, [items, searchValue, tab.relationType, targetConfig]);

  if (loading || sourceFieldLoading) return <div className="flex justify-center p-10"><Spin /></div>;
  if (!filteredItems.length) return <Empty description="موردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const buildInitialValues = () => {
    if (tab.relationType === 'fk' && tab.foreignKey) {
      return { [tab.foreignKey]: currentRecordId };
    }
    if (tab.relationType === 'fk_from_field' && tab.foreignKey && sourceFieldValue) {
      return { [tab.foreignKey]: sourceFieldValue };
    }
    if (tab.relationType === 'jsonb_contains' && tab.targetModule === 'invoices' && tab.jsonbMatchKey) {
      return { invoiceItems: [{ [tab.jsonbMatchKey]: currentRecordId, quantity: 1 }] };
    }
    if (tab.relationType === 'customer_payments_from_field' && sourceFieldValue) {
      return { customer_id: sourceFieldValue };
    }
    return {};
  };

  const canCreate = Boolean(tab.targetModule)
    && !PAYMENT_RELATION_TYPES.has(String(tab.relationType || ''))
    && tab.disableCreate !== true;

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

      {PAYMENT_RELATION_TYPES.has(String(tab.relationType || '')) ? (
        <List
          dataSource={filteredItems}
          renderItem={(item: any) => {
            const statusField = paymentColumnMap.status;
            const rawStatus = String(item?.status || '').trim();
            const statusOption = (statusField?.options || []).find((option: any) => String(option?.value || '') === rawStatus);
            const visibleFields = PAYMENT_VISIBLE_KEYS
              .map((key) => paymentColumnMap[key])
              .filter(Boolean)
              .filter((field: any) => item?.[field.key] !== undefined && item?.[field.key] !== null && item?.[field.key] !== '');

            return (
              <Link to={`/${item.__moduleId}/${item.invoice_id}`} className="block">
                <div className="mb-3 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-gradient-to-b from-white to-gray-50 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:from-[#1d1d1d] dark:to-[#171717]">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-gray-800 dark:text-gray-100">
                        {formatRecordDisplayValue(item.invoice_name || 'فاکتور')}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-300">
                        {item.__relationLabel || 'پرداخت مرتبط'}
                      </div>
                    </div>
                    {statusOption ? (
                      <Tag
                        className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[11px] !font-semibold"
                        color={String(statusOption?.color || 'default')}
                      >
                        {statusOption.label}
                      </Tag>
                    ) : null}
                  </div>

                  <div className="space-y-2 text-xs">
                    {visibleFields.map((field: any) => (
                      <div key={field.key} className="grid grid-cols-[92px_1fr] gap-2 items-start border-b border-gray-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-gray-800">
                        <span className="text-gray-500 dark:text-gray-400">{field.title || field.key}</span>
                        <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                          {resolveOptionLabel(item?.[field.key], field) || formatRecordFieldValue(item, field, paymentRelationValueMap)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            );
          }}
        />
      ) : PRODUCT_AGGREGATE_RELATION_TYPES.has(String(tab.relationType || '')) ? (
        <List
          dataSource={filteredItems}
          renderItem={(item: any) => {
            const moduleId = String(item?.__moduleId || 'products');
            const moduleConfig = MODULES[moduleId];
            const title = getRecordDisplayLabel(item, moduleId, { fallback: '-' });
            const statusMeta = resolveStatusMeta(item, moduleId);
            const codeLabel = String(item?.system_code || item?.manual_code || '').trim();

            return (
              <Link to={`/${moduleId}/${item.id}`} className="block">
                <div className="mb-3 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-gradient-to-b from-white to-gray-50 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:from-[#1d1d1d] dark:to-[#171717]">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-gray-800 dark:text-gray-100" title={title}>
                        {toPersianNumber(title)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-300">
                        {moduleConfig?.titles?.faSingular || moduleConfig?.titles?.fa || moduleId}
                        {codeLabel ? ` • ${toPersianNumber(codeLabel)}` : ''}
                      </div>
                    </div>
                    {statusMeta ? (
                      <Tag
                        className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[11px] !font-semibold"
                        color={statusMeta.color}
                      >
                        {statusMeta.label}
                      </Tag>
                    ) : null}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-[110px_1fr] gap-2 items-start border-b border-gray-100 pb-1.5 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400">جمع مبلغ خریداری شده</span>
                      <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                        {formatRecordDisplayValue(item?.__total_purchased_amount, { key: '__total_purchased_amount', type: FieldType.PRICE })}
                      </span>
                    </div>
                    <div className="grid grid-cols-[110px_1fr] gap-2 items-start">
                      <span className="text-gray-500 dark:text-gray-400">تعداد دفعات خریداری شده</span>
                      <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                        {formatRecordDisplayValue(item?.__purchase_count, { key: '__purchase_count', type: FieldType.NUMBER })}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          }}
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
              relationValueMap={relationValueMap}
            />
          )}
        />
      )}
    </div>
  );
};

export default RelatedRecordsPanel;
