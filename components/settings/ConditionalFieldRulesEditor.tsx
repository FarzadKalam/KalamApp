import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { ModuleField } from '../../types';
import WorkflowConditionsGroup from '../workflows/WorkflowConditionsGroup';
import {
  ConditionalFieldDefaultMode,
  ConditionalFieldRequiredMode,
  ConditionalFieldRule,
  ConditionalFieldSettings,
  getConditionalFieldClearValue,
  normalizeConditionalFieldSettings,
  normalizeConditionalFieldValueForField,
} from '../../utils/conditionalFieldRules';
import { buildResolvedConditionalFieldSettings } from '../../utils/conditionalFieldDefaults';
import { createWorkflowId } from '../../utils/workflowTypes';
import { getWorkflowOperatorOptions } from '../../utils/filterUtils';
import SettingsCollapsiblePanel from './SettingsCollapsiblePanel';
import SettingsFieldValueInput from './SettingsFieldValueInput';

interface ConditionalFieldRulesEditorProps {
  moduleId: string;
  fields: ModuleField[];
  value?: ConditionalFieldSettings | null;
  disabled?: boolean;
  onChange: (next: ConditionalFieldSettings) => void;
}

const requiredModeOptions: Array<{ label: string; value: ConditionalFieldRequiredMode }> = [
  { label: 'از ساختار فیلد', value: 'inherit' },
  { label: 'اجباری', value: 'force_required' },
  { label: 'اختیاری', value: 'force_optional' },
];

const defaultModeOptions: Array<{ label: string; value: ConditionalFieldDefaultMode }> = [
  { label: 'بدون تغییر', value: 'inherit' },
  { label: 'خالی شود', value: 'clear' },
  { label: 'مقدار پیش‌فرض', value: 'set_value' },
];

const normalizeString = (value: any) => String(value || '').trim();

const getFieldLabel = (field?: ModuleField | null) => field?.labels?.fa || field?.key || '-';

const buildFieldOptionList = (field?: ModuleField | null) => {
  if (!field || !Array.isArray(field.options)) return [];
  return field.options.map((option: any) => ({
    label: String(option?.label ?? option?.value ?? ''),
    value: String(option?.value ?? ''),
  }));
};

const buildReadableEffect = (rule: ConditionalFieldRule) => {
  const effect = rule.effect || {};
  const visibilityLabel = effect.showField === false ? 'عدم نمایش' : 'نمایش';
  const requiredLabel = requiredModeOptions.find((entry) => entry.value === effect.requiredMode)?.label || 'از ساختار فیلد';
  const defaultLabel = defaultModeOptions.find((entry) => entry.value === effect.defaultMode)?.label || 'بدون تغییر';
  return { visibilityLabel, requiredLabel, defaultLabel };
};

const formatConditionValue = (field: ModuleField | undefined, value: any) => {
  if (value === undefined || value === null || value === '') return 'خالی';
  const options = buildFieldOptionList(field);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        const matchedOption = options.find((option) => String(option.value) === String(item));
        return matchedOption?.label || String(item);
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join('، ') : 'خالی';
  }
  const matchedOption = options.find((option) => String(option.value) === String(value));
  return matchedOption?.label || String(value);
};

const buildRuleSummary = (rule: ConditionalFieldRule, fields: ModuleField[]) => {
  const conditions = [
    ...(Array.isArray(rule.conditions_all) ? rule.conditions_all : []),
    ...(Array.isArray(rule.conditions_any) ? rule.conditions_any : []),
  ];

  if (conditions.length === 0) return 'بدون شرط';

  return conditions.slice(0, 2).map((condition) => {
    const conditionField = fields.find((field) => field.key === condition.field);
    const operatorEntry = conditionField
      ? getWorkflowOperatorOptions(conditionField).find((entry) => String(entry.value) === String(condition.operator))
      : null;
    const operatorLabel = operatorEntry?.label || String(condition.operator || '');
    return `${getFieldLabel(conditionField)} ${operatorLabel} ${formatConditionValue(conditionField, condition.value)}`;
  }).join(' | ');
};

