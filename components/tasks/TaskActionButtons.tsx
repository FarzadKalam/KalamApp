import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Tooltip } from 'antd';
import { CaretRightOutlined, CheckOutlined, ClockCircleOutlined, EyeOutlined, ReadOutlined } from '@ant-design/icons';
import { isTaskDoneStatus } from '../../utils/taskCompletion';
import { updateTaskDueDateWithAutomation, updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';
import { getTaskStatusIconKey, getTaskStatusLabel, getTaskStatusSwatchColor } from '../../utils/processTaskStatusOptions';
import type { SelectOption } from '../../types';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveOverlayPopupContainer, resolveParentOverlayZIndex, resolveStableOverlayRoot } from '../../utils/popupContainer';
import { getInstructionIdsFromTask, instructionStatusOptions } from '../../utils/instructionSupport';
import { supabase } from '../../supabaseClient';
import TaskInstructionsModal from './TaskInstructionsModal';
import SnoozeScheduleModal from '../notifications/SnoozeScheduleModal';
import TaskStatusIcon from './TaskStatusIcon';
import { buildStatusIconActionClassName, getStatusIconActionStyle } from '../statusIconActionAppearance';

type TaskActionButtonsProps = {
  task: any;
  currentUser?: { id?: string | null; fullName?: string | null } | null;
  onTaskUpdated?: (task: any) => void | Promise<void>;
  size?: 'small' | 'middle' | 'large';
  buttonClassName?: string;
  modalZIndex?: number;
  stopPropagation?: boolean;
  showReview?: boolean;
  disabled?: boolean;
  localOnly?: boolean;
  statusOptions?: SelectOption[];
  hideReschedule?: boolean;
  onlyReschedule?: boolean;
};

