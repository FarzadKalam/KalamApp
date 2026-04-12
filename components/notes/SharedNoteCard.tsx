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
import { parseNoteTemplateTextSegments } from '../../utils/noteTemplateText';
import AiSparkleIcon from '../ai/AiSparkleIcon';

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
  statusNode?: React.ReactNode;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  variant?: 'default' | 'ai';
  renderTemplateBold?: boolean;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const HTML_ANCHOR_REGEX = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
const LINK_CLASS_NAME = 'underline decoration-dotted underline-offset-2 break-all [overflow-wrap:anywhere] text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]';

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
  statusNode,
  isEditing = false,
  editingValue = '',
  onEditingChange,
  onSaveEdit,
  onCancelEdit,
  onReply,
  onEdit,
  onDelete,
  onForward,
  variant = 'default',
  renderTemplateBold = false,
}) => {
  const renderPlainLinkifiedText = (value: string, keyPrefix = 'link') => {
    const source = String(value || '');
    if (!source.trim()) return source;
    const matches = Array.from(source.matchAll(URL_REGEX));
    if (!matches.length) return source;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    matches.forEach((match, index) => {
      const matched = String(match[0] || '');
      const start = typeof match.index === 'number' ? match.index : -1;
      if (!matched || start < 0) return;
      if (start > cursor) nodes.push(source.slice(cursor, start));
      nodes.push(
        <a
          key={`${keyPrefix}-plain-${index}-${start}`}
          href={matched}
          target="_blank"
          rel="noreferrer"
          className={LINK_CLASS_NAME}
        >
          {matched}
        </a>
      );
      cursor = start + matched.length;
    });
    if (cursor < source.length) nodes.push(source.slice(cursor));
    return nodes.length ? nodes : source;
  };

  const renderLinkifiedText = (value: string, keyPrefix = 'link') => {
    const source = String(value || '');
    if (!source.trim()) return source;

    const anchorMatches = Array.from(source.matchAll(HTML_ANCHOR_REGEX));
    if (!anchorMatches.length) return renderPlainLinkifiedText(source, keyPrefix);

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    anchorMatches.forEach((match, index) => {
      const full = String(match[0] || '');
      const href = String(match[1] || '').trim();
      const label = String(match[2] || '').trim();
      const start = typeof match.index === 'number' ? match.index : -1;
      if (!full || start < 0) return;
      if (start > cursor) {
        nodes.push(renderPlainLinkifiedText(source.slice(cursor, start), `${keyPrefix}-before-${index}`));
      }
      if (href) {
        nodes.push(
          <a
            key={`${keyPrefix}-anchor-${index}-${start}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS_NAME}
          >
            {label || href}
          </a>
        );
      } else {
        nodes.push(full);
      }
      cursor = start + full.length;
    });

    if (cursor < source.length) {
      nodes.push(renderPlainLinkifiedText(source.slice(cursor), `${keyPrefix}-tail`));
    }
    return nodes.length ? nodes : source;
  };

  const renderText = (value: string) => {
    if (!renderTemplateBold) return renderLinkifiedText(value);
    const segments = parseNoteTemplateTextSegments(value);
    if (segments.length === 0) return renderLinkifiedText(value);
    return segments.map((segment, index) => (
      segment.bold ? (
        <strong key={`${index}-${segment.text}`} className="font-bold">
          {renderLinkifiedText(segment.text)}
        </strong>
      ) : (
        <React.Fragment key={`${index}-${segment.text}`}>
          {renderLinkifiedText(segment.text)}
        </React.Fragment>
      )
    ));
  };

  return (
  <div dir="ltr" className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
    <div className={`flex max-w-full items-start gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar
        size={30}
        src={avatarUrl || undefined}
        className={`mt-0.5 shrink-0 ${variant === 'ai' ? '!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]' : ''}`}
      >
        {!avatarUrl && (variant === 'ai' ? <AiSparkleIcon className="h-4 w-4" /> : (avatarFallback || authorName || '?').slice(0, 1))}
      </Avatar>
      <div
        dir="rtl"
        className={`min-w-0 max-w-[calc(100%-2.3rem)] text-right rounded-2xl px-2.5 py-2 border shadow-sm ${
          variant === 'ai'
            ? 'bg-[#fdf2f8] dark:bg-[#3b1022] border-[#f0abfc] dark:border-[#be185d]/45 rounded-tl-sm'
            : isMine
            ? 'bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-600-rgb),0.2)] border-[rgba(var(--brand-300-rgb),0.65)] dark:border-[rgba(var(--brand-300-rgb),0.35)] rounded-tr-sm'
            : 'bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)] border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)] rounded-tl-sm'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[9px] text-gray-400">
          <span className="truncate">{authorName}</span>
          <span className="shrink-0 inline-flex items-center gap-1">
            {statusNode}
            <span>{createdAtLabel}</span>
          </span>
        </div>

        {replyText ? (
          <div className="mb-2 rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.82)] px-2 py-1.5 text-[10px] text-gray-600 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--brand-700-rgb),0.2)] dark:text-gray-300">
            <span className="font-medium text-gray-700 dark:text-gray-200">
              پاسخ به یادداشت "{replyAuthorName || 'کاربر'}":
            </span>{' '}
            <span className="whitespace-pre-wrap">
              "{renderText(replyText)}"
            </span>
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
          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-6 text-gray-800 dark:text-gray-200">
            {renderText(text)}
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
};

export default SharedNoteCard;
