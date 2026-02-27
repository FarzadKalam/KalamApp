import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Segmented, Spin, Tag, Tree, Tooltip } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  EditOutlined,
  EyeOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShrinkOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { fetchCurrentUserRolePermissions } from '../utils/permissions';
import { toPersianNumber } from '../utils/persianNumberFormatter';

type AccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  account_level: 'group' | 'general' | 'subsidiary' | 'detail';
  nature: 'debit' | 'credit' | 'none';
  parent_id: string | null;
  is_leaf: boolean;
  is_system: boolean;
  is_active: boolean;
};

type CashBoxLink = {
  id: string;
  code: string | null;
  name: string;
  account_id: string | null;
};

type BankAccountLink = {
  id: string;
  code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_id: string | null;
};

type StatusFilter = 'active' | 'all' | 'inactive';

const ACCOUNT_TYPE_META: Record<
  AccountRow['account_type'],
  { label: string; color: string }
> = {
  asset: { label: 'دارایی', color: 'blue' },
  liability: { label: 'بدهی', color: 'orange' },
  equity: { label: 'سرمایه', color: 'purple' },
  income: { label: 'درآمد', color: 'green' },
  expense: { label: 'هزینه', color: 'red' },
};

const LEVEL_LABEL: Record<AccountRow['account_level'], string> = {
  group: 'گروه',
  general: 'کل',
  subsidiary: 'معین',
  detail: 'تفصیلی',
};

const NEXT_LEVEL: Record<AccountRow['account_level'], AccountRow['account_level']> = {
  group: 'general',
  general: 'subsidiary',
  subsidiary: 'detail',
  detail: 'detail',
};

const normalizeText = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const sortByCode = (a: AccountRow, b: AccountRow) =>
  String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true, sensitivity: 'base' });

