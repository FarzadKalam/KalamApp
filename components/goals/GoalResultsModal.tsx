import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Progress, Space, Spin, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { evaluateGoalRewardRules, type GoalRewardEntry, type GoalRewardFormula } from '../../utils/goalRewardRuntime';
import { fetchCurrentUserRecordAccessContext } from '../../utils/permissions';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import {
  canUserViewGoalResults,
  executeGoalProgressForSubjects,
  dedupeGoalsForDisplay,
  normalizeGoalRecord,
  resolveGoalAssignedMembers,
} from '../../utils/goals';
import { type GoalProgressSnapshot, type GoalRecord } from '../../utils/goalTypes';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import AdaptiveSelectField from '../AdaptiveSelectField';

type GoalResultsModalProps = {
  open: boolean;
  goal: GoalRecord | null;
  onClose: () => void;
  onEdit?: (goal: GoalRecord) => void;
  canEdit?: boolean;
};

type GoalResultRow = {
  key: string;
  memberLabel: string;
  snapshot: GoalProgressSnapshot;
  rewardEntries: GoalRewardEntry[];
  rewardSuggestion: number;
};

const GoalResultsModal: React.FC<GoalResultsModalProps> = ({
  open,
  goal,
  onClose,
  onEdit,
  canEdit = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GoalResultRow[]>([]);
  const [visibleGoals, setVisibleGoals] = useState<GoalRecord[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goal?.id || null);

  useEffect(() => {
    setSelectedGoalId(goal?.id || null);
  }, [goal?.id]);

  const selectedGoal = useMemo(() => {
    if (!selectedGoalId) return goal ? normalizeGoalRecord(goal) : null;
    return visibleGoals.find((item) => String(item.id) === String(selectedGoalId)) || (goal ? normalizeGoalRecord(goal) : null);
  }, [goal, selectedGoalId, visibleGoals]);

  const popupContainer = (triggerNode?: HTMLElement | null) => {
    const modalBodyHost = triggerNode?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || resolveOverlayPopupContainer(triggerNode);
  };

  useEffect(() => {
    if (!open || !goal) {
      setRows([]);
      setVisibleGoals([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [roleContext, directory, formulasResult, goalsResult] = await Promise.all([
          fetchCurrentUserRecordAccessContext(supabase),
          fetchAssigneeDirectory(supabase),
          supabase
            .from('calculation_formulas')
            .select('id, name, expression_config, output_type, config')
            .eq('is_active', true)
            .eq('context_type', 'goal'),
          supabase
            .from('goals')
            .select('*')
            .eq('is_active', true)
            .order('updated_at', { ascending: false }),
        ]);
        if (formulasResult.error) throw formulasResult.error;
        if (goalsResult.error) throw goalsResult.error;
        if (cancelled) return;
        const availableGoals = dedupeGoalsForDisplay(
          (goalsResult.data || [])
            .map((item) => normalizeGoalRecord(item))
            .filter((item) => canUserViewGoalResults(item, roleContext.userId, roleContext.roleId))
        );
        if (!cancelled) {
          setVisibleGoals(availableGoals);
        }

        const activeGoal =
          availableGoals.find((item) => String(item.id) === String(selectedGoalId || goal.id || ''))
          || availableGoals.find((item) => String(item.id) === String(goal.id || ''))
          || null;

        if (!activeGoal || !canUserViewGoalResults(activeGoal, roleContext.userId, roleContext.roleId)) {
          setRows([]);
          return;
        }

        const rewardFormulas = (formulasResult.data || []) as GoalRewardFormula[];
        const members = resolveGoalAssignedMembers(activeGoal, directory);
        const snapshots = await executeGoalProgressForSubjects(activeGoal, {
          userId: roleContext.userId,
          roleId: roleContext.roleId,
          orgId: roleContext.orgId,
          allowedRoleIds: roleContext.allowedRoleIds,
          allowedUserIds: roleContext.allowedUserIds,
          permissions: roleContext.permissions,
          subjects: members.map((member) => ({
            userId: member.userId,
            roleId: member.roleId,
            label: member.label,
          })),
        });
        const computed = snapshots.map((snapshot, index) => {
          const member = members[index];
          const rewardEntries = evaluateGoalRewardRules({
            snapshot,
            formulas: rewardFormulas,
          });
          return {
            key: `${member?.userId || index}:${activeGoal.id}`,
            memberLabel: member?.label || snapshot.subjectLabel || '-',
            snapshot,
            rewardEntries,
            rewardSuggestion: rewardEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
          } satisfies GoalResultRow;
        });

        if (!cancelled) {
          setRows(
            computed
              .filter((item): item is GoalResultRow => !!item)
              .sort((a, b) => {
                if (b.snapshot.achievedValue !== a.snapshot.achievedValue) {
                  return b.snapshot.achievedValue - a.snapshot.achievedValue;
                }
                if (b.snapshot.subAchievedValue !== a.snapshot.subAchievedValue) {
                  return b.snapshot.subAchievedValue - a.snapshot.subAchievedValue;
                }
                return a.memberLabel.localeCompare(b.memberLabel, 'fa');
              })
          );
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [goal, open, selectedGoalId]);

  const goalSummary = useMemo(() => {
    if (!selectedGoal) return null;
    const normalized = normalizeGoalRecord(selectedGoal);
    return {
      scopeLabel: normalized.goal_scope === 'team' ? 'هدف تیمی' : 'هدف فردی',
      metricLabel:
        normalized.metric_type === 'count'
          ? 'تعداد'
          : normalized.metric_type === 'avg'
            ? 'میانگین'
            : 'جمع',
    };
  }, [selectedGoal]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnHidden
      title={
        <div className="flex items-center justify-between gap-3 pl-8">
          <div className="min-w-0">
            <div className="truncate text-base font-black">{selectedGoal?.name || goal?.name || 'جزئیات تحقق هدف'}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
              {goalSummary ? <Tag>{goalSummary.scopeLabel}</Tag> : null}
              {goalSummary ? <Tag>{goalSummary.metricLabel}</Tag> : null}
            </div>
            <div className="mt-3 min-w-[260px]">
              <AdaptiveSelectField
                value={selectedGoalId || undefined}
                onChange={(value) => setSelectedGoalId(String(value || ''))}
                options={visibleGoals.map((item) => ({ label: item.name, value: item.id }))}
                placeholder="انتخاب هدف"
                getPopupContainer={popupContainer as any}
                modalContainer={popupContainer}
                preferLocalPopupContainer
                overlayZIndexBase={1500}
                showSearch
                optionFilterProp="label"
              />
            </div>
          </div>
          {canEdit ? (
            <Button icon={<EditOutlined />} onClick={() => selectedGoal && onEdit?.(selectedGoal)}>
              ویرایش هدف
            </Button>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Spin size="large" />
        </div>
      ) : rows.length === 0 ? (
        <Empty description="عضوی برای این هدف پیدا نشد." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const mainPercent = row.snapshot.targetValue > 0
              ? Math.min(100, (row.snapshot.achievedValue / row.snapshot.targetValue) * 100)
              : 0;
            const subTarget = row.snapshot.subTargetValue || row.snapshot.targetValue;
            const subPercent = subTarget > 0
              ? Math.min(100, (row.snapshot.subAchievedValue / subTarget) * 100)
              : 0;
            const levelLabel = row.snapshot.activeLevelKey
              ? row.snapshot.levels.find((item) => item.key === row.snapshot.activeLevelKey)?.label || 'سطح ثبت‌شده'
              : 'در حال پیشروی';
            return (
              <div key={row.key} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-leather-700">{row.memberLabel}</div>
                  <Space size="small" wrap>
                    <Tag color={levelLabel === 'در حال پیشروی' ? 'blue' : 'gold'}>{levelLabel}</Tag>
                    <Tag>{row.snapshot.mainRange.startLabel} تا {row.snapshot.mainRange.endLabel}</Tag>
                  </Space>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-gray-500">پیشرفت اصلی</div>
                    <Progress percent={Number(mainPercent.toFixed(1))} />
                    <div className="persian-number text-xs text-gray-500">
                      {toPersianNumber(row.snapshot.achievedValue)} از {toPersianNumber(row.snapshot.targetValue)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">
                      پیشرفت فرعی - {row.snapshot.subRange.startLabel} تا {row.snapshot.subRange.endLabel}
                    </div>
                    <Progress percent={Number(subPercent.toFixed(1))} strokeColor="#16a34a" />
                    <div className="persian-number text-xs text-gray-500">
                      {toPersianNumber(row.snapshot.subAchievedValue)} از {toPersianNumber(subTarget)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span>
                    {row.rewardEntries.length
                      ? row.rewardEntries.map((entry) => `${entry.title}: ${formatPersianPrice(Number(entry.amount || 0))}`).join(' | ')
                      : 'برای این هدف هنوز فرمول پاداش فعالی تعریف نشده یا شرط آن فعال نشده است'}
                  </span>
                  <span className={`persian-number font-black ${row.rewardSuggestion < 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {formatPersianPrice(row.rewardSuggestion)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

export default GoalResultsModal;
