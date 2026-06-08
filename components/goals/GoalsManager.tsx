import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Collapse, Empty, Modal, Popconfirm, Select, Space, Spin, Switch, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import {
  ensureDefaultSalesInvoiceGoal,
  getGoalLifetimeRange,
  getGoalModuleOptions,
  isGoalAssignedToAllUsers,
  normalizeGoalRecord,
} from '../../utils/goals';
import {
  fetchCurrentUserRoleContext,
  resolveModuleGoalAccessPermissions,
  resolveGoalsAccessPermissions,
  type PermissionMap,
} from '../../utils/permissions';
import { GOAL_METRIC_TYPE_OPTIONS, GOAL_PERIOD_UNIT_OPTIONS, type GoalRecord } from '../../utils/goalTypes';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import GoalEditorModal from './GoalEditorModal';

type GoalsManagerProps = {
  inline?: boolean;
  open?: boolean;
  onClose?: () => void;
  defaultModuleId?: string | null;
};

type GoalAccessState = ReturnType<typeof resolveGoalsAccessPermissions>;

const defaultAccess: GoalAccessState = {
  canViewManager: true,
  canViewModuleCards: true,
  canViewDashboardWidget: true,
  canEditGoals: true,
  canDeleteGoals: true,
};
const GOAL_MANAGER_SELECT_FIELDS = [
  'id',
  'org_id',
  'module_id',
  'name',
  'description',
  'goal_scope',
  'period_unit',
  'subperiod_unit',
  'metric_type',
  'metric_field_key',
  'date_field_key',
  'target_value',
  'levels_enabled',
  'bronze_value',
  'silver_value',
  'gold_value',
  'assignee_user_ids',
  'assignee_role_ids',
  'conditions_all',
  'conditions_any',
  'config',
  'is_active',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
].join(',');

