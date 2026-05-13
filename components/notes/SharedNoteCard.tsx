import React, { useEffect, useState } from 'react';
import { Avatar, Button, Input, Modal, Tag, theme } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EnterOutlined,
  EditOutlined,
  ForwardOutlined,
  LikeFilled,
  LikeOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { isAudioNoteAttachment, type NoteAttachment } from '../../utils/noteContent';
import { isImageFileLike } from '../../utils/imagePreview';
import { parseNoteTemplateTextSegments } from '../../utils/noteTemplateText';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import ResilientImage from '../common/ResilientImage';

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
  replyAttachments?: NoteAttachment[];
  onReplyPreviewClick?: () => void;
  messageDomId?: string;
  isMine?: boolean;
  isEdited?: boolean;
  footer?: React.ReactNode;
  statusNode?: React.ReactNode;
  unreadIndicator?: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  onLike?: () => void;
  variant?: 'default' | 'ai';
  renderTemplateBold?: boolean;
  animateOnMount?: boolean;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const HTML_ANCHOR_REGEX = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
const LINK_CLASS_NAME = 'underline decoration-dotted underline-offset-2 break-all [overflow-wrap:anywhere] text-current';

const getAttachmentLabel = (attachment: NoteAttachment) => {
  const directName = String(attachment?.name || '').trim();
  if (directName) return directName;
  const rawUrl = String(attachment?.url || '').split('?')[0].split('#')[0];
  const fallback = rawUrl.split('/').pop() || 'تصویر';
  try {
    return decodeURIComponent(fallback);
  } catch {
    return fallback;
  }
};

