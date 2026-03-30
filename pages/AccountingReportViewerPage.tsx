import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Row, Select, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileExcelOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PersianDatePicker from '../components/PersianDatePicker';
import { useCurrencyConfig } from '../utils/currency';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../utils/permissions';
import { getAccountingReportByKey, type AccountingReportDefinition } from '../utils/accountingReports';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';

const { Title, Text } = Typography;

type AccountOption = {
  value: string;
  label: string;
};

type AccountNode = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_leaf: boolean;
  is_active: boolean;
};

type ReportParams = Record<string, string | null>;
type ReportRecord = Record<string, string | number | null>;
type TotalsRecord = {
  debit: number;
  credit: number;
  opening_debit: number;
  opening_credit: number;
  debit_turnover: number;
  credit_turnover: number;
  ending_debit: number;
  ending_credit: number;
};

type RawLine = {
  id: string;
  line_no: number | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  account_id?: string | null;
  journal_entries?: any;
  chart_of_accounts?: any;
};

const today = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const getDefaultParamValue = (defaultValue?: 'today' | 'first_day_of_month' | null) => {
  if (defaultValue === 'today') return today();
  if (defaultValue === 'first_day_of_month') return firstDayOfMonth();
  return null;
};

const getJoinedRow = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return (value[0] || null) as T | null;
  return (value || null) as T | null;
};

const toSheetName = (title: string) => {
  const compact = String(title || '').replace(/[\\/?*:[\]]/g, ' ').trim();
  return compact.slice(0, 28) || 'Report';
};

const splitBalance = (value: number) => ({
  debit: value > 0 ? value : 0,
  credit: value < 0 ? Math.abs(value) : 0,
});

const normalizeBalanceLabel = (value: number) => ({
  amount: Math.abs(value),
  side: value >= 0 ? 'بدهکار' : 'بستانکار',
});

const computeBreakdown = (rows: Array<{ debit?: number | null; credit?: number | null }>) => {
  const debit = rows.reduce((sum, row) => sum + Number(row?.debit || 0), 0);
  const credit = rows.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
  return { debit, credit, balance: debit - credit };
};

const sortByCode = (a: { account_code?: string | null }, b: { account_code?: string | null }) =>
  String(a.account_code || '').localeCompare(String(b.account_code || ''), 'fa', {
    numeric: true,
    sensitivity: 'base',
  });

const numberCell = (value: unknown) => (
  <span className="persian-number">{formatPersianPrice(Number(value || 0))}</span>
);

