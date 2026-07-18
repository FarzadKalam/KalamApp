import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Spin,
  Tag,
} from 'antd';
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { FieldLocation, FieldNature, FieldType, LogicOperator, ModuleField } from '../types';
import PersianDatePicker from '../components/PersianDatePicker';
import ChequePreviewCard from '../components/accounting/ChequePreviewCard';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import SmartFieldRenderer from '../components/SmartFieldRenderer';
import AdaptiveSelectField from '../components/AdaptiveSelectField';
import AdaptiveIdentityPicker from '../components/AdaptiveIdentityPicker';
import RecordImageBox from '../components/RecordImageBox';
import TagInput from '../components/TagInput';
import { supabase } from '../supabaseClient';
import { canUseRecordLockPermission, fetchCurrentUserRoleContext, type PermissionMap } from '../utils/permissions';
import { isAccountingMinimalModule } from '../utils/accountingModules';
import { runWorkflowsForEvent } from '../utils/workflowRuntime';
import {
  formatNumericForInput,
  normalizeNumericString,
  parseNumericInput,
  preventNonNumericKeyDown,
  preventNonNumericPaste,
} from '../utils/persianNumericInput';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { isRecycleBinEnabledModule, moveModuleRecordsToRecycleBin } from '../utils/recycleBin';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { normalizeModuleFormValues, transformModulePayloadForSave, validateModuleFormValues } from '../utils/moduleFormRuntime';
import { resolveSelectPopupContainer } from '../utils/popupContainer';
import { CASH_BANK_LEGACY_ACCOUNT_KEYS } from '../utils/cashBankLegacyAccountKeys';
import { buildResolvedAssigneeCombo, parseAssigneeValue } from '../utils/assigneeValue';
import { supportsModuleRoleAssignee } from '../utils/assigneeSupport';
import RecordLockControl from '../components/recordLocks/RecordLockControl';
import {
  fetchRecordLockState,
  getRecordLockStateFromRecord,
  mergeRecordLockIntoRecord,
  type RecordLockState,
} from '../utils/recordLockRuntime';

const sortByOrder = (a: ModuleField, b: ModuleField) => (a.order || 0) - (b.order || 0);
type FieldOption = { value: string; label: string; color?: string; module?: string };

const isNumericField = (fieldType: FieldType) =>
  fieldType === FieldType.NUMBER ||
  fieldType === FieldType.PRICE ||
  fieldType === FieldType.PERCENTAGE ||
  fieldType === FieldType.PERCENTAGE_OR_AMOUNT ||
  fieldType === FieldType.STOCK;

const CHEQUE_INLINE_FIELD_KEYS = new Set<string>([
  'issue_date',
  'serial_no',
  'sayad_id',
  'bank_name',
  'branch_name',
  'branch_code',
  'amount',
  'payee_name',
  'payee_identifier',
  'account_holder_name',
]);
const CHEQUE_DEFERRED_FIELD_KEYS = new Set<string>(['notes']);
const ACCOUNTING_HERO_EXCLUDED_FIELD_KEYS = new Set<string>(['tags']);
const CASH_BANK_NON_TRANSFER_FIELD_KEYS = new Set<string>([
  'bank_account_id',
  'cash_box_id',
  'sales_invoice_id',
  'purchase_invoice_id',
  'expense_document_id',
  'employee_advance_id',
  'payroll_slip_id',
  'customer_id',
  'supplier_id',
  'cheque_id',
  'barter_id',
]);

const checkFieldVisibility = (logicOrRule: any, values: Record<string, any>) => {
  if (!logicOrRule) return true;
  const rule = logicOrRule.visibleIf || logicOrRule;
  if (!rule || typeof rule !== 'object') return true;

  const field = String(rule.field || '').trim();
  const operator = rule.operator;
  const value = rule.value;
  const currentValue = values?.[field];

  if (currentValue === undefined || currentValue === null || currentValue === '') {
    return operator === LogicOperator.NOT_EQUALS;
  }

  if (operator === LogicOperator.EQUALS) return currentValue === value;
  if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
  if (operator === LogicOperator.CONTAINS) return Array.isArray(currentValue) ? currentValue.includes(value) : false;
  if (operator === LogicOperator.GREATER_THAN) return Number(currentValue) > Number(value);
  if (operator === LogicOperator.LESS_THAN) return Number(currentValue) < Number(value);
  if (operator === LogicOperator.IS_TRUE) return Boolean(currentValue) === true;
  if (operator === LogicOperator.IS_FALSE) return Boolean(currentValue) === false;
  return true;
};

