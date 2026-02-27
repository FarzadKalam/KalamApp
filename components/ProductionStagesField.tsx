import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, OrderedListOutlined, TeamOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import TaskHandoverModal, { type StageHandoverConfirm, type StageHandoverGroup, type StageHandoverDeliveryRow } from './production/TaskHandoverModal';
import TaskHandoverFormsModal, {
  type StageHandoverFormListRow,
  type StageHandoverSummaryRow,
} from './production/TaskHandoverFormsModal';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import { MODULES } from '../moduleRegistry';

interface ProductionStagesFieldProps {
  recordId?: string;
  moduleId?: string;
  readOnly?: boolean;
  compact?: boolean;
  lazyLoad?: boolean;
  onlyLineId?: string | null;
  onQuantityChange?: (qty: number) => void;
  orderStatus?: string | null;
  draftStages?: any[];
  onDraftStagesChange?: (stages: any[]) => void;
  showWageSummary?: boolean;
}

type StageHandoverSide = 'giver' | 'receiver';

type StageAssignee = {
  id: string | null;
  type: 'user' | 'role' | null;
  label: string;
};

type StageHandoverContext = {
  taskId: string;
  orderId: string;
  lineId: string | null;
  sourceTaskId: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  previousTotalsByProduct: Record<string, number>;
  previousWasteByProduct: Record<string, number>;
  sourceTotalsByProduct: Record<string, number>;
  orderTotalsByProduct: Record<string, number>;
};

