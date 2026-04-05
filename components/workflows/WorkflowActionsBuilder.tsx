import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, Button, Empty, Input, InputNumber, Select, Space, Switch } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { FieldType, ModuleField } from '../../types';
import DynamicSelectField from '../DynamicSelectField';
import PersianDatePicker from '../PersianDatePicker';
import { MODULES } from '../../moduleRegistry';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowModuleOption,
  actionTypeOptions,
  createWorkflowId,
} from '../../utils/workflowTypes';
import { normalizeWorkflowValueByFieldType } from '../../utils/filterUtils';
import { supportsWorkflowProcessTemplateActions } from '../../utils/workflowHelpers';

interface WorkflowActionsBuilderProps {
  value: WorkflowAction[];
  onChange: (next: WorkflowAction[]) => void;
  currentModuleId: string;
  currentModuleFields: ModuleField[];
  variableFields?: ModuleField[];
  moduleOptions: WorkflowModuleOption[];
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
  relationSourceModuleOptions?: WorkflowModuleOption[];
  additionalRecipientFieldOptions?: Array<{ label: string; value: string }>;
  disabled?: boolean;
}

type CreateRelatedFieldMapping = {
  id: string;
  field: string;
  mode: 'static' | 'from_source' | 'from_related';
  value?: any;
  source_field?: string;
};

const getDefaultActionConfig = (type: WorkflowActionType): Record<string, any> => {
  switch (type) {
    case 'send_note':
      return { recipient_fields: [], note_text: '', variable_field: '', variable_target: 'note_text' };
    case 'send_sms':
      return {
        recipient_fields: [],
        manual_numbers: [],
        message: '',
        variable_field: '',
        variable_target: 'message',
      };
    case 'send_email':
      return {
        recipient_fields: [],
        manual_emails: [],
        subject: '',
        body: '',
        variable_field: '',
        variable_target: 'body',
      };
    case 'send_bale_bot':
      return {
        recipient_fields: [],
        manual_chat_ids: [],
        title: '',
        message: '',
        variable_field: '',
        variable_target: 'message',
      };
    case 'update_record':
      return { field: '', value_mode: 'static', value: null, source_field: '' };
    case 'create_related_record':
      return { source_module_id: '', target_module_id: '', relation_field_key: '', field_mappings: [] };
    case 'copy_process_template':
    case 'execute_process':
      return { template_id: '' };
    default:
      return {};
  }
};

const getFieldLabel = (field?: ModuleField | null) => {
  if (!field?.key) return '';
  const fa = String(field?.labels?.fa || '').trim();
  if (!fa) return field.key;
  if (fa === field.key) return field.key;
  return `${fa} (${field.key})`;
};

const getRequiredTargetFields = (targetModuleId: string, relationFieldKey?: string) => {
  const targetModule = MODULES[targetModuleId];
  if (!targetModule) return [] as ModuleField[];
  return (targetModule.fields || []).filter((field) => {
    if (!field?.key) return false;
    if (field.nature === 'system') return false;
    if (field.readonly === true) return false;
    if (field.key === relationFieldKey) return false;
    return field?.validation?.required === true;
  });
};

