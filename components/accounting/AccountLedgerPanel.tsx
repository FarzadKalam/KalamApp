import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Table, Tag, Typography } from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import type { FilterConfirmProps } from 'antd/es/table/interface';
import { PrinterOutlined, ReloadOutlined, SearchOutlined, ShareAltOutlined } from '@ant-design/icons';
import PersianDatePicker from '../PersianDatePicker';
import { supabase } from '../../supabaseClient';
import RelatedRecordPopover from '../RelatedRecordPopover';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../../utils/permissions';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { selectByIdsWithCompatibleColumns } from '../../utils/selectCompat';

const { Text } = Typography;

type AccountLedgerPanelProps = {
  accountId: string;
  accountCode?: string | null;
  accountName?: string | null;
};

type AccountNode = {
  id: string;
  parent_id: string | null;
  is_leaf: boolean;
  is_active: boolean;
};

type LedgerRow = {
  key: string;
  row_kind: 'opening' | 'line';
  child_account_code: string;
  child_account_name: string;
  entry_no: string;
  entry_date: string;
  line_no: number | string;
  source_label: string;
  party_label: string;
  description: string;
  debit: number | null;
  credit: number | null;
  running_balance: number;
  running_side: string;
  sourceRelation?: { moduleId: string; recordId: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const AccountLedgerPanel: React.FC<AccountLedgerPanelProps> = ({ accountId, accountCode, accountName }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [canView, setCanView] = useState(true);
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [rows, setRows] = useState<LedgerRow[]>([]);

  const copyShareLink = useCallback(async () => {
    const shareUrl = typeof window !== 'undefined' ? `${window.location.href}#account-ledger` : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'گردش حسابداری حساب', url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      message.success('لینک بخش گردش حسابداری کپی شد.');
    } catch {
      message.error('اشتراک گذاری این بخش ناموفق بود.');
    }
  }, [message]);

  const textFilter = useCallback(
    (placeholder: string, getter: (record: LedgerRow) => string): ColumnType<LedgerRow> => ({
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
          <input
            className="ant-input"
            placeholder={placeholder}
            value={String(selectedKeys[0] || '')}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
            }}
          />
          <div className="mt-2 flex gap-2">
            <Button type="primary" size="small" onClick={() => confirm({ closeDropdown: true } as FilterConfirmProps)} icon={<SearchOutlined />}>
              بگرد
            </Button>
            <Button size="small" onClick={() => { clearFilters?.(); confirm({ closeDropdown: true } as FilterConfirmProps); }}>
              حذف
            </Button>
            <Button type="link" size="small" onClick={() => close()}>
              بستن
            </Button>
          </div>
        </div>
      ),
      filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? 'rgb(var(--brand-500-rgb))' : undefined }} />,
      onFilter: (value, record) => getter(record).toLowerCase().includes(String(value || '').toLowerCase()),
    }),
    []
  );

  const runReport = useCallback(async () => {
    if (!accountId) return;
    if (!dateFrom || !dateTo) {
      message.warning('بازه زمانی را کامل کنید.');
      return;
    }
    if (dateFrom > dateTo) {
      message.warning('تاریخ شروع نباید از تاریخ پایان بزرگ‌تر باشد.');
      return;
    }

    setExecuting(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const allowView =
        accountingPerms.view !== false &&
        permissions?.journal_entries?.view !== false &&
        permissions?.chart_of_accounts?.view !== false;
      setCanView(allowView);
      if (!allowView) {
        setRows([]);
        return;
      }

      const { data: accountRows, error: accountError } = await supabase
        .from('chart_of_accounts')
        .select('id,parent_id,is_leaf,is_active')
        .eq('is_active', true)
        .limit(4000);
      if (accountError) throw accountError;

      const nodes = ((accountRows || []) as any[]).map((row) => ({
        id: String(row.id),
        parent_id: row.parent_id ? String(row.parent_id) : null,
        is_leaf: row.is_leaf !== false,
        is_active: row.is_active !== false,
      })) as AccountNode[];
      const childrenByParent = new Map<string, AccountNode[]>();
      nodes.forEach((row) => {
        const parent = String(row.parent_id || '');
        const current = childrenByParent.get(parent) || [];
        current.push(row);
        childrenByParent.set(parent, current);
      });

      const leafIds: string[] = [];
      const queue = [accountId];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const current = String(queue.shift() || '').trim();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        const children = childrenByParent.get(current) || [];
        if (children.length === 0) {
          leafIds.push(current);
          continue;
        }
        children.forEach((child) => {
          if (child.is_leaf) leafIds.push(child.id);
          else queue.push(child.id);
        });
      }
      const scopedIds = Array.from(new Set(leafIds.length ? leafIds : [accountId]));

      const { data, error } = await supabase
        .from('journal_lines')
        .select(
          'id,line_no,description,debit,credit,party_type,party_id,account_id,journal_entries!inner(id,entry_no,entry_date,description,status,source_table,source_record_id,source_record_title),chart_of_accounts:account_id(code,name)'
        )
        .in('account_id', scopedIds)
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.entry_date', dateTo)
        .limit(20000);
      if (error) throw error;

      const normalized = ((data || []) as any[]).map((row) => {
        const entry = Array.isArray(row?.journal_entries) ? row.journal_entries[0] : row?.journal_entries;
        const account = Array.isArray(row?.chart_of_accounts) ? row.chart_of_accounts[0] : row?.chart_of_accounts;
        return {
          id: String(row.id),
          line_no: Number(row.line_no || 0),
          description: String(row.description || entry?.description || ''),
          debit: Number(row.debit || 0),
          credit: Number(row.credit || 0),
          party_type: String(row.party_type || ''),
          party_id: row.party_id ? String(row.party_id) : '',
          account_id: String(row.account_id || ''),
          child_account_code: String(account?.code || '-'),
          child_account_name: String(account?.name || '-'),
          entry_no: String(entry?.entry_no || '-'),
          entry_date_raw: String(entry?.entry_date || ''),
          entry_date: safeJalaliFormat(entry?.entry_date, 'YYYY/MM/DD') || '-',
          source_label: String(entry?.source_record_title || entry?.source_table || '-'),
          sourceRelation:
            entry?.source_table && entry?.source_record_id
              ? { moduleId: String(entry.source_table), recordId: String(entry.source_record_id) }
              : null,
        };
      });

      const customerIds = Array.from(new Set(normalized.filter((row) => row.party_type === 'customer' && row.party_id).map((row) => row.party_id)));
      const supplierIds = Array.from(new Set(normalized.filter((row) => row.party_type === 'supplier' && row.party_id).map((row) => row.party_id)));
      const employeeIds = Array.from(new Set(normalized.filter((row) => row.party_type === 'employee' && row.party_id).map((row) => row.party_id)));

      const [customersRes, suppliersRes, employeesRes] = await Promise.all([
        customerIds.length
          ? selectByIdsWithCompatibleColumns<any>({
              cacheKey: 'account-ledger:customers',
              columns: ['id', 'first_name', 'last_name', 'business_name', 'full_name', 'system_code'],
              ids: customerIds,
            batchSize: 25,
              execute: (selectExpr, idBatch) =>
                supabase.from('customers').select(selectExpr).in('id', idBatch),
            })
          : Promise.resolve({ data: [], error: null, selectedColumns: [] } as any),
        supplierIds.length
          ? selectByIdsWithCompatibleColumns<any>({
              cacheKey: 'account-ledger:suppliers',
              columns: ['id', 'business_name', 'full_name', 'system_code'],
              ids: supplierIds,
            batchSize: 25,
              execute: (selectExpr, idBatch) =>
                supabase.from('suppliers').select(selectExpr).in('id', idBatch),
            })
          : Promise.resolve({ data: [], error: null, selectedColumns: [] } as any),
        employeeIds.length
          ? selectByIdsWithCompatibleColumns<any>({
              cacheKey: 'account-ledger:profiles',
              columns: ['id', 'full_name'],
              ids: employeeIds,
              batchSize: 80,
              execute: (selectExpr, idBatch) =>
                supabase.from('profiles').select(selectExpr).in('id', idBatch),
            })
          : Promise.resolve({ data: [], error: null, selectedColumns: [] } as any),
      ]);
      if (customersRes.error || suppliersRes.error || employeesRes.error) throw customersRes.error || suppliersRes.error || employeesRes.error;

      const customerMap = Object.fromEntries(((customersRes.data || []) as any[]).map((row) => [
        String(row.id),
        `${String(row.first_name || '')} ${String(row.last_name || '')}`.trim() || String(row.business_name || '-'),
      ]));
      const supplierMap = Object.fromEntries(((suppliersRes.data || []) as any[]).map((row) => [String(row.id), String(row.business_name || '-')]));
      const employeeMap = Object.fromEntries(((employeesRes.data || []) as any[]).map((row) => [String(row.id), String(row.full_name || '-')]));

      const resolvePartyLabel = (partyType: string, partyId: string) => {
        if (!partyId) return '-';
        if (partyType === 'customer') return customerMap[partyId] || partyId;
        if (partyType === 'supplier') return supplierMap[partyId] || partyId;
        if (partyType === 'employee') return employeeMap[partyId] || partyId;
        return '-';
      };

      const grouped = new Map<string, typeof normalized>();
      normalized.forEach((row) => {
        const key = row.account_id;
        const current = grouped.get(key) || [];
        current.push(row);
        grouped.set(key, current);
      });

      const result: LedgerRow[] = [];
      Array.from(grouped.entries())
        .sort((a, b) => String(a[1][0]?.child_account_code || '').localeCompare(String(b[1][0]?.child_account_code || ''), 'fa', { numeric: true }))
        .forEach(([groupAccountId, accountRows]) => {
          const orderedRows = [...accountRows].sort((a, b) => {
            const dateCompare = String(a.entry_date_raw || '').localeCompare(String(b.entry_date_raw || ''));
            if (dateCompare !== 0) return dateCompare;
            const entryCompare = String(a.entry_no || '').localeCompare(String(b.entry_no || ''), 'fa', { numeric: true });
            if (entryCompare !== 0) return entryCompare;
            return Number(a.line_no || 0) - Number(b.line_no || 0);
          });

          const openingRows = orderedRows.filter((row) => String(row.entry_date_raw || '') < dateFrom);
          const periodRows = orderedRows.filter((row) => String(row.entry_date_raw || '') >= dateFrom);
          const openingBalance = openingRows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
          if (!periodRows.length && openingBalance === 0) return;

          let running = openingBalance;
          const sample = orderedRows[0];
          result.push({
            key: `${groupAccountId}_opening`,
            row_kind: 'opening',
            child_account_code: String(sample?.child_account_code || '-'),
            child_account_name: String(sample?.child_account_name || '-'),
            entry_no: '-',
            entry_date: '-',
            line_no: '',
            source_label: '-',
            party_label: '-',
            description: 'مانده ابتدای دوره',
            debit: openingBalance > 0 ? openingBalance : null,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : null,
            running_balance: Math.abs(openingBalance),
            running_side: openingBalance >= 0 ? 'بدهکار' : 'بستانکار',
            sourceRelation: null,
          });

          periodRows.forEach((row) => {
            running += Number(row.debit || 0) - Number(row.credit || 0);
            result.push({
              key: row.id,
              row_kind: 'line',
              child_account_code: row.child_account_code,
              child_account_name: row.child_account_name,
              entry_no: row.entry_no,
              entry_date: row.entry_date,
              line_no: row.line_no,
              source_label: row.source_label,
              party_label: resolvePartyLabel(row.party_type, row.party_id),
              description: row.description,
              debit: row.debit,
              credit: row.credit,
              running_balance: Math.abs(running),
              running_side: running >= 0 ? 'بدهکار' : 'بستانکار',
              sourceRelation: row.sourceRelation,
            });
          });
        });

      setRows(result);
      setCanView(true);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت گردش حسابداری'));
    } finally {
      setLoading(false);
      setExecuting(false);
    }
  }, [accountId, dateFrom, dateTo, message]);

  useEffect(() => {
    runReport();
  }, [runReport]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          if (row.row_kind !== 'opening') {
            acc.debit += Number(row.debit || 0);
            acc.credit += Number(row.credit || 0);
          }
          return acc;
        },
        { debit: 0, credit: 0 }
      ),
    [rows]
  );

  const columns: ColumnsType<LedgerRow> = useMemo(
    () => [
      {
        title: 'زیرحساب',
        key: 'child_account',
        width: 210,
        fixed: 'left',
        ...textFilter('جستجو در زیرحساب', (record) => `${record.child_account_code} ${record.child_account_name}`),
        render: (_: unknown, record) => (
          <div className="min-w-0">
            <div className="persian-number text-xs text-gray-500">[{toPersianNumber(record.child_account_code || '-')}]
            </div>
            <div className="truncate">{record.child_account_name || '-'}</div>
          </div>
        ),
      },
      { title: 'شماره سند', dataIndex: 'entry_no', key: 'entry_no', width: 120, ...textFilter('جستجو در شماره سند', (record) => record.entry_no) },
      { title: 'تاریخ', dataIndex: 'entry_date', key: 'entry_date', width: 120, ...textFilter('جستجو در تاریخ', (record) => record.entry_date) },
      {
        title: 'ردیف',
        dataIndex: 'line_no',
        key: 'line_no',
        width: 70,
        render: (value: number | string) => <span className="persian-number">{toPersianNumber(String(value || '-'))}</span>,
      },
      {
        title: 'رکورد مرجع',
        dataIndex: 'source_label',
        key: 'source_label',
        width: 190,
        ...textFilter('جستجو در رکورد مرجع', (record) => record.source_label),
        render: (_: string, record) => {
          if (!record.sourceRelation?.moduleId || !record.sourceRelation?.recordId) return record.source_label || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.sourceRelation.moduleId}
                recordId={record.sourceRelation.recordId}
                label={record.source_label || '-'}
              />
            </div>
          );
        },
      },
      { title: 'طرف حساب', dataIndex: 'party_label', key: 'party_label', width: 170, ...textFilter('جستجو در طرف حساب', (record) => record.party_label) },
      { title: 'شرح', dataIndex: 'description', key: 'description', width: 250, ...textFilter('جستجو در شرح', (record) => record.description || '') },
      {
        title: 'بدهکار',
        dataIndex: 'debit',
        key: 'debit',
        align: 'right',
        width: 150,
        render: (value: number | null) => <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span>,
      },
      {
        title: 'بستانکار',
        dataIndex: 'credit',
        key: 'credit',
        align: 'right',
        width: 150,
        render: (value: number | null) => <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span>,
      },
      {
        title: 'مانده',
        dataIndex: 'running_balance',
        key: 'running_balance',
        align: 'right',
        width: 180,
        render: (value: number, record) => (
          <div className="flex items-center justify-end gap-2">
            <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span>
            <Tag className="!m-0">{record.running_side || '-'}</Tag>
          </div>
        ),
      },
    ],
    [textFilter]
  );

  return (
    <div id="account-ledger" className="mt-6">
      <Card
        title={`گردش حسابداری${accountName ? ` | ${accountName}` : ''}`}
        extra={
          <div className="flex flex-wrap gap-2">
            <Button size="small" icon={<ReloadOutlined />} loading={executing} onClick={runReport}>
              بروزرسانی
            </Button>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>
              چاپ
            </Button>
            <Button size="small" icon={<ShareAltOutlined />} onClick={copyShareLink}>
              اشتراک گذاری
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="w-[180px]">
            <Text className="text-gray-600 dark:text-gray-300">از تاریخ</Text>
            <PersianDatePicker type="DATE" value={dateFrom} onChange={(value) => setDateFrom(value || '')} />
          </div>
          <div className="w-[180px]">
            <Text className="text-gray-600 dark:text-gray-300">تا تاریخ</Text>
            <PersianDatePicker type="DATE" value={dateTo} onChange={(value) => setDateTo(value || '')} />
          </div>
          <Tag color="blue" className="!m-0">حساب: [{toPersianNumber(accountCode || '-')}] {accountName || '-'}</Tag>
        </div>

        <div className="mb-3 text-xs text-gray-500">
          این بخش فقط بر اساس اسناد حسابداری ثبت‌نهایی‌شده نمایش داده می‌شود.
        </div>

        {!canView ? (
          <Empty description="دسترسی مشاهده گردش حسابداری را ندارید" />
        ) : (
          <Table<LedgerRow>
            className="custom-erp-table"
            rowKey="key"
            loading={loading || executing}
            columns={columns}
            dataSource={rows}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1700 }}
            rowClassName={(row) => (row.row_kind === 'opening' ? 'bg-amber-50/70 dark:bg-amber-500/10' : '')}
            locale={{ emptyText: 'گردش حسابداری برای این حساب یافت نشد' }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={7}>
                    <span className="font-bold text-gray-800 dark:text-gray-100">جمع گردش دوره</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.debit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.credit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default AccountLedgerPanel;
