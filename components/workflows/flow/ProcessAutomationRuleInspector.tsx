import React from 'react';
import { Alert, Input, InputNumber, Radio, Switch } from 'antd';
import { ModuleField } from '../../../types';
import {
  ProcessAutomationRule,
  extractRuleNoteTextFromActions,
  filterEditableAutomationConditions,
} from '../../../utils/processAutomationTypes';
import {
  WorkflowAction,
  WorkflowCondition,
  WorkflowExecutionMode,
  WorkflowModuleOption,
  intervalUnitOptions,
  workflowExecutionModeOptions,
} from '../../../utils/workflowTypes';
import AdaptiveSelectField from '../../AdaptiveSelectField';
import PersianDatePicker from '../../PersianDatePicker';
import WorkflowActionsBuilder from '../WorkflowActionsBuilder';
import WorkflowConditionsGroup from '../WorkflowConditionsGroup';
import { FlowSelection } from './flowTypes';

type OptionList = Array<{ label: string; value: string }>;

export type ProcessAutomationRuleInspectorContext = {
  triggerTypeOptions: Array<{ label: string; value: any }>;
  legacyTriggerOption?: { label: string; value: any };
  conditionFields: ModuleField[];
  hasLockedTaskType: boolean;
  lockedTaskTypeLabel?: string;
  dynamicOptions: Record<string, OptionList>;
  relationOptions: Record<string, OptionList>;
  dynamicFieldProps?: Record<string, { onOptionsUpdate?: () => void; protectedValues?: string[] }>;
  onBeforeAddCondition?: () => boolean | void;
  actionsBuilder: {
    currentModuleId: string;
    currentModuleFields: ModuleField[];
    variableFields: ModuleField[];
    nextStageFields: ModuleField[];
    enableNextStageActions: boolean;
    processStageOptions?: OptionList;
    activationStageOptions?: OptionList;
    moduleOptions: WorkflowModuleOption[];
    relationSourceModuleOptions: WorkflowModuleOption[];
    processTargetModuleIds: string[];
    additionalRecipientFieldOptions: OptionList;
  };
  overlayZIndexBase: number;
  popupContainer: (trigger?: HTMLElement | null) => HTMLElement;
};

type ProcessAutomationRuleInspectorProps = {
  rule: ProcessAutomationRule;
  selection: FlowSelection;
  onPatch: (patch: Partial<ProcessAutomationRule>) => void;
  context: ProcessAutomationRuleInspectorContext;
  disabled?: boolean;
};