const AccountingReportViewerPage: React.FC = () => {
  const { reportKey } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { label: currencyLabel } = useCurrencyConfig();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [canViewPage, setCanViewPage] = useState(true);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [accountNodes, setAccountNodes] = useState<AccountNode[]>([]);
  const [params, setParams] = useState<ReportParams>({});
  const [rows, setRows] = useState<ReportRecord[]>([]);
  const [summary, setSummary] = useState<ReportRecord | null>(null);

  const report = useMemo<AccountingReportDefinition | null>(
    () => getAccountingReportByKey(reportKey),
    [reportKey]
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: {
          moduleTitle: 'حسابداری',
          moduleId: 'accounting',
          recordName: report?.title || 'گزارش حسابداری',
        },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [report?.title]);

  useEffect(() => {
    if (!report) return;
    const initialState = report.params.reduce<ReportParams>((acc, param) => {
      acc[param.key] = getDefaultParamValue(param.defaultValue);
      return acc;
    }, {});
    setParams(initialState);
  }, [report]);

  const accountChildrenByParent = useMemo(() => {
    const map = new Map<string, AccountNode[]>();
    accountNodes.forEach((row) => {
      const parentId = String(row.parent_id || '');
      const current = map.get(parentId) || [];
      current.push(row);
      map.set(parentId, current);
    });
    map.forEach((items) =>
      items.sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true }))
    );
    return map;
  }, [accountNodes]);

  const getLeafScopeAccountIds = useCallback((accountId?: string | null) => {
    const normalized = String(accountId || '').trim();
    if (!normalized) return [];
    const queue = [normalized];
    const visited = new Set<string>();
    const leafIds: string[] = [];
    while (queue.length > 0) {
      const current = String(queue.shift() || '').trim();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const children = accountChildrenByParent.get(current) || [];
      if (children.length === 0) {
        leafIds.push(current);
        continue;
      }
      const activeChildren = children.filter((child) => child.is_active !== false);
      if (activeChildren.length === 0) {
        leafIds.push(current);
        continue;
      }
      activeChildren.forEach((child) => {
        if (child.is_leaf) {
          leafIds.push(child.id);
        } else {
          queue.push(child.id);
        }
      });
    }
    return Array.from(new Set(leafIds));
  }, [accountChildrenByParent]);

  const loadBase = useCallback(async () => {
    if (!report) {
      setCanViewPage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const canViewAccounting =
        accountingPerms.view !== false &&
        accountingPerms.fields?.dashboard_page !== false &&
        accountingPerms.fields?.reports_hub !== false;

      let canViewReport = canViewAccounting;
      if (
        report.key === 'account_review' ||
        report.key === 'account_turnover' ||
        report.key === 'general_ledger' ||
        report.key === 'subsidiary_ledger' ||
        report.key === 'trial_balance'
      ) {
        canViewReport =
          canViewReport &&
          permissions?.journal_entries?.view !== false &&
          permissions?.chart_of_accounts?.view !== false;
      }
      if (report.key === 'journal_book') {
        canViewReport = canViewReport && permissions?.journal_entries?.view !== false;
      }

      setCanViewPage(canViewReport);
      if (!canViewReport) return;

      if (report.params.some((item) => item.type === 'account')) {
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .select('id,code,name,parent_id,is_leaf,is_active')
          .eq('is_active', true)
          .order('code', { ascending: true })
          .limit(4000);
        if (error) throw error;

        const nextNodes = ((data || []) as any[]).map((item) => ({
          id: String(item.id),
          code: String(item.code || ''),
          name: String(item.name || ''),
          parent_id: item.parent_id ? String(item.parent_id) : null,
          is_leaf: item.is_leaf !== false,
          is_active: item.is_active !== false,
        }));
        setAccountNodes(nextNodes);
        setAccountOptions(
          nextNodes.map((item) => ({
            value: String(item.id),
            label: `[${toPersianNumber(item.code || '-')}] ${item.name || '-'}`,
          }))
        );
      }
    } catch {
      setCanViewPage(false);
      message.error('آماده‌سازی گزارش حسابداری ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [message, report]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const fetchPostedJournalLines = useCallback(async (dateToValue: string, accountIds?: string[] | null) => {
    let query = supabase
      .from('journal_lines')
      .select(
        'id,line_no,description,debit,credit,account_id,journal_entries!inner(id,entry_no,entry_date,description,status),chart_of_accounts:account_id(code,name)'
      )
      .eq('journal_entries.status', 'posted')
      .lte('journal_entries.entry_date', dateToValue)
      .limit(20000);

    if (Array.isArray(accountIds) && accountIds.length === 1) {
      query = query.eq('account_id', accountIds[0]);
    } else if (Array.isArray(accountIds) && accountIds.length > 1) {
      query = query.in('account_id', accountIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ((data || []) as RawLine[]).map((row) => {
      const entry = getJoinedRow<any>(row.journal_entries);
      const account = getJoinedRow<any>(row.chart_of_accounts);
      return {
        ...row,
        account_id: String(row.account_id || ''),
        entry_no: String(entry?.entry_no || '-'),
        entry_date_raw: String(entry?.entry_date || ''),
        entry_date: safeJalaliFormat(entry?.entry_date, 'YYYY/MM/DD') || '-',
        entry_description: String(entry?.description || ''),
        account_code: String(account?.code || '-'),
        account_name: String(account?.name || '-'),
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
      };
    });
  }, []);

  const buildLedgerRows = useCallback((allRows: any[], dateFromValue: string) => {
    const grouped = new Map<string, any[]>();
    allRows.forEach((row) => {
      const accountId = String(row.account_id || '');
      if (!accountId) return;
      if (!grouped.has(accountId)) grouped.set(accountId, []);
      grouped.get(accountId)!.push(row);
    });

    const result: ReportRecord[] = [];
    Array.from(grouped.entries())
      .map(([accountId, accountRows]) => {
        const sample = accountRows[0];
        return {
          accountId,
          account_code: String(sample?.account_code || '-'),
          account_name: String(sample?.account_name || '-'),
          rows: [...accountRows].sort((a, b) => {
            const dateCompare = String(a.entry_date_raw || '').localeCompare(String(b.entry_date_raw || ''));
            if (dateCompare !== 0) return dateCompare;
            const entryCompare = String(a.entry_no || '').localeCompare(String(b.entry_no || ''), 'fa', {
              numeric: true,
            });
            if (entryCompare !== 0) return entryCompare;
            return Number(a.line_no || 0) - Number(b.line_no || 0);
          }),
        };
      })
      .sort(sortByCode)
      .forEach((group) => {
        const openingRows = group.rows.filter((row) => String(row.entry_date_raw || '') < dateFromValue);
        const periodRows = group.rows.filter((row) => String(row.entry_date_raw || '') >= dateFromValue);
        const opening = computeBreakdown(openingRows);
        if (!periodRows.length && opening.balance === 0) return;

        let running = opening.balance;
        result.push({
          key: `${group.accountId}_opening`,
          row_kind: 'opening',
          account_code: group.account_code,
          account_name: group.account_name,
          entry_no: '-',
          entry_date: '-',
          line_no: '',
          description: 'مانده ابتدای دوره',
          debit: opening.debit > 0 ? opening.debit : null,
          credit: opening.credit > 0 ? opening.credit : null,
          running_balance: Math.abs(opening.balance),
          running_side: normalizeBalanceLabel(opening.balance).side,
        });

        periodRows.forEach((row) => {
          running += Number(row.debit || 0) - Number(row.credit || 0);
          result.push({
            key: String(row.id),
            row_kind: 'line',
            account_code: group.account_code,
            account_name: group.account_name,
            entry_no: String(row.entry_no || '-'),
            entry_date: String(row.entry_date || '-'),
            line_no: Number(row.line_no || 0),
            description: String(row.description || row.entry_description || ''),
            debit: Number(row.debit || 0),
            credit: Number(row.credit || 0),
            running_balance: Math.abs(running),
            running_side: normalizeBalanceLabel(running).side,
          });
        });
      });

    return result;
  }, []);

  const runReport = useCallback(async () => {
    if (!report) return;
    const dateFrom = String(params.date_from || '');
    const dateTo = String(params.date_to || '');
    const accountId = params.account_id || null;
    const scopedAccountIds = accountId ? getLeafScopeAccountIds(accountId) : [];

    if (!dateFrom || !dateTo) {
      message.warning('بازه زمانی گزارش را کامل کنید.');
      return;
    }
    if (dateFrom > dateTo) {
      message.warning('تاریخ شروع نباید از تاریخ پایان بزرگ‌تر باشد.');
      return;
    }

    if ((report.renderer === 'subsidiary_ledger' || report.renderer === 'account_turnover') && !accountId) {
      setRows([]);
      setSummary(null);
      return;
    }

    setExecuting(true);
    try {
      if (report.renderer === 'journal_book') {
        const { data, error } = await supabase
          .from('journal_lines')
          .select(
            'id,line_no,description,debit,credit,journal_entries!inner(id,entry_no,entry_date,description,status),chart_of_accounts:account_id(code,name)'
          )
          .eq('journal_entries.status', 'posted')
          .gte('journal_entries.entry_date', dateFrom)
          .lte('journal_entries.entry_date', dateTo)
          .limit(20000);
        if (error) throw error;

        const nextRows = ((data || []) as RawLine[])
          .map((row) => {
            const entry = getJoinedRow<any>(row.journal_entries);
            const account = getJoinedRow<any>(row.chart_of_accounts);
            return {
              key: String(row.id),
              entry_no: String(entry?.entry_no || '-'),
              entry_date: safeJalaliFormat(entry?.entry_date, 'YYYY/MM/DD') || '-',
              line_no: Number(row.line_no || 0),
              account_code: String(account?.code || '-'),
              account_name: String(account?.name || '-'),
              description: String(row.description || entry?.description || ''),
              debit: Number(row.debit || 0),
              credit: Number(row.credit || 0),
            };
          })
          .sort((a, b) => {
            const dateCompare = String(a.entry_date || '').localeCompare(String(b.entry_date || ''));
            if (dateCompare !== 0) return dateCompare;
            const entryCompare = String(a.entry_no || '').localeCompare(String(b.entry_no || ''), 'fa', {
              numeric: true,
            });
            if (entryCompare !== 0) return entryCompare;
            return Number(a.line_no || 0) - Number(b.line_no || 0);
          });

        setRows(nextRows);
        setSummary(null);
        return;
      }

      if (report.renderer === 'general_ledger' || report.renderer === 'subsidiary_ledger') {
        const allRows = await fetchPostedJournalLines(dateTo, scopedAccountIds);
        setRows(buildLedgerRows(allRows, dateFrom));
        setSummary(null);
        return;
      }

      if (report.renderer === 'account_turnover') {
        const allRows = await fetchPostedJournalLines(dateTo, scopedAccountIds);
        const openingRows = allRows.filter((row) => String(row.entry_date_raw || '') < dateFrom);
        const periodRows = allRows.filter((row) => String(row.entry_date_raw || '') >= dateFrom);
        const opening = computeBreakdown(openingRows);
        const turnover = computeBreakdown(periodRows);
        const endingBalance = opening.balance + turnover.balance;
        const openingSplit = splitBalance(opening.balance);
        const endingSplit = splitBalance(endingBalance);
        const selectedAccount = accountOptions.find((item) => item.value === accountId);
        const accountLabel = selectedAccount?.label || 'حساب انتخاب‌شده';
        const codeMatch = String(accountLabel).match(/\[(.*?)\]/);
        const accountCode = codeMatch?.[1] || '-';
        const accountName = String(accountLabel).replace(/^\[.*?\]\s*/, '') || '-';

        setSummary({
          account_code: accountCode,
          account_name: accountName,
          opening_balance: Math.abs(opening.balance),
          opening_side: normalizeBalanceLabel(opening.balance).side,
          debit_turnover: turnover.debit,
          credit_turnover: turnover.credit,
          ending_balance: Math.abs(endingBalance),
          ending_side: normalizeBalanceLabel(endingBalance).side,
        });

        setRows([
          {
            key: String(accountId),
            account_code: accountCode,
            account_name: accountName,
            opening_debit: openingSplit.debit,
            opening_credit: openingSplit.credit,
            debit_turnover: turnover.debit,
            credit_turnover: turnover.credit,
            ending_debit: endingSplit.debit,
            ending_credit: endingSplit.credit,
          },
        ]);
        return;
      }

      if (report.renderer === 'trial_balance') {
        const allRows = await fetchPostedJournalLines(dateTo);
        const grouped = new Map<string, any[]>();
        allRows.forEach((row) => {
          const accountId = String(row.account_id || '');
          if (!accountId) return;
          if (!grouped.has(accountId)) grouped.set(accountId, []);
          grouped.get(accountId)!.push(row);
        });

        const nextRows = Array.from(grouped.entries())
          .map(([accountId, accountRows]) => {
            const sample = accountRows[0];
            const openingRows = accountRows.filter((row) => String(row.entry_date_raw || '') < dateFrom);
            const periodRows = accountRows.filter((row) => String(row.entry_date_raw || '') >= dateFrom);
            const opening = computeBreakdown(openingRows);
            const turnover = computeBreakdown(periodRows);
            const openingSplit = splitBalance(opening.balance);
            const endingSplit = splitBalance(opening.balance + turnover.balance);

            return {
              key: accountId,
              account_code: String(sample?.account_code || '-'),
              account_name: String(sample?.account_name || '-'),
              opening_debit: openingSplit.debit,
              opening_credit: openingSplit.credit,
              debit_turnover: turnover.debit,
              credit_turnover: turnover.credit,
              debit_balance: endingSplit.debit,
              credit_balance: endingSplit.credit,
            };
          })
          .filter((row) =>
            [
              row.opening_debit,
              row.opening_credit,
              row.debit_turnover,
              row.credit_turnover,
              row.debit_balance,
              row.credit_balance,
            ].some((value) => Number(value || 0) !== 0)
          )
          .sort(sortByCode);

        setRows(nextRows);
        setSummary(null);
      }
    } catch {
      message.error('اجرای گزارش حسابداری ناموفق بود.');
    } finally {
      setExecuting(false);
    }
  }, [accountOptions, buildLedgerRows, fetchPostedJournalLines, getLeafScopeAccountIds, message, params, report]);

  useEffect(() => {
    if (!report || !canViewPage || loading) return;
    const missingRequired = report.params.some((param) => param.required && !params[param.key]);
    if (missingRequired) return;
    runReport();
  }, [canViewPage, loading, params, report, runReport]);

  const columns = useMemo<ColumnsType<ReportRecord>>(() => {
    if (!report) return [];

    if (report.renderer === 'journal_book') {
      return [
        { title: 'شماره سند', dataIndex: 'entry_no', key: 'entry_no', width: 120 },
        { title: 'تاریخ', dataIndex: 'entry_date', key: 'entry_date', width: 120 },
        {
          title: 'ردیف',
          dataIndex: 'line_no',
          key: 'line_no',
          width: 80,
          render: (value) => <span className="persian-number">{toPersianNumber(String(value || '-'))}</span>,
        },
        { title: 'کد حساب', dataIndex: 'account_code', key: 'account_code', width: 120 },
        { title: 'نام حساب', dataIndex: 'account_name', key: 'account_name', width: 220 },
        { title: 'شرح', dataIndex: 'description', key: 'description' },
        { title: 'بدهکار', dataIndex: 'debit', key: 'debit', align: 'right', width: 160, render: numberCell },
        { title: 'بستانکار', dataIndex: 'credit', key: 'credit', align: 'right', width: 160, render: numberCell },
      ];
    }

    if (report.renderer === 'general_ledger' || report.renderer === 'subsidiary_ledger') {
      return [
        { title: 'کد حساب', dataIndex: 'account_code', key: 'account_code', width: 120, fixed: 'left' },
        { title: 'نام حساب', dataIndex: 'account_name', key: 'account_name', width: 220, fixed: 'left' },
        { title: 'شماره سند', dataIndex: 'entry_no', key: 'entry_no', width: 120 },
        { title: 'تاریخ', dataIndex: 'entry_date', key: 'entry_date', width: 120 },
        {
          title: 'ردیف',
          dataIndex: 'line_no',
          key: 'line_no',
          width: 80,
          render: (value) => <span className="persian-number">{toPersianNumber(String(value || '-'))}</span>,
        },
        { title: 'شرح', dataIndex: 'description', key: 'description', width: 260 },
        { title: 'بدهکار', dataIndex: 'debit', key: 'debit', align: 'right', width: 160, render: numberCell },
        { title: 'بستانکار', dataIndex: 'credit', key: 'credit', align: 'right', width: 160, render: numberCell },
        {
          title: 'مانده',
          dataIndex: 'running_balance',
          key: 'running_balance',
          align: 'right',
          width: 160,
          render: numberCell,
        },
        {
          title: 'ماهیت مانده',
          dataIndex: 'running_side',
          key: 'running_side',
          width: 120,
          render: (value) => <Tag className="!m-0">{String(value || '-')}</Tag>,
        },
      ];
    }

    if (report.renderer === 'account_turnover') {
      return [
        { title: 'کد حساب', dataIndex: 'account_code', key: 'account_code', width: 140 },
        { title: 'نام حساب', dataIndex: 'account_name', key: 'account_name', width: 260 },
        { title: 'مانده بدهکار ابتدا', dataIndex: 'opening_debit', key: 'opening_debit', align: 'right', width: 170, render: numberCell },
        { title: 'مانده بستانکار ابتدا', dataIndex: 'opening_credit', key: 'opening_credit', align: 'right', width: 170, render: numberCell },
        { title: 'گردش بدهکار', dataIndex: 'debit_turnover', key: 'debit_turnover', align: 'right', width: 160, render: numberCell },
        { title: 'گردش بستانکار', dataIndex: 'credit_turnover', key: 'credit_turnover', align: 'right', width: 160, render: numberCell },
        { title: 'مانده بدهکار پایان', dataIndex: 'ending_debit', key: 'ending_debit', align: 'right', width: 170, render: numberCell },
        { title: 'مانده بستانکار پایان', dataIndex: 'ending_credit', key: 'ending_credit', align: 'right', width: 170, render: numberCell },
      ];
    }

    return [
      { title: 'کد حساب', dataIndex: 'account_code', key: 'account_code', width: 140, fixed: 'left' },
      { title: 'نام حساب', dataIndex: 'account_name', key: 'account_name', width: 260, fixed: 'left' },
      { title: 'مانده بدهکار ابتدا', dataIndex: 'opening_debit', key: 'opening_debit', align: 'right', width: 170, render: numberCell },
      { title: 'مانده بستانکار ابتدا', dataIndex: 'opening_credit', key: 'opening_credit', align: 'right', width: 170, render: numberCell },
      { title: 'گردش بدهکار', dataIndex: 'debit_turnover', key: 'debit_turnover', align: 'right', width: 160, render: numberCell },
      { title: 'گردش بستانکار', dataIndex: 'credit_turnover', key: 'credit_turnover', align: 'right', width: 160, render: numberCell },
      { title: 'مانده بدهکار پایان', dataIndex: 'debit_balance', key: 'debit_balance', align: 'right', width: 170, render: numberCell },
      { title: 'مانده بستانکار پایان', dataIndex: 'credit_balance', key: 'credit_balance', align: 'right', width: 170, render: numberCell },
    ];
  }, [report]);

  const handleExportExcel = useCallback(async () => {
    if (!report || !rows.length) return;
    try {
      const XLSX = await import('xlsx');
      const exportRows = rows.map((row) => {
        const mapped: Record<string, string | number | null> = {};
        columns.forEach((col) => {
          const title = typeof col.title === 'string' ? col.title : String(col.key || '');
          const dataIndex = 'dataIndex' in col ? (Array.isArray(col.dataIndex) ? col.dataIndex[0] : col.dataIndex) : undefined;
          if (!dataIndex) return;
          mapped[title] = (row as Record<string, string | number | null>)[String(dataIndex)] ?? null;
        });
        return mapped;
      });
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, toSheetName(report.title));
      XLSX.writeFile(wb, `${report.key}_${today()}.xlsx`);
    } catch {
      message.error('خروجی اکسل گزارش ناموفق بود.');
    }
  }, [columns, message, report, rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc: TotalsRecord, row) => {
        if (row.row_kind !== 'opening') {
          acc.debit += Number(row.debit || 0);
          acc.credit += Number(row.credit || 0);
        }
        acc.opening_debit += Number(row.opening_debit || 0);
        acc.opening_credit += Number(row.opening_credit || 0);
        acc.debit_turnover += Number(row.debit_turnover || 0);
        acc.credit_turnover += Number(row.credit_turnover || 0);
        acc.ending_debit += Number(row.ending_debit || row.debit_balance || 0);
        acc.ending_credit += Number(row.ending_credit || row.credit_balance || 0);
        return acc;
      },
      {
        debit: 0,
        credit: 0,
        opening_debit: 0,
        opening_credit: 0,
        debit_turnover: 0,
        credit_turnover: 0,
        ending_debit: 0,
        ending_credit: 0,
      } as TotalsRecord
    );
  }, [rows]);

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="گزارش حسابداری پیدا نشد" />
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی به این گزارش حسابداری ندارید" />
      </div>
    );
  }

  if (report.renderer === 'linked_page') {
    return (
      <div className="p-4 md:p-8 max-w-[960px] mx-auto animate-fadeIn">
        <Card className="rounded-[2rem] border border-gray-200 dark:border-gray-800">
          <div className="flex flex-col gap-4">
            <div>
              <Title level={3} className="!mb-2">{report.title}</Title>
              <Text className="text-gray-500">{report.description}</Text>
            </div>
            <div className="flex gap-2">
              <Button
                type="primary"
                className="bg-leather-600 hover:!bg-leather-500"
                onClick={() => navigate(report.path || '/accounting/reports')}
              >
                ورود به گزارش
              </Button>
              <Button onClick={() => navigate('/accounting/reports')}>بازگشت به فهرست گزارشات</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Title level={3} className="!mb-1">{report.title}</Title>
              <Text className="text-gray-500">{report.description}</Text>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<ReloadOutlined />} loading={executing} onClick={runReport}>
                اجرای گزارش
              </Button>
              {report.exportable && (
                <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} disabled={!rows.length}>
                  خروجی اکسل
                </Button>
              )}
              {report.printable && (
                <Button icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!rows.length}>
                  چاپ
                </Button>
              )}
            </div>
          </div>

          <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/5">
            <div className="flex flex-wrap items-end gap-4">
              {report.params.map((param) => (
                <div key={param.key} className="w-[200px]">
                  <Text className="text-gray-600 dark:text-gray-300">{param.label}</Text>
                  {param.type === 'date' ? (
                    <PersianDatePicker
                      type="DATE"
                      value={params[param.key]}
                      onChange={(value) => setParams((prev) => ({ ...prev, [param.key]: value }))}
                      placeholder={param.placeholder}
                    />
                  ) : (
                    <Select
                      className="w-full mt-1"
                      value={params[param.key] || undefined}
                      onChange={(value) => setParams((prev) => ({ ...prev, [param.key]: value || null }))}
                      options={accountOptions}
                      showSearch
                      optionFilterProp="label"
                      allowClear={!param.required}
                      placeholder={param.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {report.renderer === 'account_turnover' && summary && (
          <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} md={8}>
              <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="text-sm text-gray-500 mb-1">حساب انتخاب‌شده</div>
                <div className="font-black text-lg">{summary.account_name || '-'}</div>
                <div className="text-gray-500 persian-number">{summary.account_code || '-'}</div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="text-sm text-gray-500 mb-1">مانده ابتدای دوره</div>
                <div className="font-black text-lg persian-number">{formatPersianPrice(Number(summary.opening_balance || 0))}</div>
                <Tag className="!mt-2 !mr-0">{String(summary.opening_side || '-')}</Tag>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="text-sm text-gray-500 mb-1">مانده پایان دوره</div>
                <div className="font-black text-lg persian-number">{formatPersianPrice(Number(summary.ending_balance || 0))}</div>
                <Tag className="!mt-2 !mr-0">{String(summary.ending_side || '-')}</Tag>
              </Card>
            </Col>
          </Row>
        )}

        <Table<ReportRecord>
          rowKey={(row) => String(row.key || `${row.account_code || ''}_${row.entry_no || ''}_${row.line_no || ''}`)}
          size="small"
          loading={executing}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1320 }}
          rowClassName={(row) => (row.row_kind === 'opening' ? 'bg-amber-50/70 dark:bg-amber-500/10' : '')}
          locale={{
            emptyText:
              report.renderer === 'subsidiary_ledger' || report.renderer === 'account_turnover'
                ? 'ابتدا حساب موردنظر را انتخاب و گزارش را اجرا کنید'
                : 'رکوردی برای بازه انتخابی یافت نشد',
          }}
          summary={() => {
            if (!rows.length) return null;

            if (report.renderer === 'journal_book' || report.renderer === 'general_ledger' || report.renderer === 'subsidiary_ledger') {
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}>
                      <span className="font-bold text-gray-800 dark:text-gray-100">جمع کل</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <span className="persian-number font-bold">{formatPersianPrice(totals.debit)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <span className="persian-number font-bold">{formatPersianPrice(totals.credit)}</span>
                    </Table.Summary.Cell>
                    {(report.renderer === 'general_ledger' || report.renderer === 'subsidiary_ledger') && (
                      <>
                        <Table.Summary.Cell index={8} />
                        <Table.Summary.Cell index={9} />
                      </>
                    )}
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }

            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <span className="font-bold text-gray-800 dark:text-gray-100">جمع کل</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.opening_debit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.opening_credit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.debit_turnover)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.credit_turnover)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.ending_debit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(totals.ending_credit)}</span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />

        <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>واحد پول: {currencyLabel}</span>
          <span>
            بازه: {toPersianNumber(safeJalaliFormat(params.date_from, 'YYYY/MM/DD') || '-')} تا{' '}
            {toPersianNumber(safeJalaliFormat(params.date_to, 'YYYY/MM/DD') || '-')}
          </span>
          <span>تعداد سطر: {toPersianNumber(String(rows.length))}</span>
        </div>
      </div>
    </div>
  );
};

export default AccountingReportViewerPage;
