import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Form, Input, InputNumber, Select, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  LinkOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PersianDatePicker from '../components/PersianDatePicker';
import HeaderActions from '../components/moduleShow/HeaderActions';
import PrintSection from '../components/moduleShow/PrintSection';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../utils/permissions';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import {
  formatNumericForInput,
  normalizeNumericString,
  parseNumericInput,
  preventNonNumericKeyDown,
  preventNonNumericPaste,
} from '../utils/persianNumericInput';
import { generateNextJournalEntryNo } from '../utils/journalEntryNumbering';
import { MODULES } from '../moduleRegistry';
import { toFaErrorMessage } from '../utils/errorMessageFa';

type Entry = {
  id: string;
  entry_no: string | null;
  entry_date: string;
  description: string | null;
  fiscal_year_id: string | null;
  status: 'draft' | 'posted' | 'reversed';
  total_debit: number;
  total_credit: number;
  source_table: string | null;
  source_record_id: string | null;
  created_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  updated_at: string | null;
};

type Line = {
  id: string;
  line_no: number;
  account_id: string;
  description: string | null;
  debit: number;
  credit: number;
  cost_center_id: string | null;
  party_type: string | null;
  party_id: string | null;
  metadata?: Record<string, any> | null;
  chart_of_accounts?: { code: string; name: string } | null;
  cost_centers?: { code: string; name: string } | null;
};

type LineTableRow = {
  id: string;
  line_no: number;
  account_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
  cost_center_id: string | null;
  party_type: string | null;
  party_id: string | null;
  metadata?: Record<string, any> | null;
  chart_of_accounts?: { code: string; name: string } | null;
  cost_centers?: { code: string; name: string } | null;
  __isNew?: boolean;
};

type YearOpt = { id: string; title: string; is_active: boolean; is_closed: boolean };
type AccountOpt = {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  account_level: 'group' | 'general' | 'subsidiary' | 'detail';
  nature: 'debit' | 'credit' | 'none';
};
type CostCenterOpt = { id: string; code: string; name: string };
type CashBoxOpt = { id: string; code: string | null; name: string; account_id: string | null };
type BankAccountOpt = {
  id: string;
  code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_id: string | null;
};
type PartyType = 'customer' | 'supplier' | 'employee' | null;
type PartyOption = { value: string; label: string };
type Draft = {
  account_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
  cost_center_id: string | null;
  party_type: PartyType;
  party_id: string | null;
  treasury_ref: string | null;
};

const ENTRY_SELECT =
  'id,entry_no,entry_date,description,fiscal_year_id,status,total_debit,total_credit,source_table,source_record_id,created_at,created_by,updated_by,posted_at,posted_by,updated_at';
const LINE_SELECT =
  'id,line_no,account_id,description,debit,credit,cost_center_id,party_type,party_id,metadata,chart_of_accounts:account_id(code,name),cost_centers:cost_center_id(code,name)';

const parseNum = (v: any) => parseNumericInput(v);

const normalizePartyType = (raw: any): PartyType => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'customer') return 'customer';
  if (value === 'supplier') return 'supplier';
  if (value === 'employee' || value === 'profile') return 'employee';
  return null;
};

const resolveTreasuryRef = (metadata: Record<string, any> | null | undefined): string | null => {
  const bankId = String(metadata?.bank_account_id || '').trim();
  if (bankId) return `bank:${bankId}`;
  const cashId = String(metadata?.cash_box_id || '').trim();
  if (cashId) return `cash:${cashId}`;
  return null;
};

const toDraft = (
  row: Pick<
    LineTableRow,
    'account_id' | 'description' | 'debit' | 'credit' | 'cost_center_id' | 'party_type' | 'party_id' | 'metadata'
  >
): Draft => ({
  account_id: row.account_id || null,
  description: row.description || null,
  debit: parseNum(row.debit),
  credit: parseNum(row.credit),
  cost_center_id: row.cost_center_id || null,
  party_type: normalizePartyType(row.party_type),
  party_id: row.party_id || null,
  treasury_ref: resolveTreasuryRef(row.metadata),
});

const sideValid = (d: any, c: any) => {
  const debit = parseNum(d);
  const credit = parseNum(c);
  return {
    debit,
    credit,
    ok: (debit > 0 && credit === 0) || (credit > 0 && debit === 0),
  };
};

const normalizeLineRecord = (row: any): Line => ({
  ...row,
  party_type: normalizePartyType(row?.party_type),
  chart_of_accounts: Array.isArray(row?.chart_of_accounts)
    ? (row.chart_of_accounts[0] || null)
    : (row?.chart_of_accounts || null),
  cost_centers: Array.isArray(row?.cost_centers)
    ? (row.cost_centers[0] || null)
    : (row?.cost_centers || null),
});

const JournalEntryShowPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [newRows, setNewRows] = useState<LineTableRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [years, setYears] = useState<YearOpt[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOpt[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxOpt[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOpt[]>([]);
  const [customerOptions, setCustomerOptions] = useState<PartyOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<PartyOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<PartyOption[]>([]);

  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [canDelete, setCanDelete] = useState(true);
  const [lineView, setLineView] = useState(true);
  const [lineEdit, setLineEdit] = useState(true);
  const [lineDelete, setLineDelete] = useState(true);

  const [ready, setReady] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [saveRowId, setSaveRowId] = useState<string | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const isDraft = entry?.status === 'draft';
  const canEditDraft = canEdit && isDraft;
  const isRealtimeEnabled = import.meta.env.DEV
    ? import.meta.env.VITE_ENABLE_REALTIME === 'true'
    : true;
  const canEditLines = lineEdit && isDraft;

  const tableRows = useMemo<LineTableRow[]>(() => {
    const existingRows: LineTableRow[] = lines.map((line) => ({
      id: line.id,
      line_no: line.line_no,
      account_id: line.account_id,
      description: line.description || null,
      debit: parseNum(line.debit),
      credit: parseNum(line.credit),
      cost_center_id: line.cost_center_id || null,
      party_type: normalizePartyType(line.party_type),
      party_id: line.party_id || null,
      metadata: line.metadata || null,
      chart_of_accounts: line.chart_of_accounts || null,
      cost_centers: line.cost_centers || null,
      __isNew: false,
    }));

    const draftRows = newRows.map((row) => ({ ...row, __isNew: true }));
    return [...existingRows, ...draftRows].sort((a, b) => Number(a.line_no) - Number(b.line_no));
  }, [lines, newRows]);

  const nextLineNo = useMemo(() => {
    const maxLineNo = tableRows.reduce((max, row) => Math.max(max, Number(row.line_no) || 0), 0);
    return maxLineNo + 1;
  }, [tableRows]);

  const accountLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => {
      map.set(account.id, `[${toPersianNumber(account.code)}] ${account.name}`);
    });
    return map;
  }, [accounts]);

  const accountMetaMap = useMemo(() => {
    const map = new Map<string, AccountOpt>();
    accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [accounts]);

  const costCenterLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    costCenters.forEach((center) => {
      map.set(center.id, `${center.code ? `[${toPersianNumber(center.code)}] ` : ''}${center.name}`);
    });
    return map;
  }, [costCenters]);

  const customerLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    customerOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [customerOptions]);

  const supplierLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    supplierOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [supplierOptions]);

  const employeeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    employeeOptions.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [employeeOptions]);

  const treasuryOptionByValue = useMemo(() => {
    const map = new Map<string, string>();
    cashBoxes.forEach((box) => {
      const label = `صندوق: ${box.code ? `[${toPersianNumber(box.code)}] ` : ''}${box.name}`;
      map.set(`cash:${box.id}`, label);
    });
    bankAccounts.forEach((bank) => {
      const label = `بانک: ${bank.code ? `[${toPersianNumber(bank.code)}] ` : ''}${bank.bank_name || 'بانک'}${
        bank.account_number ? ` (${toPersianNumber(bank.account_number)})` : ''
      }`;
      map.set(`bank:${bank.id}`, label);
    });
    return map;
  }, [bankAccounts, cashBoxes]);

  const treasuryOptionsByAccount = useMemo(() => {
    const map = new Map<string, Array<{ value: string; label: string }>>();
    cashBoxes.forEach((box) => {
      const accountId = String(box.account_id || '').trim();
      if (!accountId) return;
      const label = `صندوق: ${box.code ? `[${toPersianNumber(box.code)}] ` : ''}${box.name}`;
      const current = map.get(accountId) || [];
      current.push({ value: `cash:${box.id}`, label });
      map.set(accountId, current);
    });
    bankAccounts.forEach((bank) => {
      const accountId = String(bank.account_id || '').trim();
      if (!accountId) return;
      const label = `بانک: ${bank.code ? `[${toPersianNumber(bank.code)}] ` : ''}${bank.bank_name || 'بانک'}${
        bank.account_number ? ` (${toPersianNumber(bank.account_number)})` : ''
      }`;
      const current = map.get(accountId) || [];
      current.push({ value: `bank:${bank.id}`, label });
      map.set(accountId, current);
    });
    return map;
  }, [bankAccounts, cashBoxes]);

  const buildLineMetadata = (
    base: Record<string, any> | null | undefined,
    treasuryRef: string | null
  ): Record<string, any> => {
    const next: Record<string, any> = { ...(base || {}) };
    delete next.bank_account_id;
    delete next.cash_box_id;

    const ref = String(treasuryRef || '').trim();
    if (!ref) return next;

    if (ref.startsWith('bank:')) {
      const bankId = ref.slice(5).trim();
      if (bankId) next.bank_account_id = bankId;
      return next;
    }

    if (ref.startsWith('cash:')) {
      const cashId = ref.slice(5).trim();
      if (cashId) next.cash_box_id = cashId;
    }
    return next;
  };

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

  const accountSelectOptions = useMemo(
    () =>
      accounts.flatMap((account) => {
        const typeMeta = accountTypeMeta[account.account_type];
        const levelText = accountLevelLabel[account.account_level];
        const natureText = natureLabel[account.nature];
        const plainLabel = `[${toPersianNumber(account.code)}] ${account.name}`;
        const treasuryOptions = treasuryOptionsByAccount.get(account.id) || [];
        const baseSearch = `${account.code} ${account.name} ${typeMeta.label} ${levelText} ${natureText}`;

        if (treasuryOptions.length === 0) {
          return [
            {
              value: `acc:${account.id}`,
              label: plainLabel,
              accountId: account.id,
              treasuryRef: null,
              searchText: baseSearch,
              accountTypeColor: typeMeta.color,
              accountTypeLabel: typeMeta.label,
              accountLevelLabel: levelText,
              natureLabel: natureText,
              treasuryLabel: null,
            },
          ];
        }

        return treasuryOptions.map((treasury) => ({
          value: `acc:${account.id}|${treasury.value}`,
          label: plainLabel,
          accountId: account.id,
          treasuryRef: treasury.value,
          searchText: `${baseSearch} ${treasury.label}`,
          accountTypeColor: typeMeta.color,
          accountTypeLabel: typeMeta.label,
          accountLevelLabel: levelText,
          natureLabel: natureText,
          treasuryLabel: treasury.label,
        }));
      }),
    [accountLevelLabel, accountTypeMeta, accounts, natureLabel, treasuryOptionsByAccount]
  );

  const accountOptionByValue = useMemo(() => {
    const map = new Map<string, any>();
    accountSelectOptions.forEach((option: any) => {
      map.set(String(option.value), option);
    });
    return map;
  }, [accountSelectOptions]);

  const partyTypeOptions = useMemo(
    () => [
      { value: 'customer', label: 'مشتری' },
      { value: 'supplier', label: 'تامین کننده' },
      { value: 'employee', label: 'کارمند' },
    ],
    []
  );

  const title = useMemo(
    () => (entry?.entry_no ? `سند ${entry.entry_no}` : 'سند حسابداری'),
    [entry?.entry_no]
  );

  const sourcePath = useMemo(() => {
    if (!entry?.source_table || !entry?.source_record_id) return null;
    return MODULES[entry.source_table] ? `/${entry.source_table}/${entry.source_record_id}` : null;
  }, [entry?.source_record_id, entry?.source_table]);

  const isRowEditing = (row: LineTableRow) => Boolean(row.__isNew || editingRows[row.id]);

  const getUserName = useCallback(
    (uid: string | null | undefined) => {
      if (!uid) return '-';
      return userNames[uid] || uid;
    },
    [userNames]
  );

  const renderDateTime = useCallback((value: string | null | undefined) => {
    if (!value) return '-';
    const formatted = safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    return formatted ? toPersianNumber(formatted) : '-';
  }, []);

  const refreshEntryLight = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('journal_entries')
      .select(ENTRY_SELECT)
      .eq('id', id)
      .single();
    if (error) throw error;
    const next = data as Entry;
    setEntry(next);
    form.setFieldsValue({
      entry_no: next.entry_no || null,
      entry_date: next.entry_date,
      fiscal_year_id: next.fiscal_year_id,
      description: next.description || null,
    });
  }, [form, id]);

  const refreshLinesLight = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('journal_lines')
      .select(LINE_SELECT)
      .eq('entry_id', id)
      .order('line_no', { ascending: true });
    if (error) throw error;
    const nextLines = ((data || []) as any[]).map(normalizeLineRecord) as Line[];
    setLines(nextLines);
    setDrafts((prev) => {
      const next: Record<string, Draft> = { ...prev };
      nextLines.forEach((line) => {
        next[line.id] = toDraft({
          account_id: line.account_id,
          description: line.description || null,
          debit: line.debit,
          credit: line.credit,
          cost_center_id: line.cost_center_id || null,
          party_type: normalizePartyType(line.party_type),
          party_id: line.party_id || null,
          metadata: line.metadata || null,
        });
      });
      return next;
    });
  }, [id]);

  const loadPerms = useCallback(async () => {
    const perms = await fetchCurrentUserRolePermissions(supabase);
    const entryPerms = perms?.journal_entries || {};
    const accountingFields = perms?.[ACCOUNTING_PERMISSION_KEY]?.fields || {};

    setCanView(entryPerms.view !== false);
    setCanEdit(entryPerms.edit !== false);
    setCanDelete(entryPerms.delete !== false);

    setLineView(entryPerms.view !== false && accountingFields.journal_entry_lines_view !== false);
    setLineEdit(entryPerms.edit !== false && accountingFields.journal_entry_lines_edit !== false);
    setLineDelete(entryPerms.delete !== false && accountingFields.journal_entry_lines_delete !== false);
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [
        entryRes,
        linesRes,
        yearsRes,
        accountsRes,
        costCentersRes,
        cashBoxesRes,
        bankAccountsRes,
        customersRes,
        suppliersRes,
        employeesRes,
      ] = await Promise.all([
        supabase
          .from('journal_entries')
          .select(ENTRY_SELECT)
          .eq('id', id)
          .single(),
        supabase
          .from('journal_lines')
          .select(LINE_SELECT)
          .eq('entry_id', id)
          .order('line_no', { ascending: true }),
        supabase
          .from('fiscal_years')
          .select('id,title,is_active,is_closed')
          .order('start_date', { ascending: false }),
        supabase
          .from('chart_of_accounts')
          .select('id,code,name,account_type,account_level,nature')
          .eq('is_active', true)
          .eq('is_leaf', true)
          .order('code', { ascending: true }),
        supabase
          .from('cost_centers')
          .select('id,code,name')
          .eq('is_active', true)
          .order('code', { ascending: true }),
        supabase
          .from('cash_boxes')
          .select('id,code,name,account_id')
          .eq('is_active', true)
          .not('account_id', 'is', null)
          .order('name', { ascending: true }),
        supabase
          .from('bank_accounts')
          .select('id,code,bank_name,account_number,account_id')
          .eq('is_active', true)
          .not('account_id', 'is', null)
          .order('bank_name', { ascending: true }),
        supabase
          .from('customers')
          .select('id,first_name,last_name,business_name,system_code')
          .order('last_name', { ascending: true })
          .limit(500),
        supabase
          .from('suppliers')
          .select('id,business_name,first_name,last_name,system_code')
          .order('business_name', { ascending: true })
          .limit(500),
        supabase
          .from('profiles')
          .select('id,full_name')
          .order('full_name', { ascending: true })
          .limit(500),
      ]);

      if (entryRes.error) throw entryRes.error;
      if (linesRes.error) throw linesRes.error;
      if (yearsRes.error) throw yearsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (costCentersRes.error) throw costCentersRes.error;
      if (cashBoxesRes.error) throw cashBoxesRes.error;
      if (bankAccountsRes.error) throw bankAccountsRes.error;
      if (customersRes.error) throw customersRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (employeesRes.error) throw employeesRes.error;

      const currentEntry = entryRes.data as Entry;
      const lineRows = ((linesRes.data || []) as any[]).map(normalizeLineRecord) as Line[];

      const customerRows = (customersRes.data || []) as any[];
      const supplierRows = (suppliersRes.data || []) as any[];
      const employeeRows = (employeesRes.data || []) as any[];
      const cashRows = ((cashBoxesRes.data || []) as CashBoxOpt[]) || [];
      const bankRows = ((bankAccountsRes.data || []) as BankAccountOpt[]) || [];

      const baseAccounts = ((accountsRes.data || []) as AccountOpt[]) || [];
      const linkedAccountIds = Array.from(
        new Set(
          [...cashRows, ...bankRows]
            .map((row) => String(row.account_id || '').trim())
            .filter(Boolean)
        )
      );
      const baseAccountIds = new Set(baseAccounts.map((account) => String(account.id)));
      const missingLinkedAccountIds = linkedAccountIds.filter((accountId) => !baseAccountIds.has(accountId));

      let mergedAccounts = baseAccounts;
      if (missingLinkedAccountIds.length > 0) {
        const { data: extraAccounts, error: extraAccountsError } = await supabase
          .from('chart_of_accounts')
          .select('id,code,name,account_type,account_level,nature')
          .in('id', missingLinkedAccountIds);
        if (extraAccountsError) throw extraAccountsError;

        mergedAccounts = [...baseAccounts, ...(((extraAccounts || []) as AccountOpt[]) || [])];
      }

      mergedAccounts = mergedAccounts.sort((a, b) =>
        String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true, sensitivity: 'base' })
      );

      const nextCustomerOptions: PartyOption[] = customerRows.map((row) => {
        const displayName = String(
          row?.business_name ||
            `${row?.first_name || ''} ${row?.last_name || ''}`.trim() ||
            row?.system_code ||
            row?.id
        );
        return {
          value: String(row.id),
          label: row?.system_code ? `${displayName} (${toPersianNumber(row.system_code)})` : displayName,
        };
      });

      const nextSupplierOptions: PartyOption[] = supplierRows.map((row) => {
        const displayName = String(
          row?.business_name ||
            `${row?.first_name || ''} ${row?.last_name || ''}`.trim() ||
            row?.system_code ||
            row?.id
        );
        return {
          value: String(row.id),
          label: row?.system_code ? `${displayName} (${toPersianNumber(row.system_code)})` : displayName,
        };
      });

      const nextEmployeeOptions: PartyOption[] = employeeRows.map((row) => ({
        value: String(row.id),
        label: String(row?.full_name || row?.id),
      }));

      const userIds = Array.from(
        new Set(
          [currentEntry.created_by, currentEntry.updated_by, currentEntry.posted_by]
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        )
      );

      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id,full_name')
          .in('id', userIds);
        if (usersError) throw usersError;
        userMap = (users || []).reduce<Record<string, string>>((acc, row: any) => {
          acc[String(row.id)] = String(row.full_name || row.id);
          return acc;
        }, {});
      }

      setEntry(currentEntry);
      setLines(lineRows);
      setYears((yearsRes.data || []) as YearOpt[]);
      setAccounts(mergedAccounts);
      setCostCenters((costCentersRes.data || []) as CostCenterOpt[]);
      setCashBoxes(cashRows);
      setBankAccounts(bankRows);
      setCustomerOptions(nextCustomerOptions);
      setSupplierOptions(nextSupplierOptions);
      setEmployeeOptions(nextEmployeeOptions);
      setUserNames(userMap);
      setNewRows([]);
      setEditingRows({});
      setDrafts(
        lineRows.reduce<Record<string, Draft>>((acc, line) => {
          acc[line.id] = toDraft({
            account_id: line.account_id,
            description: line.description || null,
            debit: line.debit,
            credit: line.credit,
            cost_center_id: line.cost_center_id || null,
            party_type: normalizePartyType(line.party_type),
            party_id: line.party_id || null,
            metadata: line.metadata || null,
          });
          return acc;
        }, {})
      );

      form.setFieldsValue({
        entry_no: currentEntry.entry_no || null,
        entry_date: currentEntry.entry_date,
        fiscal_year_id: currentEntry.fiscal_year_id,
        description: currentEntry.description || null,
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت سند'));
    } finally {
      setLoading(false);
    }
  }, [form, id, message]);

  useEffect(() => {
    loadPerms();
  }, [loadPerms]);

  useEffect(() => {
    if (!ready) return;
    if (!canView) {
      setLoading(false);
      return;
    }
    load();
  }, [ready, canView, load]);

  useEffect(() => {
    if (!isRealtimeEnabled || !id || !ready || !canView) return;

    const channel = supabase
      .channel(`journal-entry-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_lines', filter: `entry_id=eq.${id}` },
        async () => {
          try {
            await Promise.all([refreshLinesLight(), refreshEntryLight()]);
          } catch {
            // no-op: UI keeps last known state
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'journal_entries', filter: `id=eq.${id}` },
        async () => {
          try {
            await refreshEntryLight();
          } catch {
            // no-op: UI keeps last known state
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, ready, canView, refreshLinesLight, refreshEntryLight, isRealtimeEnabled]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'اسناد حسابداری', moduleId: 'journal_entries', recordName: title },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [title]);

  useEffect(() => {
    const brandTitle = document.documentElement.getAttribute('data-brand-title') || 'کلام';
    document.title = `${title} | ${brandTitle}`;
  }, [title]);

  const saveHeader = async () => {
    if (!entry?.id || !canEditDraft) return;
    try {
      const values = await form.validateFields();
      const entryNoValue = values.entry_no ? String(values.entry_no).trim() : null;
      const generatedEntryNo = !entryNoValue
        ? await generateNextJournalEntryNo({
            supabase: supabase as any,
            fiscalYearId: values.fiscal_year_id || null,
          })
        : null;

      const { error } = await supabase
        .from('journal_entries')
        .update({
          entry_no: entryNoValue || generatedEntryNo,
          entry_date: values.entry_date,
          fiscal_year_id: values.fiscal_year_id,
          description: values.description ? String(values.description).trim() : null,
        })
        .eq('id', entry.id);
      if (error) throw error;
      message.success('اطلاعات سند ذخیره شد');
      load();
    } catch (err: any) {
      if (!Array.isArray(err?.errorFields)) message.error(toFaErrorMessage(err, 'خطا در ذخیره اطلاعات سند'));
    }
  };

  const postEntry = async () => {
    if (!entry?.id || !isDraft || !canEdit) return;
    setStatusLoading(true);
    try {
      const patch: Record<string, any> = { status: 'posted' };
      const currentEntryNo = entry.entry_no ? String(entry.entry_no).trim() : '';
      if (!currentEntryNo) {
        const generatedEntryNo = await generateNextJournalEntryNo({
          supabase: supabase as any,
          fiscalYearId: entry.fiscal_year_id || null,
        });
        if (generatedEntryNo) patch.entry_no = generatedEntryNo;
      }

      const { error } = await supabase.from('journal_entries').update(patch).eq('id', entry.id);
      if (error) throw error;
      message.success('سند ثبت نهایی شد');
      load();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ثبت نهایی سند'));
    } finally {
      setStatusLoading(false);
    }
  };

  const reverseEntry = async () => {
    if (!entry?.id || entry.status !== 'posted' || !canEdit) return;
    modal.confirm({
      title: 'برگشتی کردن سند',
      content: 'سند برگشتی شود؟',
      okText: 'بله',
      cancelText: 'انصراف',
      onOk: async () => {
        setStatusLoading(true);
        try {
          const { error } = await supabase.from('journal_entries').update({ status: 'reversed' }).eq('id', entry.id);
          if (error) throw error;
          message.success('سند برگشتی شد');
          load();
        } catch (err: any) {
          message.error(toFaErrorMessage(err, 'خطا در برگشتی کردن سند'));
        } finally {
          setStatusLoading(false);
        }
      },
    });
  };

  const removeEntry = async () => {
    if (!entry?.id || !isDraft || !canDelete) return;
    modal.confirm({
      title: 'حذف سند',
      content: 'سند و ردیف‌های آن حذف شود؟',
      okText: 'حذف',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id);
        if (error) message.error(toFaErrorMessage(error, 'خطا در حذف سند'));
        else {
          message.success('حذف شد');
          navigate('/journal_entries');
        }
      },
    });
  };

  const upsertDraft = (rowId: string, patch: Partial<Draft>, fallback?: Draft) => {
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || fallback || {
          account_id: null,
          description: null,
          debit: 0,
          credit: 0,
          cost_center_id: null,
          party_type: null,
          party_id: null,
          treasury_ref: null,
        }),
        ...patch,
      },
    }));
  };

  const addDraftRow = () => {
    if (!canEditLines) return;
    if (newRows.length > 0) {
      message.info('ابتدا ردیف جدید قبلی را ثبت یا حذف کنید.');
      return;
    }
    const tempId = `new-${Date.now()}`;
    const row: LineTableRow = {
      id: tempId,
      line_no: nextLineNo,
      account_id: null,
      description: null,
      debit: 0,
      credit: 0,
      cost_center_id: null,
      party_type: null,
      party_id: null,
      metadata: null,
      __isNew: true,
    };
    setNewRows((prev) => [...prev, row]);
    setEditingRows((prev) => ({ ...prev, [tempId]: true }));
    setDrafts((prev) => ({ ...prev, [tempId]: toDraft(row) }));
  };

  const startEditRow = (row: LineTableRow) => {
    if (!canEditLines || row.__isNew) return;
    setEditingRows((prev) => ({ ...prev, [row.id]: true }));
    upsertDraft(row.id, {}, toDraft(row));
  };

  const cancelEditRow = (row: LineTableRow) => {
    if (row.__isNew) {
      setNewRows((prev) => prev.filter((item) => item.id !== row.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setEditingRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }

    const original = lines.find((line) => line.id === row.id);
    if (original) {
      setDrafts((prev) => ({ ...prev, [row.id]: toDraft({
        account_id: original.account_id,
        description: original.description || null,
        debit: original.debit,
        credit: original.credit,
        cost_center_id: original.cost_center_id || null,
        party_type: normalizePartyType(original.party_type),
        party_id: original.party_id || null,
        metadata: original.metadata || null,
      }) }));
    }

    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  };

  const saveRow = async (row: LineTableRow) => {
    if (!canEditLines) return;
    const draft = drafts[row.id];
    if (!draft) return;

    const side = sideValid(draft.debit, draft.credit);
    const treasuryOptions = draft.account_id
      ? treasuryOptionsByAccount.get(String(draft.account_id)) || []
      : [];
    if (!draft.account_id) return message.error('حساب الزامی است');
    if (!side.ok) return message.error('فقط یکی از بدهکار یا بستانکار باید مقدار داشته باشد');
    if (draft.party_type && !draft.party_id) return message.error('برای طرف حساب، انتخاب شخص/مشتری/تامین کننده الزامی است');
    if (treasuryOptions.length > 0 && !draft.treasury_ref) {
      return message.error('برای این حساب، انتخاب بانک/صندوق الزامی است');
    }
    if (
      draft.treasury_ref &&
      !treasuryOptions.some((option) => String(option.value) === String(draft.treasury_ref))
    ) {
      return message.error('بانک/صندوق انتخاب شده با حساب جاری همخوانی ندارد');
    }

    const metadata = buildLineMetadata(row.metadata || null, draft.treasury_ref);

    setSaveRowId(row.id);
    try {
      let savedLine: Line | null = null;
      if (row.__isNew) {
        if (!entry?.id) return;
        const { data, error } = await supabase
          .from('journal_lines')
          .insert([
            {
              entry_id: entry.id,
              line_no: row.line_no,
              account_id: draft.account_id,
              description: draft.description || null,
              debit: side.debit,
              credit: side.credit,
              cost_center_id: draft.cost_center_id || null,
              party_type: draft.party_type || null,
              party_id: draft.party_id || null,
              metadata,
            },
          ])
          .select(LINE_SELECT)
          .single();
        if (error) throw error;
        savedLine = normalizeLineRecord(data);
      } else {
        const { data, error } = await supabase
          .from('journal_lines')
          .update({
            account_id: draft.account_id,
            description: draft.description || null,
            debit: side.debit,
            credit: side.credit,
            cost_center_id: draft.cost_center_id || null,
            party_type: draft.party_type || null,
            party_id: draft.party_id || null,
            metadata,
          })
          .eq('id', row.id)
          .select(LINE_SELECT)
          .single();
        if (error) throw error;
        savedLine = normalizeLineRecord(data);
      }

      if (savedLine) {
        setLines((prev) => {
          const filtered = prev.filter((line) => line.id !== savedLine!.id);
          return [...filtered, savedLine!].sort((a, b) => Number(a.line_no) - Number(b.line_no));
        });

        setDrafts((prev) => {
          const next = { ...prev };
          if (row.__isNew) delete next[row.id];
          next[savedLine!.id] = toDraft({
            account_id: savedLine!.account_id,
            description: savedLine!.description || null,
            debit: savedLine!.debit,
            credit: savedLine!.credit,
            cost_center_id: savedLine!.cost_center_id || null,
            party_type: normalizePartyType(savedLine!.party_type),
            party_id: savedLine!.party_id || null,
            metadata: savedLine!.metadata || null,
          });
          return next;
        });
      }

      if (row.__isNew) {
        setNewRows((prev) => prev.filter((item) => item.id !== row.id));
      }
      setEditingRows((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });

      await refreshEntryLight();

      message.success(row.__isNew ? 'ردیف جدید ثبت شد' : 'ردیف ذخیره شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ذخیره ردیف سند'));
    } finally {
      setSaveRowId(null);
    }
  };

  const deleteRow = (row: LineTableRow) => {
    if (row.__isNew) {
      cancelEditRow(row);
      return;
    }

    if (!lineDelete || !isDraft) return;
    modal.confirm({
      title: 'حذف ردیف',
      content: 'ردیف حذف شود؟',
      okText: 'حذف',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabase.from('journal_lines').delete().eq('id', row.id);
        if (error) {
          message.error(toFaErrorMessage(error, 'خطا در حذف ردیف سند'));
          return;
        }
        setLines((prev) => prev.filter((line) => line.id !== row.id));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        setEditingRows((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        await refreshEntryLight();
        message.success('حذف شد');
      },
    });
  };

  const renderReadonlyAccount = (row: LineTableRow) => {
    const accountId = drafts[row.id]?.account_id || row.account_id;
    if (!accountId) return '-';
    const accountLabel = accountLabelMap.get(accountId) || `[${toPersianNumber(row.chart_of_accounts?.code || '-')}] ${row.chart_of_accounts?.name || '-'}`;
    const account = accountMetaMap.get(accountId);
    const treasuryRef = drafts[row.id]?.treasury_ref || resolveTreasuryRef(row.metadata);
    const treasuryLabel = treasuryRef ? treasuryOptionByValue.get(String(treasuryRef)) : null;
    if (!account) return accountLabel;

    return (
      <div className="flex flex-col gap-1">
        <span>{accountLabel}</span>
        <div className="flex flex-wrap gap-1">
          <Tag color={accountTypeMeta[account.account_type].color}>{accountTypeMeta[account.account_type].label}</Tag>
          <Tag>{accountLevelLabel[account.account_level]}</Tag>
          <Tag>{natureLabel[account.nature]}</Tag>
          {treasuryLabel && (
            <Tag color={String(treasuryLabel).startsWith('صندوق') ? 'gold' : 'cyan'}>{treasuryLabel}</Tag>
          )}
        </div>
      </div>
    );
  };

  const getPartyOptionsByType = (partyType: PartyType): PartyOption[] => {
    if (partyType === 'customer') return customerOptions;
    if (partyType === 'supplier') return supplierOptions;
    if (partyType === 'employee') return employeeOptions;
    return [];
  };

  const getReadonlyPartyLabel = (row: LineTableRow) => {
    const draft = drafts[row.id];
    const partyType = normalizePartyType(draft?.party_type || row.party_type);
    const partyId = String(draft?.party_id || row.party_id || '').trim();
    if (!partyType || !partyId) return '-';
    if (partyType === 'customer') return customerLabelMap.get(partyId) || partyId;
    if (partyType === 'supplier') return supplierLabelMap.get(partyId) || partyId;
    return employeeLabelMap.get(partyId) || partyId;
  };

  const getReadonlyPartyTypeLabel = (row: LineTableRow) => {
    const partyType = normalizePartyType(drafts[row.id]?.party_type || row.party_type);
    if (partyType === 'customer') return 'مشتری';
    if (partyType === 'supplier') return 'تامین کننده';
    if (partyType === 'employee') return 'کارمند';
    return '-';
  };

  const getReadonlyCostCenterLabel = (row: LineTableRow) => {
    const centerId = String(drafts[row.id]?.cost_center_id || row.cost_center_id || '').trim();
    if (!centerId) return '-';
    return (
      costCenterLabelMap.get(centerId) ||
      `${row.cost_centers?.code ? `[${toPersianNumber(row.cost_centers.code)}] ` : ''}${row.cost_centers?.name || centerId}`
    );
  };

  const getAccountSelectorValue = (draft: Draft): string | undefined => {
    const accountId = String(draft.account_id || '').trim();
    if (!accountId) return undefined;

    const treasuryRef = String(draft.treasury_ref || '').trim();
    if (treasuryRef) {
      const withTreasury = `acc:${accountId}|${treasuryRef}`;
      if (accountOptionByValue.has(withTreasury)) return withTreasury;
    }

    const simple = `acc:${accountId}`;
    if (accountOptionByValue.has(simple)) return simple;
    return undefined;
  };

  const renderAccountOption = (option: any) => {
    const data = (option as any)?.data || {};
    const treasuryLabel = String(data.treasuryLabel || '').trim();
    return (
      <div className="flex flex-col gap-1 py-1">
        <div className="font-semibold text-gray-800 dark:text-gray-100">{data.label}</div>
        <div className="flex flex-wrap gap-1">
          <Tag color={data.accountTypeColor}>{data.accountTypeLabel}</Tag>
          <Tag>{data.accountLevelLabel}</Tag>
          <Tag>{data.natureLabel}</Tag>
          {treasuryLabel && <Tag color={treasuryLabel.startsWith('صندوق') ? 'gold' : 'cyan'}>{treasuryLabel}</Tag>}
        </div>
      </div>
    );
  };

  const columns: ColumnsType<LineTableRow> = [
    {
      title: 'ردیف',
      dataIndex: 'line_no',
      width: 70,
      render: (v) => <span className="persian-number">{toPersianNumber(v)}</span>,
    },
    {
      title: 'جزئیات ردیف سند',
      dataIndex: 'id',
      render: (_: any, row) => {
        const editing = canEditLines && isRowEditing(row);
        const draft = drafts[row.id] || toDraft(row);
        return (
          <div className="rounded-xl border border-gray-100 dark:border-white/10 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              <div>
                <div className="text-[11px] text-gray-500 mb-1">حساب</div>
                {editing ? (
                  <Select
                    showSearch
                    optionFilterProp="searchText"
                    filterOption={(input, option) =>
                      String((option as any)?.searchText || '')
                        .toLowerCase()
                        .includes(String(input || '').toLowerCase())
                    }
                    value={getAccountSelectorValue(draft)}
                    onChange={(v) => {
                      const selected = accountOptionByValue.get(String(v));
                      upsertDraft(
                        row.id,
                        {
                          account_id: selected?.accountId || null,
                          treasury_ref: selected?.treasuryRef || null,
                        },
                        toDraft(row)
                      );
                    }}
                    options={accountSelectOptions as any}
                    optionRender={renderAccountOption}
                    style={{ width: '100%' }}
                  />
                ) : (
                  renderReadonlyAccount(row)
                )}
              </div>

              <div>
                <div className="text-[11px] text-gray-500 mb-1">نوع طرف حساب (تفصیلی ۱)</div>
                {editing ? (
                  <Select
                    allowClear
                    value={draft.party_type || undefined}
                    onChange={(value) =>
                      upsertDraft(
                        row.id,
                        { party_type: normalizePartyType(value), party_id: null },
                        toDraft(row)
                      )
                    }
                    options={partyTypeOptions}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <span>{getReadonlyPartyTypeLabel(row)}</span>
                )}
              </div>

              <div>
                <div className="text-[11px] text-gray-500 mb-1">طرف حساب (تفصیلی ۱)</div>
                {editing ? (
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={draft.party_id || undefined}
                    onChange={(value) => upsertDraft(row.id, { party_id: value || null }, toDraft(row))}
                    options={getPartyOptionsByType(draft.party_type || null)}
                    disabled={!draft.party_type}
                    style={{ width: '100%' }}
                    placeholder={draft.party_type ? 'انتخاب طرف حساب' : 'ابتدا نوع طرف حساب'}
                  />
                ) : (
                  <span>{getReadonlyPartyLabel(row)}</span>
                )}
              </div>

              <div>
                <div className="text-[11px] text-gray-500 mb-1">تفصیلی ۲ (مرکز هزینه)</div>
                {editing ? (
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={draft.cost_center_id || undefined}
                    onChange={(value) => upsertDraft(row.id, { cost_center_id: value || null }, toDraft(row))}
                    options={costCenters.map((center) => ({
                      value: center.id,
                      label: `${center.code ? `[${toPersianNumber(center.code)}] ` : ''}${center.name}`,
                    }))}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <span>{getReadonlyCostCenterLabel(row)}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mt-2">
              <div className="md:col-span-8">
                <div className="text-[11px] text-gray-500 mb-1">شرح</div>
                {editing ? (
                  <Input
                    value={draft.description || ''}
                    onChange={(e) => upsertDraft(row.id, { description: e.target.value }, toDraft(row))}
                  />
                ) : (
                  <div className="min-h-8 flex items-center">{row.description || '-'}</div>
                )}
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-500 mb-1">بدهکار</div>
                {editing ? (
                  <InputNumber
                    className="w-full persian-number"
                    controls={false}
                    min={0}
                    precision={2}
                    stringMode
                    value={draft.debit ?? 0}
                    formatter={(val, info) =>
                      formatNumericForInput(
                        info?.userTyping ? (info?.input ?? val) : (val ?? info?.input),
                        true
                      )
                    }
                    parser={(val) => normalizeNumericString(val)}
                    onChange={(v) => upsertDraft(row.id, { debit: parseNum(v) }, toDraft(row))}
                    onKeyDown={preventNonNumericKeyDown}
                    onPaste={preventNonNumericPaste}
                  />
                ) : (
                  <span
                    className={`persian-number font-bold ${
                      parseNum(row.debit) > 0 ? 'text-red-600 bg-red-50 px-2 py-1 rounded' : 'text-gray-400'
                    }`}
                  >
                    {formatPersianPrice(row.debit || 0)}
                  </span>
                )}
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-500 mb-1">بستانکار</div>
                {editing ? (
                  <InputNumber
                    className="w-full persian-number"
                    controls={false}
                    min={0}
                    precision={2}
                    stringMode
                    value={draft.credit ?? 0}
                    formatter={(val, info) =>
                      formatNumericForInput(
                        info?.userTyping ? (info?.input ?? val) : (val ?? info?.input),
                        true
                      )
                    }
                    parser={(val) => normalizeNumericString(val)}
                    onChange={(v) => upsertDraft(row.id, { credit: parseNum(v) }, toDraft(row))}
                    onKeyDown={preventNonNumericKeyDown}
                    onPaste={preventNonNumericPaste}
                  />
                ) : (
                  <span
                    className={`persian-number font-bold ${
                      parseNum(row.credit) > 0 ? 'text-green-700 bg-green-50 px-2 py-1 rounded' : 'text-gray-400'
                    }`}
                  >
                    {formatPersianPrice(row.credit || 0)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'عملیات',
      dataIndex: 'id',
      width: 100,
      render: (_: any, row) => {
        if (!canEditLines) return null;

        if (isRowEditing(row)) {
          return (
            <div className="flex gap-2">
              <Button
                size="small"
                type="text"
                icon={<SaveOutlined />}
                loading={saveRowId === row.id}
                onClick={() => saveRow(row)}
              />
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => cancelEditRow(row)} />
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteRow(row)} />
            </div>
          );
        }

        return (
          <div className="flex gap-2">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEditRow(row)} />
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteRow(row)} disabled={!lineDelete} />
          </div>
        );
      },
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
        <Empty description="دسترسی مشاهده سند حسابداری ندارید" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="سند پیدا نشد" />
      </div>
    );
  }

  const diff = parseNum(entry.total_debit) - parseNum(entry.total_credit);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20 animate-fadeIn">
      <HeaderActions
        moduleTitle="اسناد حسابداری"
        recordName={title}
        shareUrl={typeof window !== 'undefined' ? window.location.href : ''}
        onBack={() => navigate('/journal_entries')}
        onHome={() => navigate('/')}
        onModule={() => navigate('/journal_entries')}
        onPrint={() => setIsPrintOpen(true)}
        onRefresh={load}
        refreshLoading={loading}
        onEdit={saveHeader}
        onDelete={removeEntry}
        canEdit={canEdit}
        canDelete={canDelete && isDraft}
        extraActions={[
          { id: 'post', label: statusLoading ? 'در حال ثبت...' : 'ثبت نهایی', variant: 'primary', onClick: postEntry },
          ...(entry.status === 'posted'
            ? [{ id: 'reverse', label: statusLoading ? 'در حال انجام...' : 'برگشتی', variant: 'default' as const, onClick: reverseEntry }]
            : []),
        ]}
      />

      <Card className="rounded-2xl border border-gray-200 dark:border-gray-800 mb-4">
        <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
          <div className="text-lg font-black">{title}</div>
          <div className="flex gap-2 items-center">
            {entry.status === 'draft' && <Tag color="orange">پیش نویس</Tag>}
            {entry.status === 'posted' && <Tag color="green">ثبت شده</Tag>}
            {entry.status === 'reversed' && <Tag color="red">برگشتی</Tag>}
            {sourcePath && (
              <Button icon={<LinkOutlined />} onClick={() => navigate(sourcePath)}>
                سند مرجع
              </Button>
            )}
          </div>
        </div>

        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item label="شماره سند" name="entry_no">
              <Input disabled={!canEditDraft} />
            </Form.Item>

            <Form.Item
              label="تاریخ سند"
              name="entry_date"
              rules={[{ required: true, message: 'تاریخ سند الزامی است' }]}
            >
              <PersianDatePicker type="DATE" disabled={!canEditDraft} />
            </Form.Item>

            <Form.Item
              label="سال مالی"
              name="fiscal_year_id"
              rules={[{ required: true, message: 'سال مالی الزامی است' }]}
            >
              <Select
                disabled={!canEditDraft}
                options={years.map((year) => ({
                  value: year.id,
                  label: `${year.title}${year.is_active ? ' (فعال)' : ''}${year.is_closed ? ' (بسته)' : ''}`,
                }))}
              />
            </Form.Item>
          </div>

          <Form.Item label="شرح سند" name="description">
            <Input.TextArea rows={2} disabled={!canEditDraft} />
          </Form.Item>

          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <SafetyCertificateOutlined className="text-green-600" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">ایجاد کننده</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(entry.created_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <ClockCircleOutlined className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ایجاد</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">{renderDateTime(entry.created_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <EditOutlined className="text-orange-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">آخرین ویرایشگر</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(entry.updated_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <HistoryOutlined className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ویرایش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">{renderDateTime(entry.updated_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <ClockCircleOutlined className="text-teal-600" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">ثبت نهایی</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">
                  {entry.posted_at ? `${renderDateTime(entry.posted_at)} - ${getUserName(entry.posted_by)}` : '-'}
                </span>
              </div>
            </div>
          </div>

          {canEditDraft && <Button onClick={saveHeader}>ذخیره اطلاعات سند</Button>}
        </Form>
      </Card>

      <Card
        title="ردیف های سند"
        className="rounded-2xl border border-gray-200 dark:border-gray-800"
        extra={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              بدهکار: <span className="persian-number text-red-600">{formatPersianPrice(entry.total_debit || 0)}</span>
            </span>
            <span>
              بستانکار: <span className="persian-number text-green-700">{formatPersianPrice(entry.total_credit || 0)}</span>
            </span>
            <span className={`persian-number ${Math.abs(diff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
              اختلاف: {formatPersianPrice(diff || 0)}
            </span>
            {canEditLines && (
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addDraftRow}>
                افزودن ردیف
              </Button>
            )}
          </div>
        }
      >
        {!lineView ? (
          <Empty description="دسترسی مشاهده ردیف های سند ندارید" />
        ) : (
          <Table<LineTableRow>
            rowKey="id"
            dataSource={tableRows}
            columns={columns}
            pagination={false}
          />
        )}
      </Card>

      <PrintSection
        isPrintModalOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        onPrint={() => {
          setIsPrintOpen(false);
          setPrintMode(true);
          setTimeout(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 700);
          }, 120);
        }}
        printTemplates={[{ id: 'journal_voucher', title: 'سند حسابداری', description: 'نسخه چاپی سند' }]}
        selectedTemplateId="journal_voucher"
        onSelectTemplate={() => undefined}
        renderPrintCard={() => (
          <div className="print-card" style={{ width: '148mm', minHeight: '210mm', padding: '10mm' }}>
            <div className="font-bold mb-2">سند حسابداری</div>
            <div className="text-xs mb-2">
              شماره: <span className="persian-number">{toPersianNumber(entry.entry_no || '-')}</span> | تاریخ:{' '}
              <span className="persian-number">{toPersianNumber(safeJalaliFormat(entry.entry_date, 'YYYY/MM/DD') || '-')}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #d1d5db', padding: 4 }}>ردیف</th>
                  <th style={{ border: '1px solid #d1d5db', padding: 4 }}>حساب</th>
                  <th style={{ border: '1px solid #d1d5db', padding: 4 }}>شرح</th>
                  <th style={{ border: '1px solid #d1d5db', padding: 4 }}>بدهکار</th>
                  <th style={{ border: '1px solid #d1d5db', padding: 4 }}>بستانکار</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td style={{ border: '1px solid #d1d5db', padding: 4 }} className="persian-number">
                      {toPersianNumber(line.line_no)}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 4 }}>
                      {`[${toPersianNumber(line?.chart_of_accounts?.code || '-')}] ${line?.chart_of_accounts?.name || '-'}`}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 4 }}>{line.description || '-'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 4 }} className="persian-number">
                      {formatPersianPrice(line.debit || 0)}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 4 }} className="persian-number">
                      {formatPersianPrice(line.credit || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        printMode={printMode}
      />
    </div>
  );
};

export default JournalEntryShowPage;
