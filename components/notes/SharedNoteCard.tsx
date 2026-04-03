import React from 'react';
import { Avatar, Button, Input, Tag } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EnterOutlined,
  EditOutlined,
  ForwardOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import type { NoteAttachment } from '../../utils/noteContent';

interface SharedNoteCardProps {
  authorName: string;
  createdAtLabel: string;
  text: string;
  attachments: NoteAttachment[];
  avatarUrl?: string | null;
  avatarFallback?: string;
  mentionUsers?: string[];
  mentionRoles?: string[];
  replyText?: string | null;
  replyAuthorName?: string | null;
  isMine?: boolean;
  isEdited?: boolean;
  footer?: React.ReactNode;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
}

const SharedNoteCard: React.FC<SharedNoteCardProps> = ({
  authorName,
  createdAtLabel,
  text,
  attachments,
  avatarUrl,
  avatarFallback,
  mentionUsers = [],
  mentionRoles = [],
  replyText,
  replyAuthorName,
  isMine = false,
  isEdited = false,
  footer,
  isEditing = false,
  editingValue = '',
  onEditingChange,
  onSaveEdit,
  onCancelEdit,
  onReply,
  onEdit,
  onDelete,
  onForward,
}) => (
  <div dir="ltr" className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
    <div className={`flex max-w-full items-start gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar
        size={30}
        src={avatarUrl || undefined}
        className="mt-0.5 shrink-0"
      >
        {!avatarUrl && (avatarFallback || authorName || '?').slice(0, 1)}
      </Avatar>
      <div
        dir="rtl"
        className={`min-w-0 max-w-[calc(100%-2.3rem)] text-right rounded-2xl px-2.5 py-2 border shadow-sm ${
          isMine
            ? 'bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-600-rgb),0.2)] border-[rgba(var(--brand-300-rgb),0.65)] dark:border-[rgba(var(--brand-300-rgb),0.35)] rounded-tr-sm'
            : 'bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)] border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)] rounded-tl-sm'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[9px] text-gray-400">
          <span className="truncate">{authorName}</span>
          <span className="shrink-0">{createdAtLabel}</span>
        </div>

        {replyText ? (
          <div className="mb-2 rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.82)] px-2 py-1.5 text-[10px] text-gray-600 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--brand-700-rgb),0.2)] dark:text-gray-300">
            <span className="font-medium text-gray-700 dark:text-gray-200">
              پاسخ به یادداشت "{replyAuthorName || 'کاربر'}":
            </span>{' '}
            <span className="whitespace-pre-wrap">"{replyText}"</span>
          </div>
        ) : null}

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <Input.TextArea
              value={editingValue}
              onChange={(event) => onEditingChange?.(event.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <div className="flex gap-2">
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={onSaveEdit}>
                ذخیره
              </Button>
              <Button size="small" icon={<CloseOutlined />} onClick={onCancelEdit}>
                انصراف
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-gray-800 dark:text-gray-200">
            {text}
          </div>
        )}

        {attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <a
                key={`${attachment.url}-${attachment.name}`}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[rgba(var(--brand-300-rgb),0.5)] bg-[rgba(var(--brand-50-rgb),0.9)] px-2 py-0.5 text-[10px] text-[rgb(var(--brand-700-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.25)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] dark:text-[rgb(var(--brand-300-rgb))]"
              >
                <PaperClipOutlined />
                <span className="max-w-[180px] truncate">{attachment.name}</span>
              </a>
            ))}
          </div>
        ) : null}

        {(mentionUsers.length > 0 || mentionRoles.length > 0) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mentionUsers.map((label) => (
              <Tag key={`user-${label}`} className="!m-0 !rounded-full !border-0 !bg-[rgba(var(--brand-100-rgb),0.95)] !px-2 !py-0.5 !text-[10px] !text-[rgb(var(--brand-700-rgb))]">
                @{label}
              </Tag>
            ))}
            {mentionRoles.map((label) => (
              <Tag key={`role-${label}`} className="!m-0 !rounded-full !border-0 !bg-[rgba(var(--brand-700-rgb),0.14)] !px-2 !py-0.5 !text-[10px] !text-[rgb(var(--brand-700-rgb))] dark:!text-[rgb(var(--brand-300-rgb))]">
                @{label}
              </Tag>
            ))}
          </div>
        ) : null}

        {footer ? <div className="mt-2 text-[10px] text-gray-500">{footer}</div> : null}
        {isEdited ? <div className="mt-1.5 text-[9px] text-gray-400">ویرایش شده</div> : null}

        <div className="mt-1.5 flex items-center gap-0.5">
          {onForward ? <Button type="text" size="small" icon={<ForwardOutlined />} onClick={onForward} /> : null}
          {onReply ? <Button type="text" size="small" icon={<EnterOutlined />} onClick={onReply} /> : null}
          {onEdit ? <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} /> : null}
          {onDelete ? <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} /> : null}
        </div>
      </div>
    </div>
  </div>
);

export default SharedNoteCard;
