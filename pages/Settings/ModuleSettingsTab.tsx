import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import {
  BlockDefinition,
  BlockType,
  FieldNature,
  FieldType,
  ModuleDefinition,
  ModuleField,
} from '../../types';
import { fetchCurrentUserRolePermissions, isSaasAdminModuleId, type PermissionMap } from '../../utils/permissions';
import {
  AddFieldFormValues,
  EditableModuleSchema,
  ModuleSettingsConfig,
  ModuleSettingsStore,
  SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE,
} from './moduleSettingsTypes';
import { clearSystemCodeSettingsCache } from '../../utils/systemCode';
import { getBaseModuleFieldDefinition, MODULE_SETTINGS_UPDATED_EVENT } from '../../utils/moduleSettingsRuntime';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import ConditionalFieldRulesEditor from '../../components/settings/ConditionalFieldRulesEditor';
import SettingsCollapsiblePanel from '../../components/settings/SettingsCollapsiblePanel';
import SettingsFieldValueInput from '../../components/settings/SettingsFieldValueInput';
import { normalizeConditionalFieldValueForField } from '../../utils/conditionalFieldRules';
import { getImplicitCreateDefaultValue } from '../../utils/defaultValues';

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getResolvedCurrentOrgId = async () => {
  const session = await fetchSessionBootstrap(supabase);
  return String(session?.orgId || '').trim() || null;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const normalizeSchema = (schema: EditableModuleSchema): EditableModuleSchema => {
  const blocks = [...(schema.blocks || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((block, index) => ({ ...block, order: index + 1 }));

  const fields = [...(schema.fields || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((field, index) => ({ ...field, order: index + 1 }));

  return { blocks, fields };
};

const buildDefaultSystemCodeNaming = (moduleDef: ModuleDefinition) => {
  const defaultPrefix = String(moduleDef.id || '').trim().charAt(0).toUpperCase() || 'M';
  if (moduleDef.id === 'customers') {
    return {
      prefix: 'C',
      prefixLetter: 'C',
      startNumber: 234,
      numberWidth: 3,
    };
  }

  return {
    prefix: defaultPrefix,
    prefixLetter: defaultPrefix,
    startNumber: 100,
    numberWidth: null,
  };
};

const formatSystemCodePreview = (prefix: string, startNumber: number, numberWidth?: number | null) => {
  const normalizedPrefix = String(prefix || '').trim().toUpperCase() || 'M';
  const normalizedStart = Math.max(0, Math.trunc(Number(startNumber || 0)));
  const normalizedWidth = Number(numberWidth);
  const suffix = Number.isFinite(normalizedWidth) && normalizedWidth > 0
    ? String(normalizedStart).padStart(normalizedWidth, '0')
    : String(normalizedStart);
  return `${normalizedPrefix}${suffix}`;
};

const buildDefaultModuleSettings = (moduleDef: ModuleDefinition): ModuleSettingsConfig => {
  return {
    general: {
      systemCodeNaming: buildDefaultSystemCodeNaming(moduleDef),
    },
    specific:
      moduleDef.id === 'products'
        ? {
            products: {
              subUnitEnabled: false,
              unitConversionEnabled: false,
              allowNegativeStock: false,
            },
          }
        : {},
    schema: normalizeSchema({
      fields: cloneDeep(moduleDef.fields || []),
      blocks: cloneDeep(moduleDef.blocks || []),
    }),
    conditionalDisplay: {
      rules: [],
    },
  };
};

const upgradeLegacySystemCodeNaming = (
  moduleId: string,
  naming: ModuleSettingsConfig['general']['systemCodeNaming']
) => {
  if (moduleId !== 'customers') return naming;

  const normalizedPrefix = String(naming.prefix || naming.prefixLetter || '').trim().toUpperCase();
  const hasExplicitWidth = naming.numberWidth !== undefined && naming.numberWidth !== null;
  const isLegacyDefaultStart = Number(naming.startNumber) === 100;
  const isCustomerDefaultPrefix = !normalizedPrefix || normalizedPrefix === 'C';

  if (isLegacyDefaultStart && !hasExplicitWidth && isCustomerDefaultPrefix) {
    return {
      ...naming,
      prefix: 'C',
      prefixLetter: 'C',
      startNumber: 234,
      numberWidth: 3,
    };
  }

  if (!hasExplicitWidth && isCustomerDefaultPrefix) {
    return {
      ...naming,
      prefix: normalizedPrefix || 'C',
      prefixLetter: normalizedPrefix || 'C',
      numberWidth: 3,
    };
  }

  return naming;
};

const mergeModuleSettings = (
  moduleId: string,
  base: ModuleSettingsConfig,
  incoming: ModuleSettingsConfig | undefined
): ModuleSettingsConfig => {
  if (!incoming) return base;

  const mergedGeneral = {
    ...base.general,
    ...(incoming.general || {}),
    systemCodeNaming: {
      ...base.general.systemCodeNaming,
      ...(incoming.general?.systemCodeNaming || {}),
    },
  };
  mergedGeneral.systemCodeNaming = upgradeLegacySystemCodeNaming(
    moduleId,
    mergedGeneral.systemCodeNaming
  );

  const mergedSpecific = {
    ...base.specific,
    ...(incoming.specific || {}),
    products: {
      ...(base.specific.products || {
        subUnitEnabled: false,
        unitConversionEnabled: false,
        allowNegativeStock: false,
      }),
      ...(incoming.specific?.products || {}),
    },
  };

  const incomingSchema = incoming.schema || base.schema;
  return {
    general: mergedGeneral,
    specific: mergedSpecific,
    schema: normalizeSchema({
      blocks: cloneDeep(incomingSchema.blocks || base.schema.blocks),
      fields: cloneDeep(incomingSchema.fields || base.schema.fields),
    }),
    conditionalDisplay: {
      rules: cloneDeep(incoming.conditionalDisplay?.rules || base.conditionalDisplay?.rules || []),
    },
  };
};

const optionEditableTypes = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
  FieldType.CHECKLIST,
]);

const dynamicOptionCapableTypes = new Set<FieldType>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
]);

const HEADER_DESTINATION = '__header__';

const fieldTypeLabels: Record<FieldType, string> = {
  [FieldType.TEXT]: 'متن کوتاه',
  [FieldType.LONG_TEXT]: 'متن بلند',
  [FieldType.SUPER_LONG_TEXT]: 'متن خیلی بلند',
  [FieldType.NUMBER]: 'عدد',
  [FieldType.PRICE]: 'قیمت',
  [FieldType.PERCENTAGE]: 'درصد',
  [FieldType.CHECKBOX]: 'چک‌باکس',
  [FieldType.STOCK]: 'موجودی',
  [FieldType.IMAGE]: 'تصویر',
  [FieldType.SELECT]: 'انتخابی',
  [FieldType.MULTI_SELECT]: 'چندانتخابی',
  [FieldType.CHECKLIST]: 'چک‌لیست',
  [FieldType.DATE]: 'تاریخ',
  [FieldType.TIME]: 'زمان',
  [FieldType.DATETIME]: 'تاریخ و زمان',
  [FieldType.LINK]: 'لینک',
  [FieldType.LOCATION]: 'موقعیت',
  [FieldType.RELATION]: 'ارتباط با ماژول',
  [FieldType.MULTI_RELATION]: 'چندارتباطی با ماژول',
  [FieldType.USER]: 'کاربر',
  [FieldType.STATUS]: 'وضعیت',
  [FieldType.PHONE]: 'تلفن',
  [FieldType.JSON]: 'JSON',
  [FieldType.TAGS]: 'برچسب',
  [FieldType.PROGRESS_STAGES]: 'مراحل فرآیند',
  [FieldType.PERCENTAGE_OR_AMOUNT]: 'درصد یا مبلغ',
  [FieldType.READONLY_LOOKUP]: 'نمایشی (Lookup)',
};

const blockTypeLabels: Record<BlockType, string> = {
  [BlockType.DEFAULT]: 'پیش‌فرض',
  [BlockType.FIELD_GROUP]: 'گروه فیلد',
  [BlockType.TABLE]: 'جدول',
  [BlockType.GRID_TABLE]: 'جدول شبکه‌ای',
  [BlockType.STAGES]: 'فرآیند مرحله‌ای',
};

const formatFieldDefaultSummary = (field: ModuleField | null | undefined, value: any) => {
  if (value === undefined) return 'بدون مقدار پیش‌فرض';
  if (value === null) return 'خالی';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'خالی';
    const options = field?.options || [];
    return value.map((item) => {
      const matched = options.find((option) => String(option?.value) === String(item));
      return String(matched?.label || item);
    }).join('، ');
  }
  if (typeof value === 'boolean') return value ? 'فعال' : 'غیرفعال';
  if (field?.options?.length) {
    const matched = field.options.find((option) => String(option?.value) === String(value));
    if (matched?.label) return String(matched.label);
  }
  return String(value);
};

