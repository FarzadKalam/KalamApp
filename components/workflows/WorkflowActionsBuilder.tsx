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
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import FormulaEditorModal from '../formulas/FormulaEditorModal';
import MessageComposerModal from '../MessageComposerModal';
import PersianDatePicker from '../PersianDatePicker';
import RichTextEditor from '../RichTextEditor';
import { STORY_GRADIENT_PRESET_LIST } from '../../utils/storyGradients';
import { MODULES } from '../../moduleRegistry';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowActionType,
  WorkflowModuleOption,
  actionTypeOptions,
  createWorkflowNoteRecipientFieldKey,
  createWorkflowMultiRelationFieldKey,
  createWorkflowRelatedFieldKey,
  createWorkflowId,
  parseWorkflowNoteRecipientFieldKey,
  parseWorkflowRelatedFieldKey,
} from '../../utils/workflowTypes';
import { getWorkflowActionOutputVariables } from '../../shared/workflowActionContract';
import {
  getCompatibleWorkflowSourceFields,
  getWorkflowDateCriteria,
  isWorkflowAssigneeField as isCentralWorkflowAssigneeField,
} from '../../shared/workflowMutationContract';
import {
  buildDefaultWorkflowAttachmentConfig,
  getWorkflowRecipientConfig,
  shouldIncludeStarredWorkflowAttachments,
} from '../../shared/workflowMessagingContract';
import { normalizeWorkflowValueByFieldType } from '../../utils/filterUtils';
import { supportsWorkflowProcessTemplateActions } from '../../utils/workflowHelpers';
import { createProcessLinkedFieldKey, parseProcessLinkedFieldKey } from '../../utils/processTargets';
import { supabase } from '../../supabaseClient';
import {
  AdaptivePickerMode,
  resolveModalPopupContainer,
  resolveOverlayPopupContainer,
} from '../../utils/popupContainer';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import { buildAiRecordCreationSchema } from '../../utils/aiRecordCreation';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { getCanonicalModuleFields } from '../../utils/recordVariableCatalog';
import {
  getCreateRelatedRecordRelationFieldOptions,
  getCreateRelatedRecordTargetModuleOptions,
  getDefaultCreateRelatedRecordRelationFieldKey,
  isCreateRelatedRecordTaskTarget,
} from '../../utils/workflowRelatedRecord';

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
  processStageOptions?: Array<{ label: string; value: string }>;
  activationStageOptions?: Array<{ label: string; value: string }>;
  disabled?: boolean;
  overlayZIndexBase?: number;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  adaptiveMode?: AdaptivePickerMode;
  /** فقط این اقدام‌ها رندر شوند (value/onChange همچنان کل آرایه را حمل می‌کنند) — برای نمای دیاگرامی */
  visibleActionIds?: string[];
  hideAddButton?: boolean;
  hideReorderControls?: boolean;
}

type CreateRelatedFieldMapping = {
  id: string;
  field: string;
  field_type?: string;
  source_field_type?: string;
  mode: 'static' | 'from_source' | 'from_related' | 'formula';
  value?: any;
  source_field?: string;
  formula_name?: string;
  formula_expression_text?: string;
  formula_expression_config?: any;
  date_criterion?: 'manual' | 'today' | 'yesterday' | 'now';
};

type BasicSelectOption = { label: string; value: string };