const GoalsManager: React.FC<GoalsManagerProps> = ({
  inline = false,
  open = false,
  onClose,
  defaultModuleId,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<GoalRecord[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string>(defaultModuleId || 'all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GoalRecord | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [access, setAccess] = useState<GoalAccessState>(defaultAccess);
  const popupContainer = useCallback((node?: HTMLElement | null) => node?.parentElement || document.body, []);

  const moduleOptions = useMemo(() => getGoalModuleOptions(permissions), [permissions]);
  const canCreateForCurrentFilter = useMemo(() => {
    if (!access.canEditGoals) return false;
    if (moduleFilter !== 'all') {
      return resolveModuleGoalAccessPermissions(permissions, moduleFilter).canCreateGoal;
    }
    return moduleOptions.some((option) => resolveModuleGoalAccessPermissions(permissions, option.value).canCreateGoal);
  }, [access.canEditGoals, moduleFilter, moduleOptions, permissions]);
  const canEditGoalRecord = useCallback(
    (record: GoalRecord) => access.canEditGoals && resolveModuleGoalAccessPermissions(permissions, record.module_id).canEditGoal,
    [access.canEditGoals, permissions]
  );

  const fetchPermissions = useCallback(async () => {
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      setPermissions(context.permissions);
      setAccess(resolveGoalsAccessPermissions(context.permissions));
    } catch {
      setPermissions(null);
      setAccess(defaultAccess);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      await ensureDefaultSalesInvoiceGoal({ userId: context.userId });

      let query = supabase.from('goals').select(GOAL_MANAGER_SELECT_FIELDS).order('updated_at', { ascending: false });
      if (moduleFilter !== 'all') {
        query = query.eq('module_id', moduleFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      setRecords((data || []).map((item) => normalizeGoalRecord(item)));
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت هدف‌ها ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message, moduleFilter]);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    if (!inline && !open) return;
    if (!access.canViewManager) return;
    void fetchRecords();
  }, [access.canViewManager, fetchRecords, inline, open]);

  useEffect(() => {
    if (defaultModuleId && moduleFilter === 'all') {
      setModuleFilter(defaultModuleId);
    }
  }, [defaultModuleId, moduleFilter]);

  const toggleActive = async (record: GoalRecord, checked: boolean) => {
    if (!canEditGoalRecord(record)) return;
    try {
      const { error } = await supabase.from('goals').update({ is_active: checked }).eq('id', record.id);
      if (error) throw error;
      setRecords((prev) => prev.map((item) => (item.id === record.id ? { ...item, is_active: checked } : item)));
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تغییر وضعیت هدف ناموفق بود.'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!access.canDeleteGoals) return;
    try {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
      message.success('هدف حذف شد.');
      void fetchRecords();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف هدف ناموفق بود.'));
    }
  };

  const renderSummary = (record: GoalRecord) => {
    const metricLabel = GOAL_METRIC_TYPE_OPTIONS.find((item) => item.value === record.metric_type)?.label || record.metric_type;
    const periodLabel = GOAL_PERIOD_UNIT_OPTIONS.find((item) => item.value === record.period_unit)?.label || record.period_unit;
    const subperiodLabel = GOAL_PERIOD_UNIT_OPTIONS.find((item) => item.value === record.subperiod_unit)?.label || record.subperiod_unit;
    const lifetimeRange = getGoalLifetimeRange(record);
    const levelTags = [
      record.bronze_value ? <Tag key="bronze" color="orange">برنز: {record.bronze_value}</Tag> : null,
      record.silver_value ? <Tag key="silver" color="default">نقره: {record.silver_value}</Tag> : null,
      record.gold_value ? <Tag key="gold" color="gold">طلا: {record.gold_value}</Tag> : null,
    ].filter(Boolean);

    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div>ماژول: <span className="font-semibold text-gray-800 dark:text-gray-100">{MODULES[record.module_id]?.titles?.fa || record.module_id}</span></div>
          <div>نوع: <span className="font-semibold text-gray-800 dark:text-gray-100">{record.goal_scope === 'team' ? 'تیمی' : 'فردی'}</span></div>
          <div>بازه اصلی: <span className="font-semibold text-gray-800 dark:text-gray-100">{periodLabel}</span></div>
          <div>بازه فرعی پیش‌فرض: <span className="font-semibold text-gray-800 dark:text-gray-100">{subperiodLabel}</span></div>
          <div>بازه هدف: <span className="font-semibold text-gray-800 dark:text-gray-100">{lifetimeRange ? `${lifetimeRange.startLabel} تا ${lifetimeRange.endLabel}` : 'دائمی'}</span></div>
          <div>نوع سنجش: <span className="font-semibold text-gray-800 dark:text-gray-100">{metricLabel}</span></div>
          {record.metric_field_key ? (
            <div>فیلد عددی: <span className="font-semibold text-gray-800 dark:text-gray-100">{record.metric_field_key}</span></div>
          ) : null}
          <div>فیلد تاریخ: <span className="font-semibold text-gray-800 dark:text-gray-100">{record.date_field_key || 'created_at'}</span></div>
        </div>

        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          {record.description ? <div>{record.description}</div> : null}
          <div>کاربران: <span className="font-semibold text-gray-800 dark:text-gray-100">{isGoalAssignedToAllUsers(record) ? 'همه کاربران' : ((record.assignee_user_ids || []).length || 'همه')}</span></div>
          <div>نقش‌ها: <span className="font-semibold text-gray-800 dark:text-gray-100">{(record.assignee_role_ids || []).length || 'همه'}</span></div>
          <div>شرط‌های همه: <span className="font-semibold text-gray-800 dark:text-gray-100">{(record.conditions_all || []).length}</span></div>
          <div>شرط‌های یکی: <span className="font-semibold text-gray-800 dark:text-gray-100">{(record.conditions_any || []).length}</span></div>
          {!record.levels_enabled ? (
            <div>مقدار هدف: <span className="font-semibold text-gray-800 dark:text-gray-100">{record.target_value || 0}</span></div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">{levelTags}</div>
          )}
        </div>
      </div>
    );
  };

  const content = (
    <div className={inline ? '' : 'px-1'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Space wrap>
          <Select
            value={moduleFilter}
            onChange={(value) => setModuleFilter(String(value))}
            options={[{ label: 'همه ماژول‌ها', value: 'all' }, ...moduleOptions]}
            className="min-w-[240px]"
            showSearch
            optionFilterProp="label"
            getPopupContainer={popupContainer}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void fetchRecords()} />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canCreateForCurrentFilter}
          className="bg-leather-600 hover:!bg-leather-500"
          onClick={() => {
            setEditingRecord(null);
            setEditorOpen(true);
          }}
        >
          افزودن هدف
        </Button>
      </div>

      {!access.canViewManager ? (
        <div className="py-16">
          <Empty description="دسترسی مشاهده هدف‌ها را ندارید." />
        </div>
      ) : loading ? (
        <div className="flex h-56 items-center justify-center">
          <Spin size="large" />
        </div>
      ) : records.length === 0 ? (
        <div className="py-16">
          <Empty description="هنوز هدفی ثبت نشده است." />
        </div>
      ) : (
        <Collapse
          className="goal-manager-collapse"
          items={records.map((record) => ({
            key: record.id,
            label: (
              <div className="flex min-w-0 items-center justify-between gap-3 pr-4">
                <div className="min-w-0">
                  <div className="truncate font-bold text-gray-800 dark:text-gray-100">{record.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Tag color="blue">{MODULES[record.module_id]?.titles?.fa || record.module_id}</Tag>
                    <Tag>{record.goal_scope === 'team' ? 'تیمی' : 'فردی'}</Tag>
                    <Tag>{GOAL_METRIC_TYPE_OPTIONS.find((item) => item.value === record.metric_type)?.label || record.metric_type}</Tag>
                    <Tag>{GOAL_PERIOD_UNIT_OPTIONS.find((item) => item.value === record.period_unit)?.label || record.period_unit}</Tag>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  <Switch
                    checked={record.is_active !== false}
                    checkedChildren="فعال"
                    unCheckedChildren="غیرفعال"
                    disabled={!canEditGoalRecord(record)}
                    onChange={(checked) => void toggleActive(record, checked)}
                  />
                  <Button
                    size="small"
                    disabled={!canEditGoalRecord(record)}
                    onClick={() => {
                      setEditingRecord(record);
                      setEditorOpen(true);
                    }}
                  >
                    ویرایش
                  </Button>
                  <Popconfirm
                    title="حذف هدف"
                    description="این هدف حذف شود؟"
                    okText="حذف"
                    cancelText="انصراف"
                    disabled={!access.canDeleteGoals}
                    getPopupContainer={popupContainer}
                    zIndex={1402}
                    onConfirm={() => void handleDelete(record.id)}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={!access.canDeleteGoals} />
                  </Popconfirm>
                </div>
              </div>
            ),
            children: renderSummary(record),
          }))}
        />
      )}

      {editorOpen ? (
        <GoalEditorModal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSaved={() => void fetchRecords()}
          initialModuleId={defaultModuleId}
          record={editingRecord}
          canEdit={access.canEditGoals}
          permissions={permissions}
        />
      ) : null}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1220}
      zIndex={1400}
      destroyOnHidden={false}
      title={
        <span className="flex items-center gap-2">
          <SettingOutlined />
          مدیریت هدف‌ها
        </span>
      }
    >
      {content}
    </Modal>
  );
};

export default GoalsManager;
