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
import { fetchCurrentUserRolePermissions, type PermissionMap } from '../../utils/permissions';
import {
  AddFieldFormValues,
  EditableModuleSchema,
  ModuleSettingsConfig,
  ModuleSettingsStore,
  SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE,
} from './moduleSettingsTypes';

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const buildDefaultModuleSettings = (moduleDef: ModuleDefinition): ModuleSettingsConfig => {
  const firstLetter = String(moduleDef.id || '').trim().charAt(0).toUpperCase() || 'M';

  return {
    general: {
      systemCodeNaming: {
        prefixLetter: firstLetter,
        startNumber: 100,
      },
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
  };
};

const mergeModuleSettings = (
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
      .filter((mod) => canOpenModuleSettings(mod.id))
      .map((mod) => ({
        value: mod.id,
        label: mod.titles.fa,
      }));
  }, [canOpenModuleSettings]);

  const allModuleOptions = useMemo(
    () =>
      Object.values(MODULES).map((mod) => ({
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
      const { data, error } = await supabase
        .from('integration_settings')
        .select('id, provider, settings')
        .eq('connection_type', SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE)
        .maybeSingle();

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
    const merged = mergeModuleSettings(defaultConfig, settingsByModule[selectedModuleId]);
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

      const payload: Record<string, unknown> = {
        connection_type: SYSTEM_MODULE_SETTINGS_CONNECTION_TYPE,
        provider: settingsProvider || 'core',
        is_active: true,
        settings: {
          modules: nextModules,
        },
      };

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
                            حرف کد سیستمی
                          </Typography.Text>
                          <Input
                            maxLength={1}
                            value={currentConfig.general.systemCodeNaming.prefixLetter}
                            onChange={(e) =>
                              updateCurrentConfig((prev) => ({
                                ...prev,
                                general: {
                                  ...prev.general,
                                  systemCodeNaming: {
                                    ...prev.general.systemCodeNaming,
                                    prefixLetter: String(e.target.value || '').trim().slice(0, 1).toUpperCase(),
                                  },
                                },
                              }))
                            }
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                            سه رقم اول اعداد
                          </Typography.Text>
                          <InputNumber
                            className="w-full"
                            min={0}
                            max={999}
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
                        <Col xs={24} md={8} className="flex items-end">
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            نمونه:{' '}
                            <span className="font-mono font-bold">
                              {`${currentConfig.general.systemCodeNaming.prefixLetter || 'M'}${String(
                                currentConfig.general.systemCodeNaming.startNumber || 0
                              ).padStart(3, '0')}`}
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
                          sortedFields.map((field, index) => {
                            const protectedField = isProtectedField(field);
                            const relationTargetModule = field.relationConfig?.targetModule;
                            const relationTargetModuleConfig = relationTargetModule
                              ? MODULES[relationTargetModule]
                              : null;
                            const relationTargetFieldOptions = (relationTargetModuleConfig?.fields || []).map((f) => ({
                              value: f.key,
                              label: f.labels?.fa || f.key,
                            }));

                            return (
                              <div
                                key={field.key}
                                className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3 bg-white dark:bg-[#181818]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                      {field.key}
                                    </div>
                                    <Tag color="default">{fieldTypeLabels[field.type] || field.type}</Tag>
                                    {protectedField && <Tag color="red">سیستمی/ضروری</Tag>}
                                  </div>
                                  <Space>
                                    <Button
                                      size="small"
                                      icon={<ArrowUpOutlined />}
                                      disabled={index === 0 || protectedField}
                                      onClick={() => moveField(index, 'up')}
                                    />
                                    <Button
                                      size="small"
                                      icon={<ArrowDownOutlined />}
                                      disabled={index === sortedFields.length - 1 || protectedField}
                                      onClick={() => moveField(index, 'down')}
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
                                </div>

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
                                        updateField(field.key, (prev) => ({
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
                                        }))
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
                                      ستون جدول
                                    </Typography.Text>
                                    <div>
                                      <Switch
                                        checked={field.isTableColumn !== false}
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
                              </div>
                            );
                          })
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
