import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Button, Spin, Divider, Select, Space, Modal, Checkbox, App, Switch } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import SmartFieldRenderer from './SmartFieldRenderer';
import EditableTable from './EditableTable.tsx';
import GridTable from './GridTable';
import SmartTableRenderer from './SmartTableRenderer';
import SummaryCard from './SummaryCard';
import { calculateSummary } from '../utils/calculations';
import { ModuleDefinition, FieldLocation, BlockType, LogicOperator, FieldType, SummaryCalculationType } from '../types';
import { convertArea } from '../utils/unitConversions';
import { PRODUCTION_MESSAGES } from '../utils/productionMessages';
import ProductionStagesField from './ProductionStagesField';
import { applyInvoiceFinalizationInventory } from '../utils/invoiceInventoryWorkflow';
import { syncCustomerLevelsByInvoiceCustomers } from '../utils/customerLeveling';
import { attachTaskCompletionIfNeeded } from '../utils/taskCompletion';
import { mergeSelectOptions } from '../utils/selectOptions';
import { ACTIVE_NOTIFICATION_BOTS_CATEGORY, listActiveNotificationBotOptions } from '../utils/channelSettings';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import { buildResolvedAssigneeCombo } from '../utils/assigneeValue';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchFormulaOptions } from '../utils/referenceData';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { getCachedAuthUser } from '../utils/sessionCache';
import { supportsGlobalAssignee, supportsGlobalAssigneeType, supportsGlobalRoleAssignee } from '../utils/assigneeSupport';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../utils/systemCode';
import { syncRecordTags } from '../utils/recordTags';
import { resolveConfiguredDefaultValue } from '../utils/defaultValues';
import { isAutoNameEnabled, normalizeAutoNameEnabled } from '../utils/autoName';
import { getProcessTemplateModuleOptions } from '../utils/workflowHelpers';
import { createProcessLinkedFieldKey, getRelationFieldLinksForModules, normalizeProcessTargetModuleIds, syncProcessTemplateTargetModules } from '../utils/processTargets';
import { fetchTaskSourceRecordOptions, getTaskModuleOptions, isTaskLegacySourceField, normalizeTaskSourceValues } from '../utils/taskMeta';
import { mergeOptionLists, mergeOptionMaps, readModuleOptionSnapshot, writeModuleOptionSnapshot } from '../utils/moduleOptionSnapshot';
import { normalizeProcessTaskCustomFields, PROCESS_TASK_CUSTOM_FIELDS_KEY } from '../utils/processTaskCustomFields';
import { normalizeProcessTaskStatusOptions, PROCESS_TASK_STATUS_OPTIONS_KEY, getTaskStatusOptions } from '../utils/processTaskStatusOptions';

interface SmartFormProps {
  module: ModuleDefinition;
  visible: boolean;
  onCancel: () => void;
  onSave?: (values: any, meta?: { productInventory?: any[]; templateStagesPreview?: any[]; selectedTags?: any[] }) => void;
  recordId?: string;
  title?: string;
  isBulkEdit?: boolean;
  initialValues?: Record<string, any>;
  displayMode?: 'modal' | 'embedded';
}

const isAbortLikeError = (error: unknown) =>
  String((error as any)?.name || '').toLowerCase() === 'aborterror'
  || String((error as any)?.message || '').toLowerCase().includes('signal is aborted');
const isMissingAuditColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42703'
    || code === 'PGRST204'
    || text.includes('created_by')
    || text.includes('updated_by')
  );
};
const isStatementTimeoutError = (error: any) =>
  String(error?.code || '').trim() === '57014'
  || String(error?.message || '').toLowerCase().includes('statement timeout');
const isDuplicateSystemCodeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '23505' && text.includes('system_code');
};
type AssigneeOptionsState = { users: any[]; roles: any[] };
let assigneesCache: AssigneeOptionsState | null = null;
let assigneesPromise: Promise<AssigneeOptionsState> | null = null;
const PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS = new Set([
  'projects',
  'tasks',
  'process_templates',
  'process_runs',
  'customers',
  'invoices',
  'purchase_invoices',
]);
const MARKETING_LEAD_LOCKED_FROM_CUSTOMER_FIELD_KEYS = new Set([
  'prefix',
  'first_name',
  'last_name',
  'industry',
  'customer_interests',
  'mobile',
  'mobile_2',
  'assistant_phone',
  'email',
  'province',
  'city',
  'address',
  'location',
]);
const CUSTOMER_INTEREST_SOURCE_CATEGORIES = ['product_goods_categories', 'product_service_categories'] as const;

