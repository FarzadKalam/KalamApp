import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Collapse,
  Form,
  Input,
  Modal,
  Radio,
  Segmented,
  Spin,
  Switch,
} from 'antd';
import { ApartmentOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { FieldType, ModuleField } from '../../types';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { supportsGlobalRoleAssignee } from '../../utils/assigneeSupport';
import {
  fetchAssigneeDirectory,
  fetchDynamicOptionsMap,
  fetchProcessTemplateOptions,
  fetchTagOptions,
} from '../../utils/referenceData';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';
import {
  getWorkflowConditionFields,
} from '../../utils/workflowHelpers';
import {
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowCondition,
  WorkflowModuleOption,
  WorkflowRecord,
  WorkflowTriggerType,
  createWorkflowId,
  triggerTypeOptions,
  workflowExecutionModeOptions,
} from '../../utils/workflowTypes';
import { getWorkflowActionTypeLabelFa } from '../../utils/workflowActionSummary';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { attachWorkflowTemplateFieldCatalog } from '../../utils/workflowTemplateFieldCatalog';
import {
  resolveOverlayPopupContainer,
} from '../../utils/popupContainer';
import AdaptiveSelectField from '../AdaptiveSelectField';
import WorkflowActionsBuilder, { getDefaultActionConfig } from './WorkflowActionsBuilder';
import WorkflowConditionsGroup from './WorkflowConditionsGroup';
import WorkflowIntervalScheduleFields from './WorkflowIntervalScheduleFields';
import { buildWorkflowFlowDocument } from './flow/flowAdapters';
import { FlowSelection } from './flow/flowTypes';
import {
  WorkflowEditorViewMode,
  persistWorkflowViewMode,
  readStoredWorkflowViewMode,
} from './flow/viewModePreference';

const WorkflowFlowSurface = lazy(() => import('./flow/WorkflowFlowSurface'));

type WorkflowEditorModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialModuleId?: string | null;
  record?: WorkflowRecord | null;
  canEdit?: boolean;
  moduleOptions: WorkflowModuleOption[];
  initialDraft?: {
    moduleId?: string;
    name?: string;
    description?: string;
    triggerType?: WorkflowTriggerType;
    conditionsAll?: WorkflowCondition[];
    actions?: WorkflowAction[];
  } | null;
};

type FormValues = {
  module_id: string;
  name: string;
  description?: string;
  trigger_type: 'on_create' | 'on_upsert' | 'interval';
  execution_mode: 'first_match' | 'every_match';
  interval_value?: number;
  interval_unit?: 'hour' | 'day' | 'week' | 'month';
  interval_at?: string | null;
  interval_first_run_at?: string | null;
  interval_minute?: number | null;
  interval_allowed_from_hour?: number | null;
  interval_allowed_to_hour?: number | null;
  interval_day_of_month?: number | null;
  interval_day_condition?: string | null;
  interval_days_after_holiday?: number | null;
  batch_size?: number;
  is_active?: boolean;
};

const loadWorkflowFieldOptions = async (
  field: ModuleField,
  moduleScopeId: string
): Promise<Array<{ label: string; value: string }>> => {
  const scopeModuleId = String((field as any)?.workflowOptionScopeModuleId || moduleScopeId || '').trim();

  if (field.key === WORKFLOW_ASSIGNEE_FIELD_KEY) {
    const directory = await fetchAssigneeDirectory(supabase);
    const userOptions = (directory.users || []).map((user) => ({
      label: String(user?.display_name || user?.full_name || 'کاربر بدون نام').trim(),
      value: `user:${String(user?.id || '').trim()}`,
    })).filter((item) => item.value !== 'user_');

    const roleOptions = supportsGlobalRoleAssignee(scopeModuleId)
      ? (directory.roles || []).map((role) => ({
          label: String(role?.title || 'نقش بدون نام').trim(),
          value: `role:${String(role?.id || '').trim()}`,
        })).filter((item) => item.value !== 'role_')
      : [];

    return [...userOptions, ...roleOptions];
  }

  if (field.type === FieldType.TAGS) {
    return fetchTagOptions(supabase);
  }

  if (field.type === FieldType.USER) {
    const directory = await fetchAssigneeDirectory(supabase);

    return (directory.users || []).map((user) => ({
      label: String(user?.display_name || user?.full_name || 'بدون عنوان').trim(),
      value: String(user?.id || '').trim(),
    })).filter((item) => item.value);
  }

  const relationConfig = field.type === FieldType.MULTI_RELATION
    ? field?.multiRelationConfig
    : field?.relationConfig;
  const targetModule = String(relationConfig?.targetModule || '').trim();
  if (!targetModule) {
    return [];
  }

  if (targetModule === 'process_templates') {
    return fetchProcessTemplateOptions(supabase, scopeModuleId);
  }

  const effectiveField = field.type === FieldType.MULTI_RELATION
    ? {
        ...field,
        relationConfig,
      }
    : field;

  return fetchRelationOptionsForField(supabase, effectiveField, { limit: 300 });
};

