import React, { useEffect, useState } from 'react';
import { App, Button, Modal, Tooltip } from 'antd';
import { CaretRightOutlined, CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PersianDatePicker from '../PersianDatePicker';
import { isTaskDoneStatus } from '../../utils/taskCompletion';
import { updateTaskDueDateWithAutomation, updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';

type TaskActionButtonsProps = {
  task: any;
  currentUser?: { id?: string | null; fullName?: string | null } | null;
  onTaskUpdated?: (task: any) => void | Promise<void>;
  size?: 'small' | 'middle' | 'large';
  buttonClassName?: string;
  modalZIndex?: number;
  stopPropagation?: boolean;
};

const TaskActionButtons: React.FC<TaskActionButtonsProps> = ({
  task,
  currentUser = null,
  onTaskUpdated,
  size = 'small',
  buttonClassName = '',
  modalZIndex = 12000,
  stopPropagation = true,
}) => {
  const { message } = App.useApp();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [draftDueDate, setDraftDueDate] = useState<string | null>(task?.due_date || null);
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingComplete, setSavingComplete] = useState(false);

  useEffect(() => {
    if (!rescheduleOpen) {
      setDraftDueDate(task?.due_date || null);
    }
  }, [rescheduleOpen, task?.due_date]);

  const stopEvent = (event?: React.SyntheticEvent | Event) => {
    if (!stopPropagation || !event) return;
    event.stopPropagation();
  };

  const emitTaskUpdate = async (nextTask: any) => {
    await onTaskUpdated?.(nextTask);
  };

  const handleComplete = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (!task?.id || isTaskDoneStatus(task?.status)) return;
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
      message.error(error?.message || 'تغییر وضعیت فعالیت ناموفق بود');
    } finally {
      setSavingComplete(false);
    }
  };

  const handleStart = async (event?: React.SyntheticEvent) => {
    stopEvent(event);
    if (!task?.id || String(task?.status || '').toLowerCase() === 'in_progress' || isTaskDoneStatus(task?.status)) return;
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
      message.error(error?.message || 'تغییر وضعیت فعالیت ناموفق بود');
    } finally {
      setSavingStart(false);
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
      message.error(error?.message || 'بروزرسانی موعد انجام ناموفق بود');
    } finally {
      setSavingReschedule(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Tooltip title="برنامه‌ریزی مجدد فعالیت">
          <Button
            type="text"
            size={size}
            icon={<ClockCircleOutlined />}
            className={buttonClassName}
            onClick={(event) => {
              stopEvent(event);
              setRescheduleOpen(true);
            }}
          />
        </Tooltip>
        <Tooltip title="در حال انجام">
          <Button
            type="text"
            size={size}
            icon={<CaretRightOutlined />}
            className={buttonClassName}
            loading={savingStart}
            disabled={String(task?.status || '').toLowerCase() === 'in_progress' || isTaskDoneStatus(task?.status)}
            onClick={handleStart}
          />
        </Tooltip>
        <Tooltip title="تکمیل فعالیت">
          <Button
            type="text"
            size={size}
            icon={<CheckOutlined />}
            className={buttonClassName}
            loading={savingComplete}
            disabled={isTaskDoneStatus(task?.status)}
            onClick={handleComplete}
          />
        </Tooltip>
      </div>

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
        zIndex={modalZIndex}
      >
        <div className="space-y-3 pt-1">
          <div className="text-sm text-gray-700">موعد انجام جدید تعیین کنید:</div>
          <PersianDatePicker
            value={draftDueDate}
            onChange={setDraftDueDate}
            type="DATETIME"
            zIndex={modalZIndex + 20}
          />
        </div>
      </Modal>
    </>
  );
};

export default TaskActionButtons;