const ChartOfAccountsTreePage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [cashLinks, setCashLinks] = useState<CashBoxLink[]>([]);
  const [bankLinks, setBankLinks] = useState<BankAccountLink[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const modulePerms = permissions?.chart_of_accounts || {};

      const allowView = modulePerms.view !== false;
      const allowEdit = modulePerms.edit !== false;
      setCanView(allowView);
      setCanEdit(allowEdit);

      if (!allowView) {
        setRows([]);
        setCashLinks([]);
        setBankLinks([]);
        setExpandedKeys([]);
        return;
      }

      const [accountsRes, cashRes, bankRes] = await Promise.all([
        supabase
          .from('chart_of_accounts')
          .select('id,code,name,account_type,account_level,nature,parent_id,is_leaf,is_system,is_active')
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
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (cashRes.error) throw cashRes.error;
      if (bankRes.error) throw bankRes.error;

      const loadedRows = ((accountsRes.data || []) as AccountRow[]).sort(sortByCode);
      setRows(loadedRows);
      setCashLinks((cashRes.data || []) as CashBoxLink[]);
      setBankLinks((bankRes.data || []) as BankAccountLink[]);

      const parentIds = new Set<string>();
      loadedRows.forEach((row) => {
        if (row.parent_id) parentIds.add(row.parent_id);
      });
      setExpandedKeys(Array.from(parentIds));
    } catch (err: any) {
      message.error(err?.message || 'خطا در دریافت کدینگ حساب ها');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'کدینگ حساب ها', moduleId: 'chart_of_accounts', recordName: 'نمایش درختی' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, []);

  const isStatusVisible = useCallback((row: AccountRow) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return row.is_active;
    return !row.is_active;
  }, [statusFilter]);

  const cashLinksByAccount = useMemo(() => {
    const map = new Map<string, string[]>();
    cashLinks.forEach((box) => {
      const accountId = String(box.account_id || '').trim();
      if (!accountId) return;
      const label = `${box.code ? `[${toPersianNumber(box.code)}] ` : ''}${box.name}`;
      const current = map.get(accountId) || [];
      current.push(label);
      map.set(accountId, current);
    });
    return map;
  }, [cashLinks]);

  const bankLinksByAccount = useMemo(() => {
    const map = new Map<string, string[]>();
    bankLinks.forEach((bank) => {
      const accountId = String(bank.account_id || '').trim();
      if (!accountId) return;
      const label = `${bank.code ? `[${toPersianNumber(bank.code)}] ` : ''}${bank.bank_name || 'بانک'}${
        bank.account_number ? ` (${toPersianNumber(bank.account_number)})` : ''
      }`;
      const current = map.get(accountId) || [];
      current.push(label);
      map.set(accountId, current);
    });
    return map;
  }, [bankLinks]);

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const eligible = rows.filter(isStatusVisible);

    if (!searchTerm.trim()) return eligible;

    const q = normalizeText(searchTerm);
    const selected = new Set<string>();

    eligible.forEach((row) => {
      const bankText = (bankLinksByAccount.get(row.id) || []).join(' ');
      const cashText = (cashLinksByAccount.get(row.id) || []).join(' ');
      const haystack = `${normalizeText(row.code)} ${normalizeText(row.name)} ${normalizeText(bankText)} ${normalizeText(cashText)}`;
      if (!haystack.includes(q)) return;

      selected.add(row.id);

      let currentParentId = row.parent_id;
      while (currentParentId) {
        const parent = byId.get(currentParentId);
        if (!parent || !isStatusVisible(parent)) break;
        selected.add(parent.id);
        currentParentId = parent.parent_id;
      }
    });

    return eligible.filter((row) => selected.has(row.id));
  }, [rows, isStatusVisible, searchTerm, bankLinksByAccount, cashLinksByAccount]);

  const treeData = useMemo<DataNode[]>(() => {
    const byId = new Map(visibleRows.map((row) => [row.id, row]));
    const childrenMap = new Map<string | null, AccountRow[]>();

    visibleRows.forEach((row) => {
      const parentInScope = row.parent_id && byId.has(row.parent_id) ? row.parent_id : null;
      const list = childrenMap.get(parentInScope) || [];
      list.push(row);
      childrenMap.set(parentInScope, list);
    });

    childrenMap.forEach((list) => list.sort(sortByCode));

    const renderNode = (row: AccountRow): DataNode => {
      const typeMeta = ACCOUNT_TYPE_META[row.account_type];
      const natureLabel = row.nature === 'debit' ? 'بدهکار' : row.nature === 'credit' ? 'بستانکار' : 'خنثی';
      const accountChildren = (childrenMap.get(row.id) || []).map(renderNode);
      const cashUsage = cashLinksByAccount.get(row.id) || [];
      const bankUsage = bankLinksByAccount.get(row.id) || [];
      const usageChildren: DataNode[] = [
        ...cashUsage.map((label, index) => ({
          key: `cash:${row.id}:${index}`,
          selectable: false,
          isLeaf: true,
          title: (
            <div className="flex items-center gap-2 py-1">
              <Tag color="gold">صندوق</Tag>
              <span className="text-gray-700 dark:text-gray-200">{label}</span>
            </div>
          ),
        })),
        ...bankUsage.map((label, index) => ({
          key: `bank:${row.id}:${index}`,
          selectable: false,
          isLeaf: true,
          title: (
            <div className="flex items-center gap-2 py-1">
              <Tag color="cyan">بانک</Tag>
              <span className="text-gray-700 dark:text-gray-200">{label}</span>
            </div>
          ),
        })),
      ];
      const children = [...accountChildren, ...usageChildren];

      return {
        key: row.id,
        title: (
          <div className="flex items-center justify-between gap-2 py-1 min-w-0">
            <div className="min-w-0 flex items-center flex-wrap gap-2">
              <span className="persian-number font-bold text-gray-800 dark:text-gray-100">
                {toPersianNumber(row.code)}
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{row.name}</span>
              <Tag color={typeMeta.color}>{typeMeta.label}</Tag>
              <Tag>{LEVEL_LABEL[row.account_level]}</Tag>
              <Tag>{natureLabel}</Tag>
              {cashUsage.length > 0 && (
                <Tooltip title={cashUsage.join('، ')}>
                  <Tag color="gold">صندوق {toPersianNumber(cashUsage.length)}</Tag>
                </Tooltip>
              )}
              {bankUsage.length > 0 && (
                <Tooltip title={bankUsage.join('، ')}>
                  <Tag color="cyan">بانک {toPersianNumber(bankUsage.length)}</Tag>
                </Tooltip>
              )}
              {!row.is_active && <Tag>غیرفعال</Tag>}
              {row.is_system && <Tag color="geekblue">سیستمی</Tag>}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Tooltip title="نمایش">
                <Button
                  size="small"
                  type="text"
                  icon={<EyeOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/chart_of_accounts/${row.id}`);
                  }}
                />
              </Tooltip>
              <Tooltip title="ویرایش">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  disabled={!canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/chart_of_accounts/${row.id}/edit`);
                  }}
                />
              </Tooltip>
              <Tooltip title="افزودن زیرحساب">
                <Button
                  size="small"
                  type="text"
                  icon={<PlusOutlined />}
                  disabled={!canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/chart_of_accounts/create', {
                      state: {
                        initialValues: {
                          parent_id: row.id,
                          account_type: row.account_type,
                          is_active: true,
                          is_leaf: true,
                          account_level: NEXT_LEVEL[row.account_level],
                        },
                      },
                    });
                  }}
                />
              </Tooltip>
            </div>
          </div>
        ),
        children,
      };
    };

    return (childrenMap.get(null) || []).map(renderNode);
  }, [visibleRows, canEdit, navigate, bankLinksByAccount, cashLinksByAccount]);

  const parentKeys = useMemo(() => {
    const keys = new Set<string>();
    const walk = (nodes: DataNode[]) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          keys.add(String(node.key));
          walk(node.children);
        }
      });
    };
    walk(treeData);
    return Array.from(keys);
  }, [treeData]);

  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedKeys(parentKeys);
  }, [searchTerm, parentKeys]);

  const totalCount = visibleRows.length;

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
        <Empty description="دسترسی مشاهده کدینگ حساب ها ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto animate-fadeIn">
      <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <NodeIndexOutlined className="text-lg text-leather-700" />
            <h1 className="text-xl md:text-2xl font-black m-0 text-gray-800 dark:text-white">
              کدینگ حساب ها (درختی)
            </h1>
            <Tag className="persian-number">{toPersianNumber(totalCount)} حساب</Tag>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button icon={<ReloadOutlined />} onClick={load}>
              بروزرسانی
            </Button>
            <Button icon={<ExpandOutlined />} onClick={() => setExpandedKeys(parentKeys)}>
              باز کردن همه
            </Button>
            <Button icon={<ShrinkOutlined />} onClick={() => setExpandedKeys([])}>
              بستن همه
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canEdit}
              className="bg-leather-600 border-none"
              onClick={() => navigate('/chart_of_accounts/create')}
            >
              حساب جدید
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 mb-4">
          <Input.Search
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو بر اساس کد یا نام حساب..."
          />
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { label: 'فعال', value: 'active' },
              { label: 'همه', value: 'all' },
              { label: 'غیرفعال', value: 'inactive' },
            ]}
          />
        </div>

        {treeData.length === 0 ? (
          <Empty description="حسابی برای نمایش وجود ندارد" />
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <Tree
              showLine
              blockNode
              treeData={treeData}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default ChartOfAccountsTreePage;
