import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Badge, Button, Input, Modal, Popover } from 'antd';
import { DeleteOutlined, EditOutlined, LeftOutlined, LinkOutlined, PlusOutlined, SearchOutlined, SnippetsOutlined, TeamOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { parseNoteContent, serializeNoteContent } from '../../utils/noteContent';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AdaptiveScopePicker from '../messaging/AdaptiveScopePicker';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';
import ConversationTimeline from './ConversationTimeline';
import UnreadCountBadge, { NOTIFICATION_UNREAD_BADGE_COLOR } from './UnreadCountBadge';

type NotesPanelProps = {
  layout: 'desktop' | 'mobile';
  context: Record<string, any>;
};

const NotesPanel: React.FC<NotesPanelProps> = ({ layout, context }) => {
  const {
    displayedChatNotes,
    notes,
    loadingNotes,
    isSelectedConversationLoaded,
    noteViewportReady,
    selectedChatGroup,
    selectedNoteConversationListItem,
    selectedNoteUser,
    activeConversationRoleLabel,
    myNoteStats,
    setEditingGroup,
    setGroupNameDraft,
    setGroupMemberDrafts,
    setGroupModalOpen,
    noteUserSearch,
    setNoteUserSearch,
    setMobileNoteSearchOpen,
    setSelectedNoteUserId,
    selectedNoteUserId,
    SYSTEM_MESSAGES_USER_ID,
    systemConversationAvatar,
    effectiveSystemNoteStats,
    UnifiedConversationAvatar,
    visibleNoteConversations,
    buildNoteConversationAvatarModel,
    systemAvatarSrc,
    selectedNoteConversationAvatar,
    profile,
    setChatGroups,
    noteMessageSearchOpen,
    normalizedNoteMessageSearch,
    setNoteMessageSearchOpen,
    setNoteMessageSearch,
    noteMessageSearch,
    notesScrollContainerRef,
    handleNotesScroll,
    selectedConversationHasMoreBefore,
    loadingOlderSelectedConversationNotes,
    loadOlderSelectedConversationNotes,
    myNotesHasMoreBefore,
    loadOlderMyNotes,
    recordTitleMap,
    formatRecordLabel,
    isSystemNote,
    directoryUserMap,
    authorNameMap,
    roleLookup,
    normalizeReadReceipts,
    normalizeLikeReceipts,
    isUnreadNoteRow,
    likeReceiptMapFromBox,
    resolveNoteBubbleAvatar,
    shouldAnimateChatEntry,
    renderReadReceiptStatus,
    editingNoteId,
    editingNoteValue,
    setNotes,
    setSelectedConversationNotes,
    refreshNoteConversationSummaries,
    refreshUnreadSummary,
    setEditingNoteId,
    setEditingNoteValue,
    setNoteReplyTo,
    setNoteModuleId,
    setNoteRecordId,
    openForwardModal,
    toggleNoteLike,
    message,
    handleClose,
    noteNewIncomingCount,
    noteShouldStickToBottomRef,
    noteForceScrollToBottomRef,
    setNoteNewIncomingCount,
    scrollNotesToBottom,
    noteModuleId,
    noteRecordId,
    moduleOptions,
    noteRecordOptions,
    handleNoteScopeModuleChange,
    handleNoteScopeRecordChange,
    noteText,
    handleNoteTextChange,
    submitNote,
    noteSending,
    mentionOptions,
    mentionValues,
    setMentionValues,
    noteMentionPickerOpen,
    setNoteMentionPickerOpen,
    noteAttachments,
    setNoteAttachments,
    noteLinkedAttachments,
    setNoteLinkedAttachments,
    noteSmsNotificationEnabled,
    setNoteSmsNotificationEnabled,
    openReadyTextsModal,
    mobileNoteSearchOpen,
    noteReplyTo,
    scrollMessageIntoView,
    openCreateActivityFromMessage,
    setNoteViewportReady,
    noteInitialAnchorDoneRef,
  } = context;

  const withUserSidebar = layout === 'desktop';
  const withMobileUserRail = layout === 'mobile';
  const data: any[] = displayedChatNotes;

  const noteMap = useMemo(() => {
    const map = new Map(notes.map((note: any) => [note.id, note]));
    data.forEach((note: any) => { map.set(note.id, note); });
    return map;
  }, [data, notes]);

  const showConversationSkeleton = loadingNotes || !isSelectedConversationLoaded;
  const hideConversationUntilSettled = !showConversationSkeleton && !noteViewportReady;
  const panelTitle = selectedChatGroup?.name || selectedNoteConversationListItem?.displayName || (selectedNoteUser ? selectedNoteUser.display_name : 'یادداشت‌های من');
  const panelSubtitle = selectedChatGroup || selectedNoteUser
    ? activeConversationRoleLabel
    : `${toPersianNumber(String(myNoteStats.noteCount || 0))} یادداشت`;

  const activeConversationClass = 'border border-[rgba(var(--brand-500-rgb),0.34)] bg-[rgba(var(--brand-500-rgb),0.14)] text-[rgb(var(--brand-900-rgb))] shadow-[inset_3px_0_0_rgba(var(--brand-500-rgb),0.72),0_6px_18px_rgba(var(--brand-500-rgb),0.12)] dark:border-[rgba(var(--brand-300-rgb),0.38)] dark:bg-[rgba(var(--brand-300-rgb),0.16)] dark:text-white dark:shadow-[inset_3px_0_0_rgba(var(--brand-300-rgb),0.72)]';
  const inactiveConversationClass = 'border border-transparent text-gray-700 hover:bg-white/80 dark:text-gray-200 dark:hover:bg-white/[0.055]';
  const activeRailClass = 'bg-[rgba(var(--brand-500-rgb),0.14)] shadow-[inset_0_0_0_1px_rgba(var(--brand-500-rgb),0.22)] dark:bg-[rgba(var(--brand-300-rgb),0.15)] dark:shadow-[inset_0_0_0_1px_rgba(var(--brand-300-rgb),0.24)]';
  const inactiveRailClass = 'hover:bg-white/75 dark:hover:bg-white/5';

  // ─── Conversation list virtualizers ────────────────────────────────────────
  // Desktop sidebar: "my notes" + "system" + visibleNoteConversations
  const convListRef = useRef<HTMLDivElement>(null);
  const allConvItems = useMemo(() => [
    { type: 'my-notes' as const },
    { type: 'system' as const },
    ...visibleNoteConversations.map((item: any) => ({ type: 'conv' as const, item })),
  ], [visibleNoteConversations]);

  const convVirtualizer = useVirtualizer({
    count: allConvItems.length,
    getScrollElement: () => convListRef.current,
    estimateSize: (i) => i === 0 ? 44 : 60,
    overscan: 6,
  });

  // Mobile rail: same items
  const railListRef = useRef<HTMLDivElement>(null);
  const railVirtualizer = useVirtualizer({
    count: allConvItems.length,
    getScrollElement: () => railListRef.current,
    estimateSize: (i) => i === 0 ? 60 : 72,
    overscan: 6,
  });

  // ─── Initial anchor scroll ──────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (noteViewportReady) return;
    if (!isSelectedConversationLoaded || data.length === 0) return;
    const container = notesScrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = false;
    if (noteInitialAnchorDoneRef) noteInitialAnchorDoneRef.current = true;
    setNoteViewportReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectedConversationLoaded, noteViewportReady, data.length]);

  // Stick-to-bottom when new messages arrive
  useLayoutEffect(() => {
    if (!noteViewportReady) return;
    if (data.length === 0) return;
    const container = notesScrollContainerRef.current;
    if (!container) return;
    if (noteForceScrollToBottomRef.current || noteShouldStickToBottomRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      noteForceScrollToBottomRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, noteViewportReady]);

  // ─── Render helpers ─────────────────────────────────────────────────────────
  const renderConvItem = (listItem: typeof allConvItems[number]) => {
    if (listItem.type === 'my-notes') {
      return (
        <button
          type="button"
          onClick={() => { setMobileNoteSearchOpen(false); setSelectedNoteUserId(null); }}
          className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${!selectedNoteUserId ? activeConversationClass : inactiveConversationClass}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">یادداشت‌های من</span>
            <span className="text-[11px] text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
          </div>
        </button>
      );
    }
    if (listItem.type === 'system') {
      return (
        <button
          type="button"
          onClick={() => { setMobileNoteSearchOpen(false); setSelectedNoteUserId(SYSTEM_MESSAGES_USER_ID); }}
          className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? activeConversationClass : inactiveConversationClass}`}
        >
          <div className="flex items-center gap-3">
            <UnifiedConversationAvatar size={36} src={systemConversationAvatar.src} className={systemConversationAvatar.className} fallback={systemConversationAvatar.fallback} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">پیام‌های سیستم</div>
              <div className="text-[11px] text-gray-400">
                {effectiveSystemNoteStats.noteCount > 0 ? `${toPersianNumber(String(effectiveSystemNoteStats.noteCount))} پیام` : 'بدون پیام'}
              </div>
            </div>
            <UnreadCountBadge count={effectiveSystemNoteStats.unreadCount} className="h-5" />
          </div>
        </button>
      );
    }
    // type === 'conv'
    const { item } = listItem;
    const avatar = buildNoteConversationAvatarModel({ kind: item.kind, displayName: item.displayName, avatarUrl: item.avatarUrl, systemAvatarSrc });
    return (
      <button
        type="button"
        onClick={() => { setMobileNoteSearchOpen(false); setSelectedNoteUserId(item.id); }}
        className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${selectedNoteUserId === item.id ? activeConversationClass : inactiveConversationClass}`}
      >
        <div className="flex items-center gap-3">
          <UnifiedConversationAvatar size={36} src={avatar.src} className={avatar.className} fallback={avatar.fallback} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium flex items-center gap-1.5">
              <span>{item.displayName}</span>
              {item.isGroup ? <TeamOutlined className="text-[11px] text-amber-500" /> : null}
            </div>
            <div className="text-[11px] text-gray-400">
              {item.noteCount > 0 ? `${toPersianNumber(String(item.noteCount))} پیام` : 'بدون پیام'}
            </div>
          </div>
          <UnreadCountBadge count={item.unreadCount} className="h-5" />
        </div>
      </button>
    );
  };

  const renderRailItem = (listItem: typeof allConvItems[number]) => {
    if (listItem.type === 'my-notes') {
      return (
        <button
          type="button"
          onClick={() => setSelectedNoteUserId(null)}
          className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${!selectedNoteUserId ? activeRailClass : inactiveRailClass}`}
        >
          <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-[10px] font-bold ${!selectedNoteUserId ? 'border-[rgba(var(--brand-500-rgb),0.24)] bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white' : 'border-slate-200/45 bg-white/70 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-gray-200'}`}>من</div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
        </button>
      );
    }
    if (listItem.type === 'system') {
      return (
        <button
          type="button"
          onClick={() => setSelectedNoteUserId(SYSTEM_MESSAGES_USER_ID)}
          className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? activeRailClass : inactiveRailClass}`}
          title="پیام‌های سیستم"
        >
          <div className="relative">
            <Badge count={effectiveSystemNoteStats.unreadCount > 0 ? toPersianNumber(String(effectiveSystemNoteStats.unreadCount)) : 0} size="small" offset={[-2, 2]} color={NOTIFICATION_UNREAD_BADGE_COLOR}>
              <UnifiedConversationAvatar size={38} src={systemConversationAvatar.src} className={`${selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''} ${systemConversationAvatar.className || ''}`.trim()} fallback={systemConversationAvatar.fallback} />
            </Badge>
          </div>
          <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">سیستم</span>
        </button>
      );
    }
    // type === 'conv'
    const { item } = listItem;
    const avatar = buildNoteConversationAvatarModel({ kind: item.kind, displayName: item.displayName, avatarUrl: item.avatarUrl, systemAvatarSrc });
    return (
      <button
        type="button"
        onClick={() => setSelectedNoteUserId(item.id)}
        className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${selectedNoteUserId === item.id ? activeRailClass : inactiveRailClass}`}
        title={item.displayName}
      >
        <div className="relative">
          <Badge count={item.unreadCount > 0 ? toPersianNumber(String(item.unreadCount)) : 0} size="small" offset={[-2, 2]} color={NOTIFICATION_UNREAD_BADGE_COLOR}>
            <UnifiedConversationAvatar size={38} src={avatar.src} className={`${selectedNoteUserId === item.id ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''} ${avatar.className || ''}`.trim()} fallback={avatar.fallback} />
          </Badge>
          <span className="absolute -left-1 bottom-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] text-[rgb(var(--brand-700-rgb))] shadow-sm dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)] dark:text-[rgb(var(--brand-300-rgb))]">
            {item.isGroup ? <TeamOutlined /> : <LeftOutlined />}
          </span>
        </div>
        <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">{item.displayName}</span>
      </button>
    );
  };

  return (
    <div dir="ltr" className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">

      {/* ── Desktop conversation sidebar ─────────────────────────────────── */}
      {withUserSidebar ? (
        <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-gray-600 dark:text-gray-300">گفتگوها</div>
              <Button size="small" shape="circle" icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); setGroupNameDraft(''); setGroupMemberDrafts([]); setGroupModalOpen(true); }} />
            </div>
            <Input size="small" allowClear value={noteUserSearch} onChange={(e) => setNoteUserSearch(e.target.value)} placeholder="جستجوی گفتگو" prefix={<SearchOutlined className="text-gray-400" />} className="mt-2" />
          </div>
          {/* Virtualized list */}
          <div ref={convListRef} className="overflow-y-auto h-[calc(100%-72px)] px-2 py-2">
            <div style={{ height: `${convVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
              {convVirtualizer.getVirtualItems().map((vItem) => (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={convVirtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)`, paddingBottom: 4 }}
                >
                  {renderConvItem(allConvItems[vItem.index])}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden bg-white/82 dark:bg-[#1a1518]">

        {/* Header */}
        <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {selectedChatGroup || selectedNoteUser ? (
                <UnifiedConversationAvatar size={withMobileUserRail ? 32 : 36} src={selectedNoteConversationAvatar.src} className={selectedNoteConversationAvatar.className} fallback={selectedNoteConversationAvatar.fallback} />
              ) : null}
              <div className="min-w-0">
                <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{panelTitle}</div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{panelSubtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {selectedChatGroup ? (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingGroup(selectedChatGroup); setGroupNameDraft(selectedChatGroup.name); setGroupMemberDrafts([...(selectedChatGroup.user_ids || []).map((id: any) => `user:${id}`), ...(selectedChatGroup.role_ids || []).map((id: any) => `role:${id}`)]); setGroupModalOpen(true); }} />
                  {selectedChatGroup.created_by === String(profile.id || '') ? (
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
                      Modal.confirm({
                        title: 'حذف گروه', content: 'این گفتگو حذف شود؟', okText: 'حذف', cancelText: 'انصراف', okButtonProps: { danger: true },
                        onOk: async () => {
                          const { error } = await supabase.from('chat_groups').delete().eq('id', selectedChatGroup.id);
                          if (error) throw error;
                          setChatGroups((prev: any[]) => prev.filter((g: any) => g.id !== selectedChatGroup.id));
                          setSelectedNoteUserId(null);
                        },
                      });
                    }} />
                  ) : null}
                </>
              ) : null}
              <Button size="small" type={noteMessageSearchOpen || normalizedNoteMessageSearch ? 'primary' : 'default'} icon={<SearchOutlined />} onClick={() => { setNoteMessageSearchOpen((prev: any) => { if (prev) setNoteMessageSearch(''); return !prev; }); }} />
            </div>
          </div>
          {noteMessageSearchOpen ? (
            <Input size="small" allowClear autoFocus value={noteMessageSearch} onChange={(e) => setNoteMessageSearch(e.target.value)} placeholder={selectedChatGroup || selectedNoteUser ? 'جستجو در پیام‌های این گفتگو' : 'جستجو در یادداشت‌های من'} prefix={<SearchOutlined className="text-gray-400" />} className="mt-2" />
          ) : null}
        </div>

        {/* ── Virtualized message thread ───────────────────────────────── */}
        <ConversationTimeline
          containerRef={notesScrollContainerRef}
          onScroll={handleNotesScroll}
          layoutPaddingClass={withUserSidebar ? 'px-3 py-3' : 'px-2 py-2'}
          hideUntilSettled={hideConversationUntilSettled}
          loading={showConversationSkeleton}
          emptyDescription={normalizedNoteMessageSearch ? 'پیامی با این جستجو پیدا نشد' : 'پیامی یافت نشد'}
          hasMoreBefore={selectedNoteUserId ? selectedConversationHasMoreBefore : myNotesHasMoreBefore}
          loadingOlder={loadingOlderSelectedConversationNotes}
          onLoadOlder={() => (selectedNoteUserId ? loadOlderSelectedConversationNotes() : loadOlderMyNotes())}
        >
          {data.map((note: any) => {
                  if (!note) return null;
                  const recordKey = `${note.module_id}:${note.record_id}`;
                  const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id, module_id: note.module_id }, note.module_id);
                  const isSystem = isSystemNote(note);
                  const isAi = String(note?.source_type || '').trim() === 'ai' || String(note?.metadata?.source_type || '').trim() === 'ai';
                  const isMine = !isSystem && note.author_id && profile.id && note.author_id === profile.id;
                  const author = directoryUserMap[String(note.author_id || '')];
                  const authorName = isAi ? 'دستیار هوشمند' : (isSystem ? 'پیام‌های سیستم' : (isMine ? 'شما' : (note.author_name || author?.display_name || authorNameMap[note.author_id] || 'کاربر سیستم')));
                  const replyTarget: any = note.reply_to ? noteMap.get(note.reply_to) : null;
                  const replyParsedContent = replyTarget ? parseNoteContent(replyTarget.content) : null;
                  const replyAuthorName = replyTarget
                    ? (replyTarget.author_id && profile.id && replyTarget.author_id === profile.id ? 'شما' : (replyTarget.author_name || directoryUserMap[String(replyTarget.author_id || '')]?.display_name || authorNameMap[replyTarget.author_id] || 'کاربر سیستم'))
                    : null;
                  const parsedContent = parseNoteContent(note.content);
                  const mentionUsers = (note.mention_user_ids || []).map((id: string) => directoryUserMap[String(id)]?.display_name || id);
                  const mentionRoles = (note.mention_role_ids || []).map((id: string) => roleLookup[String(id)] || 'نقش');
                  const noteReadReceipts = normalizeReadReceipts(note.metadata);
                  const noteLikeReceipts = normalizeLikeReceipts(note.metadata);
                  const isUnreadNote = isUnreadNoteRow(note);
                  const likedByMe = Boolean(likeReceiptMapFromBox(note.metadata)[String(profile.id || '').trim()]);
                  const noteAvatar = resolveNoteBubbleAvatar(note, Boolean(isMine), isSystem);

                  return (
                    <div
                      key={String(note.id)}
                      data-note-id={note.id}
                    >
                      <SharedNoteCard
                        authorName={authorName}
                        createdAtLabel={safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}
                        text={parsedContent.text}
                        attachments={parsedContent.attachments}
                        avatarUrl={noteAvatar.src}
                        avatarFallback={noteAvatar.fallback}
                        avatarClassName={noteAvatar.className}
                        mentionUsers={mentionUsers}
                        mentionRoles={mentionRoles}
                        replyText={replyParsedContent?.text || null}
                        replyAuthorName={replyAuthorName}
                        replyAttachments={replyParsedContent?.attachments || []}
                        onReplyPreviewClick={replyTarget ? () => scrollMessageIntoView(`note-message-${String(replyTarget.id)}`) : undefined}
                        messageDomId={`note-message-${String(note.id)}`}
                        isMine={Boolean(isMine)}
                        animateOnMount={shouldAnimateChatEntry(note.created_at)}
                        variant="default"
                        renderTemplateBold={isSystem}
                        statusNode={renderReadReceiptStatus(noteReadReceipts, noteLikeReceipts)}
                        unreadIndicator={isUnreadNote}
                        likeCount={noteLikeReceipts.length}
                        likedByMe={likedByMe}
                        isEdited={Boolean(note.is_edited)}
                        isEditing={editingNoteId === note.id}
                        editingValue={editingNoteValue}
                        onEditingChange={setEditingNoteValue}
                        onSaveEdit={async () => {
                          if (!editingNoteValue.trim()) return;
                          const nextContent = serializeNoteContent(editingNoteValue, parsedContent.attachments);
                          await supabase.from('notes').update({ content: nextContent, is_edited: true }).eq('id', note.id);
                          setNotes((prev: any[]) => prev.map((n: any) => (n.id === note.id ? { ...n, content: nextContent, is_edited: true } : n)));
                          setEditingNoteId(null);
                          setEditingNoteValue('');
                        }}
                        onCancelEdit={() => { setEditingNoteId(null); setEditingNoteValue(''); }}
                        onReply={() => { setNoteReplyTo(note.id); setNoteModuleId(note.module_id || null); setNoteRecordId(note.record_id || null); }}
                        onForward={() => openForwardModal(note)}
                        onCreateActivity={openCreateActivityFromMessage ? () => openCreateActivityFromMessage({
                          channel: isAi ? 'ai' : 'internal',
                          actorName: authorName,
                          createdAt: note.created_at,
                          createdAtLabel: safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm'),
                          content: parsedContent.text,
                          attachments: parsedContent.attachments,
                          relatedModuleId: note.module_id || null,
                          relatedRecordId: note.record_id || null,
                        }) : undefined}
                        onLike={!isSystem ? () => {
                          void toggleNoteLike(note).catch((error: any) => {
                            console.warn('Could not toggle note like', error);
                            message.error(toFaErrorMessage(error, 'ثبت پسندیدن پیام ناموفق بود.'));
                          });
                        } : undefined}
                        onEdit={isMine ? () => { setEditingNoteId(note.id); setEditingNoteValue(parsedContent.text || ''); } : undefined}
                        onDelete={isMine ? () => {
                          Modal.confirm({
                            title: 'حذف پیام',
                            content: 'این پیام حذف شود؟',
                            okText: 'حذف',
                            cancelText: 'انصراف',
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              const noteId = String(note.id || '').trim();
                              const { error } = await supabase
                                .from('notes')
                                .delete()
                                .eq('id', noteId)
                                .eq('author_id', String(profile.id || '').trim());
                              if (error) throw error;
                              setNotes((prev: any[]) => prev.filter((n: any) => String(n.id) !== noteId));
                              setSelectedConversationNotes?.((prev: any[]) => prev.filter((n: any) => String(n.id) !== noteId));
                              await Promise.all([
                                refreshNoteConversationSummaries?.(),
                                refreshUnreadSummary?.(),
                              ]);
                            },
                          });
                        } : undefined}
                        footer={note.module_id && note.record_id ? (
                          <span>رکورد مرتبط:{' '}<Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>{recordTitle}</Link></span>
                        ) : null}
                      />
                    </div>
                  );
                })}
        </ConversationTimeline>

        {/* New messages indicator */}
        {selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID && noteNewIncomingCount > 0 ? (
          <div className="pb-1 text-center">
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-slate-300/45 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-slate-200"
              onClick={() => {
                noteShouldStickToBottomRef.current = true;
                noteForceScrollToBottomRef.current = true;
                setNoteNewIncomingCount(0);
                scrollNotesToBottom('auto');
              }}
            >
              +{toPersianNumber(String(noteNewIncomingCount))} پیام جدید
            </button>
          </div>
        ) : null}

        {/* Composer */}
        <SharedNoteComposer
          value={noteText}
          onChange={handleNoteTextChange}
          onSubmit={submitNote}
          submitLoading={noteSending}
          placeholder={
            selectedNoteUserId === SYSTEM_MESSAGES_USER_ID
              ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.'
              : selectedChatGroup
                ? `پیام به گروه ${selectedChatGroup.name}...`
                : (selectedNoteUser ? `پیام به ${selectedNoteUser.display_name}...` : 'یادداشت جدید...')
          }
          mentionOptions={mentionOptions}
          mentionValues={mentionValues}
          onMentionChange={setMentionValues}
          mentionPickerOpen={noteMentionPickerOpen}
          onToggleMentionPicker={() => setNoteMentionPickerOpen((prev: boolean) => !prev)}
          attachments={noteAttachments}
          onFilesSelected={(files) => setNoteAttachments(files)}
          linkedAttachments={noteLinkedAttachments}
          onLinkedAttachmentsSelected={(newAttachments) => {
            setNoteLinkedAttachments((prev: any[]) => {
              const map = new Map(prev.map((a: any) => [String(a.url || ''), a]));
              newAttachments.forEach((attachment) => {
                const url = String(attachment.url || '').trim();
                if (url) map.set(url, attachment);
              });
              return Array.from(map.values());
            });
          }}
          onRemoveLinkedAttachment={(url: string) => {
            setNoteLinkedAttachments((prev: any[]) => prev.filter((a: any) => String(a.url || '') !== String(url || '')));
          }}
          filePickerModuleId={noteModuleId}
          filePickerRecordId={noteRecordId}
          replyActive={Boolean(noteReplyTo)}
          onClearReply={() => setNoteReplyTo(null)}
          smsNotificationEnabled={noteSmsNotificationEnabled}
          onSmsNotificationChange={setNoteSmsNotificationEnabled}
          enableImagePasteAndDrop
          submitDisabled={noteSending || selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || (!noteText.trim() && noteAttachments.length === 0 && noteLinkedAttachments.length === 0)}
          extraActions={(
            <>
              <Popover trigger="click" placement="topLeft" content={(
                <div className="w-[320px] max-w-[78vw]">
                  <div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-200">اتصال به رکورد</div>
                  <AdaptiveScopePicker moduleId={noteModuleId} recordId={noteRecordId} moduleOptions={moduleOptions} recordOptions={noteRecordOptions} onModuleChange={handleNoteScopeModuleChange} onRecordChange={handleNoteScopeRecordChange} compact={false} disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID} />
                </div>
              )}>
                <Button type={noteModuleId || noteRecordId ? 'primary' : 'text'} size="small" icon={<LinkOutlined />} disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID} />
              </Popover>
              <Button type="text" size="small" icon={<SnippetsOutlined />} onClick={() => openReadyTextsModal('notes')} />
            </>
          )}
        />
      </div>

      {/* ── Mobile conversation rail ─────────────────────────────────────── */}
      {withMobileUserRail ? (
        <div dir="rtl" className="w-[54px] shrink-0 overflow-hidden border-l border-slate-200/45 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.025]">
          <div className="flex h-full flex-col items-center gap-0 overflow-hidden">
            {/* Sticky top controls */}
            <div className="sticky top-0 z-10 flex w-full flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 bg-white/60 dark:bg-white/[0.025]">
              <Popover trigger="click" placement="leftTop" open={mobileNoteSearchOpen} onOpenChange={setMobileNoteSearchOpen} content={(
                <Input size="small" allowClear autoFocus value={noteUserSearch} onChange={(e) => setNoteUserSearch(e.target.value)} placeholder="جستجوی چت" prefix={<SearchOutlined className="text-gray-400" />} className="w-[170px]" />
              )}>
                <Button type={noteUserSearch ? 'primary' : 'default'} shape="circle" size="small" icon={<SearchOutlined />} className="shadow-sm" />
              </Popover>
              <Button type="default" shape="circle" size="small" icon={<PlusOutlined />} className="shadow-sm" onClick={() => { setEditingGroup(null); setGroupNameDraft(''); setGroupMemberDrafts([]); setGroupModalOpen(true); }} />
            </div>
            {/* Virtualized rail */}
            <div ref={railListRef} className="overflow-y-auto overflow-x-hidden w-full flex-1 px-1 pb-1.5">
              <div style={{ height: `${railVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                {railVirtualizer.getVirtualItems().map((vItem) => (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={railVirtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)`, paddingBottom: 2 }}
                  >
                    {renderRailItem(allConvItems[vItem.index])}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(NotesPanel);
