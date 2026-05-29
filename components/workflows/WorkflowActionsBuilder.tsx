import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, InputNumber, Space, Switch } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import { FieldType, ModuleField } from '../../types';
import DynamicSelectField from '../DynamicSelectField';
import AdaptiveSelectField from '../AdaptiveSelectField';
import FormulaEditorModal from '../formulas/FormulaEditorModal';
import MessageComposerModal from '../MessageComposerModal';
import PersianDatePicker from '../PersianDatePicker';
import { STORY_GRADIENT_PRESET_LIST } from '../../utils/storyGradients';
import { MODULES } from '../../moduleRegistry';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowActionType,
  WorkflowModuleOption,
  actionTypeOptions,
  createWorkflowRelatedFieldKey,
  createWorkflowMultiRelationFieldKey,
  createWorkflowId,
  parseWorkflowRelatedFieldKey,
} from '../../utils/workflowTypes';
import { normalizeWorkflowValueByFieldType } from '../../utils/filterUtils';
import { supportsWorkflowProcessTemplateActions } from '../../utils/workflowHelpers';
import { createProcessLinkedFieldKey, parseProcessLinkedFieldKey } from '../../utils/processTargets';
import { supabase } from '../../supabaseClient';
import { AdaptivePickerMode, resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { fetchAssigneeDirectory } from '../../utils/referenceData';

const Select = AdaptiveSelectField;

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
  actionOptions?: Array<{ label: string; value: WorkflowActionType }>;
  nextStageFields?: ModuleField[];
  enableNextStageActions?: boolean;
  disabled?: boolean;
  overlayZIndexBase?: number;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  adaptiveMode?: AdaptivePickerMode;
}

type CreateRelatedFieldMapping = {
  id: string;
  field: string;
  mode: 'static' | 'from_source' | 'from_related' | 'formula';
  value?: any;
  source_field?: string;
  formula_name?: string;
  formula_expression_text?: string;
  formula_expression_config?: any;
};

const RUBIKA_RELATED_RECIPIENT_CHECKBOXES: Array<{
  key: 'customer_related' | 'supplier_related' | 'employee_related';
  label: string;
  fieldKeys: string[];
}> = [
  {
    key: 'customer_related',
    label: 'مشتری مرتبط',
    fieldKeys: ['customer_id', 'related_customer'],
  },
  {
    key: 'supplier_related',
    label: 'تامین‌کننده مرتبط',
    fieldKeys: ['supplier_id', 'related_supplier'],
  },
  {
    key: 'employee_related',
    label: 'کارمند مرتبط',
    fieldKeys: [WORKFLOW_ASSIGNEE_FIELD_KEY],
  },
];

