import React from 'react';
import { Badge, Button, Empty, Input, Modal, Popover, Skeleton } from 'antd';
import { DeleteOutlined, EditOutlined, LeftOutlined, LinkOutlined, PlusOutlined, SearchOutlined, SnippetsOutlined, TeamOutlined, UpOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { parseNoteContent, serializeNoteContent } from '../../utils/noteContent';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AdaptiveScopePicker from '../messaging/AdaptiveScopePicker';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';

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
  } = context;
    const withUserSidebar = layout === 'desktop';
    const withMobileUserRail = layout === 'mobile';
    const data = displayedChatNotes;
    const noteMap = React.useMemo(() => {
      const map = new Map(notes.map((note: any) => [note.id, note]));
      data.forEach((note: any) => {
        map.set(note.id, note);
      });
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

    return (
      <div dir="ltr" className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-[rgba(var(--brand-50-rgb),0.16)] dark:bg-[#151113]">
        {withUserSidebar ? (
          <div dir="rtl" className="order-last w-[208px] border-l border-slate-200/55 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="px-4 py-3 border-b border-slate-200/45 bg-white/55 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-600 dark:text-gray-300">گفتگوها</div>
                <Button
                  size="small"
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupNameDraft('');
                    setGroupMemberDrafts([]);
                    setGroupModalOpen(true);
                  }}
                />
              </div>
              <Input
                size="small"
                allowClear
                value={noteUserSearch}
                onChange={(event) => setNoteUserSearch(event.target.value)}
                placeholder="جستجوی گفتگو"
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            </div>
            <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMobileNoteSearchOpen(false);
                  setSelectedNoteUserId(null);
                }}
                className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                  !selectedNoteUserId
                    ? activeConversationClass
                    : inactiveConversationClass
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">یادداشت‌های من</span>
                  <span className="text-[11px] text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNoteSearchOpen(false);
                  setSelectedNoteUserId((prev: any) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID));
                }}
                className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                  selectedNoteUserId === SYSTEM_MESSAGES_USER_ID
                    ? activeConversationClass
                    : inactiveConversationClass
                }`}
              >
                <div className="flex items-center gap-3">
                  <UnifiedConversationAvatar
                    size={36}
                    src={systemConversationAvatar.src}
                    className={systemConversationAvatar.className}
                    fallback={systemConversationAvatar.fallback}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">پیام‌های سیستم</div>
                    <div className="text-[11px] text-gray-400">
                      {effectiveSystemNoteStats.noteCount > 0 ? `${toPersianNumber(String(effectiveSystemNoteStats.noteCount))} پیام` : 'بدون پیام'}
                    </div>
                  </div>
                  {effectiveSystemNoteStats.unreadCount > 0 ? (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {toPersianNumber(String(effectiveSystemNoteStats.unreadCount))}
                    </span>
                  ) : null}
                </div>
              </button>
              {visibleNoteConversations.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMobileNoteSearchOpen(false);
                    setSelectedNoteUserId((prev: any) => (prev === item.id ? null : item.id));
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                    selectedNoteUserId === item.id
                      ? activeConversationClass
                      : inactiveConversationClass
                  }`}
                >
                  {(() => {
                    const avatar = buildNoteConversationAvatarModel({
                      kind: item.kind,
                      displayName: item.displayName,
                      avatarUrl: item.avatarUrl,
                      systemAvatarSrc,
                    });
                    return (
                      <div className="flex items-center gap-3">
                        <UnifiedConversationAvatar
                          size={36}
                          src={avatar.src}
                          className={avatar.className}
                          fallback={avatar.fallback}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium flex items-center gap-1.5">
                            <span>{item.displayName}</span>
                            {item.isGroup ? <TeamOutlined className="text-[11px] text-amber-500" /> : null}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {item.noteCount > 0 ? `${toPersianNumber(String(item.noteCount))} پیام` : 'بدون پیام'}
                          </div>
                        </div>
                        {item.unreadCount > 0 ? (
                          <span className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${item.isGroup ? 'bg-amber-500' : 'bg-red-500'}`}>
                            {toPersianNumber(String(item.unreadCount))}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden bg-white/82 dark:bg-[#1a1518]">
          <div className="border-b border-slate-200/45 bg-white/88 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                {selectedChatGroup || selectedNoteUser ? (
                  <UnifiedConversationAvatar
                    size={withMobileUserRail ? 32 : 36}
                    src={selectedNoteConversationAvatar.src}
                    className={selectedNoteConversationAvatar.className}
                    fallback={selectedNoteConversationAvatar.fallback}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate px-0.5 text-[13px] font-bold text-gray-800 dark:text-gray-100">{panelTitle}</div>
                  <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{panelSubtitle}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selectedChatGroup && selectedChatGroup.created_by === String(profile.id || '') ? (
                  <>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingGroup(selectedChatGroup);
                        setGroupNameDraft(selectedChatGroup.name);
                        setGroupMemberDrafts([
                          ...(selectedChatGroup.user_ids || []).map((id: any) => `user:${id}`),
                          ...(selectedChatGroup.role_ids || []).map((id: any) => `role:${id}`),
                        ]);
                        setGroupModalOpen(true);
                      }}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: 'حذف گروه',
                          content: 'این گفتگو حذف شود؟',
                          okText: 'حذف',
                          cancelText: 'انصراف',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            const { error } = await supabase.from('chat_groups').delete().eq('id', selectedChatGroup.id);
                            if (error) throw error;
                            setChatGroups((prev: any[]) => prev.filter((group: any) => group.id !== selectedChatGroup.id));
                            setSelectedNoteUserId(null);
                          },
                        });
                      }}
                    />
                  </>
                ) : null}
                <Button
                  size="small"
                  type={noteMessageSearchOpen || normalizedNoteMessageSearch ? 'primary' : 'default'}
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setNoteMessageSearchOpen((prev: any) => {
                      if (prev) {
                        setNoteMessageSearch('');
                      }
                      return !prev;
                    });
                  }}
                />
              </div>
            </div>
            {noteMessageSearchOpen ? (
              <Input
                size="small"
                allowClear
                autoFocus
                value={noteMessageSearch}
                onChange={(event) => setNoteMessageSearch(event.target.value)}
                placeholder={selectedChatGroup || selectedNoteUser ? 'جستجو در پیام‌های این گفتگو' : 'جستجو در یادداشت‌های من'}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            ) : null}
          </div>

          <div
            ref={notesScrollContainerRef}
            onScroll={handleNotesScroll}
            className={`flex-1 overflow-y-auto ${withUserSidebar ? 'px-3 py-3' : 'px-2 py-2'} space-y-2.5 bg-[rgba(var(--brand-50-rgb),0.14)] dark:bg-black/[0.10] ${hideConversationUntilSettled ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}
          >
            {showConversationSkeleton ? (
              <div className="space-y-3">
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ) : data.length === 0 ? (
              <Empty description={normalizedNoteMessageSearch ? 'پیامی با این جستجو پیدا نشد' : 'پیامی یافت نشد'} />
            ) : (
              <>
                {(selectedNoteUserId ? selectedConversationHasMoreBefore : myNotesHasMoreBefore) ? (
                  <div className="flex justify-center pb-2">
                    <Button
                      type="text"
                      size="small"
                      icon={<UpOutlined />}
                      loading={selectedNoteUserId ? loadingOlderSelectedConversationNotes : false}
                      onClick={() => selectedNoteUserId ? void loadOlderSelectedConversationNotes() : loadOlderMyNotes()}
                      className="text-xs text-gray-400 hover:!text-gray-600 dark:text-gray-500 dark:hover:!text-gray-300"
                    >
                      مشاهده پیام‌های قبلی
                    </Button>
                  </div>
                ) : null}
                {data.map((note: any) => {
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
                  ? (
                    replyTarget.author_id && profile.id && replyTarget.author_id === profile.id
                      ? 'شما'
                      : (
                        replyTarget.author_name
                        || directoryUserMap[String(replyTarget.author_id || '')]?.display_name
                        || authorNameMap[replyTarget.author_id]
                        || 'کاربر سیستم'
                      )
                  )
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
                  <div key={note.id}>
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
                      onCancelEdit={() => {
                        setEditingNoteId(null);
                        setEditingNoteValue('');
                      }}
                      onReply={() => {
                        setNoteReplyTo(note.id);
                        setNoteModuleId(note.module_id || null);
                        setNoteRecordId(note.record_id || null);
                      }}
                      onForward={() => openForwardModal(note)}
                      onLike={!isSystem ? () => {
                        void toggleNoteLike(note).catch((error: any) => {
                          console.warn('Could not toggle note like', error);
                          message.error(toFaErrorMessage(error, 'ثبت پسندیدن پیام ناموفق بود.'));
                        });
                      } : undefined}
                      onEdit={isMine ? () => {
                        setEditingNoteId(note.id);
                        setEditingNoteValue(parsedContent.text || '');
                      } : undefined}
                      onDelete={isMine ? async () => {
                        await supabase.from('notes').delete().eq('id', note.id);
                        setNotes((prev: any[]) => prev.filter((n: any) => n.id !== note.id));
                      } : undefined}
                      footer={note.module_id && note.record_id ? (
                        <span>
                          رکورد مرتبط:{' '}
                          <Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>
                            {recordTitle}
                          </Link>
                        </span>
                      ) : null}
                    />
                  </div>
                );
                })}
              </>
            )}
          </div>
          {selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID && noteNewIncomingCount > 0 ? (
            <div className="pb-1 text-center">
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-slate-300/45 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-slate-200"
                onClick={() => {
                  noteShouldStickToBottomRef.current = true;
                  noteForceScrollToBottomRef.current = true;
                  setNoteNewIncomingCount(0);
                  scrollNotesToBottom('smooth');
                }}
              >
                +{toPersianNumber(String(noteNewIncomingCount))} پیام جدید
              </button>
            </div>
          ) : null}

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
            onMentionChange={(values) => setMentionValues(values || [])}
            mentionPickerOpen={noteMentionPickerOpen}
            onToggleMentionPicker={() => setNoteMentionPickerOpen((prev: any) => !prev)}
            attachments={noteAttachments}
            linkedAttachments={noteLinkedAttachments}
            onFilesSelected={(files) => {
              setNoteAttachments((prev: File[]) => {
                const map = new Map(prev.map((file: File) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
                files.forEach((file: File) => {
                  map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveAttachment={(fileName) => {
              setNoteAttachments((prev: File[]) => prev.filter((file: File) => file.name !== fileName));
            }}
            onLinkedAttachmentsSelected={(attachments) => {
              setNoteLinkedAttachments((prev: any[]) => {
                const map = new Map(prev.map((attachment: any) => [String(attachment.url || ''), attachment]));
                attachments.forEach((attachment: any) => {
                  const url = String(attachment.url || '').trim();
                  if (url) map.set(url, attachment);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveLinkedAttachment={(url) => {
              setNoteLinkedAttachments((prev: any[]) => prev.filter((attachment: any) => String(attachment.url || '') !== String(url || '')));
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
                <Popover
                  trigger="click"
                  placement="topLeft"
                  content={(
                    <div className="w-[320px] max-w-[78vw]">
                      <div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-200">اتصال به رکورد</div>
                      <AdaptiveScopePicker
                        moduleId={noteModuleId}
                        recordId={noteRecordId}
                        moduleOptions={moduleOptions}
                        recordOptions={noteRecordOptions}
                        onModuleChange={handleNoteScopeModuleChange}
                        onRecordChange={handleNoteScopeRecordChange}
                        compact={false}
                        disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
                      />
                    </div>
                  )}
                >
                  <Button
                    type={noteModuleId || noteRecordId ? 'primary' : 'text'}
                    size="small"
                    icon={<LinkOutlined />}
                    disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
                  />
                </Popover>
                <Button
                  type="text"
                  size="small"
                  icon={<SnippetsOutlined />}
                  onClick={() => openReadyTextsModal('notes')}
                />
              </>
            )}
          />
        </div>
        {withMobileUserRail ? (
          <div dir="rtl" className="w-[54px] shrink-0 overflow-hidden border-l border-slate-200/45 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.025]">
            <div className="flex h-full flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1 py-1.5">
              <div className="sticky top-0 z-10 flex w-full justify-center">
                <Popover
                  trigger="click"
                  placement="leftTop"
                  open={mobileNoteSearchOpen}
                  onOpenChange={setMobileNoteSearchOpen}
                  content={(
                    <Input
                      size="small"
                      allowClear
                      autoFocus
                      value={noteUserSearch}
                      onChange={(event) => setNoteUserSearch(event.target.value)}
                      placeholder="جستجوی چت"
                      prefix={<SearchOutlined className="text-gray-400" />}
                      className="w-[170px]"
                    />
                  )}
                >
                  <Button
                    type={noteUserSearch ? 'primary' : 'default'}
                    shape="circle"
                    size="small"
                    icon={<SearchOutlined />}
                    className="shadow-sm"
                  />
                </Popover>
              </div>
              <div className="sticky top-9 z-10 flex w-full justify-center">
                <Button
                  type="default"
                  shape="circle"
                  size="small"
                  icon={<PlusOutlined />}
                  className="shadow-sm"
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupNameDraft('');
                    setGroupMemberDrafts([]);
                    setGroupModalOpen(true);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedNoteUserId(null)}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${!selectedNoteUserId ? activeRailClass : inactiveRailClass}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-[10px] font-bold ${
                  !selectedNoteUserId
                    ? 'border-[rgba(var(--brand-500-rgb),0.24)] bg-[rgba(var(--brand-500-rgb),0.08)] text-[rgb(var(--brand-800-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--brand-500-rgb),0.12)] dark:text-white'
                    : 'border-slate-200/45 bg-white/70 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-gray-200'
                }`}>
                  من
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{toPersianNumber(String(myNoteStats.noteCount || 0))}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedNoteUserId((prev: any) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID))}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? activeRailClass : inactiveRailClass}`}
                title="پیام‌های سیستم"
              >
                <div className="relative">
                  <Badge count={effectiveSystemNoteStats.unreadCount > 0 ? toPersianNumber(String(effectiveSystemNoteStats.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                    <UnifiedConversationAvatar
                      size={38}
                      src={systemConversationAvatar.src}
                      className={`${selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''} ${systemConversationAvatar.className || ''}`.trim()}
                      fallback={systemConversationAvatar.fallback}
                    />
                  </Badge>
                </div>
                <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                  سیستم
                </span>
              </button>

              {visibleNoteConversations.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedNoteUserId((prev: any) => (prev === item.id ? null : item.id))}
                  className={`flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors ${selectedNoteUserId === item.id ? activeRailClass : inactiveRailClass}`}
                  title={item.displayName}
                >
                  {(() => {
                    const avatar = buildNoteConversationAvatarModel({
                      kind: item.kind,
                      displayName: item.displayName,
                      avatarUrl: item.avatarUrl,
                      systemAvatarSrc,
                    });
                    return (
                      <div className="relative">
                        <Badge count={item.unreadCount > 0 ? toPersianNumber(String(item.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                          <UnifiedConversationAvatar
                            size={38}
                            src={avatar.src}
                            className={`${selectedNoteUserId === item.id ? 'ring-2 ring-[rgba(var(--brand-500-rgb),0.42)] ring-offset-2 ring-offset-white dark:ring-[rgba(var(--brand-300-rgb),0.55)] dark:ring-offset-[#151113]' : ''} ${avatar.className || ''}`.trim()}
                            fallback={avatar.fallback}
                          />
                        </Badge>
                        <span className="absolute -left-1 bottom-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] text-[rgb(var(--brand-700-rgb))] shadow-sm dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)] dark:text-[rgb(var(--brand-300-rgb))]">
                          {item.isGroup ? <TeamOutlined /> : <LeftOutlined />}
                        </span>
                      </div>
                    );
                  })()}
                  <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                    {item.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );};

export default React.memo(NotesPanel);
