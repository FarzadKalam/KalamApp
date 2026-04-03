import React, { useMemo, useState } from 'react';
import { Progress, theme } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  LoadingOutlined,
  MinusOutlined,
  ReloadOutlined,
  StopFilled,
  UpOutlined,
} from '@ant-design/icons';
import { cancelUploadTask, retryUploadTask, useUploadTasks } from '../utils/uploadProgressStore';

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  const digits = size >= 100 || exponent === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[exponent]}`;
};

const statusMeta = {
  uploading: {
    icon: <LoadingOutlined spin />,
    label: 'در حال آپلود',
  },
  success: {
    icon: <CheckCircleFilled />,
    label: 'آپلود شد',
  },
  error: {
    icon: <CloseCircleFilled />,
    label: 'خطا',
  },
  canceled: {
    icon: <StopFilled />,
    label: 'لغو شد',
  },
} as const;

const UploadProgressOverlay: React.FC = () => {
  const tasks = useUploadTasks();
  const { token } = theme.useToken();
  const [minimized, setMinimized] = useState(false);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === 'uploading').length,
    [tasks],
  );

  if (tasks.length === 0) return null;

  if (minimized) {
    return (
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[1800] md:left-auto md:right-4 md:w-[320px]">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="pointer-events-auto flex w-full items-center justify-between rounded-full border px-4 py-3 text-right shadow-2xl backdrop-blur"
          style={{
            background: token.colorBgElevated,
            borderColor: token.colorBorderSecondary,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: token.colorTextHeading }}>
              آپلود فایل
            </div>
            <div className="text-xs" style={{ color: token.colorTextSecondary }}>
              {activeCount > 0 ? `${activeCount} مورد در حال آپلود` : `${tasks.length} مورد آماده بررسی`}
            </div>
          </div>
          <UpOutlined style={{ color: token.colorTextTertiary, fontSize: 12 }} />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[1800] md:left-auto md:right-4 md:w-[420px]">
      <div
        className="pointer-events-auto overflow-hidden rounded-[24px] border shadow-2xl backdrop-blur"
        style={{
          background: token.colorBgElevated,
          borderColor: token.colorBorderSecondary,
          boxShadow: token.boxShadowSecondary,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: token.colorTextHeading }}>
              آپلود فایل
            </div>
            <div className="text-xs" style={{ color: token.colorTextTertiary }}>
              {activeCount > 0 ? `${activeCount} مورد در حال آپلود` : `${tasks.length} مورد در صف نمایش`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            style={{ color: token.colorTextTertiary }}
            aria-label="کوچک کردن پنجره"
          >
            <MinusOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => {
              const meta = statusMeta[task.status];
              const percentLabel = task.total > 0 ? `${task.progress}%` : '';
              const canCancel = task.status === 'uploading';
              const canRetry = task.status === 'error' || task.status === 'canceled';

              return (
                <div
                  key={task.id}
                  className="rounded-[18px] border px-3 py-3"
                  style={{
                    borderColor: token.colorBorderSecondary,
                    background: token.colorFillTertiary,
                  }}
                >
                  <div className="mb-2 flex items-start gap-2">
                    <div
                      className="mt-0.5 text-sm"
                      style={{
                        color:
                          task.status === 'error'
                            ? token.colorError
                            : task.status === 'success'
                              ? token.colorSuccess
                              : token.colorPrimary,
                      }}
                    >
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" style={{ color: token.colorTextHeading }}>
                        {task.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: token.colorTextSecondary }}>
                        <span>{meta.label}</span>
                        {task.detail ? <span className="truncate">{task.detail}</span> : null}
                      </div>
                    </div>
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => retryUploadTask(task.id)}
                        className="mr-1 flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                        style={{ color: token.colorPrimary }}
                        aria-label="تلاش دوباره"
                      >
                        <ReloadOutlined style={{ fontSize: 12 }} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => cancelUploadTask(task.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                      style={{ color: token.colorTextTertiary }}
                      aria-label={canCancel ? 'لغو آپلود' : 'بستن'}
                    >
                      <CloseOutlined style={{ fontSize: 11 }} />
                    </button>
                  </div>

                  <Progress
                    percent={task.progress}
                    showInfo={false}
                    strokeColor={
                      task.status === 'error'
                        ? token.colorError
                        : task.status === 'success'
                          ? token.colorSuccess
                          : token.colorPrimary
                    }
                    trailColor={token.colorFillSecondary}
                    size="small"
                    status={task.status === 'error' ? 'exception' : task.status === 'success' ? 'success' : 'active'}
                  />

                  <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: token.colorTextSecondary }}>
                    <span dir="ltr">
                      {formatBytes(task.loaded)} / {formatBytes(task.total)}
                    </span>
                    <span>{percentLabel || meta.label}</span>
                  </div>

                  {task.errorMessage && task.status !== 'uploading' ? (
                    <div
                      className="mt-2 line-clamp-2 text-[11px]"
                      style={{ color: task.status === 'error' ? token.colorError : token.colorTextTertiary }}
                    >
                      {task.errorMessage}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgressOverlay;