const getDefaultActionConfig = (type: WorkflowActionType): Record<string, any> => {
  switch (type) {
    case 'send_note':
    case 'send_note_sms':
      return {
        recipient_fields: [],
        recipient_assignees: [],
        note_text: '',
        attachment_fields: [],
        variable_field: '',
        variable_target: 'note_text',
      };
    case 'send_sms':
      return {
        recipient_fields: [],
        recipient_assignees: [],
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
    case 'send_bot_message':
    case 'send_telegram_bot':
    case 'send_bale_bot':
    case 'send_rubika_bot':
      return {
        recipient_fields: [],
        recipient_assignees: [],
        manual_chat_ids: [],
        title: '',
        message: '',
        attachment_fields: [],
        variable_field: '',
        variable_target: 'message',
      };
    case 'update_record':
    case 'send_to_next_stages':
      return { field: '', value_mode: 'static', value: null, source_field: '' };
    case 'create_standalone_record':
      return { target_module_id: '', field_mappings: [] };
    case 'create_related_record':
      return { source_module_id: '', target_module_id: '', relation_field_key: '', field_mappings: [] };
    case 'copy_process_template':
    case 'execute_process':
      return { template_id: '' };
    case 'publish_story':
      return {
        slide_type: 'gradient',
        gradient_key: 'brand_indigo',
        text_template: '',
        expires_hours: 24,
        is_org_wide: true,
        mention_user_ids: [],
        viewer_user_ids: [],
        viewer_role_ids: [],
        notify_sms: false,
        sms_template: '',
        sms_recipient_role_ids: [],
      };
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

const FORMULA_COMPATIBLE_FIELD_TYPES = new Set<FieldType>([
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.STOCK,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);

const canFieldUseFormula = (field?: ModuleField | null) =>
  !!field && FORMULA_COMPATIBLE_FIELD_TYPES.has(field.type);

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
  actionOptions,
  nextStageFields,
  enableNextStageActions = false,
  disabled = false,
  overlayZIndexBase = 1400,
  popupContainer: popupContainerProp,
  adaptiveMode = 'auto',
}) => {
  const safeValue = Array.isArray(value) ? value : [];
  const [templateModalTarget, setTemplateModalTarget] = useState<{ actionId: string; fieldKey: string; title: string } | null>(null);
  const [formulaModalTarget, setFormulaModalTarget] = useState<
    | { mode: 'action'; actionId: string; fieldKey: string }
    | { mode: 'mapping'; actionId: string; mappingId: string; fieldKey: string }
    | null
  >(null);
  const popupContainer = useCallback(
    (node?: HTMLElement | null) => popupContainerProp?.(node) || resolveOverlayPopupContainer(node),
    [popupContainerProp]
  );

  const commonSelectProps = {
    showSearch: true,
    optionFilterProp: 'label' as const,
    getPopupContainer: popupContainer,
    modalContainer: popupContainer,
    popupMatchSelectWidth: false,
    listHeight: 260,
    virtual: false,
    overlayZIndexBase,
    adaptiveMode,
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
  const nextStageFieldOptions = useMemo(
    () =>
      (Array.isArray(nextStageFields) ? nextStageFields : [])
        .filter((f) => !!f?.key && f?.readonly !== true && f?.nature !== 'system')
        .map((field) => ({
          label: getFieldLabel(field),
          value: field.key,
        })),
    [nextStageFields]
  );

  const variableFieldOptions = useMemo(
    () =>
      (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields)
        .filter((f) => !!f?.key)
        .map((field) => ({
          label: getFieldLabel(field),
          value: field.key,
        })),
    [currentModuleFields, variableFields]
  );
  const communicationFieldSource = useMemo(
    () => (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields),
    [currentModuleFields, variableFields]
  );
  const attachmentFieldSource = useMemo(
    () => Array.from(
      new Map(
        [
          ...(Array.isArray(variableFields) ? variableFields : []),
          ...currentModuleFields,
        ]
          .filter((field) => !!String(field?.key || '').trim())
          .map((field) => [String(field.key), field] as const)
      ).values()
    ),
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
      communicationFieldSource
        .filter((field) => {
          const key = String(field?.key || '');
          return key === '__workflow_assignee'
            || key === '__task____workflow_assignee'
            || key.endsWith('____workflow_assignee')
            || key.startsWith('__comm_recipient__');
        })
        .map((field) => ({ label: getFieldLabel(field), value: field.key })),
    [communicationFieldSource]
  );
  const recipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...((additionalRecipientFieldOptions || []).map((item) => [String(item.value), item] as const)),
      ...assigneeRecipientFieldOptions.map((item) => [String(item.value), item] as const),
    ]).values()),
    [additionalRecipientFieldOptions, assigneeRecipientFieldOptions]
  );
  const getMultiRelationTargetFieldOptions = useCallback((
    matcher: (targetField: ModuleField) => boolean,
    fallbackLabel: string,
  ) =>
    communicationFieldSource
      .filter((field) => field.type === FieldType.MULTI_RELATION && field.multiRelationConfig?.targetModule)
      .flatMap((field) => {
        const targetModuleId = String(field.multiRelationConfig?.targetModule || '').trim();
        const targetFields = MODULES[targetModuleId]?.fields || [];
        return targetFields
          .filter((targetField) => !!String(targetField?.key || '').trim() && matcher(targetField))
          .map((targetField) => ({
            label: `${getFieldLabel(field)} (${String(targetField?.labels?.fa || fallbackLabel || targetField.key).trim() || fallbackLabel})`,
            value: createWorkflowMultiRelationFieldKey(
              field.key,
              targetModuleId,
              String(targetField.key || '').trim(),
            ),
          }));
      }),
    [communicationFieldSource]
  );
  const multiRelationProfileRecipientFields = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => {
        const key = String(targetField?.key || '').trim();
        return key === 'related_profile_id' || key === 'id';
      },
      'کاربر مرتبط',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const noteRecipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...multiRelationProfileRecipientFields.map((item) => [String(item.value), item] as const),
    ]).values()),
    [recipientFieldOptions, multiRelationProfileRecipientFields]
  );
  const multiRelationPhoneFieldOptions = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => targetField.type === FieldType.PHONE || /mobile|phone/i.test(String(targetField?.key || '')),
      'شماره',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const multiRelationEmailFieldOptions = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => /email/i.test(String(targetField?.key || '')),
      'ایمیل',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const multiRelationTelegramFieldOptions = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => String(targetField?.key || '').trim() === 'telegram_chat_id',
      'تلگرام',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const multiRelationBaleFieldOptions = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => String(targetField?.key || '').trim() === 'bale_chat_id',
      'بله',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const multiRelationRubikaFieldOptions = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField) => String(targetField?.key || '').trim() === 'rubika_chat_id',
      'روبیکا',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const assigneeDirectoryOptions = useMemo(() => {
    const optionsByValue = new Map<string, { label: string; value: string }>();
    Object.entries(relationOptions || {}).forEach(([fieldKey, items]) => {
      const normalizedFieldKey = String(fieldKey || '').trim();
      const isAssigneeField =
        normalizedFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
        || normalizedFieldKey === `__task__${WORKFLOW_ASSIGNEE_FIELD_KEY}`
        || normalizedFieldKey.endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
        || normalizedFieldKey.endsWith(`::${WORKFLOW_ASSIGNEE_FIELD_KEY}`);
      if (!isAssigneeField) return;
      (Array.isArray(items) ? items : []).forEach((item) => {
        const value = String(item?.value || '').trim();
        const label = String(item?.label || item?.value || '').trim();
        if (!value || !label || optionsByValue.has(value)) return;
        optionsByValue.set(value, { label, value });
      });
    });
    return Array.from(optionsByValue.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }, [relationOptions]);
  const [chatGroupOptions, setChatGroupOptions] = useState<Array<{ label: string; value: string }>>([]);
  useEffect(() => {
    let cancelled = false;

    const loadChatGroups = async () => {
      const { data, error } = await supabase
        .from('chat_groups')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(300);
      if (cancelled) return;
      if (error) {
        setChatGroupOptions([]);
        return;
      }
      setChatGroupOptions(
        (data || [])
          .map((row: any) => {
            const id = String(row?.id || '').trim();
            const name = String(row?.name || '').trim() || 'گروه';
            return id ? { label: `گروه داخلی: ${name}`, value: `chat_group:${id}` } : null;
          })
          .filter((item): item is { label: string; value: string } => Boolean(item))
      );
    };

    void loadChatGroups();
    return () => {
      cancelled = true;
    };
  }, []);
  const noteAssigneeDirectoryOptions = useMemo(
    () => Array.from(new Map([
      ...assigneeDirectoryOptions.map((item) => [String(item.value), item] as const),
      ...chatGroupOptions.map((item) => [String(item.value), item] as const),
    ]).values()).sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    [assigneeDirectoryOptions, chatGroupOptions]
  );
  const [storyMentionUserOptions, setStoryMentionUserOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [storyViewerRoleOptions, setStoryViewerRoleOptions] = useState<Array<{ label: string; value: string }>>([]);
  useEffect(() => {
    let cancelled = false;

    const loadStoryAudienceDirectory = async () => {
      const directory = await fetchAssigneeDirectory(supabase);
      if (cancelled) return;

      setStoryMentionUserOptions(
        directory.users.map((user) => ({
          label: user.display_name,
          value: user.id,
        }))
      );
      setStoryViewerRoleOptions(
        directory.roles
          .filter((role) => !role.is_system)
          .map((role) => ({
            label: role.title,
            value: role.id,
          }))
      );
    };

    void loadStoryAudienceDirectory();
    return () => {
      cancelled = true;
    };
  }, []);
  const templateVariableOptions = useMemo(
    () =>
      (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields)
        .filter((field) => !!String(field?.key || '').trim())
        .map((field) => {
          const key = String(field?.key || '').trim();
          return {
            key,
            label: String(field?.labels?.fa || field?.key || '').trim() || key,
            token: `{{${key}}}`,
          };
        }),
    [currentModuleFields, variableFields]
  );
  const formulaVariableOptions = useMemo(
    () => templateVariableOptions.map((item) => ({
      label: item.label,
      token: item.token,
    })),
    [templateVariableOptions]
  );
  const noteAttachmentFieldOptions = useMemo(() => {
    const optionsByValue = new Map<string, { label: string; value: string }>();
    const addOption = (value: string, label: string) => {
      const normalizedValue = String(value || '').trim();
      const normalizedLabel = String(label || '').trim();
      if (!normalizedValue || !normalizedLabel || optionsByValue.has(normalizedValue)) return;
      optionsByValue.set(normalizedValue, {
        label: normalizedLabel,
        value: normalizedValue,
      });
    };

    attachmentFieldSource
      .filter((field) => field.type === FieldType.IMAGE && !!String(field?.key || '').trim())
      .forEach((field) => addOption(String(field.key), getFieldLabel(field)));

    const relatedRefs = new Map<string, { relationFieldKey: string; targetModuleId: string }>();
    attachmentFieldSource.forEach((field) => {
      const parsed = parseWorkflowRelatedFieldKey(String(field?.key || ''));
      if (!parsed) return;
      const relationFieldKey = String(parsed.relationFieldKey || '').trim();
      const targetModuleId = String(parsed.targetModuleId || '').trim();
      if (!relationFieldKey || !targetModuleId) return;
      relatedRefs.set(`${relationFieldKey}::${targetModuleId}`, { relationFieldKey, targetModuleId });
    });

    relatedRefs.forEach(({ relationFieldKey, targetModuleId }) => {
      const targetModule = MODULES[targetModuleId];
      if (!targetModule) return;
      const targetTitle = String(targetModule?.titles?.fa || targetModuleId).trim() || targetModuleId;
      (targetModule.fields || [])
        .filter((field) => field.type === FieldType.IMAGE && !!String(field?.key || '').trim())
        .forEach((field) => {
          const fieldLabel = String(field?.labels?.fa || field?.key || '').trim() || String(field.key);
          addOption(
            createWorkflowRelatedFieldKey(relationFieldKey, targetModuleId, String(field.key)),
            `${fieldLabel} (${targetTitle})`
          );
        });
    });

    const linkedModuleIds = new Set<string>();
    attachmentFieldSource.forEach((field) => {
      const parsed = parseProcessLinkedFieldKey(String(field?.key || ''));
      if (!parsed?.moduleId) return;
      linkedModuleIds.add(String(parsed.moduleId).trim());
    });

    linkedModuleIds.forEach((linkedModuleId) => {
      const targetModule = MODULES[linkedModuleId];
      if (!targetModule) return;
      const targetTitle = String(targetModule?.titles?.fa || linkedModuleId).trim() || linkedModuleId;
      (targetModule.fields || [])
        .filter((field) => field.type === FieldType.IMAGE && !!String(field?.key || '').trim())
        .forEach((field) => {
          const fieldLabel = String(field?.labels?.fa || field?.key || '').trim() || String(field.key);
          addOption(
            createProcessLinkedFieldKey(linkedModuleId, String(field.key)),
            `${fieldLabel} (${targetTitle})`
          );
        });
    });

    return Array.from(optionsByValue.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }, [attachmentFieldSource]);

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
  const effectiveActionTypeOptions = useMemo(() => {
    const supplementalOptions: Array<{ label: string; value: WorkflowActionType }> = [
      { label: 'ارسال یادداشت + اطلاع‌رسانی پیامکی', value: 'send_note_sms' as WorkflowActionType },
    ];
    const baseOptions = actionOptions && actionOptions.length > 0
      ? actionOptions
      : actionTypeOptions.filter((option) => (
          option.value !== 'send_email'
          && (option.value !== 'send_to_next_stages' || enableNextStageActions)
        ));
    const optionsByValue = new Map(
      [...baseOptions, ...supplementalOptions].map((option) => [String(option.value), option] as const)
    );
    safeValue.forEach((action) => {
      const actionType = String(action?.type || '') as WorkflowActionType;
      if (!actionType || optionsByValue.has(actionType)) return;
      const legacyOption = actionTypeOptions.find((option) => option.value === actionType);
      if (legacyOption) {
        optionsByValue.set(actionType, { ...legacyOption, label: `${legacyOption.label} (غیرفعال)` });
      }
    });
    return Array.from(optionsByValue.values());
  }, [actionOptions, enableNextStageActions, safeValue]);

  const addAction = () => {
    const type = effectiveActionTypeOptions[0]?.value || 'send_note';
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

  const appendTemplateTextToActionField = useCallback((actionId: string, fieldKey: string, insertedText: string) => {
    const normalizedText = String(insertedText || '');
    if (!normalizedText) return;
    const action = safeValue.find((item) => item.id === actionId);
    const currentValue = String(action?.config?.[fieldKey] || '');
    const nextValue = currentValue
      ? `${currentValue}${currentValue.endsWith('\n') ? '' : '\n'}${normalizedText}`
      : normalizedText;
    updateActionConfig(actionId, { [fieldKey]: nextValue });
  }, [safeValue]);

  const openTemplateModal = useCallback((actionId: string, fieldKey: string, title: string) => {
    setTemplateModalTarget({ actionId, fieldKey, title });
  }, []);

  const renderMessageTemplateButton = useCallback((actionId: string, fieldKey: string, title: string) => (
    <Button
      size="small"
      icon={<SnippetsOutlined />}
      disabled={disabled}
      onClick={() => openTemplateModal(actionId, fieldKey, title)}
    >
      پیام‌های آماده
    </Button>
  ), [disabled, openTemplateModal]);

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
    const fieldKey = String(field.key || '').trim();
    const hasAssigneeDirectoryOptions =
      fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
      || fieldKey === `__task__${WORKFLOW_ASSIGNEE_FIELD_KEY}`
      || fieldKey.endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
      || fieldKey.endsWith(`::${WORKFLOW_ASSIGNEE_FIELD_KEY}`);
    if (hasAssigneeDirectoryOptions && relationOptions[field.key]) {
      return (relationOptions[field.key] || []).map((opt) => ({
        label: String(opt?.label || opt?.value || '-'),
        value: String(opt?.value || ''),
      }));
    }
    if (
      field.type === FieldType.RELATION
      || field.type === FieldType.MULTI_RELATION
      || field.type === FieldType.USER
    ) {
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
          getPopupContainer={popupContainer as any}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={field?.labels?.fa || field.key}
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
      field.type === FieldType.MULTI_RELATION ||
      field.type === FieldType.USER
    ) {
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          mode={field.type === FieldType.MULTI_RELATION ? 'multiple' : undefined}
          value={field.type === FieldType.MULTI_RELATION
            ? (Array.isArray(value) ? value : value ? [value] : [])
            : value}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          className="w-full"
          placeholder="مقدار"
          pickerTitle={field?.labels?.fa || field.key}
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
          modalContainer={popupContainer}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={field?.labels?.fa || field.key}
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
          modalContainer={popupContainer}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={field?.labels?.fa || field.key}
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
          modalContainer={popupContainer}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={field?.labels?.fa || field.key}
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
          <AdaptiveSelectField
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
            pickerTitle="فیلد متغیر"
          />
          {targets.length > 1 ? (
            <AdaptiveSelectField
              {...commonSelectProps}
              value={selectedTarget}
              options={targets.map((item) => ({ label: item.label, value: item.key }))}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { variable_target: nextVal })}
              placeholder="محل درج متغیر"
              pickerTitle="محل درج متغیر"
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
    const targetFields = action.type === 'send_to_next_stages'
      ? (Array.isArray(nextStageFields) ? nextStageFields : [])
      : currentModuleFields;
    const targetField = targetFields.find((f) => f.key === targetFieldKey);
    const valueMode = String(action?.config?.value_mode || 'static');
    if (valueMode === 'from_source' || valueMode === 'from_related') {
      const options = valueMode === 'from_related' ? relatedVariableFieldOptions : sourceVariableFieldOptions;
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          value={action?.config?.source_field}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => updateActionConfig(action.id, { source_field: nextVal })}
          placeholder={valueMode === 'from_related' ? 'فیلد رکورد مرتبط' : 'فیلد رکورد جاری'}
          pickerTitle={valueMode === 'from_related' ? 'فیلد رکورد مرتبط' : 'فیلد رکورد جاری'}
        />
      );
    }
    if (valueMode === 'formula') {
      const hasFormula = !!String(action?.config?.formula_expression_text || '').trim();
      return (
        <div className="space-y-2">
          <Button
            block
            disabled={disabled || !canFieldUseFormula(targetField)}
            onClick={() => setFormulaModalTarget({ mode: 'action', actionId: action.id, fieldKey: targetFieldKey })}
          >
            {hasFormula ? 'ویرایش فرمول' : 'ساخت فرمول'}
          </Button>
          <div className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 dark:border-gray-700">
            {hasFormula
              ? String(action?.config?.formula_expression_text || '').trim()
              : (canFieldUseFormula(targetField)
                ? 'هنوز فرمولی ثبت نشده است.'
                : 'فرمول فقط برای فیلدهای عددی/مبلغی فعال است.')}
          </div>
        </div>
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

    if (actionType === 'send_note' || actionType === 'send_note_sms') {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={noteRecipientFieldOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="گیرنده‌های یادداشت از روی فیلدها"
              className="w-full"
              maxTagCount="responsive"
            />
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_assignees) ? config.recipient_assignees : []}
              disabled={disabled}
              options={noteAssigneeDirectoryOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_assignees: nextVal })}
              placeholder="انتخاب کاربر/نقش/گروه داخلی تکمیلی (اختیاری)"
              className="w-full"
              maxTagCount="responsive"
            />
          </div>
          <div className="text-xs text-gray-500">فیلدهای تصویر/فایل پیوست</div>
          <Select
            {...commonSelectProps}
            mode="multiple"
            value={Array.isArray(config.attachment_fields) ? config.attachment_fields : []}
            disabled={disabled || noteAttachmentFieldOptions.length === 0}
            options={noteAttachmentFieldOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { attachment_fields: nextVal })}
            placeholder={noteAttachmentFieldOptions.length > 0 ? 'فیلدهای تصویر/فایل' : 'فیلد تصویری مرتبطی پیدا نشد'}
            className="w-full"
            maxTagCount="responsive"
          />
          <div className="flex justify-end">
            {renderMessageTemplateButton(action.id, 'note_text', 'پیام‌های آماده یادداشت')}
          </div>
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
      const phoneFields = communicationFieldSource
        .filter((f) => f.type === FieldType.PHONE || /mobile|phone/i.test(f.key))
        .map((f) => ({ label: getFieldLabel(f), value: f.key }));
      const smsRecipientOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...phoneFields.map((item) => [String(item.value), item] as const),
        ...multiRelationPhoneFieldOptions.map((item) => [String(item.value), item] as const),
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
              placeholder="فیلدهای مقصد شماره تماس"
            />
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_assignees) ? config.recipient_assignees : []}
              disabled={disabled}
              options={noteAssigneeDirectoryOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_assignees: nextVal })}
              placeholder="انتخاب کاربر/نقش/گروه داخلی تکمیلی (اختیاری)"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="tags"
              value={Array.isArray(config.manual_numbers) ? config.manual_numbers : []}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { manual_numbers: nextVal })}
              tokenSeparators={[',', ';', ' ']}
              placeholder="شماره‌های دستی"
            />
          </div>
          <div className="flex justify-end">
            {renderMessageTemplateButton(action.id, 'message', 'پیام‌های آماده پیامک')}
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
      const emailFields = communicationFieldSource
        .filter((f) => /email/i.test(f.key))
        .map((f) => ({ label: getFieldLabel(f), value: f.key }));
      const emailRecipientOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...emailFields.map((item) => [String(item.value), item] as const),
        ...multiRelationEmailFieldOptions.map((item) => [String(item.value), item] as const),
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
          <div className="flex justify-end">
            {renderMessageTemplateButton(action.id, 'body', 'پیام‌های آماده ایمیل')}
          </div>
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

    if (actionType === 'send_bot_message') {
      const botRecipientFieldOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...multiRelationProfileRecipientFields.map((item) => [String(item.value), item] as const),
        ...multiRelationRubikaFieldOptions.map((item) => [String(item.value), item] as const),
        ...multiRelationTelegramFieldOptions.map((item) => [String(item.value), item] as const),
        ...multiRelationBaleFieldOptions.map((item) => [String(item.value), item] as const),
      ]).values());
      const selectedRecipientFields = Array.isArray(config.recipient_fields)
        ? config.recipient_fields.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [];
      const selectedCheckboxKeys = new Set(
        RUBIKA_RELATED_RECIPIENT_CHECKBOXES
          .filter((item) => item.fieldKeys.some((fieldKey) => selectedRecipientFields.includes(fieldKey)))
          .map((item) => item.key)
      );
      if ((Array.isArray(config.recipient_assignees) ? config.recipient_assignees : []).length > 0) {
        selectedCheckboxKeys.add('employee_related');
      }

      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.45)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
            پلتفرم ارسال بر اساس تنظیمات پیش‌فرض بات هر مشتری/تامین‌کننده تعیین می‌شود.
            اگر مقصدی انتخاب نکنید، گیرنده از اتصال بات مشتری/تامین‌کننده رکورد جاری تشخیص داده می‌شود.
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2">
            <div className="mb-2 text-xs text-gray-500">گیرنده‌های مرتبط</div>
            <Space size={[12, 8]} wrap>
              {RUBIKA_RELATED_RECIPIENT_CHECKBOXES.map((item) => {
                const checked = selectedCheckboxKeys.has(item.key);
                return (
                  <Checkbox
                    key={item.key}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const nextChecked = !!e.target.checked;
                      const nextSelectedKeys = new Set(selectedCheckboxKeys);
                      if (nextChecked) nextSelectedKeys.add(item.key);
                      else nextSelectedKeys.delete(item.key);
                      const nextRecipientFields = Array.from(
                        new Set(
                          RUBIKA_RELATED_RECIPIENT_CHECKBOXES
                            .filter((entry) => nextSelectedKeys.has(entry.key))
                            .flatMap((entry) => entry.fieldKeys)
                        )
                      );
                      updateActionConfig(action.id, {
                        recipient_fields: nextRecipientFields,
                        recipient_assignees: [],
                      });
                    }}
                  >
                    {item.label}
                  </Checkbox>
                );
              })}
            </Space>
          </div>
          <Select
            {...commonSelectProps}
            mode="multiple"
            value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
            disabled={disabled}
            options={botRecipientFieldOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
            placeholder="فیلدهای اختصاصی گیرنده (اختیاری)"
            maxTagCount="responsive"
          />
          <Input
            value={config.title}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { title: e.target.value })}
            placeholder="عنوان پیام (اختیاری)"
          />
          <div className="flex justify-end">
            {renderMessageTemplateButton(action.id, 'message', 'پیام‌های آماده')}
          </div>
          <Input.TextArea
            rows={4}
            value={config.message}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { message: e.target.value })}
            placeholder="متن پیام"
          />
          <div className="text-xs text-gray-500">فیلدهای تصویر/فایل برای ارسال پیوست</div>
          <Select
            {...commonSelectProps}
            mode="multiple"
            value={Array.isArray(config.attachment_fields) ? config.attachment_fields : []}
            disabled={disabled || noteAttachmentFieldOptions.length === 0}
            options={noteAttachmentFieldOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { attachment_fields: nextVal })}
            placeholder={noteAttachmentFieldOptions.length > 0 ? 'فیلدهای تصویر/فایل' : 'فیلد تصویری مرتبطی پیدا نشد'}
            className="w-full"
            maxTagCount="responsive"
          />
          {renderVariableTools(action, [
            { key: 'title', label: 'عنوان پیام' },
            { key: 'message', label: 'متن پیام' },
          ])}
        </div>
      );
    }

    if (actionType === 'send_telegram_bot' || actionType === 'send_bale_bot' || actionType === 'send_rubika_bot') {
      const isTelegram = actionType === 'send_telegram_bot';
      const isRubika = actionType === 'send_rubika_bot';
      const providerLabel = isRubika ? 'روبیکا' : (isTelegram ? 'تلگرام' : 'بله');
      const botRecipientFieldOptions = Array.from(new Map([
        ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
        ...multiRelationProfileRecipientFields.map((item) => [String(item.value), item] as const),
        ...(isRubika
          ? multiRelationRubikaFieldOptions.map((item) => [String(item.value), item] as const)
          : isTelegram
            ? multiRelationTelegramFieldOptions.map((item) => [String(item.value), item] as const)
            : multiRelationBaleFieldOptions.map((item) => [String(item.value), item] as const)),
      ]).values());
      const selectedRecipientFields = Array.isArray(config.recipient_fields)
        ? config.recipient_fields.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [];
      const selectedRubikaCheckboxKeys = new Set(
        RUBIKA_RELATED_RECIPIENT_CHECKBOXES
          .filter((item) => item.fieldKeys.some((fieldKey) => selectedRecipientFields.includes(fieldKey)))
          .map((item) => item.key)
      );
      if ((Array.isArray(config.recipient_assignees) ? config.recipient_assignees : []).length > 0) {
        selectedRubikaCheckboxKeys.add('employee_related');
      }

      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.45)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
            اگر مقصدی انتخاب نکنید، گیرنده از اتصال بات مشتری/تامین‌کننده رکورد جاری تشخیص داده می‌شود.
          </div>
          {isRubika ? (
            <div className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2">
              <div className="mb-2 text-xs text-gray-500">گیرنده‌های مرتبط (روبیکا)</div>
              <Space size={[12, 8]} wrap>
                {RUBIKA_RELATED_RECIPIENT_CHECKBOXES.map((item) => {
                  const checked = selectedRubikaCheckboxKeys.has(item.key);
                  return (
                    <Checkbox
                      key={item.key}
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        const nextChecked = !!e.target.checked;
                        const nextSelectedKeys = new Set(selectedRubikaCheckboxKeys);
                        if (nextChecked) nextSelectedKeys.add(item.key);
                        else nextSelectedKeys.delete(item.key);
                        const nextRecipientFields = Array.from(
                          new Set(
                            RUBIKA_RELATED_RECIPIENT_CHECKBOXES
                              .filter((entry) => nextSelectedKeys.has(entry.key))
                              .flatMap((entry) => entry.fieldKeys)
                          )
                        );
                        updateActionConfig(action.id, {
                          recipient_fields: nextRecipientFields,
                          recipient_assignees: [],
                        });
                      }}
                    >
                      {item.label}
                    </Checkbox>
                  );
                })}
              </Space>
            </div>
          ) : null}
          {!isRubika ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select
                {...commonSelectProps}
                mode="multiple"
                value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
                disabled={disabled}
                options={botRecipientFieldOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
                placeholder={`فیلدهای گیرنده ${providerLabel}`}
                maxTagCount="responsive"
              />
              <Select
                {...commonSelectProps}
                mode="multiple"
                value={Array.isArray(config.recipient_assignees) ? config.recipient_assignees : []}
                disabled={disabled}
                options={assigneeDirectoryOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { recipient_assignees: nextVal })}
                placeholder="کاربر/نقش تکمیلی (اختیاری)"
                maxTagCount="responsive"
              />
            </div>
          ) : null}
          {isRubika ? (
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={botRecipientFieldOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="فیلدهای اختصاصی گیرنده روبیکا"
              maxTagCount="responsive"
            />
          ) : null}
          <Input
            value={config.title}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { title: e.target.value })}
            placeholder={`عنوان پیام (${providerLabel})`}
          />
          <div className="flex justify-end">
            {renderMessageTemplateButton(action.id, 'message', `پیام‌های آماده ${providerLabel}`)}
          </div>
          <Input.TextArea
            rows={4}
            value={config.message}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { message: e.target.value })}
            placeholder={`متن پیام (${providerLabel})`}
          />
          {isRubika ? (
            <>
              <div className="text-xs text-gray-500">فیلدهای تصویر/فایل برای ارسال در روبیکا</div>
              <Select
                {...commonSelectProps}
                mode="multiple"
                value={Array.isArray(config.attachment_fields) ? config.attachment_fields : []}
                disabled={disabled || noteAttachmentFieldOptions.length === 0}
                options={noteAttachmentFieldOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { attachment_fields: nextVal })}
                placeholder={noteAttachmentFieldOptions.length > 0 ? 'فیلدهای تصویر/فایل' : 'فیلد تصویری مرتبطی پیدا نشد'}
                className="w-full"
                maxTagCount="responsive"
              />
            </>
          ) : null}
          {renderVariableTools(action, [
            { key: 'title', label: `عنوان پیام (${providerLabel})` },
            { key: 'message', label: `متن پیام (${providerLabel})` },
          ])}
        </div>
      );
    }
    if (actionType === 'update_record' || actionType === 'send_to_next_stages') {
      const targetOptions = actionType === 'send_to_next_stages'
        ? nextStageFieldOptions
        : updatableFieldOptions;
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="space-y-1 md:col-span-5">
            <div className="text-xs text-gray-500">فیلد مقصد</div>
            <Select
              {...commonSelectProps}
              value={config.field}
              disabled={disabled || (actionType === 'send_to_next_stages' && targetOptions.length === 0)}
              options={targetOptions}
              onChange={(nextVal) => updateActionConfig(action.id, {
                field: nextVal,
                value: null,
                source_field: '',
                formula_name: '',
                formula_expression_text: '',
                formula_expression_config: null,
                value_mode: 'static',
              })}
              placeholder={actionType === 'send_to_next_stages' && targetOptions.length === 0 ? 'مرحله بعدی برای ارسال اطلاعات پیدا نشد' : 'فیلد مقصد'}
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
                ...(canFieldUseFormula(
                  (actionType === 'send_to_next_stages'
                    ? (Array.isArray(nextStageFields) ? nextStageFields : [])
                    : currentModuleFields
                  ).find((field) => field.key === String(config.field || '').trim())
                ) ? [{ label: 'محاسبه با فرمول', value: 'formula' }] : []),
              ]}
              onChange={(nextVal) => updateActionConfig(action.id, {
                value_mode: nextVal,
                value: null,
                source_field: '',
                formula_name: '',
                formula_expression_text: '',
                formula_expression_config: null,
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
                  : (config.value_mode || 'static') === 'formula'
                    ? 'فرمول محاسبه'
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

    if (actionType === 'create_standalone_record') {
      const targetModuleId = String(config.target_module_id || '');
      const targetModule = targetModuleId ? MODULES[targetModuleId] : undefined;
      const targetFields = (targetModule?.fields || []).filter(
        (field) => !!field?.key && field?.nature !== 'system' && field?.readonly !== true
      );
      const targetWritableOptions = targetFields.map((field) => ({
        label: getFieldLabel(field),
        value: field.key,
      }));
      const fieldMappings: CreateRelatedFieldMapping[] = Array.isArray(config.field_mappings)
        ? config.field_mappings
        : [];

      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="text-xs text-gray-500">ماژول رکورد جدید</div>
            <Select
              {...commonSelectProps}
              value={config.target_module_id}
              disabled={disabled}
              options={moduleOptions}
              onChange={(nextVal) => {
                updateActionConfig(action.id, {
                  target_module_id: nextVal,
                  field_mappings: [],
                });
              }}
              placeholder="انتخاب ماژول"
            />
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
                  updateActionConfig(action.id, {
                    field_mappings: [
                      ...fieldMappings,
                      { id: createWorkflowId(), field: '', mode: 'static', value: '' },
                    ],
                  })
                }
              >
                افزودن فیلد
              </Button>
            </div>

            {fieldMappings.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="فیلدی تنظیم نشده است" />
            ) : (
              fieldMappings.map((mapping) => {
                const targetField = targetFields.find((f) => f.key === mapping.field);
                return (
                  <div
                    key={mapping.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start rounded-lg border border-gray-100 dark:border-gray-800 p-2"
                  >
                    <div className="md:col-span-4">
                      <div className="mb-1 text-xs text-gray-500">فیلد مقصد</div>
                      <Select
                        {...commonSelectProps}
                        value={mapping.field}
                        disabled={disabled || !targetModuleId}
                        options={targetWritableOptions}
                        onChange={(nextVal) =>
                          updateActionConfig(action.id, {
                            field_mappings: fieldMappings.map((item) =>
                              item.id === mapping.id
                                ? { ...item, field: nextVal, value: '', source_field: '', mode: 'static' }
                                : item
                            ),
                          })
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
                          ...(canFieldUseFormula(targetField) ? [{ label: 'محاسبه با فرمول', value: 'formula' }] : []),
                        ]}
                        onChange={(nextVal) =>
                          updateActionConfig(action.id, {
                            field_mappings: fieldMappings.map((item) =>
                              item.id === mapping.id
                                ? { ...item, mode: nextVal, value: '', source_field: '' }
                                : item
                            ),
                          })
                        }
                        placeholder="نوع"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <div className="mb-1 text-xs text-gray-500">مقدار</div>
                      {mapping.mode === 'from_source' ? (
                        <Select
                          {...commonSelectProps}
                          value={mapping.source_field}
                          disabled={disabled}
                          options={sourceVariableFieldOptions}
                          onChange={(nextVal) =>
                            updateActionConfig(action.id, {
                              field_mappings: fieldMappings.map((item) =>
                                item.id === mapping.id ? { ...item, source_field: nextVal } : item
                              ),
                            })
                          }
                          placeholder="فیلد منبع"
                        />
                      ) : mapping.mode === 'formula' ? (
                        <Button
                          size="small"
                          icon={<SnippetsOutlined />}
                          disabled={disabled}
                          onClick={() =>
                            setFormulaModalTarget({
                              mode: 'mapping',
                              actionId: action.id,
                              mappingId: mapping.id,
                              fieldKey: mapping.field,
                            })
                          }
                        >
                          {mapping.formula_name || 'تعریف فرمول'}
                        </Button>
                      ) : (
                        <Input
                          disabled={disabled}
                          value={mapping.value ?? ''}
                          onChange={(e) =>
                            updateActionConfig(action.id, {
                              field_mappings: fieldMappings.map((item) =>
                                item.id === mapping.id ? { ...item, value: e.target.value } : item
                              ),
                            })
                          }
                          placeholder="مقدار"
                        />
                      )}
                    </div>
                    <div className="flex justify-end md:col-span-1">
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={disabled}
                        onClick={() =>
                          updateActionConfig(action.id, {
                            field_mappings: fieldMappings.filter((item) => item.id !== mapping.id),
                          })
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
                                ? {
                                    ...item,
                                    field: nextVal,
                                    value: '',
                                    source_field: '',
                                    mode: 'static',
                                    formula_name: '',
                                    formula_expression_text: '',
                                    formula_expression_config: null,
                                  }
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
                          ...(canFieldUseFormula(targetField) ? [{ label: 'محاسبه با فرمول', value: 'formula' }] : []),
                        ]}
                        onChange={(nextVal) =>
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id
                                ? {
                                    ...item,
                                    mode: nextVal,
                                    value: '',
                                    source_field: '',
                                    formula_name: '',
                                    formula_expression_text: '',
                                    formula_expression_config: null,
                                  }
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
                            : mapping.mode === 'formula'
                              ? 'فرمول محاسبه'
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
                      ) : mapping.mode === 'formula' ? (
                        <div className="space-y-2">
                          <Button
                            block
                            disabled={disabled || !canFieldUseFormula(targetField)}
                            onClick={() => setFormulaModalTarget({
                              mode: 'mapping',
                              actionId: action.id,
                              mappingId: mapping.id,
                              fieldKey: String(mapping.field || ''),
                            })}
                          >
                            {String(mapping?.formula_expression_text || '').trim() ? 'ویرایش فرمول' : 'ساخت فرمول'}
                          </Button>
                          <div className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 dark:border-gray-700">
                            {String(mapping?.formula_expression_text || '').trim() || 'هنوز فرمولی ثبت نشده است.'}
                          </div>
                        </div>
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

    if (actionType === 'publish_story') {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.45)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
            این استوری همیشه با هویت «سیستم» منتشر می‌شود و برای آواتار آن از لوگوی سازمان استفاده خواهد شد.
          </div>

          {/* نوع اسلاید */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500">نوع اسلاید</div>
            <Select
              {...commonSelectProps}
              value={config.slide_type || 'gradient'}
              disabled={disabled}
              options={[
                { label: 'گرادینت رنگی', value: 'gradient' },
              ]}
              onChange={(v) => updateActionConfig(action.id, { slide_type: v })}
            />
          </div>

          {/* انتخاب گرادینت */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500">گرادینت پس‌زمینه</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STORY_GRADIENT_PRESET_LIST.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  title={g.label}
                  onClick={() => !disabled && updateActionConfig(action.id, { gradient_key: g.key })}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: g.gradient, cursor: disabled ? 'not-allowed' : 'pointer',
                    border: config.gradient_key === g.key ? '2px solid #3730A3' : '2px solid transparent',
                    padding: 0,
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* قالب متن */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500">متن استوری (می‌توانید از متغیرهایی مثل {'{{field_name}}'} استفاده کنید)</div>
            <Input
              disabled={disabled}
              value={config.text_template || ''}
              onChange={(e) => updateActionConfig(action.id, { text_template: e.target.value })}
              placeholder="متن استوری..."
              style={{ direction: 'rtl' }}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">منشن کاربران</div>
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.mention_user_ids) ? config.mention_user_ids : []}
              disabled={disabled}
              options={storyMentionUserOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { mention_user_ids: nextVal })}
              placeholder="@ انتخاب کاربران برای منشن"
              maxTagCount="responsive"
            />
          </div>

          {/* مدت انقضا */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500">انقضا (ساعت، خالی = بدون انقضا)</div>
            <InputNumber
              disabled={disabled}
              min={1}
              max={8760}
              value={config.expires_hours ?? null}
              onChange={(v) => updateActionConfig(action.id, { expires_hours: v })}
              placeholder="مثلاً ۲۴"
              style={{ width: '100%' }}
            />
          </div>

          {/* مخاطبان */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">نمایش برای همه اعضا:</span>
            <Switch
              disabled={disabled}
              checked={config.is_org_wide !== false}
              onChange={(v) => updateActionConfig(action.id, { is_org_wide: v })}
              size="small"
            />
          </div>

          {config.is_org_wide === false && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-white/10">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">کاربران مجاز</div>
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(config.viewer_user_ids) ? config.viewer_user_ids : []}
                  disabled={disabled}
                  options={storyMentionUserOptions}
                  onChange={(nextVal) => updateActionConfig(action.id, { viewer_user_ids: nextVal })}
                  placeholder="انتخاب کاربران مجاز"
                  maxTagCount="responsive"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-500">نقش‌های مجاز</div>
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(config.viewer_role_ids) ? config.viewer_role_ids : []}
                  disabled={disabled}
                  options={storyViewerRoleOptions}
                  onChange={(nextVal) => updateActionConfig(action.id, { viewer_role_ids: nextVal })}
                  placeholder="انتخاب نقش‌های مجاز"
                  maxTagCount="responsive"
                />
              </div>
            </div>
          )}

          {/* اطلاع‌رسانی پیامکی */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">اطلاع‌رسانی پیامکی:</span>
            <Switch
              disabled={disabled}
              checked={!!config.notify_sms}
              onChange={(v) => updateActionConfig(action.id, { notify_sms: v })}
              size="small"
            />
          </div>

          {config.notify_sms && (
            <div className="space-y-1 border border-gray-200 rounded-lg p-2">
              <div className="text-xs text-gray-500">متن پیامک</div>
              <Input
                disabled={disabled}
                value={config.sms_template || ''}
                onChange={(e) => updateActionConfig(action.id, { sms_template: e.target.value })}
                placeholder="متن پیامک اطلاع‌رسانی..."
                style={{ direction: 'rtl' }}
              />
            </div>
          )}
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
                  options={effectiveActionTypeOptions}
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
      {templateModalTarget ? (
        <MessageComposerModal
          open
          mode="template"
          moduleId={currentModuleId || null}
          templateOnlyTitle={templateModalTarget.title}
          templateVariableOptions={templateVariableOptions}
          onCancel={() => setTemplateModalTarget(null)}
          onApplyTemplate={(value) => {
            appendTemplateTextToActionField(templateModalTarget.actionId, templateModalTarget.fieldKey, value);
            setTemplateModalTarget(null);
          }}
          onInsertVariable={(token) => {
            appendTemplateTextToActionField(templateModalTarget.actionId, templateModalTarget.fieldKey, token);
          }}
        />
      ) : null}
      {formulaModalTarget ? (
        <FormulaEditorModal
          open
          inlineMode
          defaultScope="workflow"
          defaultContextType="generic"
          defaultOutputType="number"
          variableOptions={formulaVariableOptions}
          inlineInitialName={
            formulaModalTarget.mode === 'action'
              ? String(safeValue.find((item) => item.id === formulaModalTarget.actionId)?.config?.formula_name || '').trim()
              : String(
                  getRelatedFieldMappings(
                    safeValue.find((item) => item.id === formulaModalTarget.actionId) || { id: '', type: 'create_related_record', config: {} } as WorkflowAction
                  ).find((item) => item.id === formulaModalTarget.mappingId)?.formula_name || ''
                ).trim()
          }
          inlineInitialExpressionText={
            formulaModalTarget.mode === 'action'
              ? String(safeValue.find((item) => item.id === formulaModalTarget.actionId)?.config?.formula_expression_text || '').trim()
              : String(
                  getRelatedFieldMappings(
                    safeValue.find((item) => item.id === formulaModalTarget.actionId) || { id: '', type: 'create_related_record', config: {} } as WorkflowAction
                  ).find((item) => item.id === formulaModalTarget.mappingId)?.formula_expression_text || ''
                ).trim()
          }
          onCancel={() => setFormulaModalTarget(null)}
          onInlineSaved={(formula) => {
            if (formulaModalTarget.mode === 'action') {
              updateActionConfig(formulaModalTarget.actionId, {
                formula_name: formula.name,
                formula_expression_text: formula.expressionText,
                formula_expression_config: formula.expressionConfig,
              });
            } else {
              updateRelatedFieldMappings(formulaModalTarget.actionId, (current) =>
                current.map((item) =>
                  item.id === formulaModalTarget.mappingId
                    ? {
                        ...item,
                        formula_name: formula.name,
                        formula_expression_text: formula.expressionText,
                        formula_expression_config: formula.expressionConfig,
                      }
                    : item
                )
              );
            }
            setFormulaModalTarget(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default WorkflowActionsBuilder;