const areFieldDefaultValuesEqual = (
  field: ModuleField | null | undefined,
  leftValue: any,
  rightValue: any
) => {
  if (leftValue === undefined && rightValue === undefined) return true;
  if (leftValue === undefined || rightValue === undefined) return false;
  return JSON.stringify(normalizeConditionalFieldValueForField(field || undefined, leftValue))
    === JSON.stringify(normalizeConditionalFieldValueForField(field || undefined, rightValue));
};

const getFieldDefaultEditorMode = (
  field: ModuleField | null | undefined,
  systemDefaultValue: any
): 'none' | 'system' | 'custom' => {
  const currentDefaultValue = field?.defaultValue;
  if (currentDefaultValue === undefined) return 'none';
  if (systemDefaultValue !== undefined && areFieldDefaultValuesEqual(field, currentDefaultValue, systemDefaultValue)) {
    return 'system';
  }
  return 'custom';
};

const criticalFieldKeysByModule: Record<string, string[]> = {
  __default: ['name', 'title', 'system_code', 'category', 'status'],
  products: ['name', 'system_code', 'category', 'status', 'product_type'],
  invoices: ['name', 'system_code', 'invoice_date', 'status'],
  purchase_invoices: ['name', 'system_code', 'invoice_date', 'status'],
};

const serializeOptions = (field: ModuleField): string => {
  return (field.options || [])
    .map((option) =>
      [String(option.label || ''), String(option.value || ''), String(option.color || '')]
        .filter((item) => item !== '')
        .join('|')
    )
    .join('\n');
};

const parseOptionsText = (value: string): Array<{ label: string; value: string; color?: string }> => {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelRaw, valueRaw, colorRaw] = line.split('|').map((item) => item.trim());
      const label = labelRaw || valueRaw || `گزینه ${index + 1}`;
      const optionValue = valueRaw || labelRaw || `option_${index + 1}`;
      return {
        label,
        value: optionValue,
        ...(colorRaw ? { color: colorRaw } : {}),
      };
    });
};

const supportsOptionEditor = (field: ModuleField) => {
  return optionEditableTypes.has(field.type) || !!field.dynamicOptionsCategory;
};

const supportsDynamicCategory = (fieldType: FieldType) => dynamicOptionCapableTypes.has(fieldType);

const buildProtectedFieldKeys = (moduleDef: ModuleDefinition | null): Set<string> => {
  if (!moduleDef) return new Set<string>();
  const protectedKeys = new Set<string>([
    ...(criticalFieldKeysByModule.__default || []),
    ...(criticalFieldKeysByModule[moduleDef.id] || []),
  ]);

  (moduleDef.fields || []).forEach((field) => {
    const key = String(field.key || '').trim();
    if (!key) return;
    if (field.nature === FieldNature.SYSTEM || field.isKey) {
      protectedKeys.add(key);
    }
  });

  return protectedKeys;
};

interface ModuleSettingsTabProps {
  initialModuleId?: string;
}