const TaskActionButtons: React.FC<TaskActionButtonsProps> = ({
  task,
  currentUser = null,
  onTaskUpdated,
  size = 'small',
  buttonClassName = '',
  modalZIndex = 12000,
  stopPropagation = true,
  showReview = false,
  disabled = false,
  localOnly = false,
  statusOptions,
  hideReschedule = false,
  onlyReschedule = false,
}) => {
  const { message } = App.useApp();
  const overlayAnchorRef = useRef<HTMLDivElement | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [draftDueDate, setDraftDueDate] = useState<string | null>(task?.due_date || null);
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingComplete, setSavingComplete] = useState(false);
  const [savingStatusValue, setSavingStatusValue] = useState<string | null>(null);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [loadedInstructions, setLoadedInstructions] = useState<any[]>([]);
  const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
  const normalizedStatus = String(task?.status || '').toLowerCase();
  const isDone = isTaskDoneStatus(task?.status);
  const taskInstructionIds = useMemo(() => getInstructionIdsFromTask(task), [task]);
  const isInProgress = normalizedStatus === 'in_progress';
  const isInReview = normalizedStatus === 'review';
  const actionSizePx = size === 'large' ? 40 : size === 'middle' ? 36 : 30;
  const actionButtonClassName = buildStatusIconActionClassName(buttonClassName);

  useEffect(() => {
    if (!rescheduleOpen) {
      setDraftDueDate(task?.due_date || null);
    }
  }, [rescheduleOpen, task?.due_date]);

  const effectiveModalZIndex = useMemo(
    () => Math.max(modalZIndex, resolveParentOverlayZIndex(overlayAnchorRef.current, modalZIndex) + 40),
    [modalZIndex, rescheduleOpen]
  );

  const getModalContainer = useMemo(
    () => () => resolveStableOverlayRoot(resolveOverlayPopupContainer(overlayAnchorRef.current)),
    []
  );

  const stopEvent = (event?: React.SyntheticEvent | Event) => {
    if (!stopPropagation || !event) return;
    event.stopPropagation();
  };

  const emitTaskUpdate = async (nextTask: any) => {
    await onTaskUpdated?.(nextTask);
  };

  const getStatusColor = (status: string) => getTaskStatusSwatchColor(status, task);

  const effectiveStatusOptions = useMemo(
    () => (Array.isArray(statusOptions) ? statusOptions : [])
      .filter((option) => option && option.disabled !== true && String(option.value || '').trim()),
    [statusOptions],
  );

  const handleOpenInstructionsModal = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (taskInstructionIds.length === 0) return;
    setInstructionsModalOpen(true);
    if (loadedInstructions.length > 0) return;
    setLoadingInstructions(true);
    try {
      const [{ data, error }, { data: filesData }] = await Promise.all([
        supabase
          .from('instructions')
          .select('id, name, system_code, status, department, goal, body, image_url')
          .in('id', taskInstructionIds),
        supabase
          .from('record_files')
          .select('id, record_id, file_url, file_name, mime_type, file_type')
          .eq('module_id', 'instructions')
          .in('record_id', taskInstructionIds),
      ]);
      if (error) throw error;
      const filesByRecordId: Record<string, any[]> = {};
      for (const f of filesData || []) {
        const rid = String(f.record_id || '');
        if (!filesByRecordId[rid]) filesByRecordId[rid] = [];
        filesByRecordId[rid].push({ id: String(f.id), url: String(f.file_url || ''), name: String(f.file_name || f.id), mimeType: f.mime_type || null, fileType: f.file_type || null });
      }
      const withStatus = (data || []).map((item) => {
        const statusOption = instructionStatusOptions.find((o) => o.value === item?.status);
        return {
          ...item,
          status_label: statusOption?.label || item?.status || null,
          status_color: statusOption?.color || 'default',
          attachments: filesByRecordId[String(item?.id || '')] || [],
        };
      });
      const ordered = taskInstructionIds
        .map((id) => withStatus.find((item) => String(item?.id || '') === id))
        .filter(Boolean);
      setLoadedInstructions(ordered);
      if (ordered.length > 0 && !activeInstructionId) {
        setActiveInstructionId(String(ordered[0]?.id || ''));
      }
    } catch {
      message.error('بارگذاری دستورالعمل‌ها ناموفق بود.');
    } finally {
      setLoadingInstructions(false);
    }
  };

  const getActionButtonStyle = (
    targetStatus?: string,
    options: { active?: boolean; disabled?: boolean; reschedule?: boolean } = {}
  ): React.CSSProperties => {
    const activeColor = targetStatus ? getStatusColor(targetStatus) : '#6b7280';
    const isActive = options.active === true;
    const isDisabled = options.disabled === true;
    return getStatusIconActionStyle({ color: activeColor, active: isActive, disabled: isDisabled, size: actionSizePx });
  };

  const handleComplete = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (disabled || !task?.id || isDone) return;
    setSavingComplete(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'done' };
      await emitTaskUpdate(optimisticTask);
      if (localOnly) {
        message.success('فعالیت تکمیل شد');
        return;
      }
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId: String(task.id),
        nextStatus: 'done',
        previousTask: task,
        currentUser: currentUser || null,
      });
      await emitTaskUpdate(updatedTask);
      message.success('فعالیت تکمیل شد');
    } catch (error: any) {
      await emitTaskUpdate(task);
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعالیت ناموفق بود'));
    } finally {
      setSavingComplete(false);
    }
  };

  const handleStart = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (disabled || !task?.id || isInProgress || isDone) return;
    setSavingStart(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'in_progress' };
      await emitTaskUpdate(optimisticTask);
      if (localOnly) {
        message.success('فعالیت در حال انجام شد');
        return;
      }
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId: String(task.id),
        nextStatus: 'in_progress',
        previousTask: task,
        currentUser: currentUser || null,
      });
      await emitTaskUpdate(updatedTask);
      message.success('فعالیت در حال انجام شد');
    } catch (error: any) {
      await emitTaskUpdate(task);
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعالیت ناموفق بود'));
    } finally {
      setSavingStart(false);
    }
  };

  const handleReview = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (disabled || !task?.id || isInReview || isDone) return;
    setSavingReview(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'review' };
      await emitTaskUpdate(optimisticTask);
      if (localOnly) {
        message.success('فعالیت در وضعیت بازبینی قرار گرفت');
        return;
      }
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId: String(task.id),
        nextStatus: 'review',
        previousTask: task,
        currentUser: currentUser || null,
      });
      await emitTaskUpdate(updatedTask);
      message.success('فعالیت در وضعیت بازبینی قرار گرفت');
    } catch (error: any) {
      await emitTaskUpdate(task);
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعالیت ناموفق بود'));
    } finally {
      setSavingReview(false);
    }
  };

  const handleStatusChange = async (nextStatus: string, event?: React.SyntheticEvent) => {
    stopEvent(event);
    const normalizedNextStatus = String(nextStatus || '').trim();
    if (disabled || !task?.id || !normalizedNextStatus || normalizedNextStatus === String(task?.status || '')) return;
    setSavingStatusValue(normalizedNextStatus);
    try {
      const optimisticTask = { ...(task || {}), status: normalizedNextStatus };
      await emitTaskUpdate(optimisticTask);
      if (localOnly) {
        message.success('وضعیت فعالیت تغییر کرد');
        return;
      }
      const updatedTask = await updateTaskStatusWithAutomation({
        taskId: String(task.id),
        nextStatus: normalizedNextStatus,
        previousTask: task,
        currentUser: currentUser || null,
      });
      await emitTaskUpdate(updatedTask);
      message.success('وضعیت فعالیت تغییر کرد');
    } catch (error: any) {
      await emitTaskUpdate(task);
      message.error(toFaErrorMessage(error, 'تغییر وضعیت فعالیت ناموفق بود'));
    } finally {
      setSavingStatusValue(null);
    }
  };

  return (
    <>
      <div ref={overlayAnchorRef} className="relative z-20 flex min-w-0 max-w-full items-center justify-start gap-1.5 overflow-x-auto overflow-y-visible px-0.5 py-1">
        {!onlyReschedule && taskInstructionIds.length > 0 ? (
          <Badge count={taskInstructionIds.length} size="small" style={{ fontSize: 10 }}>
            <Button
              type="text"
              size={size}
              icon={<ReadOutlined />}
              className={actionButtonClassName}
              style={getActionButtonStyle(undefined)}
              title="مشاهده دستورالعمل‌ها"
              aria-label="مشاهده دستورالعمل‌ها"
              loading={loadingInstructions}
              onClick={handleOpenInstructionsModal}
            />
          </Badge>
        ) : null}
        {!hideReschedule ? (
          <Button
          type="text"
          size={size}
          icon={<ClockCircleOutlined />}
          className={actionButtonClassName}
          style={getActionButtonStyle(undefined, { reschedule: true, disabled: disabled || isDone })}
          title="برنامه‌ریزی مجدد فعالیت"
          aria-label="برنامه‌ریزی مجدد فعالیت"
          aria-disabled={disabled || isDone}
          onClick={(event) => {
            stopEvent(event);
            if (disabled || isDone) return;
            setRescheduleOpen(true);
          }}
          />
        ) : null}
        {!onlyReschedule && effectiveStatusOptions.length > 0 ? (
          <div className="flex min-w-max items-center gap-1">
            {effectiveStatusOptions.map((option) => {
              const value = String(option.value || '').trim();
              const active = value === String(task?.status || '');
              const label = String(option.label || getTaskStatusLabel(value, task) || value);
              return (
                <Tooltip key={value} title={label}>
                  <Button
                    type="text"
                    size={size}
                    icon={<TaskStatusIcon iconKey={option.icon || getTaskStatusIconKey(value, task)} />}
                    className={actionButtonClassName}
                    style={getActionButtonStyle(value, { active, disabled: disabled || active })}
                    title={label}
                    aria-label={label}
                    loading={savingStatusValue === value}
                    aria-disabled={disabled || active}
                    onClick={(event) => handleStatusChange(value, event)}
                  />
                </Tooltip>
              );
            })}
          </div>
        ) : !onlyReschedule ? (
          <>
            <Button
              type="text"
              size={size}
              icon={<CaretRightOutlined />}
              className={actionButtonClassName}
              style={getActionButtonStyle('in_progress', { active: isInProgress, disabled: disabled || isDone })}
              title="در حال انجام"
              aria-label="در حال انجام"
              loading={savingStart}
              aria-disabled={disabled || isInProgress || isDone}
              onClick={handleStart}
            />
            {showReview ? (
          <Button
            type="text"
            size={size}
            icon={<EyeOutlined />}
            className={actionButtonClassName}
            style={getActionButtonStyle('review', { active: isInReview, disabled: disabled || isDone })}
            title="بازبینی"
            aria-label="بازبینی"
            loading={savingReview}
            aria-disabled={disabled || isInReview || isDone}
            onClick={handleReview}
          />
            ) : null}
            <Button
              type="text"
              size={size}
              icon={<CheckOutlined />}
              className={actionButtonClassName}
              style={getActionButtonStyle('done', { active: isDone, disabled })}
              title="تکمیل فعالیت"
              aria-label="تکمیل فعالیت"
              loading={savingComplete}
              aria-disabled={disabled || isDone}
              onClick={handleComplete}
            />
          </>
        ) : null}
      </div>

      <TaskInstructionsModal
        open={instructionsModalOpen}
        loading={loadingInstructions}
        instructions={loadedInstructions}
        activeInstructionId={activeInstructionId}
        onSelectInstruction={(id) => setActiveInstructionId(id)}
        onClose={() => setInstructionsModalOpen(false)}
      />

      <SnoozeScheduleModal
        open={rescheduleOpen}
        title="برنامه‌ریزی مجدد فعالیت"
        initialValue={draftDueDate}
        onCancel={() => {
          setRescheduleOpen(false);
        }}
        onConfirm={async (value) => {
          setDraftDueDate(value);
          if (!task?.id) return;
          if (disabled) return;
          if (localOnly) {
            await emitTaskUpdate({ ...(task || {}), due_date: value });
            setRescheduleOpen(false);
            message.success('موعد انجام بروزرسانی شد');
            return;
          }
          setSavingReschedule(true);
          try {
            const updatedTask = await updateTaskDueDateWithAutomation({
              taskId: String(task.id),
              nextDueDate: value,
              previousTask: task,
              currentUser: currentUser || null,
            });
            await emitTaskUpdate(updatedTask);
            setRescheduleOpen(false);
            message.success('موعد انجام بروزرسانی شد');
          } catch (error: any) {
            message.error(toFaErrorMessage(error, 'بروزرسانی موعد انجام ناموفق بود'));
          } finally {
            setSavingReschedule(false);
          }
        }}
        confirmText="ثبت موعد جدید"
        confirmLoading={savingReschedule}
        zIndex={effectiveModalZIndex}
        getContainer={getModalContainer}
      />
    </>
  );
};

export default TaskActionButtons;
