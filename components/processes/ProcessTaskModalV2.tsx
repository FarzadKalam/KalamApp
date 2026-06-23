import React, { memo, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Switch, Tag, Tooltip } from 'antd';
import {
  CaretRightOutlined,
  CheckOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DownOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  LockOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PlusOutlined,
  ReadOutlined,
  StarFilled,
  StarOutlined,
  TeamOutlined,
  UnlockOutlined,
  UpOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import AdaptiveSelectField from '../AdaptiveSelectField';
import FileExtensionTile from '../files/FileExtensionTile';
import RecordImageBox from '../RecordImageBox';
import ResilientImage from '../common/ResilientImage';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import type { ProcessV2CardData, ProcessV2Stage } from './ProcessCardsV2';

type ProcessTaskModalV2Props = {
  open: boolean;
  process: ProcessV2CardData;
  stage: ProcessV2Stage | null;
  laneTitle?: string | null;
  onClose: () => void;
};

type MockCustomField = {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'select' | 'multi_select' | 'number' | 'date' | 'boolean' | 'textarea' | 'long_text' | 'very_long_text';
  options?: Array<{ value: string; label: string; color?: string }>;
};

const statusOptions = [
  { value: 'draft', label: 'پیش نویس' },
  { value: 'waiting', label: 'شروع نشده' },
  { value: 'active', label: 'در حال انجام' },
  { value: 'review', label: 'بازبینی' },
  { value: 'done', label: 'تکمیل شده' },
  { value: 'blocked', label: 'متوقف' },
  { value: 'canceled', label: 'لغو شده' },
];

const statusLabel: Record<string, string> = {
  draft: 'پیش نویس',
  waiting: 'شروع نشده',
  active: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  blocked: 'متوقف',
  canceled: 'لغو شده',
};

const statusColor: Record<string, string> = {
  draft: '#64748b',
  waiting: '#dc2626',
  active: '#2563eb',
  review: '#f97316',
  done: '#16a34a',
  blocked: '#dc2626',
  canceled: '#64748b',
};

const statusTagClass: Record<string, string> = {
  draft: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200',
  waiting: '!border-red-200 !bg-red-50 !text-red-700 dark:!border-red-700/50 dark:!bg-red-500/10 dark:!text-red-200',
  active: '!border-blue-200 !bg-blue-50 !text-blue-700 dark:!border-blue-700/50 dark:!bg-blue-500/10 dark:!text-blue-200',
  review: '!border-orange-200 !bg-orange-50 !text-orange-700 dark:!border-orange-700/50 dark:!bg-orange-500/10 dark:!text-orange-200',
  done: '!border-green-200 !bg-green-50 !text-green-700 dark:!border-green-700/50 dark:!bg-green-500/10 dark:!text-green-200',
  blocked: '!border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-700/50 dark:!bg-rose-500/10 dark:!text-rose-200',
  canceled: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200',
};

const fileSamples = [
  {
    id: 'file-1',
    title: 'شرح فعالیت.pdf',
    meta: 'فایل',
    fileType: 'file',
    mimeType: 'application/pdf',
    fileUrl: '',
    starred: true,
  },
  {
    id: 'file-2',
    title: 'تصویر پیوست.jpg',
    meta: 'تصویر',
    fileType: 'image',
    mimeType: 'image/jpeg',
    fileUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=220&q=80',
    starred: false,
  },
  {
    id: 'file-3',
    title: 'گزارش اقدام.docx',
    meta: 'فایل',
    fileType: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileUrl: '',
    starred: false,
  },
];

const activityTagOptions = [
  { value: 'پیگیری', label: 'پیگیری', color: '#2563eb' },
  { value: 'مشتری مهم', label: 'مشتری مهم', color: '#d97706' },
  { value: 'فوری', label: 'فوری', color: '#dc2626' },
  { value: 'مالی', label: 'مالی', color: '#059669' },
  { value: 'حقوقی', label: 'حقوقی', color: '#7c3aed' },
];

const buildCustomFields = (stage: ProcessV2Stage | null): MockCustomField[] => [
  {
    key: 'channel',
    label: 'کانال پیگیری',
    value: stage?.activityTypeLabel || 'تماس خروجی',
    type: 'select',
    options: [
      { value: 'تماس خروجی', label: 'تماس خروجی' },
      { value: 'پیامک', label: 'پیامک' },
      { value: 'جلسه حضوری', label: 'جلسه حضوری' },
    ],
  },
  {
    key: 'priority',
    label: 'درجه اهمیت',
    value: stage?.status === 'blocked' ? 'فوری' : 'معمولی',
    type: 'select',
    options: [
      { value: 'معمولی', label: 'معمولی' },
      { value: 'مهم', label: 'مهم' },
      { value: 'فوری', label: 'فوری' },
    ],
  },
  { key: 'duration', label: 'زمان تخمینی', value: '45', type: 'number' },
  { key: 'due', label: 'موعد انجام', value: stage?.dueLabel || '۱۴۰۳/۱۲/۲۵ ۱۶:۳۰', type: 'date' },
  { key: 'needs_report', label: 'نیازمند گزارش', value: 'true', type: 'boolean' },
  { key: 'expected_result', label: 'خروجی مورد انتظار', value: 'ثبت نتیجه و اقدام بعدی', type: 'text' },
  { key: 'notes', label: 'یادداشت داخلی', value: 'در صورت عدم پاسخ، پیگیری به روز بعد منتقل شود.', type: 'textarea' },
  {
    key: 'long_text',
    label: 'شرح تکمیلی',
    value: 'این فیلد برای متن‌های بلندتر استفاده می‌شود؛ مثلا توضیح کامل شرایط فعالیت، نکات اجرایی و مواردی که باید قبل از شروع کار بررسی شوند.',
    type: 'long_text',
  },
  {
    key: 'very_long_text',
    label: 'متن خیلی بلند',
    value: 'این نمونه برای متن‌های خیلی بلند است؛ کاربر باید بتواند در زمان ویرایش، با گرفتن گوشه پایین فیلد، ارتفاع باکس را بیشتر کند تا متن‌های چند پاراگرافی، گزارش‌های طولانی یا شرح کامل مذاکره را راحت‌تر ببیند و ویرایش کند.',
    type: 'very_long_text',
  },
];

const TaskActionButton = ({
  title,
  icon,
  color,
  active,
}: {
  title: string;
  icon: React.ReactNode;
  color?: string;
  active?: boolean;
}) => {
  const effectiveColor = color || '#6b7280';
  return (
    <Tooltip title={title}>
      <Button
        type="text"
        size="middle"
        icon={icon}
        aria-label={title}
        className="task-action-button !inline-flex !h-9 !w-9 !min-w-9 !items-center !justify-center !rounded-lg"
        style={{
          color: active ? effectiveColor : '#4b5563',
          backgroundColor: active ? `${effectiveColor}1a` : 'transparent',
          border: 'none',
          boxShadow: active ? `0 4px 12px ${effectiveColor}33` : '0 3px 10px rgba(15, 23, 42, 0.10)',
        }}
      />
    </Tooltip>
  );
};

type InlineEditableFieldProps = {
  label: string;
  value: string;
  onSave: (value: string) => void;
  options?: Array<{ value: string; label: string; color?: string }>;
  fieldType?: MockCustomField['type'];
  icon?: React.ReactNode;
  accentColor?: string;
  multiline?: boolean;
  placeholder?: string;
};

const InlineEditableField: React.FC<InlineEditableFieldProps> = ({
  label,
  value,
  onSave,
  options,
  fieldType = 'text',
  icon,
  accentColor,
  multiline,
  placeholder,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!editing) setDraftValue(value);
  }, [editing, value]);

  const commit = () => {
    onSave(String(draftValue || '').trim() || value);
    setEditing(false);
  };

  const cancel = () => {
    setDraftValue(value);
    setEditing(false);
  };

  const isLongText = fieldType === 'long_text' || fieldType === 'very_long_text';
  const isMultiline = multiline || fieldType === 'textarea' || isLongText;
  const displayLabel = (() => {
    if (fieldType === 'boolean') return value === 'true' ? 'بله' : 'خیر';
    if (fieldType === 'multi_select') {
      return String(value || '')
        .split(',')
        .map((item) => options?.find((option) => option.value === item.trim())?.label || item.trim())
        .filter(Boolean)
        .join('، ') || '-';
    }
    return options?.find((option) => option.value === value)?.label || value || '-';
  })();

  const renderEditor = () => {
    if (fieldType === 'boolean') {
      return (
        <div className="flex h-9 items-center gap-2">
          <Switch checked={draftValue === 'true'} onChange={(checked) => setDraftValue(checked ? 'true' : 'false')} />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{draftValue === 'true' ? 'فعال' : 'غیرفعال'}</span>
        </div>
      );
    }

    if (fieldType === 'multi_select') {
      return (
        <AdaptiveSelectField
          mode="multiple"
          value={String(draftValue || '').split(',').map((item) => item.trim()).filter(Boolean)}
          onChange={(nextValue) => setDraftValue(Array.isArray(nextValue) ? nextValue.join(',') : String(nextValue ?? ''))}
          options={options || []}
          allowClear
          className="w-full"
          pickerTitle={label}
          placeholder={placeholder || label}
          optionRender={(option: any) => {
            const rawValue = String(option?.value ?? option?.data?.value ?? '').trim();
            const meta = options?.find((item) => item.value === rawValue);
            const color = meta?.color || '#64748b';
            return (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span>{meta?.label || String(option?.label ?? option?.data?.label ?? rawValue)}</span>
              </span>
            );
          }}
        />
      );
    }

    if (options) {
      return (
        <AdaptiveSelectField
          value={draftValue}
          onChange={(nextValue) => setDraftValue(String(nextValue ?? ''))}
          options={options}
          allowClear={false}
          className="w-full"
          pickerTitle={label}
          placeholder={placeholder || label}
        />
      );
    }

    if (isMultiline) {
      return (
        <Input.TextArea
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          placeholder={placeholder || label}
          className="!rounded-md !text-xs"
          style={{
            minHeight: fieldType === 'very_long_text' ? 168 : fieldType === 'long_text' ? 112 : 72,
            resize: 'vertical',
          }}
        />
      );
    }

    return (
      <Input
        type={fieldType === 'number' ? 'number' : 'text'}
        inputMode={fieldType === 'number' ? 'numeric' : undefined}
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        placeholder={placeholder || label}
        className="!h-9 !rounded-md !text-xs"
        prefix={fieldType === 'date' ? <CalendarOutlined /> : undefined}
      />
    );
  };

  if (editing) {
    return (
      <div className="min-w-0 rounded-lg border border-[rgba(var(--brand-200-rgb),0.7)] bg-gray-50 px-2 py-2 dark:border-[rgba(var(--brand-300-rgb),0.25)] dark:bg-white/5">
        <div className="mb-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">{label}</div>
        <div className="flex min-w-0 items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {renderEditor()}
          </div>
          <Button
            type="text"
            size="small"
            shape="circle"
            icon={<CheckOutlined />}
            onClick={commit}
            aria-label="تایید"
            className="!inline-flex !items-center !justify-center !text-green-600"
          />
          <Button
            type="text"
            size="small"
            shape="circle"
            icon={<CloseOutlined />}
            onClick={cancel}
            aria-label="لغو"
            className="!inline-flex !items-center !justify-center !text-gray-500"
          />
        </div>
      </div>
    );
  }

  const longTextNeedsToggle = isLongText && String(displayLabel || '').length > 120;

  return (
    <div
      className="group flex min-h-[3.25rem] w-full min-w-0 items-start gap-2 rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-right transition hover:border-[rgba(var(--brand-200-rgb),0.7)] hover:bg-white dark:bg-white/5 dark:hover:border-[rgba(var(--brand-300-rgb),0.25)] dark:hover:bg-white/10"
    >
      {icon ? (
        <span
          className="mt-2 shrink-0 text-sm"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400">{label}</span>
        {fieldType === 'multi_select' ? (
          <span className="mt-1 flex min-w-0 flex-wrap gap-1">
            {String(value || '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => {
                const meta = options?.find((option) => option.value === item);
                const color = meta?.color || '#64748b';
                return (
                <Tag
                  key={item}
                  className="!m-0 !rounded-full !px-2 !py-0 !text-[11px] !font-bold"
                  style={{
                    backgroundColor: `${color}1a`,
                    borderColor: `${color}55`,
                    color,
                  }}
                >
                  {meta?.label || item}
                </Tag>
                );
              })}
          </span>
        ) : isLongText ? (
          <span className="relative mt-0.5 block">
            <span className={`block whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-gray-800 transition-all duration-200 dark:text-gray-100 ${longTextNeedsToggle && !expanded ? 'max-h-28 overflow-hidden' : ''}`}>
              {displayLabel}
            </span>
            {longTextNeedsToggle && !expanded ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-gray-50 to-transparent dark:from-[#1f1f1f]" />
            ) : null}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{displayLabel}</span>
        )}
        {longTextNeedsToggle ? (
          <Button
            size="small"
            type="text"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => !current);
            }}
            className="mt-2 !h-6 !px-0 !text-xs !text-gray-500 hover:!text-leather-600"
          >
            {expanded ? 'جمع کردن' : 'مشاهده بیشتر'}
          </Button>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition group-hover:bg-white group-hover:text-[rgba(var(--brand-700-rgb),1)] dark:group-hover:bg-white/10"
        aria-label={`ویرایش ${label}`}
      >
        <EditOutlined className="text-[12px]" />
      </button>
    </div>
  );
};