const ConditionalFieldRulesEditor: React.FC<ConditionalFieldRulesEditorProps> = ({
  moduleId,
  fields,
  value,
  disabled = false,
  onChange,
}) => {
  const normalizedUserSettings = useMemo(
    () => normalizeConditionalFieldSettings(value),
    [value],
  );

  const resolvedSettings = useMemo(
    () => buildResolvedConditionalFieldSettings({ id: moduleId, fields }, normalizedUserSettings),
    [fields, moduleId, normalizedUserSettings],
  );

  const fieldOptions = useMemo(
    () => fields
      .filter((field) => !!normalizeString(field?.key))
      .map((field) => ({
        label: getFieldLabel(field),
        value: field.key,
      })),
    [fields],
  );

  const systemRules = useMemo(
    () => resolvedSettings.rules.filter((rule) => rule.source === 'system'),
    [resolvedSettings.rules],
  );

  const userRules = useMemo(
    () => normalizedUserSettings.rules.filter((rule) => rule.source !== 'system'),
    [normalizedUserSettings.rules],
  );

  const updateUserRules = (nextRules: ConditionalFieldRule[]) => {
    onChange(normalizeConditionalFieldSettings({ rules: nextRules }));
  };

  const updateRule = (ruleId: string, patch: Partial<ConditionalFieldRule>) => {
    updateUserRules(
      userRules.map((rule) => (
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
              effect: {
                ...(rule.effect || {}),
                ...((patch.effect || {}) as Record<string, any>),
              },
            }
          : rule
      )),
    );
  };

  const updateRuleTargetField = (rule: ConditionalFieldRule, nextFieldKey: string) => {
    const nextField = fields.find((field) => field.key === nextFieldKey);
    const currentDefaultMode = rule.effect?.defaultMode || 'inherit';
    updateRule(rule.id, {
      targetFieldKey: nextFieldKey,
      effect: {
        ...(rule.effect || {}),
        defaultValue: currentDefaultMode === 'set_value'
          ? normalizeConditionalFieldValueForField(nextField, rule.effect?.defaultValue)
          : rule.effect?.defaultValue,
      },
    });
  };

  const addRule = () => {
    if (disabled || fieldOptions.length === 0) return;
    const firstFieldKey = String(fieldOptions[0]?.value || '').trim();
    if (!firstFieldKey) return;

    updateUserRules([
      ...userRules,
      {
        id: createWorkflowId(),
        targetFieldKey: firstFieldKey,
        source: 'user',
        locked: false,
        enabled: true,
        priority: 0,
        conditions_all: [],
        conditions_any: [],
        effect: {
          showField: true,
          requiredMode: 'inherit',
          defaultMode: 'inherit',
        },
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        message="شرط‌های سیستمی برای سازگاری رفتار فعلی پروژه نمایش داده می‌شوند و قابل ویرایش نیستند. شرط‌های سفارشی شما به همان منطق عمومی فرم و نمایش متصل می‌شوند."
      />

      <Card
        title="شرط‌های سیستمی"
        size="small"
        className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
      >
        <Space direction="vertical" className="w-full">
          {systemRules.length === 0 ? (
            <Empty description="شرط سیستمی فعالی برای این ماژول وجود ندارد." image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            systemRules.map((rule) => {
              const targetField = fields.find((field) => field.key === rule.targetFieldKey);
              const readableEffect = buildReadableEffect(rule);
              return (
                <SettingsCollapsiblePanel
                  key={rule.id}
                  defaultExpanded={false}
                  className="rounded-lg border border-dashed border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#101010]"
                  bodyClassName="mt-3"
                  header={(
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag color="blue">سیستمی</Tag>
                        {rule.locked ? <Tag color="red">قفل‌شده</Tag> : null}
                        <Tag>{getFieldLabel(targetField)}</Tag>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          اولویت: {rule.priority}
                        </Typography.Text>
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {buildRuleSummary(rule, fields)}
                      </div>
                    </div>
                  )}
                >
                  <Space direction="vertical" className="w-full">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>اثر: {readableEffect.visibilityLabel}</span>
                      <span>الزام: {readableEffect.requiredLabel}</span>
                      <span>پیش‌فرض: {readableEffect.defaultLabel}</span>
                    </div>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          همه شرط‌ها
                        </Typography.Text>
                        <WorkflowConditionsGroup
                          value={rule.conditions_all || []}
                          onChange={() => undefined}
                          fields={fields}
                          dynamicOptions={{}}
                          relationOptions={{}}
                          disabled
                        />
                      </Col>
                      <Col xs={24} lg={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          یکی از شرط‌ها
                        </Typography.Text>
                        <WorkflowConditionsGroup
                          value={rule.conditions_any || []}
                          onChange={() => undefined}
                          fields={fields}
                          dynamicOptions={{}}
                          relationOptions={{}}
                          disabled
                        />
                      </Col>
                    </Row>
                  </Space>
                </SettingsCollapsiblePanel>
              );
            })
          )}
        </Space>
      </Card>

      <Card
        title="شرط‌های سفارشی"
        size="small"
        extra={(
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={addRule}
            disabled={disabled || fieldOptions.length === 0}
          >
            افزودن شرط
          </Button>
        )}
        className="border-gray-200 dark:!bg-[#141414] dark:!border-gray-800"
      >
        <Space direction="vertical" className="w-full">
          {userRules.length === 0 ? (
            <Empty description="هنوز شرط سفارشی تعریف نشده است." image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            userRules.map((rule) => {
              const targetField = fields.find((field) => field.key === rule.targetFieldKey);
              const defaultMode = rule.effect?.defaultMode || 'inherit';

              return (
                <SettingsCollapsiblePanel
                  key={rule.id}
                  defaultExpanded
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#101010]"
                  bodyClassName="mt-3"
                  header={(
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag color="green">سفارشی</Tag>
                        <Tag>{getFieldLabel(targetField)}</Tag>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          اولویت: {rule.priority}
                        </Typography.Text>
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {buildRuleSummary(rule, fields)}
                      </div>
                    </div>
                  )}
                  extra={(
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      disabled={disabled}
                      onClick={() => updateUserRules(userRules.filter((item) => item.id !== rule.id))}
                    >
                      حذف
                    </Button>
                  )}
                >
                  <Space direction="vertical" className="w-full">
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          فیلد هدف
                        </Typography.Text>
                        <Select
                          className="mt-1 w-full"
                          value={rule.targetFieldKey}
                          options={fieldOptions}
                          disabled={disabled}
                          onChange={(nextValue) => updateRuleTargetField(rule, nextValue)}
                        />
                      </Col>
                      <Col xs={12} md={6}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          فعال
                        </Typography.Text>
                        <div className="mt-2">
                          <Switch
                            checked={rule.enabled !== false}
                            disabled={disabled}
                            onChange={(checked) => updateRule(rule.id, { enabled: checked })}
                          />
                        </div>
                      </Col>
                      <Col xs={12} md={6}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          اولویت
                        </Typography.Text>
                        <InputNumber
                          className="mt-1 w-full"
                          value={rule.priority}
                          disabled={disabled}
                          onChange={(nextValue) => updateRule(rule.id, { priority: Number(nextValue ?? 0) })}
                        />
                      </Col>
                    </Row>

                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          وضعیت اجباری بودن
                        </Typography.Text>
                        <Select
                          className="mt-1 w-full"
                          value={rule.effect?.requiredMode || 'inherit'}
                          options={requiredModeOptions}
                          disabled={disabled}
                          onChange={(nextValue) =>
                            updateRule(rule.id, {
                              effect: {
                                ...(rule.effect || {}),
                                requiredMode: nextValue,
                              },
                            })}
                        />
                      </Col>
                      <Col xs={24} md={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          رفتار مقدار پیش‌فرض
                        </Typography.Text>
                        <Select
                          className="mt-1 w-full"
                          value={defaultMode}
                          options={defaultModeOptions}
                          disabled={disabled}
                          onChange={(nextValue) =>
                            updateRule(rule.id, {
                              effect: {
                                ...(rule.effect || {}),
                                defaultMode: nextValue,
                                defaultValue: nextValue === 'set_value'
                                  ? normalizeConditionalFieldValueForField(
                                      targetField,
                                      rule.effect?.defaultValue ?? getConditionalFieldClearValue(targetField),
                                    )
                                  : undefined,
                              },
                            })}
                        />
                      </Col>
                    </Row>

                    {defaultMode === 'set_value' ? (
                      <div>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          مقدار پیش‌فرض هنگام نمایش فیلد
                        </Typography.Text>
                        <div className="mt-1">
                          <SettingsFieldValueInput
                            field={targetField}
                            value={normalizeConditionalFieldValueForField(targetField, rule.effect?.defaultValue)}
                            disabled={disabled}
                            moduleId={moduleId}
                            onChange={(nextValue) =>
                              updateRule(rule.id, {
                                effect: {
                                  ...(rule.effect || {}),
                                  defaultMode: 'set_value',
                                  defaultValue: normalizeConditionalFieldValueForField(targetField, nextValue),
                                },
                              })}
                          />
                        </div>
                      </div>
                    ) : null}

                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          همه شرط‌ها
                        </Typography.Text>
                        <WorkflowConditionsGroup
                          value={rule.conditions_all || []}
                          onChange={(nextValue) => updateRule(rule.id, { conditions_all: nextValue })}
                          fields={fields}
                          dynamicOptions={{}}
                          relationOptions={{}}
                          disabled={disabled}
                        />
                      </Col>
                      <Col xs={24} lg={12}>
                        <Typography.Text className="text-xs text-gray-500 dark:text-gray-400">
                          یکی از شرط‌ها
                        </Typography.Text>
                        <WorkflowConditionsGroup
                          value={rule.conditions_any || []}
                          onChange={(nextValue) => updateRule(rule.id, { conditions_any: nextValue })}
                          fields={fields}
                          dynamicOptions={{}}
                          relationOptions={{}}
                          disabled={disabled}
                        />
                      </Col>
                    </Row>
                  </Space>
                </SettingsCollapsiblePanel>
              );
            })
          )}
        </Space>
      </Card>
    </div>
  );
};

export default ConditionalFieldRulesEditor;