type StageHandoverForm = {
  id: string;
  sourceTaskId: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  wasteByProduct: Record<string, number>;
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, moduleId, readOnly = false, compact = false, lazyLoad = false, onlyLineId = null, onQuantityChange, orderStatus, draftStages, onDraftStagesChange, showWageSummary = false }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lineForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [draftLocal, setDraftLocal] = useState<any[]>(() => (Array.isArray(draftStages) ? draftStages : []));
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftForm] = Form.useForm();
  const [draftToCreate, setDraftToCreate] = useState<any | null>(null);
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [isReadyToLoad, setIsReadyToLoad] = useState(!lazyLoad);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBom = moduleId === 'production_boms';
  const isProcessTemplateModule = moduleId === 'process_templates';
  const isDraftOnlyModule = isBom || isProcessTemplateModule;
  const [currentUser, setCurrentUser] = useState<{ id: string | null; roleId: string | null; fullName: string }>({ id: null, roleId: null, fullName: 'کاربر' });
  const [handoverTask, setHandoverTask] = useState<any | null>(null);
  const [handoverContext, setHandoverContext] = useState<StageHandoverContext | null>(null);
  const [handoverGroups, setHandoverGroups] = useState<StageHandoverGroup[]>([]);
  const [handoverForms, setHandoverForms] = useState<StageHandoverForm[]>([]);
  const [, setNextStageHandoverFormRows] = useState<StageHandoverFormListRow[]>([]);
  const [activeHandoverFormId, setActiveHandoverFormId] = useState<string | null>(null);
  const [handoverFormsModalOpen, setHandoverFormsModalOpen] = useState(false);
  const [handoverEditorOpen, setHandoverEditorOpen] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [openTaskPopoverId, setOpenTaskPopoverId] = useState<string | null>(null);

  const onQuantityChangeRef = useRef<((qty: number) => void) | undefined>();

  useEffect(() => {
    onQuantityChangeRef.current = onQuantityChange;
  }, [onQuantityChange]);

  const normalizedDraftStages = useMemo(
    () => (Array.isArray(draftStages) ? draftStages : []),
    [draftStages]
  );
  const isProcessRecordModule = moduleId === 'projects' || moduleId === 'marketing_leads';
  const isProcessPreviewModule = moduleId === 'process_templates' || moduleId === 'process_runs';
  const isProcessModule = isProcessRecordModule || isProcessPreviewModule;
  const isProductionOrder = moduleId === 'production_orders';
  const supportsHandover = isProductionOrder;
  const processLineId = useMemo(
    () => `process-line:${String(moduleId || 'unknown')}:${String(recordId || 'draft')}`,
    [moduleId, recordId]
  );
  const processTitle = moduleId === 'marketing_leads'
    ? 'فرآیند بازاریابی'
    : moduleId === 'process_templates'
      ? 'مراحل الگوی فرآیند'
      : moduleId === 'process_runs'
        ? 'مراحل اجرای فرآیند'
        : 'فرآیند اجرا';

  useEffect(() => {
    setDraftLocal((prev) => (prev === normalizedDraftStages ? prev : normalizedDraftStages));
  }, [normalizedDraftStages]);

  useEffect(() => {
    if (!lazyLoad) {
      setIsReadyToLoad(true);
      return;
    }
    setIsReadyToLoad(false);
  }, [lazyLoad, recordId, moduleId]);

  useEffect(() => {
    if (!lazyLoad || isReadyToLoad) return;
    const target = containerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsReadyToLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [lazyLoad, isReadyToLoad]);

  const toNumber = useCallback((value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const productionModule = MODULES['production_orders'] as any;
    const gridBlock = (productionModule?.blocks || []).find((block: any) => block?.id === 'grid_materials');
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '').trim();
      if (!key) return;
      map.set(key, String(category?.label || key));
    });
    return map;
  }, []);

  const resolveCategoryLabel = useCallback((rawCategory: any) => {
    const raw = String(rawCategory || '').trim();
    if (!raw) return 'مواد اولیه';
    return categoryLabelMap.get(raw) || raw;
  }, [categoryLabelMap]);

  const buildHandoverRowKey = useCallback(
    () => `handover_row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const normalizeHandoverDeliveryRow = useCallback((group: StageHandoverGroup, rawRow?: any): StageHandoverDeliveryRow => {
    const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    const length = Math.max(0, toNumber(rawRow?.length ?? firstPiece?.length ?? 0));
    const width = Math.max(0, toNumber(rawRow?.width ?? firstPiece?.width ?? 0));
    const quantity = Math.max(0, toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1));
    return {
      key: String(rawRow?.key || buildHandoverRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length,
      width,
      quantity,
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      deliveredQty: length * width * quantity,
    };
  }, [buildHandoverRowKey, toNumber]);

  const sumDeliveredRows = useCallback((rows: StageHandoverDeliveryRow[]) => {
    return rows.reduce(
      (sum, row) => sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
      0
    );
  }, [toNumber]);

  const recalcHandoverGroup = useCallback((group: StageHandoverGroup): StageHandoverGroup => {
    const pieces = Array.isArray(group?.pieces) ? group.pieces : [];
    const orderPieces = Array.isArray(group?.orderPieces) ? group.orderPieces : [];
    const deliveryRows = Array.isArray(group?.deliveryRows)
      ? group.deliveryRows.map((row) => normalizeHandoverDeliveryRow(group, row))
      : [];
    const totalSourceQty = pieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const totalOrderQty = orderPieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const fallbackTotal = pieces.reduce(
      (sum, row) => sum + Math.max(0, toNumber((row as any)?.handoverQty ?? row?.sourceQty)),
      0
    );
    const totalHandoverQty = deliveryRows.length > 0 ? sumDeliveredRows(deliveryRows) : fallbackTotal;
    return {
      ...group,
      pieces,
      orderPieces,
      deliveryRows,
      totalSourceQty,
      totalOrderQty,
      totalHandoverQty,
    };
  }, [normalizeHandoverDeliveryRow, sumDeliveredRows, toNumber]);

  const parseRecurrenceInfo = useCallback((value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const getHandoverFromTask = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const handover = recurrence?.production_handover;
    if (!handover || typeof handover !== 'object') return null;
    return handover as any;
  }, [parseRecurrenceInfo]);

  const assigneeLabelFromIds = useCallback((assigneeId: string | null | undefined, assigneeType: string | null | undefined) => {
    if (!assigneeId) return 'تعیین نشده';
    if (assigneeType === 'role') {
      const role = assignees.roles.find((item: any) => String(item?.id) === String(assigneeId));
      return role?.title || 'تعیین نشده';
    }
    const user = assignees.users.find((item: any) => String(item?.id) === String(assigneeId));
    return user?.full_name || 'تعیین نشده';
  }, [assignees.roles, assignees.users]);

  const fetchAssignees = async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('id, full_name');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      setAssignees({ users: users || [], roles: roles || [] });
    } catch (e) {
      console.error('Error fetching assignees', e);
    }
  };

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role_id')
        .eq('id', userId)
        .maybeSingle();
      setCurrentUser({ id: userId, roleId: profile?.role_id ? String(profile.role_id) : null, fullName: profile?.full_name || 'کاربر' });
    } catch (err) {
      console.warn('Could not fetch current user for handover', err);
    }
  }, []);

  const fetchProductionShelves = useCallback(async () => {
    try {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .limit(500);
      const filtered = (shelves || []).filter((row: any) => {
        const warehouseName = String(row?.warehouses?.name || '');
        return warehouseName.includes('تولید') || /production/i.test(warehouseName);
      });
      const source = filtered.length ? filtered : (shelves || []);
      const options = source.map((row: any) => ({
        value: String(row.id),
        label: `${row?.shelf_number || row?.name || row?.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`,
      }));
      setProductionShelfOptions(options);
    } catch (err) {
      console.warn('Could not fetch production shelves', err);
      setProductionShelfOptions([]);
    }
  }, []);

  const fetchLines = async () => {
    if (isDraftOnlyModule) return;
    if (isProcessModule) {
      setLines([{ id: processLineId, line_no: 1, quantity: 1 }]);
      return;
    }
    if (!recordId || isBom) return;
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: true });
      if (error) throw error;
      setLines(data || []);
    } catch (error) {
      console.error('Error fetching lines:', error);
    }
  };

  const fetchTasks = async () => {
    if (isDraftOnlyModule) return [] as any[];
    if (!recordId) {
      setTasks([]);
      return [] as any[];
    }
    try {
      setLoading(true);
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url),
          assigned_role:org_roles(title)
        `);

      if (isProcessPreviewModule) {
        setTasks([]);
        return [] as any[];
      }

      if (isProcessRecordModule) {
        query = query.eq('related_to_module', String(moduleId || ''));
        if (moduleId === 'projects') {
          query = query.eq('project_id', recordId);
        } else if (moduleId === 'marketing_leads') {
          query = query.eq('marketing_lead_id', recordId);
        }
      } else {
        query = query.eq('related_production_order', recordId);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) throw error;
      const next = data || [];
      setTasks(next);
      return next;
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      return [] as any[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReadyToLoad) return;
    fetchLines();
    fetchTasks();
    fetchAssignees();
    fetchCurrentUser();
    if (supportsHandover) {
      fetchProductionShelves();
    }
  }, [recordId, isDraftOnlyModule, isProcessModule, processLineId, supportsHandover, isReadyToLoad, fetchCurrentUser, fetchProductionShelves]);

  const syncOrderQuantity = useCallback(async (nextLines: any[]) => {
    if (!recordId || isBom || !isProductionOrder) return;
    const nextTotal = nextLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0);
    onQuantityChangeRef.current?.(nextTotal);
    const { error } = await supabase
      .from('production_orders')
      .update({ quantity: nextTotal })
      .eq('id', recordId);
    if (error) {
      message.error(`خطا در بروزرسانی تعداد تولید: ${error.message}`);
    }
  }, [recordId, isBom, isProductionOrder]);

  useEffect(() => {
    if (!recordId || isBom || !isProductionOrder) return;
    syncOrderQuantity(lines);
  }, [lines, recordId, syncOrderQuantity, isBom, isProductionOrder]);

  const tasksByLine = useMemo(() => {
    const map = new Map<string, any[]>();
    if (isProcessPreviewModule && moduleId === 'process_runs') {
      const pseudoTasks = normalizedDraftStages.map((stage: any, index: number) => ({
        id: String(stage?.id || `run_stage_${index + 1}`),
        name: stage?.name || stage?.stage_name || `مرحله ${index + 1}`,
        status: stage?.status || 'todo',
        sort_order: stage?.sort_order || ((index + 1) * 10),
        wage: stage?.wage || 0,
        assignee_id: stage?.assignee_id || null,
        assignee_role_id: stage?.assignee_role_id || null,
        assignee_type: stage?.assignee_type || null,
      }));
      map.set(processLineId, pseudoTasks);
      return map;
    }
    if (isProcessModule) {
      map.set(
        processLineId,
        [...tasks].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
      );
      return map;
    }
    lines.forEach(line => map.set(String(line.id), []));
    tasks.forEach(task => {
      const lineId = task.production_line_id ? String(task.production_line_id) : null;
      if (lineId && map.has(lineId)) {
        map.get(lineId)!.push(task);
      }
    });
    return map;
  }, [isProcessPreviewModule, normalizedDraftStages, moduleId, isProcessModule, processLineId, lines, tasks]);

  const getLineTaskChain = useCallback((lineId: string | null | undefined, sourceTasks?: any[]) => {
    if (isProcessModule) {
      return (sourceTasks || tasks)
        .slice()
        .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    }
    if (!lineId) return [] as any[];
    const scoped = (sourceTasks || tasks)
      .filter((item: any) => String(item?.production_line_id || '') === String(lineId))
      .slice()
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    return scoped;
  }, [isProcessModule, tasks]);

  const toGroupTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const anyGroup = group as any;
      const pickedPiece = (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).find(
        (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
      );
      const productId =
        anyGroup?.selectedProductId
        || anyGroup?.selected_product_id
        || pickedPiece?.selectedProductId
        || pickedPiece?.selected_product_id
        || pickedPiece?.product_id
        || null;
      const normalizedProductId = productId ? String(productId) : '';
      if (!normalizedProductId) return;
      const deliveryRows = Array.isArray(anyGroup?.deliveryRows) ? anyGroup.deliveryRows : [];
      const qty = deliveryRows.length > 0
        ? deliveryRows.reduce(
            (sum: number, row: any) =>
              sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
            0
          )
        : (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).reduce(
            (sum: number, piece: any) => sum + toNumber(piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0),
            0
          );
      totals[normalizedProductId] = (totals[normalizedProductId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toSourceTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toOrderTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.orderPieces) ? group.orderPieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const buildHandoverFormId = useCallback(
    () => `handover_form_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const buildPiecesFromOrderRow = useCallback((row: any, rowIndex: number, orderQty: number, useDeliveredQty: boolean) => {
    const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
    return rowPieces.map((piece: any, pieceIndex: number) => {
      const hasDelivered = Object.prototype.hasOwnProperty.call(piece || {}, 'delivered_qty');
      const deliveredQty = hasDelivered ? toNumber(piece?.delivered_qty) : null;
      const finalUsage = toNumber(piece?.final_usage);
      const totalUsage = toNumber(piece?.total_usage);
      const fallback = totalUsage > 0 ? totalUsage : (finalUsage > 0 ? finalUsage * orderQty : 0);
      const sourceQty = useDeliveredQty && deliveredQty !== null ? deliveredQty : fallback;
      return {
        key: `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`,
        name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
        length: toNumber(piece?.length),
        width: toNumber(piece?.width),
        quantity: toNumber(piece?.quantity),
        totalQuantity: toNumber(piece?.quantity) * orderQty,
        mainUnit: String(piece?.main_unit || row?.main_unit || ''),
        subUnit: String(piece?.sub_unit || ''),
        subUsage: toNumber(piece?.qty_sub),
        sourceQty,
        handoverQty: sourceQty,
      } as any;
    });
  }, [toNumber]);

  const buildGroupsFromOrder = useCallback((order: any): StageHandoverGroup[] => {
    const rows = Array.isArray(order?.grid_materials) ? order.grid_materials : [];
    const orderQty = Math.max(1, toNumber(order?.quantity));
    return rows.map((row: any, rowIndex: number) => {
      const header = row?.header || {};
      const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
      const selectedPiece = rowPieces.find((piece: any) => (
        piece?.selected_product_id || piece?.product_id || piece?.selected_product_name || piece?.product_name
      )) || null;
      const selectedProductId =
        header?.selected_product_id
        || row?.selected_product_id
        || row?.product_id
        || selectedPiece?.selected_product_id
        || selectedPiece?.product_id
        || null;
      const selectedProductName =
        header?.selected_product_name
        || row?.selected_product_name
        || row?.product_name
        || selectedPiece?.selected_product_name
        || selectedPiece?.product_name
        || '-';
      const selectedProductCode =
        header?.selected_product_code
        || row?.selected_product_code
        || row?.product_code
        || selectedPiece?.selected_product_code
        || selectedPiece?.product_code
        || '';
      const categoryLabel = resolveCategoryLabel(header?.category_label || header?.category);
      const pieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, true);
      const orderPieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, false);
      const deliveryRows = pieces.map((piece: any) => normalizeHandoverDeliveryRow(
        { pieces } as StageHandoverGroup,
        {
          pieceKey: piece.key,
          name: piece.name,
          length: piece.length,
          width: piece.width,
          quantity: piece.quantity,
          mainUnit: piece.mainUnit,
          subUnit: piece.subUnit,
          deliveredQty: piece.sourceQty,
        }
      ));

      return recalcHandoverGroup({
        key: `${String(row?.key || 'group')}_${rowIndex}`,
        rowIndex,
        categoryLabel: String(categoryLabel || 'مواد اولیه'),
        selectedProductId: selectedProductId ? String(selectedProductId) : null,
        selectedProductName: String(selectedProductName || '-'),
        selectedProductCode: String(selectedProductCode || ''),
        sourceShelfId: null,
        targetShelfId: null,
        pieces,
        orderPieces,
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: rowIndex !== 0,
        isConfirmed: false,
      } as StageHandoverGroup);
    });
  }, [buildPiecesFromOrderRow, normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const buildGroupsFromPreviousStage = useCallback((groups: any[]) => {
    const sourceGroups = Array.isArray(groups) ? groups : [];
    return sourceGroups.map((group: any, groupIndex: number) => {
      const piecesRaw = Array.isArray(group?.pieces) ? group.pieces : [];
      const selectedPiece = piecesRaw.find((piece: any) => (
        piece?.selectedProductId || piece?.selected_product_id || piece?.product_id || piece?.selectedProductName || piece?.selected_product_name
      )) || null;
      const pieces = piecesRaw.map((piece: any, pieceIndex: number) => {
        const sourceQty = toNumber(piece?.handoverQty ?? piece?.sourceQty ?? piece?.totalUsage ?? 0);
        return {
          key: String(piece?.key || `${groupIndex}_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: toNumber(piece?.length),
          width: toNumber(piece?.width),
          quantity: toNumber(piece?.quantity),
          totalQuantity: toNumber(piece?.totalQuantity),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          subUsage: toNumber(piece?.subUsage ?? piece?.sub_usage ?? 0),
          sourceQty,
          handoverQty: sourceQty,
        };
      });
      const savedDeliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
      const deliveryRows = savedDeliveryRows.length > 0
        ? savedDeliveryRows.map((row: any) => normalizeHandoverDeliveryRow({ pieces } as StageHandoverGroup, row))
        : pieces.map((piece: any) => normalizeHandoverDeliveryRow(
            { pieces } as StageHandoverGroup,
            {
              pieceKey: piece.key,
              name: piece.name,
              length: piece.length,
              width: piece.width,
              quantity: piece.quantity,
              mainUnit: piece.mainUnit,
              subUnit: piece.subUnit,
              deliveredQty: toNumber(piece?.handoverQty ?? piece?.sourceQty),
            }
          ));
      return recalcHandoverGroup({
        key: String(group?.key || `group_${groupIndex}`),
        rowIndex: Number(group?.rowIndex ?? groupIndex),
        categoryLabel: resolveCategoryLabel(group?.categoryLabel || group?.category_label),
        selectedProductId: (group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          ? String(group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          : null,
        selectedProductName: String(group?.selectedProductName || group?.selected_product_name || selectedPiece?.selectedProductName || selectedPiece?.selected_product_name || selectedPiece?.product_name || '-'),
        selectedProductCode: String(group?.selectedProductCode || group?.selected_product_code || selectedPiece?.selectedProductCode || selectedPiece?.selected_product_code || selectedPiece?.product_code || ''),
        sourceShelfId: (group?.sourceShelfId || group?.source_shelf_id)
          ? String(group?.sourceShelfId || group?.source_shelf_id)
          : null,
        targetShelfId: (group?.targetShelfId || group?.target_shelf_id)
          ? String(group?.targetShelfId || group?.target_shelf_id)
          : null,
        pieces,
        orderPieces: Array.isArray(group?.orderPieces) ? group.orderPieces : [],
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: typeof group?.collapsed === 'boolean' ? group.collapsed : groupIndex !== 0,
        isConfirmed: group?.isConfirmed === true,
      } as StageHandoverGroup);
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const mergeSavedGroups = useCallback((baseGroups: StageHandoverGroup[], savedGroups: any[]) => {
    const savedMap = new Map<string, any>((Array.isArray(savedGroups) ? savedGroups : []).map((group: any) => [String(group?.key || ''), group]));
    return baseGroups.map((group) => {
      const savedGroup = savedMap.get(String(group.key));
      if (!savedGroup) return recalcHandoverGroup(group);
      const savedPieces = new Map<string, any>((Array.isArray(savedGroup?.pieces) ? savedGroup.pieces : []).map((piece: any) => [String(piece?.key || ''), piece]));
      const pieces = group.pieces.map((piece) => {
        const savedPiece = savedPieces.get(String(piece.key));
        if (!savedPiece) return piece;
        return {
          ...piece,
          handoverQty: Math.max(0, toNumber(savedPiece?.handoverQty)),
        };
      });

      let deliveryRows = Array.isArray(savedGroup?.deliveryRows)
        ? savedGroup.deliveryRows.map((row: any) => normalizeHandoverDeliveryRow(group, row))
        : [];
      if (!deliveryRows.length) {
        deliveryRows = pieces.map((piece) => {
          const savedPiece = savedPieces.get(String(piece.key));
          return normalizeHandoverDeliveryRow(group, {
            pieceKey: piece.key,
            name: piece.name,
            length: piece.length,
            width: piece.width,
            quantity: piece.quantity,
            mainUnit: piece.mainUnit,
            subUnit: piece.subUnit,
            deliveredQty: toNumber(savedPiece?.handoverQty ?? piece?.sourceQty),
          });
        });
      }

      return recalcHandoverGroup({
        ...group,
        categoryLabel: resolveCategoryLabel(savedGroup?.categoryLabel || group.categoryLabel),
        targetShelfId: savedGroup?.targetShelfId ? String(savedGroup.targetShelfId) : group.targetShelfId,
        pieces,
        deliveryRows,
        collapsed: typeof savedGroup?.collapsed === 'boolean' ? savedGroup.collapsed : group.collapsed,
        isConfirmed: savedGroup?.isConfirmed === true,
      });
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const openTaskHandoverModal = useCallback(async (task: any, providedTasks?: any[]) => {
    if (!supportsHandover || !task?.id || !recordId || isBom) return;
    try {
      setOpenTaskPopoverId(null);
      setHandoverLoading(true);
      if (!productionShelfOptions.length) await fetchProductionShelves();
      if (!assignees.users.length && !assignees.roles.length) await fetchAssignees();

      const [{ data: latestTask }, { data: order }] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', task.id).maybeSingle(),
        supabase
          .from('production_orders')
          .select('id, quantity, assignee_id, assignee_type, grid_materials, production_shelf_id')
          .eq('id', recordId)
          .maybeSingle(),
      ]);
      const currentTask = latestTask || task;
      const lineId = currentTask?.production_line_id ? String(currentTask.production_line_id) : null;
      const lineTasks = getLineTaskChain(lineId, providedTasks);
      const currentTaskIndex = lineTasks.findIndex((item: any) => String(item?.id) === String(currentTask.id));
      const previousTask = currentTaskIndex > 0 ? lineTasks[currentTaskIndex - 1] : null;
      const nextTask = currentTaskIndex >= 0 && currentTaskIndex < lineTasks.length - 1
        ? lineTasks[currentTaskIndex + 1]
        : null;

      const previousHandover = previousTask ? getHandoverFromTask(previousTask) : null;
      const currentHandover = getHandoverFromTask(currentTask);
      const nextHandover = nextTask ? getHandoverFromTask(nextTask) : null;

      const sourceStageName = previousTask?.name || 'شروع تولید';
      const sourceShelfId = previousTask?.production_shelf_id
        ? String(previousTask.production_shelf_id)
        : (previousHandover?.targetShelfId || order?.production_shelf_id || null);
      const targetShelfId = currentTask?.production_shelf_id
        ? String(currentTask.production_shelf_id)
        : (currentHandover?.targetShelfId || sourceShelfId || order?.production_shelf_id || null);

      const orderGroups = buildGroupsFromOrder(order || {});
      const orderByKey = new Map<string, StageHandoverGroup>(
        orderGroups.map((group) => [String(group.key), group])
      );
      const orderByProductCategory = new Map<string, StageHandoverGroup>();
      orderGroups.forEach((group) => {
        const key = `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`;
        if (key !== '|') orderByProductCategory.set(key, group);
      });

      const baseGroups = previousTask
        ? buildGroupsFromPreviousStage(previousHandover?.groups || [])
        : orderGroups;

      const withOrderGroups = baseGroups.map((group, index) => {
        const byKey = orderByKey.get(String(group.key));
        const byProductCategory = orderByProductCategory.get(
          `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`
        );
        const byIndex = orderGroups[index];
        const matched = byKey || byProductCategory || byIndex;
        const orderPieces = matched?.orderPieces || matched?.pieces || group.orderPieces || [];
        return recalcHandoverGroup({
          ...group,
          categoryLabel: resolveCategoryLabel(group.categoryLabel),
          orderPieces,
        });
      });

      const mergedGroups = mergeSavedGroups(withOrderGroups, currentHandover?.groups || []).map((group) =>
        recalcHandoverGroup({
          ...group,
          sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
          targetShelfId: targetShelfId ? String(targetShelfId) : null,
        })
      );

      const giverSourceId = previousTask?.assignee_id || order?.assignee_id || null;
      const giverSourceType = previousTask?.assignee_type || order?.assignee_type || null;
      const giver: StageAssignee = {
        id: giverSourceId ? String(giverSourceId) : null,
        type: giverSourceType === 'role' ? 'role' : (giverSourceType === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(giverSourceId, giverSourceType),
      };
      const receiver: StageAssignee = {
        id: currentTask?.assignee_id ? String(currentTask.assignee_id) : null,
        type: currentTask?.assignee_type === 'role' ? 'role' : (currentTask?.assignee_type === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(currentTask?.assignee_id, currentTask?.assignee_type),
      };

      const normalizeForm = (rawForm: any): StageHandoverForm => {
        const formId = String(rawForm?.id || buildHandoverFormId());
        const mergedFormGroups = mergeSavedGroups(withOrderGroups, rawForm?.groups || []).map((group) =>
          recalcHandoverGroup({
            ...group,
            sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
            targetShelfId: rawForm?.targetShelfId
              ? String(rawForm.targetShelfId)
              : (targetShelfId ? String(targetShelfId) : null),
          })
        );
        return {
          id: formId,
          sourceTaskId: rawForm?.sourceTaskId ? String(rawForm.sourceTaskId) : (previousTask?.id ? String(previousTask.id) : null),
          sourceStageName: String(rawForm?.sourceStageName || sourceStageName || 'شروع تولید'),
          sourceShelfId: rawForm?.sourceShelfId
            ? String(rawForm.sourceShelfId)
            : (sourceShelfId ? String(sourceShelfId) : null),
          targetShelfId: rawForm?.targetShelfId
            ? String(rawForm.targetShelfId)
            : (targetShelfId ? String(targetShelfId) : null),
          giver,
          receiver,
          groups: mergedFormGroups,
          wasteByProduct: rawForm?.wasteByProduct && typeof rawForm.wasteByProduct === 'object'
            ? rawForm.wasteByProduct
            : {},
          giverConfirmation: rawForm?.giverConfirmation?.confirmed
            ? rawForm.giverConfirmation
            : { confirmed: false },
          receiverConfirmation: rawForm?.receiverConfirmation?.confirmed
            ? rawForm.receiverConfirmation
            : { confirmed: false },
          createdAt: rawForm?.createdAt || rawForm?.updatedAt || new Date().toISOString(),
          updatedAt: rawForm?.updatedAt || rawForm?.createdAt || new Date().toISOString(),
        };
      };

      const existingFormsRaw = Array.isArray(currentHandover?.forms) ? currentHandover.forms : [];
      const legacyForm =
        existingFormsRaw.length === 0 && Array.isArray(currentHandover?.groups)
          ? [{
              id: currentHandover?.activeFormId || buildHandoverFormId(),
              sourceTaskId: currentHandover?.sourceTaskId || (previousTask?.id ? String(previousTask.id) : null),
              sourceStageName: currentHandover?.sourceStageName || sourceStageName,
              sourceShelfId: currentHandover?.sourceShelfId || sourceShelfId,
              targetShelfId: currentHandover?.targetShelfId || targetShelfId,
              giverConfirmation: currentHandover?.giverConfirmation || { confirmed: false },
              receiverConfirmation: currentHandover?.receiverConfirmation || { confirmed: false },
              wasteByProduct: currentHandover?.wasteByProduct || {},
              groups: currentHandover?.groups || [],
              updatedAt: currentHandover?.updatedAt || new Date().toISOString(),
            }]
          : [];
      const seedForms = existingFormsRaw.length > 0 ? existingFormsRaw : legacyForm;
      const normalizedForms = (seedForms.length > 0
        ? seedForms
        : [{
            id: buildHandoverFormId(),
            groups: mergedGroups,
            sourceTaskId: previousTask?.id ? String(previousTask.id) : null,
            sourceStageName,
            sourceShelfId,
            targetShelfId,
            giverConfirmation: { confirmed: false },
            receiverConfirmation: { confirmed: false },
            wasteByProduct: {},
            updatedAt: new Date().toISOString(),
          }]
      ).map((form: any) => normalizeForm(form));

      const preferredFormId = String(currentHandover?.activeFormId || normalizedForms[0]?.id || '');
      const activeForm = normalizedForms.find((form: StageHandoverForm) => String(form.id) === preferredFormId) || normalizedForms[0];
      const sourceTotalsByProduct = toSourceTotals(withOrderGroups);
      const orderTotalsByProduct = toOrderTotals(withOrderGroups);
      const outgoingRows: StageHandoverFormListRow[] = (() => {
        const rawForms = Array.isArray(nextHandover?.forms) ? nextHandover.forms : [];
        const normalizedOutgoing = rawForms.length > 0
          ? rawForms
          : (Array.isArray(nextHandover?.groups) ? [{ ...nextHandover, id: nextHandover?.activeFormId || `next_${Date.now()}` }] : []);
        return normalizedOutgoing.map((form: any, index: number) => ({
          id: String(form?.id || `next_${index}`),
          title: `تحویل به ${String(nextTask?.name || nextTask?.title || 'مرحله بعد')}${index > 0 ? ` (${toPersianNumber(index + 1)})` : ''}`,
          createdAt: form?.createdAt || form?.updatedAt || null,
          updatedAt: form?.updatedAt || form?.createdAt || null,
          giverConfirmed: !!form?.giverConfirmation?.confirmed,
          receiverConfirmed: !!form?.receiverConfirmation?.confirmed,
        }));
      })();

      setHandoverTask(currentTask);
      setHandoverForms(normalizedForms);
      setNextStageHandoverFormRows(outgoingRows);
      setActiveHandoverFormId(activeForm?.id || null);
      setHandoverGroups(activeForm?.groups || []);
      setHandoverContext({
        taskId: String(currentTask.id),
        orderId: String(recordId),
        lineId,
        sourceTaskId: previousTask?.id ? String(previousTask.id) : null,
        sourceStageName,
        sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
        targetShelfId: activeForm?.targetShelfId || (targetShelfId ? String(targetShelfId) : null),
        giver,
        receiver,
        groups: withOrderGroups,
        giverConfirmation: activeForm?.giverConfirmation || { confirmed: false },
        receiverConfirmation: activeForm?.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((activeForm?.groups || []) as any),
        previousWasteByProduct: activeForm?.wasteByProduct || {},
        sourceTotalsByProduct,
        orderTotalsByProduct,
      });
      setHandoverFormsModalOpen(true);
      setHandoverEditorOpen(false);
    } catch (error: any) {
      message.error(error?.message || 'خطا در بارگذاری فرم تحویل');
    } finally {
      setHandoverLoading(false);
    }
  }, [
    supportsHandover,
    recordId,
    isBom,
    productionShelfOptions.length,
    fetchProductionShelves,
    assignees.roles.length,
    assignees.users.length,
    getLineTaskChain,
    getHandoverFromTask,
    buildGroupsFromPreviousStage,
    buildGroupsFromOrder,
    mergeSavedGroups,
    recalcHandoverGroup,
    resolveCategoryLabel,
    assigneeLabelFromIds,
    buildHandoverFormId,
    toOrderTotals,
    toSourceTotals,
    toGroupTotals,
  ]);

  const setHandoverGroupCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const addHandoverDeliveryRow = useCallback((groupIndex: number) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      deliveryRows.push(normalizeHandoverDeliveryRow(group));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const deleteHandoverDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const keySet = new Set(rowKeys.map((key) => String(key)));
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = (group.deliveryRows || []).filter((row) => !keySet.has(String(row.key)));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [recalcHandoverGroup]);

  const transferHandoverDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setHandoverGroups((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const keySet = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const selectedRows = sourceRows.filter((row) => keySet.has(String(row.key)));
      if (!selectedRows.length) return prev;

      const copiedRows = selectedRows.map((row) =>
        normalizeHandoverDeliveryRow(targetGroup, {
          ...row,
          key: buildHandoverRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copiedRows];
      next[targetGroupIndex] = recalcHandoverGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !keySet.has(String(row.key)));
        next[sourceGroupIndex] = recalcHandoverGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, [buildHandoverRowKey, normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const updateHandoverDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StageHandoverDeliveryRow, 'key'>,
    value: any
  ) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = [...(group.deliveryRows || [])];
      const rowIndex = deliveryRows.findIndex((row) => String(row.key) === String(rowKey));
      if (rowIndex < 0) return prev;
      const currentRow = deliveryRows[rowIndex];
      const numericFields: Array<keyof Omit<StageHandoverDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field)
        ? Math.max(0, toNumber(value))
        : (value == null ? '' : String(value));
      const updatedRow = { ...currentRow, [field]: nextValue };
      deliveryRows[rowIndex] = {
        ...updatedRow,
        deliveredQty: Math.max(0, toNumber(updatedRow.length)) * Math.max(0, toNumber(updatedRow.width)) * Math.max(0, toNumber(updatedRow.quantity)),
      };
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [recalcHandoverGroup, toNumber]);

  const confirmHandoverGroup = useCallback((groupIndex: number) => {
    const group = handoverGroups[groupIndex];
    if (!group) return;
    if (!handoverContext?.targetShelfId) {
      message.error('قفسه مرحله انتخاب نشده است.');
      return;
    }
    if (!group.totalHandoverQty || group.totalHandoverQty <= 0) {
      message.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setHandoverGroups((prev) => {
      const next = [...prev];
      const current = next[groupIndex];
      if (!current) return prev;
      next[groupIndex] = { ...current, isConfirmed: true, collapsed: true };
      return next;
    });
    message.success('این محصول ثبت شد.');
  }, [handoverContext?.targetShelfId, handoverGroups]);

  const setHandoverTargetShelf = useCallback((shelfId: string | null) => {
    setHandoverContext((prev) => (prev ? { ...prev, targetShelfId: shelfId } : prev));
    setHandoverGroups((prev) =>
      prev.map((group) => ({
        ...group,
        targetShelfId: shelfId,
        isConfirmed: false,
      }))
    );
  }, []);

  const handleHandoverShelfScan = useCallback((shelfId: string) => {
    const allowed = productionShelfOptions.some((option) => String(option.value) === String(shelfId));
    if (!allowed) {
      message.error('قفسه اسکن‌شده در لیست قفسه‌های تولید نیست.');
      return;
    }
    setHandoverTargetShelf(shelfId);
  }, [productionShelfOptions, setHandoverTargetShelf]);

  const saveHandover = useCallback(async (confirmSide?: StageHandoverSide) => {
    if (!handoverContext || !handoverTask) return false;
    if (!handoverContext.targetShelfId) {
      message.error('قفسه این مرحله انتخاب نشده است.');
      return false;
    }
    if (!handoverContext.sourceShelfId) {
      message.error('قفسه مرحله قبلی/منبع مشخص نشده است.');
      return false;
    }

    setHandoverLoading(true);
    try {
      const { data: freshTask, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', handoverContext.taskId)
        .maybeSingle();
      if (taskError) throw taskError;

      const recurrence = parseRecurrenceInfo(freshTask?.recurrence_info);
      const existing = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
        ? recurrence.production_handover
        : {};

      const existingFormsRaw = Array.isArray(existing?.forms) ? existing.forms : [];
      const fallbackLegacyForm = Array.isArray(existing?.groups)
        ? [{
            id: existing?.activeFormId || activeHandoverFormId || buildHandoverFormId(),
            groups: existing.groups,
            wasteByProduct: existing?.wasteByProduct || {},
            giverConfirmation: existing?.giverConfirmation || { confirmed: false },
            receiverConfirmation: existing?.receiverConfirmation || { confirmed: false },
            sourceTaskId: existing?.sourceTaskId || handoverContext.sourceTaskId,
            sourceStageName: existing?.sourceStageName || handoverContext.sourceStageName,
            sourceShelfId: existing?.sourceShelfId || handoverContext.sourceShelfId,
            targetShelfId: existing?.targetShelfId || handoverContext.targetShelfId,
            createdAt: existing?.createdAt || existing?.updatedAt || new Date().toISOString(),
            updatedAt: existing?.updatedAt || existing?.createdAt || new Date().toISOString(),
          }]
        : [];
      const existingForms = existingFormsRaw.length > 0 ? existingFormsRaw : fallbackLegacyForm;

      const formId = String(activeHandoverFormId || existing?.activeFormId || existingForms[0]?.id || buildHandoverFormId());
      const existingForm = existingForms.find((item: any) => String(item?.id || '') === formId) || null;

      const previousGroups = Array.isArray(existingForm?.groups) ? existingForm.groups : [];
      const previousWasteByProduct = existingForm?.wasteByProduct && typeof existingForm.wasteByProduct === 'object'
        ? existingForm.wasteByProduct
        : {};
      const hasImmutableConfirmation = Boolean(
        existingForm?.giverConfirmation?.confirmed || existingForm?.receiverConfirmation?.confirmed
      );
      const effectiveGroups = (hasImmutableConfirmation ? previousGroups : handoverGroups) as any[];
      const effectiveTargetShelfId = hasImmutableConfirmation
        ? (existingForm?.targetShelfId ? String(existingForm.targetShelfId) : handoverContext.targetShelfId)
        : handoverContext.targetShelfId;
      const previousTotalsByProduct = toGroupTotals(previousGroups as any);
      const nextTotalsByProduct = toGroupTotals(effectiveGroups as any);

      const nextWasteByProduct: Record<string, number> = {};
      effectiveGroups.forEach((group: any) => {
        const productId = (
          group.selectedProductId
          || (group as any)?.selected_product_id
          || (Array.isArray((group as any)?.pieces)
            ? ((group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selectedProductId
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selected_product_id
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.product_id)
            : null)
        );
        const normalizedProductId = productId ? String(productId) : '';
        if (!normalizedProductId) return;
        const sourceQty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
          (sum: number, piece: any) => sum + toNumber(piece?.sourceQty),
          0
        );
        const deliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        const handoverQty = deliveryRows.length > 0
          ? deliveryRows.reduce(
              (sum: number, row: any) =>
                sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
              0
            )
          : (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
              (sum: number, piece: any) => sum + toNumber(piece?.handoverQty),
              0
            );
        const waste = Math.max(0, sourceQty - handoverQty);
        if (waste > 0) nextWasteByProduct[normalizedProductId] = (nextWasteByProduct[normalizedProductId] || 0) + waste;
      });

      const shortageTotal = Object.values(nextWasteByProduct).reduce((sum, value) => sum + toNumber(value), 0);
      let registerWaste = false;
      if (shortageTotal > 0) {
        registerWaste = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: 'ثبت ضایعات',
            content: 'مقدار تحویل شده از مقداری که تحویل گرفته بودید کمتر است، بعنوان ضایعات ثبت شود؟',
            okText: 'بله',
            cancelText: 'خیر',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
      }

      const finalWasteByProduct = registerWaste ? nextWasteByProduct : {};
      const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
      const transferLogs: any[] = [];
      const userId = currentUser.id;

      const productIds = new Set<string>([
        ...Object.keys(previousTotalsByProduct),
        ...Object.keys(nextTotalsByProduct),
      ]);
      productIds.forEach((productId) => {
        const prevQty = toNumber(previousTotalsByProduct[productId]);
        const nextQty = toNumber(nextTotalsByProduct[productId]);
        const delta = nextQty - prevQty;
        if (!delta) return;
        const sourceShelfId = String(handoverContext.sourceShelfId);
        const targetShelfId = String(effectiveTargetShelfId);
        if (!sourceShelfId || !targetShelfId || sourceShelfId === targetShelfId) return;
        if (delta > 0) {
          deltas.push({ productId, shelfId: sourceShelfId, delta: -delta });
          deltas.push({ productId, shelfId: targetShelfId, delta });
          transferLogs.push({
            transfer_type: 'production_stage',
            product_id: productId,
            required_qty: delta,
            delivered_qty: delta,
            production_order_id: handoverContext.orderId,
            from_shelf_id: sourceShelfId,
            to_shelf_id: targetShelfId,
            sender_id: userId,
            receiver_id: userId,
          });
        } else {
          const rollbackQty = Math.abs(delta);
          deltas.push({ productId, shelfId: sourceShelfId, delta: rollbackQty });
          deltas.push({ productId, shelfId: targetShelfId, delta: -rollbackQty });
          transferLogs.push({
            transfer_type: 'production_stage',
            product_id: productId,
            required_qty: rollbackQty,
            delivered_qty: rollbackQty,
            production_order_id: handoverContext.orderId,
            from_shelf_id: targetShelfId,
            to_shelf_id: sourceShelfId,
            sender_id: userId,
            receiver_id: userId,
          });
        }
      });

      const wasteProductIds = new Set<string>([
        ...Object.keys(previousWasteByProduct),
        ...Object.keys(finalWasteByProduct),
      ]);
      wasteProductIds.forEach((productId) => {
        const prevWaste = toNumber(previousWasteByProduct[productId]);
        const nextWaste = toNumber(finalWasteByProduct[productId]);
        const wasteDelta = nextWaste - prevWaste;
        if (!wasteDelta || !handoverContext.sourceShelfId) return;
        if (wasteDelta > 0) {
          deltas.push({ productId, shelfId: String(handoverContext.sourceShelfId), delta: -wasteDelta });
          transferLogs.push({
            transfer_type: 'waste',
            product_id: productId,
            required_qty: wasteDelta,
            delivered_qty: wasteDelta,
            production_order_id: handoverContext.orderId,
            from_shelf_id: String(handoverContext.sourceShelfId),
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          });
        } else {
          deltas.push({ productId, shelfId: String(handoverContext.sourceShelfId), delta: Math.abs(wasteDelta) });
        }
      });

      if (deltas.length > 0) {
        await applyInventoryDeltas(supabase as any, deltas);
        await syncMultipleProductsStock(
          supabase as any,
          Array.from(new Set(deltas.map((item) => item.productId).filter(Boolean)))
        );
      }

      if (transferLogs.length > 0) {
        const { error: transferError } = await supabase.from('stock_transfers').insert(transferLogs);
        if (transferError) throw transferError;
      }

      const nowIso = new Date().toISOString();
      const nextGiverConfirmation: StageHandoverConfirm = existingForm?.giverConfirmation?.confirmed
        ? existingForm.giverConfirmation
        : { confirmed: false };
      const nextReceiverConfirmation: StageHandoverConfirm = existingForm?.receiverConfirmation?.confirmed
        ? existingForm.receiverConfirmation
        : { confirmed: false };
      if (confirmSide === 'giver') {
        nextGiverConfirmation.confirmed = true;
        nextGiverConfirmation.userId = currentUser.id;
        nextGiverConfirmation.userName = currentUser.fullName;
        nextGiverConfirmation.at = nowIso;
      }
      if (confirmSide === 'receiver') {
        nextReceiverConfirmation.confirmed = true;
        nextReceiverConfirmation.userId = currentUser.id;
        nextReceiverConfirmation.userName = currentUser.fullName;
        nextReceiverConfirmation.at = nowIso;
      }

      const nextForm: StageHandoverForm = {
        id: formId,
        sourceTaskId: handoverContext.sourceTaskId,
        sourceStageName: handoverContext.sourceStageName,
        sourceShelfId: handoverContext.sourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: effectiveGroups as any,
        wasteByProduct: finalWasteByProduct,
        giverConfirmation: nextGiverConfirmation,
        receiverConfirmation: nextReceiverConfirmation,
        createdAt: existingForm?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const nextForms = (() => {
        let replaced = false;
        const mapped = existingForms.map((form: any) => {
          if (String(form?.id || '') !== formId) return form;
          replaced = true;
          return nextForm;
        });
        if (!replaced) mapped.push(nextForm);
        return mapped;
      })();

      const nextHandover = {
        sourceTaskId: handoverContext.sourceTaskId,
        sourceStageName: handoverContext.sourceStageName,
        sourceShelfId: handoverContext.sourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: nextForm.groups,
        wasteByProduct: nextForm.wasteByProduct,
        giverConfirmation: nextForm.giverConfirmation,
        receiverConfirmation: nextForm.receiverConfirmation,
        forms: nextForms,
        activeFormId: formId,
        updatedAt: nowIso,
      };

      const nextRecurrence = {
        ...recurrence,
        production_handover: nextHandover,
      };

      const updatePayload: any = {
        recurrence_info: nextRecurrence,
        production_shelf_id: effectiveTargetShelfId,
      };
      const { error: updateError } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', handoverContext.taskId);
      if (updateError) throw updateError;

      const updatedTask = {
        ...freshTask,
        ...updatePayload,
        recurrence_info: nextRecurrence,
      };
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(handoverContext.taskId)
          ? {
              ...item,
              recurrence_info: nextRecurrence,
              production_shelf_id: effectiveTargetShelfId,
            }
          : item
      )));
      setHandoverTask(updatedTask);
      setHandoverForms(nextForms as StageHandoverForm[]);
      setActiveHandoverFormId(formId);
      setHandoverContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          targetShelfId: effectiveTargetShelfId,
          groups: prev.groups,
          previousTotalsByProduct: nextTotalsByProduct,
          previousWasteByProduct: finalWasteByProduct,
          giverConfirmation: nextGiverConfirmation,
          receiverConfirmation: nextReceiverConfirmation,
        };
      });
      message.success(confirmSide ? 'تایید ثبت شد' : 'فرم تحویل ذخیره شد');
      return true;
    } catch (error: any) {
      message.error(error?.message || 'خطا در ثبت فرم تحویل');
      return false;
    } finally {
      setHandoverLoading(false);
    }
  }, [
    activeHandoverFormId,
    buildHandoverFormId,
    currentUser.fullName,
    currentUser.id,
    handoverContext,
    handoverGroups,
    handoverTask,
    parseRecurrenceInfo,
    toGroupTotals,
    toNumber,
  ]);

  const maybeOpenHandoverByStatus = useCallback(async (taskId: string, newStatus: string, providedTasks?: any[]) => {
    if (!supportsHandover || !taskId || !recordId || isBom) return;
    const normalized = String(newStatus || '').toLowerCase();
    if (normalized !== 'in_progress' && normalized !== 'done' && normalized !== 'completed') return;
    const allTasks = (providedTasks && providedTasks.length > 0) ? providedTasks : tasks;
    const currentTask = allTasks.find((item: any) => String(item?.id) === String(taskId));
    if (!currentTask || !currentTask?.production_line_id) return;
    const chain = getLineTaskChain(String(currentTask.production_line_id), allTasks);
    const currentIndex = chain.findIndex((item: any) => String(item?.id) === String(taskId));
    const isFirstStage = currentIndex === 0;
    if (normalized === 'in_progress' && !isFirstStage) return;

    const handover = getHandoverFromTask(currentTask);
    const forms = Array.isArray(handover?.forms) ? handover.forms : [];
    const isComplete = forms.length > 0
      ? forms.every((form: any) => form?.giverConfirmation?.confirmed && form?.receiverConfirmation?.confirmed)
      : (handover?.giverConfirmation?.confirmed && handover?.receiverConfirmation?.confirmed);
    if (isComplete) return;

    await openTaskHandoverModal(currentTask, allTasks);
  }, [supportsHandover, recordId, isBom, tasks, getLineTaskChain, getHandoverFromTask, openTaskHandoverModal]);

  const openHandoverEditorForForm = useCallback((formId: string | null) => {
    if (!formId) return;
    const form = handoverForms.find((item) => String(item.id) === String(formId));
    if (!form) return;
    setActiveHandoverFormId(String(form.id));
    setHandoverGroups(Array.isArray(form.groups) ? form.groups : []);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        targetShelfId: form.targetShelfId || prev.targetShelfId,
        giverConfirmation: form.giverConfirmation || { confirmed: false },
        receiverConfirmation: form.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((form.groups || []) as any),
        previousWasteByProduct: form.wasteByProduct || {},
      };
    });
    setHandoverEditorOpen(true);
  }, [handoverForms, toGroupTotals]);

  const handleCreateHandoverForm = useCallback(() => {
    if (!handoverContext) return;
    const emptyGroups = (handoverContext.groups || []).map((group) =>
      recalcHandoverGroup({
        ...group,
        deliveryRows: [],
        totalHandoverQty: 0,
        isConfirmed: false,
        collapsed: true,
      })
    );
    const nowIso = new Date().toISOString();
    const newForm: StageHandoverForm = {
      id: buildHandoverFormId(),
      sourceTaskId: handoverContext.sourceTaskId,
      sourceStageName: handoverContext.sourceStageName,
      sourceShelfId: handoverContext.sourceShelfId,
      targetShelfId: handoverContext.targetShelfId,
      giver: handoverContext.giver,
      receiver: handoverContext.receiver,
      groups: emptyGroups,
      wasteByProduct: {},
      giverConfirmation: { confirmed: false },
      receiverConfirmation: { confirmed: false },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setHandoverForms((prev) => [...prev, newForm]);
    setActiveHandoverFormId(newForm.id);
    setHandoverGroups(newForm.groups);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        targetShelfId: newForm.targetShelfId,
        giverConfirmation: newForm.giverConfirmation,
        receiverConfirmation: newForm.receiverConfirmation,
        previousTotalsByProduct: {},
        previousWasteByProduct: {},
      };
    });
    setHandoverEditorOpen(true);
  }, [buildHandoverFormId, handoverContext, recalcHandoverGroup]);

  const closeHandoverEditor = useCallback(() => {
    setHandoverEditorOpen(false);
  }, []);

  const closeHandoverModal = useCallback(() => {
    setHandoverFormsModalOpen(false);
    setHandoverEditorOpen(false);
    setHandoverTask(null);
    setHandoverContext(null);
    setHandoverGroups([]);
    setHandoverForms([]);
    setActiveHandoverFormId(null);
  }, []);

  const handleConfirmGiver = useCallback(async () => {
    const ok = await saveHandover('giver');
    if (!ok) return;
  }, [saveHandover]);

  const handleConfirmReceiver = useCallback(async () => {
    const ok = await saveHandover('receiver');
    if (!ok) return;
  }, [saveHandover]);

  const handleAddLine = async (values: any) => {
    if (!recordId || !isProductionOrder) return;
    try {
      let nextNo = values.line_no;
      if (!nextNo) {
        const { data: maxRow, error: maxError } = await supabase
          .from('production_lines')
          .select('line_no')
          .eq('production_order_id', recordId)
          .order('line_no', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxError) throw maxError;
        nextNo = (Number(maxRow?.line_no) || 0) + 1;
      }
      const payload = {
        production_order_id: recordId,
        line_no: nextNo,
        quantity: values.quantity || 0,
      };
      const { error } = await supabase.from('production_lines').insert(payload);
      if (error) throw error;
      message.success('خط تولید جدید اضافه شد');
      setIsLineModalOpen(false);
      lineForm.resetFields();
      fetchLines();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const handleLineQuantityChange = async (lineId: string, quantity: number) => {
    if (!isProductionOrder) return;
    try {
      const { error } = await supabase.from('production_lines').update({ quantity }).eq('id', lineId);
      if (error) throw error;
      setLines(prev => prev.map(line => (line.id === lineId ? { ...line, quantity } : line)));
    } catch (err: any) {
      message.error(`خطا: ${err.message}`);
    }
  };

  const openTaskModal = (lineId: string, draftStage?: any) => {
    setActiveLineId(lineId);
    setDraftToCreate(draftStage || null);
    const defaultRoleId = draftStage?.default_assignee_role_id ? String(draftStage.default_assignee_role_id) : null;
    const defaultUserId = draftStage?.default_assignee_id ? String(draftStage.default_assignee_id) : null;
    const assigneeCombo = defaultRoleId
      ? `role:${defaultRoleId}`
      : (defaultUserId ? `user:${defaultUserId}` : undefined);
    const initial = {
      name: draftStage?.name || '',
      sort_order: draftStage?.sort_order || ((tasks.length + 1) * 10),
      wage: draftStage?.wage || 0,
      production_shelf_id: null,
      assignee_combo: assigneeCombo,
    };
    taskForm.setFieldsValue(initial);
    setIsTaskModalOpen(true);
  };

  const handleAddTask = async (values: any) => {
    if (!recordId || !activeLineId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let assigneeId = null;
      let assigneeType = null;

      if (values.assignee_combo) {
        if (values.assignee_combo.includes(':')) {
          const [type, id] = values.assignee_combo.split(':');
          assigneeType = type;
          assigneeId = id;
        } else {
          assigneeType = 'user';
          assigneeId = values.assignee_combo;
        }
      }

      const payload: any = {
        name: values.name,
        status: 'todo',
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        due_date: values.due_date || null,
        wage: values.wage || null,
        sort_order: values.sort_order || ((tasks.length + 1) * 10),
        created_by: user?.id,
      };

      if (isProductionOrder) {
        payload.produced_qty = 0;
        payload.related_production_order = recordId;
        payload.related_to_module = 'production_orders';
        payload.production_line_id = activeLineId;
        payload.production_shelf_id = values.production_shelf_id || null;
      } else if (isProcessRecordModule) {
        payload.produced_qty = 0;
        payload.related_to_module = moduleId;
        payload.production_line_id = null;
        payload.production_shelf_id = null;
        if (moduleId === 'projects') payload.project_id = recordId;
        if (moduleId === 'marketing_leads') payload.marketing_lead_id = recordId;
      }

      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;

      message.success('مرحله جدید اضافه شد');
      if (draftToCreate?.id && isProcessRecordModule) {
        const nextDrafts = (Array.isArray(draftLocal) ? draftLocal : []).filter(
          (stage: any) => String(stage?.id || '') !== String(draftToCreate.id)
        );
        await saveDraftStages(nextDrafts);
      }
      setIsTaskModalOpen(false);
      taskForm.resetFields();
      setActiveLineId(null);
      setDraftToCreate(null);
      await fetchTasks();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      if (error) throw error;
      message.success('وضعیت بروزرسانی شد');
      const nextTasks = await fetchTasks();
      await maybeOpenHandoverByStatus(taskId, newStatus, nextTasks);
    } catch (err: any) {
      message.error('خطا');
    }
  };

  const handleProducedQtyChange = async (taskId: string, value: number | null) => {
    try {
      const nextProducedQty = Math.max(0, toNumber(value));
      const { error } = await supabase
        .from('tasks')
        .update({ produced_qty: nextProducedQty })
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? { ...item, produced_qty: nextProducedQty }
          : item
      )));
    } catch (err: any) {
      message.error(err?.message || 'خطا در ثبت مقدار تولید شده');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return '#10b981';
      case 'review':
        return '#f97316';
      case 'in_progress':
        return '#3b82f6';
      case 'todo':
      case 'pending':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  const getAssigneeLabel = (task: any) => {
    if (task.assignee_role_id && task.assigned_role) {
      return `تیم ${task.assigned_role.title}`;
    }
    if (task.assignee_id && task.assignee) {
      return task.assignee.full_name;
    }
    return 'تعیین نشده';
  };

  const isTaskAssignedToCurrentUser = useCallback((task: any) => {
    if (!task || !currentUser.id) return false;
    const assigneeType = String(task?.assignee_type || '');
    const assigneeUserId = task?.assignee_id ? String(task.assignee_id) : null;
    const assigneeRoleId = task?.assignee_role_id ? String(task.assignee_role_id) : (assigneeType === 'role' && assigneeUserId ? assigneeUserId : null);
    if ((assigneeType === 'role' || task?.assignee_role_id) && currentUser.roleId) {
      return Boolean(assigneeRoleId && String(assigneeRoleId) === String(currentUser.roleId));
    }
    return Boolean(assigneeUserId && String(assigneeUserId) === String(currentUser.id));
  }, [currentUser.id, currentUser.roleId]);

  const getShelfLabel = useCallback((shelfId: string | null | undefined) => {
    if (!shelfId) return 'تعیین نشده';
    const option = productionShelfOptions.find((item) => String(item.value) === String(shelfId));
    return option?.label || String(shelfId);
  }, [productionShelfOptions]);

  const renderDate = (dateVal: any) => {
    if (!dateVal) return null;
    try {
      const jsDate = new Date(dateVal);
      if (Number.isNaN(jsDate.getTime())) return null;
      const formatted = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      })
        .convert(persian, persian_fa)
        .format('YYYY/MM/DD HH:mm');
      return formatted ? toPersianNumber(formatted) : null;
    } catch {
      return null;
    }
  };

  const handoverSummaryRows = useMemo<StageHandoverSummaryRow[]>(() => {
    if (!handoverContext) return [];
    const productMeta = new Map<string, { name: string; code: string; unit: string }>();
    (handoverContext.groups || []).forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
      if (!productMeta.has(productId)) {
        productMeta.set(productId, {
          name: String(group?.selectedProductName || '-'),
          code: String(group?.selectedProductCode || ''),
          unit: String(firstPiece?.mainUnit || ''),
        });
      }
    });

    const deliveredTotals: Record<string, number> = {};
    handoverForms.forEach((form) => {
      const totals = toGroupTotals((form?.groups || []) as any);
      Object.entries(totals).forEach(([productId, qty]) => {
        deliveredTotals[productId] = (deliveredTotals[productId] || 0) + toNumber(qty);
      });
    });

    const allProductIds = new Set<string>([
      ...Object.keys(handoverContext.sourceTotalsByProduct || {}),
      ...Object.keys(handoverContext.orderTotalsByProduct || {}),
      ...Object.keys(deliveredTotals || {}),
    ]);

    return Array.from(allProductIds).map((productId) => {
      const meta = productMeta.get(productId) || { name: '-', code: '', unit: '' };
      return {
        productId,
        productName: meta.name,
        productCode: meta.code,
        unit: meta.unit,
        sourceQty: toNumber(handoverContext.sourceTotalsByProduct?.[productId]),
        orderQty: toNumber(handoverContext.orderTotalsByProduct?.[productId]),
        deliveredQty: toNumber(deliveredTotals?.[productId]),
      };
    });
  }, [handoverContext, handoverForms, toGroupTotals, toNumber]);

  const handoverFormRows = useMemo<StageHandoverFormListRow[]>(() => {
    return handoverForms.map((form, index) => ({
      id: String(form.id),
      title: `فرم ${toPersianNumber(index + 1)}`,
      createdAt: form.createdAt || null,
      updatedAt: form.updatedAt || null,
      giverConfirmed: !!form.giverConfirmation?.confirmed,
      receiverConfirmed: !!form.receiverConfirmation?.confirmed,
    }));
  }, [handoverForms]);

  const renderPopupContent = (task: any) => (
    <div className="w-72 p-1 font-['Vazirmatn']">
      <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
        <h4 className="font-bold text-gray-800 m-0 text-sm line-clamp-2">{task.title || task.name}</h4>
      </div>

      <div className="space-y-3 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">وضعیت:</span>
          <Select
            size="small"
            value={task.status}
            onChange={(val) => handleStatusChange(task.id, val)}
            className="w-36"
            disabled={readOnly}
            getPopupContainer={() => document.body}
            dropdownStyle={{ zIndex: 10050 }}
            options={[
              { value: 'todo', label: 'انجام نشده' },
              { value: 'in_progress', label: 'در حال انجام' },
              { value: 'review', label: 'بازبینی' },
              { value: 'done', label: 'تکمیل شده' },
            ]}
          />
        </div>
        {isProductionOrder && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">مقدار تولید شده:</span>
            <InputNumber
              size="small"
              min={0}
              className="w-36 persian-number"
              value={toNumber(task?.produced_qty)}
              disabled={readOnly || String(task?.status || '').toLowerCase() === 'todo' || String(task?.status || '').toLowerCase() === 'pending'}
              onChange={(val) => {
                void handleProducedQtyChange(String(task.id), val);
              }}
            />
          </div>
        )}

        <div className="bg-gray-50 dark:bg-[#111827] p-2 rounded-lg border border-gray-100 dark:border-gray-700 space-y-2 text-xs text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <OrderedListOutlined className="text-amber-700" />
            <span>ترتیب: {toPersianNumber(task.sort_order || '-')}</span>
          </div>
          <div className="flex items-center gap-2">
            {task.assignee_type === 'role' ? <TeamOutlined className="text-amber-700" /> : <UserOutlined className="text-amber-700" />}
            <span>مسئول: {getAssigneeLabel(task)}</span>
          </div>
          {isProductionOrder && task.production_shelf_id && (
            <div className="flex items-center gap-2">
              <span className="text-amber-700">قفسه:</span>
              <span>{getShelfLabel(task.production_shelf_id)}</span>
            </div>
          )}
          {task.wage !== undefined && task.wage !== null && (
            <div className="flex items-center gap-2">
              <span className="text-amber-700">💰</span>
              <span>دستمزد: {toPersianNumber(Number(task.wage || 0).toLocaleString('en-US'))} تومان</span>
            </div>
          )}
          {task.due_date && (
            <div className="flex items-center gap-2">
              <ClockCircleOutlined className="text-amber-700" />
              <span>موعد: {renderDate(task.due_date)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-2 border-t border-gray-100">
        {supportsHandover ? (
          <Button
            size="small"
            type="link"
            className="text-xs text-leather-700 hover:text-leather-600 px-0"
            onClick={() => {
              setOpenTaskPopoverId(null);
              void openTaskHandoverModal(task);
            }}
          >
            فرم‌های تحویل کالا
          </Button>
        ) : (
          <span />
        )}
        <Link to={`/tasks/${task.id}`} target="_blank">
          <Button size="small" type="link" icon={<ArrowRightOutlined />} className="text-xs text-amber-700 hover:text-amber-600">
            جزئیات کامل
          </Button>
        </Link>
      </div>
    </div>
  );

  const draftList = Array.isArray(draftLocal) ? draftLocal : [];
  const totalWage = lines.reduce((sum, line) => {
    const lineTasks = tasksByLine.get(String(line.id)) || [];
    const lineWage = lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0);
    const qty = parseFloat(line.quantity) || 0;
    return sum + (lineWage * qty);
  }, 0);
  const visibleLines = useMemo(() => {
    if (!onlyLineId) return lines;
    return lines.filter((line: any) => String(line?.id || '') === String(onlyLineId));
  }, [lines, onlyLineId]);

  const saveDraftStages = async (nextStages: any[]) => {
    setDraftLocal(nextStages);
    if (onDraftStagesChange) onDraftStagesChange(nextStages);
    if (moduleId === 'production_boms' && recordId) {
      await supabase.from('production_boms').update({ production_stages_draft: nextStages }).eq('id', recordId);
    }
  };

  const handleAddDraftStage = async (values: any) => {
    let next = [...draftLocal];
    if (editingDraft?.id) {
      next = next.map((stage: any) =>
        stage.id === editingDraft.id
          ? { ...stage, name: values.name, sort_order: values.sort_order || stage.sort_order }
          : stage
      );
    } else {
      next.push({
        id: Date.now(),
        name: values.name,
        sort_order: values.sort_order || ((draftLocal.length + 1) * 10),
      });
    }
    await saveDraftStages(next);
    setIsDraftModalOpen(false);
    setEditingDraft(null);
    draftForm.resetFields();
  };

  const handleRemoveDraftStage = async (id: any) => {
    Modal.confirm({
      title: 'حذف مرحله پیش‌نویس',
      content: 'آیا از حذف این مرحله پیش‌نویس مطمئن هستید؟',
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        const next = draftLocal.filter((s: any) => s.id !== id);
        await saveDraftStages(next);
      },
    });
  };

  useEffect(() => {
    if (!isDraftModalOpen) return;
    if (editingDraft) {
      draftForm.setFieldsValue({
        name: editingDraft.name,
        sort_order: editingDraft.sort_order,
      });
    } else {
      draftForm.resetFields();
    }
  }, [isDraftModalOpen, editingDraft, draftForm]);

  const normalizeStageName = (val: any) => String(val || '').trim().toLowerCase();
  const draftSegments = draftList.map((stage: any) => ({
    ...stage,
    type: 'draft',
    label: stage.name || stage.title || 'مرحله',
  }));

  const getLineSegments = (lineTasks: any[]) => {
    const normalizedTasks = (lineTasks || []).map((task: any) => ({
      ...task,
      type: 'task',
      _normalizedName: normalizeStageName(task.name || task.title),
    }));

    const lineDrafts = draftSegments.filter((draft: any) => {
      const normalizedDraft = normalizeStageName(draft.label);
      const matched = normalizedTasks.some((t: any) => t._normalizedName && t._normalizedName === normalizedDraft);
      return !matched;
    });

    const merged = [...normalizedTasks, ...lineDrafts].sort((a: any, b: any) => {
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      return aOrder - bOrder;
    });

    return merged;
  };

  const handleCopyLine = async (line: any) => {
    if (!recordId || !line?.id || !isProductionOrder) return;
    try {
      setLoading(true);
      const { data: maxRow, error: maxError } = await supabase
        .from('production_lines')
        .select('line_no')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxError) throw maxError;
      const nextLineNo = (Number(maxRow?.line_no) || 0) + 1;

      const { data: newLine, error: lineError } = await supabase
        .from('production_lines')
        .insert({
          production_order_id: recordId,
          line_no: nextLineNo,
          quantity: line.quantity || 0,
        })
        .select('id')
        .single();
      if (lineError) throw lineError;

      const sourceTasks = tasksByLine.get(String(line.id)) || [];
      if (newLine?.id && sourceTasks.length > 0) {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        const payload = sourceTasks.map((task: any) => ({
          name: task.name || task.title,
          status: 'todo',
          produced_qty: toNumber(task?.produced_qty),
          related_production_order: recordId,
          related_to_module: 'production_orders',
          production_line_id: newLine.id,
          assignee_id: task.assignee_id ?? null,
          assignee_role_id: task.assignee_role_id ?? null,
          assignee_type: task.assignee_type ?? null,
          due_date: task.due_date ?? null,
          wage: task.wage ?? null,
          sort_order: task.sort_order ?? null,
          created_by: userId,
        }));
        const { error: taskError } = await supabase.from('tasks').insert(payload);
        if (taskError) throw taskError;
      }

      message.success('خط تولید کپی شد');
      fetchLines();
      fetchTasks();
    } catch (error: any) {
      message.error(`خطا در کپی خط: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isReadyToLoad && readOnly && compact && !isBom) {
    return (
      <div ref={containerRef} className="w-full select-none" dir="rtl">
        <div className="w-full h-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 text-[10px]">
          ...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 select-none" dir="rtl">
      {isDraftOnlyModule && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isProcessTemplateModule ? 'مراحل پیش‌نویس فرآیند' : 'مراحل پیش‌نویس (BOM)'}
          </div>
          <div className={`flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 ${compact ? 'h-5' : 'h-9'}`}>
            {draftSegments.length > 0 ? (
              draftSegments.map((stage: any, index: number) => (
                <Popover
                  key={stage.id || index}
                  content={
                    <div className="space-y-2 text-xs">
                      <div className="font-bold text-gray-700">{stage.label}</div>
                      <div>ترتیب: {toPersianNumber(stage.sort_order || '-')}</div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button size="small" onClick={() => { setEditingDraft(stage); setIsDraftModalOpen(true); }}>ویرایش</Button>
                          <Button size="small" danger onClick={() => handleRemoveDraftStage(stage.id)}>حذف</Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger="click"
                  overlayStyle={{ zIndex: 10000 }}
                >
                  <div
                    className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''}`}
                    style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                  >
                    <span className={`text-gray-600 font-medium truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                      {stage.label}
                    </span>
                  </div>
                </Popover>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-full">
                {compact ? <span className="opacity-50">-</span> : 'بدون مرحله پیش‌نویس'}
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="flex justify-start">
              <Tooltip title="افزودن مرحله پیش‌نویس">
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  size={compact ? 'small' : 'middle'}
                  onClick={() => { setEditingDraft(null); setIsDraftModalOpen(true); }}
                  className="border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
                >
                  افزودن مرحله
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      {!isDraftOnlyModule && visibleLines.map((line) => {
        const lineTasks = tasksByLine.get(String(line.id)) || [];
        const canEditQuantity = isProductionOrder && !readOnly && (!orderStatus || orderStatus === 'pending');
        const showInlineQty = isProductionOrder && (!compact || canEditQuantity);
        const lineSegments = getLineSegments(lineTasks);
        return (
          <div key={line.id} className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="font-bold">
                  {isProcessModule
                    ? processTitle
                    : `خط ${toPersianNumber(line.line_no)}${compact ? `: ${toPersianNumber(line.quantity || 0)} عدد` : ''}`}
                </span>
                {showInlineQty && (
                  <div className="flex items-center gap-2">
                    <span>تعداد تولید:</span>
                    <InputNumber
                      min={0}
                      className="w-24"
                      value={line.quantity}
                      onChange={(val) => handleLineQuantityChange(line.id, Number(val) || 0)}
                      disabled={!canEditQuantity}
                    />
                  </div>
                )}
                {!readOnly && isProductionOrder && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyLine(line)}
                    className="text-amber-700 hover:!text-amber-600"
                  >
                    کپی خط
                  </Button>
                )}
              </div>

            <div className="w-full flex items-center gap-2">
              {!readOnly && !!recordId && (
                <Tooltip title="افزودن مرحله جدید">
                  <Button
                    type="dashed"
                    shape="circle"
                    icon={<PlusOutlined />}
                    size={compact ? 'small' : 'middle'}
                    onClick={() => {
                      openTaskModal(line.id);
                    }}
                    className="flex-shrink-0 border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
                  />
                </Tooltip>
              )}

              <div className={`relative flex-1 flex bg-gray-100 dark:bg-gray-800 rounded-lg overflow-visible border border-gray-200 dark:border-gray-700 ${compact ? 'h-5' : 'h-9'}`}>
                {lineSegments.map((segment: any, index: number) => (
                  segment.type === 'task' ? (
                    (() => {
                      const isAssignedToCurrent = isTaskAssignedToCurrentUser(segment);
                      const isHighlightedTask = isAssignedToCurrent;
                      const segmentColor = getStatusColor(segment.status);
                      return (
                    <Popover
                      key={segment.id}
                      content={renderPopupContent(segment)}
                      trigger={compact ? 'hover' : 'click'}
                      open={compact ? undefined : openTaskPopoverId === String(segment.id)}
                      onOpenChange={(open) => {
                        if (compact) return;
                        setOpenTaskPopoverId(open ? String(segment.id) : null);
                      }}
                      overlayStyle={{ zIndex: 10000 }}
                      title={null}
                    >
                      <div
                        className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === lineSegments.length - 1 ? 'rounded-l-lg' : ''} ${isHighlightedTask ? 'z-10' : ''}`}
                        style={{
                          flex: 1,
                          backgroundColor: segmentColor,
                          boxShadow: isHighlightedTask
                            ? `0 0 8px ${segmentColor}66, 0 0 16px ${segmentColor}4D, 0 0 24px ${segmentColor}33`
                            : undefined,
                        }}
                      >
                        <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                          <span className={`text-white font-medium truncate w-full text-center drop-shadow-md ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                            {segment.title || segment.name}
                          </span>
                          {!compact && segment.sort_order && (
                            <span className="text-[8px] text-white/90 absolute bottom-0.5 right-1 bg-black/10 px-1 rounded-sm">
                              {toPersianNumber(segment.sort_order)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Popover>
                      );
                    })()
                  ) : (
                    <Popover
                      key={`draft-${segment.id}-${index}`}
                      content={
                        <div className="space-y-2 text-xs">
                          <div className="font-bold text-gray-700">{segment.label}</div>
                          <div>ترتیب: {toPersianNumber(segment.sort_order || '-')}</div>
                          {!readOnly && (
                            <div className="flex items-center gap-2">
                              {recordId && (
                                <Button size="small" type="primary" onClick={() => openTaskModal(line.id, segment)}>ایجاد وظیفه</Button>
                              )}
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleRemoveDraftStage(segment.id)}
                              >
                                حذف
                              </Button>
                            </div>
                          )}
                        </div>
                      }
                      trigger={compact ? 'hover' : 'click'}
                      overlayStyle={{ zIndex: 10000 }}
                      title={null}
                    >
                      <div
                        className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-gray-200/70 dark:border-gray-700/80' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === lineSegments.length - 1 ? 'rounded-l-lg' : ''}`}
                        style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                      >
                        <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                          <span className={`text-gray-600 font-medium truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                            {segment.label}
                          </span>
                        </div>
                      </div>
                    </Popover>
                  )
                ))}
                {lineSegments.length === 0 && (
                  <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-full">
                    {compact ? <span className="opacity-50">-</span> : (isProcessModule ? 'بدون مرحله فرآیند' : 'بدون مرحله تولید')}
                  </div>
                )}
              </div>
            </div>
            {showWageSummary && (
              <div className="text-xs text-gray-500">
                دستمزد این خط: {toPersianNumber(((lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0)) * (parseFloat(line.quantity) || 0)).toLocaleString('en-US'))} تومان
              </div>
            )}
          </div>
        );
      })}

      {!isDraftOnlyModule && visibleLines.length === 0 && (
        <div className="w-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs bg-gray-50 dark:bg-gray-900 h-10 rounded border border-gray-200 dark:border-gray-700">
          {loading ? <Spin size="small" /> : (isProcessModule ? 'بدون مرحله فرآیند' : 'بدون خط تولید')}
        </div>
      )}

      {!readOnly && !isBom && isProductionOrder && (
        <div className="flex justify-start">
          <Tooltip title="افزودن خط تولید جدید">
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size={compact ? 'small' : 'middle'}
              onClick={() => setIsLineModalOpen(true)}
              className="border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
            >
              افزودن خط
            </Button>
          </Tooltip>
        </div>
      )}

      {showWageSummary && (
        <div className="text-sm font-bold text-gray-700">
          جمع دستمزد تولید: {toPersianNumber(totalWage.toLocaleString('en-US'))} تومان
        </div>
      )}

      <Modal
        title="افزودن خط تولید"
        open={isLineModalOpen && isProductionOrder}
        onCancel={() => setIsLineModalOpen(false)}
        footer={null}
        centered
        destroyOnClose
      >
        <Form form={lineForm} onFinish={handleAddLine} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Form.Item name="line_no" label="شماره خط" initialValue={(lines[lines.length - 1]?.line_no || 0) + 1}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
            <div className="col-span-6">
              <Form.Item name="quantity" label="تعداد تولید" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsLineModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none">
              ثبت خط
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-amber-800"><div className="bg-amber-50 p-1 rounded text-amber-600"><PlusOutlined /></div> {isProcessModule ? 'افزودن مرحله فرآیند' : 'افزودن مرحله تولید'}</div>}
        open={isTaskModalOpen}
        onCancel={() => setIsTaskModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={480}
        centered
        destroyOnClose
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="sort_order" label="ترتیب" initialValue={(tasks.length + 1) * 10}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>

            <div className="col-span-6">
              <Form.Item name="wage" label="دستمزد">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="assignee_combo" label="مسئول انجام">
                <Select placeholder="انتخاب کنید..." allowClear showSearch optionFilterProp="label">
                  <Select.OptGroup label="کاربران">
                    {assignees.users.map(u => (
                      <Select.Option key={`user-${u.id}`} value={`user:${u.id}`} label={u.full_name}>
                        <Space><UserOutlined /> {u.full_name}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                  <Select.OptGroup label="تیم‌ها">
                    {assignees.roles.map(r => (
                      <Select.Option key={`role-${r.id}`} value={`role:${r.id}`} label={r.title}>
                        <Space><TeamOutlined /> {r.title}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                </Select>
              </Form.Item>
            </div>

            {isProductionOrder && (
              <div className="col-span-12">
                <Form.Item name="production_shelf_id" label="قفسه مرحله">
                  <Select
                    placeholder="انتخاب قفسه از انبار تولید"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={productionShelfOptions}
                    getPopupContainer={() => document.body}
                  />
                </Form.Item>
              </div>
            )}

            <div className="col-span-12">
              <Form.Item name="due_date" label="موعد انجام">
                <PersianDatePicker
                  type="DATETIME"
                  value={taskForm.getFieldValue('due_date')}
                  onChange={(val) => taskForm.setFieldValue('due_date', val)}
                  placeholder="تاریخ و ساعت"
                  className="w-full"
                />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsTaskModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={loading} className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none shadow-md">
              ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-amber-800"><div className="bg-amber-50 p-1 rounded text-amber-600"><PlusOutlined /></div> {isProcessModule ? 'افزودن مرحله پیش‌نویس فرآیند' : 'افزودن مرحله پیش‌نویس'}</div>}
        open={isDraftModalOpen}
        onCancel={() => setIsDraftModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={420}
        centered
        destroyOnClose
      >
        <Form form={draftForm} onFinish={handleAddDraftStage} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="sort_order" label="ترتیب" initialValue={(draftLocal.length + 1) * 10}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsDraftModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none shadow-md">
              ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>

      {supportsHandover && (
        <>
          <TaskHandoverFormsModal
            open={handoverFormsModalOpen && !!handoverTask && !!handoverContext}
            loading={handoverLoading}
            taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
            sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
            summaries={handoverSummaryRows}
            forms={handoverFormRows}
            selectedFormId={activeHandoverFormId}
            onSelectForm={(formId) => setActiveHandoverFormId(formId)}
            onCreateForm={handleCreateHandoverForm}
            onOpenSelectedForm={() => openHandoverEditorForForm(activeHandoverFormId)}
            onClose={closeHandoverModal}
          />

          <TaskHandoverModal
            open={handoverEditorOpen && !!handoverTask && !!handoverContext}
            loading={handoverLoading}
            locked={!!(handoverContext?.giverConfirmation?.confirmed || handoverContext?.receiverConfirmation?.confirmed)}
            taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
            sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
            giverName={String(handoverContext?.giver?.label || 'تعیین نشده')}
            receiverName={String(handoverContext?.receiver?.label || 'تعیین نشده')}
            groups={handoverGroups}
            shelfOptions={productionShelfOptions}
            targetShelfId={handoverContext?.targetShelfId || null}
            giverConfirmation={handoverContext?.giverConfirmation || { confirmed: false }}
            receiverConfirmation={handoverContext?.receiverConfirmation || { confirmed: false }}
            onCancel={closeHandoverEditor}
            onSave={() => { void saveHandover(); }}
            onToggleGroup={setHandoverGroupCollapsed}
            onConfirmGroup={confirmHandoverGroup}
            onDeliveryRowAdd={addHandoverDeliveryRow}
            onDeliveryRowsDelete={deleteHandoverDeliveryRows}
            onDeliveryRowsTransfer={transferHandoverDeliveryRows}
            onDeliveryRowFieldChange={updateHandoverDeliveryRowField}
            onTargetShelfChange={setHandoverTargetShelf}
            onTargetShelfScan={handleHandoverShelfScan}
            onConfirmGiver={() => { void handleConfirmGiver(); }}
            onConfirmReceiver={() => { void handleConfirmReceiver(); }}
          />
        </>
      )}
    </div>
  );
};

export default ProductionStagesField;