const AccountingRecordPage: React.FC = () => {
  const { moduleId, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const isChequeModule = moduleId === 'cheques';
  const isCreate = location.pathname.endsWith('/create');
  const isEditMode = isCreate || location.pathname.endsWith('/edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [canDelete, setCanDelete] = useState(true);
  const [currentPermissionMap, setCurrentPermissionMap] = useState<PermissionMap | null>(null);
  const [currentSoftwareRole, setCurrentSoftwareRole] = useState<string | null>(null);
  const [fieldPerms, setFieldPerms] = useState<Record<string, boolean>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, FieldOption[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, FieldOption[]>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [currentTags, setCurrentTags] = useState<any[]>([]);
  const [chequeBankOptions, setChequeBankOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [chequeBankMetaById, setChequeBankMetaById] = useState<
    Record<
      string,
      {
        bank_name: string | null;
        branch_name: string | null;
        account_holder_name: string | null;
        account_number: string | null;
      }
    >
  >({});
  const recordLockState = useMemo(() => getRecordLockStateFromRecord(record || formData), [formData, record]);
  const isRecordLocked = recordLockState.isLocked;
  const canLockCurrentRecord = canUseRecordLockPermission(currentPermissionMap, moduleId, 'lock', currentSoftwareRole);
  const canUnlockCurrentRecord = canUseRecordLockPermission(currentPermissionMap, moduleId, 'unlock', currentSoftwareRole);
  const effectiveCanEdit = canEdit && !isRecordLocked;
  const effectiveCanDelete = canDelete && !isRecordLocked;
  const handleRecordLockChanged = useCallback((nextLockState: RecordLockState) => {
    setRecord((prev) => prev ? mergeRecordLockIntoRecord(prev, nextLockState) : prev);
    setFormData((prev) => mergeRecordLockIntoRecord(prev || {}, nextLockState));
  }, []);

  const visibleFields = useMemo(() => {
    if (!moduleConfig) return [] as ModuleField[];
    const currentValues = formData || {};
    return (moduleConfig.fields || [])
      .filter((f) => fieldPerms[f.key] !== false)
      .filter((f) => !ACCOUNTING_HERO_EXCLUDED_FIELD_KEYS.has(f.key))
      .filter((f) => !f.logic || checkFieldVisibility(f.logic, currentValues))
      .filter((f) => {
        if (moduleId === 'cash_bank_operations') {
          const operationType = String(formData?.operation_type || '').trim();
          const paymentType = String(formData?.payment_type || '').trim();
          if (f.key === 'cheque_id') return paymentType === 'cheque' && operationType !== 'transfer';
          if (f.key === 'barter_id') return paymentType === 'barter' && operationType !== 'transfer';
          if (CASH_BANK_LEGACY_ACCOUNT_KEYS.has(f.key)) return false;
          if (operationType === 'transfer' && CASH_BANK_NON_TRANSFER_FIELD_KEYS.has(f.key)) return false;
        }
        return true;
      })
      .sort(sortByOrder);
  }, [moduleConfig, fieldPerms, formData, formData?.payment_type, moduleId]);

  const chequeInlineFields = useMemo(() => {
    if (!isChequeModule) return [] as ModuleField[];
    return visibleFields.filter((field) => CHEQUE_INLINE_FIELD_KEYS.has(field.key));
  }, [isChequeModule, visibleFields]);

  useEffect(() => {
    if (moduleId !== 'cash_bank_operations') return;
    const operationType = String(formData?.operation_type || '').trim();
    const paymentType = String(formData?.payment_type || '').trim();
    const patch: Record<string, any> = {};
    if (paymentType !== 'cheque' && formData?.cheque_id) patch.cheque_id = null;
    if (paymentType !== 'barter' && formData?.barter_id) patch.barter_id = null;
    if (operationType === 'transfer') {
      [
        'bank_account_id',
        'cash_box_id',
        'petty_fund_id',
        'sales_invoice_id',
        'purchase_invoice_id',
        'expense_document_id',
        'employee_advance_id',
        'payroll_slip_id',
        'customer_id',
        'supplier_id',
        'cheque_id',
        'barter_id',
      ].forEach((key) => {
        if (formData?.[key]) patch[key] = null;
      });
    } else {
      const staleKeys = [
        'bank_account_id',
        'cash_box_id',
        'petty_fund_id',
        ...(operationType === 'receipt'
          ? ['payment_bank_account_id', 'payment_cash_box_id', 'payment_petty_fund_id', 'payment_account_id']
          : []),
        ...(operationType === 'payment'
          ? ['receipt_bank_account_id', 'receipt_cash_box_id', 'receipt_petty_fund_id', 'receipt_account_id']
          : []),
      ];
      staleKeys.forEach((key) => {
        if (formData?.[key]) patch[key] = null;
      });
    }
    if (!Object.keys(patch).length) return;
    setFormData((prev) => ({ ...prev, ...patch }));
    form.setFieldsValue(patch);
  }, [form, formData, formData?.barter_id, formData?.cheque_id, formData?.operation_type, formData?.payment_type, moduleId]);

  const standardFields = useMemo(() => {
    if (!isChequeModule) return visibleFields;
    return visibleFields.filter(
      (field) => !CHEQUE_INLINE_FIELD_KEYS.has(field.key) && !CHEQUE_DEFERRED_FIELD_KEYS.has(field.key)
    );
  }, [isChequeModule, visibleFields]);

  const chequeNotesField = useMemo(() => {
    if (!isChequeModule) return null;
    return visibleFields.find((field) => field.key === 'notes') || null;
  }, [isChequeModule, visibleFields]);

  const imageField = useMemo(
    () => standardFields.find((field) => field.type === FieldType.IMAGE) || null,
    [standardFields]
  );

  const statusField = useMemo(
    () => standardFields.find((field) => field.key === 'status') || null,
    [standardFields]
  );

  const assigneeField = useMemo(
    () => standardFields.find((field) => field.key === 'employee_id' || field.key === 'assignee_id') || null,
    [standardFields]
  );

  const headerSpecialFieldKeys = useMemo(() => {
    return new Set(
      [imageField?.key, statusField?.key, assigneeField?.key, 'tags']
        .map((key) => String(key || '').trim())
        .filter(Boolean)
    );
  }, [assigneeField?.key, imageField?.key, statusField?.key]);

  const headerFields = useMemo(
    () => standardFields.filter((field) => field.location === FieldLocation.HEADER && !headerSpecialFieldKeys.has(field.key)),
    [headerSpecialFieldKeys, standardFields]
  );

  const fieldsByBlock = useMemo(() => {
    const map = new Map<string, ModuleField[]>();
    standardFields.forEach((field) => {
      if (headerSpecialFieldKeys.has(field.key)) return;
      if (!field.blockId) return;
      if (!map.has(field.blockId)) map.set(field.blockId, []);
      map.get(field.blockId)!.push(field);
    });
    map.forEach((items) => items.sort(sortByOrder));
    return map;
  }, [headerSpecialFieldKeys, standardFields]);

  const looseFields = useMemo(
    () =>
      standardFields.filter(
        (field) => field.location !== FieldLocation.HEADER && !field.blockId && !headerSpecialFieldKeys.has(field.key)
      ),
    [headerSpecialFieldKeys, standardFields]
  );

  const getFieldOptions = useCallback(
    (field: ModuleField) => {
      if (field.type === FieldType.RELATION) {
        return relationOptions[field.key] || [];
      }
      if ((field as any).dynamicOptionsCategory) {
        return dynamicOptions[(field as any).dynamicOptionsCategory] || [];
      }
      return (field.options || []) as FieldOption[];
    },
    [dynamicOptions, relationOptions]
  );

  const getUserName = useCallback(
    (uid?: string | null) => {
      if (!uid) return '-';
      return userNames[uid] || uid;
    },
    [userNames]
  );

  const currentRecordValues = isEditMode ? formData : (record || {});

  const assigneeFieldOptions = useMemo(() => {
    if (!assigneeField) return [] as FieldOption[];
    return getFieldOptions(assigneeField);
  }, [assigneeField, getFieldOptions]);
  const usesCentralAssignee = assigneeField?.key === 'assignee_id';
  const supportsRoleAssignee = supportsModuleRoleAssignee(moduleConfig);

  const statusFieldOptions = useMemo(() => {
    if (!statusField) return [] as FieldOption[];
    return getFieldOptions(statusField);
  }, [getFieldOptions, statusField]);

  const handleHeaderImageChange = useCallback((url: string | null) => {
    if (!imageField) return;
    const patch = { [imageField.key]: url };
    setFormData((prev) => ({ ...prev, ...patch }));
    setRecord((prev) => (prev ? { ...prev, ...patch } : prev));
    form.setFieldsValue(patch);
  }, [form, imageField]);

  const renderDateTime = useCallback((value?: string | null) => {
    if (!value) return '-';
    const formatted = safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    return formatted ? toPersianNumber(formatted) : '-';
  }, []);

  const handleChequeInlineFieldChange = useCallback(
    (fieldKey: string, value: any) => {
      const patch: Record<string, any> = { [fieldKey]: value };

      if (fieldKey === 'bank_account_id') {
        const key = String(value || '').trim();
        if (!key) {
          patch.bank_account_id = null;
        } else {
          const bankMeta = chequeBankMetaById[key];
          if (bankMeta) {
            patch.bank_account_id = key;
            patch.bank_name = bankMeta.bank_name || null;
            patch.branch_name = bankMeta.branch_name || null;
            patch.account_holder_name = bankMeta.account_holder_name || null;
          }
        }
      }

      if (fieldKey === 'cheque_type' && value !== 'issued') {
        patch.bank_account_id = null;
      }

      setFormData((prev) => ({ ...prev, ...patch }));
      form.setFieldsValue(patch);
    },
    [chequeBankMetaById, form]
  );

  const fetchSuggestedCode = useCallback(async (nextModuleId: string, values: Record<string, any>) => {
    if (['bank_accounts', 'cash_boxes', 'petty_funds'].includes(nextModuleId)) {
      const accountId = String(values.account_id || '').trim();
      if (!accountId) return null;
      const [{ data: accountRow, error: accountError }, { data: existingRows, error: existingError }] = await Promise.all([
        supabase
          .from('chart_of_accounts')
          .select('code')
          .eq('id', accountId)
          .maybeSingle(),
        supabase
          .from(nextModuleId)
          .select('code')
          .eq('account_id', accountId),
      ]);
      if (accountError) throw accountError;
      if (existingError) throw existingError;

      const parentCode = String(accountRow?.code || '').trim();
      if (!parentCode) return null;

      let maxSuffix = 0;
      (existingRows || []).forEach((row: any) => {
        const code = String(row?.code || '').trim();
        if (!code.startsWith(parentCode) || code.length <= parentCode.length) return;
        const suffix = code.slice(parentCode.length);
        if (!/^\d+$/.test(suffix)) return;
        maxSuffix = Math.max(maxSuffix, Number(suffix));
      });
      return `${parentCode}${maxSuffix + 1}`;
    }

    if (nextModuleId === 'chart_of_accounts') {
      const parentId = String(values.parent_id || '').trim();
      if (!parentId) return null;

      const [{ data: parentRow, error: parentError }, { data: siblings, error: siblingsError }] = await Promise.all([
        supabase.from('chart_of_accounts').select('code').eq('id', parentId).maybeSingle(),
        supabase.from('chart_of_accounts').select('code').eq('parent_id', parentId),
      ]);
      if (parentError) throw parentError;
      if (siblingsError) throw siblingsError;

      const parentCode = String(parentRow?.code || '').trim();
      if (!parentCode) return null;

      let maxSuffix = 0;
      (siblings || []).forEach((row: any) => {
        const code = String(row?.code || '').trim();
        if (!code.startsWith(parentCode) || code.length <= parentCode.length) return;
        const suffix = code.slice(parentCode.length);
        if (!/^\d+$/.test(suffix)) return;
        maxSuffix = Math.max(maxSuffix, Number(suffix));
      });
      return `${parentCode}${maxSuffix + 1}`;
    }

    return null;
  }, []);

  const applySuggestedCodeIfNeeded = useCallback(async (
    nextValues: Record<string, any>,
    options?: { force?: boolean }
  ) => {
    if (!moduleId || !isCreate) return;
    if (!['bank_accounts', 'cash_boxes', 'petty_funds', 'chart_of_accounts'].includes(moduleId)) return;

    const currentCode = String(nextValues.code || '').trim();
    if (currentCode && !options?.force) return;

    const suggestedCode = await fetchSuggestedCode(moduleId, nextValues);
    if (!suggestedCode) return;

    const patch = { code: suggestedCode };
    setFormData((prev) => ({ ...prev, ...patch }));
    form.setFieldsValue(patch);
  }, [fetchSuggestedCode, form, isCreate, moduleId]);

  const loadRelationOptions = useCallback(async () => {
    if (!moduleConfig) return {};
    const relationFields = (moduleConfig.fields || []).filter(
      (field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule
    );

    const pairs = await Promise.all(
      relationFields.map(async (field) => {
        try {
          const options = await fetchRelationOptionsForField(supabase, field, {
            allValues: form.getFieldsValue(true),
            limit: 500,
          });
          const filtered = String(field.relationConfig?.targetModule || '') === moduleId && id
            ? options.filter((option: any) => String(option.value) !== String(id))
            : options;
          return [field.key, filtered.map((option: any) => ({
            value: String(option.value),
            label: String(option.label || option.value),
            module: option?.module ? String(option.module) : undefined,
          }))] as const;
        } catch {
          return [field.key, []] as const;
        }
      })
    );

    return pairs.reduce<Record<string, FieldOption[]>>((acc, [key, value]) => {
      acc[key] = [...value];
      return acc;
    }, {});
  }, [id, moduleConfig, moduleId]);

  const loadDynamicOptions = useCallback(async () => {
    if (!moduleConfig) return {};
    const categories = Array.from(
      new Set(
        (moduleConfig.fields || [])
          .map((field: any) => field.dynamicOptionsCategory as string | undefined)
          .filter(Boolean)
      )
    ) as string[];

    if (!categories.length) return {};
    const pairs = await Promise.all(
      categories.map(async (category) => {
        const { data } = await supabase
          .from('dynamic_options')
          .select('label,value')
          .eq('category', category)
          .eq('is_active', true);
        return [category, (data || []) as Array<{ value: string; label: string }>] as const;
      })
    );

    return pairs.reduce<Record<string, FieldOption[]>>((acc, [key, value]) => {
      acc[key] = [...value];
      return acc;
    }, {});
  }, [moduleConfig]);

  const load = useCallback(async () => {
    if (!moduleId || !moduleConfig || !isAccountingMinimalModule(moduleId)) return;

    setLoading(true);
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      const permissions = context.permissions || {};
      setCurrentPermissionMap(permissions);
      setCurrentSoftwareRole(context.softwareRole || null);
      const modulePerms = permissions?.[moduleId] || {};
      setCanView(modulePerms.view !== false);
      setCanEdit(modulePerms.edit !== false);
      setCanDelete(modulePerms.delete !== false);
      setFieldPerms(modulePerms.fields || {});

      if (modulePerms.view === false) {
        setRecord(null);
        setFormData({});
        return;
      }

      const [relOpts, dynOpts, bankAccountsRes] = await Promise.all([
        loadRelationOptions(),
        loadDynamicOptions(),
        isChequeModule
          ? supabase
              .from('bank_accounts')
              .select('id, bank_name, branch_name, account_holder_name, account_number')
              .eq('is_active', true)
              .limit(500)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      setRelationOptions(relOpts);
      setDynamicOptions(dynOpts);

      if (isChequeModule) {
        const rows = ((bankAccountsRes as any)?.data || []) as Array<Record<string, any>>;
        const options = rows.map((row) => {
          const bank = String(row.bank_name || '').trim();
          const accountNo = String(row.account_number || '').trim();
          const branch = String(row.branch_name || '').trim();
          const accountText = accountNo ? `(${toPersianNumber(accountNo)})` : '';
          const branchText = branch ? ` - ${branch}` : '';
          return {
            value: String(row.id),
            label: `${bank || 'بانک'} ${accountText}${branchText}`.trim(),
          };
        });
        const meta = rows.reduce<
          Record<string, { bank_name: string | null; branch_name: string | null; account_holder_name: string | null; account_number: string | null }>
        >((acc, row) => {
          const key = String(row.id || '').trim();
          if (!key) return acc;
          acc[key] = {
            bank_name: row.bank_name ? String(row.bank_name) : null,
            branch_name: row.branch_name ? String(row.branch_name) : null,
            account_holder_name: row.account_holder_name ? String(row.account_holder_name) : null,
            account_number: row.account_number ? String(row.account_number) : null,
          };
          return acc;
        }, {});
        setChequeBankOptions(options);
        setChequeBankMetaById(meta);
      } else {
        setChequeBankOptions([]);
        setChequeBankMetaById({});
      }

      if (isCreate) {
        const initialValues = ((location.state as any)?.initialValues || {}) as Record<string, any>;
        const normalizedInitialValues = isChequeModule
          ? { ...initialValues, due_date: initialValues.issue_date || initialValues.due_date || null }
          : initialValues;
        const createInitialValues = { ...normalizedInitialValues };
        if (!String(createInitialValues.code || '').trim()) {
          try {
            const suggestedCode = await fetchSuggestedCode(String(moduleId || ''), createInitialValues);
            if (suggestedCode) {
              createInitialValues.code = suggestedCode;
            }
          } catch {
            // Ignore suggestion errors and keep the form usable.
          }
        }
        setRecord(null);
        setFormData(createInitialValues);
        setCurrentTags(Array.isArray(createInitialValues.tags) ? createInitialValues.tags : []);
        form.setFieldsValue(createInitialValues);
        return;
      }

      if (!id) return;

      const { data, error } = await supabase.from(moduleConfig.table).select('*').eq('id', id).single();
      if (error) throw error;
      const row = (data || {}) as Record<string, any>;
      const normalizedRow = isChequeModule
        ? { ...row, due_date: row.issue_date || row.due_date || null }
        : moduleId === 'cash_bank_operations'
          ? normalizeModuleFormValues(moduleId, row)
          : row;
      const lockState = await fetchRecordLockState(moduleId, id);
      const lockedRow = mergeRecordLockIntoRecord(normalizedRow, lockState);
      setRecord(lockedRow);
      setFormData(lockedRow);
      form.setFieldsValue(lockedRow);

      const userIds = Array.from(
        new Set(
          [row.created_by, row.updated_by, row.employee_id, row.assignee_id]
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        )
      );

      if (userIds.length > 0) {
        const { data: users } = await supabase.from('profiles').select('id,full_name').in('id', userIds);
        const userMap = (users || []).reduce<Record<string, string>>((acc, user: any) => {
          acc[String(user.id)] = String(user.full_name || user.id);
          return acc;
        }, {});
        setUserNames(userMap);
      } else {
        setUserNames({});
      }

      if (id) {
        const { data: tagsData } = await supabase
          .from('record_tags')
          .select('tags(id, title, color)')
          .eq('record_id', id);
        setCurrentTags(tagsData?.map((item: any) => item.tags).filter(Boolean) || []);
      }
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت اطلاعات'));
    } finally {
      setLoading(false);
    }
  }, [fetchSuggestedCode, form, id, isChequeModule, loadDynamicOptions, loadRelationOptions, location.state, message, moduleConfig, moduleId, isCreate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!moduleConfig) return;
    const title = isCreate
      ? `ایجاد ${moduleConfig.titles.fa}`
      : record
        ? String(
            record?.title ||
              record?.name ||
              record?.code ||
            record?.event_key ||
            record?.account_number ||
            record?.sayad_id ||
            record?.id ||
            moduleConfig.titles.fa
          )
        : moduleConfig.titles.fa;

    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: moduleConfig.titles.fa, moduleId: moduleConfig.id, recordName: title },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [isCreate, moduleConfig, record]);

  const renderReadValue = useCallback(
    (field: ModuleField, value: any) => {
      if (value === null || value === undefined || value === '') return '-';

      if (field.type === FieldType.CHECKBOX) {
        return value ? <Tag color="green">بله</Tag> : <Tag color="red">خیر</Tag>;
      }

      if (field.type === FieldType.STATUS || field.type === FieldType.SELECT) {
        const option = getFieldOptions(field).find((o: any) => String(o.value) === String(value));
        const label = option?.label || String(value);
        if (field.type === FieldType.STATUS && option?.color) {
          return <Tag color={option.color}>{label}</Tag>;
        }
        return label;
      }

      if (field.type === FieldType.RELATION) {
        const option = getFieldOptions(field).find((o: any) => String(o.value) === String(value));
        return option?.label || String(value);
      }

      if (field.type === FieldType.IMAGE || field.type === FieldType.LINK) {
        return (
          <SmartFieldRenderer
            field={field}
            value={value}
            onChange={() => undefined}
            forceEditMode={false}
            options={getFieldOptions(field)}
            moduleId={moduleId}
            recordId={id}
            allValues={record || {}}
          />
        );
      }

      if (field.type === FieldType.DATE) {
        return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || '-');
      }

      if (field.type === FieldType.DATETIME) {
        return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-');
      }

      if (field.type === FieldType.TIME) {
        return toPersianNumber(String(value || '-'));
      }

      if (isNumericField(field.type as FieldType)) {
        return <span className="persian-number">{formatPersianPrice(value)}</span>;
      }

      return toPersianNumber(String(value));
    },
    [getFieldOptions, id, moduleId, record]
  );

  const renderHeaderStatusField = useCallback(() => {
    if (!statusField) return null;
    if (isEditMode) {
      return (
        <AdaptiveSelectField
          variant="borderless"
          value={currentRecordValues?.[statusField.key]}
          onChange={(value) => {
            const patch = { [statusField.key]: value };
            setFormData((prev) => ({ ...prev, ...patch }));
            form.setFieldsValue(patch);
          }}
          options={statusFieldOptions}
          className="min-w-[140px] font-semibold text-gray-700 dark:text-gray-300"
          disabled={!canEdit}
          getPopupContainer={resolveSelectPopupContainer}
        />
      );
    }
    return renderReadValue(statusField, record?.[statusField.key]);
  }, [canEdit, currentRecordValues, form, isEditMode, record, renderReadValue, statusField, statusFieldOptions]);

  const renderHeaderAssigneeField = useCallback(() => {
    if (!assigneeField) return null;
    if (usesCentralAssignee) {
      const currentValue = buildResolvedAssigneeCombo(currentRecordValues);
      return (
        <AdaptiveIdentityPicker
          variant="borderless"
          value={currentValue}
          onChange={(value) => {
            const parsed = parseAssigneeValue(value, 'user');
            const patch = {
              assignee_id: parsed.assigneeType === 'user' ? parsed.assigneeId : null,
              assignee_role_id: parsed.assigneeType === 'role' ? parsed.assigneeId : null,
              assignee_type: parsed.assigneeId ? parsed.assigneeType : null,
            };
            setFormData((prev) => ({ ...prev, ...patch }));
            form.setFieldsValue(patch);
          }}
          scopes={supportsRoleAssignee ? ['user', 'role'] : ['user']}
          className="min-w-[160px] font-semibold text-gray-700 dark:text-gray-300"
          disabled={!isEditMode || !canEdit}
          allowClear={isEditMode}
          pickerTitle={`انتخاب ${assigneeField.labels?.fa || 'مسئول'}`}
          getPopupContainer={resolveSelectPopupContainer}
        />
      );
    }
    if (isEditMode) {
      return (
        <AdaptiveSelectField
          variant="borderless"
          showSearch
          optionFilterProp="label"
          value={currentRecordValues?.[assigneeField.key] || undefined}
          onChange={(value) => {
            const patch = { [assigneeField.key]: value || null };
            setFormData((prev) => ({ ...prev, ...patch }));
            form.setFieldsValue(patch);
          }}
          options={assigneeFieldOptions}
          className="min-w-[160px] font-semibold text-gray-700 dark:text-gray-300"
          disabled={!canEdit}
          allowClear
          getPopupContainer={resolveSelectPopupContainer}
        />
      );
    }
    return renderReadValue(assigneeField, record?.[assigneeField.key]);
  }, [assigneeField, assigneeFieldOptions, canEdit, currentRecordValues, form, isEditMode, record, renderReadValue, supportsRoleAssignee, usesCentralAssignee]);

  const buildPayload = useCallback(
    (values: Record<string, any>) => {
      const payload: Record<string, any> = {};
      visibleFields.forEach((field) => {
        if (field.nature === FieldNature.SYSTEM || field.readonly) return;

        const raw = values[field.key];
        if (raw === undefined) return;

        if (field.type === FieldType.CHECKBOX) {
          payload[field.key] = Boolean(raw);
          return;
        }

        if (isNumericField(field.type as FieldType)) {
          payload[field.key] = parseNumericInput(raw);
          return;
        }

        if (field.type === FieldType.TEXT || field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) {
          const value = String(raw || '').trim();
          payload[field.key] = value ? value : null;
          return;
        }

        if (field.type === FieldType.RELATION || field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
          payload[field.key] = raw || null;
          return;
        }

        payload[field.key] = raw;
      });

      if (usesCentralAssignee && Object.prototype.hasOwnProperty.call(values, 'assignee_id')) {
        const parsed = parseAssigneeValue(buildResolvedAssigneeCombo(values), 'user');
        payload.assignee_id = parsed.assigneeType === 'user' ? parsed.assigneeId : null;
        if (supportsRoleAssignee) {
          payload.assignee_role_id = parsed.assigneeType === 'role' ? parsed.assigneeId : null;
          payload.assignee_type = parsed.assigneeId ? parsed.assigneeType : null;
        }
      }

      if (isChequeModule) {
        const issueDate =
          values.issue_date ??
          payload.issue_date ??
          formData.issue_date ??
          null;

        payload.due_date = issueDate || null;

        const chequeType = String(
          values.cheque_type ??
            payload.cheque_type ??
            formData.cheque_type ??
            ''
        ).trim();

        if (chequeType === 'issued') {
          const bankAccountIdRaw = values.bank_account_id ?? formData.bank_account_id ?? null;
          const bankAccountId = String(bankAccountIdRaw || '').trim();
          payload.bank_account_id = bankAccountId || null;
        } else {
          payload.bank_account_id = null;
        }

        if (values.notes === undefined && formData.notes !== undefined) {
          payload.notes = String(formData.notes || '').trim() || null;
        }
      }

      return moduleId === 'cash_bank_operations'
        ? transformModulePayloadForSave(moduleId, payload, relationOptions)
        : payload;
    },
    [
      formData,
      isChequeModule,
      moduleId,
      relationOptions.bank_account_id,
      relationOptions.payment_account_id,
      relationOptions.receipt_account_id,
      supportsRoleAssignee,
      usesCentralAssignee,
      visibleFields,
    ]
  );

  const syncOperationalFinancePayload = useCallback(async (payload: Record<string, any>) => {
    if (!moduleId || !['bank_accounts', 'cash_boxes', 'petty_funds'].includes(moduleId)) {
      return payload;
    }

    const accountId = String(payload.account_id || '').trim();
    if (!accountId) {
      throw new Error('انتخاب حساب متناظر الزامی است.');
    }

    const { data: accountRow, error } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name')
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!accountRow) {
      throw new Error('حساب متناظر انتخاب‌شده معتبر نیست.');
    }

    const normalizedCode = String(payload.code || '').trim();
    const suggestedCode = isCreate && !normalizedCode
      ? await fetchSuggestedCode(moduleId, payload)
      : null;
    return {
      ...payload,
      account_id: accountId,
      ...(isCreate && !normalizedCode ? { code: suggestedCode || String(accountRow.code || '').trim() || null } : {}),
    };
  }, [fetchSuggestedCode, isCreate, moduleId]);

  const handleSave = async () => {
    if (!moduleId || !moduleConfig) return;
    if (!effectiveCanEdit) {
      if (isRecordLocked) message.error('این رکورد قفل شده و قابل تغییر نیست.');
      else message.error('دسترسی ویرایش ندارید');
      return;
    }
    if (!canEdit) {
      message.error('دسترسی ویرایش ندارید');
      return;
    }

    try {
      const validatedValues = await form.validateFields();
      const formValues = form.getFieldsValue(true);
      const mergedValues = { ...formData, ...formValues, ...validatedValues };

      if (isChequeModule) {
        const missingRequiredInline = chequeInlineFields.find((field) => {
          if (field.validation?.required !== true) return false;
          const raw = (mergedValues as any)[field.key];
          if (
            field.type === FieldType.PRICE ||
            field.type === FieldType.NUMBER ||
            field.type === FieldType.STOCK
          ) {
            return raw === null || raw === undefined || String(raw).trim() === '';
          }
          return String(raw ?? '').trim() === '';
        });

        if (missingRequiredInline) {
          message.error(`${missingRequiredInline.labels?.fa || missingRequiredInline.key} الزامی است.`);
          return;
        }
      }

      if (isChequeModule && String(mergedValues.cheque_type || '') === 'issued') {
        const bankAccountId = String(mergedValues.bank_account_id || '').trim();
        if (!bankAccountId) {
          message.error('برای چک پرداختی انتخاب بانک الزامی است.');
          return;
        }
      }

      if (moduleId === 'cash_bank_operations') {
        const validationError = validateModuleFormValues(moduleId, mergedValues, relationOptions);
        if (validationError) {
          message.error(validationError);
          return;
        }
      }

      setSaving(true);
      const basePayload = buildPayload(mergedValues);
      const payload = await syncOperationalFinancePayload(basePayload);

      if (isCreate) {
        const { data, error } = await supabase
          .from(moduleConfig.table)
          .insert([payload])
          .select('*')
          .single();
        if (error) throw error;
        await runWorkflowsForEvent({
          moduleId,
          event: 'create',
          currentRecord: (data || { ...payload }) as Record<string, any>,
        });
        message.success('رکورد ایجاد شد');
        navigate(`/${moduleId}/${data.id}`);
        return;
      }

      if (!id) return;
      const { data: updatedRows, error } = await supabase
        .from(moduleConfig.table)
        .update(payload)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('ویرایش ذخیره نشد. دسترسی یا رکورد را بررسی کنید.');
      }
      await runWorkflowsForEvent({
        moduleId,
        event: 'upsert',
        currentRecord: {
          ...(formData || {}),
          ...payload,
          id,
        } as Record<string, any>,
        previousRecord: ((formData || null) as Record<string, any> | null),
      });
      message.success('تغییرات ذخیره شد');
      navigate(`/${moduleId}/${id}`);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) {
        message.error('لطفاً فیلدهای اجباری را کامل کنید.');
        return;
      }
      message.error(toFaErrorMessage(err, 'خطا در ذخیره'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!moduleId || !moduleConfig || !id) return;
    if (!effectiveCanDelete) {
      if (isRecordLocked) message.error('این رکورد قفل شده و قابل حذف نیست.');
      else message.error('دسترسی حذف ندارید');
      return;
    }
    if (!canDelete) {
      message.error('دسترسی حذف ندارید');
      return;
    }
    try {
      setDeleting(true);
      if (isRecycleBinEnabledModule(moduleId)) {
        await moveModuleRecordsToRecycleBin(moduleId, [String(id)]);
      } else {
        const { error } = await supabase.from(moduleConfig.table).delete().eq('id', id);
        if (error) throw error;
      }
      message.success('رکورد حذف شد');
      navigate(`/${moduleId}`);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف'));
    } finally {
      setDeleting(false);
    }
  };

  const renderEditControl = (field: ModuleField) => {
    const disabled = !effectiveCanEdit || field.readonly === true || field.nature === FieldNature.SYSTEM;
    const options = getFieldOptions(field) as Array<{ value: string; label: string }>;

    switch (field.type) {
      case FieldType.LONG_TEXT:
      case FieldType.SUPER_LONG_TEXT:
        return <Input.TextArea rows={field.type === FieldType.SUPER_LONG_TEXT ? 6 : 3} disabled={disabled} />;
      case FieldType.CHECKBOX:
        return <Checkbox disabled={disabled} />;
      case FieldType.DATE:
        return <PersianDatePicker type="DATE" disabled={disabled} />;
      case FieldType.TIME:
        return <PersianDatePicker type="TIME" disabled={disabled} />;
      case FieldType.DATETIME:
        return <PersianDatePicker type="DATETIME" disabled={disabled} />;
      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
          <AdaptiveSelectField
            showSearch
            optionFilterProp="label"
            allowClear
            disabled={disabled}
            options={options}
            getPopupContainer={resolveSelectPopupContainer}
          />
        );
      case FieldType.RELATION:
      case FieldType.JSON:
      case FieldType.PROGRESS_STAGES:
        return (
          <SmartFieldRenderer
            field={field}
            value={formData?.[field.key]}
            onChange={(nextValue: any) => {
              const basePatch: Record<string, any> = { [field.key]: nextValue };
              const commitPatch = (patch: Record<string, any>) => {
                const nextFormData = { ...formData, ...patch };
                setFormData(nextFormData);
                form.setFieldsValue(patch);
              };

              if (moduleId === 'cash_bank_operations' && field.key === 'cheque_id') {
                if (!nextValue) {
                  commitPatch({ ...basePatch, attachment_url: null });
                  return;
                }

                (async () => {
                  try {
                    const extraPatch: Record<string, any> = {};
                    const selectedOption = ((options as any[]) || []).find((opt: any) => String(opt?.value || '') === String(nextValue)) as any;
                    if (
                      selectedOption?.amount !== undefined &&
                      selectedOption?.amount !== null &&
                      String(selectedOption.amount).trim() !== ''
                    ) {
                      extraPatch.amount = Number(selectedOption.amount);
                    }

                    const { data: chequeRecord } = await supabase
                      .from('cheques')
                      .select('amount, image_url')
                      .eq('id', nextValue)
                      .maybeSingle();

                    if (
                      chequeRecord?.amount !== undefined &&
                      chequeRecord?.amount !== null &&
                      String(chequeRecord.amount).trim() !== ''
                    ) {
                      extraPatch.amount = Number(chequeRecord.amount);
                    }
                    if (chequeRecord?.image_url && !formData?.attachment_url) {
                      extraPatch.attachment_url = chequeRecord.image_url;
                    }

                    commitPatch({ ...basePatch, ...extraPatch });
                  } catch {
                    commitPatch(basePatch);
                  }
                })();
                return;
              }

              commitPatch(basePatch);
              if (
                isCreate &&
                (
                  (moduleId === 'chart_of_accounts' && field.key === 'parent_id')
                  || (['bank_accounts', 'cash_boxes', 'petty_funds'].includes(String(moduleId || '')) && field.key === 'account_id')
                )
              ) {
                void applySuggestedCodeIfNeeded({ ...formData, ...basePatch });
              }
            }}
            forceEditMode={!disabled}
            compactMode
            options={options}
            moduleId={moduleId}
            recordId={id}
            allValues={formData}
          />
        );
      case FieldType.IMAGE:
      case FieldType.LINK:
        return (
          <SmartFieldRenderer
            field={field}
            value={formData?.[field.key]}
            onChange={(nextValue: any) => {
              const patch = { [field.key]: nextValue };
              setFormData((prev) => ({ ...prev, ...patch }));
              form.setFieldsValue(patch);
            }}
            forceEditMode={!disabled}
            compactMode
            options={options}
            moduleId={moduleId}
            recordId={id}
            allValues={formData}
          />
        );
      default:
        if (isNumericField(field.type as FieldType)) {
          return (
            <InputNumber
              className="w-full persian-number"
              controls={false}
              stringMode
              disabled={disabled}
              formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
              parser={(val) => normalizeNumericString(val)}
              onKeyDown={preventNonNumericKeyDown}
              onPaste={preventNonNumericPaste}
            />
          );
        }
        return <Input disabled={disabled} />;
    }
  };

  if (!moduleConfig || !isAccountingMinimalModule(moduleId)) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="صفحه مینیمال برای این ماژول فعال نیست" />
      </div>
    );
  }

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
        <Empty description="دسترسی مشاهده ندارید" />
      </div>
    );
  }

  if (!isCreate && !record) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="رکورد پیدا نشد" />
      </div>
    );
  }

  const recordTitle =
    (isCreate ? `ایجاد ${moduleConfig.titles.fa}` : null) ||
    String(
      record?.title ||
        record?.name ||
        record?.code ||
        record?.event_key ||
        record?.account_number ||
        record?.sayad_id ||
        moduleConfig.titles.fa
    );

  const sortedBlocks = (moduleConfig.blocks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className={`p-4 md:p-6 max-w-[1200px] mx-auto animate-fadeIn ${!isCreate && id ? 'md:pl-20' : ''}`}>
      {!isCreate && id && moduleConfig && (
        <RelatedSidebar
          moduleConfig={moduleConfig}
          recordId={String(id)}
          recordName={recordTitle}
        />
      )}
      <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button icon={<ArrowRightOutlined />} type="text" onClick={() => navigate(`/${moduleId}`)} />
            {!isCreate && id ? (
              <RecordLockControl
                moduleId={String(moduleId || '')}
                recordId={id}
                lockState={recordLockState}
                canLock={canLockCurrentRecord}
                canUnlock={canUnlockCurrentRecord}
                showUnlocked
                showLockedLabel
                size="middle"
                onChanged={handleRecordLockChanged}
              />
            ) : null}
            <h1 className="text-xl md:text-2xl font-black m-0 text-gray-800 dark:text-white">
              {recordTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {!isCreate && !isEditMode && effectiveCanEdit && id && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/${moduleId}/${id}/edit`)}>
                ویرایش
              </Button>
            )}

            {isEditMode && effectiveCanEdit && (
              <Button
                type="primary"
                icon={isCreate ? <PlusOutlined /> : <SaveOutlined />}
                className="bg-leather-600 border-none"
                loading={saving}
                onClick={handleSave}
              >
                {isCreate ? 'ایجاد' : 'ذخیره'}
              </Button>
            )}

            {!isCreate && effectiveCanDelete && (
              <Popconfirm
                title="حذف رکورد"
                description="از حذف این رکورد مطمئن هستید؟"
                okText="حذف"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={handleDelete}
              >
                <Button danger icon={<DeleteOutlined />}>
                  حذف
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] p-5 shadow-sm">
          <div className="flex flex-col-reverse gap-6 lg:flex-row lg:items-start">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="m-0 text-2xl md:text-3xl font-black text-gray-800 dark:text-white">
                    {recordTitle}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {statusField && (
                    <div className="smartform-inline-status h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                      <span className="text-xs text-gray-400 shrink-0">{statusField.labels?.fa || 'وضعیت'}:</span>
                      <div className="min-w-[120px]">{renderHeaderStatusField()}</div>
                    </div>
                  )}
                  {assigneeField && (
                    <div className="h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                      <span className="text-xs text-gray-400 shrink-0">{assigneeField.labels?.fa || 'مسئول'}:</span>
                      <div className="min-w-[140px]">{renderHeaderAssigneeField()}</div>
                    </div>
                  )}
                </div>
              </div>

              {headerFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                  {headerFields.map((field) => (
                    <div
                      key={field.key}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                    >
                      <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {renderReadValue(field, currentRecordValues?.[field.key])}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full lg:w-56 shrink-0 self-start">
              <RecordImageBox
                moduleId={String(moduleId || '')}
                recordId={id || null}
                imageUrl={imageField ? (currentRecordValues?.[imageField.key] || null) : null}
                canEdit={!!effectiveCanEdit && !!id}
                canViewFilesManager={!!id}
                canEditFilesManager={!!effectiveCanEdit && !!id}
                canUploadFilesManager={!!canEdit && !!id}
                canDeleteFilesManager={!!effectiveCanEdit && !!id}
                onMainImageChange={effectiveCanEdit ? handleHeaderImageChange : undefined}
                filesButtonLabel="فایل ها"
              />
              {!isCreate && (
                <div className="mt-3">
                  <TagInput
                    recordId={id}
                    moduleId={String(moduleId || '')}
                    initialTags={currentTags}
                    onChange={(tags) => setCurrentTags(tags || [])}
                    disabled={!effectiveCanEdit}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {isEditMode ? (
          <Form
            form={form}
            layout="vertical"
            initialValues={formData}
            onValuesChange={(_, allValues) => setFormData(allValues)}
          >
            {isChequeModule &&
              chequeInlineFields.map((field) => (
                <Form.Item
                  key={`inline_${field.key}`}
                  name={field.key}
                  hidden
                  preserve
                >
                  <Input />
                </Form.Item>
              ))}

            {isChequeModule && (
              <>
                <Form.Item name="bank_account_id" hidden preserve>
                  <Input />
                </Form.Item>
                <Form.Item name="due_date" hidden preserve>
                  <Input />
                </Form.Item>
                <Form.Item name="notes" hidden preserve>
                  <Input />
                </Form.Item>
              </>
            )}

            {headerFields.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {headerFields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={field.key}
                    label={field.labels?.fa || field.key}
                    rules={[
                      {
                        required: field.validation?.required === true,
                        message: `${field.labels?.fa || field.key} الزامی است`,
                      },
                    ]}
                    valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                  >
                    {renderEditControl(field)}
                  </Form.Item>
                ))}
              </div>
            )}

            {sortedBlocks.map((block) => {
              const fields = fieldsByBlock.get(block.id) || [];
              if (!fields.length) return null;
              return (
                <Card
                  key={block.id}
                  size="small"
                  title={block.titles?.fa || block.id}
                  className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {fields.map((field) => (
                      <Form.Item
                        key={field.key}
                        name={field.key}
                        label={field.labels?.fa || field.key}
                        rules={[
                          {
                            required: field.validation?.required === true,
                            message: `${field.labels?.fa || field.key} الزامی است`,
                          },
                        ]}
                        valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                      >
                        {renderEditControl(field)}
                      </Form.Item>
                    ))}
                  </div>
                </Card>
              );
            })}

            {looseFields.length > 0 && (
              <Card
                size="small"
                title="سایر اطلاعات"
                className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {looseFields.map((field) => (
                    <Form.Item
                      key={field.key}
                      name={field.key}
                      label={field.labels?.fa || field.key}
                      rules={[
                        {
                          required: field.validation?.required === true,
                          message: `${field.labels?.fa || field.key} الزامی است`,
                        },
                      ]}
                      valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                    >
                      {renderEditControl(field)}
                    </Form.Item>
                  ))}
                </div>
              </Card>
            )}
          </Form>
        ) : (
          <>
            {sortedBlocks.map((block) => {
              const fields = fieldsByBlock.get(block.id) || [];
              if (!fields.length) return null;
              return (
                <Card
                  key={block.id}
                  size="small"
                  title={block.titles?.fa || block.id}
                  className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {fields.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                      >
                        <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {renderReadValue(field, record?.[field.key])}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}

            {looseFields.length > 0 && (
              <Card
                size="small"
                title="سایر اطلاعات"
                className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {looseFields.map((field) => (
                    <div
                      key={field.key}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                    >
                      <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {renderReadValue(field, record?.[field.key])}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {isChequeModule && (
          <Card
            size="small"
            title="نمای چک"
            className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            {isEditMode && (
              <div className="mb-3 text-xs text-gray-500">
                {'فیلدهای اصلی چک را مستقیم داخل همین قالب وارد کنید.'}
              </div>
            )}
            <ChequePreviewCard
              values={(isEditMode ? formData : record) || {}}
              editable={isEditMode}
              disabled={!canEdit}
              onFieldChange={handleChequeInlineFieldChange}
              bankOptions={chequeBankOptions}
              bankMetaById={chequeBankMetaById}
            />
          </Card>
        )}

        {isChequeModule && chequeNotesField && (
          <Card
            size="small"
            title={chequeNotesField.labels?.fa || 'توضیحات'}
            className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            {isEditMode ? (
              <Input.TextArea
                rows={4}
                value={String(formData.notes ?? '')}
                onChange={(e) => handleChequeInlineFieldChange('notes', e.target.value || null)}
                disabled={!canEdit}
                placeholder="توضیحات تکمیلی چک..."
              />
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                {String(record?.notes || '-')}
              </div>
            )}
          </Card>
        )}

        {!isCreate && (
          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <SafetyCertificateOutlined className="text-green-600" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">ایجاد کننده</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(record?.created_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <ClockCircleOutlined className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ایجاد</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">
                  {renderDateTime(record?.created_at)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <EditOutlined className="text-orange-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">آخرین ویرایشگر</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(record?.updated_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <HistoryOutlined className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ویرایش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">
                  {renderDateTime(record?.updated_at)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AccountingRecordPage;