const downloadAttachment = (attachment: NoteAttachment) => {
  const url = String(attachment?.url || '').trim();
  if (!url || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = getAttachmentLabel(attachment);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const normalizeMentionLabel = (value: string, type: 'user' | 'role') => {
  let label = String(value || '').trim().replace(/^@+/, '').trim();
  const prefixPattern = type === 'role' ? /^(نقش|تیم)\s*[:：]\s*/ : /^عضو\s*[:：]\s*/;
  while (prefixPattern.test(label)) {
    label = label.replace(prefixPattern, '').trim();
  }
  return label;
};

const normalizeMentionLabels = (values: string[], type: 'user' | 'role') => {
  const seen = new Set<string>();
  return (values || [])
    .map((value) => normalizeMentionLabel(value, type))
    .filter((label) => {
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    });
};

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
  replyAttachments = [],
  onReplyPreviewClick,
  messageDomId,
  isMine = false,
  isEdited = false,
  footer,
  statusNode,
  unreadIndicator = false,
  likeCount = 0,
  likedByMe = false,
  isEditing = false,
  editingValue = '',
  onEditingChange,
  onSaveEdit,
  onCancelEdit,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onLike,
  variant = 'default',
  renderTemplateBold = false,
  animateOnMount = false,
}) => {
  const [entered, setEntered] = useState<boolean>(!animateOnMount);
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const { token } = theme.useToken();
  const normalizedMentionUsers = normalizeMentionLabels(mentionUsers, 'user');
  const normalizedMentionRoles = normalizeMentionLabels(mentionRoles, 'role');

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
  const normalizedText = String(text || '').trim();

  const cardStyle: React.CSSProperties = variant === 'ai'
    ? {
        background: token.colorFillSecondary,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorText,
        boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
      }
    : isMine
      ? {
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
          color: token.colorText,
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.055)',
        }
      : {
          background: token.colorPrimaryBg,
          border: `1px solid ${token.colorPrimaryBorder}`,
          color: token.colorText,
          boxShadow: '0 8px 22px rgba(15, 23, 42, 0.075)',
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
    borderColor: token.colorBorderSecondary,
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

  const renderAttachment = (attachment: NoteAttachment) => {
    const label = getAttachmentLabel(attachment);
    const isImage = isImageFileLike(attachment.url, label, attachment.mimeType);
    const isAudio = isAudioNoteAttachment(attachment);
    if (isAudio) {
      return (
        <div
          key={`${attachment.url}-${label}`}
          className="flex min-w-[220px] max-w-[320px] items-center gap-2 rounded-2xl border px-2 py-2"
          style={attachmentStyle}
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
            <CustomerServiceOutlined />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-medium">{label}</div>
            <audio controls preload="none" src={attachment.url} className="mt-1 w-full max-w-[220px]">
              مرورگر شما از پخش صوت پشتیبانی نمی‌کند.
            </audio>
          </div>
          <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => downloadAttachment(attachment)} />
        </div>
      );
    }
    if (!isImage) {
      return (
        <a
          key={`${attachment.url}-${label}`}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px]"
          style={attachmentStyle}
        >
          <PaperClipOutlined />
          <span className="max-w-[180px] truncate">{label}</span>
        </a>
      );
    }

    return (
      <button
        key={`${attachment.url}-${label}`}
        type="button"
        className="group relative h-24 w-24 overflow-hidden rounded-md border p-0 text-right transition hover:opacity-90"
        style={attachmentStyle}
        title={label}
        onClick={() => setPreviewAttachment(attachment)}
      >
        <ResilientImage
          src={attachment.url}
          preset="thumb"
          alt={label}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-[9px] text-white">
          {label}
        </span>
      </button>
    );
  };

  const renderReplyAttachmentPreview = (attachment: NoteAttachment) => {
    const label = getAttachmentLabel(attachment);
    const isImage = isImageFileLike(attachment.url, label, attachment.mimeType);
    const isAudio = isAudioNoteAttachment(attachment);
    if (isImage) {
      return (
        <span
          key={`${attachment.url}-${label}`}
          className="inline-flex h-9 w-9 overflow-hidden rounded-md border opacity-95"
          style={{ borderColor: token.colorBorderSecondary }}
        >
          <ResilientImage src={attachment.url} preset="thumb" alt={label} className="h-full w-full object-cover" />
        </span>
      );
    }
    if (isAudio) {
      return (
        <span
          key={`${attachment.url}-${label}`}
          className="inline-flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-1 text-[9px] opacity-95"
          style={{ borderColor: token.colorBorderSecondary, color: token.colorTextSecondary }}
        >
          <CustomerServiceOutlined />
          <span className="truncate">صوت: {label}</span>
        </span>
      );
    }
    return (
      <span
        key={`${attachment.url}-${label}`}
        className="inline-flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-1 text-[9px] opacity-95"
        style={{ borderColor: token.colorBorderSecondary, color: token.colorTextSecondary }}
      >
        <PaperClipOutlined />
        <span className="truncate">{label}</span>
      </span>
    );
  };

  return (
  <>
  <div id={messageDomId} dir="ltr" className={`group/message flex w-full max-w-full scroll-mt-24 overflow-hidden ${isMine ? 'justify-end' : 'justify-start'}`}>
    <div className={`flex min-w-0 max-w-full items-start gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar
        size={26}
        src={avatarUrl || undefined}
        className={`mt-0.5 shrink-0 ${variant === 'ai' ? '!bg-[#fdf2f8] !text-[#be185d] dark:!bg-[#3b1022] dark:!text-[#f9a8d4]' : ''}`}
      >
        {!avatarUrl && (variant === 'ai' ? <AiSparkleIcon className="h-4 w-4" /> : (avatarFallback || authorName || '?').slice(0, 1))}
      </Avatar>
      <div className={`relative min-w-0 max-w-[calc(100%-2.3rem)] ${isMine ? 'pr-0' : 'pl-2'}`}>
        {unreadIndicator ? (
          <span
            aria-label="پیام خوانده‌نشده"
            className={`absolute top-3 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(255,255,255,0.95)] dark:shadow-[0_0_0_2px_rgba(15,23,42,0.95)] ${isMine ? '-right-1' : '-left-1'}`}
          />
        ) : null}
      <div
        dir="rtl"
        className={`text-right rounded-[1rem] px-3 py-2 shadow-[0_4px_14px_rgba(15,23,42,0.045)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-all duration-300 ease-out will-change-transform ${
          entered
            ? 'opacity-100 translate-x-0 translate-y-0 scale-100'
            : isMine
              ? 'opacity-0 translate-x-2 translate-y-1 scale-[0.985]'
              : 'opacity-0 -translate-x-2 translate-y-1 scale-[0.985]'
        } ${variant === 'ai' ? 'rounded-tl-sm' : isMine ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        style={cardStyle}
      >
          <div className="mb-1 flex items-center justify-between gap-2 text-[9px]" style={subtleTextStyle}>
          <span className="truncate font-semibold" style={{ color: token.colorText }}>{authorName}</span>
          <span className="shrink-0 inline-flex items-center gap-1">
            {statusNode}
            <span>{createdAtLabel}</span>
          </span>
        </div>

        {(replyText || replyAttachments.length > 0) ? (
          <div
            role={onReplyPreviewClick ? 'button' : undefined}
            tabIndex={onReplyPreviewClick ? 0 : undefined}
            className={`mb-2 block w-full rounded-lg px-2.5 py-1.5 text-right text-[10px] transition ${onReplyPreviewClick ? 'cursor-pointer hover:opacity-85' : 'cursor-default'}`}
            style={replyStyle}
            onClick={(event) => {
              if (!onReplyPreviewClick) return;
              event.preventDefault();
              event.stopPropagation();
              onReplyPreviewClick();
            }}
            onKeyDown={(event) => {
              if (!onReplyPreviewClick || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              event.stopPropagation();
              onReplyPreviewClick();
            }}
          >
            <span className="font-medium" style={{ color: token.colorText }}>
              پاسخ به یادداشت "{replyAuthorName || 'کاربر'}":
            </span>{' '}
            {replyText ? (
              <span className="line-clamp-2 whitespace-pre-wrap">
                "{renderText(replyText)}"
              </span>
            ) : null}
            {replyAttachments.length > 0 ? (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {replyAttachments.slice(0, 3).map(renderReplyAttachmentPreview)}
                {replyAttachments.length > 3 ? (
                  <span className="rounded-full px-2 py-1 text-[9px]" style={{ background: token.colorFillTertiary, color: token.colorTextSecondary }}>
                    +{replyAttachments.length - 3}
                  </span>
                ) : null}
              </span>
            ) : null}
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
          normalizedText ? (
            <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] leading-5" style={bodyStyle}>
              {renderText(text)}
            </div>
          ) : null
        )}

        {attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map(renderAttachment)}
          </div>
        ) : null}

        {(normalizedMentionUsers.length > 0 || normalizedMentionRoles.length > 0) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {normalizedMentionUsers.map((label) => (
              <Tag key={`user-${label}`} className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[9px]" style={mentionUserStyle}>
                @{label}
              </Tag>
            ))}
            {normalizedMentionRoles.map((label) => (
              <Tag key={`role-${label}`} className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[9px]" style={mentionRoleStyle}>
                @{label}
              </Tag>
            ))}
          </div>
        ) : null}

        {footer ? <div className="mt-2 text-[9px]" style={subtleTextStyle}>{footer}</div> : null}
        {isEdited ? <div className="mt-1.5 text-[9px]" style={subtleTextStyle}>ویرایش شده</div> : null}

        <div className="mt-1.5 flex items-center gap-0.5 opacity-65 transition group-hover/message:opacity-100 focus-within:opacity-100">
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyText} disabled={!String(text || '').trim()} />
          {onForward ? <Button type="text" size="small" icon={<ForwardOutlined />} onClick={onForward} /> : null}
          {onLike ? (
            <Button
              type="text"
              size="small"
              icon={likedByMe ? <LikeFilled /> : <LikeOutlined />}
              onClick={onLike}
              className={likedByMe ? '!text-rose-500' : ''}
            >
              {likeCount > 0 ? likeCount : null}
            </Button>
          ) : null}
          {onReply ? <Button type="text" size="small" icon={<EnterOutlined />} onClick={onReply} /> : null}
          {onEdit ? <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} /> : null}
          {onDelete ? <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} /> : null}
        </div>
      </div>
      </div>
    </div>
  </div>
  <Modal
    title={previewAttachment ? getAttachmentLabel(previewAttachment) : 'پیش‌نمایش تصویر'}
    open={Boolean(previewAttachment)}
    onCancel={() => setPreviewAttachment(null)}
    footer={[
      <Button key="close" onClick={() => setPreviewAttachment(null)}>
        بستن
      </Button>,
      <Button
        key="download"
        type="primary"
        icon={<DownloadOutlined />}
        disabled={!previewAttachment}
        onClick={() => {
          if (!previewAttachment) return;
          downloadAttachment(previewAttachment);
        }}
      >
        دانلود فایل اصلی
      </Button>,
    ]}
    width={820}
    zIndex={1700}
    destroyOnHidden
  >
    {previewAttachment ? (
      <div className="flex max-h-[72vh] items-center justify-center overflow-auto rounded-md bg-gray-50 p-2 dark:bg-black/20">
        <ResilientImage
          src={previewAttachment.url}
          preset="gallery"
          alt={getAttachmentLabel(previewAttachment)}
          className="max-h-[68vh] max-w-full object-contain"
        />
      </div>
    ) : null}
  </Modal>
  </>
);
};

export default SharedNoteCard;
