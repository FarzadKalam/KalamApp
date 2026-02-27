import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Select, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { NodeIndexOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import PersianDatePicker from '../components/PersianDatePicker';
import { supabase } from '../supabaseClient';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../utils/permissions';
import { formatPersianPrice, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';

const { Text } = Typography;

type AccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  account_level: 'group' | 'general' | 'subsidiary' | 'detail';
  nature: 'debit' | 'credit' | 'none';
  parent_id: string | null;
  is_active: boolean;
};

type ReviewRow = {
  key: string;
  account_id: string;
  account_code: string;
  account_name: string;
  debit_turnover: number;
  credit_turnover: number;
  debit_balance: number;
  credit_balance: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const sortByCode = (a: AccountRow, b: AccountRow) =>
  String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true, sensitivity: 'base' });

const AccountingAccountReviewPage: React.FC = () => {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selectedAccountSearchId, setSelectedAccountSearchId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [selectedDetail1Id, setSelectedDetail1Id] = useState<string | null>(null);
  const [selectedDetail2Id, setSelectedDetail2Id] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const accountsById = useMemo(() => {
    const map = new Map<string, AccountRow>();
    accounts.forEach((row) => map.set(row.id, row));
    return map;
  }, [accounts]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, AccountRow[]>();
    accounts.forEach((row) => {
      const parentId = row.parent_id || '';
      const list = map.get(parentId) || [];
      list.push(row);
      map.set(parentId, list);
    });
    map.forEach((list) => list.sort(sortByCode));
    return map;
  }, [accounts]);

  const accountTypeMeta = useMemo(
    () => ({
      asset: { label: 'دارایی', color: 'blue' },
      liability: { label: 'بدهی', color: 'orange' },
      equity: { label: 'سرمایه', color: 'purple' },
      income: { label: 'درآمد', color: 'green' },
      expense: { label: 'هزینه', color: 'red' },
    }),
    []
  );

  const accountLevelLabel = useMemo(
    () => ({
      group: 'گروه',
      general: 'کل',
      subsidiary: 'معین',
      detail: 'تفصیلی',
    }),
    []
  );

  const natureLabel = useMemo(
    () => ({
      debit: 'بدهکار',
      credit: 'بستانکار',
      none: 'خنثی',
    }),
    []
  );

  const getDescendantIds = useCallback((rootId: string) => {
    const result: string[] = [];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      result.push(current);
      const children = childrenByParent.get(current) || [];
      children.forEach((child) => queue.push(child.id));
    }
    return result;
  }, [childrenByParent]);

  const getPathToRoot = useCallback((accountId: string) => {
    const path: AccountRow[] = [];
    let current: AccountRow | undefined = accountsById.get(accountId);
    let guard = 0;
    while (current && guard < 32) {
      path.push(current);
      const parentId = String(current.parent_id || '').trim();
      current = parentId ? accountsById.get(parentId) : undefined;
      guard += 1;
    }
    return path;
  }, [accountsById]);

  const applyHierarchyFromAccount = useCallback((accountId: string) => {
    const path = getPathToRoot(accountId);
    const findLevel = (level: AccountRow['account_level']) =>
      path.find((item) => item.account_level === level)?.id || null;
    const fallbackRootId = path[path.length - 1]?.id || null;
    const nextGroupId = findLevel('group') || fallbackRootId;
    const nextSubgroupId = findLevel('general');
    const nextDetail1Id = findLevel('subsidiary');

    setSelectedGroupId(nextGroupId);
    setSelectedSubgroupId(nextSubgroupId);
    setSelectedDetail1Id(nextDetail1Id);
    // مطابق درخواست: تفصیلی 2 به صورت خودکار پر نشود.
    setSelectedDetail2Id(null);
  }, [getPathToRoot]);

  const accountSearchOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.is_active)
        .sort(sortByCode)
        .map((account) => {
          const typeMeta = accountTypeMeta[account.account_type];
          const levelText = accountLevelLabel[account.account_level];
          const natureText = natureLabel[account.nature];
          const label = `[${toPersianNumber(account.code)}] ${account.name}`;
          return {
            value: account.id,
            label,
            searchText: `${account.code} ${account.name} ${typeMeta.label} ${levelText} ${natureText}`,
            accountTypeColor: typeMeta.color,
            accountTypeLabel: typeMeta.label,
            accountLevelLabel: levelText,
            natureLabel: natureText,
          };
        }),
    [accountLevelLabel, accountTypeMeta, accounts, natureLabel]
  );

  const groupOptions = useMemo(() => {
    return accounts
      .filter((row) => row.is_active && row.account_level === 'group')
      .sort(sortByCode)
      .map((row) => ({
        value: row.id,
        label: `[${toPersianNumber(row.code)}] ${row.name}`,
      }));
  }, [accounts]);

  const subgroupOptions = useMemo(() => {
    if (!selectedGroupId) return [];
    const children = childrenByParent.get(selectedGroupId) || [];
    return children
      .filter((row) => row.is_active)
      .sort(sortByCode)
      .map((row) => ({
        value: row.id,
        label: `[${toPersianNumber(row.code)}] ${row.name}`,
      }));
  }, [childrenByParent, selectedGroupId]);

  const detail1Options = useMemo(() => {
    if (!selectedSubgroupId) return [];
    const children = childrenByParent.get(selectedSubgroupId) || [];
    return children
      .filter((row) => row.is_active)
      .sort(sortByCode)
      .map((row) => ({
        value: row.id,
        label: `[${toPersianNumber(row.code)}] ${row.name}`,
      }));
  }, [childrenByParent, selectedSubgroupId]);

  const detail2Options = useMemo(() => {
    if (!selectedDetail1Id) return [];
    const children = childrenByParent.get(selectedDetail1Id) || [];
    return children
      .filter((row) => row.is_active)
      .sort(sortByCode)
      .map((row) => ({
        value: row.id,
        label: `[${toPersianNumber(row.code)}] ${row.name}`,
      }));
  }, [childrenByParent, selectedDetail1Id]);

  const selectedRootId = selectedDetail2Id || selectedDetail1Id || selectedSubgroupId || selectedGroupId;

  const selectedScopeAccountIds = useMemo(() => {
    if (!selectedRootId) return [];
    return getDescendantIds(selectedRootId);
  }, [getDescendantIds, selectedRootId]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const journalPerms = permissions?.journal_entries || {};
      const chartPerms = permissions?.chart_of_accounts || {};
      const allowView =
        accountingPerms.view !== false &&
        accountingPerms.fields?.operation_links !== false &&
        journalPerms.view !== false &&
        chartPerms.view !== false;
      setCanView(allowView);

      if (!allowView) {
        setAccounts([]);
        return;
      }

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id,code,name,account_type,account_level,nature,parent_id,is_active')
        .order('code', { ascending: true });
      if (error) throw error;

      const loaded = (data || []) as AccountRow[];
      setAccounts(loaded);

      const defaultGroup = loaded
        .filter((row) => row.is_active && row.account_level === 'group')
        .sort(sortByCode)[0];
      setSelectedAccountSearchId(null);
      setSelectedGroupId(defaultGroup?.id || null);
      setSelectedSubgroupId(null);
      setSelectedDetail1Id(null);
      setSelectedDetail2Id(null);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت اطلاعات مرور حساب ها'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadReview = useCallback(async () => {
    if (!canView || !selectedScopeAccountIds.length || !dateFrom || !dateTo) {
      setRows([]);
      return;
    }

    if (dateFrom > dateTo) {
      message.warning('تاریخ شروع نباید بعد از تاریخ پایان باشد.');
      return;
    }

    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id,debit,credit,journal_entries!inner(entry_date,status)')
        .in('account_id', selectedScopeAccountIds)
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.entry_date', dateFrom)
        .lte('journal_entries.entry_date', dateTo);

      if (error) throw error;

      const byAccount = new Map<string, { debit: number; credit: number }>();
      (data || []).forEach((line: any) => {
        const accountId = String(line?.account_id || '').trim();
        if (!accountId) return;
        const current = byAccount.get(accountId) || { debit: 0, credit: 0 };
        current.debit += Number(line?.debit || 0);
        current.credit += Number(line?.credit || 0);
        byAccount.set(accountId, current);
      });

      const result: ReviewRow[] = [];
      byAccount.forEach((value, accountId) => {
        const account = accountsById.get(accountId);
        if (!account) return;
        const diff = value.debit - value.credit;
        result.push({
          key: account.id,
          account_id: account.id,
          account_code: account.code,
          account_name: account.name,
          debit_turnover: value.debit,
          credit_turnover: value.credit,
          debit_balance: diff > 0 ? diff : 0,
          credit_balance: diff < 0 ? Math.abs(diff) : 0,
        });
      });

      result.sort((a, b) => String(a.account_code).localeCompare(String(b.account_code), 'fa', { numeric: true }));
      setRows(result);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت گردش حساب ها'));
    } finally {
      setLoadingRows(false);
    }
  }, [accountsById, canView, dateFrom, dateTo, message, selectedScopeAccountIds]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'حسابداری', moduleId: 'accounting', recordName: 'مرور حساب ها' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setRows([]);
      return;
    }
    loadReview();
  }, [selectedGroupId, selectedSubgroupId, selectedDetail1Id, selectedDetail2Id, dateFrom, dateTo, loadReview]);

  const totalDebitTurnover = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.debit_turnover || 0), 0),
    [rows]
  );
  const totalCreditTurnover = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.credit_turnover || 0), 0),
    [rows]
  );
  const totalDebitBalance = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.debit_balance || 0), 0),
    [rows]
  );
  const totalCreditBalance = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.credit_balance || 0), 0),
    [rows]
  );
  const finalDiff = totalDebitTurnover - totalCreditTurnover;
  const finalDebit = finalDiff > 0 ? finalDiff : 0;
  const finalCredit = finalDiff < 0 ? Math.abs(finalDiff) : 0;

  const renderAccountOption = (option: any) => {
    const data = (option as any)?.data || {};
    return (
      <div className="flex flex-col gap-1 py-1">
        <div className="font-semibold text-gray-800 dark:text-gray-100">{data.label}</div>
        <div className="flex flex-wrap gap-1">
          <Tag color={data.accountTypeColor}>{data.accountTypeLabel}</Tag>
          <Tag>{data.accountLevelLabel}</Tag>
          <Tag>{data.natureLabel}</Tag>
        </div>
      </div>
    );
  };

  const columns: ColumnsType<ReviewRow> = [
    {
      title: 'حساب',
      key: 'account',
      width: 280,
      render: (_, row) => (
        <div className="min-w-0">
          <div className="persian-number font-semibold text-gray-800 dark:text-gray-100">
            [{toPersianNumber(row.account_code)}]
          </div>
          <div className="text-gray-700 dark:text-gray-200 truncate">{row.account_name}</div>
        </div>
      ),
    },
    {
      title: 'گردش بدهکار',
      dataIndex: 'debit_turnover',
      align: 'right',
      width: 180,
      render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
    },
    {
      title: 'گردش بستانکار',
      dataIndex: 'credit_turnover',
      align: 'right',
      width: 180,
      render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
    },
    {
      title: 'مانده بدهکار',
      dataIndex: 'debit_balance',
      align: 'right',
      width: 180,
      render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
    },
    {
      title: 'مانده بستانکار',
      dataIndex: 'credit_balance',
      align: 'right',
      width: 180,
      render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
    },
  ];

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی به مرور حساب ها ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 w-full animate-fadeIn overflow-x-hidden">
      <div className="flex flex-col xl:flex-row gap-4">
        <Card className="xl:w-[340px] shrink-0 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <NodeIndexOutlined className="text-leather-600" />
            <h2 className="m-0 text-lg font-black text-gray-800 dark:text-white">انتخاب حساب</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Text className="text-gray-600 dark:text-gray-300">جستجو بین همه حساب ها</Text>
              <Select
                className="w-full mt-1"
                placeholder="نام یا کد حساب را جستجو کنید"
                value={selectedAccountSearchId || undefined}
                onChange={(value) => {
                  const accountId = value ? String(value) : null;
                  setSelectedAccountSearchId(accountId);
                  if (accountId) applyHierarchyFromAccount(accountId);
                }}
                showSearch
                optionFilterProp="searchText"
                filterOption={(input, option) =>
                  String((option as any)?.searchText || '')
                    .toLowerCase()
                    .includes(String(input || '').toLowerCase())
                }
                options={accountSearchOptions as any}
                optionRender={renderAccountOption}
                allowClear
              />
            </div>

            <div>
              <Text className="text-gray-600 dark:text-gray-300">گروه حساب</Text>
              <Select
                className="w-full mt-1"
                placeholder="انتخاب گروه"
                value={selectedGroupId}
                onChange={(value) => {
                  setSelectedAccountSearchId(null);
                  setSelectedGroupId(value || null);
                  setSelectedSubgroupId(null);
                  setSelectedDetail1Id(null);
                  setSelectedDetail2Id(null);
                }}
                options={groupOptions}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </div>

            <div>
              <Text className="text-gray-600 dark:text-gray-300">زیرگروه (اختیاری)</Text>
              <Select
                className="w-full mt-1"
                placeholder="انتخاب زیرگروه"
                value={selectedSubgroupId}
                onChange={(value) => {
                  setSelectedAccountSearchId(null);
                  setSelectedSubgroupId(value || null);
                  setSelectedDetail1Id(null);
                  setSelectedDetail2Id(null);
                }}
                options={subgroupOptions}
                disabled={!selectedGroupId}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </div>

            <div>
              <Text className="text-gray-600 dark:text-gray-300">تفصیلی 1 (اختیاری)</Text>
              <Select
                className="w-full mt-1"
                placeholder="انتخاب تفصیلی 1"
                value={selectedDetail1Id}
                onChange={(value) => {
                  setSelectedAccountSearchId(null);
                  setSelectedDetail1Id(value || null);
                  setSelectedDetail2Id(null);
                }}
                options={detail1Options}
                disabled={!selectedSubgroupId}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </div>

            <div>
              <Text className="text-gray-600 dark:text-gray-300">تفصیلی 2 (اختیاری)</Text>
              <Select
                className="w-full mt-1"
                placeholder="انتخاب تفصیلی 2"
                value={selectedDetail2Id}
                onChange={(value) => {
                  setSelectedAccountSearchId(null);
                  setSelectedDetail2Id(value || null);
                }}
                options={detail2Options}
                disabled={!selectedDetail1Id}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </div>

            <div className="pt-1">
              <Tag color="blue" className="persian-number">
                تعداد حساب در محدوده: {toPersianNumber(selectedScopeAccountIds.length)}
              </Tag>
            </div>
          </div>
        </Card>

        <Card className="flex-1 min-w-0 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="w-[180px]">
              <Text className="text-gray-600 dark:text-gray-300">از تاریخ</Text>
              <PersianDatePicker type="DATE" value={dateFrom} onChange={(v) => setDateFrom(v || '')} />
            </div>
            <div className="w-[180px]">
              <Text className="text-gray-600 dark:text-gray-300">تا تاریخ</Text>
              <PersianDatePicker type="DATE" value={dateTo} onChange={(v) => setDateTo(v || '')} />
            </div>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              className="bg-leather-600 border-none"
              onClick={loadReview}
              loading={loadingRows}
              disabled={!selectedGroupId}
            >
              اعمال فیلتر
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadReview} disabled={!selectedGroupId || loadingRows}>
              بروزرسانی
            </Button>
          </div>

          <Table
            rowKey="key"
            size="small"
            loading={loadingRows}
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 920 }}
            locale={{ emptyText: selectedGroupId ? 'گردشی در بازه انتخابی یافت نشد' : 'ابتدا گروه حساب را انتخاب کنید' }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <span className="font-bold text-gray-800 dark:text-gray-100">جمع کل</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalDebitTurnover)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalCreditTurnover)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalDebitBalance)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totalCreditBalance)}</span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />

          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Text className="!text-gray-600 dark:!text-gray-300">مانده نهایی:</Text>
              <Tag color={finalDebit > 0 ? 'blue' : 'default'} className="persian-number px-3 py-1">
                بدهکار: {formatPersianPrice(finalDebit)}
              </Tag>
              <Tag color={finalCredit > 0 ? 'green' : 'default'} className="persian-number px-3 py-1">
                بستانکار: {formatPersianPrice(finalCredit)}
              </Tag>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AccountingAccountReviewPage;
