import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Modal } from 'antd';
import { CaretRightOutlined, CheckOutlined, ClockCircleOutlined, EyeOutlined, ReadOutlined } from '@ant-design/icons';
import OverlayEventBoundary from '../OverlayEventBoundary';
import PersianDatePicker from '../PersianDatePicker';
import { isTaskDoneStatus } from '../../utils/taskCompletion';
import { updateTaskDueDateWithAutomation, updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';
import { getTaskStatusSwatchColor } from '../../utils/processTaskStatusOptions';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveOverlayPopupContainer, resolveParentOverlayZIndex, resolveStableOverlayRoot } from '../../utils/popupContainer';
import { getInstructionIdsFromTask, instructionStatusOptions } from '../../utils/instructionSupport';
import { supabase } from '../../supabaseClient';
import TaskInstructionsModal from './TaskInstructionsModal';

type TaskActionButtonsProps = {
  task: any;
  currentUser?: { id?: string | null; fullName?: string | null } | null;
  onTaskUpdated?: (task: any) => void | Promise<void>;
  size?: 'small' | 'middle' | 'large';
  buttonClassName?: string;
  modalZIndex?: number;
  stopPropagation?: boolean;
  showReview?: boolean;
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
}) => {
  const { message } = App.useApp();
  const overlayAnchorRef = useRef<HTMLDivElement | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [draftDueDate, setDraftDueDate] = useState<string | null>(task?.due_date || null);
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingComplete, setSavingComplete] = useState(false);
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
    return {
      width: actionSizePx,
      minWidth: actionSizePx,
      height: actionSizePx,
      padding: 0,
      borderRadius: 8,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
      lineHeight: 1,
      color: isActive ? activeColor : (isDisabled ? '#cbd5e1' : '#4b5563'),
      backgroundColor: isActive ? `${activeColor}1a` : 'transparent',
      border: 'none',
      boxShadow: isActive
        ? `0 4px 12px ${activeColor}33`
        : (isDisabled ? 'none' : '0 3px 10px rgba(15, 23, 42, 0.10)'),
      opacity: isDisabled ? 0.42 : 1,
      cursor: isActive ? 'default' : (isDisabled ? 'not-allowed' : 'pointer'),
    };
  };

  const handleComplete = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (!task?.id || isDone) return;
    setSavingComplete(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'done' };
      await emitTaskUpdate(optimisticTask);
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
    if (!task?.id || isInProgress || isDone) return;
    setSavingStart(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'in_progress' };
      await emitTaskUpdate(optimisticTask);
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
    if (!task?.id || isInReview || isDone) return;
    setSavingReview(true);
    try {
      const optimisticTask = { ...(task || {}), status: 'review' };
      await emitTaskUpdate(optimisticTask);
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

  const handleSaveReschedule = async () => {
    if (!task?.id) return;
    setSavingReschedule(true);
    try {
      const updatedTask = await updateTaskDueDateWithAutomation({
        taskId: String(task.id),
        nextDueDate: draftDueDate || null,
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
  };

  return (
    <>
      <div ref={overlayAnchorRef} className="flex items-center justify-center gap-1.5">
        {taskInstructionIds.length > 0 ? (
          <Badge count={taskInstructionIds.length} size="small" style={{ fontSize: 10 }}>
            <Button
              type="text"
              size={size}
              icon={<ReadOutlined />}
              className={`task-action-button ${buttonClassName}`}
              style={getActionButtonStyle(undefined)}
              title="مشاهده دستورالعمل‌ها"
              aria-label="مشاهده دستورالعمل‌ها"
              loading={loadingInstructions}
              onClick={handleOpenInstructionsModal}
            />
          </Badge>
        ) : null}
        <Button
          type="text"
          size={size}
          icon={<ClockCircleOutlined />}
          className={`task-action-button ${buttonClassName}`}
          style={getActionButtonStyle(undefined, { reschedule: true, disabled: isDone })}
          title="برنامه‌ریزی مجدد فعالیت"
          aria-label="برنامه‌ریزی مجدد فعالیت"
          aria-disabled={isDone}
          onClick={(event) => {
            stopEvent(event);
            if (isDone) return;
            setRescheduleOpen(true);
          }}
        />
        <Button
          type="text"
          size={size}
          icon={<CaretRightOutlined />}
          className={`task-action-button ${buttonClassName}`}
          style={getActionButtonStyle('in_progress', { active: isInProgress, disabled: isDone })}
          title="در حال انجام"
          aria-label="در حال انجام"
          loading={savingStart}
          aria-disabled={isInProgress || isDone}
          onClick={handleStart}
        />
        {showReview ? (
          <Button
            type="text"
            size={size}
            icon={<EyeOutlined />}
            className={`task-action-button ${buttonClassName}`}
            style={getActionButtonStyle('review', { active: isInReview, disabled: isDone })}
            title="بازبینی"
            aria-label="بازبینی"
            loading={savingReview}
            aria-disabled={isInReview || isDone}
            onClick={handleReview}
          />
        ) : null}
        <Button
          type="text"
          size={size}
          icon={<CheckOutlined />}
          className={`task-action-button ${buttonClassName}`}
          style={getActionButtonStyle('done', { active: isDone })}
          title="تکمیل فعالیت"
          aria-label="تکمیل فعالیت"
          loading={savingComplete}
          aria-disabled={isDone}
          onClick={handleComplete}
        />
      </div>

      <TaskInstructionsModal
        open={instructionsModalOpen}
        loading={loadingInstructions}
        instructions={loadedInstructions}
        activeInstructionId={activeInstructionId}
        onSelectInstruction={(id) => setActiveInstructionId(id)}
        onClose={() => setInstructionsModalOpen(false)}
      />

      <Modal
        open={rescheduleOpen}
        title="برنامه‌ریزی مجدد فعالیت"
        onCancel={(event) => {
          stopEvent(event as any);
          setRescheduleOpen(false);
        }}
        onOk={handleSaveReschedule}
        okText="ثبت موعد جدید"
        cancelText="انصراف"
        confirmLoading={savingReschedule}
        destroyOnHidden
        zIndex={effectiveModalZIndex}
        getContainer={getModalContainer}
        modalRender={(node) => (
          <OverlayEventBoundary>
            {node}
          </OverlayEventBoundary>
        )}
      >
        <div className="space-y-3 pt-1">
          <div className="text-sm text-gray-700">موعد انجام جدید تعیین کنید:</div>
          <PersianDatePicker
            value={draftDueDate}
            onChange={setDraftDueDate}
            type="DATETIME"
            zIndex={effectiveModalZIndex + 20}
            modalContainer={getModalContainer}
            overlayZIndexBase={effectiveModalZIndex + 20}
          />
        </div>
      </Modal>
    </>
  );
};

export default TaskActionButtons;