const loadDynamicAndRelationOptions = async (
  moduleId: string,
  fields: ModuleField[]
): Promise<{
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
}> => {
  if (!moduleId || !MODULES[moduleId]) {
    return { dynamicOptions: {}, relationOptions: {} };
  }

  const dynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
  const relationOptions: Record<string, Array<{ label: string; value: string }>> = {};

  const dynamicCategories = Array.from(
    new Set(
      (fields || [])
        .map((field) => field.dynamicOptionsCategory)
        .filter((category): category is string => !!category)
    )
  );

  Object.assign(dynamicOptions, await fetchDynamicOptionsMap(supabase, dynamicCategories));

  const optionFields = (fields || []).filter(
    (field) =>
      field.key === WORKFLOW_ASSIGNEE_FIELD_KEY ||
      String(field.key || '').endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`) ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.MULTI_RELATION ||
      field.type === FieldType.USER ||
      field.type === FieldType.TAGS
  );

  await Promise.allSettled(
    optionFields.map(async (field) => {
      relationOptions[field.key] = await loadWorkflowFieldOptions(field, moduleId);
    })
  );

  return { dynamicOptions, relationOptions };
};

const WorkflowEditorModal: React.FC<WorkflowEditorModalProps> = ({
  open,
  onClose,
  onSaved,
  initialModuleId,
  record,
  canEdit = true,
  moduleOptions,
  initialDraft,
}) => {
  const overlayZIndexBase = 13080;
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [moduleId, setModuleId] = useState<string>(initialModuleId || '');
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});
  const [relationOptions, setRelationOptions] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});
  const [conditionsAll, setConditionsAll] = useState<WorkflowCondition[]>([]);
  const [conditionsAny, setConditionsAny] = useState<WorkflowCondition[]>([]);
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [viewMode, setViewMode] = useState<WorkflowEditorViewMode>(() => readStoredWorkflowViewMode());
  const [flowSelection, setFlowSelection] = useState<FlowSelection | null>(null);

  const selectedModuleFields: ModuleField[] = useMemo(
    () => MODULES[moduleId]?.fields || [],
    [moduleId]
  );

  const conditionFields: ModuleField[] = useMemo(
    () => getWorkflowConditionFields(moduleId),
    [moduleId]
  );
  const conditionFieldKeySet = useMemo(
    () =>
      new Set(
        conditionFields
          .map((field) => String(field?.key || '').trim())
          .filter(Boolean)
      ),
    [conditionFields]
  );

  const isEditMode = !!record?.id;
  const triggerType = Form.useWatch('trigger_type', form);
  const intervalUnit = Form.useWatch('interval_unit', form);
  const intervalDayCondition = Form.useWatch('interval_day_condition', form);
  const intervalValue = Form.useWatch('interval_value', form);
  const intervalDayOfMonth = Form.useWatch('interval_day_of_month', form);
  const isActiveValue = Form.useWatch('is_active', form);

  const flowDocument = useMemo(
    () =>
      buildWorkflowFlowDocument({
        trigger_type: triggerType,
        interval_value: intervalValue ?? null,
        interval_unit: intervalUnit ?? null,
        interval_day_of_month: intervalDayOfMonth ?? null,
        interval_day_condition: intervalDayCondition ?? null,
        is_active: isActiveValue !== false,
        conditionsAll,
        conditionsAny,
        actions: attachWorkflowTemplateFieldCatalog(actions, values.module_id, conditionFields),
      }),
    [triggerType, intervalValue, intervalUnit, intervalDayOfMonth, intervalDayCondition, isActiveValue, conditionsAll, conditionsAny, actions]
  );

  const handleViewModeChange = useCallback((nextMode: WorkflowEditorViewMode) => {
    setViewMode(nextMode);
    persistWorkflowViewMode(nextMode);
  }, []);

  const handleAddAction = useCallback((insertIndex: number) => {
    if (!canEdit) return;
    const newAction: WorkflowAction = {
      id: createWorkflowId(),
      type: 'send_note',
      config: getDefaultActionConfig('send_note'),
    };
    setActions((prev) => {
      const next = [...prev];
      const boundedIndex = Math.max(0, Math.min(insertIndex, next.length));
      next.splice(boundedIndex, 0, newAction);
      return next;
    });
    setFlowSelection({ kind: 'action', actionId: newAction.id });
  }, [canEdit]);

  const handleMoveAction = useCallback((actionId: string, direction: -1 | 1) => {
    setActions((prev) => {
      const fromIndex = prev.findIndex((item) => String(item.id) === String(actionId));
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[fromIndex];
      next[fromIndex] = next[toIndex];
      next[toIndex] = temp;
      return next;
    });
  }, []);

  const handleDeleteAction = useCallback((actionId: string) => {
    setActions((prev) => prev.filter((item) => String(item.id) !== String(actionId)));
    setFlowSelection((prev) => (
      prev?.kind === 'action' && String(prev.actionId) === String(actionId) ? null : prev
    ));
  }, []);

  const handleDuplicateAction = useCallback((actionId: string) => {
    const sourceIndex = actions.findIndex((item) => String(item.id) === String(actionId));
    if (sourceIndex < 0) return;
    const source = actions[sourceIndex];
    const cloned: WorkflowAction = {
      id: createWorkflowId(),
      type: source.type,
      config: JSON.parse(JSON.stringify(source.config || {})),
    };
    const next = [...actions];
    next.splice(sourceIndex + 1, 0, cloned);
    setActions(next);
    setFlowSelection({ kind: 'action', actionId: cloned.id });
  }, [actions]);

  useEffect(() => {
    if (!open) return;
    const nextModuleId = record?.module_id || initialDraft?.moduleId || initialModuleId || '';
    setModuleId(nextModuleId);
    form.setFieldsValue({
      module_id: nextModuleId,
      name: record?.name || initialDraft?.name || '',
      description: record?.description || initialDraft?.description || '',
      trigger_type: (record?.trigger_type as any) || initialDraft?.triggerType || 'on_create',
      execution_mode: (record?.execution_mode as any) || 'first_match',
      interval_value: record?.interval_value || undefined,
      interval_unit: (record?.interval_unit as any) || 'day',
      interval_at: record?.interval_at || null,
      interval_first_run_at: record?.interval_first_run_at || null,
      interval_minute: record?.interval_minute ?? null,
      interval_allowed_from_hour: record?.interval_allowed_from_hour ?? null,
      interval_allowed_to_hour: record?.interval_allowed_to_hour ?? null,
      interval_day_of_month: record?.interval_day_of_month ?? null,
      interval_day_condition: record?.interval_day_condition || 'any',
      interval_days_after_holiday: record?.interval_days_after_holiday ?? null,
      batch_size: record?.batch_size || undefined,
      is_active: record?.is_active ?? true,
    });
    setConditionsAll(Array.isArray(record?.conditions_all) ? (record.conditions_all as any) : (initialDraft?.conditionsAll || []));
    setConditionsAny(Array.isArray(record?.conditions_any) ? (record.conditions_any as any) : []);
    setActions(Array.isArray(record?.actions) ? (record.actions as any) : (initialDraft?.actions || []));
    setFlowSelection(null);
  }, [open, record, initialModuleId, initialDraft, form]);

  useEffect(() => {
    if (!open || !moduleId) return;
    let cancelled = false;

    const run = async () => {
      const loaded = await loadDynamicAndRelationOptions(moduleId, conditionFields).catch(() => ({
        dynamicOptions: {},
        relationOptions: {},
      }));
      if (cancelled) return;
      setDynamicOptions(loaded.dynamicOptions);
      setRelationOptions(loaded.relationOptions);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, moduleId, conditionFields]);

  useEffect(() => {
    if (!open) return;

    const pruneInvalidConditions = (items: WorkflowCondition[]) => {
      if (conditionFieldKeySet.size === 0) {
        return items.length > 0 ? [] : items;
      }
      return items.filter((condition) =>
        conditionFieldKeySet.has(String(condition?.field || '').trim())
      );
    };

    setConditionsAll((prev) => {
      const next = pruneInvalidConditions(prev);
      return next.length === prev.length ? prev : next;
    });
    setConditionsAny((prev) => {
      const next = pruneInvalidConditions(prev);
      return next.length === prev.length ? prev : next;
    });
  }, [conditionFieldKeySet, open]);

  const handleSubmit = async () => {
    if (!canEdit) return;
    try {
      const values = await form.validateFields();
      if (!values.module_id) {
        message.error('ماژول مرتبط را انتخاب کنید.');
        return;
      }
      if (actions.length === 0) {
        message.error('حداقل یک اقدام برای گردش کار اضافه کنید.');
        return;
      }

      setSubmitting(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;

      const isInterval = values.trigger_type === 'interval';
      const payload: Record<string, any> = {
        module_id: values.module_id,
        name: values.name?.trim(),
        description: values.description?.trim() || null,
        trigger_type: values.trigger_type,
        execution_mode: values.execution_mode || 'first_match',
        interval_value: isInterval ? values.interval_value || null : null,
        interval_unit: isInterval ? values.interval_unit || null : null,
        interval_at: isInterval ? values.interval_at || null : null,
        interval_first_run_at: isInterval ? values.interval_first_run_at || null : null,
        interval_minute: isInterval ? values.interval_minute ?? null : null,
        interval_allowed_from_hour: isInterval ? values.interval_allowed_from_hour ?? null : null,
        interval_allowed_to_hour: isInterval ? values.interval_allowed_to_hour ?? null : null,
        interval_day_of_month: isInterval ? values.interval_day_of_month ?? null : null,
        interval_day_condition: isInterval ? values.interval_day_condition || null : null,
        interval_days_after_holiday: isInterval ? values.interval_days_after_holiday ?? null : null,
        batch_size: isInterval ? values.batch_size || null : null,
        conditions_all: conditionsAll,
        conditions_any: conditionsAny,
        actions: attachWorkflowTemplateFieldCatalog(actions, values.module_id, conditionFields),
        is_active: values.is_active !== false,
        updated_by: userId,
      };

      if (isEditMode) {
        const { error } = await supabase.from('workflows').update(payload).eq('id', record!.id);
        if (error) throw error;
        message.success('گردش کار به‌روزرسانی شد.');
      } else {
        const { error } = await supabase.from('workflows').insert([
          {
            ...payload,
            created_by: userId,
          },
        ]);
        if (error) throw error;
        message.success('گردش کار جدید ثبت شد.');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      message.error(toFaErrorMessage(err, 'خطا در ذخیره گردش کار'));
    } finally {
      setSubmitting(false);
    }
  };

  const isDiagramMode = viewMode === 'diagram';

  const renderMetaSection = () => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item label="ماژول مرتبط" name="module_id" rules={[{ required: true }]}>
              <AdaptiveSelectField
                className="w-full"
                showSearch
                optionFilterProp="label"
                optionLabelProp="label"
                options={moduleOptions}
                getPopupContainer={resolveOverlayPopupContainer}
                modalContainer={resolveOverlayPopupContainer}
                overlayZIndexBase={overlayZIndexBase}
                onChange={(nextVal) => setModuleId(String(nextVal || ''))}
                placeholder="انتخاب ماژول"
              />
            </Form.Item>
            <Form.Item
              label="نام گردش کار"
              name="name"
              rules={[{ required: true, message: 'نام گردش کار الزامی است.' }]}
            >
              <Input placeholder="مثال: اعلان سفارش‌های معوق" />
            </Form.Item>
          </div>
          <Form.Item label="توضیحات" name="description">
            <Input.TextArea rows={2} placeholder="توضیح کوتاه درباره هدف این گردش کار" />
          </Form.Item>
          <Form.Item name="is_active" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
          </Form.Item>
        </div>
  );

  const renderTriggerSection = () => (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <h4 className="font-bold mb-3">شرایط اجرا</h4>
          <Form.Item name="trigger_type" initialValue="on_create">
            <Radio.Group options={triggerTypeOptions} optionType="button" buttonStyle="solid" />
          </Form.Item>
          <Form.Item label="زمان اجرا" name="execution_mode" initialValue="first_match">
            <Radio.Group options={workflowExecutionModeOptions} />
          </Form.Item>
          {triggerType === 'interval' && (
            <WorkflowIntervalScheduleFields
              form={form}
              disabled={!canEdit}
              overlayZIndexBase={overlayZIndexBase}
              popupContainer={resolveOverlayPopupContainer}
            />
          )}
        </div>
  );

  const renderConditionsGroup = (kind: 'all' | 'any') => (
    <WorkflowConditionsGroup
      value={kind === 'all' ? conditionsAll : conditionsAny}
      onChange={kind === 'all' ? setConditionsAll : setConditionsAny}
      fields={conditionFields}
      dynamicOptions={dynamicOptions}
      relationOptions={relationOptions}
      disabled={!canEdit}
      overlayZIndexBase={overlayZIndexBase}
      popupContainer={resolveOverlayPopupContainer}
      adaptiveMode="desktop"
    />
  );

  const getFlowInspectorTitle = (selection: FlowSelection): string => {
    if (selection.kind === 'trigger') return 'مشخصات و شرایط اجرا';
    if (selection.kind === 'conditions') return 'شرط‌ها';
    const action = actions.find((item) => String(item.id) === String(selection.actionId));
    return action ? getWorkflowActionTypeLabelFa(action.type) : 'تنظیمات اقدام';
  };

  const renderFlowInspector = (selection: FlowSelection): React.ReactNode => {
    if (selection.kind === 'conditions') {
      return (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-500">حتما همه این شرط‌ها باید برقرار باشند</div>
            {renderConditionsGroup('all')}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-500">کافی است فقط یکی از این شرط‌ها برقرار باشد</div>
            {renderConditionsGroup('any')}
          </div>
        </div>
      );
    }
    if (selection.kind === 'action') {
      return (
        <WorkflowActionsBuilder
          value={actions}
          onChange={setActions}
          visibleActionIds={[String(selection.actionId)]}
          hideAddButton
          hideReorderControls
          currentModuleId={moduleId}
          currentModuleFields={selectedModuleFields}
          variableFields={conditionFields}
          moduleOptions={moduleOptions}
          dynamicOptions={dynamicOptions}
          relationOptions={relationOptions}
          disabled={!canEdit}
          overlayZIndexBase={overlayZIndexBase}
          popupContainer={resolveOverlayPopupContainer}
        />
      );
    }
    return null;
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex flex-wrap items-center gap-3 pe-8">
          <span>{isEditMode ? 'ویرایش گردش کار' : 'ایجاد گردش کار جدید'}</span>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(value) => handleViewModeChange(value as WorkflowEditorViewMode)}
            options={[
              { label: 'فرم کلاسیک', value: 'form', icon: <UnorderedListOutlined /> },
              { label: 'نمای دیاگرام', value: 'diagram', icon: <ApartmentOutlined /> },
            ]}
          />
        </div>
      }
      width={isDiagramMode ? '100vw' : 1120}
      style={isDiagramMode ? { top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 } : undefined}
      styles={isDiagramMode ? { body: { height: 'calc(100vh - 130px)', padding: 0, overflow: 'hidden' } } : undefined}
      zIndex={13000}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          انصراف
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={submitting}
          disabled={!canEdit}
          onClick={handleSubmit}
          className="bg-leather-600 hover:!bg-leather-500"
        >
          {isEditMode ? 'ذخیره تغییرات' : 'ثبت گردش کار'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" disabled={!canEdit} style={isDiagramMode ? { height: '100%' } : undefined}>
        {isDiagramMode ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center py-16">
                <Spin />
              </div>
            }
          >
            <WorkflowFlowSurface
              document={flowDocument}
              selection={flowSelection}
              readOnly={!canEdit}
              onSelect={setFlowSelection}
              onAddAction={handleAddAction}
              onMoveAction={handleMoveAction}
              onDeleteAction={handleDeleteAction}
              onDuplicateAction={handleDuplicateAction}
              inspectorTitle={getFlowInspectorTitle}
              renderInspector={renderFlowInspector}
              alwaysMountedInspector={
                <>
                  {renderMetaSection()}
                  {renderTriggerSection()}
                </>
              }
            />
          </Suspense>
        ) : (
          <>
            {renderMetaSection()}
            {renderTriggerSection()}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
              <h4 className="font-bold mb-3">شرط‌ها</h4>
              <Collapse
                defaultActiveKey={['all_conditions']}
                items={[
                  {
                    key: 'all_conditions',
                    label: 'حتما همه این شرط‌ها باید برقرار باشند',
                    children: renderConditionsGroup('all'),
                  },
                  {
                    key: 'any_conditions',
                    label: 'کافی است فقط یکی از این شرط‌ها برقرار باشد',
                    children: renderConditionsGroup('any'),
                  },
                ]}
              />
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-bold mb-3">افزودن اقدام</h4>
              <WorkflowActionsBuilder
                value={actions}
                onChange={setActions}
                currentModuleId={moduleId}
                currentModuleFields={selectedModuleFields}
                variableFields={conditionFields}
                moduleOptions={moduleOptions}
                dynamicOptions={dynamicOptions}
                relationOptions={relationOptions}
                disabled={!canEdit}
                overlayZIndexBase={overlayZIndexBase}
                popupContainer={resolveOverlayPopupContainer}
              />
            </div>
          </>
        )}
      </Form>
    </Modal>
  );
};

export default WorkflowEditorModal;
