import React, { useEffect, useState } from 'react';
import { Avatar, Button, Input, Tag, theme } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
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
  animateOnMount?: boolean;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const HTML_ANCHOR_REGEX = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
const LINK_CLASS_NAME = 'underline decoration-dotted underline-offset-2 break-all [overflow-wrap:anywhere] text-current';

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
  animateOnMount = false,
}) => {
  const [entered, setEntered] = useState<boolean>(!animateOnMount);
  const { token } = theme.useToken();

  useEffect(() => {
    if (!animateOnMount) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, [animateOnMount]);

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

  const handleCopyText = () => {
    const raw = String(text || '');
    if (!raw.trim()) return;
    void navigator.clipboard?.writeText(raw);
  };

  const cardStyle: React.CSSProperties = variant === 'ai'
    ? {
        background: token.colorInfoBg,
        border: `1px solid ${token.colorInfoBorder}`,
        color: token.colorText,
        boxShadow: token.boxShadowSecondary,
      }
    : isMine
      ? {
          background: token.colorPrimaryBg,
          border: `1px solid ${token.colorPrimaryBorder}`,
          color: token.colorText,
          boxShadow: token.boxShadowSecondary,
        }
      : {
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
          color: token.colorText,
          boxShadow: token.boxShadowSecondary,
        };

  const subtleTextStyle: React.CSSProperties = {
    color: token.colorTextSecondary,
  };

  const replyStyle: React.CSSProperties = {
    background: token.colorFillSecondary,
    color: token.colorTextSecondary,
    boxShadow: `inset 0 0 0 1px ${token.colorBorderSecondary}`,
  };

  const bodyStyle: React.CSSProperties = {
    color: token.colorText,
  };

  const attachmentStyle: React.CSSProperties = {
    borderColor: isMine ? token.colorPrimaryBorder : token.colorBorderSecondary,
    background: token.colorFillTertiary,
    color: token.colorTextSecondary,
  };

  const mentionUserStyle: React.CSSProperties = {
    background: token.colorPrimaryBg,
    color: token.colorPrimaryText,
  };

  const mentionRoleStyle: React.CSSProperties = {
    background: token.colorFillSecondary,
    color: token.colorTextSecondary,
  };

  return (
  <div dir="ltr" className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
    <div className={`flex max-w-full items-start gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar
        size={26}
        src={avatarUrl || undefined}
        className={`mt-0.5 shrink-0 ${variant === 'ai' ? '!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]' : ''}`}
      >
        {!avatarUrl && (variant === 'ai' ? <AiSparkleIcon className="h-4 w-4" /> : (avatarFallback || authorName || '?').slice(0, 1))}
      </Avatar>
      <div
        dir="rtl"
        className={`min-w-0 max-w-[calc(100%-2.3rem)] text-right rounded-[1.05rem] px-2.5 py-2 shadow-[0_3px_10px_rgba(15,23,42,0.08)] dark:shadow-[0_3px_10px_rgba(0,0,0,0.22)] transition-all duration-300 ease-out will-change-transform ${
          entered
            ? 'opacity-100 translate-x-0 translate-y-0 scale-100'
            : isMine
              ? 'opacity-0 translate-x-2 translate-y-1 scale-[0.985]'
              : 'opacity-0 -translate-x-2 translate-y-1 scale-[0.985]'
        } ${variant === 'ai' ? 'rounded-tl-sm' : isMine ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        style={cardStyle}
      >
          <div className="mb-1 flex items-center justify-between gap-2 text-[8px]" style={subtleTextStyle}>
          <span className="truncate">{authorName}</span>
          <span className="shrink-0 inline-flex items-center gap-1">
            {statusNode}
            <span>{createdAtLabel}</span>
          </span>
        </div>

        {replyText ? (
          <div className="mb-2 rounded-xl px-2 py-1.5 text-[10px]" style={replyStyle}>
            <span className="font-medium" style={{ color: token.colorText }}>
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
          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] leading-5" style={bodyStyle}>
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
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px]"
                style={attachmentStyle}
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
              <Tag key={`user-${label}`} className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[9px]" style={mentionUserStyle}>
                @{label}
              </Tag>
            ))}
            {mentionRoles.map((label) => (
              <Tag key={`role-${label}`} className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[9px]" style={mentionRoleStyle}>
                @{label}
              </Tag>
            ))}
          </div>
        ) : null}

        {footer ? <div className="mt-2 text-[9px]" style={subtleTextStyle}>{footer}</div> : null}
        {isEdited ? <div className="mt-1.5 text-[9px]" style={subtleTextStyle}>ویرایش شده</div> : null}

        <div className="mt-1.5 flex items-center gap-0.5">
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyText} disabled={!String(text || '').trim()} />
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
