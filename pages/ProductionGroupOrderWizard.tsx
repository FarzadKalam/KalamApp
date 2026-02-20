import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { App, Badge, Button, Card, Empty, Input, InputNumber, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LeftOutlined, ReloadOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import GridTable from '../components/GridTable';
import ProductionStagesField from '../components/ProductionStagesField';
import StartProductionModal, {
  type StartMaterialDeliveryRow,
  type StartMaterialGroup,
  type StartMaterialPiece,
} from '../components/production/StartProductionModal';
import { MODULES } from '../moduleRegistry';
import { BlockDefinition } from '../types';
import { supabase } from '../supabaseClient';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { applyProductionMoves } from '../utils/productionWorkflow';
import {
  buildGroupStartMaterials,
  type GroupStartMaterial,
  splitDeliveredAcrossRequirements,
} from '../utils/productionGroupOrders';

type GroupOrderRecord = {
  id: string;
  name: string;
  status?: string | null;
  system_code?: string | null;
  production_order_ids?: string[] | null;
};

type ProductionOrderRecord = {
  id: string;
  name: string;
  system_code?: string | null;
  status?: string | null;
  quantity?: number | null;
  grid_materials?: any[] | null;
  production_moves?: any[] | null;
  production_shelf_id?: string | null;
};

type RelationOption = {
  label: string;
  value: string;
  category?: string | null;
};

type PageLocationState = {
  selectedOrderIds?: string[];
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calcDeliveredQty = (row?: Partial<StartMaterialDeliveryRow> | null) => {
  const length = Math.max(0, toNumber((row as any)?.length));
  const width = Math.max(0, toNumber((row as any)?.width));
  const quantity = Math.max(0, toNumber((row as any)?.quantity));
  return length * width * quantity;
};

const toEnglishDigits = (value: any) =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const parseInputNumber = (value: string | number | null | undefined) => {
  const normalized = toEnglishDigits(value).replace(/,/g, '').replace(/\u066C/g, '').trim();
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeIds = (value: any): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeGridRowsForWizard = (rows: any[]) => {
  const sourceRows = Array.isArray(rows) ? rows : [];
  return sourceRows.map((row: any) => ({
    ...row,
    collapsed: true,
  }));
};

const createGroupSystemCode = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const timePart = String(now.getTime()).slice(-5);
  return `PGO-${datePart}-${timePart}`;
};

const getStatusTag = (status: string | null | undefined) => {
  const key = String(status || '');
  if (key === 'pending') return <Tag color="orange">در انتظار</Tag>;
  if (key === 'in_progress') return <Tag color="blue">در حال تولید</Tag>;
  if (key === 'completed') return <Tag color="green">تکمیل شده</Tag>;
  return <Tag>پیش‌نویس</Tag>;
};

const ProductionGroupOrderWizard: React.FC = () => {
  const { id: routeGroupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: msg } = App.useApp();
  const locationState = (location.state || {}) as PageLocationState;

  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [isSavingRows, setIsSavingRows] = useState(false);
  const [isSavingQuantities, setIsSavingQuantities] = useState(false);
  const [isStartingGroup, setIsStartingGroup] = useState(false);
  const [canEditGroup, setCanEditGroup] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [groupId, setGroupId] = useState<string | null>(routeGroupId || null);
  const [groupName, setGroupName] = useState('');
  const [groupStatus, setGroupStatus] = useState<string>('pending');

  const [availableOrders, setAvailableOrders] = useState<ProductionOrderRecord[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<ProductionOrderRecord[]>([]);
  const [orderRowsMap, setOrderRowsMap] = useState<Record<string, any[]>>({});
  const [orderQuantityMap, setOrderQuantityMap] = useState<Record<string, number>>({});

  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});

  const [currentStep, setCurrentStep] = useState(0);
  const [startMaterials, setStartMaterials] = useState<StartMaterialGroup[]>([]);
  const [sourceShelfOptionsByProduct, setSourceShelfOptionsByProduct] = useState<Record<string, { label: string; value: string; stock?: number }[]>>({});
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [orderPanelsExpanded, setOrderPanelsExpanded] = useState<Record<string, boolean>>({});
  const [materialOrderLoaded, setMaterialOrderLoaded] = useState<Record<string, boolean>>({});
  const [materialsStepLoading, setMaterialsStepLoading] = useState(false);
  const [startStepPreparing, setStartStepPreparing] = useState(false);

  const steps = useMemo(
    () => [
      { key: 'setup', title: '۱. ایجاد سفارش گروهی' },
      { key: 'materials', title: '۲. تکمیل قطعات' },
      { key: 'lines', title: '۳. خطوط و تعداد' },
      { key: 'start', title: '۴. تحویل مواد اولیه' },
      { key: 'progress', title: '۵. در حال تولید' },
    ],
    []
  );

  const gridBlock = useMemo(() => {
    const moduleConfig = MODULES.production_orders;
    return (moduleConfig?.blocks || []).find((block) => block.id === 'grid_materials') as BlockDefinition | undefined;
  }, []);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '');
      if (!key) return;
      map.set(key, String(category?.label || key));
    });
    return map;
  }, [gridBlock]);

  const productMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; system_code: string }>();
    const products = (relationOptions.products || []) as RelationOption[];
    products.forEach((item) => {
      const id = String(item?.value || '');
      if (!id) return;
      const label = String(item?.label || '').trim();
      const separatorIndex = label.indexOf(' - ');
      const systemCode = separatorIndex > -1 ? label.slice(0, separatorIndex).trim() : '';
      const name = separatorIndex > -1 ? label.slice(separatorIndex + 3).trim() : label;
      map.set(id, {
        name: name || id,
        system_code: systemCode || '',
      });
    });
    return map;
  }, [relationOptions]);

  const selectedOrderRows = useMemo(() => {
    const map = new Map(selectedOrders.map((order) => [order.id, order]));
    return selectedOrderIds
      .map((orderId) => map.get(orderId))
      .filter((row): row is ProductionOrderRecord => !!row);
  }, [selectedOrderIds, selectedOrders]);

  const deriveGroupStatusFromOrders = useCallback((rows: ProductionOrderRecord[]) => {
    if (!rows.length) return 'pending';
    const statuses = rows.map((row) => String(row?.status || ''));
    if (statuses.every((status) => status === 'completed')) return 'completed';
    if (statuses.some((status) => status === 'in_progress' || status === 'completed')) return 'in_progress';
    return 'pending';
  }, []);

  const allSelectedPending = useMemo(
    () => selectedOrderRows.length > 0 && selectedOrderRows.every((row) => String(row?.status || '') === 'pending'),
    [selectedOrderRows]
  );

  const orderPanelKey = useCallback((stepKey: 'materials' | 'lines' | 'progress', orderId: string) => {
    return `${stepKey}:${orderId}`;
  }, []);

  const isOrderPanelExpanded = useCallback(
    (stepKey: 'materials' | 'lines' | 'progress', orderId: string) => {
      return orderPanelsExpanded[orderPanelKey(stepKey, orderId)] === true;
    },
    [orderPanelKey, orderPanelsExpanded]
  );

  const setOrderPanelExpanded = useCallback(
    (stepKey: 'materials' | 'lines' | 'progress', orderId: string, expanded: boolean) => {
      const panelKey = orderPanelKey(stepKey, orderId);
      setOrderPanelsExpanded((prev) => ({ ...prev, [panelKey]: expanded }));
      if (stepKey === 'materials' && expanded) {
        setMaterialOrderLoaded((prev) => ({ ...prev, [orderId]: true }));
      }
    },
    [orderPanelKey]
  );

  const loadPermission = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        setCanEditGroup(false);
        return;
      }
      setCurrentUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('role_id').eq('id', user.id).maybeSingle();
      if (!profile?.role_id) {
        setCanEditGroup(true);
        return;
      }
      const { data: role } = await supabase.from('org_roles').select('permissions').eq('id', profile.role_id).maybeSingle();
      const perms = (role?.permissions || {}) as Record<string, any>;
      const orderEdit = perms?.production_orders?.edit !== false;
      const groupEdit = perms?.production_group_orders?.edit !== false;
      setCanEditGroup(orderEdit && groupEdit);
    } catch {
      setCanEditGroup(true);
    }
  }, []);

  const loadGridOptions = useCallback(async () => {
    const [{ data: products }, { data: options }] = await Promise.all([
      supabase.from('products').select('id, name, system_code, category').limit(3000),
      supabase.from('dynamic_options').select('category, label, value').eq('is_active', true).limit(4000),
    ]);

    const productOptions = (products || []).map((product: any) => ({
      value: String(product.id),
      label: `${product.system_code || '-'} - ${product.name || '-'}`,
      category: product.category || null,
    }));

    const nextDynamicOptions: Record<string, any[]> = {};
    (options || []).forEach((item: any) => {
      const category = String(item?.category || '');
      if (!category) return;
      if (!nextDynamicOptions[category]) nextDynamicOptions[category] = [];
      nextDynamicOptions[category].push({
        label: String(item?.label || item?.value || ''),
        value: String(item?.value || item?.label || ''),
      });
    });

    setRelationOptions({ products: productOptions });
    setDynamicOptions(nextDynamicOptions);
  }, []);

  const loadSelectableOrders = useCallback(async (currentSelectedIds: string[]) => {
    const selectFields = 'id,name,system_code,status,quantity,grid_materials,production_moves,production_shelf_id';
    const { data: pendingRows, error: pendingError } = await supabase
      .from('production_orders')
      .select(selectFields)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (pendingError) throw pendingError;

    const byId = new Map<string, ProductionOrderRecord>();
    (pendingRows || []).forEach((row: any) => byId.set(String(row.id), row as ProductionOrderRecord));

    const selectedIds = currentSelectedIds.map((item) => String(item)).filter(Boolean);
    if (selectedIds.length > 0) {
      const { data: selectedRows, error: selectedError } = await supabase
        .from('production_orders')
        .select(selectFields)
        .in('id', selectedIds);
      if (selectedError) throw selectedError;
      (selectedRows || []).forEach((row: any) => byId.set(String(row.id), row as ProductionOrderRecord));
    }

    setAvailableOrders(Array.from(byId.values()));
  }, []);

  const loadSelectedOrders = useCallback(async (orderIds: string[], replaceRows: boolean) => {
    const ids = orderIds.map((item) => String(item)).filter(Boolean);
    if (!ids.length) {
      setSelectedOrders([]);
      if (replaceRows) {
        setOrderRowsMap({});
        setOrderQuantityMap({});
      }
      return;
    }

    const selectFields = 'id,name,system_code,status,quantity,grid_materials,production_moves,production_shelf_id';
    const { data: rows, error } = await supabase.from('production_orders').select(selectFields).in('id', ids);
    if (error) throw error;

    const rowMap = new Map<string, ProductionOrderRecord>();
    (rows || []).forEach((row: any) => rowMap.set(String(row.id), row as ProductionOrderRecord));
    const orderedRows = ids.map((orderId) => rowMap.get(orderId)).filter((row): row is ProductionOrderRecord => !!row);
    setSelectedOrders(orderedRows);

    setOrderRowsMap((prev) => {
      const next = replaceRows ? {} : { ...prev };
      orderedRows.forEach((row) => {
        if (replaceRows || !next[row.id]) {
          next[row.id] = normalizeGridRowsForWizard(Array.isArray(row.grid_materials) ? row.grid_materials : []);
        }
      });
      return next;
    });

    setOrderQuantityMap((prev) => {
      const next = replaceRows ? {} : { ...prev };
      orderedRows.forEach((row) => {
        if (replaceRows || next[row.id] === undefined) {
          next[row.id] = toNumber(row.quantity);
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    void loadPermission();
  }, [loadPermission]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        await loadGridOptions();
        if (routeGroupId) {
          const { data: group, error } = await supabase
            .from('production_group_orders')
            .select('*')
            .eq('id', routeGroupId)
            .single();
          if (error) throw error;
          const groupRow = group as GroupOrderRecord;
          const ids = normalizeIds(groupRow?.production_order_ids);
          if (!mounted) return;
          setGroupId(groupRow.id);
          setGroupName(String(groupRow.name || ''));
          setGroupStatus(String(groupRow.status || 'pending'));
          setSelectedOrderIds(ids);
          await loadSelectableOrders(ids);
          await loadSelectedOrders(ids, true);
          setCurrentStep(groupRow.status === 'in_progress' || groupRow.status === 'completed' ? 4 : 0);
        } else {
          const preselected = (locationState?.selectedOrderIds || []).map((item) => String(item)).filter(Boolean);
          if (!mounted) return;
          setGroupId(null);
          setGroupName('');
          setGroupStatus('pending');
          setSelectedOrderIds(preselected);
          await loadSelectableOrders(preselected);
          if (preselected.length > 0) {
            await loadSelectedOrders(preselected, true);
          }
          setCurrentStep(0);
        }
      } catch (err: any) {
        if (mounted) msg.error(err?.message || 'خطا در بارگذاری اطلاعات سفارش گروهی');
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [routeGroupId, locationState?.selectedOrderIds, loadGridOptions, loadSelectableOrders, loadSelectedOrders, msg]);

  useEffect(() => {
    if (!initialized) return;
    void loadSelectedOrders(selectedOrderIds, false);
  }, [initialized, selectedOrderIds, loadSelectedOrders]);

  useEffect(() => {
    if (!selectedOrderRows.length) return;
    setOrderPanelsExpanded((prev) => {
      const next = { ...prev };
      selectedOrderRows.forEach((order) => {
        const oid = String(order.id);
        const materialsKey = orderPanelKey('materials', oid);
        const linesKey = orderPanelKey('lines', oid);
        const progressKey = orderPanelKey('progress', oid);
        if (!(materialsKey in next)) next[materialsKey] = false;
        if (!(linesKey in next)) next[linesKey] = false;
        if (!(progressKey in next)) next[progressKey] = false;
      });
      return next;
    });
  }, [orderPanelKey, selectedOrderRows]);

  useEffect(() => {
    if (!groupId) return;
    if (!selectedOrderRows.length) return;
    const nextStatus = deriveGroupStatusFromOrders(selectedOrderRows);
    if (nextStatus === groupStatus) return;

    let cancelled = false;
    const syncStatus = async () => {
      try {
        const nowIso = new Date().toISOString();
        const payload: Record<string, any> = {
          status: nextStatus,
          updated_by: currentUserId,
          updated_at: nowIso,
        };
        if (nextStatus === 'completed') {
          payload.completed_at = nowIso;
        } else if (groupStatus === 'completed') {
          payload.completed_at = null;
        }
        if (nextStatus === 'in_progress' && groupStatus === 'pending') {
          payload.started_at = nowIso;
        }
        const { error } = await supabase
          .from('production_group_orders')
          .update(payload)
          .eq('id', groupId);
        if (error) throw error;
        if (cancelled) return;
        setGroupStatus(nextStatus);
        if (nextStatus === 'in_progress' || nextStatus === 'completed') {
          setCurrentStep(4);
        }
      } catch (err) {
        console.warn('Could not sync group status from orders:', err);
      }
    };

    void syncStatus();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, deriveGroupStatusFromOrders, groupId, groupStatus, selectedOrderRows]);

  const refreshAll = useCallback(async () => {
    const ids = [...selectedOrderIds];
    await Promise.all([loadSelectableOrders(ids), loadSelectedOrders(ids, true)]);
  }, [loadSelectableOrders, loadSelectedOrders, selectedOrderIds]);

  const syncOrdersWithGroup = useCallback(async (targetGroupId: string, orderIds: string[]) => {
    const normalizedIds = Array.from(new Set(orderIds.map((item) => String(item)).filter(Boolean)));
    const { data: linkedRows, error: linkedError } = await supabase
      .from('production_orders')
      .select('id')
      .eq('production_group_order_id', targetGroupId);
    if (linkedError) throw linkedError;
    const linkedIds = (linkedRows || []).map((row: any) => String(row.id));
    const unlinkIds = linkedIds.filter((item) => !normalizedIds.includes(item));

    if (unlinkIds.length > 0) {
      const { error } = await supabase
        .from('production_orders')
        .update({ production_group_order_id: null })
        .in('id', unlinkIds);
      if (error) throw error;
    }

    if (normalizedIds.length > 0) {
      const { error } = await supabase
        .from('production_orders')
        .update({ production_group_order_id: targetGroupId })
        .in('id', normalizedIds);
      if (error) throw error;
    }
  }, []);

  const handleSaveSetup = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!groupName.trim()) {
      msg.error('عنوان سفارش گروهی را وارد کنید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.error('حداقل یک سفارش تولید انتخاب کنید.');
      return;
    }
    if (!allSelectedPending && !groupId) {
      msg.error('در ایجاد سفارش گروهی جدید، فقط سفارش‌های در وضعیت «در انتظار» قابل انتخاب هستند.');
      return;
    }

    setIsSavingSetup(true);
    try {
      let targetGroupId = groupId;
      if (!targetGroupId) {
        const payload = {
          name: groupName.trim(),
          status: 'pending',
          system_code: createGroupSystemCode(),
          production_order_ids: selectedOrderIds,
          created_by: currentUserId,
          updated_by: currentUserId,
        };
        const { data: inserted, error } = await supabase
          .from('production_group_orders')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        targetGroupId = String(inserted.id);
        setGroupId(targetGroupId);
        setGroupStatus('pending');
      } else {
        const { error } = await supabase
          .from('production_group_orders')
          .update({
            name: groupName.trim(),
            production_order_ids: selectedOrderIds,
            updated_by: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetGroupId);
        if (error) throw error;
      }

      await syncOrdersWithGroup(targetGroupId, selectedOrderIds);
      await refreshAll();

      if (!groupId) {
        navigate(`/production_group_orders/${targetGroupId}`, { replace: true });
      }
      msg.success('تنظیمات سفارش گروهی ذخیره شد.');
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره سفارش گروهی');
    } finally {
      setIsSavingSetup(false);
    }
  }, [
    allSelectedPending,
    canEditGroup,
    currentUserId,
    groupId,
    groupName,
    msg,
    navigate,
    refreshAll,
    selectedOrderIds,
    syncOrdersWithGroup,
  ]);

  const handleSaveRows = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.warning('سفارشی برای ذخیره قطعات انتخاب نشده است.');
      return;
    }
    setIsSavingRows(true);
    try {
      for (const orderId of selectedOrderIds) {
        const payloadRows = orderRowsMap[orderId] || [];
        const { error } = await supabase
          .from('production_orders')
          .update({
            grid_materials: payloadRows,
            updated_by: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);
        if (error) throw error;
      }
      msg.success('قطعات سفارش‌های تولید ذخیره شد.');
      await loadSelectedOrders(selectedOrderIds, true);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره قطعات');
    } finally {
      setIsSavingRows(false);
    }
  }, [canEditGroup, currentUserId, loadSelectedOrders, msg, orderRowsMap, selectedOrderIds]);

  const handleSaveQuantities = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.warning('سفارشی برای ثبت تعداد انتخاب نشده است.');
      return;
    }
    setIsSavingQuantities(true);
    try {
      for (const orderId of selectedOrderIds) {
        const qty = toNumber(orderQuantityMap[orderId]);
        const payload: Record<string, any> = {
          updated_by: currentUserId,
          updated_at: new Date().toISOString(),
        };
        if (qty > 0) payload.quantity = qty;
        const { error } = await supabase.from('production_orders').update(payload).eq('id', orderId);
        if (error) throw error;
      }
      msg.success('تعداد سفارش‌های تولید ذخیره شد.');
      await loadSelectedOrders(selectedOrderIds, true);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره تعداد سفارش‌ها');
    } finally {
      setIsSavingQuantities(false);
    }
  }, [canEditGroup, currentUserId, loadSelectedOrders, msg, orderQuantityMap, selectedOrderIds]);

  const buildDeliveryRowKey = () => `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const normalizeDeliveryRow = useCallback((group: StartMaterialGroup, rawRow?: any): StartMaterialDeliveryRow => {
    const firstPiece = Array.isArray(group.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    return {
      key: String(rawRow?.key || buildDeliveryRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length: toNumber(rawRow?.length ?? firstPiece?.length ?? 0),
      width: toNumber(rawRow?.width ?? firstPiece?.width ?? 0),
      quantity: Math.max(0, toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1)),
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      deliveredQty: calcDeliveredQty({
        length: rawRow?.length ?? firstPiece?.length ?? 0,
        width: rawRow?.width ?? firstPiece?.width ?? 0,
        quantity: rawRow?.quantity ?? firstPiece?.quantity ?? 1,
      }),
    };
  }, []);

  const recalcStartGroup = useCallback((group: StartMaterialGroup): StartMaterialGroup => {
    const pieces = Array.isArray(group.pieces) ? group.pieces : [];
    const rows = (Array.isArray(group.deliveryRows) ? group.deliveryRows : []).map((row) => ({
      ...row,
      deliveredQty: calcDeliveredQty(row),
    }));
    return {
      ...group,
      deliveryRows: rows,
      totalPerItemUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + toNumber(piece.perItemUsage), 0),
      totalUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + toNumber(piece.totalUsage), 0),
      totalDeliveredQty: rows.reduce((sum, row) => sum + calcDeliveredQty(row), 0),
    };
  }, []);

  const setStartMaterialCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const addDeliveryRow = useCallback((groupIndex: number) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      rows.push(normalizeDeliveryRow(group));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [normalizeDeliveryRow, recalcStartGroup]);

  const deleteDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const selected = new Set(rowKeys.map((key) => String(key)));
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = (group.deliveryRows || []).filter((row) => !selected.has(String(row.key)));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [recalcStartGroup]);

  const transferDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setStartMaterials((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const selected = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const picked = sourceRows.filter((row) => selected.has(String(row.key)));
      if (!picked.length) return prev;

      const copied = picked.map((row) =>
        normalizeDeliveryRow(targetGroup, {
          ...row,
          key: buildDeliveryRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copied];
      next[targetGroupIndex] = recalcStartGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !selected.has(String(row.key)));
        next[sourceGroupIndex] = recalcStartGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, [normalizeDeliveryRow, recalcStartGroup]);

  const updateDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StartMaterialDeliveryRow, 'key'>,
    value: any
  ) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = [...(group.deliveryRows || [])];
      const targetIndex = rows.findIndex((row) => String(row.key) === String(rowKey));
      if (targetIndex < 0) return prev;
      const row = rows[targetIndex];
      const numericFields: Array<keyof Omit<StartMaterialDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field) ? Math.max(0, toNumber(value)) : String(value ?? '');
      const updatedRow = { ...row, [field]: nextValue };
      rows[targetIndex] = { ...updatedRow, deliveredQty: calcDeliveredQty(updatedRow) };
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [recalcStartGroup]);

  const setSourceShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, sourceShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const setProductionShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, productionShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const onSourceShelfScan = useCallback((groupIndex: number, shelfId: string) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    const productId = group.selectedProductId;
    if (!productId) {
      msg.error('برای این ردیف، محصول انتخاب نشده است.');
      return;
    }
    const options = sourceShelfOptionsByProduct[productId] || [];
    const exists = options.some((option) => option.value === shelfId);
    if (!exists) {
      msg.error('این قفسه برای محصول انتخاب شده موجودی ندارد.');
      return;
    }
    setSourceShelf(groupIndex, shelfId);
  }, [msg, setSourceShelf, sourceShelfOptionsByProduct, startMaterials]);

  const onConfirmGroup = useCallback((groupIndex: number) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    if (!group.selectedProductId) {
      msg.error('برای این محصول، محصول انتخاب نشده است.');
      return;
    }
    if (!group.sourceShelfId) {
      msg.error('برای این محصول، قفسه برداشت انتخاب نشده است.');
      return;
    }
    if (!group.productionShelfId) {
      msg.error('برای این محصول، قفسه تولید انتخاب نشده است.');
      return;
    }
    if (!group.totalDeliveredQty || group.totalDeliveredQty <= 0) {
      msg.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setStartMaterials((prev) => {
      const next = [...prev];
      const target = next[groupIndex];
      if (!target) return prev;
      next[groupIndex] = { ...target, isConfirmed: true };
      return next;
    });
  }, [msg, startMaterials]);

  const loadProductionShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const filtered = (shelves || []).filter((row: any) => {
      const warehouseName = String(row?.warehouses?.name || '');
      return warehouseName.includes('تولید') || /production/i.test(warehouseName);
    });
    const options = (filtered.length ? filtered : (shelves || [])).map((row: any) => ({
      value: String(row.id),
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`,
    }));
    setProductionShelfOptions(options);
  }, []);

  const loadSourceShelvesByProduct = useCallback(async (productIds: string[]) => {
    const ids = Array.from(new Set(productIds.map((item) => String(item)).filter(Boolean)));
    if (!ids.length) {
      setSourceShelfOptionsByProduct({});
      return;
    }
    const { data: inventoryRows } = await supabase
      .from('product_inventory')
      .select('product_id, shelf_id, stock')
      .in('product_id', ids)
      .gt('stock', 0);

    const validRows = (inventoryRows || []).filter((row: any) => row?.product_id && row?.shelf_id);
    const shelfIds = Array.from(new Set(validRows.map((row: any) => String(row.shelf_id))));
    let shelfMap = new Map<string, { label: string; isProductionWarehouse: boolean }>();
    if (shelfIds.length > 0) {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .in('id', shelfIds)
        .limit(1000);
      shelfMap = new Map((shelves || []).map((shelf: any) => {
        const warehouseName = String(shelf?.warehouses?.name || '');
        const isProductionWarehouse = warehouseName.includes('تولید') || /production/i.test(warehouseName);
        const label = `${shelf.shelf_number || shelf.name || shelf.id}${warehouseName ? ` - ${warehouseName}` : ''}`;
        return [String(shelf.id), { label, isProductionWarehouse }];
      }));
    }

    const nextOptions: Record<string, { label: string; value: string; stock?: number }[]> = {};
    validRows.forEach((row: any) => {
      const productId = String(row.product_id);
      const shelfId = String(row.shelf_id);
      const stock = toNumber(row.stock);
      const shelfInfo = shelfMap.get(shelfId);
      if (shelfInfo?.isProductionWarehouse) return;
      const label = `${shelfInfo?.label || shelfId} (موجودی: ${toPersianNumber(stock)})`;
      if (!nextOptions[productId]) nextOptions[productId] = [];
      if (!nextOptions[productId].some((item) => item.value === shelfId)) {
        nextOptions[productId].push({ value: shelfId, label, stock });
      }
    });
    setSourceShelfOptionsByProduct(nextOptions);
  }, []);

  const prepareStartMaterials = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!selectedOrderRows.length) {
      if (!silent) msg.error('ابتدا حداقل یک سفارش تولید را انتخاب کنید.');
      setStartMaterials([]);
      return;
    }
    const groups = buildGroupStartMaterials({
      orders: selectedOrderRows,
      orderRowsMap,
      orderQuantityMap,
      categoryLabelMap,
      productMetaMap,
    });
    if (!groups.length) {
      if (!silent) msg.warning('مواد اولیه‌ای برای شروع تولید گروهی یافت نشد.');
      setStartMaterials([]);
      return;
    }
    const normalizedGroups = groups.map((group, index) => ({
      ...group,
      rowIndex: index,
      collapsed: true,
      isConfirmed: false,
      deliveryRows: Array.isArray(group.deliveryRows) ? group.deliveryRows : [],
    }));
    setStartMaterials(normalizedGroups);

    const productIds = Array.from(
      new Set(
        normalizedGroups
          .map((group) => group.selectedProductId)
          .filter((value): value is string => !!value)
      )
    );
    await Promise.all([loadProductionShelves(), loadSourceShelvesByProduct(productIds)]);
  }, [
    categoryLabelMap,
    loadProductionShelves,
    loadSourceShelvesByProduct,
    msg,
    orderQuantityMap,
    orderRowsMap,
    productMetaMap,
    selectedOrderRows,
  ]);

  useEffect(() => {
    if (currentStep !== 1) return;
    setMaterialsStepLoading(true);
    const timeout = setTimeout(() => setMaterialsStepLoading(false), 220);
    return () => clearTimeout(timeout);
  }, [currentStep, selectedOrderRows.length]);

  useEffect(() => {
    if (currentStep !== 3) return;
    let cancelled = false;
    const run = async () => {
      setStartStepPreparing(true);
      await prepareStartMaterials({ silent: true });
      if (!cancelled) setStartStepPreparing(false);
    };
    void run();
    return () => {
      cancelled = true;
      setStartStepPreparing(false);
    };
  }, [currentStep, prepareStartMaterials]);

  const handleConfirmStartGroup = useCallback(async () => {
    if (!groupId) {
      msg.error('ابتدا سفارش گروهی را ذخیره کنید.');
      return;
    }
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای شروع تولید گروهی ندارید.');
      return;
    }

    const confirmed = startMaterials.filter((group) => group.isConfirmed === true && toNumber(group.totalDeliveredQty) > 0);
    if (!confirmed.length) {
      msg.error('حداقل یک محصول باید تایید و ثبت شود.');
      return;
    }

    const missingShelf = confirmed.some((group) => !group.sourceShelfId || !group.productionShelfId);
    if (missingShelf) {
      msg.error('برای همه محصولات تایید شده باید قفسه برداشت و قفسه تولید انتخاب شده باشد.');
      return;
    }

    const moves = confirmed.map((group) => ({
      product_id: String(group.selectedProductId),
      from_shelf_id: String(group.sourceShelfId),
      to_shelf_id: String(group.productionShelfId),
      quantity: toNumber(group.totalDeliveredQty),
    }));

    setIsStartingGroup(true);
    try {
      await applyProductionMoves(moves);

      const nowIso = new Date().toISOString();
      const nextRowsByOrder: Record<string, any[]> = { ...orderRowsMap };
      const orderMovesMap: Record<string, any[]> = {};

      confirmed.forEach((group) => {
        const allocations = splitDeliveredAcrossRequirements(group as GroupStartMaterial);
        allocations.forEach((allocation) => {
          if (!allocation.orderId) return;
          const existingRows = Array.isArray(nextRowsByOrder[allocation.orderId]) ? [...nextRowsByOrder[allocation.orderId]] : [];
          const targetRow = existingRows[allocation.rowIndex];
          if (!targetRow) return;

          const nextRow: any = {
            ...targetRow,
            selected_shelf_id: group.sourceShelfId || targetRow?.selected_shelf_id || null,
            production_shelf_id: group.productionShelfId || targetRow?.production_shelf_id || null,
            delivered_total_qty: toNumber(allocation.deliveredQty),
            delivery_rows: group.deliveryRows || [],
          };

          if (Array.isArray(targetRow?.pieces)) {
            nextRow.pieces = targetRow.pieces.map((piece: any, pieceIndex: number) => {
              const delivered = allocation.pieceDeliveredByIndex?.[pieceIndex];
              if (delivered === undefined) return piece;
              return {
                ...piece,
                delivered_qty: toNumber(delivered),
              };
            });
          }

          existingRows[allocation.rowIndex] = nextRow;
          nextRowsByOrder[allocation.orderId] = existingRows;

          if (!orderMovesMap[allocation.orderId]) orderMovesMap[allocation.orderId] = [];
          if (toNumber(allocation.deliveredQty) > 0) {
            orderMovesMap[allocation.orderId].push({
              product_id: String(group.selectedProductId),
              from_shelf_id: String(group.sourceShelfId),
              to_shelf_id: String(group.productionShelfId),
              quantity: toNumber(allocation.deliveredQty),
            });
          }
        });
      });

      for (const orderId of selectedOrderIds) {
        const rows = nextRowsByOrder[orderId] || [];
        const movesForOrder = orderMovesMap[orderId] || [];
        const payload: Record<string, any> = {
          status: 'in_progress',
          grid_materials: rows,
          production_moves: movesForOrder,
          production_shelf_id: movesForOrder[0]?.to_shelf_id || null,
          production_started_at: nowIso,
          production_group_order_id: groupId,
          updated_by: currentUserId,
          updated_at: nowIso,
        };
        const qty = toNumber(orderQuantityMap[orderId]);
        if (qty > 0) payload.quantity = qty;
        const { error } = await supabase.from('production_orders').update(payload).eq('id', orderId);
        if (error) throw error;
      }

      const { error: groupError } = await supabase
        .from('production_group_orders')
        .update({
          status: 'in_progress',
          started_at: nowIso,
          production_order_ids: selectedOrderIds,
          updated_by: currentUserId,
          updated_at: nowIso,
        })
        .eq('id', groupId);
      if (groupError) throw groupError;

      setGroupStatus('in_progress');
      setOrderRowsMap(nextRowsByOrder);
      setCurrentStep(4);
      await loadSelectedOrders(selectedOrderIds, true);
      msg.success('تولید گروهی با موفقیت شروع شد.');
    } catch (err: any) {
      msg.error(err?.message || 'خطا در شروع تولید گروهی');
    } finally {
      setIsStartingGroup(false);
    }
  }, [
    canEditGroup,
    currentUserId,
    groupId,
    loadSelectedOrders,
    msg,
    orderQuantityMap,
    orderRowsMap,
    selectedOrderIds,
    startMaterials,
  ]);

  const columns = useMemo<ColumnsType<ProductionOrderRecord>>(
    () => [
      {
        title: 'سفارش تولید',
        dataIndex: 'name',
        key: 'name',
        render: (value: string, record: ProductionOrderRecord) => (
          <div className="flex flex-col">
            <span className="font-semibold">{value || '-'}</span>
            <span className="text-xs text-gray-500">{record.system_code || '-'}</span>
          </div>
        ),
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: string) => getStatusTag(value),
      },
      {
        title: 'تعداد',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 120,
        render: (value: number) => toPersianNumber(toNumber(value)),
      },
    ],
    []
  );

  const renderSetupStep = () => (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <Card className="rounded-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">عنوان سفارش گروهی</div>
            <Input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              disabled={!canEditGroup || groupStatus === 'completed'}
              placeholder="مثال: سفارش گروهی هفته سوم"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => void handleSaveSetup()}
              loading={isSavingSetup}
              disabled={!canEditGroup || groupStatus === 'completed'}
              className="bg-leather-600 hover:!bg-leather-500 border-none"
            >
              ذخیره مرحله اول
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
              بروزرسانی
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl flex-1 min-h-0" title="انتخاب سفارش‌های تولید (فقط وضعیت در انتظار)">
        <Table<ProductionOrderRecord>
          rowKey="id"
          dataSource={availableOrders}
          columns={columns}
          size="small"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: true, y: 360 }}
          rowSelection={{
            selectedRowKeys: selectedOrderIds,
            onChange: (keys: React.Key[]) => setSelectedOrderIds(keys.map((key) => String(key))),
            getCheckboxProps: (record: ProductionOrderRecord) => ({
              disabled: String(record.status || '') !== 'pending' && !selectedOrderIds.includes(String(record.id)),
            }),
          }}
        />
      </Card>
    </div>
  );

  const renderMaterialsStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => void handleSaveRows()}
          loading={isSavingRows}
          disabled={!canEditGroup || groupStatus === 'completed' || !selectedOrderRows.length}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          ذخیره قطعات سفارش‌ها
        </Button>
      </div>
      {materialsStepLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 flex items-center justify-center">
          <Spin />
        </div>
      ) : !selectedOrderRows.length || !gridBlock ? (
        <Empty description="سفارشی برای نمایش قطعات انتخاب نشده است." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <Button
                type="text"
                size="small"
                className="!text-gray-700 hover:!text-gray-900"
                icon={
                  <RightOutlined
                    className={`transition-transform ${
                      isOrderPanelExpanded('materials', order.id) ? 'rotate-90' : ''
                    }`}
                  />
                }
                onClick={() =>
                  setOrderPanelExpanded('materials', order.id, !isOrderPanelExpanded('materials', order.id))
                }
              />
            </div>
            {isOrderPanelExpanded('materials', order.id) ? (
              <div className="p-3">
                {!materialOrderLoaded[order.id] ? (
                  <div className="py-8 flex items-center justify-center">
                    <Spin />
                  </div>
                ) : (
                  <GridTable
                    block={gridBlock}
                    initialData={orderRowsMap[order.id] || []}
                    moduleId="production_orders"
                    mode="local"
                    relationOptions={relationOptions}
                    dynamicOptions={dynamicOptions}
                    canEditModule={canEditGroup && groupStatus !== 'completed'}
                    canViewField={() => true}
                    orderQuantity={toNumber(orderQuantityMap[order.id])}
                    onChange={(nextRows) => {
                      setOrderRowsMap((prev) => ({
                        ...prev,
                        [order.id]: nextRows,
                      }));
                    }}
                  />
                )}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const renderLinesStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => void handleSaveQuantities()}
          loading={isSavingQuantities}
          disabled={!canEditGroup || groupStatus === 'completed' || !selectedOrderRows.length}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          ذخیره تعداد سفارش‌ها
        </Button>
      </div>
      {!selectedOrderRows.length ? (
        <Empty description="سفارشی برای چیدمان خط تولید انتخاب نشده است." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <Button
                type="text"
                size="small"
                className="!text-gray-700 hover:!text-gray-900"
                icon={
                  <RightOutlined
                    className={`transition-transform ${
                      isOrderPanelExpanded('lines', order.id) ? 'rotate-90' : ''
                    }`}
                  />
                }
                onClick={() => setOrderPanelExpanded('lines', order.id, !isOrderPanelExpanded('lines', order.id))}
              />
            </div>
            {isOrderPanelExpanded('lines', order.id) ? (
              <div className="p-3">
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-1">تعداد سفارش تولید</div>
                  <InputNumber
                    className="w-full md:w-72"
                    min={0}
                    value={toNumber(orderQuantityMap[order.id])}
                    formatter={(value) => toPersianNumber(Number(value || 0).toLocaleString('en-US'))}
                    parser={(value) => parseInputNumber(value)}
                    disabled={!canEditGroup || groupStatus === 'completed'}
                    onChange={(nextValue) => {
                      const parsed = toNumber(nextValue);
                      setOrderQuantityMap((prev) => ({ ...prev, [order.id]: parsed }));
                    }}
                  />
                </div>
                <ProductionStagesField
                  recordId={order.id}
                  moduleId="production_orders"
                  compact
                  readOnly={!canEditGroup || groupStatus === 'completed'}
                  onQuantityChange={(qty) => {
                    const parsed = toNumber(qty);
                    setOrderQuantityMap((prev) => ({ ...prev, [order.id]: parsed }));
                  }}
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const renderStartStep = () => (
    <Card className="rounded-2xl">
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          در این مرحله، فرم تحویل مواد اولیه به‌صورت خودکار باز می‌شود و نیازی به باز کردن دستی جدول‌ها نیست.
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          تعداد سفارش انتخاب شده: <span className="font-semibold">{toPersianNumber(selectedOrderRows.length)}</span>
        </div>
        {startStepPreparing ? (
          <div className="py-8 flex items-center justify-center">
            <Spin />
          </div>
        ) : null}
        {!startStepPreparing && !selectedOrderRows.length ? (
          <Empty description="برای تحویل مواد اولیه، ابتدا سفارش تولید انتخاب کنید." />
        ) : null}
          {!startStepPreparing && selectedOrderRows.length > 0 && (
            <div className="space-y-3">
              <StartProductionModal
                inline
                open
                loading={isStartingGroup}
                materials={startMaterials}
                orderName={groupName || 'سفارش گروهی'}
                sourceShelfOptionsByProduct={sourceShelfOptionsByProduct}
                productionShelfOptions={productionShelfOptions}
                onCancel={() => {}}
                onStart={() => void handleConfirmStartGroup()}
                onToggleGroup={setStartMaterialCollapsed}
                onDeliveryRowAdd={addDeliveryRow}
                onDeliveryRowsDelete={deleteDeliveryRows}
                onDeliveryRowsTransfer={transferDeliveryRows}
                onDeliveryRowFieldChange={updateDeliveryRowField}
                onSourceShelfChange={setSourceShelf}
                onSourceShelfScan={onSourceShelfScan}
                onProductionShelfChange={setProductionShelf}
                onConfirmGroup={onConfirmGroup}
              />
              <div className="flex items-center justify-end gap-2">
                <Button icon={<ReloadOutlined />} onClick={() => void prepareStartMaterials({ silent: false })}>
                  بروزرسانی فرم تحویل
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => void handleConfirmStartGroup()}
                  loading={isStartingGroup}
                  disabled={!startMaterials.length || !canEditGroup || groupStatus === 'completed'}
                  className="bg-leather-600 hover:!bg-leather-500 border-none"
                >
                  شروع تولید گروهی
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    );

  const renderProgressStep = () => (
    <div className="space-y-4">
      {!selectedOrderRows.length ? (
        <Empty description="سفارشی برای پیگیری وجود ندارد." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <div className="flex items-center gap-2">
                {getStatusTag(order.status)}
                <Button onClick={() => navigate(`/production_orders/${order.id}`)}>نمایش سفارش</Button>
                <Button
                  type="text"
                  size="small"
                  className="!text-gray-700 hover:!text-gray-900"
                  icon={
                    <RightOutlined
                      className={`transition-transform ${
                        isOrderPanelExpanded('progress', order.id) ? 'rotate-90' : ''
                      }`}
                    />
                  }
                  onClick={() =>
                    setOrderPanelExpanded('progress', order.id, !isOrderPanelExpanded('progress', order.id))
                  }
                />
              </div>
            </div>
            {isOrderPanelExpanded('progress', order.id) ? (
              <div className="p-3">
                <ProductionStagesField
                  recordId={order.id}
                  moduleId="production_orders"
                  compact
                  readOnly={!canEditGroup || groupStatus === 'completed'}
                  orderStatus={order.status || null}
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const renderStepContent = () => {
    if (currentStep === 0) return renderSetupStep();
    if (currentStep === 1) return renderMaterialsStep();
    if (currentStep === 2) return renderLinesStep();
    if (currentStep === 3) return renderStartStep();
    return renderProgressStep();
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-96px)] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto animate-fadeIn pb-20 h-[calc(105vh-64px)] flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block" />
            سفارش گروهی تولید
          </h1>
          <Badge
            count={selectedOrderIds.length}
            overflowCount={999}
            style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
          />
        </div>
        <div className="flex items-center gap-2">
          {getStatusTag(groupStatus)}
          <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
            بروزرسانی
          </Button>
          <Button onClick={() => navigate('/production_group_orders')}>بازگشت به لیست</Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const blocked = index > 0 && !groupId;
            const canClick = !blocked && (index <= currentStep || !!groupId);
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (!canClick) return;
                  setCurrentStep(index);
                }}
                className={`relative px-4 py-2 text-sm font-semibold transition-all border ${
                  active
                    ? 'bg-leather-600 text-white border-leather-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-leather-400'
                } ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{
                  clipPath:
                    index === 0
                      ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
                      : 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)',
                  marginLeft: index === 0 ? 0 : -8,
                  minWidth: 180,
                }}
              >
                {step.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-4 md:p-6 flex-1 overflow-auto">
        {renderStepContent()}
      </div>

      <div className="flex items-center justify-between">
        <Button
          icon={<RightOutlined />}
          onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
          disabled={currentStep === 0}
        >
          مرحله قبل
        </Button>
        <Button
          type="primary"
          icon={<LeftOutlined />}
          onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
          disabled={currentStep >= steps.length - 1 || (currentStep === 0 && !groupId)}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          مرحله بعد
        </Button>
      </div>

    </div>
  );
};

export default ProductionGroupOrderWizard;