const ProcessAutomationRuleInspector: React.FC<ProcessAutomationRuleInspectorProps> = ({
  rule,
  selection,
  onPatch,
  context,
  disabled = false,
}) => {
  const ruleActions: WorkflowAction[] = Array.isArray(rule?.actions) ? rule.actions : [];

  const applyActionsPatch = (next: WorkflowAction[]) => {
    onPatch({
      actions: next,
      note_text: extractRuleNoteTextFromActions(next),
    });
  };

  if (selection.kind === 'trigger') {
    const triggerOptions = String(rule?.trigger_type || '').trim() === 'previous_stage_completed' && context.legacyTriggerOption
      ? [...context.triggerTypeOptions, context.legacyTriggerOption]
      : context.triggerTypeOptions;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12">
            <div className="mb-1 text-xs text-gray-500">نام اتوماسیون</div>
            <Input
              disabled={disabled}
              value={String(rule?.name || '')}
              onChange={(event) => onPatch({ name: event.target.value })}
              placeholder="مثلا: خبر به چاپ"
            />
          </div>
          <div className="col-span-12">
            <div className="mb-1 text-xs text-gray-500">توضیحات</div>
            <Input
              disabled={disabled}
              value={String(rule?.description || '')}
              onChange={(event) => onPatch({ description: event.target.value })}
              placeholder="توضیح کوتاه"
            />
          </div>
          <div className="col-span-12 flex items-center gap-2">
            <Switch
              size="small"
              disabled={disabled}
              checked={rule?.is_active !== false}
              onChange={(checked) => onPatch({ is_active: checked })}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {rule?.is_active !== false ? 'فعال' : 'غیرفعال'}
            </span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-gray-500">نوع اجرا</div>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            disabled={disabled}
            value={rule?.trigger_type}
            options={triggerOptions}
            onChange={(event) => {
              const triggerType = event.target.value as ProcessAutomationRule['trigger_type'];
              onPatch({
                trigger_type: triggerType,
                interval_value: triggerType === 'interval' ? (rule?.interval_value || 1) : null,
                interval_unit: triggerType === 'interval' ? (rule?.interval_unit || 'day') : null,
                interval_at: triggerType === 'interval' ? (rule?.interval_at || null) : null,
                batch_size: triggerType === 'interval' ? (rule?.batch_size || null) : null,
              });
            }}
          />
        </div>
        <div>
          <div className="mb-2 text-xs text-gray-500">زمان اجرا</div>
          <Radio.Group
            disabled={disabled}
            value={rule?.execution_mode || 'every_match'}
            options={workflowExecutionModeOptions}
            onChange={(event) => onPatch({ execution_mode: event.target.value as WorkflowExecutionMode })}
          />
        </div>
        {rule?.trigger_type === 'interval' ? (
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <Alert
                type="info"
                showIcon
                message="اجرای زمان بندی نیاز به Runner دارد (Cron Job یا Edge Function زمان بندی شده)."
              />
            </div>
            <div className="col-span-6">
              <div className="mb-1 text-xs text-gray-500">هر</div>
              <InputNumber
                min={1}
                disabled={disabled}
                className="w-full persian-number"
                value={rule?.interval_value || undefined}
                onChange={(value) => onPatch({
                  interval_value: Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : 1,
                })}
                placeholder="عدد"
              />
            </div>
            <div className="col-span-6">
              <div className="mb-1 text-xs text-gray-500">واحد زمان</div>
              <AdaptiveSelectField
                disabled={disabled}
                value={rule?.interval_unit || 'day'}
                options={intervalUnitOptions}
                onChange={(value) => onPatch({ interval_unit: value })}
                getPopupContainer={context.popupContainer}
                modalContainer={context.popupContainer}
                overlayZIndexBase={context.overlayZIndexBase}
              />
            </div>
            <div className="col-span-6">
              <div className="mb-1 text-xs text-gray-500">در ساعت</div>
              <PersianDatePicker
                type="TIME"
                value={rule?.interval_at || null}
                onChange={(value) => onPatch({ interval_at: value || null })}
                overlayZIndexBase={context.overlayZIndexBase}
                modalContainer={context.popupContainer}
              />
            </div>
            <div className="col-span-6">
              <div className="mb-1 text-xs text-gray-500">تعداد بررسی</div>
              <InputNumber
                min={1}
                disabled={disabled}
                className="w-full persian-number"
                value={rule?.batch_size || undefined}
                onChange={(value) => onPatch({
                  batch_size: value === null || value === undefined
                    ? null
                    : (Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : null),
                })}
                placeholder="پیش فرض: همه"
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (selection.kind === 'conditions') {
    const editableAllConditions = filterEditableAutomationConditions(rule?.conditions_all);
    const editableAnyConditions = filterEditableAutomationConditions(rule?.conditions_any);
    return (
      <div className="space-y-4">
        {context.hasLockedTaskType && context.lockedTaskTypeLabel ? (
          <div className="rounded-xl border border-dashed border-[rgba(var(--brand-200-rgb),0.75)] bg-white/70 px-3 py-2 text-xs leading-6 text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-300">
            <span className="font-semibold text-[rgba(var(--brand-700-rgb),1)] dark:text-[rgba(var(--brand-200-rgb),1)]">شرط پیش‌فرض:</span>
            {' '}نوع فعالیت (فعالیت) برابر است با{' '}
            <span className="font-semibold">{context.lockedTaskTypeLabel}</span>
          </div>
        ) : null}
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-500">همه شرط‌ها</div>
          <WorkflowConditionsGroup
            value={editableAllConditions}
            onChange={(next) => onPatch({
              conditions_all: (next as WorkflowCondition[]).filter(
                (condition) => String(condition?.id || '') !== '__locked_stage_task_type__'
              ),
            })}
            fields={context.conditionFields}
            dynamicOptions={context.dynamicOptions}
            relationOptions={context.relationOptions}
            dynamicFieldProps={context.dynamicFieldProps}
            onBeforeAddCondition={context.onBeforeAddCondition}
            disabled={disabled}
            overlayZIndexBase={context.overlayZIndexBase}
            popupContainer={context.popupContainer}
          />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-500">یا یکی از شرط‌ها</div>
          <WorkflowConditionsGroup
            value={editableAnyConditions}
            onChange={(next) => onPatch({
              conditions_any: filterEditableAutomationConditions(next as WorkflowCondition[]),
            })}
            fields={context.conditionFields}
            dynamicOptions={context.dynamicOptions}
            relationOptions={context.relationOptions}
            dynamicFieldProps={context.dynamicFieldProps}
            onBeforeAddCondition={context.onBeforeAddCondition}
            disabled={disabled}
            overlayZIndexBase={context.overlayZIndexBase}
            popupContainer={context.popupContainer}
          />
        </div>
      </div>
    );
  }

  return (
    <WorkflowActionsBuilder
      value={ruleActions}
      onChange={applyActionsPatch}
      visibleActionIds={[String(selection.actionId)]}
      hideAddButton
      hideReorderControls
      currentModuleId={context.actionsBuilder.currentModuleId}
      currentModuleFields={context.actionsBuilder.currentModuleFields}
      variableFields={context.actionsBuilder.variableFields}
      nextStageFields={context.actionsBuilder.nextStageFields}
      enableNextStageActions={context.actionsBuilder.enableNextStageActions}
      processStageOptions={context.actionsBuilder.processStageOptions}
      activationStageOptions={context.actionsBuilder.activationStageOptions}
      moduleOptions={context.actionsBuilder.moduleOptions}
      relationSourceModuleOptions={context.actionsBuilder.relationSourceModuleOptions}
      processTargetModuleIds={context.actionsBuilder.processTargetModuleIds}
      additionalRecipientFieldOptions={context.actionsBuilder.additionalRecipientFieldOptions}
      dynamicOptions={context.dynamicOptions}
      relationOptions={context.relationOptions}
      disabled={disabled}
      overlayZIndexBase={context.overlayZIndexBase}
      popupContainer={context.popupContainer}
    />
  );
};

export default ProcessAutomationRuleInspector;