const AssigneeIcon: React.FC<{ label: string; avatarUrl?: string | null }> = ({ label, avatarUrl }) => {
  if (avatarUrl) {
    return (
      <span className="block h-7 w-7 overflow-hidden rounded-full border border-white bg-gray-100 shadow-sm dark:border-gray-700">
        <ResilientImage src={avatarUrl} preset="avatar" alt={label} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-200">
      {label.includes('واحد') || label.includes('تیم') ? <TeamOutlined /> : <UserOutlined />}
    </span>
  );
};

const FilePreviewThumb: React.FC<{
  file: (typeof fileSamples)[number];
}> = ({ file }) => {
  if (file.fileType === 'image' && file.fileUrl) {
    return (
      <ResilientImage
        src={file.fileUrl}
        preset="thumb"
        alt={file.title}
        className="h-11 w-11 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
      />
    );
  }
  return (
    <div className="h-11 w-11 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <FileExtensionTile fileName={file.title} url={file.fileUrl} mimeType={file.mimeType} compact />
    </div>
  );
};

const ProcessTaskModalV2: React.FC<ProcessTaskModalV2Props> = ({
  open,
  process,
  stage,
  laneTitle,
  onClose,
}) => {
  const [statusValue, setStatusValue] = useState('waiting');
  const [assigneeValue, setAssigneeValue] = useState('تعیین نشده');
  const [activityTypeValue, setActivityTypeValue] = useState('');
  const [tagValue, setTagValue] = useState('پیگیری,مشتری مهم');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [reportDraft, setReportDraft] = useState('');
  const [customFields, setCustomFields] = useState<MockCustomField[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [starredFileIds, setStarredFileIds] = useState<Set<string>>(() => new Set(fileSamples.filter((file) => file.starred).map((file) => file.id)));
  const isDraftActivityCreationMode = process.mode === 'run' && stage?.kind === 'draft';

  useEffect(() => {
    if (!open) return;
    setStatusValue(isDraftActivityCreationMode ? 'waiting' : stage?.status || 'waiting');
    setAssigneeValue(String(stage?.assigneeLabel || '').trim() || 'تعیین نشده');
    setActivityTypeValue(stage?.activityTypeLabel || (stage?.kind === 'draft' ? 'مرحله پیش نویس' : 'فعالیت سازمانی'));
    setTagValue('پیگیری,مشتری مهم');
    setDescriptionDraft(stage?.metaLabel || '');
    setReportDraft('');
    setCustomFields(buildCustomFields(stage));
    setIsLocked(false);
    setStarredFileIds(new Set(fileSamples.filter((file) => file.starred).map((file) => file.id)));
  }, [isDraftActivityCreationMode, open, stage]);

  const taskTitle = isDraftActivityCreationMode
    ? `ایجاد فعالیت: ${stage?.title || 'مرحله پیش نویس'}`
    : stage?.title || 'جزئیات فعالیت';
  const actionCount = toPersianNumber(stage?.actionCount ?? 0);
  const currentStatusColor = statusColor[statusValue] || '#64748b';
  const relatedRows = useMemo(() => {
    if (process.mode !== 'run') return [{ label: 'الگوی فرآیند', value: process.title, moduleId: 'process_templates', recordId: process.id }];
    return [
      { label: 'رکورد اصلی', value: process.relatedRecordLabel.replace(/^رکورد مرتبط:\s*/, ''), moduleId: 'records', recordId: process.id },
      { label: 'فرآیند', value: process.title, moduleId: 'process_runs', recordId: process.id },
      ...(laneTitle ? [{ label: 'ردیف', value: laneTitle, moduleId: 'process_runs', recordId: process.id }] : []),
    ];
  }, [laneTitle, process]);

  return (
    <Modal
      rootClassName="task-quick-modal-root process-task-v2-modal-root"
      className="task-quick-modal process-task-v2-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      destroyOnHidden
      width={860}
      maskClosable={false}
      style={{ maxWidth: 'calc(100vw - 1rem)' }}
      styles={{
        body: { padding: 0, overflow: 'hidden' },
        content: { overflow: 'hidden' },
      }}
    >
      <div
        className="w-full max-w-full overflow-x-hidden overflow-y-auto font-['Vazirmatn']"
        dir="rtl"
        style={{
          width: '100%',
          maxWidth: 'calc(100vw - 1rem)',
          maxHeight: 'min(80vh, 43rem)',
          padding: '0.75rem',
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-[rgba(var(--brand-200-rgb),0.45)] pb-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="min-w-0 space-y-2">
            <h4 className="m-0 line-clamp-2 text-sm font-bold text-[rgba(var(--brand-800-rgb),1)] dark:text-gray-100">{taskTitle}</h4>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className={`!m-0 !rounded-full !border !px-2.5 !py-0.5 !text-[11px] !font-black ${statusTagClass[statusValue]}`}>
                {statusLabel[statusValue] || statusValue}
              </Tag>
              <Tag className="!m-0 !rounded-full !text-[11px] !font-bold">{activityTypeValue || '-'}</Tag>
              <Tag className="!m-0 !rounded-full !text-[11px] !font-bold">{actionCount} اقدام</Tag>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Tooltip title={isLocked ? 'باز کردن رکورد' : 'قفل کردن رکورد'}>
              <Button
                type="text"
                shape="circle"
                icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
                onClick={() => setIsLocked((current) => !current)}
                aria-label={isLocked ? 'باز کردن رکورد' : 'قفل کردن رکورد'}
                className={isLocked ? '!text-red-600' : '!text-slate-500'}
              />
            </Tooltip>
            <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={onClose} aria-label="بستن" />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-stretch gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2 dark:border-gray-700 dark:bg-transparent">
          <div className="min-w-[11rem] max-w-full flex-[0_1_14rem]">
            <InlineEditableField
              label="وضعیت"
              value={statusValue}
              onSave={setStatusValue}
              options={statusOptions}
              fieldType="select"
              accentColor={currentStatusColor}
              icon={<span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentStatusColor }} />}
            />
          </div>

          <div className="flex min-w-[15rem] flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-2 py-1.5 dark:bg-white/5">
            {isDraftActivityCreationMode ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                  این مرحله هنوز فعالیت واقعی ندارد.
                </span>
                <Button type="primary" icon={<PlusOutlined />} className="!h-9 !rounded-lg">
                  ایجاد فعالیت
                </Button>
              </div>
            ) : (
              <>
                <TaskActionButton title="مشاهده دستورالعمل‌ها" icon={<ReadOutlined />} />
                <TaskActionButton title="برنامه‌ریزی مجدد فعالیت" icon={<ClockCircleOutlined />} />
                <TaskActionButton title="در حال انجام" icon={<CaretRightOutlined />} color="#2563eb" active={statusValue === 'active'} />
                <TaskActionButton title="بازبینی" icon={<EyeOutlined />} color="#f97316" active={statusValue === 'review'} />
                <TaskActionButton title="تکمیل فعالیت" icon={<CheckOutlined />} color="#16a34a" active={statusValue === 'done'} />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row" dir="ltr">
          <aside className="min-w-0 space-y-3 lg:w-[17rem] lg:shrink-0" dir="rtl">
            <RecordImageBox
              moduleId="tasks"
              recordId={stage?.id || undefined}
              imageUrl={stage?.assigneeAvatarUrl || null}
              canEdit={false}
              canViewFilesManager={false}
              compact
              filesButtonLabel="فایل‌ها"
            />
            <Button block icon={<UploadOutlined />} className="!h-9 !rounded-lg">
              آپلود فایل
            </Button>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-white/5">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-200">
                <FileOutlined />
                فایل‌ها و تصاویر
              </div>
              <div className="space-y-1.5">
                {fileSamples.map((file) => (
                  <div key={file.id} className="flex min-w-0 items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs dark:bg-white/5">
                    <FilePreviewThumb file={file} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-gray-700 dark:text-gray-200">{file.title}</div>
                      <div className="mt-0.5 text-[10px] text-gray-400">{file.meta}</div>
                    </div>
                    <Tooltip title={starredFileIds.has(file.id) ? 'ستاره‌دار' : 'ستاره‌دار کردن'}>
                      <Button
                        size="small"
                        type={starredFileIds.has(file.id) ? 'primary' : 'text'}
                        icon={starredFileIds.has(file.id) ? <StarFilled /> : <StarOutlined />}
                        className={starredFileIds.has(file.id) ? '!bg-amber-500 !text-white' : '!text-gray-400 hover:!text-amber-500'}
                        onClick={() => setStarredFileIds((current) => {
                          const next = new Set(current);
                          if (next.has(file.id)) next.delete(file.id);
                          else next.add(file.id);
                          return next;
                        })}
                        aria-label={starredFileIds.has(file.id) ? 'حذف ستاره فایل' : 'ستاره‌دار کردن فایل'}
                      />
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1" dir="rtl">
            <div className="mb-3 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InlineEditableField
                  label="مسئول"
                  value={assigneeValue}
                  onSave={setAssigneeValue}
                  options={[{ value: assigneeValue, label: assigneeValue }]}
                  fieldType="select"
                  icon={<AssigneeIcon label={assigneeValue} avatarUrl={stage?.assigneeAvatarUrl} />}
                />
                <InlineEditableField
                  label="برچسب‌ها"
                  value={tagValue}
                  onSave={setTagValue}
                  options={activityTagOptions}
                  fieldType="multi_select"
                />
              </div>

              <InlineEditableField
                label="شرح فعالیت"
                value={descriptionDraft}
                onSave={setDescriptionDraft}
                fieldType="long_text"
                placeholder="شرح فعالیت"
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">فیلدهای اختصاصی این فعالیت:</span>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-white/5 sm:grid-cols-2">
                  {customFields.map((field) => (
                    <div key={field.key} className={field.type === 'long_text' || field.type === 'very_long_text' ? 'sm:col-span-2' : undefined}>
                      <InlineEditableField
                        label={field.label}
                        value={field.value}
                        fieldType={field.type}
                        options={field.options}
                        onSave={(nextValue) => setCustomFields((current) => current.map((item) => (
                          item.key === field.key ? { ...item, value: nextValue } : item
                        )))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[minmax(8rem,0.78fr)_minmax(0,1.22fr)] gap-3 break-words rounded-lg border border-[rgba(var(--brand-200-rgb),0.45)] bg-gray-50/80 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                <div className="order-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <OrderedListOutlined className="text-gray-500 dark:text-gray-300" />
                    <span>مرحله {toPersianNumber(stage?.layoutSlot ?? 1)} از فرآیند</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">نوع فعالیت:</span>
                    <span className="font-semibold">{activityTypeValue || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {assigneeValue.includes('واحد') || assigneeValue.includes('تیم') ? <TeamOutlined className="text-gray-500 dark:text-gray-300" /> : <UserOutlined className="text-gray-500 dark:text-gray-300" />}
                    <span>مسئول: {assigneeValue}</span>
                  </div>
                  {stage?.dueLabel ? (
                    <div className="flex items-center gap-2">
                      <ClockCircleOutlined className="text-gray-500 dark:text-gray-300" />
                      <span>موعد: {stage.dueLabel}</span>
                    </div>
                  ) : null}
                </div>
                <div className="order-2 space-y-2">
                  {relatedRows.map((row) => (
                    <div key={`${row.label}-${row.value}`} className="flex items-center gap-2">
                      <LinkOutlined className="text-gray-500 dark:text-gray-300" />
                      <span className="min-w-0">
                        {row.label}:{' '}
                        <Link to={`/${row.moduleId}/${row.recordId}`} className="font-bold text-cyan-700 hover:underline dark:text-cyan-300">
                          {row.value}
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <InlineEditableField
                  label="گزارش فعالیت"
                  value={reportDraft}
                  onSave={setReportDraft}
                  fieldType="long_text"
                  placeholder="متن گزارش را بنویسید..."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(var(--brand-200-rgb),0.45)] pt-2 dark:border-[rgba(var(--brand-300-rgb),0.18)]">
              <span />
              <div className="flex items-center justify-end gap-1">
                {isDraftActivityCreationMode ? (
                  <Button type="primary" size="small" icon={<PlusOutlined />}>
                    ایجاد فعالیت و تبدیل مرحله
                  </Button>
                ) : (
                  <>
                    <Tooltip title="قطع اتصال از این فرآیند و رکورد">
                      <Button size="small" type="text" icon={<LinkOutlined />} className="text-gray-500 hover:!text-amber-600" />
                    </Tooltip>
                    <Tooltip title="حذف کامل وظیفه">
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                    <Button size="small" type="link" className="inline-flex items-center gap-1 px-2 text-xs text-[rgba(var(--brand-700-rgb),1)]">
                      جزئیات کامل
                    </Button>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </Modal>
  );
};

export default memo(ProcessTaskModalV2);