const SmartForm: React.FC<SmartFormProps> = ({ 
  module, visible, onCancel, onSave, recordId, title, isBulkEdit = false,
  initialValues: initialValuesProp,
  displayMode = 'modal'
}) => {
  const initialValues = useMemo(() => initialValuesProp ?? {}, [initialValuesProp]);
  const requireInventoryShelf = initialValuesProp?.__requireInventoryShelf === true;
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [initialRecord, setInitialRecord] = useState<any>(null);
  const watchedValues = Form.useWatch([], form);
  const getLiveFormValues = () => {
    const liveValues = form.getFieldsValue(true);
    return { ...formData, ...(watchedValues || {}), ...(liveValues || {}) };
  };
  
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [optionsBootstrapping, setOptionsBootstrapping] = useState(false);
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean }>({});
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [lastAppliedBomId, setLastAppliedBomId] = useState<string | null>(null);
  const bomConfirmOpenRef = useRef<string | null>(null);
  const [lastAppliedProcessTemplateId, setLastAppliedProcessTemplateId] = useState<string | null>(null);
  const processConfirmOpenRef = useRef<string | null>(null);
  const marketingLeadCustomerSyncRef = useRef<string | null>(null);
  const processDraftFieldKey = useMemo(() => {
    const hasProcessTemplateField = module.fields.some((f) => f.key === 'process_template_id');
    if (!hasProcessTemplateField) return null;
    const knownDraftKeys = ['execution_process_draft', 'marketing_process_draft', 'production_stages_draft'];
    return knownDraftKeys.find((key) => module.fields.some((f) => f.key === key)) || null;
  }, [module.fields]);
  const processPreviewFieldKey = module.id === 'process_templates'
    ? 'template_stages_preview'
    : (module.id === 'process_runs' ? 'run_stages_preview' : null);
  const shouldHideProcessUiInSmartForm = !!processDraftFieldKey
    && module.id !== 'process_templates'
    && module.id !== 'process_runs';
  const supportsAssignee = supportsGlobalAssignee(module.id);
  const supportsAssigneeType = supportsGlobalAssigneeType(module.id);
  const supportsRoleAssignee = supportsGlobalRoleAssignee(module.id);
  const assigneeLabel = getAssigneeLabel(module.id);
  const hasAutoNameToggle = module.fields.some((field) => field.key === 'auto_name_enabled');

  const buildAssigneeCombo = (assigneeType?: string | null, assigneeId?: string | null) => {
    if (!assigneeType || !assigneeId) return null;
    return `${assigneeType}_${assigneeId}`;
  };

  const parseAssigneeCombo = (val?: string | null) => {
    if (!val) return { assignee_type: null, assignee_id: null };
    const [type, id] = String(val).split('_');
    return { assignee_type: type || 'user', assignee_id: id || null };
  };

  const getRelationFieldValueSignature = useMemo(() => {
    const combinedValues = { ...(formData || {}), ...((watchedValues as Record<string, any>) || {}) };
    const projectProcessRelationFields = module.id === 'projects' && processDraftFieldKey && !shouldHideProcessUiInSmartForm
      ? normalizeProcessTargetModuleIds(
          (Array.isArray(combinedValues?.[processDraftFieldKey]) ? combinedValues[processDraftFieldKey] : []).flatMap((stage: any) => (
            Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []
          )),
          ''
        )
          .filter((targetModuleId) => !!MODULES[targetModuleId] && !PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId))
          .map((targetModuleId) => ({
            key: createProcessLinkedFieldKey(targetModuleId, 'id'),
            type: FieldType.RELATION,
          }))
      : [];
    return [...module.fields, ...projectProcessRelationFields]
      .filter((field) => field.type === FieldType.RELATION || (field as any)?.relationConfig?.dependsOn)
      .map((field) => {
        const rawValue = combinedValues[field.key];
        const normalized = Array.isArray(rawValue)
          ? rawValue.map((item) => String(item ?? '').trim()).join(',')
          : String(rawValue ?? '').trim();
        return `${field.key}:${normalized}`;
      })
      .join('|');
  }, [formData, module.fields, module.id, processDraftFieldKey, shouldHideProcessUiInSmartForm, watchedValues]);
  
  useEffect(() => {
    if (visible) {
      if (recordId && !isBulkEdit) {
        // --- حالت ویرایش ---
        const hasInitialProps = initialValues && Object.keys(initialValues).length > 0;
        if (hasInitialProps) {
          const assigneeCombo = buildResolvedAssigneeCombo(initialValues);
          const prefetchedValues = {
            ...initialValues,
            assignee_combo: assigneeCombo,
            ...(hasAutoNameToggle ? { auto_name_enabled: false } : {}),
          };
          setFormData(prefetchedValues);
          form.setFieldsValue(prefetchedValues);
        }
        fetchRecord(!hasInitialProps);
            } else if (isBulkEdit) {
        form.resetFields();
        const bulkDefaults = hasAutoNameToggle ? { auto_name_enabled: false } : {};
        form.setFieldsValue(bulkDefaults);
        setFormData(bulkDefaults);
        setInitialRecord(null);
        setLastAppliedBomId(null);
        setLastAppliedProcessTemplateId(null);
      } else {
        // --- حالت ایجاد رکورد جدید ---
        form.resetFields();
        setFormData({});
        setLastAppliedBomId(null);
        setLastAppliedProcessTemplateId(null);

        const applyCreateDefaults = async () => {
          const defaults: Record<string, any> = {};
          module.fields.forEach((field) => {
            if (field.defaultValue !== undefined) {
              defaults[field.key] = resolveConfiguredDefaultValue(field.defaultValue);
            }
          });

          const initialProps = initialValues || {};
          const assigneeCombo = buildResolvedAssigneeCombo(initialProps);
          let finalValues: Record<string, any> = { ...defaults, ...initialProps, assignee_combo: assigneeCombo };
          Object.entries(defaults).forEach(([key, value]) => {
            if (finalValues[key] === undefined || finalValues[key] === null || finalValues[key] === '') {
              finalValues[key] = value;
            }
          });

          if (supportsAssignee && !finalValues.assignee_id && !finalValues.assignee_role_id) {
            try {
              const authUser = await getCachedAuthUser(supabase);
              const creatorId = authUser?.id || null;
              if (creatorId) {
                finalValues.assignee_id = creatorId;
                if (supportsAssigneeType) finalValues.assignee_type = 'user';
                finalValues.assignee_combo = buildAssigneeCombo('user', creatorId);
              }
            } catch (err) {
              if (!isAbortLikeError(err)) {
                console.warn('Could not set default assignee for create form', err);
              }
            }
          }

          if (module.id === 'tasks') {
            finalValues = normalizeTaskSourceValues(finalValues);
          }
          if (Object.prototype.hasOwnProperty.call(finalValues, 'auto_name_enabled')) {
            finalValues.auto_name_enabled = normalizeAutoNameEnabled(
              finalValues.auto_name_enabled,
              false
            );
          }
          if (hasAutoNameToggle) {
            finalValues.auto_name_enabled = false;
          }

          setFormData(finalValues);
          form.setFieldsValue(finalValues);
        };

        applyCreateDefaults();
      }
      
      // فراخوانی توابع کمکی
      fetchUserPermissions();
    }
  }, [visible, recordId, isBulkEdit, module, initialValues, supportsAssignee, supportsAssigneeType, hasAutoNameToggle]);

  const fetchAssignees = useCallback(async () => {
    try {
      if (assigneesCache) {
        setAssignees(assigneesCache);
        writeModuleOptionSnapshot(module.id, {
          allUsers: assigneesCache.users,
          allRoles: assigneesCache.roles,
        });
        return;
      }
      setAssigneesLoading(true);
      if (!assigneesPromise) {
        assigneesPromise = (async () => {
          return await fetchAssigneeDirectory(supabase);
        })();
      }
      const nextAssignees = await assigneesPromise;
      assigneesCache = nextAssignees;
      setAssignees(nextAssignees);
      writeModuleOptionSnapshot(module.id, {
        allUsers: nextAssignees.users,
        allRoles: nextAssignees.roles,
      });
    } catch (e) {
      if (isAbortLikeError(e)) return;
      console.warn('Could not fetch assignees', e);
    } finally {
      setAssigneesLoading(false);
      assigneesPromise = null;
    }
  }, [module.id]);

  const currentAssigneeComboValue = String(
    watchedValues?.assignee_combo ??
    formData?.assignee_combo ??
    ''
  ).trim();
  const currentAssigneePlaceholder = useMemo(() => {
    if (!currentAssigneeComboValue) return null;
    const { assignee_id, assignee_type } = parseAssigneeCombo(currentAssigneeComboValue);
    if (!assignee_id) return null;

    const normalizedType = String(assignee_type || 'user');
    const matchedUser = assignees.users.find((item: any) => String(item?.id || '') === String(assignee_id));
    const matchedRole = assignees.roles.find((item: any) => String(item?.id || '') === String(assignee_id));
    const explicitLabel =
      String(
        formData?.assignee_name ||
        formData?.assignee_label ||
        initialRecord?.assignee_name ||
        initialRecord?.assignee_label ||
        ''
      ).trim();

    const label = explicitLabel
      || (normalizedType === 'role' ? matchedRole?.title : matchedUser?.display_name || matchedUser?.full_name)
      || (assigneesLoading || optionsBootstrapping
        ? (normalizedType === 'role' ? 'در حال بارگذاری نام تیم...' : 'در حال بارگذاری نام مسئول...')
        : (normalizedType === 'role' ? 'تیم انتخاب‌شده' : 'مسئول انتخاب‌شده'));

    return {
      label,
      value: currentAssigneeComboValue,
      emoji: normalizedType === 'role' ? <TeamOutlined /> : <UserOutlined />,
      type: normalizedType,
    };
  }, [assignees.roles, assignees.users, assigneesLoading, currentAssigneeComboValue, formData?.assignee_label, formData?.assignee_name, initialRecord?.assignee_label, initialRecord?.assignee_name, optionsBootstrapping]);

  const assigneeOptions = useMemo(() => {
    const userOptions = assignees.users.map((u) => ({
      label: u.display_name || u.full_name,
      value: `user_${u.id}`,
      emoji: <UserOutlined />,
    }));
    const roleOptions = assignees.roles.map((r) => ({
      label: r.title,
      value: `role_${r.id}`,
      emoji: <TeamOutlined />,
    }));

    const hasCurrentUser = currentAssigneePlaceholder?.type === 'user'
      && userOptions.some((item) => item.value === currentAssigneePlaceholder.value);
    const hasCurrentRole = currentAssigneePlaceholder?.type === 'role'
      && roleOptions.some((item) => item.value === currentAssigneePlaceholder.value);

    const mergedUserOptions = currentAssigneePlaceholder?.type === 'user' && !hasCurrentUser
      ? [currentAssigneePlaceholder, ...userOptions]
      : userOptions;
    const mergedRoleOptions = currentAssigneePlaceholder?.type === 'role' && !hasCurrentRole
      ? [currentAssigneePlaceholder, ...roleOptions]
      : roleOptions;

    return [
      {
        label: 'پرسنل',
        title: 'users',
        options: mergedUserOptions,
      },
      ...(supportsRoleAssignee
        ? [{
            label: 'تیم‌ها',
            title: 'roles',
            options: mergedRoleOptions,
          }]
        : []),
    ];
  }, [assignees.roles, assignees.users, currentAssigneePlaceholder, supportsRoleAssignee]);

  const fetchUserPermissions = async () => {
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      const modulePerms = context.permissions?.[module.id] || {};
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
      });
      setFieldPermissions(modulePerms.fields || {});
    } catch (err) {
      if (isAbortLikeError(err)) return;
      console.warn('Could not fetch permissions:', err);
    }
  };
  
  // --- 2. دریافت آپشن‌های ارتباطی (Relation) ---
  const fetchRelationOptions = useCallback(async () => {
    const options: Record<string, any[]> = {};
    const currentValues = form.getFieldsValue(true);
    const cachedSnapshot = readModuleOptionSnapshot(module.id);
    const collectExactIds = (rawValue: any) => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return [] as string[];
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean)));
    };
    const fetchOptionsForField = async (field: any, key: string, exactIds: string[] = []) => {
      try {
        let nextOptions: any[] = [];
        if (module.id === 'tasks' && field.key === 'source_record_id') {
          const sourceModuleId = String(currentValues?.related_to_module || currentValues?.source_module_id || '').trim();
          nextOptions = await fetchTaskSourceRecordOptions(supabase, sourceModuleId, {
            exactId: currentValues?.source_record_id ?? null,
          });
        } else {
          nextOptions = await fetchRelationOptionsForField(supabase, field, {
            allValues: currentValues,
          });

          const missingExactIds = exactIds.filter(
            (exactId) => !nextOptions.some((option: any) => String(option?.value || '') === exactId)
          );
          if (missingExactIds.length > 0) {
            const exactResults = await Promise.all(
              missingExactIds.map((exactId) =>
                fetchRelationOptionsForField(supabase, field, {
                  allValues: currentValues,
                  exactId,
                  limit: 1,
                }).catch(() => [])
              )
            );
            nextOptions = mergeOptionLists(nextOptions, ...exactResults);
          }
        }

        options[key] = mergeOptionLists(cachedSnapshot?.relationOptions?.[key], nextOptions);
      } catch (error) {
        if (isAbortLikeError(error)) return;
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (!isOffline) {
          console.error('Error fetching relation:', error);
        }
      }
    };

    for (const field of module.fields) {
      if (field.type === FieldType.RELATION && field.relationConfig) {
        await fetchOptionsForField(field, field.key, collectExactIds(currentValues?.[field.key]));
      }
    }

    if (module.id === 'projects' && processDraftFieldKey) {
      const draftStages = Array.isArray(currentValues?.[processDraftFieldKey])
        ? currentValues[processDraftFieldKey]
        : [];
      const targetModuleIds = normalizeProcessTargetModuleIds(
        draftStages.flatMap((stage: any) => (
          Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []
        )),
        ''
      );
      const linkedRecordMap = draftStages.reduce<Record<string, string>>((acc, stage: any) => {
        const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
          ? stage.process_link_map
          : {};
        Object.entries(rawMap).forEach(([targetModuleId, recordId]) => {
          const normalizedTargetModuleId = String(targetModuleId || '').trim();
          const normalizedRecordId = String(recordId || '').trim();
          if (normalizedTargetModuleId && normalizedRecordId && !acc[normalizedTargetModuleId]) {
            acc[normalizedTargetModuleId] = normalizedRecordId;
          }
        });
        return acc;
      }, {});

      for (const targetModuleId of targetModuleIds) {
        if (!MODULES[targetModuleId] || PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId)) continue;
        const fieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
        await fetchOptionsForField(
          {
            key: fieldKey,
            type: FieldType.RELATION,
            relationConfig: { targetModule: targetModuleId },
          } as any,
          fieldKey,
          collectExactIds(currentValues?.[fieldKey] || linkedRecordMap[targetModuleId])
        );
      }
    }

    if (module.blocks) {
      for (const block of module.blocks) {
        if (block.tableColumns) {
          for (const col of block.tableColumns) {
            if (col.type === FieldType.RELATION && col.relationConfig) {
              const key = `${block.id}_${col.key}`;
              await fetchOptionsForField(col, key);
              options[col.key] = mergeOptionLists(
                cachedSnapshot?.relationOptions?.[col.key],
                options[col.key],
                options[key]
              );
            }
          }
        }
      }
    }

    setRelationOptions((prev) => {
      const mergedOptions = mergeOptionMaps(cachedSnapshot?.relationOptions, prev, options);
      writeModuleOptionSnapshot(module.id, { relationOptions: mergedOptions });
      return mergedOptions;
    });
  }, [form, module, processDraftFieldKey]);

  // --- 3. دریافت آپشن‌های داینامیک ---
  const loadDynamicOptions = useCallback(async () => {
    const categoriesToFetch = new Set<string>();

    // جمع‌آوری دسته‌ها از فیلدها و ستون‌های جدول
    module.fields.forEach(f => { if (f.dynamicOptionsCategory) categoriesToFetch.add(f.dynamicOptionsCategory); });
    module.blocks?.forEach(b => {
      b.tableColumns?.forEach((c: any) => { if (c.dynamicOptionsCategory) categoriesToFetch.add(c.dynamicOptionsCategory); });
    });
    if (
      (module.id === 'customers' || module.id === 'marketing_leads')
      && module.fields.some((field) => field.key === 'customer_interests')
    ) {
      CUSTOMER_INTEREST_SOURCE_CATEGORIES.forEach((category) => categoriesToFetch.add(category));
      categoriesToFetch.add('customer_interests');
    }

    const newOptions: Record<string, any[]> = await fetchDynamicOptionsMap(supabase, Array.from(categoriesToFetch));
    try {
      const formulas = await fetchFormulaOptions(supabase);
      if (formulas.length > 0) {
        newOptions['calculation_formulas'] = formulas;
      }
    } catch (err) {
      console.warn('Could not load calculation formulas', err);
    }
    try {
      if (module.fields.some((field) => field.key === 'preferred_notification_channel')) {
        newOptions[ACTIVE_NOTIFICATION_BOTS_CATEGORY] = await listActiveNotificationBotOptions();
      }
    } catch (err) {
      console.warn('Could not load active notification bots', err);
    }
    setDynamicOptions((prev) => {
      const mergedDynamicOptions = mergeOptionMaps(readModuleOptionSnapshot(module.id)?.dynamicOptions, prev, newOptions);
      writeModuleOptionSnapshot(module.id, { dynamicOptions: mergedDynamicOptions });
      return mergedDynamicOptions;
    });
  }, [module.blocks, module.fields, module.id]);

  const fetchAllRelationOptionsWrapper = useCallback(async () => {
    setOptionsBootstrapping(true);
    try {
      await Promise.all([
        fetchRelationOptions(),
        loadDynamicOptions(),
        supportsAssignee ? fetchAssignees() : Promise.resolve(),
      ]);
    } finally {
      setOptionsBootstrapping(false);
    }
  }, [fetchAssignees, fetchRelationOptions, loadDynamicOptions, supportsAssignee]);

  useEffect(() => {
    if (!visible) return;
    const cachedSnapshot = readModuleOptionSnapshot(module.id);
    if (cachedSnapshot) {
      setRelationOptions(cachedSnapshot.relationOptions || {});
      setDynamicOptions(cachedSnapshot.dynamicOptions || {});
      if ((cachedSnapshot.allUsers?.length || 0) > 0 || (cachedSnapshot.allRoles?.length || 0) > 0) {
        setAssignees({
          users: cachedSnapshot.allUsers || [],
          roles: cachedSnapshot.allRoles || [],
        });
      }
    }
    void fetchAllRelationOptionsWrapper();
  }, [fetchAllRelationOptionsWrapper, module.id, visible]);

  useEffect(() => {
    if (!visible) return;
    void fetchRelationOptions();
  }, [fetchRelationOptions, getRelationFieldValueSignature, visible]);

  const getFieldValueLabel = (fieldKey: string, value: any) => {
    if (value === undefined || value === null) return '';
    const field = module.fields.find(f => f.key === fieldKey);
    if (!field) return String(value);

    const formatOptionLabel = (val: any) => {
      if (val === undefined || val === null) return '';
      let opt = field.options?.find((o: any) => o.value === val);
      if (opt) return opt.label;
      if (field.dynamicOptionsCategory) {
        opt = dynamicOptions[field.dynamicOptionsCategory]?.find((o: any) => o.value === val);
        if (opt) return opt.label;
      }
      if (field.key === 'preferred_notification_channel') {
        opt = dynamicOptions[ACTIVE_NOTIFICATION_BOTS_CATEGORY]?.find((o: any) => o.value === val);
        if (opt) return opt.label;
      }
      if (field.type === FieldType.RELATION) {
        const rel = relationOptions[fieldKey]?.find((o: any) => o.value === val);
        if (rel) return rel.label;
      }
      return String(val);
    };

    if (Array.isArray(value)) {
      return value.map(v => formatOptionLabel(v)).filter(Boolean).join('، ');
    }
    return formatOptionLabel(value);
  };

  const buildAutoProductName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const normalizeDimension = (raw: any) => {
      if (raw === null || raw === undefined) return '';
      const txt = String(raw).trim();
      if (!txt) return '';
      const numeric = parseFloat(txt);
      if (!Number.isFinite(numeric)) return txt;
      return String(numeric).replace(/\.0+$/, '');
    };

    const productType = String(values?.product_type || '').trim().toLowerCase();
    if (productType === 'goods') {
      addPart(getFieldValueLabel('category', values?.category));
      addPart(getFieldValueLabel('goods_subgroup', values?.goods_subgroup));
    } else if (productType === 'service') {
      addPart(getFieldValueLabel('product_category', values?.product_category));
      addPart(getFieldValueLabel('service_subgroup', values?.service_subgroup));
    } else {
      addPart(getFieldValueLabel('category', values?.category));
      addPart(getFieldValueLabel('product_category', values?.product_category));
    }

    addPart(getFieldValueLabel('material_type', values?.material_type));
    addPart(getFieldValueLabel('brand_name', values?.brand_name));
    addPart(getFieldValueLabel('color_name', values?.color_name));
    addPart(getFieldValueLabel('feature_name', values?.feature_name));
    addPart(getFieldValueLabel('quality_level', values?.quality_level));

    const explicitSize = getFieldValueLabel('size_value', values?.size_value);
    const lengthValue = normalizeDimension(values?.length_value);
    const widthValue = normalizeDimension(values?.width_value);
    if (lengthValue && widthValue) {
      addPart(`${lengthValue}X${widthValue}`);
    } else if (lengthValue) {
      addPart(`طول ${lengthValue}`);
    } else if (widthValue) {
      addPart(`عرض ${widthValue}`);
    } else {
      addPart(explicitSize);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  const buildAutoCustomerName = (values: any) => {
    const normalize = (value: any) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const businessName = normalize(values?.business_name);
    const personType = normalize(values?.person_type).toLowerCase();

    if (personType === 'legal') {
      const legalName = normalize(values?.legal_name);
      if (legalName && businessName) return legalName + ' - ' + businessName;
      return legalName || businessName;
    }

    const realName = [values?.prefix, values?.first_name, values?.last_name]
      .map((part) => normalize(part))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (realName && businessName) return realName + ' - ' + businessName;
    return realName || businessName;
  };

  const buildAutoProductionOrderName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const bomLabelRaw = getFieldValueLabel('bom_id', values?.bom_id);
    const bomLabelClean = String(bomLabelRaw || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    addPart(bomLabelClean);
    addPart(getFieldValueLabel('color', values?.color));
    return parts.join(' ');
  };

  // --- 4. دریافت رکورد (در حالت ویرایش) ---
  const fetchRecord = async (withLoading = true) => {
    if (withLoading) setLoading(true);
    try {
      const { data, error } = await supabase.from(module.table).select('*').eq('id', recordId).single();
      if (error) throw error;
      if (data) {
        let nextValues: any = { ...data };
        if (module.id === 'process_templates') {
          nextValues = syncProcessTemplateTargetModules(nextValues);
          const { data: templateStages } = await supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', recordId)
            .order('sort_order', { ascending: true });
          nextValues.template_stages_preview = (templateStages || []).map((stage: any, index: number) => ({
            ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
            id: stage.id || `${recordId}_${index + 1}`,
            name: stage.stage_name || `مرحله ${index + 1}`,
            sort_order: stage.sort_order || ((index + 1) * 10),
            wage: stage.wage || 0,
            weight: Number(stage?.metadata?.weight || 0),
            duration_value: Number(stage?.metadata?.duration_value || 0),
            duration_unit: stage?.metadata?.duration_unit || 'day',
            duration_from: stage?.metadata?.duration_from || 'project_start',
            default_assignee_id: stage.default_assignee_id || null,
            default_assignee_role_id: stage.default_assignee_role_id || null,
            template_stage_id: stage.id || null,
          }));
        }
        if (module.id === 'process_runs') {
          const { data: runStages } = await supabase
            .from('process_run_stages')
            .select('id, stage_name, sort_order, status, wage, assignee_user_id, assignee_role_id, task_id, metadata')
            .eq('process_run_id', recordId)
            .order('sort_order', { ascending: true });
          nextValues.run_stages_preview = (runStages || []).map((stage: any, index: number) => ({
            ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
            id: stage.id || `${recordId}_${index + 1}`,
            name: stage.stage_name || `مرحله ${index + 1}`,
            sort_order: stage.sort_order || ((index + 1) * 10),
            status: stage.status || 'todo',
            wage: stage.wage || 0,
            weight: Number(stage?.metadata?.weight || 0),
            duration_value: Number(stage?.metadata?.duration_value || 0),
            duration_unit: stage?.metadata?.duration_unit || 'day',
            duration_from: stage?.metadata?.duration_from || 'project_start',
            assignee_id: stage.assignee_user_id || null,
            assignee_role_id: stage.assignee_role_id || null,
            assignee_type: stage.assignee_role_id ? 'role' : (stage.assignee_user_id ? 'user' : null),
            process_run_stage_id: stage.id || null,
            task_id: stage.task_id || null,
          }));
        }
        const assigneeCombo = buildResolvedAssigneeCombo(data);
        nextValues = { ...nextValues, assignee_combo: assigneeCombo };
        if (module.id === 'tasks') {
          nextValues = normalizeTaskSourceValues(nextValues);
        }
        if (hasAutoNameToggle) {
          nextValues.auto_name_enabled = false;
        }
        form.setFieldsValue(nextValues);
        setFormData(nextValues);
        setInitialRecord(data);
        setLastAppliedProcessTemplateId(data?.process_template_id || null);
      }
    } catch (err: any) {
      messageApi.error(toFaErrorMessage(err, 'خطا در دریافت اطلاعات رکورد'));
    } finally {
      if (withLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (module.id !== 'production_orders') return;
    const bomId = (watchedValues?.bom_id || formData?.bom_id) as string | undefined;
    if (!bomId || bomId === lastAppliedBomId) return;

    const applyBom = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('production_boms')
          .select('name, grid_materials, product_category, production_stages_draft')
          .eq('id', bomId)
          .single();
        if (error) throw error;

        const payload = {
          grid_materials: data?.grid_materials || [],
          product_category: data?.product_category || null,
          production_stages_draft: data?.production_stages_draft || [],
          name: data?.name || undefined,
        };

        form.setFieldsValue(payload);
        setFormData((prev: any) => ({ ...prev, ...payload, bom_id: bomId }));
        setLastAppliedBomId(bomId);
        messageApi.success('اقلام BOM به سفارش تولید منتقل شد');
      } catch (err: any) {
        console.error(err);
        messageApi.error('دریافت اقلام BOM ناموفق بود');
      } finally {
        setLoading(false);
      }
    };

    if (initialValuesProp?.__skipBomConfirm === true && !lastAppliedBomId) {
      applyBom();
      return;
    }

    if (bomConfirmOpenRef.current === bomId) return;
    bomConfirmOpenRef.current = bomId;

    Modal.confirm({
      title: 'کپی از شناسنامه تولید',
      content: 'جداول سفارش تولید ریست شوند و مقادیر از روی BOM کپی شوند؟',
      okText: 'بله، کپی کن',
      cancelText: 'خیر',
      onOk: async () => {
        await applyBom();
        bomConfirmOpenRef.current = null;
      },
      onCancel: () => {
        setLastAppliedBomId(bomId);
        bomConfirmOpenRef.current = null;
      },
    });
  }, [module.id, watchedValues?.bom_id, lastAppliedBomId, initialValuesProp]);

  useEffect(() => {
    if (!processDraftFieldKey) return;
    const processTemplateId = (watchedValues?.process_template_id || formData?.process_template_id) as string | undefined;
    if (!processTemplateId || processTemplateId === lastAppliedProcessTemplateId) return;

    const applyProcessTemplate = async () => {
      setLoading(true);
      try {
        const currentValues = form.getFieldsValue(true);
        const [{ data: templateRow, error: templateError }, { data: stages, error }] = await Promise.all([
          supabase
            .from('process_templates')
            .select('id, module_id, module_ids')
            .eq('id', processTemplateId)
            .maybeSingle(),
          supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', processTemplateId)
            .order('sort_order', { ascending: true }),
        ]);
        if (templateError) throw templateError;
        if (error) throw error;

        const targetModuleIds = normalizeProcessTargetModuleIds(templateRow?.module_ids, templateRow?.module_id);
        const inferredProcessLinks = {
          ...getRelationFieldLinksForModules(module.id, currentValues || {}, targetModuleIds),
          ...targetModuleIds.reduce<Record<string, string>>((acc, targetModuleId) => {
            const linkedFieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
            const linkedRecordId = String(currentValues?.[linkedFieldKey] || formData?.[linkedFieldKey] || '').trim();
            if (linkedRecordId) {
              acc[targetModuleId] = linkedRecordId;
            }
            return acc;
          }, {}),
        };

        const mappedDraft = (stages || []).map((stage: any, index: number) => ({
          ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
          id: stage.id || `${processTemplateId}_${index + 1}`,
          name: stage.stage_name || `مرحله ${index + 1}`,
          sort_order: stage.sort_order || ((index + 1) * 10),
          wage: stage.wage || 0,
            weight: Number(stage?.metadata?.weight || 0),
            duration_value: Number(stage?.metadata?.duration_value || 0),
            duration_unit: stage?.metadata?.duration_unit || 'day',
            duration_from: stage?.metadata?.duration_from || 'project_start',
            default_assignee_id: stage.default_assignee_id || null,
          default_assignee_role_id: stage.default_assignee_role_id || null,
          template_stage_id: stage.id || null,
          process_target_module_ids: targetModuleIds,
          process_link_map: inferredProcessLinks,
        }));

        const payload: Record<string, any> = {
          [processDraftFieldKey]: mappedDraft,
        };
        if (module.id === 'projects') {
          targetModuleIds
            .filter((targetModuleId) => !PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId))
            .forEach((targetModuleId) => {
              const linkedRecordId = String(inferredProcessLinks[targetModuleId] || '').trim();
              if (linkedRecordId) {
                payload[createProcessLinkedFieldKey(targetModuleId, 'id')] = linkedRecordId;
              }
            });
        }
        form.setFieldsValue(payload);
        setFormData((prev: any) => ({ ...prev, ...payload, process_template_id: processTemplateId }));
        setLastAppliedProcessTemplateId(processTemplateId);
        messageApi.success('مراحل فرآیند از الگو بارگذاری شد');
      } catch (err: any) {
        console.error(err);
        messageApi.error('بارگذاری مراحل فرآیند ناموفق بود');
      } finally {
        setLoading(false);
      }
    };

    const currentValues = watchedValues || formData;
    const currentDraft = Array.isArray((currentValues as any)?.[processDraftFieldKey])
      ? (currentValues as any)[processDraftFieldKey]
      : [];

    if (currentDraft.length === 0) {
      applyProcessTemplate();
      return;
    }
    if (!recordId) {
      setLastAppliedProcessTemplateId(processTemplateId);
      return;
    }

    if (processConfirmOpenRef.current === processTemplateId) return;
    processConfirmOpenRef.current = processTemplateId;

    Modal.confirm({
      title: 'کپی مراحل از الگوی فرآیند',
      content: 'مراحل پیش‌نویس فعلی با مراحل الگوی جدید جایگزین شوند؟',
      okText: 'بله، جایگزین کن',
      cancelText: 'خیر',
      onOk: async () => {
        await applyProcessTemplate();
        processConfirmOpenRef.current = null;
      },
      onCancel: () => {
        setLastAppliedProcessTemplateId(processTemplateId);
        processConfirmOpenRef.current = null;
      },
    });
  }, [module.id, processDraftFieldKey, watchedValues?.process_template_id, lastAppliedProcessTemplateId, formData, recordId]);

  useEffect(() => {
    if (module.id !== 'products') return;
    const currentValues = getLiveFormValues();
    if (!getAutoNameToggleValue(normalizeAutoNameEnabled(currentValues?.auto_name_enabled, false))) return;
    const nextName = buildAutoProductName(currentValues);
    if (!nextName || nextName === currentValues?.name) return;
    form.setFieldValue('name', nextName);
    setFormData((prev: any) => ({ ...prev, name: nextName }));
  }, [module.id, watchedValues, relationOptions, dynamicOptions, formData, form]);

  useEffect(() => {
    if (module.id !== 'production_orders') return;
    const currentValues = getLiveFormValues();
    if (!getAutoNameToggleValue(normalizeAutoNameEnabled(currentValues?.auto_name_enabled, false))) return;
    const nextName = buildAutoProductionOrderName(currentValues);
    if (!nextName || nextName === currentValues?.name) return;
    form.setFieldValue('name', nextName);
    setFormData((prev: any) => ({ ...prev, name: nextName }));
  }, [module.id, watchedValues, relationOptions, dynamicOptions, formData, form]);

  useEffect(() => {
    if (module.id !== 'customers') return;
    const currentValues = getLiveFormValues();
    if (!getAutoNameToggleValue(normalizeAutoNameEnabled(currentValues?.auto_name_enabled, false))) return;
    const nextFullName = buildAutoCustomerName(currentValues);
    if (!nextFullName || nextFullName === currentValues?.full_name) return;
    form.setFieldValue('full_name', nextFullName);
    setFormData((prev: any) => ({ ...prev, full_name: nextFullName }));
  }, [module.id, watchedValues, formData, form]);

  useEffect(() => {
    if (module.id !== 'marketing_leads' || !visible) return;
    const leadType = String(form.getFieldValue('lead_type') ?? formData?.lead_type ?? '').trim();
    const customerId = String(form.getFieldValue('customer_id') ?? formData?.customer_id ?? '').trim();

    if (leadType !== 'existing_customer' || !customerId) {
      marketingLeadCustomerSyncRef.current = null;
      return;
    }

    const syncKey = `${leadType}:${customerId}`;
    if (marketingLeadCustomerSyncRef.current === syncKey) return;

    let cancelled = false;
    const syncFromCustomer = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id,prefix,first_name,last_name,industry,customer_interests,mobile_1,mobile_2,assistant_phone,email,province,city,address,location')
          .eq('id', customerId)
          .maybeSingle();
        if (cancelled || error || !data) return;

        const patch = {
          prefix: data.prefix || null,
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          industry: data.industry || null,
          customer_interests: Array.isArray(data.customer_interests)
            ? data.customer_interests.filter(Boolean)
            : (typeof data.customer_interests === 'string'
              ? data.customer_interests
                .replace(/\|\s*##\s*\|/g, ',')
                .replace(/\s+-\s+/g, ',')
                .split(/[,،;|\n\r]+/g)
                .map((item: string) => item.trim())
                .filter(Boolean)
              : []),
          mobile: data.mobile_1 || '',
          mobile_2: data.mobile_2 || '',
          assistant_phone: data.assistant_phone || '',
          email: data.email || '',
          province: data.province || null,
          city: data.city || null,
          address: data.address || '',
          location: data.location || null,
        };

        form.setFieldsValue(patch);
        setFormData((prev: any) => ({ ...prev, ...patch }));
        marketingLeadCustomerSyncRef.current = syncKey;
      } catch {
        // keep form usable when sync fails
      }
    };

    void syncFromCustomer();
    return () => {
      cancelled = true;
    };
  }, [form, formData?.customer_id, formData?.lead_type, module.id, visible, watchedValues?.customer_id, watchedValues?.lead_type]);

  useEffect(() => {
    if (module.id !== 'products') return;
    const currentValues = watchedValues || formData;
    const mainUnit = currentValues?.main_unit;
    const subUnit = currentValues?.sub_unit;
    const stock = parseFloat(currentValues?.stock) || 0;
    if (!mainUnit || !subUnit) return;
    const subStock = convertArea(stock, mainUnit, subUnit);
    const currentSubStock = parseFloat(currentValues?.sub_stock);
    if (
      Number.isFinite(subStock) &&
      (!Number.isFinite(currentSubStock) || Math.abs((currentSubStock as number) - subStock) > 0.0005)
    ) {
      form.setFieldValue('sub_stock', subStock);
      setFormData((prev: any) => ({ ...prev, sub_stock: subStock }));
    }
  }, [module.id, watchedValues, formData, form]);

  // --- تابع کمکی: دریافت دیتای خلاصه (Summary) ---
  const getSummaryData = (currentData: any) => {
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);
      if (summaryBlock) {
          return calculateSummary(currentData, module.blocks || [], summaryBlock.summaryConfig);
      }
      // اگر کانفیگ نبود ولی جدول داشتیم، پیش‌فرض جمع بزن (برای BOM)
      if (module.blocks?.some(b => b.type === BlockType.TABLE)) {
          return calculateSummary(currentData, module.blocks || [], {});
      }
      return null;
  };

  const isUuid = (value: any) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  const syncProcessTemplateStages = async (templateId: string, rawStages: any[]) => {
    const nextStages = (Array.isArray(rawStages) ? rawStages : []).map((stage: any, index: number) => ({
      id: isUuid(stage?.id) ? String(stage.id) : null,
      stage_name: String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`),
      sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      wage: Number(stage?.wage || 0),
      metadata: {
        ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
        description: String(stage?.description || stage?.metadata?.description || '').trim() || null,
        task_type: String(stage?.task_type || stage?.metadata?.task_type || '').trim() || null,
        automation_rules: Array.isArray(stage?.automation_rules)
          ? stage.automation_rules
          : (Array.isArray(stage?.metadata?.automation_rules) ? stage.metadata.automation_rules : []),
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: normalizeProcessTaskCustomFields(
          stage?.process_task_custom_fields || stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]
        ),
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: normalizeProcessTaskStatusOptions(
          stage?.process_task_status_options || stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]
        ),
        weight: Number(stage?.weight || stage?.metadata?.weight || 0),
        duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
        duration_unit: String(stage?.duration_unit || stage?.metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: String(stage?.duration_from || stage?.metadata?.duration_from || 'project_start') === 'previous_stage_end'
          ? 'previous_stage_end'
          : 'project_start',
      },
      default_assignee_id: isUuid(stage?.default_assignee_id) ? String(stage.default_assignee_id) : null,
      default_assignee_role_id: isUuid(stage?.default_assignee_role_id) ? String(stage.default_assignee_role_id) : null,
    }));

    const { data: existingRows, error: existingError } = await supabase
      .from('process_template_stages')
      .select('id')
      .eq('template_id', templateId);
    if (existingError) throw existingError;

    const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));
    const keptExistingIds = new Set(
      nextStages
        .map((stage) => stage.id)
        .filter((id): id is string => Boolean(id && existingIds.has(id)))
    );
    const removeIds = Array.from(existingIds).filter((id) => !keptExistingIds.has(id));
    if (removeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('process_template_stages')
        .delete()
        .in('id', removeIds);
      if (deleteError) throw deleteError;
    }

    for (const stage of nextStages) {
      if (stage.id && existingIds.has(stage.id)) {
        const { error: updateError } = await supabase
          .from('process_template_stages')
          .update({
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          })
          .eq('id', stage.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('process_template_stages')
          .insert({
            template_id: templateId,
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          });
        if (insertError) throw insertError;
      }
    }
  };

  // --- ذخیره نهایی ---
  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      if (module.id === 'production_orders' && !recordId) {
        values = { ...formData, ...values };
      }
      if (module.id === 'products') {
        const mainUnit = values?.main_unit ?? formData?.main_unit;
        const subUnit = values?.sub_unit ?? formData?.sub_unit;
        const stock = parseFloat(values?.stock ?? formData?.stock ?? 0) || 0;
        if (mainUnit && subUnit) {
          const computedSubStock = convertArea(stock, mainUnit, subUnit);
          if (Number.isFinite(computedSubStock)) {
            values.sub_stock = computedSubStock;
          }
        }
      }
      if (!isBulkEdit) {
        module.fields.forEach((field) => {
          if (field.defaultValue === undefined) return;
          const currentValue = values?.[field.key];
          if (currentValue === undefined || currentValue === null || currentValue === '') {
            values[field.key] = resolveConfiguredDefaultValue(field.defaultValue);
          }
        });
      }
      const authUser = await getCachedAuthUser(supabase);
      const authUserId = authUser?.id || null;
      const assigneeCombo = values?.assignee_combo ?? formData?.assignee_combo;
      if (supportsAssignee) {
        if (assigneeCombo) {
          const { assignee_id, assignee_type } = parseAssigneeCombo(String(assigneeCombo));
          const normalizedType = String(assignee_type || 'user');
          if (normalizedType === 'role' && !supportsRoleAssignee) {
            throw new Error('در این فرم فقط امکان انتخاب مسئول از نوع کاربر وجود دارد.');
          }
          values.assignee_id = normalizedType === 'role' ? null : assignee_id;
          if (normalizedType === 'role' && supportsRoleAssignee) {
            values.assignee_role_id = assignee_id;
          } else if (values?.assignee_role_id !== undefined) {
            values.assignee_role_id = null;
          }
          if (supportsAssigneeType) {
            values.assignee_type = normalizedType;
          }
        } else if (!isBulkEdit) {
          const fallbackAssigneeId = values?.assignee_id || formData?.assignee_id || authUserId;
          if (fallbackAssigneeId) {
            values.assignee_id = fallbackAssigneeId;
            if (supportsAssigneeType && !values?.assignee_type) {
              values.assignee_type = 'user';
            }
          }
        }
      } else {
        delete values.assignee_id;
        delete values.assignee_type;
      }
      if (values?.assignee_combo !== undefined) {
        delete values.assignee_combo;
      }
      if (!supportsAssigneeType && values?.assignee_type !== undefined) {
        delete values.assignee_type;
      }
      if (!supportsRoleAssignee && values?.assignee_role_id !== undefined) {
        delete values.assignee_role_id;
      }
      const productInventoryRows = Array.isArray(values?.product_inventory) ? values.product_inventory : [];
      if (requireInventoryShelf && module.id === 'products') {
        const missingShelf = productInventoryRows.some((row: any) => !row?.shelf_id);
        if (missingShelf) {
          messageApi.error(PRODUCTION_MESSAGES.requireInventoryShelf);
          setLoading(false);
          return;
        }
      }

      if (values?.__requireInventoryShelf !== undefined) {
        delete values.__requireInventoryShelf;
      }
      if (values?.__skipBomConfirm !== undefined) {
        delete values.__skipBomConfirm;
      }

      if (module.fields.some((field) => field.key === 'auto_name_enabled')) {
        values.auto_name_enabled = getAutoNameToggleValue(
          normalizeAutoNameEnabled(values.auto_name_enabled, false)
        );
      }

      if (module.id === 'products' && getAutoNameToggleValue(normalizeAutoNameEnabled(values.auto_name_enabled, false))) {
        const nextName = buildAutoProductName(values);
        if (nextName) {
          values.name = nextName;
        }
      }
      if (module.id === 'production_orders' && getAutoNameToggleValue(normalizeAutoNameEnabled(values.auto_name_enabled, false))) {
        const nextName = buildAutoProductionOrderName(values);
        if (nextName) {
          values.name = nextName;
        }
      }
      module.fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(values, field.key)) return;
        const currentValue = values[field.key];

        if (currentValue === '' && (
          field.type === FieldType.RELATION
          || field.type === FieldType.DATE
          || field.type === FieldType.TIME
          || field.type === FieldType.DATETIME
        )) {
          values[field.key] = null;
          return;
        }

        if (field.type === FieldType.JSON && currentValue === '') {
          delete values[field.key];
        }
      });
      if (module.id === 'tasks') {
        values = normalizeTaskSourceValues(values);
      }
      if (module.id === 'customers') {
        if (getAutoNameToggleValue(normalizeAutoNameEnabled(values.auto_name_enabled, false))) {
          const nextFullName = buildAutoCustomerName(values);
          if (nextFullName) {
            values.full_name = nextFullName;
          }
        }
        const personType = String(values?.person_type || 'real').trim().toLowerCase();
        const referrerModule = String(values?.referrer_module || '').trim().toLowerCase();

        if (personType === 'real') {
          values.legal_name = null;
          values.national_id = null;
          values.registration_number = null;
        } else if (personType === 'legal') {
          values.prefix = null;
          values.birth_date = null;
          values.national_code = null;
        }

        if (!values?.is_employee) {
          values.related_employee_id = null;
        }
        if (referrerModule !== 'customers') {
          values.referrer_customer_id = null;
        }
        if (referrerModule !== 'employees') {
          values.referrer_employee_id = null;
        }
        if (referrerModule !== 'suppliers') {
          values.referrer_supplier_id = null;
        }
        if (!values?.portal_enabled) {
          values.portal_status = values.portal_status || 'disabled';
          values.telegram_chat_id = null;
          values.bale_chat_id = null;
          values.rubika_chat_id = null;
          if (values.portal_permissions_override === '') {
            delete values.portal_permissions_override;
          }
        }
      }
      if (module.id === 'products') {
        delete values.product_inventory;
      }
      if (module.id === 'shelves') {
        delete values.shelf_inventory;
        delete values.shelf_stock_movements;
        delete values.task_shelf_inventory;
        delete values.task_shelf_stock_movements;
      }
      if (module.id === 'production_orders') {
        if (values.grid_materials === undefined) {
          values.grid_materials = formData?.grid_materials || [];
        }
        if (values.production_stages_draft === undefined) {
          values.production_stages_draft = formData?.production_stages_draft || [];
        }
      }
      if (module.id === 'production_boms') {
        if (values.production_stages_draft === undefined) {
          values.production_stages_draft = formData?.production_stages_draft || [];
        }
      }
      if (processDraftFieldKey && values[processDraftFieldKey] === undefined) {
        values[processDraftFieldKey] = formData?.[processDraftFieldKey] || [];
      }
      if (module.id === 'projects') {
        projectProcessLinkedFields.forEach(({ field }) => {
          delete values[field.key];
        });
      }
      const tagsFieldKey = module.fields.find((field) => field.type === FieldType.TAGS)?.key || null;
      const hasInlineTagsDraft = !!tagsFieldKey && Array.isArray(formData?.[tagsFieldKey]);
      const selectedTags = hasInlineTagsDraft ? (formData?.[tagsFieldKey] || []) : [];
      if (tagsFieldKey && values[tagsFieldKey] !== undefined) {
        delete values[tagsFieldKey];
      }
      const templateStagesPreview = module.id === 'process_templates'
        ? (Array.isArray(values.template_stages_preview)
          ? values.template_stages_preview
          : (Array.isArray(formData?.template_stages_preview) ? formData.template_stages_preview : []))
        : [];
      if (values.template_stages_preview !== undefined) {
        delete values.template_stages_preview;
      }
      if (values.run_stages_preview !== undefined) {
        delete values.run_stages_preview;
      }
      const summaryData = getSummaryData(formData);
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);

      // تزریق مقادیر محاسباتی به دیتای ارسالی
      if (summaryData && summaryBlock?.summaryConfig?.fieldMapping) {
          const mapping = summaryBlock.summaryConfig.fieldMapping;
          if (mapping.total && summaryData.total !== undefined) values[mapping.total] = summaryData.total;
          if (mapping.received && summaryData.received !== undefined) values[mapping.received] = summaryData.received;
          if (mapping.remaining && summaryData.remaining !== undefined) values[mapping.remaining] = summaryData.remaining;
        } else if (summaryData && (module.id === 'products' || module.id === 'production_boms' || module.id === 'production_orders')) {
          values['production_cost'] = summaryData.total;
      }
      if (module.id === 'tasks') {
        values = attachTaskCompletionIfNeeded(values, {
          previousCompletedAt: initialRecord?.completed_at ?? null,
          previousStatus: initialRecord?.status ?? null,
          previousStartDate: initialRecord?.start_date ?? null,
          previousDueDate: initialRecord?.due_date ?? null,
          previousActualStartAt: initialRecord?.actual_start_at ?? null,
          previousActualEndAt: initialRecord?.actual_end_at ?? null,
        }) as any;
      }
      if (module.id === 'process_templates') {
        values = syncProcessTemplateTargetModules(values);
      }

      if (onSave) {
        await onSave(values, {
          productInventory: productInventoryRows,
          templateStagesPreview,
          selectedTags,
        });
      } else {
        const userId = authUserId;
        const withAuditFields = (payload: Record<string, any>, mode: 'create' | 'update') => {
          if (!userId) return { ...payload };
          return mode === 'create'
            ? { ...payload, created_by: payload.created_by ?? userId, updated_by: payload.updated_by ?? userId }
            : { ...payload, updated_by: userId };
        };
        const persistWithAuditFallback = async (mode: 'create' | 'update', payload: Record<string, any>, targetRecordId?: string) => {
          if (mode === 'create' && supportsSystemCode(module.id) && !payload.system_code) {
            payload.system_code = await buildClientFallbackSystemCode(supabase, module.id, module.table);
          }
          const auditedPayload = withAuditFields(payload, mode);
          if (mode === 'update' && targetRecordId) {
            let result = await supabase.from(module.table).update(auditedPayload).eq('id', targetRecordId);
            if (result.error && isMissingAuditColumnError(result.error)) {
              result = await supabase.from(module.table).update(payload).eq('id', targetRecordId);
            }
            return result;
          }

          let insertResult = await supabase
            .from(module.table)
            .insert(auditedPayload)
            .select('id')
            .single();
          if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
            insertResult = await supabase
              .from(module.table)
              .insert(payload)
              .select('id')
              .single();
          }
          if (
            insertResult.error
            && supportsSystemCode(module.id)
            && (isStatementTimeoutError(insertResult.error) || isDuplicateSystemCodeError(insertResult.error))
          ) {
            const fallbackSystemCode = await buildClientFallbackSystemCode(supabase, module.id, module.table);
            const payloadWithSystemCode = { ...payload, system_code: fallbackSystemCode };
            const auditedPayloadWithSystemCode = withAuditFields(payloadWithSystemCode, mode);

            insertResult = await supabase
              .from(module.table)
              .insert(auditedPayloadWithSystemCode)
              .select('id')
              .single();

            if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
              insertResult = await supabase
                .from(module.table)
                .insert(payloadWithSystemCode)
                .select('id')
                .single();
            }
          }
          return insertResult;
        };

        if (recordId) {
          const { error: updateError } = await persistWithAuditFallback('update', values, recordId);
          if (updateError) throw updateError;
          if (hasInlineTagsDraft) {
            await syncRecordTags(supabase, module.id, recordId, selectedTags);
          }
          if (module.id === 'process_templates') {
            await syncProcessTemplateStages(recordId, templateStagesPreview);
          }

          if (module.id === 'invoices' || module.id === 'purchase_invoices') {
            await applyInvoiceFinalizationInventory({
              supabase: supabase as any,
              moduleId: module.id,
              recordId,
              previousStatus: initialRecord?.status ?? null,
              nextStatus: values?.status ?? initialRecord?.status ?? null,
              invoiceItems: values?.invoiceItems ?? initialRecord?.invoiceItems ?? [],
              userId,
            });
            if (module.id === 'invoices') {
              await syncCustomerLevelsByInvoiceCustomers({
                supabase: supabase as any,
                customerIds: [initialRecord?.customer_id, values?.customer_id],
              });
            }
          }

          const changes: any[] = [];
          const compareKeys = new Set<string>([...Object.keys(values || {}), ...Object.keys(initialRecord || {})]);
          compareKeys.forEach((key) => {
            const before = initialRecord?.[key];
            const after = values?.[key];
            const beforeStr = JSON.stringify(before ?? null);
            const afterStr = JSON.stringify(after ?? null);
            if (beforeStr !== afterStr) {
              const fieldLabel = module.fields.find(f => f.key === key)?.labels?.fa || key;
              changes.push({
                module_id: module.id,
                record_id: recordId,
                action: 'update',
                field_name: key,
                field_label: fieldLabel,
                old_value: before ?? null,
                new_value: after ?? null,
                user_id: userId,
                record_title: values?.name || values?.title || values?.system_code || null,
              });
            }
          });

          if (changes.length > 0) {
            try {
              const { error } = await supabase.from('changelogs').insert(changes);
              if (error) throw error;
            } catch (err) {
              console.warn('Changelog insert failed:', err);
            }
          }
        } else {
          const { data: inserted, error } = await persistWithAuditFallback('create', values);
          if (error) throw error;

          if (inserted?.id) {
            if (hasInlineTagsDraft) {
              await syncRecordTags(supabase, module.id, String(inserted.id), selectedTags);
            }
            if (module.id === 'process_templates') {
              await syncProcessTemplateStages(inserted.id, templateStagesPreview);
            }
            if (module.id === 'invoices' || module.id === 'purchase_invoices') {
              await applyInvoiceFinalizationInventory({
                supabase: supabase as any,
                moduleId: module.id,
                recordId: inserted.id,
                previousStatus: null,
                nextStatus: values?.status ?? null,
                invoiceItems: values?.invoiceItems ?? [],
                userId,
              });
              if (module.id === 'invoices') {
                await syncCustomerLevelsByInvoiceCustomers({
                  supabase: supabase as any,
                  customerIds: [values?.customer_id],
                });
              }
            }
            if (module.id === 'production_orders') {
              const postPayload: any = {};
              if (values?.grid_materials !== undefined) postPayload.grid_materials = values.grid_materials;
              if (values?.production_stages_draft !== undefined) postPayload.production_stages_draft = values.production_stages_draft;
              if (Object.keys(postPayload).length > 0) {
                const { error: postUpdateError } = await supabase.from(module.table).update(postPayload).eq('id', inserted.id);
                if (postUpdateError) throw postUpdateError;
              }
            }
            try {
              const { error } = await supabase.from('changelogs').insert([
                {
                  module_id: module.id,
                  record_id: inserted.id,
                  action: 'create',
                  user_id: userId,
                  record_title: values?.name || values?.title || values?.system_code || null,
                },
              ]);
              if (error) throw error;
            } catch (err) {
              console.warn('Changelog insert failed:', err);
            }
          }
        }

        messageApi.success('ثبت شد');
        onCancel();
      }
    } catch (err: any) {
      messageApi.error(toFaErrorMessage(err, 'ثبت اطلاعات ناموفق بود'));
    } finally {
      setLoading(false);
    }
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
    if (module.id === 'tasks' && Object.prototype.hasOwnProperty.call(changedValues || {}, 'related_to_module')) {
      const nextModuleId = String(changedValues?.related_to_module || '').trim();
      const resetPatch: Record<string, any> = { source_record_id: null, source_module_id: nextModuleId || null };
      form.setFieldsValue(resetPatch);
      setRelationOptions((prev) => ({ ...prev, source_record_id: [] }));
      if (nextModuleId) {
        void fetchTaskSourceRecordOptions(supabase, nextModuleId).then((nextOptions) => {
          setRelationOptions((prev) => ({ ...prev, source_record_id: nextOptions }));
        }).catch((error) => {
          if (!isAbortLikeError(error)) {
            console.warn('Could not load task source record options', error);
          }
        });
      }
      allValues = { ...allValues, ...resetPatch };
    }
    if (module.id === 'process_templates' && Object.prototype.hasOwnProperty.call(changedValues || {}, 'module_ids')) {
      const syncedValues = syncProcessTemplateTargetModules(allValues || {});
      form.setFieldsValue({ module_ids: syncedValues.module_ids, module_id: syncedValues.module_id });
      allValues = { ...allValues, module_ids: syncedValues.module_ids, module_id: syncedValues.module_id };
    }
    let cleanedValues = Object.fromEntries(
      Object.entries(allValues || {}).filter(([, value]) => value !== undefined)
    );
    const autoNameField = module.fields.find((field) => field.key === 'auto_name_enabled');
    if (autoNameField) {
      cleanedValues[autoNameField.key] = normalizeAutoNameEnabled(
        form.getFieldValue(autoNameField.key),
        normalizeAutoNameEnabled((formData as any)?.[autoNameField.key], false)
      );
    }
    if (module.id === 'tasks') {
      cleanedValues = normalizeTaskSourceValues(cleanedValues);
    }
    if (module.id === 'process_templates') {
      cleanedValues = syncProcessTemplateTargetModules(cleanedValues);
    }
    setFormData((prev: any) => ({ ...prev, ...cleanedValues }));
  };
  const checkVisibility = (logicOrRule: any, values?: any) => {
    if (!logicOrRule) return true;
    
    // پشتیبانی هم از آبجکت logic (که visibleIf دارد) و هم از خود قانون شرط
    const rule = logicOrRule.visibleIf || logicOrRule;
    
    // اگر قانون معتبری نبود، نمایش بده
    if (!rule || !rule.field) return true;

    const { field, operator, value } = rule;
    const resolvedValues = values || watchedValues || formData;
    const fieldValue = resolvedValues?.[field];

    // اگر فیلد مرجع هنوز مقدار نگرفته، برای شرط‌های "مخالف" آن را مخفی کن
    if (fieldValue === undefined || fieldValue === null) {
         if (operator === LogicOperator.NOT_EQUALS) return false;
    }

    switch (operator) {
      case LogicOperator.EQUALS:
        return fieldValue === value;
      case LogicOperator.NOT_EQUALS:
        return fieldValue !== value;
      case LogicOperator.CONTAINS:
        return Array.isArray(fieldValue) ? fieldValue.includes(value) : false;
      case LogicOperator.IS_TRUE:
        return fieldValue === true;
      case LogicOperator.IS_FALSE:
        return fieldValue === false;
      case LogicOperator.GREATER_THAN:
        return Number(fieldValue) > Number(value);
      case LogicOperator.LESS_THAN:
        return Number(fieldValue) < Number(value);
      default:
        return true;
    }
  };

  const canEditModule = modulePermissions.edit !== false;
  const visibleSystemFieldKeys = new Set(
    module.id === 'products'
      ? ['product_type']
      : module.id === 'tasks'
        ? ['completed_at', 'actual_start_at', 'actual_end_at', 'schedule_variance_hours']
      : []
  );
  const canViewField = (fieldKey: string) => {
    if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
      return fieldPermissions[fieldKey] !== false;
    }
    return true;
  };
  const formActionButtons = (module.actionButtons || [])
    .filter(b => b.placement === 'form')
    .filter((b) => b.id !== 'auto_name');
  const autoNameToggleField = module.fields
    .filter((f) => recordId || f.hideInCreateForm !== true)
    .filter((f) => canViewField(f.key))
    .find((f) => f.key === 'auto_name_enabled');
  const sortedBlocks = [...(module.blocks || [])]
    .filter((block) => recordId || block.hideInCreateForm !== true)
    .sort((a, b) => a.order - b.order);
  const baseHeaderFields = module.fields
      .filter(f => f.location === FieldLocation.HEADER)
      .filter((f) => recordId || f.hideInCreateForm !== true)
      .filter(f => canViewField(f.key))
      .filter(f => f.key !== 'assignee_id' && f.key !== 'assignee_type')
      .filter((f) => f.key !== 'auto_name_enabled')
      .filter(f => f.nature !== 'system' || visibleSystemFieldKeys.has(f.key)) // بعضی فیلدهای سیستمی باید در فرم قابل ویرایش باشند
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  const productTypeFieldFallback =
    module.id === 'products'
      ? module.fields.find((f) => f.key === 'product_type')
      : undefined;
  const headerFields = productTypeFieldFallback && !baseHeaderFields.some((f) => f.key === 'product_type')
    ? [...baseHeaderFields, productTypeFieldFallback].sort((a, b) => (a.order || 0) - (b.order || 0))
    : baseHeaderFields;
  const statusField = headerFields.find((f) => f.key === 'status');
  const headerFieldsWithoutStatus = headerFields.filter((f) => f.key !== 'status');
  const getResolvedOptions = (field: any, relationKey?: string) => {
    if (
      (module.id === 'process_templates' && (field.key === 'module_id' || field.key === 'module_ids'))
      || (module.id === 'process_runs' && field.key === 'module_id')
    ) {
      return getProcessTemplateModuleOptions();
    }
    if (module.id === 'tasks' && field.key === 'related_to_module') {
      return getTaskModuleOptions();
    }
    if (module.id === 'tasks' && field.key === 'status') {
      return getTaskStatusOptions(currentValues);
    }
    if (field.type === FieldType.RELATION) {
      return relationOptions[relationKey || field.key];
    }
    if (field.key === 'preferred_notification_channel') {
      return dynamicOptions[ACTIVE_NOTIFICATION_BOTS_CATEGORY] || field.options;
    }
    if (
      field.key === 'customer_interests'
      && (module.id === 'customers' || module.id === 'marketing_leads')
    ) {
      let merged = mergeSelectOptions(field.options, dynamicOptions['customer_interests']);
      CUSTOMER_INTEREST_SOURCE_CATEGORIES.forEach((category) => {
        merged = mergeSelectOptions(merged, dynamicOptions[category]);
      });
      return merged;
    }
    if (field.dynamicOptionsCategory) {
      return mergeSelectOptions(field.options, dynamicOptions[field.dynamicOptionsCategory]);
    }
    return field.options;
  };
  // محاسبه دیتا برای نمایش در لحظه (رندر)
  const currentValues = watchedValues && Object.keys(watchedValues).length > 0
    ? watchedValues
    : formData;
  const isMarketingLeadFromExistingCustomer =
    module.id === 'marketing_leads'
    && String((currentValues as any)?.lead_type || '').trim() === 'existing_customer'
    && String((currentValues as any)?.customer_id || '').trim() !== '';
  const getPreparedField = useCallback((field: any) => {
    let nextField = field;
    if (module.id === 'products' && !recordId && field?.blockId === 'sales_info') {
      nextField = { ...field, readonly: false };
    }
    if (module.id === 'tasks' && String(nextField?.key || '') === 'source_record_id') {
      const sourceModuleId = String(currentValues?.related_to_module || currentValues?.source_module_id || '').trim();
      const sourceModule = sourceModuleId ? MODULES[sourceModuleId] : null;
      const sourceLabel = sourceModule?.titles?.faSingular || sourceModule?.titles?.fa || '';
      nextField = {
        ...nextField,
        labels: {
          ...(nextField?.labels || {}),
          fa: sourceLabel ? `${sourceLabel} مرتبط` : 'رکورد مرتبط',
        },
      };
    }
    if (
      module.id === 'marketing_leads'
      && isMarketingLeadFromExistingCustomer
      && MARKETING_LEAD_LOCKED_FROM_CUSTOMER_FIELD_KEYS.has(String(nextField?.key || ''))
    ) {
      nextField = { ...nextField, readonly: true };
    }
    return nextField;
  }, [
    currentValues?.related_to_module,
    currentValues?.source_module_id,
    isMarketingLeadFromExistingCustomer,
    module.id,
    recordId,
  ]);
  const projectProcessLinkedFields = useMemo(() => {
    if (module.id !== 'projects' || !processDraftFieldKey || shouldHideProcessUiInSmartForm) return [] as Array<{
      moduleId: string;
      field: any;
      value?: string;
    }>;

    const draftStages = Array.isArray((currentValues as any)?.[processDraftFieldKey])
      ? (currentValues as any)[processDraftFieldKey]
      : [];
    const targetModuleIds = normalizeProcessTargetModuleIds(
      draftStages.flatMap((stage: any) => (
        Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : []
      )),
      ''
    );
    const linkedRecordMap = draftStages.reduce((acc: Record<string, string>, stage: any) => {
      const rawMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
        ? stage.process_link_map
        : {};
      Object.entries(rawMap).forEach(([targetModuleId, recordId]) => {
        const normalizedTargetModuleId = String(targetModuleId || '').trim();
        const normalizedRecordId = String(recordId || '').trim();
        if (normalizedTargetModuleId && normalizedRecordId && !acc[normalizedTargetModuleId]) {
          acc[normalizedTargetModuleId] = normalizedRecordId;
        }
      });
      return acc;
    }, {});

    return targetModuleIds
      .filter((targetModuleId) => !!MODULES[targetModuleId] && !PROJECT_PROCESS_HIDDEN_LINK_MODULE_IDS.has(targetModuleId))
      .map((targetModuleId) => {
        const fieldKey = createProcessLinkedFieldKey(targetModuleId, 'id');
        return {
          moduleId: targetModuleId,
          field: {
            key: fieldKey,
            labels: {
              fa: `${MODULES[targetModuleId]?.titles?.faSingular || MODULES[targetModuleId]?.titles?.fa || targetModuleId} مرتبط`,
              en: `Linked ${targetModuleId}`,
            },
            type: FieldType.RELATION,
            relationConfig: { targetModule: targetModuleId },
            nature: 'standard',
          },
          value: String((currentValues as any)?.[fieldKey] || linkedRecordMap[targetModuleId] || '').trim() || undefined,
        };
      });
  }, [currentValues, module.id, processDraftFieldKey, shouldHideProcessUiInSmartForm]);
  const currentSummaryData = getSummaryData(currentValues);
  const summaryConfigObj = module.blocks?.find(b => b.summaryConfig)?.summaryConfig;
  const isFieldRequired = (field?: any) => !isBulkEdit && field?.validation?.required === true;
  const renderInlineFieldLabel = (labelText: string, required?: boolean) => (
    <span className="inline-flex items-center gap-1">
      <span>{labelText}</span>
      {required ? <span className="text-red-500">*</span> : null}
    </span>
  );

  const getAutoNameToggleValue = (fallback = false) =>
    normalizeAutoNameEnabled(form.getFieldValue('auto_name_enabled'), fallback);

  const handleFormAction = (actionId: string) => {
    if (actionId === 'auto_name' && module.id === 'products') {
      let enableAuto = normalizeAutoNameEnabled(form.getFieldValue('auto_name_enabled'), false);
      Modal.confirm({
        title: 'نامگذاری خودکار محصول',
        content: (
          <div className="space-y-3">
            <div>نام محصول براساس مشخصات فعلی ساخته شود؟</div>
            <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
              بروزرسانی خودکار هنگام تغییر مشخصات
            </Checkbox>
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: () => {
          const currentValues = form.getFieldsValue();
          const nextName = buildAutoProductName({ ...currentValues, auto_name_enabled: enableAuto });
          if (!nextName) {
            messageApi.warning('اطلاعات کافی برای نامگذاری وجود ندارد');
            return;
          }
          form.setFieldValue('auto_name_enabled', enableAuto);
          form.setFieldValue('name', nextName);
          setFormData({ ...currentValues, name: nextName, auto_name_enabled: enableAuto });
          messageApi.success('نام محصول بروزرسانی شد');
        }
      });
      return;
    }
    if (actionId === 'auto_name' && module.id === 'customers') {
      Modal.confirm({
        title: 'نامگذاری خودکار مشتری',
        content: 'نام کامل مشتری از فیلدهای فعلی ساخته شود؟',
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: () => {
          const currentValues = getLiveFormValues();
          const enableAuto = isAutoNameEnabled(currentValues?.auto_name_enabled);
          const nextFullName = buildAutoCustomerName({ ...currentValues, auto_name_enabled: enableAuto });
          if (!nextFullName) {
            messageApi.warning('اطلاعات کافی برای نامگذاری خودکار وجود ندارد.');
            return;
          }
          form.setFieldValue('full_name', nextFullName);
          setFormData({ ...currentValues, full_name: nextFullName, auto_name_enabled: enableAuto });
          messageApi.success('نام کامل مشتری بروزرسانی شد.');
        }
      });
      return;
    }
    if (actionId === 'auto_name' && module.id === 'production_orders') {
      let enableAuto = normalizeAutoNameEnabled(form.getFieldValue('auto_name_enabled'), false);
      Modal.confirm({
        title: 'نامگذاری خودکار سفارش تولید',
        content: (
          <div className="space-y-3">
            <div>نام سفارش براساس شناسنامه تولید و رنگ ساخته شود؟</div>
            <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
              بروزرسانی خودکار هنگام تغییر مقادیر
            </Checkbox>
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: () => {
          const currentValues = form.getFieldsValue();
          const nextName = buildAutoProductionOrderName({ ...currentValues, auto_name_enabled: enableAuto });
          if (!nextName) {
            messageApi.warning('اطلاعات کافی برای نامگذاری وجود ندارد');
            return;
          }
          form.setFieldValue('auto_name_enabled', enableAuto);
          form.setFieldValue('name', nextName);
          setFormData({ ...currentValues, name: nextName, auto_name_enabled: enableAuto });
          messageApi.success('نام سفارش تولید بروزرسانی شد');
        }
      });
      return;
    }
    messageApi.info('این عملیات هنوز پیاده‌سازی نشده است');
  };
  const showAutoNameToggle = !!autoNameToggleField
    && (!autoNameToggleField.logic || checkVisibility(autoNameToggleField.logic, currentValues));

  if (!visible) return null;

  return (
    <div
      className={
        displayMode === 'modal'
          ? 'fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-3 md:p-4 backdrop-blur-sm animate-fadeIn'
          : 'w-full animate-fadeIn'
      }
      style={{ fontFamily: 'Vazirmatn, sans-serif' }}
    >
      <div
        className={
          displayMode === 'modal'
            ? `bg-white dark:bg-[#1e1e1e] w-full ${recordId ? 'max-w-5xl' : 'max-w-6xl xl:max-w-7xl'} max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden`
            : 'bg-white dark:bg-[#1e1e1e] w-full rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden'
        }
      >
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
              <span className="w-2 h-7 md:h-8 bg-leather-500 rounded-full inline-block"></span>
              {title || (recordId ? `ویرایش ${module.titles.faSingular || module.titles.fa}` : `افزودن ${module.titles.faSingular || module.titles.fa} جدید`)}
            </h2>
            {formActionButtons.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {formActionButtons.map(btn => (
                  <Button
                    key={btn.id}
                    type={btn.variant === 'primary' ? 'primary' : 'default'}
                    className={btn.variant === 'primary' ? 'bg-leather-600 hover:!bg-leather-500 border-none' : ''}
                    onClick={() => handleFormAction(btn.id)}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Button shape="circle" icon={<CloseOutlined />} onClick={onCancel} className="border-none hover:bg-red-50 hover:text-red-500" />
        </div>

        <div
          className={
            displayMode === 'modal'
              ? 'flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar scrollbar-wide'
              : 'flex-1 p-4 md:p-6'
          }
          style={{ position: 'relative', zIndex: 0 }}
        >
          {loading && !isBulkEdit ? (
            <div className="h-full flex items-center justify-center"><Spin size="large" /></div>
          ) : (
            <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange}>
              
              {((supportsAssignee && canViewField('assignee_id')) || !!statusField || showAutoNameToggle) && (
                <div className="mb-6 flex flex-col lg:flex-row lg:items-center gap-3">
                  {showAutoNameToggle && autoNameToggleField && (
                    <div className="w-full lg:flex-1 lg:max-w-[320px]">
                      <div className="smartform-inline-status h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                        <span className="text-xs text-gray-400 shrink-0">
                          {renderInlineFieldLabel(autoNameToggleField.labels?.fa || 'نامگذاری خودکار', isFieldRequired(autoNameToggleField))}
                        </span>
                        <Switch
                          checked={getAutoNameToggleValue(
                            normalizeAutoNameEnabled(
                              (currentValues as any)?.[autoNameToggleField.key],
                              false
                            )
                          )}
                          onChange={(checked) => {
                            form.setFieldValue(autoNameToggleField.key, checked);
                            setFormData((prev: any) => ({
                              ...prev,
                              [autoNameToggleField.key]: checked,
                            }));
                          }}
                          disabled={autoNameToggleField.readonly === true}
                        />
                      </div>
                    </div>
                  )}
                  {supportsAssignee && canViewField('assignee_id') && (
                    <div className="w-full lg:flex-1 lg:max-w-[320px]">
                      <div className="h-11 flex items-center justify-between sm:justify-start bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full pl-2 sm:pl-1 pr-3 py-1 gap-1 sm:gap-2">
                        <span className="text-xs text-gray-400 shrink-0">{assigneeLabel}:</span>
                        <Form.Item name="assignee_combo" noStyle>
                          <Select
                            variant="borderless"
                            placeholder="جستجو یا انتخاب مسئول / نقش"
                            className="w-full max-w-full smartform-inline-assignee-select font-semibold text-gray-700 dark:text-gray-300"
                            styles={{ popup: { root: { minWidth: 220, zIndex: 4000 } } }}
                            loading={assigneesLoading}
                            options={assigneeOptions}
                            showSearch
                            optionFilterProp="label"
                            filterOption={(input, option) =>
                              String(option?.label || '')
                                .toLowerCase()
                                .includes(String(input || '').trim().toLowerCase())
                            }
                            optionRender={(option) => (
                              <Space>
                                <span role="img" aria-label={option.data.label}>{(option.data as any).emoji}</span>
                                {option.data.label}
                              </Space>
                            )}
                            disabled={!canEditModule}
                            getPopupContainer={(node) => node.parentElement || document.body}
                            onChange={(val) => {
                              const { assignee_id, assignee_type } = parseAssigneeCombo(String(val));
                              const normalizedType = String(assignee_type || 'user');
                              form.setFieldValue('assignee_id', normalizedType === 'role' ? null : (assignee_id || null));
                              form.setFieldValue('assignee_role_id', normalizedType === 'role' && supportsRoleAssignee ? assignee_id : null);
                              if (supportsAssigneeType) {
                                form.setFieldValue('assignee_type', normalizedType);
                              }
                              setFormData((prev: any) => ({
                                ...prev,
                                assignee_combo: val,
                                assignee_id: normalizedType === 'role' ? null : (assignee_id || null),
                                assignee_role_id: normalizedType === 'role' && supportsRoleAssignee ? assignee_id : null,
                                assignee_type: supportsAssigneeType ? normalizedType : prev?.assignee_type,
                              }));
                            }}
                          />
                        </Form.Item>
                      </div>
                    </div>
                  )}
                  {statusField && (!statusField.logic || checkVisibility(statusField.logic, currentValues)) && (
                    <div className="w-full lg:flex-1 lg:max-w-[320px]">
                      <div className="smartform-inline-status h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                        <span className="text-xs text-gray-400 shrink-0">
                          {renderInlineFieldLabel('وضعیت', isFieldRequired(statusField))}
                        </span>
                        <div className="flex-1 min-w-0">
                          <SmartFieldRenderer
                            field={statusField}
                            value={(currentValues as any)?.[statusField.key]}
                            onChange={(val) => {
                              form.setFieldValue(statusField.key, val);
                              setFormData((prev: any) => ({
                                ...prev,
                                [statusField.key]: val,
                              }));
                            }}
                            forceEditMode={true}
                            compactMode={true}
                            options={getResolvedOptions(statusField)}
                            disableRequired={isBulkEdit}
                            moduleId={module.id}
                            recordId={recordId}
                            allValues={currentValues}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Header Fields */}
              {headerFieldsWithoutStatus.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 bg-gray-50 dark:bg-white/5 p-3 md:p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  {headerFieldsWithoutStatus.map(field => {
                     const preparedField = getPreparedField(field);
                     if (preparedField.logic && !checkVisibility(preparedField.logic, currentValues)) return null;
                     const options = getResolvedOptions(preparedField);
                     return (
                         <div
                           key={preparedField.key}
                           className={
                             preparedField.type === FieldType.IMAGE
                               ? 'row-span-2'
                               : preparedField.type === FieldType.SUPER_LONG_TEXT
                                 ? 'md:col-span-2 lg:col-span-4'
                                 : ''
                           }
                         >
                           <SmartFieldRenderer 
                             field={preparedField} 
                             value={(currentValues as any)?.[preparedField.key]} 
                             onChange={(val) => {
                               form.setFieldValue(preparedField.key, val);
                               setFormData((prev: any) => ({
                                 ...prev,
                                 [preparedField.key]: val,
                               }));
                             }}
                            forceEditMode={true}
                            options={options}
                            disableRequired={isBulkEdit}
                            moduleId={module.id}
                            recordId={recordId}
                            allValues={currentValues}
                          />
                        </div>
                     );
                  })}
                </div>
              )}

              {(module.id === 'production_orders' || module.id === 'production_boms') && !(!recordId && module.id === 'production_orders') && (
                <div className="mb-6 bg-white dark:bg-[#1e1e1e] p-4 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <h3 className="text-sm md:text-lg font-bold mb-4 text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
                    مراحل تولید
                  </h3>
                  <ProductionStagesField
                    recordId={recordId}
                    moduleId={module.id}
                    automationContextModuleId={null}
                    readOnly={!canEditModule}
                    compact={true}
                    orderStatus={module.id === 'production_orders' ? (currentValues as any)?.status : null}
                    draftStages={(currentValues as any)?.production_stages_draft || []}
                    onDraftStagesChange={(stages) => {
                      const next = { ...form.getFieldsValue(), production_stages_draft: stages };
                      form.setFieldValue('production_stages_draft', stages);
                      setFormData(next);
                    }}
                    showWageSummary={module.id === 'production_orders'}
                  />
                </div>
              )}

              {/* Blocks */}
              {sortedBlocks.map(block => {
                if (block.visibleIf && !checkVisibility(block.visibleIf, currentValues)) return null;
                if (canViewField(String(block.id)) === false) return null;
                if (module.id === 'products' && block.id === 'product_stock_movements') return null;
                if (module.id === 'products' && block.id === 'product_inventory' && !!recordId) return null;
                if (module.id === 'shelves' && block.id === 'shelf_stock_movements') return null;
                if (module.id === 'tasks' && block.id === 'task_shelf_stock_movements') return null;

                if (module.id === 'production_orders' && !recordId && block.type === BlockType.GRID_TABLE) {
                  return null;
                }

                if (block.type === BlockType.FIELD_GROUP || block.type === BlockType.DEFAULT) {
                  const blockFields = module.fields
                    .filter(f => f.blockId === block.id)
                    .filter((f) => recordId || f.hideInCreateForm !== true)
                    .filter((f) => !(!recordId && module.id === 'process_templates' && f.key === 'template_stages_preview'))
                    .filter((f) => !(
                      shouldHideProcessUiInSmartForm
                      && (f.key === 'process_template_id' || f.key === processDraftFieldKey)
                    ))
                    .filter((f) => {
                      if (f.key === processPreviewFieldKey) return true;
                      if (f.nature !== 'system') return true;
                      if (visibleSystemFieldKeys.has(f.key)) return true;
                      return module.id === 'products' && !recordId && block.id === 'sales_info';
                    })
                    .filter((f) => !(module.id === 'marketing_leads'
                      || module.id === 'customers'
                      || module.id === 'invoices'
                      || module.id === 'purchase_invoices') || f.key !== 'process_template_id')
                    .filter(f => canViewField(f.key))
                    .filter((f) => !(module.id === 'tasks' && isTaskLegacySourceField(f.key)))
                    .filter(f => f.key !== 'assignee_id' && f.key !== 'assignee_type')
                    .filter((f) => f.key !== 'auto_name_enabled')
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                  if (blockFields.length === 0) {
                    return null;
                  }

                  return (
                    <div key={block.id} className="mb-6 animate-slideUp">
                      <Divider orientation="right" className="!border-leather-200 !text-leather-600 !font-bold !text-sm !text-right">
                        {block.icon && <i className={`ml-2 ${block.icon}`}></i>}
                        {block.titles.fa}
                      </Divider>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {blockFields.map(field => {
                            const preparedField = getPreparedField(field);
                            if (preparedField.logic && !checkVisibility(preparedField.logic, currentValues)) return null;
                             let fieldValue = (currentValues as any)?.[preparedField.key];
                            let isReadOnly = false;
                            // فیلدهای خلاصه اگر محاسبه شده باشند
                            if (currentSummaryData && summaryConfigObj?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS) {
                            }
                            const options = getResolvedOptions(preparedField);
                            return (
                              <div
                                key={preparedField.key}
                                className={(preparedField.key === 'execution_process_draft' ||
                                  preparedField.key === 'marketing_process_draft' ||
                                  preparedField.key === 'template_stages_preview' ||
                                  preparedField.key === 'run_stages_preview' ||
                                  preparedField.type === FieldType.SUPER_LONG_TEXT)
                                  ? 'md:col-span-2 lg:col-span-3'
                                  : ''}
                              >
                                 <SmartFieldRenderer 
                                  field={preparedField}
                                  value={fieldValue}
                                  recordId={recordId}
                                  onChange={(val) => {
                                    if (!isReadOnly) {
                                      form.setFieldValue(preparedField.key, val);
                                      setFormData((prev: any) => ({
                                        ...prev,
                                        [preparedField.key]: val,
                                      }));
                                    }
                                 }}
                                  forceEditMode={true} options={options}
                                  disableRequired={isBulkEdit}
                                  onOptionsUpdate={loadDynamicOptions}
                                  moduleId={module.id}
                                  allValues={currentValues}
                                />
                             </div>
                           );
                         })}
                      </div>
                      {!shouldHideProcessUiInSmartForm && module.id === 'projects' && block.id === 'process' && projectProcessLinkedFields.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.45)] p-4">
                          <div className="mb-3 text-sm font-semibold text-[rgba(var(--brand-800-rgb),1)]">رکوردهای مرتبط فرآیند</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projectProcessLinkedFields.map(({ moduleId: targetModuleId, field, value }) => (
                              <div key={field.key}>
                                <SmartFieldRenderer
                                  field={field}
                                  value={value}
                                  forceEditMode={true}
                                  options={relationOptions[field.key]}
                                  onChange={(val) => {
                                    const nextValue = val ? String(val) : null;
                                    const currentDraftStages = processDraftFieldKey && Array.isArray(form.getFieldValue(processDraftFieldKey))
                                      ? form.getFieldValue(processDraftFieldKey)
                                      : [];
                                    const nextDraftStages = processDraftFieldKey
                                      ? currentDraftStages.map((stage: any) => {
                                          const nextProcessLinkMap = stage?.process_link_map && typeof stage.process_link_map === 'object'
                                            ? { ...stage.process_link_map }
                                            : {};
                                          if (nextValue) {
                                            nextProcessLinkMap[targetModuleId] = nextValue;
                                          } else {
                                            delete nextProcessLinkMap[targetModuleId];
                                          }
                                          return {
                                            ...stage,
                                            process_link_map: nextProcessLinkMap,
                                          };
                                        })
                                      : currentDraftStages;
                                    const patch: Record<string, any> = {
                                      [field.key]: nextValue,
                                    };
                                    if (processDraftFieldKey) {
                                      patch[processDraftFieldKey] = nextDraftStages;
                                    }
                                    form.setFieldsValue(patch);
                                    setFormData((prev: any) => ({ ...prev, ...patch }));
                                  }}
                                  onOptionsUpdate={loadDynamicOptions}
                                  moduleId={module.id}
                                  allValues={currentValues}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {block.tableColumns && (
                        <div className="mt-6">
                          {module.id === 'products' && block.id === 'product_inventory' ? (
                            <SmartTableRenderer
                              moduleConfig={{
                                id: `${module.id}_${block.id}_readonly`,
                                fields: (block.tableColumns || []).map((col: any, idx: number) => ({
                                  key: col.key,
                                  labels: { fa: col.title, en: col.key },
                                  type: col.type,
                                  options: col.options,
                                  relationConfig: col.relationConfig,
                                  dynamicOptionsCategory: col.dynamicOptionsCategory,
                                  isTableColumn: true,
                                  order: idx + 1,
                                })),
                              } as any}
                              data={(Array.isArray(formData[block.id]) ? formData[block.id] : []).map((row: any, idx: number) => ({
                                id: row?.id || row?.key || `${block.id}_${idx}`,
                                ...row,
                              }))}
                              loading={false}
                              relationOptions={relationOptions}
                              dynamicOptions={dynamicOptions}
                              pagination={false}
                              disableScroll={false}
                              tableLayout="auto"
                            />
                          ) : (
                            <Form.Item name={block.id} noStyle>
                              <EditableTable
                                block={block}
                                initialData={formData[block.id] || []}
                                mode="local"
                                moduleId={module.id}
                                relationOptions={relationOptions}
                                dynamicOptions={dynamicOptions}
                                canEditModule={canEditModule}
                                canViewField={(fieldKey) =>
                                  canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                                }
                                readOnly={module.id === 'products' && block.id === 'product_inventory' && !!recordId}
                                onChange={(newData: any[]) => {
                                  const newFormData = { ...formData, [block.id]: newData };
                                  setFormData(newFormData);
                                  form.setFieldValue(block.id, newData);
                                }}
                              />
                            </Form.Item>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === BlockType.GRID_TABLE) {
                  return (
                    <div key={block.id} className="mb-6 p-1 border border-dashed border-gray-300 rounded-3xl">
                      <Form.Item name={block.id} noStyle>
                        <GridTable
                          block={block}
                          initialData={formData[block.id] || []}
                          mode="local"
                          moduleId={module.id}
                          relationOptions={relationOptions}
                          dynamicOptions={dynamicOptions}
                          canEditModule={canEditModule}
                          canViewField={(fieldKey) =>
                            canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                          }
                          onChange={(newData: any[]) => {
                            const newFormData = { ...formData, [block.id]: newData };
                            setFormData(newFormData);
                            form.setFieldValue(block.id, newData);
                          }}
                        />
                      </Form.Item>
                    </div>
                  );
                }

                if (block.type === BlockType.TABLE) {
                      return (
                        <div key={block.id} className="mb-6 p-1 border border-dashed border-gray-300 rounded-3xl">
                            <Form.Item name={block.id} noStyle>
                                <EditableTable
                                    block={block}
                                    initialData={formData[block.id] || []}
                                    mode="local"
                                    moduleId={module.id}
                                    relationOptions={relationOptions}
                                    dynamicOptions={dynamicOptions}
                                  canEditModule={canEditModule}
                                  canViewField={(fieldKey) =>
                                    canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                                  }
                                    onChange={(newData: any[]) => {
                                        const newFormData = { ...formData, [block.id]: newData };
                                        setFormData(newFormData);
                                        form.setFieldValue(block.id, newData);
                                    }}
                                />
                            </Form.Item>
                        </div>
                      );
                  }

                return null;
              })}

              {/* --- نمایش فوتر هوشمند --- */}
              {currentSummaryData && summaryConfigObj?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS && (
                  <SummaryCard 
                    type={summaryConfigObj?.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
                    data={currentSummaryData} 
                    onRefresh={() => setFormData((prev: Record<string, any>) => ({ ...(prev || {}) }))}
                  />
              )}
            </Form>
          )}
        </div>

        <div className="p-3 md:p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex justify-end gap-2">
          <Button size="middle" onClick={onCancel} className="rounded-xl">انصراف</Button>
          <Button size="middle" type="primary" onClick={() => form.submit()} loading={loading} disabled={!canEditModule} icon={<SaveOutlined />} className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/20">
            {recordId ? 'ذخیره تغییرات' : 'ثبت نهایی'}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default SmartForm;