export const getDefaultActionConfig = (type: WorkflowActionType): Record<string, any> => {
  switch (type) {
    case 'send_note':
    case 'send_note_sms':
      return {
        recipient_fields: [],
        recipient_assignees: [],
        note_text: '',
        ...buildDefaultWorkflowAttachmentConfig(),
        variable_field: '',
        variable_target: 'note_text',
      };
    case 'send_web_form_link':
      return {
        web_form_id: '',
        related_module_id: '',
        delivery_channels: ['sms'],
        channel_configs: {
          sms: {
            recipient_fields: [],
            recipient_assignees: [],
            manual_numbers: [],
            message: 'لینک فرم برای شما ثبت شد:\n{{web_form_link}}',
          },
          email: {
            recipient_fields: [],
            manual_emails: [],
            subject: 'لینک فرم',
            body: 'برای تکمیل فرم از این لینک استفاده کنید:\n{{web_form_link}}',
          },
          bot: {
            recipient_fields: [],
            recipient_assignees: [],
            title: 'لینک فرم',
            message: 'برای تکمیل فرم از این لینک استفاده کنید:\n{{web_form_link}}',
            ...buildDefaultWorkflowAttachmentConfig(),
          },
          note: {
            recipient_fields: [],
            recipient_assignees: [],
            note_text: 'لینک فرم:\n{{web_form_link}}',
            ...buildDefaultWorkflowAttachmentConfig(),
          },
        },
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
    case 'send_instagram_message':
      return {
        recipient_source: 'current_record',
        related_record_field: '',
        message: '',
        showcase_id: '',
        variable_field: '',
        variable_target: 'message',
      };
    case 'reply_instagram_comment':
      return {
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
    case 'run_ai_prompt':
      return {
        capability: 'workflow_ai_prompt',
        prompt_template: '',
        output_mode: 'text',
        require_human_approval: false,
        target_module_id: '',
        allowed_field_keys: [],
        relation_field_key: '',
        delivery_channels: ['note'],
        channel_configs: {
          note: {
            recipient_fields: [],
            recipient_assignees: [],
            note_text: '{{ai_answer}}',
            ...buildDefaultWorkflowAttachmentConfig(),
          },
          sms: {
            recipient_fields: [],
            recipient_assignees: [],
            manual_numbers: [],
            message: '{{ai_answer}}',
          },
          email: {
            recipient_fields: [],
            manual_emails: [],
            subject: 'پیام هوش مصنوعی',
            body: '{{ai_answer}}',
          },
          bot: {
            recipient_fields: [],
            recipient_assignees: [],
            title: 'پیام هوش مصنوعی',
            message: '{{ai_answer}}',
            ...buildDefaultWorkflowAttachmentConfig(),
          },
          instagram: {
            message: '{{ai_answer}}',
          },
        },
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
        ...buildDefaultWorkflowAttachmentConfig(),
        variable_field: '',
        variable_target: 'message',
      };
    case 'update_record':
    case 'lock_record':
      return { target_scope: 'current_record', relation_field_key: '', stage_node_key: '', reason: '' };
    case 'send_to_next_stages':
      return { field: '', value_mode: 'static', value: null, source_field: '' };
    case 'send_to_specific_stage':
      return { field: '', value_mode: 'static', value: null, source_field: '', stage_node_key: '' };
    case 'create_standalone_record':
      return { target_module_id: '', field_mappings: [] };
    case 'create_related_record':
      return { source_module_id: '', target_module_id: '', relation_field_key: '', field_mappings: [] };
    case 'copy_process_template':
    case 'execute_process':
      return { template_id: '' };
    case 'activate_next_process_stage':
      return {};
    case 'activate_specific_process_stage':
      return { stage_node_key: '' };
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
  return getFieldLabelFa(field);
};

const getRelationTargetModuleId = (field?: ModuleField | null) =>
  String(
    (field?.type === FieldType.MULTI_RELATION
      ? field?.multiRelationConfig?.targetModule
      : field?.relationConfig?.targetModule)
    || ''
  ).trim();

const isProfileRecipientField = (field?: ModuleField | null) => {
  if (!field) return false;
  const key = String(field?.key || '').trim();
  const targetModuleId = getRelationTargetModuleId(field);
  return field.type === FieldType.USER
    || key === 'related_profile_id'
    || targetModuleId === 'profiles';
};

const isRoleRecipientField = (field?: ModuleField | null) => {
  if (!field) return false;
  const targetModuleId = getRelationTargetModuleId(field);
  return targetModuleId === 'org_roles' || targetModuleId === 'roles';
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

const normalizeBasicOption = (item: any): BasicSelectOption | null => {
  const value = String(item?.value ?? '').trim();
  if (!value) return null;
  return {
    label: String(item?.label ?? '').trim() || 'گزینه بدون عنوان',
    value,
  };
};

const mergeBasicOptions = (...groups: Array<Array<any> | undefined | null>): BasicSelectOption[] => {
  const optionsByValue = new Map<string, BasicSelectOption>();
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((item) => {
      const option = normalizeBasicOption(item);
      if (!option || optionsByValue.has(option.value)) return;
      optionsByValue.set(option.value, option);
    });
  });
  return Array.from(optionsByValue.values());
};

const isAssigneeValueField = (field?: ModuleField | null) => {
  if (!field) return false;
  const key = String(field?.key || '').trim();
  if (!key) return false;
  if (
    key === WORKFLOW_ASSIGNEE_FIELD_KEY
    || key.endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
    || key.endsWith(`::${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
  ) {
    return true;
  }
  const processLinked = parseProcessLinkedFieldKey(key);
  if (processLinked?.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return true;
  const related = parseWorkflowRelatedFieldKey(key);
  if (related?.targetFieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) return true;
  return /(^|_)assignee(_|$)/i.test(key)
    && (field.type === FieldType.RELATION || field.type === FieldType.SELECT || field.type === FieldType.USER);
};

const isMultiValueField = (field?: ModuleField | null) =>
  !!field && (
    field.type === FieldType.MULTI_SELECT
    || field.type === FieldType.MULTI_RELATION
    || field.type === FieldType.CHECKLIST
    || field.type === FieldType.TAGS
  );

const COUNTERPARTY_RECIPIENT_FIELD_KEYS = new Set([
  'customer_id',
  'related_customer',
  'supplier_id',
  'related_supplier',
]);

const getCounterpartyRecipientContextKey = (moduleId: string) =>
  `__workflow_counterparty__${moduleId}`;

const isCounterpartyRecipientField = (field?: ModuleField | null) => {
  const key = String(field?.key || '').trim();
  if (COUNTERPARTY_RECIPIENT_FIELD_KEYS.has(key)) return true;
  const targetModuleId = getRelationTargetModuleId(field);
  return (field?.type === FieldType.RELATION || field?.type === FieldType.MULTI_RELATION)
    && (targetModuleId === 'customers' || targetModuleId === 'suppliers');
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
  actionOptions,
  nextStageFields,
  enableNextStageActions = false,
  processStageOptions = [],
  activationStageOptions = [],
  disabled = false,
  overlayZIndexBase = 1400,
  popupContainer: popupContainerProp,
  adaptiveMode = 'auto',
  visibleActionIds,
  hideAddButton = false,
  hideReorderControls = false,
}) => {
  const safeValue = Array.isArray(value) ? value : [];
  const visibleActionIdSet = Array.isArray(visibleActionIds)
    ? new Set(visibleActionIds.map((id) => String(id)))
    : null;
  const renderedActions = visibleActionIdSet
    ? safeValue.filter((action) => visibleActionIdSet.has(String(action.id)))
    : safeValue;
  const [templateModalTarget, setTemplateModalTarget] = useState<{ actionId: string; fieldKey: string; title: string } | null>(null);
  const [instagramShowcaseOptions, setInstagramShowcaseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [formulaModalTarget, setFormulaModalTarget] = useState<
    | { mode: 'action'; actionId: string; fieldKey: string }
    | { mode: 'mapping'; actionId: string; mappingId: string; fieldKey: string }
    | null
  >(null);
  const popupContainer = useCallback(
    (node?: HTMLElement | null) => popupContainerProp?.(node) || resolveOverlayPopupContainer(node),
    [popupContainerProp]
  );
  const identityPickerPopupContainer = useCallback(
    (node?: HTMLElement | null) => resolveModalPopupContainer(node),
    []
  );
  useEffect(() => {
    let active = true;
    void supabase.from('instagram_product_showcases').select('id,name').eq('is_active', true).order('name').limit(100)
      .then(({ data }) => { if (active) setInstagramShowcaseOptions((data || []).map((row: any) => ({ value: String(row.id), label: String(row.name || 'ویترین محصولات') }))); });
    return () => { active = false; };
  }, []);

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
  const variableFieldCatalog = useMemo(
    () => Array.from(new Map(
      (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields)
        .filter((field) => !!String(field?.key || '').trim())
        .map((field) => [String(field.key).trim(), field] as const)
    ).values()),
    [currentModuleFields, variableFields],
  );
  const communicationFieldSource = useMemo(
    () => Array.from(new Map(
      [
        ...(Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields),
        ...getCanonicalModuleFields(currentModuleId),
      ]
        .filter((field) => !!String(field?.key || '').trim())
        .map((field) => [String(field.key).trim(), field] as const)
    ).values()),
    [currentModuleFields, currentModuleId, variableFields]
  );
  const sourceVariableFields = useMemo(
    () => variableFieldCatalog.filter((field) => {
      const key = String(field.key || '');
      return !key.startsWith('__linked__')
        && !key.startsWith('__workflow_related__')
        && !key.startsWith('previous_stage__');
    }),
    [variableFieldCatalog],
  );
  const relatedVariableFields = useMemo(
    () => variableFieldCatalog.filter((field) => {
      const key = String(field.key || '');
      return key.startsWith('__linked__')
        || key.startsWith('__workflow_related__')
        || key.startsWith('previous_stage__');
    }),
    [variableFieldCatalog],
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
  const noteScopedRecipientFieldOptions = useMemo(
    () => communicationFieldSource
      .filter((field) => {
        const key = String(field?.key || '').trim();
        if (!key) return false;
        if (
          key === WORKFLOW_ASSIGNEE_FIELD_KEY
          || key === '__task____workflow_assignee'
          || key.endsWith('____workflow_assignee')
          || key.startsWith('__comm_recipient__')
        ) {
          return false;
        }
        return isProfileRecipientField(field) || isRoleRecipientField(field);
      })
      .map((field) => ({
        label: getFieldLabel(field),
        value: createWorkflowNoteRecipientFieldKey(
          String(field.key || ''),
          isRoleRecipientField(field) ? 'role' : 'user',
        ),
      })),
    [communicationFieldSource]
  );
  const getMultiRelationTargetFieldOptions = useCallback((
    matcher: (targetField: ModuleField, targetModuleId: string) => boolean,
    fallbackLabel: string,
  ) =>
    communicationFieldSource
      .filter((field) => field.type === FieldType.MULTI_RELATION && field.multiRelationConfig?.targetModule)
      .flatMap((field) => {
        const targetModuleId = String(field.multiRelationConfig?.targetModule || '').trim();
        const targetFields = MODULES[targetModuleId]?.fields || [];
        return targetFields
          .filter((targetField) => !!String(targetField?.key || '').trim() && matcher(targetField, targetModuleId))
          .map((targetField) => ({
            label: `${getFieldLabel(field)} (${getFieldLabelFa(targetField, { fallback: fallbackLabel })})`,
            value: createWorkflowMultiRelationFieldKey(
              field.key,
              targetModuleId,
              String(targetField.key || '').trim(),
            ),
          }));
      }),
    [communicationFieldSource]
  );
  // مرجع یکپارچهٔ فیلدهای مقصد پیام: فیلد مستقیم، رابطهٔ تکی/چندتایی و شناسه‌های سیستمی کاربر.
  // با اضافه‌شدن فیلد جدید به کانفیگ ماژول مقصد، این مسیر نیز بدون تغییر جداگانه آن را پوشش می‌دهد.
  const getCommunicationTargetFieldOptions = useCallback((
    matcher: (targetField: ModuleField, targetModuleId: string) => boolean,
    fallbackLabel: string,
  ) => {
    const options = communicationFieldSource.flatMap((field) => {
      const fieldKey = String(field?.key || '').trim();
      if (!fieldKey) return [];

      const directOption = matcher(field, currentModuleId)
        ? [{ label: getFieldLabel(field), value: fieldKey }]
        : [];
      const targetModuleId = isProfileRecipientField(field)
        ? 'profiles'
        : getRelationTargetModuleId(field);
      if (!targetModuleId || ![
        FieldType.RELATION,
        FieldType.MULTI_RELATION,
        FieldType.USER,
      ].includes(field.type)) {
        return directOption;
      }

      const targetFields = MODULES[targetModuleId]?.fields || [];
      const relatedOptions = targetFields
        .filter((targetField) => !!String(targetField?.key || '').trim() && matcher(targetField, targetModuleId))
        .map((targetField) => ({
          label: `${getFieldLabel(field)} (${getFieldLabelFa(targetField, { fallback: fallbackLabel })})`,
          value: field.type === FieldType.MULTI_RELATION
            ? createWorkflowMultiRelationFieldKey(fieldKey, targetModuleId, String(targetField.key || '').trim())
            : createWorkflowRelatedFieldKey(fieldKey, targetModuleId, String(targetField.key || '').trim()),
        }));
      return [...directOption, ...relatedOptions];
    });
    return Array.from(new Map(options.map((item) => [String(item.value), item] as const)).values());
  }, [communicationFieldSource, currentModuleId]);
  const multiRelationProfileRecipientFields = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField, targetModuleId) => {
        const key = String(targetField?.key || '').trim();
        return key === 'related_profile_id'
          || targetField.type === FieldType.USER
          || getRelationTargetModuleId(targetField) === 'profiles'
          || (targetModuleId === 'profiles' && key === 'id');
      },
      'کاربر مرتبط',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const multiRelationRoleRecipientFields = useMemo(
    () => getMultiRelationTargetFieldOptions(
      (targetField, targetModuleId) => {
        const key = String(targetField?.key || '').trim();
        return getRelationTargetModuleId(targetField) === 'org_roles'
          || getRelationTargetModuleId(targetField) === 'roles'
          || ((targetModuleId === 'org_roles' || targetModuleId === 'roles') && key === 'id');
      },
      'نقش مرتبط',
    ),
    [getMultiRelationTargetFieldOptions]
  );
  const noteRecipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...noteScopedRecipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...multiRelationProfileRecipientFields.map((item) => [String(item.value), item] as const),
      ...multiRelationRoleRecipientFields.map((item) => [String(item.value), item] as const),
    ]).values()),
    [recipientFieldOptions, noteScopedRecipientFieldOptions, multiRelationProfileRecipientFields, multiRelationRoleRecipientFields]
  );
  const smsCommunicationFieldOptions = useMemo(
    () => getCommunicationTargetFieldOptions(
      (field) => field.type === FieldType.PHONE || /mobile|phone/i.test(String(field?.key || '')),
      'شماره',
    ),
    [getCommunicationTargetFieldOptions]
  );
  const emailCommunicationFieldOptions = useMemo(
    () => getCommunicationTargetFieldOptions(
      (field) => /email/i.test(String(field?.key || '')),
      'ایمیل',
    ),
    [getCommunicationTargetFieldOptions]
  );
  const smsRecipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
      // فیلدهای کاربرمحورِ مرکزی (از جمله ایجادکننده و آخرین ویرایشگر) باید
      // برای پیامک نیز همان گزینه‌های امن و قابل‌تفسیر یادداشت را داشته باشند.
      ...noteScopedRecipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...smsCommunicationFieldOptions.map((item) => [String(item.value), item] as const),
    ]).values()),
    [recipientFieldOptions, noteScopedRecipientFieldOptions, smsCommunicationFieldOptions]
  );
  const emailRecipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...emailCommunicationFieldOptions.map((item) => [String(item.value), item] as const),
    ]).values()),
    [recipientFieldOptions, emailCommunicationFieldOptions]
  );
  const botRecipientFieldOptions = useMemo(
    () => Array.from(new Map([
      ...recipientFieldOptions.map((item) => [String(item.value), item] as const),
      ...(currentModuleId === 'customers'
        ? [[getCounterpartyRecipientContextKey('customers'), { label: 'همین مشتری', value: getCounterpartyRecipientContextKey('customers') }] as const]
        : currentModuleId === 'suppliers'
          ? [[getCounterpartyRecipientContextKey('suppliers'), { label: 'همین تامین‌کننده', value: getCounterpartyRecipientContextKey('suppliers') }] as const]
          : []),
      ...communicationFieldSource
        .filter(isCounterpartyRecipientField)
        .map((field) => [String(field.key), { label: getFieldLabel(field), value: String(field.key) }] as const),
    ]).values()),
    [communicationFieldSource, currentModuleId, recipientFieldOptions]
  );
  const noteRecipientOptionValueSet = useMemo(
    () => new Set(noteRecipientFieldOptions.map((item) => String(item.value || '').trim()).filter(Boolean)),
    [noteRecipientFieldOptions]
  );
  const noteScopedFieldMap = useMemo(
    () => new Map(
      communicationFieldSource
        .filter((field) => !!String(field?.key || '').trim())
        .map((field) => [String(field.key).trim(), field] as const)
    ),
    [communicationFieldSource]
  );
  const renderIdentityRecipientPicker = (
    value: unknown,
    onChange: (nextValue: string[]) => void,
    placeholder: string,
  ) => (
    <AdaptiveIdentityPicker
      mode="multiple"
      scopes={['user', 'role', 'chat_group']}
      value={Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean) : []}
      disabled={disabled}
      onChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue : [])}
      placeholder={placeholder}
      pickerTitle="انتخاب کاربر، نقش یا گروه داخلی"
      className="w-full"
      getPopupContainer={identityPickerPopupContainer}
      modalContainer={identityPickerPopupContainer}
      preferLocalPopupContainer
      overlayZIndexBase={overlayZIndexBase}
      adaptiveMode={adaptiveMode}
    />
  );
  const [workflowAssigneeRoleOptions, setWorkflowAssigneeRoleOptions] = useState<Array<{ label: string; value: string }>>([]);
  const assigneeRoleOptions = useMemo(
    () => workflowAssigneeRoleOptions.map((role) => ({
      label: `نقش: ${role.label}`,
      value: `role:${role.value}`,
    })),
    [workflowAssigneeRoleOptions]
  );
  const [webFormOptions, setWebFormOptions] = useState<Array<{ label: string; value: string; targetModuleId: string }>>([]);
  useEffect(() => {
    let cancelled = false;

    const loadStoryAudienceDirectory = async () => {
      const directory = await fetchAssigneeDirectory(supabase);
      if (cancelled) return;

      setWorkflowAssigneeRoleOptions(
        directory.roles.map((role) => ({
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
  useEffect(() => {
    let cancelled = false;

    const loadWebForms = async () => {
      const { data, error } = await supabase
        .from('web_forms')
        .select('id, name, route_slug, target_module_id, form_type, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(300);
      if (cancelled) return;
      if (error) {
        setWebFormOptions([]);
        return;
      }
      setWebFormOptions(
        (data || [])
          .map((row: any) => {
            const id = String(row?.id || '').trim();
            const targetModuleId = String(row?.target_module_id || '').trim();
            if (!id || !targetModuleId) return null;
            const moduleTitle = MODULES[targetModuleId]?.titles?.fa || targetModuleId;
            const routeSlug = String(row?.route_slug || '').trim();
            const name = String(row?.name || routeSlug || 'وب‌فرم').trim();
            return {
              value: id,
              targetModuleId,
              label: `${name} (${moduleTitle}${routeSlug ? ` / ${routeSlug}` : ''})`,
            };
          })
          .filter((item): item is { label: string; value: string; targetModuleId: string } => Boolean(item))
      );
    };

    void loadWebForms();
    return () => {
      cancelled = true;
    };
  }, []);
  const templateVariableOptions = useMemo(
    () => {
      const sourceFields = (Array.isArray(variableFields) && variableFields.length > 0 ? variableFields : currentModuleFields)
        .filter((field) => !!String(field?.key || '').trim())
        .map((field) => {
          const key = String(field?.key || '').trim();
          return {
            key,
            label: getFieldLabel(field),
            token: `{{${key}}}`,
          };
        });
      return Array.from(new Map(sourceFields.map((item) => [item.key, item] as const)).values());
    },
    [currentModuleFields, variableFields]
  );
  const formulaVariableOptions = useMemo(
    () => templateVariableOptions.map((item) => ({
      label: item.label,
      token: item.token,
    })),
    [templateVariableOptions]
  );
  const webFormRelationModuleOptions = useMemo(() => {
    const baseOptions = relationSourceModuleOptions && relationSourceModuleOptions.length > 0
      ? relationSourceModuleOptions
      : [{ label: MODULES[currentModuleId]?.titles?.fa || currentModuleId, value: currentModuleId }];
    return Array.from(
      new Map(
        baseOptions
          .map((item) => {
            const value = String(item?.value || '').trim();
            if (!value) return null;
            return [value, {
              label: String(item?.label || MODULES[value]?.titles?.fa || value).trim() || value,
              value,
            }] as const;
          })
          .filter(Boolean) as Array<readonly [string, { label: string; value: string }]>
      ).values()
    );
  }, [currentModuleId, relationSourceModuleOptions]);
  // در اتوماسیون فرآیند، «رکورد مرتبط» الزاماً relation مستقیم دیتابیسی با
  // رکورد مرجع ندارد؛ مجموعهٔ مجاز همان ماژول‌های هدف الگوی فرآیند است.
  const processRelatedTargetModuleIds = useMemo(() => (
    currentModuleId === 'tasks' && (relationSourceModuleOptions?.length || 0) > 0
      ? webFormRelationModuleOptions.map((option) => String(option.value || '').trim()).filter(Boolean)
      : []
  ), [currentModuleId, relationSourceModuleOptions, webFormRelationModuleOptions]);
  const getRelatedTargetModuleOptions = useCallback(
    (sourceModuleId: string) => getCreateRelatedRecordTargetModuleOptions(
      sourceModuleId,
      moduleOptions,
      processRelatedTargetModuleIds,
    ),
    [moduleOptions, processRelatedTargetModuleIds]
  );

  const processLockLinkedRecordOptions = useMemo(() => {
    const baseOptions = relationSourceModuleOptions && relationSourceModuleOptions.length > 0
      ? relationSourceModuleOptions
      : [];
    return Array.from(
      new Map(
        baseOptions
          .map((item) => {
            const moduleId = String(item?.value || '').trim();
            if (!moduleId || !MODULES[moduleId]) return null;
            const moduleTitle = String(item?.label || MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId).trim() || moduleId;
            return [moduleId, {
              label: `رکورد لینک‌شده ${moduleTitle}`,
              value: createProcessLinkedFieldKey(moduleId, 'id'),
            }] as const;
          })
          .filter(Boolean) as Array<readonly [string, { label: string; value: string }]>
      ).values()
    );
  }, [relationSourceModuleOptions]);

  const processTemplateOptions = relationOptions.process_template_id || [];
  const effectiveActivationStageOptions = activationStageOptions.length > 0
    ? activationStageOptions
    : processStageOptions;
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
          && (
            ![
              'activate_next_process_stage',
              'activate_specific_process_stage',
              'send_to_specific_stage',
            ].includes(option.value)
            || (option.value === 'activate_specific_process_stage'
              ? effectiveActivationStageOptions.length > 0
              : processStageOptions.length > 0)
          )
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
  }, [actionOptions, effectiveActivationStageOptions.length, enableNextStageActions, processStageOptions.length, safeValue]);

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

  const templateModalZIndex = Math.max(overlayZIndexBase + 260, 0);

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
    const includeRoleAssigneeOptions = isAssigneeValueField(field);
    // مسئول‌های گردش کار از فهرست مرکزی کاربر/نقش می‌آیند؛ آن‌ها را با
    // AdaptiveSelectField رندر می‌کنیم تا رفتار popup و انتخاب چندتایی با
    // سایر فیلدهای تطبیقی یکسان بماند.
    if (field.dynamicOptionsCategory && !includeRoleAssigneeOptions) {
      return includeRoleAssigneeOptions
        ? mergeBasicOptions(dynamicOptions[field.dynamicOptionsCategory], assigneeRoleOptions)
        : dynamicOptions[field.dynamicOptionsCategory] || [];
    }
    const fieldKey = String(field.key || '').trim();
    const hasAssigneeDirectoryOptions =
      fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
      || fieldKey === `__task__${WORKFLOW_ASSIGNEE_FIELD_KEY}`
      || fieldKey.endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`)
      || fieldKey.endsWith(`::${WORKFLOW_ASSIGNEE_FIELD_KEY}`);
    if (hasAssigneeDirectoryOptions && relationOptions[field.key]) {
      return mergeBasicOptions(relationOptions[field.key], assigneeRoleOptions);
    }
    if (
      field.type === FieldType.RELATION
      || field.type === FieldType.MULTI_RELATION
      || field.type === FieldType.USER
    ) {
      return mergeBasicOptions(
        relationOptions[field.key],
        includeRoleAssigneeOptions ? assigneeRoleOptions : []
      );
    }
    return mergeBasicOptions(
      field.options || [],
      includeRoleAssigneeOptions ? assigneeRoleOptions : []
    );
  };

  const getCompatibleSourceFieldOptions = (
    targetField: ModuleField | undefined,
    sourceScope: 'source' | 'related',
  ) => {
    const sourceFields = sourceScope === 'related' ? relatedVariableFields : sourceVariableFields;
    return getCompatibleWorkflowSourceFields(targetField, sourceFields)
      .map((field) => ({ label: getFieldLabel(field), value: String(field.key || '') }))
      .filter((option) => Boolean(option.value));
  };

  const renderTypedValueInput = (
    field: ModuleField | undefined,
    value: any,
    onValueChange: (nextValue: any) => void,
    dateCriterion: 'manual' | 'today' | 'yesterday' | 'now' = 'manual',
    onDateCriterionChange?: (nextValue: 'manual' | 'today' | 'yesterday' | 'now') => void,
  ) => {
    if (!field) {
      return <Input disabled placeholder="ابتدا فیلد را انتخاب کنید" />;
    }

    const options = getFieldSelectOptions(field);

    if (isAssigneeValueField(field) || isCentralWorkflowAssigneeField(field)) {
      return (
        <AdaptiveIdentityPicker
          value={value || undefined}
          onChange={(nextValue) => onValueChange(nextValue || null)}
          scopes={['user', 'role']}
          disabled={disabled}
          className="w-full"
          placeholder="انتخاب مسئول یا نقش"
          pickerTitle={getFieldLabel(field)}
          adaptiveMode={adaptiveMode}
          overlayZIndexBase={overlayZIndexBase}
        />
      );
    }

    const dateCriteria = getWorkflowDateCriteria(field);
    const renderDateCriterion = (input: React.ReactNode) => dateCriteria.length > 0 && onDateCriterionChange ? (
      <div className="space-y-2">
        <div className="text-xs text-gray-500">
          {field.type === FieldType.DATETIME ? 'معیار تاریخ و زمان' : 'معیار تاریخ'}
        </div>
        <AdaptiveSelectField
          {...commonSelectProps}
          value={dateCriterion}
          options={dateCriteria}
          disabled={disabled}
          onChange={(nextValue) => onDateCriterionChange(String(nextValue || 'manual') as any)}
          placeholder="معیار تاریخ"
          pickerTitle="معیار تاریخ یا تاریخ و زمان"
        />
        {dateCriterion === 'manual' ? input : (
          <div className="h-10 flex items-center rounded-md border border-dashed border-blue-200 bg-blue-50 px-3 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            مقدار در لحظهٔ اجرای گردش کار و بر اساس زمان تهران تعیین می‌شود.
          </div>
        )}
      </div>
    ) : input;

    if (field.dynamicOptionsCategory) {
      return (
        <DynamicSelectField
          value={value}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          options={options}
          category={field.dynamicOptionsCategory}
          mode={isMultiValueField(field) ? 'multiple' : undefined}
          className="w-full"
          disabled={disabled}
          getPopupContainer={popupContainer as any}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabel(field)}
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
      field.type === FieldType.USER ||
      field.type === FieldType.MULTI_SELECT ||
      field.type === FieldType.CHECKLIST ||
      field.type === FieldType.TAGS
    ) {
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          mode={isMultiValueField(field) ? 'multiple' : undefined}
          value={isMultiValueField(field)
            ? (Array.isArray(value) ? value : value ? [value] : [])
            : value}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => onValueChange(normalizeWorkflowValueByFieldType(field, nextVal))}
          className="w-full"
          placeholder="مقدار"
          pickerTitle={getFieldLabel(field)}
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
      return renderDateCriterion(
        <PersianDatePicker
          type="DATE"
          value={value || null}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="تاریخ"
          modalContainer={popupContainer}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabel(field)}
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
          pickerTitle={getFieldLabel(field)}
        />
      );
    }

    if (field.type === FieldType.DATETIME) {
      return renderDateCriterion(
        <PersianDatePicker
          type="DATETIME"
          value={value || null}
          onChange={onValueChange}
          disabled={disabled}
          placeholder="تاریخ و زمان"
          modalContainer={popupContainer}
          overlayZIndexBase={overlayZIndexBase}
          adaptiveMode={adaptiveMode}
          pickerTitle={getFieldLabel(field)}
        />
      );
    }

    if (field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) {
      return (
        <RichTextEditor
          value={value}
          disabled={disabled}
          onChange={onValueChange}
          minRows={field.type === FieldType.SUPER_LONG_TEXT ? 6 : 3}
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
    const targetFields = ['send_to_next_stages', 'send_to_specific_stage'].includes(action.type)
      ? (Array.isArray(nextStageFields) ? nextStageFields : [])
      : currentModuleFields;
    const targetField = targetFields.find((f) => f.key === targetFieldKey);
    const valueMode = String(action?.config?.value_mode || 'static');
    if (valueMode === 'from_source' || valueMode === 'from_related') {
      const options = getCompatibleSourceFieldOptions(
        targetField,
        valueMode === 'from_related' ? 'related' : 'source',
      );
      return (
        <AdaptiveSelectField
          {...commonSelectProps}
          value={action?.config?.source_field}
          options={options}
          disabled={disabled}
          onChange={(nextVal) => {
            const sourceField = (valueMode === 'from_related' ? relatedVariableFields : sourceVariableFields)
              .find((field) => field.key === String(nextVal || '').trim());
            updateActionConfig(action.id, { source_field: nextVal, source_field_type: sourceField?.type || '' });
          }}
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
    return renderTypedValueInput(
      targetField,
      action?.config?.value,
      (nextVal) => updateActionConfig(action.id, { value: nextVal }),
      String(action?.config?.date_criterion || 'manual') as any,
      (date_criterion) => updateActionConfig(action.id, { date_criterion }),
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
    ): CreateRelatedFieldMapping[] => {
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
        } as CreateRelatedFieldMapping));

      if (missing.length === 0) return mappings;
      return [...mappings, ...missing];
    },
    []
  );

  useEffect(() => {
    let hasChanges = false;
    const next = safeValue.map((action) => {
      if (action.type === 'send_note' || action.type === 'send_note_sms') {
        const config = action.config || {};
        const rawRecipientFields = Array.isArray(config.recipient_fields) ? config.recipient_fields : [];
        const normalizedRecipientFields = Array.from(new Set(
          rawRecipientFields.map((item: any) => {
            const value = String(item || '').trim();
            if (!value) return '';
            if (noteRecipientOptionValueSet.has(value) || parseWorkflowNoteRecipientFieldKey(value)) return value;
            const field = noteScopedFieldMap.get(value);
            if (field && (isProfileRecipientField(field) || isRoleRecipientField(field))) {
              return createWorkflowNoteRecipientFieldKey(value, isRoleRecipientField(field) ? 'role' : 'user');
            }
            return value;
          }).filter(Boolean)
        ));
        if (JSON.stringify(normalizedRecipientFields) === JSON.stringify(rawRecipientFields)) {
          return action;
        }
        hasChanges = true;
        return {
          ...action,
          config: {
            ...config,
            recipient_fields: normalizedRecipientFields,
          },
        };
      }
      if (action.type === 'send_web_form_link') {
        const config = action.config || {};
        const normalizedRelatedModuleId = String(
          config.related_module_id
          || webFormRelationModuleOptions[0]?.value
          || currentModuleId
        ).trim();
        const normalizedDeliveryChannels = Array.from(
          new Set(
            (Array.isArray(config.delivery_channels) ? config.delivery_channels : [])
              .map((item: any) => String(item || '').trim().toLowerCase())
              .filter((item) => ['sms', 'email', 'bot', 'note'].includes(item))
          )
        );
        const defaultConfig = getDefaultActionConfig('send_web_form_link');
        const normalizedChannelConfigs = {
          ...(defaultConfig.channel_configs || {}),
          ...((config.channel_configs && typeof config.channel_configs === 'object') ? config.channel_configs : {}),
        };
        const shouldPatch =
          normalizedRelatedModuleId !== String(config.related_module_id || '')
          || JSON.stringify(normalizedDeliveryChannels) !== JSON.stringify(Array.isArray(config.delivery_channels) ? config.delivery_channels : [])
          || JSON.stringify(normalizedChannelConfigs) !== JSON.stringify(config.channel_configs || {});
        if (!shouldPatch) return action;
        hasChanges = true;
        return {
          ...action,
          config: {
            ...defaultConfig,
            ...config,
            related_module_id: normalizedRelatedModuleId,
            delivery_channels: normalizedDeliveryChannels.length > 0 ? normalizedDeliveryChannels : ['sms'],
            channel_configs: normalizedChannelConfigs,
          },
        };
      }
      if (action.type !== 'create_related_record') return action;
      const config = action.config || {};
      const sourceModuleId = String(
        config.source_module_id
        || webFormRelationModuleOptions[0]?.value
        || currentModuleId
      );
      const targetModuleId = String(config.target_module_id || '').trim();
      if (!targetModuleId) {
        if (sourceModuleId === String(config.source_module_id || '')) return action;
        hasChanges = true;
        return {
          ...action,
          config: {
            ...config,
            source_module_id: sourceModuleId,
          },
        };
      }

      const defaultRelationFieldKey = getDefaultCreateRelatedRecordRelationFieldKey(
        targetModuleId,
        sourceModuleId,
        processRelatedTargetModuleIds,
      );
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
  }, [safeValue, onChange, currentModuleId, ensureRequiredMappings, noteRecipientOptionValueSet, noteScopedFieldMap, webFormRelationModuleOptions, processRelatedTargetModuleIds]);

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
            {renderIdentityRecipientPicker(
              config.recipient_assignees,
              (nextVal) => updateActionConfig(action.id, { recipient_assignees: nextVal }),
              'انتخاب کاربر/نقش/گروه داخلی تکمیلی (اختیاری)',
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
            <div>
              <div className="text-sm font-medium">ارسال تصاویر و فایل‌های ستاره‌دار</div>
              <div className="text-xs text-gray-500">همه فایل‌های ستاره‌دار همین رکورد، بدون محدودیت به یک تصویر، پیوست می‌شوند.</div>
            </div>
            <Switch
              checked={shouldIncludeStarredWorkflowAttachments(config)}
              disabled={disabled}
              onChange={(checked) => updateActionConfig(action.id, { include_starred_attachments: checked })}
            />
          </div>
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
    if (actionType === 'send_web_form_link') {
      const selectedChannels = Array.isArray(config.delivery_channels)
        ? config.delivery_channels.map((item: any) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object'
        ? config.channel_configs
        : {};
      const smsConfig = channelConfigs.sms || {};
      const emailConfig = channelConfigs.email || {};
      const botConfig = channelConfigs.bot || {};
      const noteConfig = channelConfigs.note || {};
      const relationModuleLocked = webFormRelationModuleOptions.length <= 1;
      const activeWebFormOptions = webFormOptions;

      const updateChannelConfig = (channelKey: 'sms' | 'email' | 'bot' | 'note' | 'instagram', patch: Record<string, any>) => {
        updateActionConfig(action.id, {
          channel_configs: {
            ...channelConfigs,
            [channelKey]: {
              ...((channelConfigs as any)?.[channelKey] || {}),
              ...patch,
            },
          },
        });
      };
      const webFormVariableOptions = Array.from(new Map([
        ...variableFieldOptions.map((item) => [String(item.value), item] as const),
        ...getWorkflowActionOutputVariables('send_web_form_link').map((item) => [item.key, { label: item.labelFa, value: item.key }] as const),
      ]).values());
      const renderWebFormVariablePicker = (
        channelKey: 'sms' | 'email' | 'bot' | 'note',
        targets: Array<{ key: string; label: string }>
      ) => (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <AdaptiveSelectField
            {...commonSelectProps}
            options={webFormVariableOptions}
            disabled={disabled}
            onChange={(nextValue) => {
              const variableKey = String(nextValue || '').trim();
              const targetKey = targets[0]?.key;
              if (!variableKey || !targetKey) return;
              const source = String((channelConfigs as any)?.[channelKey]?.[targetKey] || '');
              const token = `{{${variableKey}}}`;
              if (!source.includes(token)) updateChannelConfig(channelKey, { [targetKey]: source ? `${source} ${token}` : token });
            }}
            placeholder="درج متغیر"
            pickerTitle="متغیرهای مجاز این وب‌فرم"
          />
          <div className="flex h-10 items-center rounded-md border border-gray-200 px-2 text-xs text-gray-500 dark:border-gray-700">
            محل درج: {targets[0]?.label || '-'}
          </div>
        </div>
      );

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">وب‌فرم</div>
              <Select
                {...commonSelectProps}
                value={config.web_form_id || undefined}
                disabled={disabled}
                options={activeWebFormOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { web_form_id: nextVal })}
                placeholder="انتخاب وب‌فرم"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">مرتبط با</div>
              <Select
                {...commonSelectProps}
                value={config.related_module_id || undefined}
                disabled={disabled || relationModuleLocked}
                options={webFormRelationModuleOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { related_module_id: nextVal })}
                placeholder="ماژول مرتبط"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">کانال‌های ارسال</div>
            <Checkbox.Group
              disabled={disabled}
              value={selectedChannels}
              options={[
                { label: 'پیامک', value: 'sms' },
                { label: 'ایمیل', value: 'email' },
                { label: 'بات', value: 'bot' },
                { label: 'یادداشت', value: 'note' },
              ]}
              onChange={(nextVal) => updateActionConfig(action.id, { delivery_channels: nextVal })}
            />
          </div>

          {selectedChannels.includes('sms') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">ارسال پیامک</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(smsConfig.recipient_fields) ? smsConfig.recipient_fields : []}
                  disabled={disabled}
                  options={smsRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('sms', { recipient_fields: nextVal })}
                  placeholder="فیلدهای مقصد شماره تماس"
                />
                {renderIdentityRecipientPicker(
                  smsConfig.recipient_assignees,
                  (nextVal) => updateChannelConfig('sms', { recipient_assignees: nextVal }),
                  'کاربر/نقش/گروه تکمیلی',
                )}
              </div>
              <Select
                {...commonSelectProps}
                mode="tags"
                value={Array.isArray(smsConfig.manual_numbers) ? smsConfig.manual_numbers : []}
                disabled={disabled}
                onChange={(nextVal) => updateChannelConfig('sms', { manual_numbers: nextVal })}
                tokenSeparators={[',', ';', ' ']}
                placeholder="شماره‌های دستی"
              />
              <Input.TextArea
                rows={3}
                value={smsConfig.message}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('sms', { message: e.target.value })}
                placeholder="متن پیامک"
              />
              {renderWebFormVariablePicker('sms', [{ key: 'message', label: 'متن پیامک' }])}
            </div>
          ) : null}

          {selectedChannels.includes('email') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">ارسال ایمیل</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(emailConfig.recipient_fields) ? emailConfig.recipient_fields : []}
                  disabled={disabled}
                  options={emailRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('email', { recipient_fields: nextVal })}
                  placeholder="فیلدهای ایمیل مقصد"
                />
                <Select
                  {...commonSelectProps}
                  mode="tags"
                  value={Array.isArray(emailConfig.manual_emails) ? emailConfig.manual_emails : []}
                  disabled={disabled}
                  onChange={(nextVal) => updateChannelConfig('email', { manual_emails: nextVal })}
                  tokenSeparators={[',', ';', ' ']}
                  placeholder="ایمیل‌های دستی"
                />
              </div>
              <Input
                value={emailConfig.subject}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('email', { subject: e.target.value })}
                placeholder="موضوع ایمیل"
              />
              <Input.TextArea
                rows={3}
                value={emailConfig.body}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('email', { body: e.target.value })}
                placeholder="متن ایمیل"
              />
              {renderWebFormVariablePicker('email', [{ key: 'body', label: 'متن ایمیل' }])}
            </div>
          ) : null}

          {selectedChannels.includes('bot') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">ارسال با بات</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={getWorkflowRecipientConfig(botConfig).recipientFields}
                  disabled={disabled}
                  options={botRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('bot', { recipient_fields: nextVal, related_recipient_fields: [] })}
                  placeholder="گیرنده‌های بات از روی فیلدها"
                  maxTagCount="responsive"
                />
                {renderIdentityRecipientPicker(
                  getWorkflowRecipientConfig(botConfig).recipientAssignees,
                  (nextVal) => updateChannelConfig('bot', { recipient_assignees: nextVal, recipient_targets: [] }),
                  'انتخاب کاربر/نقش/گروه (اختیاری)',
                )}
              </div>
              <Input
                value={botConfig.title}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('bot', { title: e.target.value })}
                placeholder="عنوان پیام"
              />
              <Input.TextArea
                rows={3}
                value={botConfig.message}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('bot', { message: e.target.value })}
                placeholder="متن پیام"
              />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                <span className="text-sm">ارسال تصاویر و فایل‌های ستاره‌دار رکورد</span>
                <Switch
                  checked={shouldIncludeStarredWorkflowAttachments(botConfig)}
                  disabled={disabled}
                  onChange={(checked) => updateChannelConfig('bot', { include_starred_attachments: checked })}
                />
              </div>
              {renderWebFormVariablePicker('bot', [{ key: 'message', label: 'متن پیام بات' }])}
            </div>
          ) : null}

          {selectedChannels.includes('note') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">ارسال یادداشت</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(noteConfig.recipient_fields) ? noteConfig.recipient_fields : []}
                  disabled={disabled}
                  options={noteRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('note', { recipient_fields: nextVal })}
                  placeholder="گیرنده‌های یادداشت"
                  maxTagCount="responsive"
                />
                {renderIdentityRecipientPicker(
                  noteConfig.recipient_assignees,
                  (nextVal) => updateChannelConfig('note', { recipient_assignees: nextVal }),
                  'کاربر/نقش/گروه تکمیلی',
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                <span className="text-sm">ارسال تصاویر و فایل‌های ستاره‌دار رکورد</span>
                <Switch
                  checked={shouldIncludeStarredWorkflowAttachments(noteConfig)}
                  disabled={disabled}
                  onChange={(checked) => updateChannelConfig('note', { include_starred_attachments: checked })}
                />
              </div>
              <Input.TextArea
                rows={3}
                value={noteConfig.note_text}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('note', { note_text: e.target.value })}
                placeholder="متن یادداشت"
              />
              {renderWebFormVariablePicker('note', [{ key: 'note_text', label: 'متن یادداشت' }])}
            </div>
          ) : null}
        </div>
      );
    }
    if (actionType === 'run_ai_prompt') {
      const outputMode = String(config.output_mode || 'text');
      const targetModuleId = outputMode === 'update_record'
        ? currentModuleId
        : String(config.target_module_id || '');
      const targetModule = targetModuleId ? MODULES[targetModuleId] : undefined;
      const targetFields = (targetModule?.fields || []).filter(
        (field) => !!field?.key && field?.nature !== 'system' && field?.readonly !== true
      );
      const targetWritableOptions = targetFields.map((field) => ({
        label: getFieldLabel(field),
        value: field.key,
      }));
      const selectedChannels = Array.isArray(config.delivery_channels)
        ? config.delivery_channels.map((item: any) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const channelConfigs = config.channel_configs && typeof config.channel_configs === 'object'
        ? config.channel_configs
        : {};
      const noteConfig = channelConfigs.note || {};
      const smsConfig = channelConfigs.sms || {};
      const emailConfig = channelConfigs.email || {};
      const botConfig = channelConfigs.bot || {};
      const instagramConfig = channelConfigs.instagram || {};
      const updateChannelConfig = (channelKey: 'sms' | 'email' | 'bot' | 'note' | 'instagram', patch: Record<string, any>) => {
        updateActionConfig(action.id, {
          channel_configs: {
            ...channelConfigs,
            [channelKey]: {
              ...((channelConfigs as any)?.[channelKey] || {}),
              ...patch,
            },
          },
        });
      };
      const aiChannelVariableOptions = Array.from(new Map([
        ...variableFieldOptions.map((item) => [String(item.value), item] as const),
        ...getWorkflowActionOutputVariables('run_ai_prompt').map((item) => [
          item.key,
          { label: item.labelFa, value: item.key },
        ] as const),
      ]).values());
      const renderAiChannelVariablePicker = (
        channelKey: 'sms' | 'email' | 'bot' | 'note' | 'instagram',
        targetKey: string,
        targetLabel: string,
      ) => (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <AdaptiveSelectField
            {...commonSelectProps}
            options={aiChannelVariableOptions}
            disabled={disabled}
            onChange={(nextValue) => {
              const variableKey = String(nextValue || '').trim();
              if (!variableKey) return;
              const source = String((channelConfigs as any)?.[channelKey]?.[targetKey] || '');
              const token = `{{${variableKey}}}`;
              if (!source.includes(token)) {
                updateChannelConfig(channelKey, { [targetKey]: source ? `${source} ${token}` : token });
              }
            }}
            placeholder="درج متغیر"
            pickerTitle="متغیرهای مجاز خروجی هوش مصنوعی"
          />
          <div className="flex h-10 items-center rounded-md border border-gray-200 px-2 text-xs text-gray-500 dark:border-gray-700">
            محل درج: {targetLabel}
          </div>
        </div>
      );
      const updateRecordCreationSchema = (nextModuleId: string, nextAllowedFieldKeys?: string[]) => {
        const allowedKeys = Array.isArray(nextAllowedFieldKeys) ? nextAllowedFieldKeys : [];
        const schemaAllowedKeys = outputMode === 'update_record' && allowedKeys.length === 0
          ? ['__no_ai_update_fields_selected__']
          : allowedKeys;
        updateActionConfig(action.id, {
          target_module_id: nextModuleId,
          allowed_field_keys: allowedKeys,
          relation_field_key: '',
          record_creation_schema: nextModuleId ? buildAiRecordCreationSchema(nextModuleId, schemaAllowedKeys) : null,
        });
      };
      return (
        <div className="space-y-3">
          <Alert
            type="info"
            showIcon
            message="این اقدام به‌صورت خودکار اجرا می‌شود؛ برای workflowهای زمان‌بندی‌شده تایید انسانی درخواست نمی‌شود."
          />
          <Input.TextArea
            rows={5}
            value={config.prompt_template}
            disabled={disabled}
            onChange={(e) => updateActionConfig(action.id, { prompt_template: e.target.value })}
            placeholder="پرامپت هوش مصنوعی؛ می‌توانید از متغیرهایی مثل {{name}} استفاده کنید"
          />
          {renderVariableTools(action, [{ key: 'prompt_template', label: 'پرامپت هوش مصنوعی' }])}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Select
              {...commonSelectProps}
              value={outputMode}
              disabled={disabled}
              options={[
                { label: 'فقط پیام/تحلیل', value: 'text' },
                { label: 'ساخت رکورد جدید', value: 'create_record' },
                { label: 'ویرایش رکورد جاری', value: 'update_record' },
                { label: 'اجرای/ساخت فرآیند و فعالیت', value: 'process_operation' },
              ]}
              onChange={(nextVal) => {
                if (nextVal === 'update_record') {
                  const schema = buildAiRecordCreationSchema(currentModuleId, ['__no_ai_update_fields_selected__']);
                  updateActionConfig(action.id, {
                    output_mode: nextVal,
                    target_module_id: currentModuleId,
                    allowed_field_keys: [],
                    relation_field_key: '',
                    record_creation_schema: schema,
                  });
                  return;
                }
                updateActionConfig(action.id, { output_mode: nextVal });
              }}
              placeholder="نوع خروجی"
            />
            <Select
              {...commonSelectProps}
              value={targetModuleId || undefined}
              disabled={disabled || outputMode !== 'create_record'}
              options={moduleOptions}
              onChange={(nextVal) => updateRecordCreationSchema(String(nextVal || ''), [])}
              placeholder={outputMode === 'update_record' ? 'ماژول رکورد جاری' : 'ماژول رکورد جدید'}
            />
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.allowed_field_keys) ? config.allowed_field_keys : []}
              disabled={disabled || !['create_record', 'update_record'].includes(outputMode) || !targetModuleId}
              options={targetWritableOptions}
              onChange={(nextVal) => updateRecordCreationSchema(targetModuleId, nextVal.map((item: any) => String(item)))}
              placeholder={outputMode === 'update_record'
                ? 'فیلدهایی که AI اجازه ویرایش دارد'
                : 'فیلدهایی که AI اجازه پر کردن دارد'}
              maxTagCount="responsive"
            />
          </div>
          {outputMode === 'update_record'
            && (!Array.isArray(config.allowed_field_keys) || config.allowed_field_keys.length === 0) ? (
              <Alert
                type="warning"
                showIcon
                message="برای ویرایش رکورد، حداقل یک فیلد مجاز را انتخاب کنید."
              />
            ) : null}

          <div className="space-y-1">
            <div className="text-xs text-gray-500">کانال‌های اطلاع‌رسانی خروجی AI</div>
            <Checkbox.Group
              disabled={disabled}
              value={selectedChannels}
              options={[
                { label: 'نمایش در اعلان/یادداشت', value: 'note' },
                { label: 'پیامک', value: 'sms' },
                { label: 'ایمیل', value: 'email' },
                { label: 'بات', value: 'bot' },
                { label: 'دایرکت اینستاگرامِ همان گفتگو', value: 'instagram' },
              ]}
              onChange={(nextVal) => updateActionConfig(action.id, { delivery_channels: nextVal })}
            />
          </div>

          {selectedChannels.includes('note') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">اعلان داخل سامانه</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={Array.isArray(noteConfig.recipient_fields) ? noteConfig.recipient_fields : []}
                  disabled={disabled}
                  options={noteRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('note', { recipient_fields: nextVal })}
                  placeholder="گیرنده‌های یادداشت"
                  maxTagCount="responsive"
                />
                {renderIdentityRecipientPicker(
                  noteConfig.recipient_assignees,
                  (nextVal) => updateChannelConfig('note', { recipient_assignees: nextVal }),
                  'کاربر/نقش/گروه',
                )}
              </div>
              <Input.TextArea
                rows={3}
                value={noteConfig.note_text}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('note', { note_text: e.target.value })}
                placeholder="متن یادداشت؛ از {{ai_answer}} استفاده کنید"
              />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                <span className="text-sm">ارسال تصاویر و فایل‌های ستاره‌دار رکورد</span>
                <Switch
                  checked={shouldIncludeStarredWorkflowAttachments(noteConfig)}
                  disabled={disabled}
                  onChange={(checked) => updateChannelConfig('note', { include_starred_attachments: checked })}
                />
              </div>
              {renderAiChannelVariablePicker('note', 'note_text', 'متن یادداشت')}
            </div>
          ) : null}

          {selectedChannels.includes('sms') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">پیامک</div>
              <Select
                {...commonSelectProps}
                mode="multiple"
                value={Array.isArray(smsConfig.recipient_fields) ? smsConfig.recipient_fields : []}
                disabled={disabled}
                options={smsRecipientFieldOptions}
                onChange={(nextVal) => updateChannelConfig('sms', { recipient_fields: nextVal })}
                placeholder="فیلدهای مقصد شماره تماس"
                maxTagCount="responsive"
              />
              <Input.TextArea
                rows={3}
                value={smsConfig.message}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('sms', { message: e.target.value })}
                placeholder="متن پیامک؛ از {{ai_answer}} استفاده کنید"
              />
              {renderAiChannelVariablePicker('sms', 'message', 'متن پیامک')}
            </div>
          ) : null}

          {selectedChannels.includes('email') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">ایمیل</div>
              <Select
                {...commonSelectProps}
                mode="multiple"
                value={Array.isArray(emailConfig.recipient_fields) ? emailConfig.recipient_fields : []}
                disabled={disabled}
                options={emailRecipientFieldOptions}
                onChange={(nextVal) => updateChannelConfig('email', { recipient_fields: nextVal })}
                placeholder="فیلدهای ایمیل مقصد"
                maxTagCount="responsive"
              />
              <Input
                value={emailConfig.subject}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('email', { subject: e.target.value })}
                placeholder="موضوع ایمیل"
              />
              <Input.TextArea
                rows={3}
                value={emailConfig.body}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('email', { body: e.target.value })}
                placeholder="متن ایمیل؛ از {{ai_answer}} استفاده کنید"
              />
              {renderAiChannelVariablePicker('email', 'body', 'متن ایمیل')}
            </div>
          ) : null}

          {selectedChannels.includes('bot') ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="text-sm font-medium">بات</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Select
                  {...commonSelectProps}
                  mode="multiple"
                  value={getWorkflowRecipientConfig(botConfig).recipientFields}
                  disabled={disabled}
                  options={botRecipientFieldOptions}
                  onChange={(nextVal) => updateChannelConfig('bot', { recipient_fields: nextVal, related_recipient_fields: [] })}
                  placeholder="گیرنده‌های بات از روی فیلدها"
                  maxTagCount="responsive"
                />
                {renderIdentityRecipientPicker(
                  getWorkflowRecipientConfig(botConfig).recipientAssignees,
                  (nextVal) => updateChannelConfig('bot', { recipient_assignees: nextVal, recipient_targets: [] }),
                  'انتخاب کاربر/نقش/گروه (اختیاری)',
                )}
              </div>
              <Input.TextArea
                rows={3}
                value={botConfig.message}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('bot', { message: e.target.value })}
                placeholder="متن بات؛ از {{ai_answer}} استفاده کنید"
              />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                <span className="text-sm">ارسال تصاویر و فایل‌های ستاره‌دار رکورد</span>
                <Switch
                  checked={shouldIncludeStarredWorkflowAttachments(botConfig)}
                  disabled={disabled}
                  onChange={(checked) => updateChannelConfig('bot', { include_starred_attachments: checked })}
                />
              </div>
              {renderAiChannelVariablePicker('bot', 'message', 'متن پیام بات')}
            </div>
          ) : null}
          {selectedChannels.includes('instagram') && currentModuleId === 'instagram_interaction_events' ? (
            <div className="space-y-2 rounded-xl border border-pink-200 bg-pink-50/50 p-3 dark:border-pink-400/20 dark:bg-pink-500/10">
              <div className="text-sm font-medium">دایرکت اینستاگرام</div>
              <div className="text-xs text-gray-500">پاسخ AI فقط به همان گفتگویی ارسال می‌شود که رویداد دایرکت آن گردش‌کار را اجرا کرده است.</div>
              <Input.TextArea
                rows={3}
                value={instagramConfig.message}
                disabled={disabled}
                onChange={(e) => updateChannelConfig('instagram', { message: e.target.value })}
                placeholder="متن دایرکت؛ از {{ai_answer}} استفاده کنید"
              />
              {renderAiChannelVariablePicker('instagram', 'message', 'متن دایرکت')}
            </div>
          ) : selectedChannels.includes('instagram') ? (
            <Alert type="warning" showIcon message="ارسال دایرکتِ پاسخ AI فقط برای گردش‌کاری فعال است که منبع آن «رویدادهای اینستاگرام» باشد." />
          ) : null}
        </div>
      );
    }
    if (actionType === 'send_sms') {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={smsRecipientFieldOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal })}
              placeholder="فیلدهای مقصد شماره تماس"
            />
            {renderIdentityRecipientPicker(
              config.recipient_assignees,
              (nextVal) => updateActionConfig(action.id, { recipient_assignees: nextVal }),
              'انتخاب کاربر/نقش/گروه داخلی تکمیلی (اختیاری)',
            )}
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
    if (actionType === 'send_instagram_message') {
      if (currentModuleId === 'instagram_interaction_events') {
        return (
          <div className="space-y-2">
            <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-2 text-xs text-slate-700 dark:border-pink-400/20 dark:bg-pink-500/10 dark:text-slate-200">
              برای رویداد «دایرکت جدید»، پیام به همان گفتگو برمی‌گردد. برای رویداد کامنت، از اقدام «پاسخ به کامنت اینستاگرام» استفاده کنید.
            </div>
            <Select {...commonSelectProps} value={config.showcase_id || undefined} disabled={disabled} options={instagramShowcaseOptions} onChange={(value) => updateActionConfig(action.id, { showcase_id: value })} placeholder="ویترین محصولات (اختیاری)" />
            <div className="flex justify-end">{renderMessageTemplateButton(action.id, 'message', 'پیام‌های آماده اینستاگرام')}</div>
            <Input.TextArea rows={4} value={config.message} disabled={disabled} onChange={(event) => updateActionConfig(action.id, { message: event.target.value })} placeholder="متن پیام اینستاگرام" />
            {renderVariableTools(action, [{ key: 'message', label: 'متن پیام اینستاگرام' }])}
          </div>
        );
      }
      const relatedRecordOptions = currentModuleFields
        .filter((field) => [FieldType.RELATION, FieldType.MULTI_RELATION].includes(field.type))
        .filter((field) => ['customers', 'suppliers', 'employees'].includes(getRelationTargetModuleId(field)))
        .map((field) => ({ value: field.key, label: `رکورد مرتبط: ${getFieldLabel(field)}`, targetModuleId: getRelationTargetModuleId(field) }));
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-2 text-xs text-slate-700 dark:border-pink-400/20 dark:bg-pink-500/10 dark:text-slate-200">
            سامانه گفتگوی اینستاگرامِ متصل به رکورد انتخاب‌شده را پیدا می‌کند. متن از متغیرهای همین گردش‌کار پشتیبانی می‌کند و ویترین متناسب با سرویس‌دهندهٔ اتصال به متن و دکمه‌های تعاملی تبدیل می‌شود.
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Select {...commonSelectProps} value={config.recipient_source || 'current_record'} disabled={disabled} options={[{ value: 'current_record', label: 'رکورد فعلی' }, { value: 'related_record', label: 'رکورد مرتبط' }]} onChange={(value) => updateActionConfig(action.id, { recipient_source: value })} />
            {config.recipient_source === 'related_record' ? <Select {...commonSelectProps} value={config.related_record_field || undefined} disabled={disabled} options={relatedRecordOptions} onChange={(value) => { const selected = relatedRecordOptions.find((option) => option.value === value); updateActionConfig(action.id, { related_record_field: value, related_record_module_id: selected?.targetModuleId || '' }); }} placeholder="فیلد مشتری/تأمین‌کننده/کارمند" /> : <Select {...commonSelectProps} value={config.showcase_id || undefined} disabled={disabled} options={instagramShowcaseOptions} onChange={(value) => updateActionConfig(action.id, { showcase_id: value })} placeholder="ویترین محصولات (اختیاری)" />}
          </div>
          {config.recipient_source === 'related_record' ? <Select {...commonSelectProps} value={config.showcase_id || undefined} disabled={disabled} options={instagramShowcaseOptions} onChange={(value) => updateActionConfig(action.id, { showcase_id: value })} placeholder="ویترین محصولات (اختیاری)" /> : null}
          <div className="flex justify-end">{renderMessageTemplateButton(action.id, 'message', 'پیام‌های آماده اینستاگرام')}</div>
          <Input.TextArea rows={4} value={config.message} disabled={disabled} onChange={(event) => updateActionConfig(action.id, { message: event.target.value })} placeholder="متن پیام اینستاگرام" />
          {renderVariableTools(action, [{ key: 'message', label: 'متن پیام اینستاگرام' }])}
        </div>
      );
    }
    if (actionType === 'reply_instagram_comment') {
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-2 text-xs text-slate-700 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-slate-200">
            این اقدام فقط در گردش‌کاری اجرا می‌شود که رویداد «کامنت جدید» را دریافت کرده باشد؛ پاسخ به همان کامنت ثبت‌شده ارسال می‌شود.
          </div>
          <div className="flex justify-end">{renderMessageTemplateButton(action.id, 'message', 'پیام‌های آماده اینستاگرام')}</div>
          <Input.TextArea rows={4} value={config.message} disabled={disabled} onChange={(event) => updateActionConfig(action.id, { message: event.target.value })} placeholder="متن پاسخ به کامنت" />
          {renderVariableTools(action, [{ key: 'message', label: 'متن پاسخ به کامنت' }])}
        </div>
      );
    }
    if (actionType === 'send_email') {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={Array.isArray(config.recipient_fields) ? config.recipient_fields : []}
              disabled={disabled}
              options={emailRecipientFieldOptions}
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

    if (
      actionType === 'send_bot_message'
      || actionType === 'send_telegram_bot'
      || actionType === 'send_bale_bot'
      || actionType === 'send_rubika_bot'
    ) {
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-[rgba(var(--brand-200-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.45)] p-2 text-xs text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
            فقط مسئول و مشتری یا تامین‌کنندهٔ مرتبط را انتخاب کنید. سامانه گروه پیش‌فرض هر مخاطب را از تنظیمات خودش می‌خواند و در صورت فعال‌بودن جایگزین، گروه فعال بعدی را انتخاب می‌کند.
          </div>
          <div>
            <Select
              {...commonSelectProps}
              mode="multiple"
              value={getWorkflowRecipientConfig(config).recipientFields}
              disabled={disabled}
              options={botRecipientFieldOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { recipient_fields: nextVal, related_recipient_fields: [] })}
              placeholder="گیرنده‌های پیام بات از روی فیلدها"
              maxTagCount="responsive"
            />
          </div>
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
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
            <div>
              <div className="text-sm font-medium">ارسال تصاویر و فایل‌های ستاره‌دار</div>
              <div className="text-xs text-gray-500">همه فایل‌های ستاره‌دار رکورد همراه پیام بات ارسال می‌شوند.</div>
            </div>
            <Switch
              checked={shouldIncludeStarredWorkflowAttachments(config)}
              disabled={disabled}
              onChange={(checked) => updateActionConfig(action.id, { include_starred_attachments: checked })}
            />
          </div>
          {renderVariableTools(action, [
            { key: 'title', label: 'عنوان پیام' },
            { key: 'message', label: 'متن پیام' },
          ])}
        </div>
      );
    }

    if (actionType === 'lock_record') {
      const relationLockOptions = [
        ...currentModuleFields
        .filter((field: any) => String(field?.relationConfig?.targetModule || '').trim() && !parseProcessLinkedFieldKey(String(field?.key || '')))
        .map((field: any) => ({
          label: `${getFieldLabel(field)} (${MODULES[String(field.relationConfig.targetModule)]?.titles?.faSingular || MODULES[String(field.relationConfig.targetModule)]?.titles?.fa || field.relationConfig.targetModule})`,
          value: String(field.key),
          targetModuleId: String(field.relationConfig.targetModule),
        })),
        ...processLockLinkedRecordOptions.map((item) => ({
          ...item,
          targetModuleId: parseProcessLinkedFieldKey(String(item.value || ''))?.moduleId || '',
        })),
      ];
      const hasProcessTaskTargets = processStageOptions.length > 0;
      const lockTargetOptions = [
        { label: 'رکورد جاری', value: 'current_record' },
        { label: 'رکورد مرتبط', value: 'related_record' },
        ...(hasProcessTaskTargets ? [
          { label: 'فعالیت فعلی', value: 'process_current_task' },
          { label: 'فعالیت قبلی', value: 'process_previous_task' },
          { label: 'فعالیت خاص', value: 'process_specific_task' },
        ] : []),
      ];
      const selectedTargetScope = String(config.target_scope || 'current_record').trim();
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="space-y-1 md:col-span-5">
            <div className="text-xs text-gray-500">هدف قفل</div>
            <Select
              {...commonSelectProps}
              value={selectedTargetScope || 'current_record'}
              disabled={disabled}
              options={lockTargetOptions}
              onChange={(nextVal) => updateActionConfig(action.id, {
                target_scope: nextVal,
                relation_field_key: '',
                stage_node_key: '',
              })}
              placeholder="هدف قفل"
            />
          </div>
          <div className="space-y-1 md:col-span-4">
            <div className="text-xs text-gray-500">رکورد مرتبط</div>
            <AdaptiveSelectField
              {...commonSelectProps}
              value={config.relation_field_key || undefined}
              disabled={disabled || selectedTargetScope !== 'related_record' || relationLockOptions.length === 0}
              options={relationLockOptions}
              onChange={(nextVal) => {
                const selected = relationLockOptions.find((item) => String(item.value) === String(nextVal));
                updateActionConfig(action.id, {
                  relation_field_key: nextVal,
                  relation_module_id: selected?.targetModuleId || '',
                });
              }}
              placeholder={relationLockOptions.length > 0 ? 'انتخاب رابطه' : 'رابطه‌ای در این ماژول پیدا نشد'}
              pickerTitle="رکورد مرتبط برای قفل"
            />
          </div>
          <div className="space-y-1 md:col-span-3">
            <div className="text-xs text-gray-500">فعالیت خاص</div>
            <AdaptiveSelectField
              {...commonSelectProps}
              value={config.stage_node_key || undefined}
              disabled={disabled || selectedTargetScope !== 'process_specific_task' || processStageOptions.length === 0}
              options={processStageOptions}
              onChange={(nextVal) => updateActionConfig(action.id, { stage_node_key: nextVal })}
              placeholder={processStageOptions.length > 0 ? 'انتخاب فعالیت' : 'فعالیتی پیدا نشد'}
              pickerTitle="فعالیت خاص برای قفل"
            />
          </div>
          <div className="space-y-2 md:col-span-12">
            <Input
              value={config.reason}
              disabled={disabled}
              onChange={(event) => updateActionConfig(action.id, { reason: event.target.value })}
              placeholder="دلیل قفل شدن رکورد"
            />
            {renderVariableTools(action, [{ key: 'reason', label: 'دلیل قفل' }])}
          </div>
        </div>
      );
    }

    if (
      actionType === 'update_record'
      || actionType === 'send_to_next_stages'
      || actionType === 'send_to_specific_stage'
    ) {
      const isProcessStageTransfer = ['send_to_next_stages', 'send_to_specific_stage'].includes(actionType);
      const targetOptions = isProcessStageTransfer
        ? nextStageFieldOptions
        : updatableFieldOptions;
      return (
        <div className="space-y-2">
          {actionType === 'send_to_specific_stage' ? (
            <div className="space-y-1">
              <div className="text-xs text-gray-500">مرحله مقصد</div>
              <AdaptiveSelectField
                {...commonSelectProps}
                value={config.stage_node_key || undefined}
                disabled={disabled || processStageOptions.length === 0}
                options={processStageOptions}
                onChange={(nextVal) => updateActionConfig(action.id, { stage_node_key: nextVal })}
                placeholder="انتخاب مرحله خاص"
                pickerTitle="مرحله مقصد"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="space-y-1 md:col-span-5">
            <div className="text-xs text-gray-500">فیلد مقصد</div>
            <Select
              {...commonSelectProps}
              value={config.field}
              disabled={disabled || (isProcessStageTransfer && targetOptions.length === 0)}
              options={targetOptions}
              onChange={(nextVal) => {
                const targetField = (isProcessStageTransfer ? nextStageFields : currentModuleFields)
                  ?.find((field) => field.key === String(nextVal || '').trim());
                updateActionConfig(action.id, {
                  field: nextVal,
                  target_field_type: targetField?.type || '',
                  value: null,
                  source_field: '',
                  date_criterion: 'manual',
                  formula_name: '',
                  formula_expression_text: '',
                  formula_expression_config: null,
                  value_mode: 'static',
                });
              }}
              placeholder={isProcessStageTransfer && targetOptions.length === 0 ? 'فیلد قابل انتقالی پیدا نشد' : 'فیلد مقصد'}
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
                  (isProcessStageTransfer
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

    if (actionType === 'activate_next_process_stage') {
      return (
        <Alert
          type="info"
          showIcon
          message="اولین مرحله بعدی در همین ردیف یا شاخه‌های متصل، فقط یک بار ساخته می‌شود."
        />
      );
    }

    if (actionType === 'activate_specific_process_stage') {
      return (
        <div className="space-y-2">
          <AdaptiveSelectField
            {...commonSelectProps}
            value={config.stage_node_key || undefined}
            disabled={disabled}
            options={effectiveActivationStageOptions}
            onChange={(nextVal) => updateActionConfig(action.id, { stage_node_key: nextVal })}
            placeholder="مرحله موردنظر"
            pickerTitle="انتخاب مرحله فرآیند"
          />
          {effectiveActivationStageOptions.length === 0 ? (
            <div className="text-xs text-gray-500">مرحله قابل انتخابی در این فرآیند وجود ندارد.</div>
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
                        onChange={(nextVal) => {
                          const selectedField = targetFields.find((field) => field.key === String(nextVal || '').trim());
                          updateActionConfig(action.id, {
                            field_mappings: fieldMappings.map((item) =>
                              item.id === mapping.id
                                ? { ...item, field: nextVal, field_type: selectedField?.type || '', value: '', source_field: '', date_criterion: 'manual', mode: 'static' }
                                : item
                            ),
                          });
                        }}
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
                      {mapping.mode === 'from_source' || mapping.mode === 'from_related' ? (
                        <Select
                          {...commonSelectProps}
                          value={mapping.source_field}
                          disabled={disabled}
                          options={getCompatibleSourceFieldOptions(
                            targetField,
                            mapping.mode === 'from_related' ? 'related' : 'source',
                          )}
                          onChange={(nextVal) => {
                            const sourceField = (mapping.mode === 'from_related' ? relatedVariableFields : sourceVariableFields)
                              .find((field) => field.key === String(nextVal || '').trim());
                            updateActionConfig(action.id, {
                              field_mappings: fieldMappings.map((item) =>
                                item.id === mapping.id ? { ...item, source_field: nextVal, source_field_type: sourceField?.type || '' } : item
                              ),
                            });
                          }}
                          placeholder={mapping.mode === 'from_related' ? 'فیلد رکورد مرتبط' : 'فیلد رکورد جاری'}
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
                        renderTypedValueInput(
                          targetField,
                          mapping.value,
                          (nextVal) => updateActionConfig(action.id, {
                              field_mappings: fieldMappings.map((item) =>
                                item.id === mapping.id ? { ...item, value: nextVal } : item
                              ),
                            }),
                          String(mapping.date_criterion || 'manual') as any,
                          (date_criterion) => updateActionConfig(action.id, {
                            field_mappings: fieldMappings.map((item) =>
                              item.id === mapping.id ? { ...item, date_criterion } : item
                            ),
                          }),
                        )
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
      const targetModuleId = String(config.target_module_id || '').trim();
      const sourceModuleId = String(
        config.source_module_id
        || webFormRelationModuleOptions[0]?.value
        || currentModuleId
      );
      const allowedTargetModuleOptions = getRelatedTargetModuleOptions(sourceModuleId);
      const targetModule = targetModuleId ? MODULES[targetModuleId] : undefined;
      const targetFields = (targetModule?.fields || []).filter(
        (field) => !!field?.key && field?.nature !== 'system'
      );
      const relationFields = getCreateRelatedRecordRelationFieldOptions(
        targetModuleId,
        sourceModuleId,
        processRelatedTargetModuleIds,
      );
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
                options={webFormRelationModuleOptions}
                onChange={(nextVal) => {
                  const nextSourceModuleId = String(nextVal || '');
                  const nextTargetModuleOptions = getRelatedTargetModuleOptions(nextSourceModuleId);
                  const nextTargetModuleId = nextTargetModuleOptions.some((option) => option.value === targetModuleId)
                    ? targetModuleId
                    : '';
                  const defaultRelationField = getDefaultCreateRelatedRecordRelationFieldKey(
                    nextTargetModuleId,
                    nextSourceModuleId,
                    processRelatedTargetModuleIds,
                  );
                  updateActionConfig(action.id, {
                    source_module_id: nextSourceModuleId,
                    target_module_id: nextTargetModuleId,
                    relation_field_key: defaultRelationField,
                    field_mappings: ensureRequiredMappings(
                      nextTargetModuleId,
                      defaultRelationField,
                      nextTargetModuleId ? getRelatedFieldMappings(action) : []
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
                options={allowedTargetModuleOptions}
                onChange={(nextVal) => {
                  const nextTargetModuleId = String(nextVal || '').trim();
                  const defaultRelationField = getDefaultCreateRelatedRecordRelationFieldKey(
                    nextTargetModuleId,
                    sourceModuleId,
                    processRelatedTargetModuleIds,
                  );
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
                disabled={disabled || !targetModuleId || isCreateRelatedRecordTaskTarget(targetModuleId)}
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
                        onChange={(nextVal) => {
                          const selectedField = targetFields.find((field) => field.key === String(nextVal || '').trim());
                          updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id
                                ? {
                                    ...item,
                                    field: nextVal,
                                    field_type: selectedField?.type || '',
                                    value: '',
                                    source_field: '',
                                    date_criterion: 'manual',
                                    mode: 'static',
                                    formula_name: '',
                                    formula_expression_text: '',
                                    formula_expression_config: null,
                                  }
                                : item
                            )
                          );
                        }}
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
                          options={getCompatibleSourceFieldOptions(
                            targetField,
                            mapping.mode === 'from_related' ? 'related' : 'source',
                          )}
                          onChange={(nextVal) => {
                            const sourceField = (mapping.mode === 'from_related' ? relatedVariableFields : sourceVariableFields)
                              .find((field) => field.key === String(nextVal || '').trim());
                            updateRelatedFieldMappings(action.id, (current) =>
                              current.map((item) =>
                                item.id === mapping.id ? { ...item, source_field: nextVal, source_field_type: sourceField?.type || '' } : item
                              )
                            );
                          }}
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
                        renderTypedValueInput(
                          targetField,
                          mapping.value,
                          (nextVal) => updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) =>
                              item.id === mapping.id ? { ...item, value: nextVal } : item
                            )
                          ),
                          String(mapping.date_criterion || 'manual') as any,
                          (date_criterion) => updateRelatedFieldMappings(action.id, (current) =>
                            current.map((item) => item.id === mapping.id ? { ...item, date_criterion } : item)
                          ),
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
            <AdaptiveIdentityPicker
              mode="multiple"
              scopes={['user']}
              valueMode="raw"
              value={Array.isArray(config.mention_user_ids) ? config.mention_user_ids : []}
              disabled={disabled}
              onChange={(nextVal) => updateActionConfig(action.id, { mention_user_ids: Array.isArray(nextVal) ? nextVal : [] })}
              placeholder="@ انتخاب کاربران برای منشن"
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
                <AdaptiveIdentityPicker
                  mode="multiple"
                  scopes={['user']}
                  valueMode="raw"
                  value={Array.isArray(config.viewer_user_ids) ? config.viewer_user_ids : []}
                  disabled={disabled}
                  onChange={(nextVal) => updateActionConfig(action.id, { viewer_user_ids: Array.isArray(nextVal) ? nextVal : [] })}
                  placeholder="انتخاب کاربران مجاز"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-500">نقش‌های مجاز</div>
                <AdaptiveIdentityPicker
                  mode="multiple"
                  scopes={['role']}
                  valueMode="raw"
                  value={Array.isArray(config.viewer_role_ids) ? config.viewer_role_ids : []}
                  disabled={disabled}
                  onChange={(nextVal) => updateActionConfig(action.id, { viewer_role_ids: Array.isArray(nextVal) ? nextVal : [] })}
                  placeholder="انتخاب نقش‌های مجاز"
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
      {renderedActions.length === 0 ? (
        <Empty description="اقدامی ثبت نشده است" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        renderedActions.map((action) => {
          const actionIndex = safeValue.findIndex((item) => item.id === action.id);
          return (
          <div
            key={action.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-white/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-6 text-center">{actionIndex + 1}</span>
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
              {!hideReorderControls ? (
                <Space>
                  <Button
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={disabled || actionIndex <= 0}
                    onClick={() => moveAction(actionIndex, -1)}
                  />
                  <Button
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={disabled || actionIndex === safeValue.length - 1}
                    onClick={() => moveAction(actionIndex, 1)}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={disabled}
                    onClick={() => removeAction(action.id)}
                  />
                </Space>
              ) : null}
            </div>
            {renderActionFields(action)}
          </div>
          );
        })
      )}
      {!hideAddButton ? (
        <Button type="dashed" icon={<PlusOutlined />} onClick={addAction} disabled={disabled}>
          افزودن اقدام
        </Button>
      ) : null}
      {templateModalTarget ? (
        <MessageComposerModal
          open
          mode="template"
          moduleId={currentModuleId || null}
          readyTextScope="workflow_automation"
          templateOnlyTitle={templateModalTarget.title}
          templateVariableOptions={templateVariableOptions}
          zIndex={templateModalZIndex}
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