const ModuleSettingsTab: React.FC<ModuleSettingsTabProps> = ({ initialModuleId }) => {
  const { message } = App.useApp();
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsRowId, setSettingsRowId] = useState<string | null>(null);
  const [settingsProvider, setSettingsProvider] = useState<string>('core');
  const [settingsByModule, setSettingsByModule] = useState<Record<string, ModuleSettingsConfig>>({});
  const [selectedModuleId, setSelectedModuleId] = useState<string | undefined>(undefined);
  const [currentConfig, setCurrentConfig] = useState<ModuleSettingsConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isAddFieldModalOpen, setIsAddFieldModalOpen] = useState(false);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [optionEditorFieldKey, setOptionEditorFieldKey] = useState<string | null>(null);
  const [optionEditorText, setOptionEditorText] = useState('');
  const [optionEditorDynamicCategory, setOptionEditorDynamicCategory] = useState('');
  const [addFieldForm] = Form.useForm<AddFieldFormValues>();
  const [addBlockForm] = Form.useForm<{ id: string; title: string; type: BlockType }>();

  const addFieldType = Form.useWatch('type', addFieldForm);
  const addFieldRelationTargetModule = Form.useWatch('relationTargetModule', addFieldForm);

  const canOpenModuleSettings = useCallback(
    (moduleId: string) => {
      const modulePerms = permissions?.[moduleId];
      if (!modulePerms) return true;
      if (modulePerms.view === false) return false;
      const fields = toRecord(modulePerms.fields) as Record<string, boolean>;
      return fields.__module_settings !== false;
    },
    [permissions]
  );

  const canEditModuleSettings = useCallback(
    (moduleId: string) => {
      const modulePerms = permissions?.[moduleId];
      if (!modulePerms) return true;
      if (modulePerms.edit === false) return false;
      const fields = toRecord(modulePerms.fields) as Record<string, boolean>;
      return fields.__module_settings !== false;
    },
    [permissions]
  );

  const moduleOptions = useMemo(() => {
    return Object.values(MODULES)
      .filter((mod) => !isSaasAdminModuleId(mod.id))
      .filter((mod) => canOpenModuleSettings(mod.id))
      .map((mod) => ({
        value: mod.id,
        label: mod.titles.fa,
      }));
  }, [canOpenModuleSettings]);

  const allModuleOptions = useMemo(
    () =>
      Object.values(MODULES).filter((mod) => !isSaasAdminModuleId(mod.id)).map((mod) => ({
        value: mod.id,
        label: mod.titles.fa,
      })),
    []
  );

  const selectedModuleConfig = selectedModuleId ? MODULES[selectedModuleId] : null;
  const selectedModuleEditable = selectedModuleId ? canEditModuleSettings(selectedModuleId) : false;

  const protectedFieldKeys = useMemo(
    () => buildProtectedFieldKeys(selectedModuleConfig),
    [selectedModuleConfig]
  );

  const isProtectedField = useCallback(
    (field: ModuleField) => protectedFieldKeys.has(String(field.key || '')),
    [protectedFieldKeys]
  );

  const loadPermissions = useCallback(async () => {
    setLoadingPermissions(true);
    try {
      const rolePerms = await fetchCurrentUserRolePermissions(supabase);
      setPermissions(rolePerms);
    } finally {
      setLoadingPermissions(false);
    }
  }, []);

  const loadStoredSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const currentOrgId = await getResolvedCurrentOrgId();
      let query = supabase
        .from('integration_settings')
        .select('id, provider, settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE);

      query = currentOrgId
        ? query.eq('org_id', currentOrgId)
        : query.is('org_id', null);

      const { data, error } = await query.maybeSingle();

      if (error) {
        const code = String((error as any)?.code || '').toUpperCase();
        const messageText = String((error as any)?.message || '');
        const missingRow = code === 'PGRST116' || messageText.includes('0 rows');
        if (!missingRow) throw error;
      }

      const settings = toRecord(data?.settings) as ModuleSettingsStore;
      setSettingsByModule((settings.modules || {}) as Record<string, ModuleSettingsConfig>);
      setSettingsRowId(data?.id ? String(data.id) : null);
      setSettingsProvider(String(data?.provider || 'core'));
    } catch (err: any) {
      const messageText = String(err?.message || err || '');
      if (messageText.toLowerCase().includes('integration_settings')) {
        message.error('جدول integration_settings در دیتابیس موجود نیست.');
      } else {
        message.error('خواندن تنظیمات ماژول ناموفق بود.');
      }
    } finally {
      setLoadingSettings(false);
    }
  }, [message]);

  useEffect(() => {
    loadPermissions();
    loadStoredSettings();
  }, [loadPermissions, loadStoredSettings]);

  useEffect(() => {
    if (moduleOptions.length === 0) {
      setSelectedModuleId(undefined);
      return;
    }

    const initialCandidate = initialModuleId && moduleOptions.find((opt) => opt.value === initialModuleId)?.value;
    setSelectedModuleId((prev) => {
      if (prev && moduleOptions.some((opt) => opt.value === prev)) return prev;
      return initialCandidate || moduleOptions[0].value;
    });
  }, [initialModuleId, moduleOptions]);

  useEffect(() => {
    if (!selectedModuleId) {
      setCurrentConfig(null);
      return;
    }

    const moduleDef = MODULES[selectedModuleId];
    if (!moduleDef) {
      setCurrentConfig(null);
      return;
    }

    const defaultConfig = buildDefaultModuleSettings(moduleDef);
    const merged = mergeModuleSettings(selectedModuleId, defaultConfig, settingsByModule[selectedModuleId]);
    setCurrentConfig(merged);
    setIsDirty(false);
  }, [selectedModuleId, settingsByModule]);

  useEffect(() => {
    if (!isAddFieldModalOpen) return;
    if (addFieldType === FieldType.RELATION) {
      const currentTarget = addFieldForm.getFieldValue('relationTargetModule');
      if (!currentTarget) {
        addFieldForm.setFieldValue('relationTargetModule', allModuleOptions[0]?.value);
      }
    } else {
      addFieldForm.setFieldValue('relationTargetModule', undefined);
      addFieldForm.setFieldValue('relationTargetField', undefined);
    }

    if (!supportsDynamicCategory(addFieldType || FieldType.TEXT)) {
      addFieldForm.setFieldValue('dynamicCategory', undefined);
    }
  }, [addFieldForm, addFieldType, allModuleOptions, isAddFieldModalOpen]);

  const updateCurrentConfig = useCallback((updater: (prev: ModuleSettingsConfig) => ModuleSettingsConfig) => {
    setCurrentConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setIsDirty(true);
      return next;
    });
  }, []);

  const updateSchema = useCallback(
    (updater: (prev: EditableModuleSchema) => EditableModuleSchema) => {
      updateCurrentConfig((prev) => ({
        ...prev,
        schema: normalizeSchema(updater(prev.schema)),
      }));
    },
    [updateCurrentConfig]
  );

  const sortedFields = useMemo(() => {
    if (!currentConfig) return [];
    return [...currentConfig.schema.fields].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [currentConfig]);

  const sortedBlocks = useMemo(() => {
    if (!currentConfig) return [];
    return [...currentConfig.schema.blocks].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [currentConfig]);

  const fieldSections = useMemo(() => {
    const sections: Array<{
      key: string;
      title: string;
      hint?: string;
      fields: ModuleField[];
    }> = [];

    const headerFields = sortedFields.filter((field) => {
      const destination = String(field.blockId || '').trim();
      return !destination || destination === HEADER_DESTINATION || field.location === 'header';
    });

    sections.push({
      key: HEADER_DESTINATION,
      title: 'سربرگ',
      hint: 'فیلدهای بخش هیرو و اطلاعات اصلی رکورد',
      fields: headerFields,
    });

    sortedBlocks.forEach((block) => {
      const blockFields = sortedFields.filter((field) => String(field.blockId || '').trim() === String(block.id || '').trim());
      sections.push({
        key: String(block.id || ''),
        title: block.titles?.fa || block.id,
        hint: blockTypeLabels[block.type] || block.type,
        fields: blockFields,
      });
    });

    const assignedFieldKeys = new Set(sections.flatMap((section) => section.fields.map((field) => field.key)));
    const uncategorizedFields = sortedFields.filter((field) => !assignedFieldKeys.has(field.key));
    if (uncategorizedFields.length > 0) {
      sections.push({
        key: '__uncategorized__',
        title: 'فیلدهای بدون بخش',
        hint: 'فیلدهایی که هنوز به سربرگ یا بلاک مشخصی متصل نشده‌اند',
        fields: uncategorizedFields,
      });
    }

    return sections.filter((section) => section.fields.length > 0);
  }, [sortedBlocks, sortedFields]);

  const defaultListColumnsCount = useMemo(
    () => sortedFields.filter((field) => field.isTableColumn === true).length,
    [sortedFields]
  );

  const blockDestinationOptions = useMemo(
    () => [
      { value: HEADER_DESTINATION, label: 'سربرگ (هیرو)' },
      ...sortedBlocks.map((block) => ({
        value: block.id,
        label: block.titles.fa,
      })),
    ],
    [sortedBlocks]
  );

  const fieldTypeOptions = useMemo(
    () =>
      Object.values(FieldType).map((type) => ({
        label: fieldTypeLabels[type] || type,
        value: type,
      })),
    []
  );

  const blockTypeOptions = useMemo(
    () =>
      Object.values(BlockType).map((type) => ({
        label: blockTypeLabels[type] || type,
        value: type,
      })),
    []
  );

  const optionEditorField = useMemo(
    () => sortedFields.find((field) => field.key === optionEditorFieldKey) || null,
    [optionEditorFieldKey, sortedFields]
  );

  const handleSave = async () => {
    if (!selectedModuleId || !currentConfig) return;
    if (!selectedModuleEditable) {
      message.error('برای ویرایش تنظیمات این ماژول دسترسی ندارید.');
      return;
    }

    setSaving(true);
    try {
      const nextModules: Record<string, ModuleSettingsConfig> = {
        ...settingsByModule,
        [selectedModuleId]: currentConfig,
      };
      const currentOrgId = await getResolvedCurrentOrgId();

      const payload: Record<string, unknown> = {
        connection_type: SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE,
        provider: settingsProvider || 'core',
        is_active: true,
        settings: {
          modules: nextModules,
        },
      };
      if (currentOrgId) {
        payload.org_id = currentOrgId;
      }

      if (settingsRowId) {
        payload.id = settingsRowId;
      }

      const { data, error } = await supabase
        .from('integration_settings')
        .upsert([payload], { onConflict: 'org_id,connection_type' })
        .select('id')
        .single();

      if (error) throw error;

      setSettingsByModule(nextModules);
      setSettingsRowId(data?.id ? String(data.id) : settingsRowId);
      clearSystemCodeSettingsCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(MODULE_SETTINGS_UPDATED_EVENT));
      }
      setIsDirty(false);
      message.success('تنظیمات ماژول ذخیره شد.');
    } catch (err: any) {
      const messageText = String(err?.message || err || '');
      if (messageText.toLowerCase().includes('integration_settings')) {
        message.error('جدول integration_settings در دیتابیس موجود نیست.');
      } else {
        message.error('ذخیره تنظیمات ماژول ناموفق بود.');
      }
    } finally {
      setSaving(false);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    updateSchema((prev) => {
      const fields = [...prev.fields].sort((a, b) => (a.order || 0) - (b.order || 0));
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= fields.length) return prev;
      const temp = fields[index];
      fields[index] = fields[target];
      fields[target] = temp;
      return { ...prev, fields };
    });
  };

  const updateField = (fieldKey: string, updater: (field: ModuleField) => ModuleField) => {
    updateSchema((prev) => ({
      ...prev,
      fields: prev.fields.map((field) => (field.key === fieldKey ? updater(field) : field)),
    }));
  };

  const deleteField = (fieldKey: string) => {
    const target = sortedFields.find((field) => field.key === fieldKey);
    if (target && isProtectedField(target)) {
      message.warning('این فیلد سیستمی/ضروری است و قابل حذف نیست.');
      return;
    }
    updateSchema((prev) => ({
      ...prev,
      fields: prev.fields.filter((field) => field.key !== fieldKey),
    }));
  };

  const addBlock = async () => {
    try {
      const values = await addBlockForm.validateFields();
      const normalizedId = String(values.id || '')
        .trim()
        .replace(/\s+/g, '_');

      if (!normalizedId) {
        message.error('شناسه بلاک معتبر نیست.');
        return;
      }

      const exists = sortedBlocks.some((block) => block.id === normalizedId);
      if (exists) {
        message.error('شناسه بلاک تکراری است.');
        return;
      }

      updateSchema((prev) => ({
        ...prev,
        blocks: [
          ...prev.blocks,
          {
            id: normalizedId,
            type: values.type,
            order: prev.blocks.length + 1,
            titles: { fa: values.title || normalizedId },
          } as BlockDefinition,
        ],
      }));
      setIsAddBlockModalOpen(false);
      addBlockForm.resetFields();
    } catch {
      // Ant form validation handles message.
    }
  };

  const deleteBlock = (blockId: string) => {
    updateSchema((prev) => ({
      blocks: prev.blocks.filter((block) => block.id !== blockId),
      fields: prev.fields.map((field) => {
        if (field.blockId !== blockId) return field;
        return { ...field, blockId: undefined, location: 'header' };
      }),
    }));
  };

  const addField = async () => {
    try {
      const values = await addFieldForm.validateFields();
      const key = String(values.key || '')
        .trim()
        .replace(/\s+/g, '_');
      if (!key) {
        message.error('کلید فیلد معتبر نیست.');
        return;
      }
      if (sortedFields.some((field) => field.key === key)) {
        message.error('کلید فیلد تکراری است.');
        return;
      }

      const blockId =
        values.blockId && values.blockId !== HEADER_DESTINATION ? String(values.blockId) : undefined;
      const nextType = values.type;
      const relationTargetModule =
        nextType === FieldType.RELATION ? values.relationTargetModule || allModuleOptions[0]?.value : undefined;

      updateSchema((prev) => ({
        ...prev,
        fields: [
          ...prev.fields,
          {
            key,
            type: nextType,
            labels: { fa: values.labelFa || key, en: key },
            blockId,
            location: blockId ? 'block' : 'header',
            isTableColumn: true,
            order: prev.fields.length + 1,
            validation: { required: false },
            options: optionEditableTypes.has(nextType) ? [] : undefined,
            dynamicOptionsCategory:
              supportsDynamicCategory(nextType) && values.dynamicCategory
                ? String(values.dynamicCategory).trim()
                : undefined,
            relationConfig:
              nextType === FieldType.RELATION && relationTargetModule
                ? {
                    targetModule: relationTargetModule,
                    targetField: values.relationTargetField || undefined,
                  }
                : undefined,
          } as ModuleField,
        ],
      }));
      setIsAddFieldModalOpen(false);
      addFieldForm.resetFields();
    } catch {
      // Ant form validation handles message.
    }
  };

  const openOptionsEditor = (field: ModuleField) => {
    setOptionEditorFieldKey(field.key);
    setOptionEditorText(serializeOptions(field));
    setOptionEditorDynamicCategory(String(field.dynamicOptionsCategory || ''));
  };

  const saveOptionsEditor = () => {
    if (!optionEditorFieldKey) return;
    const parsedOptions = parseOptionsText(optionEditorText);
    const nextDynamic = String(optionEditorDynamicCategory || '').trim();

    updateField(optionEditorFieldKey, (field) => ({
      ...field,
      options: parsedOptions,
      dynamicOptionsCategory: nextDynamic || undefined,
    }));

    setOptionEditorFieldKey(null);
    setOptionEditorText('');
    setOptionEditorDynamicCategory('');
  };

  const resetSchemaToDefault = () => {
    if (!selectedModuleConfig) return;
    const defaultSchema = buildDefaultModuleSettings(selectedModuleConfig).schema;
    updateCurrentConfig((prev) => ({
      ...prev,
      schema: defaultSchema,
    }));
  };

  if (loadingPermissions || loadingSettings) {
    return (
      <div className="h-[45vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (moduleOptions.length === 0) {
    return <Empty description="ماژولی با دسترسی تنظیمات برای شما تعریف نشده است." />;
  }

  return (
    <div className="space-y-4 text-gray-800 dark:text-gray-100">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px]">
          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">انتخاب ماژول</Typography.Text>
          <Select
            className="w-full mt-1"
            value={selectedModuleId}
            options={moduleOptions}
            onChange={(value) => setSelectedModuleId(value)}
          />
        </div>
        {selectedModuleId && (
          <Tag color={selectedModuleEditable ? 'green' : 'orange'}>
            {selectedModuleEditable ? 'دسترسی ویرایش دارید' : 'فقط مشاهده'}
          </Tag>
        )}
      </div>

      {!currentConfig || !selectedModuleConfig ? (
        <Empty description="ماژول انتخاب نشده است." />
      ) : (
        <>
          <Tabs
            defaultActiveKey="general"
            items={[
              {
                key: 'general',
                label: 'تنظیمات عمومی/اختصاصی',
                children: (
                  <div className="space-y-4">
                    <Card
                      title="تنظیمات عمومی"
                      size="small"
                      className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
                    >
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={8}>
                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                            پیشوند کد سیستمی
                          </Typography.Text>
                          <Input
                            maxLength={12}
                            value={currentConfig.general.systemCodeNaming.prefix || currentConfig.general.systemCodeNaming.prefixLetter || ''}
                            onChange={(e) =>
                              updateCurrentConfig((prev) => ({
                                ...prev,
                                general: {
                                  ...prev.general,
                                  systemCodeNaming: {
                                    ...prev.general.systemCodeNaming,
                                    prefix: String(e.target.value || '').trim().toUpperCase().replace(/\s+/g, ''),
                                    prefixLetter: String(e.target.value || '').trim().toUpperCase().replace(/\s+/g, ''),
                                  },
                                },
                              }))
                            }
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                            عدد شروع
                          </Typography.Text>
                          <InputNumber
                            className="w-full"
                            min={0}
                            max={999999}
                            value={currentConfig.general.systemCodeNaming.startNumber}
                            onChange={(value) =>
                              updateCurrentConfig((prev) => ({
                                ...prev,
                                general: {
                                  ...prev.general,
                                  systemCodeNaming: {
                                    ...prev.general.systemCodeNaming,
                                    startNumber: Number(value ?? 0),
                                  },
                                },
                              }))
                            }
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                            طول بخش عددی
                          </Typography.Text>
                          <InputNumber
                            className="w-full"
                            min={0}
                            max={12}
                            value={currentConfig.general.systemCodeNaming.numberWidth ?? undefined}
                            placeholder="بدون محدودیت"
                            onChange={(value) =>
                              updateCurrentConfig((prev) => ({
                                ...prev,
                                general: {
                                  ...prev.general,
                                  systemCodeNaming: {
                                    ...prev.general.systemCodeNaming,
                                    numberWidth: Number(value ?? 0) > 0 ? Number(value) : null,
                                  },
                                },
                              }))
                            }
                          />
                        </Col>
                        <Col xs={24} md={24} className="flex items-end">
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            نمونه:{' '}
                            <span className="font-mono font-bold">
                              {formatSystemCodePreview(
                                currentConfig.general.systemCodeNaming.prefix || currentConfig.general.systemCodeNaming.prefixLetter || 'M',
                                currentConfig.general.systemCodeNaming.startNumber || 0,
                                currentConfig.general.systemCodeNaming.numberWidth
                              )}
                            </span>
                          </div>
                        </Col>
                      </Row>
                    </Card>
                    {selectedModuleId === 'products' ? (
                      <Card
                        title="تنظیمات اختصاصی محصولات"
                        size="small"
                        className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
                      >
                        <Space direction="vertical" className="w-full">
                          <div className="flex items-center justify-between">
                            <span>واحد فرعی فعال باشد؟</span>
                            <Switch
                              checked={!!currentConfig.specific.products?.subUnitEnabled}
                              onChange={(checked) =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  specific: {
                                    ...prev.specific,
                                    products: {
                                      ...(prev.specific.products || {
                                        subUnitEnabled: false,
                                        unitConversionEnabled: false,
                                        allowNegativeStock: false,
                                      }),
                                      subUnitEnabled: checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span>تبدیل واحدها انجام شود؟</span>
                            <Switch
                              checked={!!currentConfig.specific.products?.unitConversionEnabled}
                              onChange={(checked) =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  specific: {
                                    ...prev.specific,
                                    products: {
                                      ...(prev.specific.products || {
                                        subUnitEnabled: false,
                                        unitConversionEnabled: false,
                                        allowNegativeStock: false,
                                      }),
                                      unitConversionEnabled: checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span>موجودی منفی اجازه داده شود؟</span>
                            <Switch
                              checked={!!currentConfig.specific.products?.allowNegativeStock}
                              onChange={(checked) =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  specific: {
                                    ...prev.specific,
                                    products: {
                                      ...(prev.specific.products || {
                                        subUnitEnabled: false,
                                        unitConversionEnabled: false,
                                        allowNegativeStock: false,
                                      }),
                                      allowNegativeStock: checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                        </Space>
                      </Card>
                    ) : (
                      <Alert type="warning" showIcon message="برای این ماژول هنوز تنظیمات اختصاصی تعریف نشده است." />
                    )}
                  </div>
                ),
              },
              {
                key: 'schema',
                label: 'نمایش شرطی فیلدها',
                children: (
                  <ConditionalFieldRulesEditor
                    moduleId={selectedModuleId || ''}
                    fields={currentConfig.schema.fields}
                    value={currentConfig.conditionalDisplay}
                    disabled={!selectedModuleEditable}
                    onChange={(nextValue) =>
                      updateCurrentConfig((prev) => ({
                        ...prev,
                        conditionalDisplay: nextValue,
                      }))
                    }
                  />
                ),
              },
              {
                key: 'schema_editor',
                label: 'ویرایش فیلدها و بلاک‌ها',
                children: (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button icon={<PlusOutlined />} onClick={() => setIsAddFieldModalOpen(true)}>
                        افزودن فیلد
                      </Button>
                      <Button icon={<PlusOutlined />} onClick={() => setIsAddBlockModalOpen(true)}>
                        افزودن بلاک
                      </Button>
                      <Button danger onClick={resetSchemaToDefault}>
                        بازنشانی ساختار به حالت پیش‌فرض
                      </Button>
                    </div>

                    <Card
                      title="بلاک‌ها"
                      size="small"
                      className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
                    >
                      <Space direction="vertical" className="w-full">
                        {sortedBlocks.length === 0 ? (
                          <Empty description="بلاکی وجود ندارد" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                          sortedBlocks.map((block) => (
                            <div
                              key={block.id}
                              className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-wrap items-center gap-2"
                            >
                              <Input
                                className="max-w-[260px]"
                                value={block.titles.fa}
                                onChange={(e) =>
                                  updateSchema((prev) => ({
                                    ...prev,
                                    blocks: prev.blocks.map((item) =>
                                      item.id === block.id
                                        ? {
                                            ...item,
                                            titles: { ...(item.titles || {}), fa: e.target.value || item.id },
                                          }
                                        : item
                                    ),
                                  }))
                                }
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">قابل چاپ</span>
                                <Switch
                                  size="small"
                                  checked={block.printable !== false}
                                  onChange={(checked) =>
                                    updateSchema((prev) => ({
                                      ...prev,
                                      blocks: prev.blocks.map((item) =>
                                        item.id === block.id
                                          ? { ...item, printable: checked }
                                          : item
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <Tag>{block.id}</Tag>
                              <Tag color="blue">{blockTypeLabels[block.type] || block.type}</Tag>
                              <Popconfirm
                                title="حذف بلاک"
                                description="فیلدهای این بلاک به سربرگ منتقل می‌شوند."
                                onConfirm={() => deleteBlock(block.id)}
                                okText="حذف"
                                cancelText="انصراف"
                              >
                                <Button danger size="small" icon={<DeleteOutlined />}>
                                  حذف
                                </Button>
                              </Popconfirm>
                            </div>
                          ))
                        )}
                      </Space>
                    </Card>

                    <Card
                      title="فیلدها"
                      size="small"
                      className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
                    >
                      <Space direction="vertical" className="w-full">
                        {sortedFields.length === 0 ? (
                          <Empty description="فیلدی وجود ندارد" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                          <>
                            <Alert
                              type="info"
                              showIcon
                              message={
                                defaultListColumnsCount > 0
                                  ? `در حال حاضر ${defaultListColumnsCount} فیلد به‌عنوان ستون پیش‌فرض لیست فعال است. این تنظیم فقط روی نمای اصلی لیست همین ماژول اثر می‌گذارد و تنظیمات View Manager را تغییر نمی‌دهد.`
                                  : 'در حال حاضر هیچ ستون پیش‌فرضی برای لیست فعال نیست؛ در این حالت لیست به fallback عمومی پروژه برمی‌گردد. این تنظیم فقط روی نمای اصلی لیست همین ماژول اثر می‌گذارد و تنظیمات View Manager را تغییر نمی‌دهد.'
                              }
                            />
                            {fieldSections.map((section) => (
                              <Card
                                key={section.key}
                                size="small"
                                title={section.title}
                                extra={
                                  section.hint ? (
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      {section.hint}
                                    </Typography.Text>
                                  ) : null
                                }
                                className="border-gray-200 dark:!bg-[#181818] dark:!border-gray-700"
                              >
                                <Space direction="vertical" className="w-full">
                                  {section.fields.map((field) => {
                                    const globalIndex = sortedFields.findIndex((candidate) => candidate.key === field.key);
                                    const protectedField = isProtectedField(field);
                                    const relationTargetModule = field.relationConfig?.targetModule;
                                    const relationTargetModuleConfig = relationTargetModule
                                      ? MODULES[relationTargetModule]
                                      : null;
                                    const relationTargetFieldOptions = (relationTargetModuleConfig?.fields || []).map((f) => ({
                                      value: f.key,
                                      label: f.labels?.fa || f.key,
                                    }));
                                    const baseField = getBaseModuleFieldDefinition(selectedModuleId, field.key);
                                    const systemDefaultValue = getImplicitCreateDefaultValue(baseField || field);
                                    const defaultEditorMode = getFieldDefaultEditorMode(field, systemDefaultValue);
                                    const normalizedFieldDefaultValue = normalizeConditionalFieldValueForField(
                                      field,
                                      field.defaultValue
                                    );
                                    const normalizedSystemDefaultValue = normalizeConditionalFieldValueForField(
                                      field,
                                      systemDefaultValue
                                    );
                                    const defaultSourceOptions = [
                                      ...(systemDefaultValue !== undefined
                                        ? [{ value: 'system', label: 'سیستمی' }]
                                        : []),
                                      { value: 'custom', label: 'اختصاصی' },
                                      { value: 'none', label: 'بدون مقدار پیش‌فرض' },
                                    ];

                                    return (
                              <SettingsCollapsiblePanel
                                key={field.key}
                                defaultExpanded
                                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#181818]"
                                bodyClassName="mt-3 space-y-3"
                                header={(
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <div className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-800">
                                      {field.key}
                                    </div>
                                            <Tag color="default">{fieldTypeLabels[field.type] || field.type}</Tag>
                                            {field.isTableColumn === true && <Tag color="blue">ستون لیست</Tag>}
                                            <Typography.Text className="text-sm">
                                              {field.labels?.fa || 'بدون عنوان'}
                                            </Typography.Text>
                                    {field.defaultValue !== undefined && (
                                      <Tag color="gold">
                                        پیش‌فرض: {formatFieldDefaultSummary(field, field.defaultValue)}
                                      </Tag>
                                    )}
                                    {protectedField && <Tag color="red">سیستمی/ضروری</Tag>}
                                  </div>
                                )}
                                extra={(
                                  <Space>
                                    <Button
                                      size="small"
                                      icon={<ArrowUpOutlined />}
                                      disabled={globalIndex <= 0 || protectedField}
                                      onClick={() => moveField(globalIndex, 'up')}
                                    />
                                    <Button
                                      size="small"
                                      icon={<ArrowDownOutlined />}
                                      disabled={globalIndex === sortedFields.length - 1 || protectedField}
                                      onClick={() => moveField(globalIndex, 'down')}
                                    />
                                    {supportsOptionEditor(field) && !protectedField && (
                                      <Button size="small" onClick={() => openOptionsEditor(field)}>
                                        گزینه‌ها
                                      </Button>
                                    )}
                                    <Tooltip
                                      title={
                                        protectedField ? 'این فیلد سیستمی/ضروری است و قابل حذف نیست.' : undefined
                                      }
                                    >
                                      <Popconfirm
                                        title="حذف فیلد"
                                        onConfirm={() => deleteField(field.key)}
                                        okText="حذف"
                                        cancelText="انصراف"
                                        disabled={protectedField}
                                      >
                                        <Button size="small" danger icon={<DeleteOutlined />} disabled={protectedField}>
                                          حذف
                                        </Button>
                                      </Popconfirm>
                                    </Tooltip>
                                  </Space>
                                )}
                              >
                                <Row gutter={[12, 12]}>
                                  <Col xs={24} md={8}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      عنوان فارسی
                                    </Typography.Text>
                                    <Input
                                      value={field.labels?.fa || ''}
                                      onChange={(e) =>
                                        updateField(field.key, (prev) => ({
                                          ...prev,
                                          labels: { ...(prev.labels || {}), fa: e.target.value },
                                        }))
                                      }
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      نوع فیلد
                                    </Typography.Text>
                                    <Select
                                      className="w-full"
                                      value={field.type}
                                      disabled={protectedField}
                                      onChange={(value: FieldType) =>
                                        updateField(field.key, (prev) => {
                                          const nextField: ModuleField = {
                                            ...prev,
                                            type: value,
                                            options: optionEditableTypes.has(value) ? prev.options || [] : undefined,
                                            dynamicOptionsCategory: supportsDynamicCategory(value)
                                              ? prev.dynamicOptionsCategory
                                              : undefined,
                                            relationConfig:
                                              value === FieldType.RELATION
                                                ? prev.relationConfig || {
                                                    targetModule: selectedModuleId || allModuleOptions[0]?.value || '',
                                                  }
                                                : undefined,
                                          };
                                          return {
                                            ...nextField,
                                            defaultValue:
                                              prev.defaultValue === undefined
                                                ? undefined
                                                : normalizeConditionalFieldValueForField(nextField, prev.defaultValue),
                                          };
                                        })
                                      }
                                      options={fieldTypeOptions}
                                    />
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      بلاک مقصد
                                    </Typography.Text>
                                    <Select
                                      className="w-full"
                                      value={field.blockId || HEADER_DESTINATION}
                                      disabled={protectedField}
                                      options={blockDestinationOptions}
                                      onChange={(value) =>
                                        updateField(field.key, (prev) => ({
                                          ...prev,
                                          blockId: value === HEADER_DESTINATION ? undefined : value,
                                          location: value === HEADER_DESTINATION ? 'header' : 'block',
                                        }))
                                      }
                                    />
                                  </Col>
                                  <Col xs={12} md={2}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      اجباری
                                    </Typography.Text>
                                    <div>
                                      <Switch
                                        checked={!!field.validation?.required}
                                        disabled={protectedField}
                                        onChange={(checked) =>
                                          updateField(field.key, (prev) => ({
                                            ...prev,
                                            validation: { ...(prev.validation || {}), required: checked },
                                          }))
                                        }
                                      />
                                    </div>
                                  </Col>
                                  <Col xs={12} md={2}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      ستون پیش‌فرض لیست
                                    </Typography.Text>
                                    <div>
                                              <Switch
                                                checked={field.isTableColumn === true}
                                                disabled={protectedField}
                                                onChange={(checked) =>
                                                  updateField(field.key, (prev) => ({
                                            ...prev,
                                            isTableColumn: checked,
                                          }))
                                        }
                                      />
                                    </div>
                                  </Col>
                                </Row>

                                <Row gutter={[12, 12]}>
                                  <Col xs={24} md={7}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      منطق مقدار پیش‌فرض
                                    </Typography.Text>
                                    <Select
                                      className="w-full"
                                      value={defaultEditorMode}
                                      disabled={protectedField}
                                      options={defaultSourceOptions}
                                      onChange={(nextMode: 'none' | 'system' | 'custom') =>
                                        updateField(field.key, (prev) => {
                                          if (nextMode === 'none') {
                                            return {
                                              ...prev,
                                              defaultValue: undefined,
                                            };
                                          }
                                          if (nextMode === 'system') {
                                            return {
                                              ...prev,
                                              defaultValue: normalizeConditionalFieldValueForField(
                                                prev,
                                                systemDefaultValue
                                              ),
                                            };
                                          }
                                          return {
                                            ...prev,
                                            defaultValue: normalizeConditionalFieldValueForField(
                                              prev,
                                              prev.defaultValue !== undefined ? prev.defaultValue : systemDefaultValue
                                            ),
                                          };
                                        })
                                      }
                                    />
                                  </Col>
                                  <Col xs={24} md={17}>
                                    <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                      مقدار پیش‌فرض
                                    </Typography.Text>
                                    {defaultEditorMode === 'custom' ? (
                                      <SettingsFieldValueInput
                                        field={field}
                                        value={normalizedFieldDefaultValue}
                                        disabled={protectedField}
                                        moduleId={selectedModuleId || undefined}
                                        onChange={(nextValue) =>
                                          updateField(field.key, (prev) => ({
                                            ...prev,
                                            defaultValue: normalizeConditionalFieldValueForField(prev, nextValue),
                                          }))
                                        }
                                      />
                                    ) : (
                                      <Alert
                                        type={defaultEditorMode === 'system' ? 'info' : 'warning'}
                                        showIcon
                                        message={
                                          defaultEditorMode === 'system'
                                            ? `مقدار سیستمی: ${formatFieldDefaultSummary(field, normalizedSystemDefaultValue)}`
                                            : 'برای این فیلد مقدار پیش‌فرضی تعریف نشده است.'
                                        }
                                      />
                                    )}
                                  </Col>
                                  {systemDefaultValue !== undefined && (
                                    <Col xs={24}>
                                      <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                        پیش‌فرض سیستمی این فیلد: {formatFieldDefaultSummary(field, systemDefaultValue)}
                                      </Typography.Text>
                                    </Col>
                                  )}
                                </Row>

                                {(field.type === FieldType.RELATION || supportsDynamicCategory(field.type)) && (
                                  <Row gutter={[12, 12]}>
                                    {field.type === FieldType.RELATION && (
                                      <>
                                        <Col xs={24} md={12}>
                                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                            ماژول مرتبط
                                          </Typography.Text>
                                          <Select
                                            className="w-full"
                                            value={field.relationConfig?.targetModule}
                                            disabled={protectedField}
                                            options={allModuleOptions}
                                            onChange={(value) =>
                                              updateField(field.key, (prev) => ({
                                                ...prev,
                                                relationConfig: {
                                                  ...prev.relationConfig,
                                                  targetModule: value,
                                                  targetField:
                                                    MODULES[value]?.fields?.some(
                                                      (candidate) =>
                                                        candidate.key === String(prev.relationConfig?.targetField || '')
                                                    )
                                                      ? prev.relationConfig?.targetField
                                                      : undefined,
                                                },
                                              }))
                                            }
                                          />
                                        </Col>
                                        <Col xs={24} md={12}>
                                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                            فیلد نمایشی مقصد
                                          </Typography.Text>
                                          <Select
                                            allowClear
                                            className="w-full"
                                            value={field.relationConfig?.targetField}
                                            disabled={protectedField}
                                            options={relationTargetFieldOptions}
                                            onChange={(value) =>
                                              updateField(field.key, (prev) => ({
                                                ...prev,
                                                relationConfig: {
                                                  ...prev.relationConfig,
                                                  targetModule:
                                                    prev.relationConfig?.targetModule ||
                                                    selectedModuleId ||
                                                    allModuleOptions[0]?.value,
                                                  targetField: value || undefined,
                                                },
                                              }))
                                            }
                                          />
                                        </Col>
                                      </>
                                    )}
                                    {supportsDynamicCategory(field.type) && (
                                      <Col xs={24}>
                                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                          دسته‌بندی گزینه‌های داینامیک
                                        </Typography.Text>
                                        <Input
                                          placeholder="مثال: product_categories"
                                          value={field.dynamicOptionsCategory || ''}
                                          disabled={protectedField}
                                          onChange={(e) =>
                                            updateField(field.key, (prev) => ({
                                              ...prev,
                                              dynamicOptionsCategory: String(e.target.value || '').trim() || undefined,
                                            }))
                                          }
                                        />
                                      </Col>
                                    )}
                                  </Row>
                                )}

                                {protectedField && (
                                  <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                                    برای فیلدهای سیستمی/ضروری فقط تغییر عنوان فارسی مجاز است.
                                  </Typography.Text>
                                )}
                              </SettingsCollapsiblePanel>
                                    );
                                  })}
                                </Space>
                              </Card>
                            ))}
                          </>
                        )}
                      </Space>
                    </Card>
                  </div>
                ),
              },
            ]}
          />

          <div className="flex justify-end">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!isDirty || !selectedModuleEditable}
              onClick={handleSave}
              className="bg-leather-600 hover:!bg-leather-500"
            >
              ذخیره تنظیمات ماژول
            </Button>
          </div>
        </>
      )}

      <Modal
        title="افزودن بلاک جدید"
        open={isAddBlockModalOpen}
        onCancel={() => setIsAddBlockModalOpen(false)}
        onOk={addBlock}
        okText="ایجاد بلاک"
      >
        <Form form={addBlockForm} layout="vertical" initialValues={{ type: BlockType.FIELD_GROUP }}>
          <Form.Item label="شناسه بلاک" name="id" rules={[{ required: true, message: 'شناسه بلاک لازم است.' }]}>
            <Input placeholder="مثال: custom_section" />
          </Form.Item>
          <Form.Item label="عنوان بلاک" name="title" rules={[{ required: true, message: 'عنوان بلاک لازم است.' }]}>
            <Input placeholder="مثال: تنظیمات مالی" />
          </Form.Item>
          <Form.Item label="نوع بلاک" name="type">
            <Select options={blockTypeOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="افزودن فیلد جدید"
        open={isAddFieldModalOpen}
        onCancel={() => setIsAddFieldModalOpen(false)}
        onOk={addField}
        okText="ایجاد فیلد"
      >
        <Form
          form={addFieldForm}
          layout="vertical"
          initialValues={{ type: FieldType.TEXT, blockId: HEADER_DESTINATION }}
        >
          <Form.Item label="کلید فیلد" name="key" rules={[{ required: true, message: 'کلید فیلد لازم است.' }]}>
            <Input placeholder="مثال: custom_code" />
          </Form.Item>
          <Form.Item
            label="عنوان فارسی"
            name="labelFa"
            rules={[{ required: true, message: 'عنوان فارسی لازم است.' }]}
          >
            <Input placeholder="مثال: کد سفارشی" />
          </Form.Item>
          <Form.Item label="نوع فیلد" name="type">
            <Select options={fieldTypeOptions} />
          </Form.Item>
          <Form.Item label="بلاک مقصد" name="blockId">
            <Select options={blockDestinationOptions} />
          </Form.Item>

          {addFieldType === FieldType.RELATION && (
            <>
              <Form.Item
                label="ماژول مرتبط"
                name="relationTargetModule"
                rules={[{ required: true, message: 'ماژول مرتبط را انتخاب کنید.' }]}
              >
                <Select options={allModuleOptions} />
              </Form.Item>
              <Form.Item label="فیلد نمایشی مقصد" name="relationTargetField">
                <Select
                  allowClear
                  options={(MODULES[String(addFieldRelationTargetModule || '')]?.fields || []).map((field) => ({
                    value: field.key,
                    label: field.labels?.fa || field.key,
                  }))}
                />
              </Form.Item>
            </>
          )}

          {supportsDynamicCategory(addFieldType || FieldType.TEXT) && (
            <Form.Item label="دسته‌بندی گزینه‌های داینامیک" name="dynamicCategory">
              <Input placeholder="مثال: product_categories" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={
          <span className="flex items-center gap-2">
            <SettingOutlined />
            ویرایش گزینه‌های فیلد
          </span>
        }
        open={!!optionEditorFieldKey}
        onCancel={() => setOptionEditorFieldKey(null)}
        onOk={saveOptionsEditor}
        okText="ثبت گزینه‌ها"
      >
        <Typography.Paragraph className="text-xs text-gray-500 dark:text-gray-400">
          هر خط به‌صورت <code>label|value|color</code> وارد شود. رنگ اختیاری است.
        </Typography.Paragraph>
        {optionEditorField && supportsDynamicCategory(optionEditorField.type) && (
          <Form layout="vertical">
            <Form.Item label="دسته‌بندی داینامیک">
              <Input
                value={optionEditorDynamicCategory}
                onChange={(e) => setOptionEditorDynamicCategory(e.target.value)}
                placeholder="مثال: product_categories"
              />
            </Form.Item>
          </Form>
        )}
        <Input.TextArea
          rows={10}
          value={optionEditorText}
          onChange={(e) => setOptionEditorText(e.target.value)}
          placeholder={'مثال:\nفعال|active|green\nغیرفعال|inactive|red'}
        />
      </Modal>
    </div>
  );
};

export default ModuleSettingsTab;