const WorkflowActionsBuilder: React.FC<WorkflowActionsBuilderProps> = ({
  value,
  onChange,
  currentModuleId,
  currentModuleFields,
  variableFields,
  moduleOptions,
  dynamicOptions,
  relationOptions,
  relationSourceModuleOptions,
  additionalRecipientFieldOptions,
  disabled = false,
}) => {
  const safeValue = Array.isArray(value) ? value : [];
  const popupContainer = (node?: HTMLElement | null) => node?.parentElement || document.body;
  const selectPopupStyles = { popup: { root: { zIndex: 12600 } } } as const;

  const commonSelectProps = {
    showSearch: true,
    optionFilterProp: 'label' as const,
    getPopupContainer: popupContainer,
    popupMatchSelectWidth: false,
    listHeight: 260,
    virtual: false,
    styles: selectPopupStyles,
  };

  const updatableFieldOptions = useMemo(
    () =>
      currentModuleFields
        .filter((f) => !!f?.key && f?.readonly !== true && f?.nature !== 'system')
        .map((field) => ({
          label: getFieldLabel(field),
          value: field.key,
        })),
    [currentModuleFields]
  );

  const variableFieldOptions = useMemo(
    () =>
      (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields)
        .filter((f) => !!f?.key && f?.nature !== 'system')
        .map((field) => ({
          label: getFieldLabel(field),
          value: field.key,
        })),
    [currentModuleFields, variableFields]
  );
  const relatedVariableFieldOptions = useMemo(
    () => variableFieldOptions.filter((item) => {
      const value = String(item.value || '');
      return value.startsWith('__linked__') || value.startsWith('__workflow_related__');
    }),
    [variableFieldOptions]
  );
  const sourceVariableFieldOptions = useMemo(
    () => variableFieldOptions.filter((item) => {
      const value = String(item.value || '');
      return !value.startsWith('__linked__') && !value.startsWith('__workflow_related__');
    }),
    [variableFieldOptions]
  );
  const assigneeRecipientFieldOptions = useMemo(
    () =>
      currentModuleFields
        .filter((field) => {
          const key = String(field?.key || '');
          return key === '__workflow_assignee'
            || key === '__task____workflow_assignee'
            || key.endsWith('____workflow_assignee')
            || key.startsWith('__comm_recipient__');
        })
        .map((field) => ({ label: getFieldLabel(field), value: field.key })),
    [currentModuleFields]
  );
  const recipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...((additionalRecipientFieldOptions || []).map((item) => [String(item.value), item] as const)),
      ...assigneeRecipientFieldOptions.map((item) => [String(item.value), item] as const),
    ]).values()),
    [additionalRecipientFieldOptions, assigneeRecipientFieldOptions]
  );

  const relatedTargetModuleOptions = useMemo(() => {
    const allowedSourceModuleIds = new Set(
      ((relationSourceModuleOptions && relationSourceModuleOptions.length > 0 ? relationSourceModuleOptions : [{ value: currentModuleId, label: currentModuleId }]) || [])
        .map((item) => String(item?.value || '').trim())
        .filter(Boolean)
    );
    return moduleOptions.filter((option) => {
      const target = MODULES[option.value];
      if (!target) return false;
      return (target.fields || []).some(
        (field) =>
          field.type === FieldType.RELATION &&
          allowedSourceModuleIds.has(String((field.relationConfig as any)?.targetModule || ''))
      );
    });
  }, [moduleOptions, currentModuleId, relationSourceModuleOptions]);

  const processTemplateOptions = relationOptions.process_template_id || [];
  const canUseProcessTemplateActions = supportsWorkflowProcessTemplateActions(currentModuleId);

  const addAction = () => {
    const type = actionTypeOptions[0]?.value || 'send_note';
    const next = [
      ...safeValue,
      {
        id: createWorkflowId(),
        type,
        config: getDefaultActionConfig(type),
      },
    ];
    onChange(next);
  };

  const updateAction = (id: string, patch: Partial<WorkflowAction>) => {
    const next = safeValue.map((item) => {
      if (item.id !== id) return item;
      return { ...item, ...patch };
    });
    onChange(next);
  };

  const updateActionConfig = (id: string, configPatch: Record<string, any>) => {
    const next = safeValue.map((item) => {
      if (item.id !== id) return item;
      return { ...item, config: { ...(item.config || {}), ...configPatch } };
    });
    onChange(next);
  };

  const removeAction = (id: string) => {
    onChange(safeValue.filter((item) => item.id !== id));
  };

  const moveAction = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= safeValue.length) return;
    const next = [...safeValue];
    const temp = next[fromIndex];
    next[fromIndex] = next[toIndex];
    next[toIndex] = temp;
    onChange(next);
  };

  const getFieldSelectOptions = (field: ModuleField | undefined) => {
    if (!field) return [];
    if (field.dynamicOptionsCategory) {
      return dynamicOptions[field.dynamicOptionsCategory] || [];
    }
    if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
      return (relationOptions[field.key] || []).map((opt) => ({
        label: String(opt?.label || opt?.value || '-'),
        value: String(opt?.value || ''),
      }));
    }
    return (field.options || []).map((opt) => ({
      label: String(opt?.label ?? opt?.value ?? ''),
      value: String(opt?.value ?? ''),
    }));
  };

  const renderTypedValueInput = (
    field: ModuleField | undefined,
    value: any,
    onValueChange: (nextValue: any) => void
  ) => {
    if (!field) {
      return <Input disabled placeholder="ابتدا فیلد را انتخاب کنید" />;
    }

    const options = getFieldSelectOptions(field);

    if (field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={value}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          options={options}
          category={field.dynamicOptionsCategory}
          className="w-full"
          disabled={disabled}
        />
      );
    }

    if (field.type === FieldType.CHECKBOX) {
      return (
        <div className="h-10 flex items-center px-1">
          <Switch checked={!!value} disabled={disabled} onChange={onValueChange} />
        </div>
      );
    }

    if (
      field.type === FieldType.SELECT ||
      field.type === FieldType.STATUS ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.USER
    ) {
      return (
        <Select
          {...commonSelectProps}
          value={value}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          className="w-full"
          placeholder="مقدار"
        />
      );
    }

    if (
      field.type === FieldType.NUMBER ||
      field.type === FieldType.PRICE ||
      field.type === FieldType.PERCENTAGE ||
      field.type === FieldType.STOCK
    ) {
      return (
        <InputNumber
          className="w-full persian-number"
          value={value}
          disabled={disabled}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          placeholder="عدد"
        />
      );
    }

    if (field.type === FieldType.DATE) {
      return (
        <PersianDatePicker
          type="DATE"
          value={value || null}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="تاریخ"
        />
      );
    }

    if (field.type === FieldType.TIME) {
      return (
        <PersianDatePicker
          type="TIME"
          value={value || null}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="ساعت"
        />
      );
    }

    if (field.type === FieldType.DATETIME) {
      return (
        <PersianDatePicker
          type="DATETIME"
          value={value || null}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="تاریخ و زمان"
        />
      );
    }

    if (field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) {
      return (
        <Input.TextArea
          rows={field.type === FieldType.SUPER_LONG_TEXT ? 6 : 3}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="مقدار"
        />
      );
    }

    return (
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="مقدار"
      />
    );
  };

  const insertVariableToken = useCallback(
    (action: WorkflowAction, targetFieldKey: string, variableFieldKey: string) => {
      const variableField = String(variableFieldKey || '');
      if (!variableField) return;
      const token = `{{${variableField}}}`;
      const config = action.config || {};
      const currentText = String(config[targetFieldKey] || '');
      if (currentText.includes(token)) {
        return;
      }
      const nextText = currentText ? `${currentText} ${token}` : token;
      updateActionConfig(action.id, { [targetFieldKey]: nextText, variable_field: variableField });
    },
    [updateActionConfig]
  );

  const renderVariableTools = (
    action: WorkflowAction,
    targets: Array<{ key: string; label: string }>
  ) => {
    const config = action.config || {};
    const selectedTarget =
      String(config.variable_target || '') || (targets[0]?.key || '');
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-2">
        <div className="text-xs text-gray-500 mb-2">انتخاب فیلد برای متغیر</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Select
            {...commonSelectProps}
            value={config.variable_field}
            options={variableFieldOptions}
            disabled={disabled}
            onChange={(nextVal) => {
              const nextVariableField = String(nextVal || '');
              if (!nextVariableField) {
                updateActionConfig(action.id, { variable_field: '' });
                return;
              }
              insertVariableToken(
                action,
                selectedTarget || targets[0].key,
                nextVariableField
              );
            }}
            placeholder="فیلد متغیر"
          />
          {targets.length > 1 ? (
            <Select
              {...commonSelectProps}
              value={selectedTarget}
              options={targets.map((item) => ({ label: item.label, value: item.key }))}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { variable_target: nextVal })}
              placeholder="محل درج متغیر"
            />
          ) : (
            <div className="h-10 flex items-center text-xs text-gray-400 px-2 border rounded-md border-gray-200 dark:border-gray-700">
              محل درج: {targets[0]?.label || '-'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUpdateValueInput = (action: WorkflowAction) => {
    const targetFieldKey = String(action?.config?.field || '');
    const targetField = currentModuleFields.find((f) => f.key === targetFieldKey);
    const valueMode = String(action?.config?.value_mode || 'static');
    if (valueMode === 'from_source' || valueMode === 'from_related') {
      const options = valueMode === 'from_related' ? relatedVariableFieldOptions : sourceVariableFieldOptions;
      return (
        <Select
          {...commonSelectProps}
          value={action?.config?.source_field}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => updateActionConfig(action.id, { source_field: nextVal })}
          placeholder={valueMode === 'from_related' ? 'فیلد رکورد مرتبط' : 'فیلد رکورد جاری'}
        />
      );
    }
    return renderTypedValueInput(targetField, action?.config?.value, (nextVal) =>
      updateActionConfig(action.id, { value: nextVal })
    );
  };

  const getRelatedFieldMappings = (action: WorkflowAction): CreateRelatedFieldMapping[] => {
    const config = action.config || {};
    if (Array.isArray(config.field_mappings)) {
      return config.field_mappings;
    }
    if (config.title_field) {
      return [
        {
          id: `${action.id}_legacy`,
          field: String(config.title_field),
          mode: 'static',
          value: config.title_value ?? '',
        },
      ];
    }
    return [];
  };

  const updateRelatedFieldMappings = (
    actionId: string,
    updater: (current: CreateRelatedFieldMapping[]) => CreateRelatedFieldMapping[]
  ) => {
    const target = safeValue.find((item) => item.id === actionId);
    const current = target ? getRelatedFieldMappings(target) : [];
    const next = updater(current);
    updateActionConfig(actionId, {
      field_mappings: next,
      title_field: undefined,
      title_value: undefined,
    });
  };

  const ensureRequiredMappings = useCallback(
    (
      targetModuleId: string,
      relationFieldKey: string,
      mappings: CreateRelatedFieldMapping[]
    ) => {
      const requiredFields = getRequiredTargetFields(targetModuleId, relationFieldKey);
      if (requiredFields.length === 0) return mappings;

      const existingKeys = new Set(mappings.map((item) => item.field).filter(Boolean));
      const missing = requiredFields
        .filter((field) => !existingKeys.has(field.key))
        .map((field) => ({
          id: createWorkflowId(),
          field: field.key,
          mode: 'static' as const,
          value: '',
        }));

      if (missing.length === 0) return mappings;
      return [...mappings, ...missing];
    },
    []
  );

  useEffect(() => {
    let hasChanges = false;
    const next = safeValue.map((action) => {
      if (action.type !== 'create_related_record') return action;
      const config = action.config || {};
      const targetModuleId = String(config.target_module_id || '');
      const sourceModuleId = String(
        config.source_module_id
        || relationSourceModuleOptions?.[0]?.value
        || currentModuleId
      );
      if (!targetModuleId) return action;

      const targetModule = MODULES[targetModuleId];
      const relationFields = (targetModule?.fields || []).filter(
        (field) =>
          field.type === FieldType.RELATION &&
          String((field.relationConfig as any)?.targetModule || '') === sourceModuleId
      );
      const defaultRelationFieldKey = relationFields[0]?.key || '';
      const relationFieldKey = String(config.relation_field_key || defaultRelationFieldKey || '');

      const rawMappings = Array.isArray(config.field_mappings)
        ? (config.field_mappings as CreateRelatedFieldMapping[])
        : [];
      const ensuredMappings = ensureRequiredMappings(
        targetModuleId,
        relationFieldKey,
        rawMappings
      );

      const relationChanged = relationFieldKey !== String(config.relation_field_key || '');
      const mappingsChanged = ensuredMappings.length !== rawMappings.length;
      const sourceChanged = sourceModuleId !== String(config.source_module_id || '');
      if (!relationChanged && !mappingsChanged && !sourceChanged) return action;
      hasChanges = true;
      return {
        ...action,
        config: {
          ...config,
          source_module_id: sourceModuleId,
          relation_field_key: relationFieldKey,
          field_mappings: ensuredMappings,
        },
      };
    });

    if (hasChanges) {
      onChange(next);
    }
  }, [safeValue, onChange, currentModuleId, ensureRequiredMappings]);

  const renderActionFields = (action: WorkflowAction) => {
    const actionType = action.type;
    const config = action.config || {};

    if (actionType === 'send_note') {
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">گیرنده یادداشت</div>
          <Select
            {...commonSelectProps}
            mode="multiple"
            value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
            disabled={disabled}
            options={recipientFieldOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
            placeholder="گیرنده(های) یادداشت"
            className="w-full"
            maxTagCount="responsive"
          />
          <Input.TextArea
            rows={4}
            value={config.note_text}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { note_text: e.target.value })}
            placeholder="متن یادداشت"
          />
          {renderVariableTools(action, [{ key: 'note_text', label: 'متن یادداشت' }])}
        </div>
      );
    }

    if (actionType === 'send_sms') {
      const phoneFields = currentModuleFields
        .filter((f) => f.type === FieldType.PHONE || /mobile|phone/i.test(f.key))
        .map((f) => ({ label: getFieldLabel(f), value: f.key }));
      const smsRecipientOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...phoneFields.map((item) => [String(item.value), item] as const),
      ]).values());

      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={smsRecipientOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="فیلد(های) شماره مقصد"
            />
            <Select
              {...commonSelectProps}
              mode="tags"
              value={Array.isArray(config.manual_numbers) ? config.manual_numbers : []}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { manual_numbers: nextVal })}
              tokenSeparators={[',', ';', ' ']}
              placeholder="شماره تماس اختیاری"
            />
          </div>
          <Input.TextArea
            rows={4}
            value={config.message}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { message: e.target.value })}
            placeholder="متن پیامک"
          />
          {renderVariableTools(action, [{ key: 'message', label: 'متن پیامک' }])}
        </div>
      );
    }

    if (actionType === 'send_email') {
      const emailFields = currentModuleFields
        .filter((f) => /email/i.test(f.key))
        .map((f) => ({ label: getFieldLabel(f), value: f.key }));
      const emailRecipientOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...emailFields.map((item) => [String(item.value), item] as const),
      ]).values());

      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={emailRecipientOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="فیلد(های) ایمیل مقصد"
            />
            <Select
              {...commonSelectProps}
              mode="tags"
              value={Array.isArray(config.manual_emails) ? config.manual_emails : []}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { manual_emails: nextVal })}
              tokenSeparators={[',', ';', ' ']}
              placeholder="ایمیل اختیاری"
            />
          </div>
          <Input
            value={config.subject}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { subject: e.target.value })}
            placeholder="موضوع ایمیل"
          />
          <Input.TextArea
            rows={4}
            value={config.body}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { body: e.target.value })}
            placeholder="متن ایمیل"
          />
          {renderVariableTools(action, [
            { key: 'subject', label: 'موضوع ایمیل' },
            { key: 'body', label: 'متن ایمیل' },
          ])}
        </div>
      );
    }

    if (actionType === 'send_bale_bot') {
      const chatIdFields = currentModuleFields
        .filter((f) => /bale.*chat|chat.*bale|bale_chat_id/i.test(f.key))
        .map((f) => ({ label: getFieldLabel(f), value: f.key }));
      const baleRecipientOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...chatIdFields.map((item) => [String(item.value), item] as const),
      ]).values());

      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={baleRecipientOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="فیلد(های) شناسه چت بله"
            />
            <Select
              {...commonSelectProps}
              mode="tags"
              value={Array.isArray(config.manual_chat_ids) ? config.manual_chat_ids : []}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { manual_chat_ids: nextVal })}
              tokenSeparators={[',', ';', ' ']}
              placeholder="شناسه چت اختیاری"
            />
          </div>
          <Input
            value={config.title}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { title: e.target.value })}
            placeholder="عنوان پیام بله"
          />
          <Input.TextArea
            rows={4}
            value={config.message}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { message: e.target.value })}
            placeholder="متن پیام بله"
          />
          {renderVariableTools(action, [
            { key: 'title', label: 'عنوان پیام بله' },
            { key: 'message', label: 'متن پیام بله' },
          ])}
        </div>
      );
    }

    if (actionType === 'update_record') {
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="space-y-1 md:col-span-5">
            <div className="text-xs text-gray-500">فیلد مقصد</div>
            <Select
              {...commonSelectProps}
              value={config.field}
              disabled={disabled}
              options={updatableFieldOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { field: nextVal, value: null })}
              placeholder="فیلد مقصد"
            />
          </div>
          <div className="space-y-1 md:col-span-3">
            <div className="text-xs text-gray-500">نوع مقدار</div>
            <Select
              {...commonSelectProps}
              value={config.value_mode || 'static'}
              disabled={disabled}
              options={[
                { label: 'مقدار ثابت', value: 'static' },
                { label: 'از فیلد رکورد جاری', value: 'from_source' },
                { label: 'از فیلد رکورد مرتبط', value: 'from_related' },
              ]}
              onChange={(nextVal) => updateActionConfig(action.id, {
                value_mode: nextVal,
                value: null,
                source_field: '',
              })}
              placeholder="نوع مقدار"
            />
          </div>
          <div className="space-y-1 md:col-span-4">
            <div className="text-xs text-gray-500">
              {(config.value_mode || 'static') === 'from_related'
                ? 'فیلد رکورد مرتبط'
                : (config.value_mode || 'static') === 'from_source'
                  ? 'فیلد رکورد جاری'
                  : 'مقدار نهایی'}
            </div>
            {renderUpdateValueInput(action)}
          </div>
        </div>
      );
    }

    if (actionType === 'copy_process_template' || actionType === 'execute_process') {
      if (!canUseProcessTemplateActions) {
        return (
          <Alert
            type="warning"
            showIcon
            message="این ماژول از کپی یا اجرای خودکار فرآیند پشتیبانی نمی‌کند."
          />
        );
      }

      return (
        <div className="space-y-2">
          <Select
            {...commonSelectProps}
            value={config.template_id}
            disabled={disabled}
            options={processTemplateOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { template_id: nextVal })}
            placeholder="الگوی فرآیند"
          />
          {processTemplateOptions.length === 0 ? (
            <div className="text-xs text-gray-500">
              هنوز الگوی فعالی برای این ماژول پیدا نشد.
            </div>
          ) : null}
        </div>
      );
    }

    if (actionType === 'create_related_record') {
      const targetModuleId = String(config.target_module_id || '');
      const sourceModuleId = String(
        config.source_module_id
        || relationSourceModuleOptions?.[0]?.value
        || currentModuleId
      );
      const targetModule = targetModuleId ? MODULES[targetModuleId] : undefined;
      const targetFields = (targetModule?.fields || []).filter(
        (field) => !!field?.key && field?.nature !== 'system'
      );
      const relationFields = targetFields
        .filter(
          (field) =>
            field.type === FieldType.RELATION &&
            String((field.relationConfig as any)?.targetModule || '') === sourceModuleId
        )
        .map((field) => ({ label: getFieldLabel(field), value: field.key }));
      const targetWritableOptions = targetFields.map((field) => ({
        label: getFieldLabel(field),
        value: field.key,
      }));
      const fieldMappings = ensureRequiredMappings(
        targetModuleId,
        String(config.relation_field_key || ''),
        getRelatedFieldMappings(action)
      );
      const requiredFieldKeys = new Set(
        getRequiredTargetFields(targetModuleId, String(config.relation_field_key || '')).map(
          (field) => field.key
        )
      );

      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">ماژول رکورد مرجع</div>
              <Select
                {...commonSelectProps}
                value={config.source_module_id || sourceModuleId}
                disabled={disabled}
                options={relationSourceModuleOptions && relationSourceModuleOptions.length > 0 ? relationSourceModuleOptions : [{ label: currentModuleId, value: currentModuleId }]}
                onChange={(nextVal) => {
                  const nextSourceModuleId = String(nextVal || '');
                  const defaultRelationField =
                    (MODULES[targetModuleId]?.fields || []).find(
                      (field) =>
                        field.type === FieldType.RELATION &&
                        String((field.relationConfig as any)?.targetModule || '') === nextSourceModuleId
                    )?.key || '';
                  updateActionConfig(action.id, {
                    source_module_id: nextSourceModuleId,
                    relation_field_key: defaultRelationField,
                    field_mappings: ensureRequiredMappings(
                      targetModuleId,
                      defaultRelationField,
                      getRelatedFieldMappings(action)
                    ),
                  });
                }}
                placeholder="ماژول رکورد مرجع"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">ماژول رکورد جدید</div>
              <Select
                {...commonSelectProps}
                value={config.target_module_id}
                disabled={disabled}
                options={relatedTargetModuleOptions}
                onChange={(nextVal) => {
                  const nextTargetModuleId = String(nextVal || '');
                  const defaultRelationField =
                    (MODULES[nextTargetModuleId]?.fields || []).find(
                      (field) =>
                        field.type === FieldType.RELATION &&
                        String((field.relationConfig as any)?.targetModule || '') === sourceModuleId
                    )?.key || '';
                  updateActionConfig(action.id, {
                    source_module_id: sourceModuleId,
                    target_module_id: nextVal,
                    relation_field_key: defaultRelationField,
                    field_mappings: ensureRequiredMappings(
                      nextTargetModuleId,
                      defaultRelationField,
                      []
                    ),
                  });
                }}
                placeholder="ماژول رکورد جدید"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">فیلد ارتباط با رکورد مرجع</div>
              <Select
                {...commonSelectProps}
                value={config.relation_field_key}
                disabled={disabled || !targetModuleId}
                options={relationFields}
                onChange={(nextVal) => {
                  const nextRelationFieldKey = String(nextVal || '');
                  updateActionConfig(action.id, {
                    relation_field_key: nextVal,
                    field_mappings: ensureRequiredMappings(
                      targetModuleId,
                      nextRelationFieldKey,
                      getRelatedFieldMappings(action)
                    ),
                  });
                }}
                placeholder="فیلد ارتباط با رکورد مرجع"
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">فیلدهای رکورد جدید</div>
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                disabled={disabled || !targetModuleId}
                onClick={() =>
                  updateRelatedFieldMappings(action.id, (current) => [
                    ...current,
                    {
                      id: createWorkflowId(),
                      field: '',
                      mode: 'static',
                      value: '',
                    },
                  ])
                }
              >
                افزودن فیلد
              </Button>
            </div>

            {fieldMappings.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="فیلدی انتخاب نشده است" />
            ) : (
              fieldMappings.map((mapping) => {
                const targetField = targetFields.find((field) => field.key === mapping.field);
                const isRequiredField = requiredFieldKeys.has(mapping.field);
                return (
                  <div
                    key={mapping.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start rounded-lg border border-gray-100 dark:border-gray-800 p-2"
                  >
                    <div className="md:col-span-5">
                      <div className="mb-1 text-xs text-gray-500">فیلد مقصد</div>
                      <Select
                        {...commonSelectProps}
                        value={mapping.field}
                        disabled={disabled || !targetModuleId}
                        options={targetWritableOptions}
                        onChange={(nextVal) =>
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id
                                ? { ...item, field: nextVal, value: '', source_field: '' }
                                : item
                            )
                          )
                        }
                        placeholder="فیلد مقصد"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <div className="mb-1 text-xs text-gray-500">نوع مقدار</div>
                      <Select
                        {...commonSelectProps}
                        value={mapping.mode}
                        disabled={disabled || !mapping.field}
                        options={[
                          { label: 'مقدار ثابت', value: 'static' },
                          { label: 'از فیلد رکورد جاری', value: 'from_source' },
                          { label: 'از فیلد رکورد مرتبط', value: 'from_related' },
                        ]}
                        onChange={(nextVal) =>
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id
                                ? { ...item, mode: nextVal, value: '', source_field: '' }
                                : item
                            )
                          )
                        }
                        placeholder="نوع مقدار"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <div className="mb-1 text-xs text-gray-500">
                        {mapping.mode === 'from_related'
                          ? 'فیلد رکورد مرتبط'
                          : mapping.mode === 'from_source'
                            ? 'فیلد رکورد جاری'
                            : 'مقدار فیلد'}
                      </div>
                      {mapping.mode === 'from_source' || mapping.mode === 'from_related' ? (
                        <Select
                          {...commonSelectProps}
                          value={mapping.source_field}
                          disabled={disabled || !mapping.field}
                          options={mapping.mode === 'from_related' ? relatedVariableFieldOptions : sourceVariableFieldOptions}
                          onChange={(nextVal) =>
                            updateRelatedFieldMappings(action.id, (current) =>
                              current.map((item) =>
                                item.id === mapping.id ? { ...item, source_field: nextVal } : item
                              )
                            )
                          }
                          placeholder={mapping.mode === 'from_related' ? 'فیلد از رکورد مرتبط' : 'فیلد از رکورد جاری'}
                        />
                      ) : (
                        renderTypedValueInput(targetField, mapping.value, (nextVal) =>
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id ? { ...item, value: nextVal } : item
                            )
                          )
                        )
                      )}
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={disabled || isRequiredField}
                        title={isRequiredField ? 'فیلد اجباری' : undefined}
                        onClick={() =>
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.filter((item) => item.id !== mapping.id)
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-3">
      {safeValue.length === 0 ? (
        <Empty description="اقدامی ثبت نشده است" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        safeValue.map((action, index) => (
          <div
            key={action.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-white/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-6 text-center">{index + 1}</span>
              <div className="flex-1">
                <Select
                  {...commonSelectProps}
                  value={action.type}
                  disabled={disabled}
                  options={actionTypeOptions}
                  onChange={(nextType: WorkflowActionType) =>
                    updateAction(action.id, {
                      type: nextType,
                      config: getDefaultActionConfig(nextType),
                    })
                  }
                  className="w-full"
                />
              </div>
              <Space>
                <Button
                  type="text"
                  icon={<ArrowUpOutlined />}
                  disabled={disabled || index === 0}
                  onClick={() => moveAction(index, -1)}
                />
                <Button
                  type="text"
                  icon={<ArrowDownOutlined />}
                  disabled={disabled || index === safeValue.length - 1}
                  onClick={() => moveAction(index, 1)}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={disabled}
                  onClick={() => removeAction(action.id)}
                />
              </Space>
            </div>
            {renderActionFields(action)}
          </div>
        ))
      )}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addAction} disabled={disabled}>
        افزودن اقدام
      </Button>
    </div>
  );
};

export default WorkflowActionsBuilder;
