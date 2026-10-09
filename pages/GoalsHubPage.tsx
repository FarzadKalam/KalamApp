import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Select, Spin, Tag, Typography } from 'antd';
import { AimOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  canUserViewGoalResults,
  ensureDefaultSalesInvoiceGoal,
  getGoalModuleOptions,
  normalizeGoalRecord,
} from '../utils/goals';
import {
  fetchCurrentUserRecordAccessContext,
  resolveGoalsAccessPermissions,
  resolveModuleGoalAccessPermissions,
  type PermissionMap,
} from '../utils/permissions';
import {
  GOAL_METRIC_TYPE_OPTIONS,
  GOAL_PERIOD_UNIT_OPTIONS,
  type GoalRecord,
} from '../utils/goalTypes';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import GoalEditorModal from '../components/goals/GoalEditorModal';
import GoalResultsModal from '../components/goals/GoalResultsModal';

const { Title, Text } = Typography;

const GOAL_LIST_SELECT_FIELDS = [
  'id', 'org_id', 'module_id', 'name', 'description', 'goal_scope', 'period_unit', 'subperiod_unit',
  'metric_type', 'metric_field_key', 'date_field_key', 'target_value', 'levels_enabled', 'bronze_value',
  'silver_value', 'gold_value', 'assignee_user_ids', 'assignee_role_ids', 'conditions_all', 'conditions_any',
  'config', 'is_active', 'created_at', 'updated_at', 'created_by', 'updated_by',
].join(', ');

const GoalsHubPage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [selectedGoal, setSelectedGoal] = useState<GoalRecord | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: { moduleTitle: 'ابزارها', moduleId: 'goals', recordName: 'اهداف' },
    }));
    return () => window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
  }, []);

  const access = useMemo(() => resolveGoalsAccessPermissions(permissions), [permissions]);
  const moduleOptions = useMemo(() => getGoalModuleOptions(permissions), [permissions]);
  const canCreateGoal = useMemo(
    () => access.canEditGoals && moduleOptions.some((option) => (
      resolveModuleGoalAccessPermissions(permissions, option.value).canCreateGoal
    )),
    [access.canEditGoals, moduleOptions, permissions],
  );

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const context = await fetchCurrentUserRecordAccessContext(supabase);
      setPermissions(context.permissions);
      const nextAccess = resolveGoalsAccessPermissions(context.permissions);
      if (!nextAccess.canViewHub) {
        setGoals([]);
        return;
      }

      await ensureDefaultSalesInvoiceGoal({ userId: context.userId });
      const { data, error } = await supabase
        .from('goals')
        .select(GOAL_LIST_SELECT_FIELDS)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      setGoals((data || [])
        .map((item) => normalizeGoalRecord(item))
        .filter((goal) => resolveModuleGoalAccessPermissions(context.permissions, goal.module_id).canViewGoal)
        .filter((goal) => canUserViewGoalResults(goal, context.userId, context.roleId)));
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت هدف‌های فعال ناموفق بود.'));
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const visibleGoals = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('fa-IR');
    return goals.filter((goal) => {
      if (moduleFilter !== 'all' && goal.module_id !== moduleFilter) return false;
      if (!query) return true;
      return [goal.name, goal.description, MODULES[goal.module_id]?.titles?.fa]
        .some((value) => String(value || '').toLocaleLowerCase('fa-IR').includes(query));
    });
  }, [goals, moduleFilter, searchQuery]);

  if (loading) {
    return <div className="flex h-[70vh] items-center justify-center"><Spin size="large" /></div>;
  }

  if (!access.canViewHub) {
    return <div className="flex h-[70vh] items-center justify-center"><Empty description="دسترسی به اهداف ندارید." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1680px] animate-fadeIn p-4 md:p-8">
      <div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">اهداف</Title>
            <Text className="text-gray-500">هدف‌های فعال سازمان را ببینید و با انتخاب هر هدف، روند تحقق آن را بررسی کنید.</Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<ReloadOutlined />} onClick={() => void loadGoals()}>بروزرسانی</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canCreateGoal}
              className="bg-leather-600 hover:!bg-leather-500"
              onClick={() => setCreateOpen(true)}
            >
              افزودن هدف
            </Button>
          </div>
        </div>

        {goals.length === 0 ? (
          <Empty description="هدف فعالی برای نمایش وجود ندارد." image={Empty.PRESENTED_IMAGE_SIMPLE}>
            {canCreateGoal ? <Button type="primary" onClick={() => setCreateOpen(true)}>افزودن هدف</Button> : null}
          </Empty>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 md:flex-row">
              <Input
                allowClear
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="جستجو در نام، توضیح یا ماژول هدف"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="max-w-xl"
              />
              <Select
                value={moduleFilter}
                onChange={(value) => setModuleFilter(String(value))}
                options={[{ label: 'همه ماژول‌ها', value: 'all' }, ...moduleOptions]}
                className="min-w-[240px]"
                showSearch
                optionFilterProp="label"
              />
            </div>
            {visibleGoals.length === 0 ? <Empty description="هدف فعالی با این جستجو پیدا نشد." image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleGoals.map((goal) => {
                  const moduleTitle = MODULES[goal.module_id]?.titles?.fa || goal.module_id;
                  const metricLabel = GOAL_METRIC_TYPE_OPTIONS.find((item) => item.value === goal.metric_type)?.label || goal.metric_type;
                  const periodLabel = GOAL_PERIOD_UNIT_OPTIONS.find((item) => item.value === goal.period_unit)?.label || goal.period_unit;
                  const targetValue = goal.levels_enabled ? (goal.gold_value || goal.silver_value || goal.bronze_value || 0) : (goal.target_value || 0);
                  return (
                    <Card
                      key={goal.id}
                      hoverable
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedGoal(goal)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedGoal(goal);
                        }
                      }}
                      className="h-full rounded-[1.5rem] border-gray-200 transition hover:border-leather-300 dark:border-gray-700"
                    >
                      <div className="flex h-full flex-col gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-leather-100 text-leather-700"><AimOutlined /></div>
                          <div className="min-w-0">
                            <div className="truncate font-black text-gray-800 dark:text-white">{goal.name}</div>
                            <div className="mt-1 line-clamp-2 text-xs text-gray-500">{goal.description || 'بدون توضیح'}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Tag className="!m-0">{moduleTitle}</Tag>
                          <Tag className="!m-0">{goal.goal_scope === 'team' ? 'تیمی' : 'فردی'}</Tag>
                          <Tag className="!m-0">{periodLabel}</Tag>
                        </div>
                        <div className="mt-auto rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-white/5">
                          <div className="text-xs text-gray-500">{metricLabel}</div>
                          <div className="mt-1 font-bold text-gray-800 dark:text-gray-100">مقدار هدف: {targetValue}</div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <GoalResultsModal
        open={!!selectedGoal}
        goal={selectedGoal}
        onClose={() => setSelectedGoal(null)}
        onEdit={(goal) => {
          setSelectedGoal(null);
          setEditingGoal(goal);
        }}
        canEdit={selectedGoal ? resolveModuleGoalAccessPermissions(permissions, selectedGoal.module_id).canEditGoal : false}
      />
      <GoalEditorModal
        open={createOpen || !!editingGoal}
        onClose={() => {
          setCreateOpen(false);
          setEditingGoal(null);
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditingGoal(null);
          void loadGoals();
        }}
        record={editingGoal}
        canEdit={access.canEditGoals}
        permissions={permissions}
      />
    </div>
  );
};

export default GoalsHubPage;
