import React, { useEffect, useState } from 'react';
import { Button, Empty, Input, Modal, Select, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  createDefaultProcessAutomationRule,
  getProcessAutomationRuleSummary,
  normalizeProcessAutomationRules,
  PROCESS_AUTOMATION_TARGET_OPTIONS,
  ProcessAutomationRule,
} from '../../utils/processAutomationTypes';

interface StageAutomationEditorProps {
  open: boolean;
  value?: ProcessAutomationRule[] | null;
  statusOptions: Array<{ label: string; value: string | number }>;
  taskTypeOptions: Array<{ label: string; value: string }>;
  userOptions: Array<{ label: string; value: string }>;
  roleOptions: Array<{ label: string; value: string }>;
  onCancel: () => void;
  onSave: (rules: ProcessAutomationRule[]) => void;
}

const StageAutomationEditor: React.FC<StageAutomationEditorProps> = ({
  open,
  value,
  statusOptions,
  taskTypeOptions,
  userOptions,
  roleOptions,
  onCancel,
  onSave,
}) => {
  const [rules, setRules] = useState<ProcessAutomationRule[]>([]);

  useEffect(() => {
    if (!open) return;
    setRules(normalizeProcessAutomationRules(value));
  }, [open, value]);

  const updateRule = (ruleId: string, patch: Partial<ProcessAutomationRule>) => {
    setRules((prev) => prev.map((rule) => (
      String(rule.id) === String(ruleId)
        ? { ...rule, ...patch }
        : rule
    )));
  };

  const removeRule = (ruleId: string) => {
    setRules((prev) => prev.filter((rule) => String(rule.id) !== String(ruleId)));
  };

  return (
    <Modal
      title="اتوماسیون‌های این مرحله"
      open={open}
      onCancel={onCancel}
      destroyOnHidden
      width={760}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          انصراف
        </Button>,
        <Button
          key="save"
          type="primary"
          className="bg-amber-700 hover:!bg-amber-600 border-none"
          onClick={() => onSave(normalizeProcessAutomationRules(rules))}
        >
          ذخیره اتوماسیون‌ها
        </Button>,
      ]}
    >
      <div className="space-y-4 pt-2">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          در این نسخه، اتوماسیون مرحله بر پایه تغییر وضعیت فعالیت اجرا می‌شود و خروجی آن یک یادداشت روی رکورد مرتبط است که به کاربر یا تیم هدف منشن می‌دهد.
        </div>

        {rules.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="هنوز اتوماسیونی برای این مرحله تعریف نشده است."
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule, index) => {
              const targetType = String(rule?.target_type || '').trim();
              return (
                <div
                  key={rule.id}
                  className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-white/95 p-4 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        قانون {index + 1}
                      </div>
                      <div className="text-xs text-gray-500">
                        {getProcessAutomationRuleSummary(rule)}
                      </div>
                    </div>
                    <Space>
                      <span className="text-xs text-gray-500">فعال</span>
                      <Switch
                        size="small"
                        checked={rule.is_active !== false}
                        onChange={(checked) => updateRule(rule.id, { is_active: checked })}
                      />
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => removeRule(rule.id)}
                      />
                    </Space>
                  </div>

                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-6">
                      <div className="mb-1 text-xs text-gray-500">نام قانون</div>
                      <Input
                        value={String(rule?.name || '')}
                        placeholder="مثلا: خبر به چاپ"
                        onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <div className="mb-1 text-xs text-gray-500">وقتی وضعیت شد</div>
                      <Select
                        value={rule?.trigger_status || undefined}
                        options={statusOptions.map((option) => ({
                          label: option.label,
                          value: String(option.value),
                        }))}
                        onChange={(value) => updateRule(rule.id, { trigger_status: String(value || '') })}
                        placeholder="وضعیت را انتخاب کنید"
                        showSearch
                        optionFilterProp="label"
                        placement="bottomRight"
                        getPopupContainer={(node) => node?.parentElement || document.body}
                      />
                    </div>

                    <div className="col-span-12 md:col-span-6">
                      <div className="mb-1 text-xs text-gray-500">گیرنده</div>
                      <Select
                        value={rule?.target_type}
                        options={PROCESS_AUTOMATION_TARGET_OPTIONS}
                        onChange={(value) => updateRule(rule.id, {
                          target_type: value,
                          ...(value !== 'task_type_assignee' ? { target_task_type: null } : {}),
                          ...(value !== 'specific_user' ? { target_user_id: null } : {}),
                          ...(value !== 'specific_role' ? { target_role_id: null } : {}),
                        })}
                        placement="bottomRight"
                        getPopupContainer={(node) => node?.parentElement || document.body}
                      />
                    </div>

                    {targetType === 'task_type_assignee' ? (
                      <div className="col-span-12 md:col-span-6">
                        <div className="mb-1 text-xs text-gray-500">نوع فعالیت مقصد</div>
                        <Select
                          value={rule?.target_task_type || undefined}
                          options={taskTypeOptions}
                          onChange={(value) => updateRule(rule.id, { target_task_type: String(value || '') })}
                          placeholder="نوع فعالیت را انتخاب کنید"
                          showSearch
                          optionFilterProp="label"
                          placement="bottomRight"
                          getPopupContainer={(node) => node?.parentElement || document.body}
                        />
                      </div>
                    ) : null}

                    {targetType === 'specific_user' ? (
                      <div className="col-span-12 md:col-span-6">
                        <div className="mb-1 text-xs text-gray-500">کاربر مقصد</div>
                        <Select
                          value={rule?.target_user_id || undefined}
                          options={userOptions}
                          onChange={(value) => updateRule(rule.id, { target_user_id: String(value || '') })}
                          placeholder="کاربر را انتخاب کنید"
                          showSearch
                          optionFilterProp="label"
                          placement="bottomRight"
                          getPopupContainer={(node) => node?.parentElement || document.body}
                        />
                      </div>
                    ) : null}

                    {targetType === 'specific_role' ? (
                      <div className="col-span-12 md:col-span-6">
                        <div className="mb-1 text-xs text-gray-500">تیم مقصد</div>
                        <Select
                          value={rule?.target_role_id || undefined}
                          options={roleOptions}
                          onChange={(value) => updateRule(rule.id, { target_role_id: String(value || '') })}
                          placeholder="تیم را انتخاب کنید"
                          showSearch
                          optionFilterProp="label"
                          placement="bottomRight"
                          getPopupContainer={(node) => node?.parentElement || document.body}
                        />
                      </div>
                    ) : null}

                    <div className="col-span-12">
                      <div className="mb-1 text-xs text-gray-500">متن یادداشت</div>
                      <Input.TextArea
                        value={String(rule?.note_text || '')}
                        rows={3}
                        placeholder="مثلا: فعالیت {{task_name}} وارد وضعیت {{status_label}} شد."
                        onChange={(event) => updateRule(rule.id, { note_text: event.target.value })}
                      />
                      <div className="mt-1 text-[11px] text-gray-500">
                        متغیرهای فعلی: <code>{'{{task_name}}'}</code> <code>{'{{task_type}}'}</code>{' '}
                        <code>{'{{status}}'}</code> <code>{'{{status_label}}'}</code>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          icon={<PlusOutlined />}
          onClick={() => setRules((prev) => [...prev, createDefaultProcessAutomationRule()])}
        >
          افزودن قانون
        </Button>
      </div>
    </Modal>
  );
};

export default StageAutomationEditor;
