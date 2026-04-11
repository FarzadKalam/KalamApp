import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Avatar, Badge, Button, Drawer, Empty, Input, List, Modal, Popover, Select, Skeleton, Tabs } from 'antd';
import { BellOutlined, PlusOutlined, UserOutlined, TeamOutlined, EnterOutlined, CloseOutlined, EditOutlined, DeleteOutlined, CheckOutlined, ReloadOutlined, SearchOutlined, LeftOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../utils/assigneeValue';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { supportsModuleAssignee } from '../utils/assigneeSupport';
import QrScanPopover from './QrScanPopover';
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import { parseNoteTemplateTextSegments } from '../utils/noteTemplateText';
import { uploadNoteAttachments } from '../utils/noteAttachments';
import { normalizeNoteScope } from '../utils/noteScope';
import { FieldType } from '../types';
import { resolveTaskSourceLink } from '../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../utils/taskUpdateRuntime';
import TaskSummaryCard from './tasks/TaskSummaryCard';
import SharedNoteCard from './notes/SharedNoteCard';
import SharedNoteComposer from './notes/SharedNoteComposer';
import RenderCardItem from './moduleList/RenderCardItem';
import RelatedRecordPopover from './RelatedRecordPopover';
import ProductionStagesField from './ProductionStagesField';
import { NOTES_UPDATED_EVENT } from '../utils/aiAssistantEvents';
import { getRecordTitle } from '../utils/recordTitle';
import { getTaskStatusLabel } from '../utils/processTaskStatusOptions';
import { setUiNotificationOverlayItems } from '../utils/uiNotificationOverlayStore';
import { insertNotesWithFallback, sendNoteSmsNotifications } from '../utils/noteDispatch';

interface NotificationsPopoverProps {
  isMobile: boolean;
}

const MAX_ITEMS = 10;
const NOTIFICATIONS_CACHE_TTL_MS = 45_000;
const SEEN_NOTES_STORAGE_KEY = 'notif_seen_notes_v1';
const SEEN_TASKS_STORAGE_KEY = 'notif_seen_tasks_v1';
const SEEN_RESP_STORAGE_KEY = 'notif_seen_responsibilities_v1';
const SEEN_COMPLETED_TASKS_STORAGE_KEY = 'notif_seen_completed_tasks_v1';
const DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY = 'notif_dismissed_ui_v1';
const ASSIGNEE_QUERY_MODE_CACHE = new Map<string, 'primary' | 'id_only' | 'none'>();
type NotificationSectionKey = 'notes' | 'tasks' | 'responsibilities';
type CreatedSortDirection = 'desc' | 'asc';
const SYSTEM_MESSAGES_USER_ID = '__system_messages__';
const CHAT_GROUP_PREFIX = 'group:';
const NOTE_SELECT_FIELDS = 'id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to, source_type, metadata, is_edited, edited_at';
type ChatGroupRow = {
  id: string;
  org_id: string | null;
  name: string;
  user_ids: string[];
  role_ids: string[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationListItem = {
  id: string;
  kind: 'system' | 'direct' | 'group';
  displayName: string;
  avatarUrl?: string | null;
  noteCount: number;
  unreadCount: number;
  latestMessageAt: number;
  roleLabel?: string | null;
  userId?: string | null;
  groupId?: string | null;
  isGroup?: boolean;
};

type UiNotificationItem = {
  id: string;
  kind: 'note' | 'task' | 'responsibility';
  title: string;
  body: string;
  createdAt: string | null;
  hasAttachments?: boolean;
  note?: any;
  task?: any;
  responsibility?: any;
};

const loadSeenSet = (key: string) => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item: any) => String(item)));
  } catch {
    return new Set<string>();
  }
};

const persistSeenSet = (key: string, values: Set<string>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    // ignore storage errors
  }
};

const resolveOptionLabel = (value: any, options?: { label: string; value: any }[]) => {
  if (!options?.length) return null;
  const found = options.find(opt => String(opt.value) === String(value));
  return found?.label || null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formatBadgeCount = (count: number) => (count ? toPersianNumber(count) : 0);

const TASK_VIEW_PRESETS = [
  { key: 'all', label: 'همه فعالیت‌ها' },
  { key: 'overdue', label: 'سررسیدگذشته‌ها' },
  { key: 'in_progress', label: 'در حال انجام' },
  { key: 'upcoming', label: 'فعالیت‌های پیش‌رو' },
] as const;

const STATUS_LABEL_FALLBACKS: Record<string, string> = {
  todo: 'انجام نشده',
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  completed: 'تکمیل شده',
  canceled: 'لغو شده',
};

const resolveStatusLabelFallback = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return STATUS_LABEL_FALLBACKS[normalized] || String(value || '').trim();
};

const RESPONSIBILITY_REALTIME_TABLES = Array.from(
  new Set(
    Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && mod?.id !== 'notes' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod))
      .map((mod: any) => String(mod.table || mod.id))
      .filter(Boolean)
  )
);

type TaskViewPresetKey = typeof TASK_VIEW_PRESETS[number]['key'];

const formatRecordLabel = (row: any, moduleId?: string | null) => {
  if (!row) return '';
  const moduleConfig = moduleId ? MODULES[String(moduleId)] : row?.module_id ? MODULES[String(row.module_id)] : undefined;
  const resolvedTitle = getRecordTitle(row, moduleConfig, { fallback: '' });
  const primary = resolvedTitle || row.full_name || row.name || row.title || row.system_code || row.id;
  const code = row.system_code && primary !== row.system_code ? ` - ${row.system_code}` : '';
  const label = `${primary || row.id}`;
  if ((label === row.id || !primary) && UUID_REGEX.test(String(row.id || label))) {
    return row.system_code || 'رکورد';
  }
  return `${label}${code}`;
};

const isChatGroupSelection = (value: string | null | undefined) =>
  String(value || '').startsWith(CHAT_GROUP_PREFIX);

const getChatGroupSelectionId = (value: string | null | undefined) =>
  isChatGroupSelection(value) ? String(value).slice(CHAT_GROUP_PREFIX.length) : null;

const isMissingColumnError = (error: any, columnName: string) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const col = columnName.toLowerCase();
  return (
    message.includes(`column "${col}"`) ||
    message.includes(`${col} does not exist`) ||
    message.includes(`could not find the '${col}' column`) ||
    message.includes(`could not find the "${col}" column`) ||
    message.includes(`schema cache`) && message.includes(col)
  );
};

const normalizeRoleRows = (rows: any[]) =>
  (rows || []).map((row: any) => ({
    id: row?.id,
    title: String(row?.title || row?.name || row?.id || '').trim(),
  }));

const getNoteMentionUserIds = (note: any) =>
  Array.isArray(note?.mention_user_ids)
    ? note.mention_user_ids.map((id: string) => String(id))
    : [];

const isSystemNote = (note: any) =>
  String(note?.source_type || '').trim() === 'system'
  || String(note?.metadata?.source_type || '').trim() === 'system'
  || Boolean(note?.metadata?.workflow_id || note?.metadata?.automation_rule_id || note?.metadata?.process_automation_rule_id);

const isDirectConversationNote = (
  note: any,
  currentUserId: string,
  otherUserId: string,
  noteLookup?: Map<string, any>,
) => {
  if (!currentUserId || !otherUserId) return false;
  if (String(note?.metadata?.chat_group_id || '').trim()) return false;

  const authorId = String(note?.author_id || '').trim();
  const mentionUserIds = getNoteMentionUserIds(note);
  const isDirectMention = (
    (authorId === otherUserId && mentionUserIds.includes(currentUserId))
    || (authorId === currentUserId && mentionUserIds.includes(otherUserId))
  );

  if (isDirectMention) return true;
  if (!noteLookup || !note?.reply_to) return false;

  const replyTarget = noteLookup.get(String(note.reply_to));
  if (!replyTarget) return false;
  if (String(replyTarget?.metadata?.chat_group_id || '').trim()) return false;

  const replyAuthorId = String(replyTarget?.author_id || '').trim();
  const replyMentionUserIds = getNoteMentionUserIds(replyTarget);

  return (
    (authorId === otherUserId && replyAuthorId === currentUserId)
    || (authorId === currentUserId && replyAuthorId === otherUserId)
    || (authorId === otherUserId && replyMentionUserIds.includes(currentUserId))
    || (authorId === currentUserId && replyMentionUserIds.includes(otherUserId))
  );
};

const renderTemplateAwareText = (value: string, enableBold: boolean) => {
  if (!enableBold) return value;
  const segments = parseNoteTemplateTextSegments(value);
  if (segments.length === 0) return value;
  return segments.map((segment, index) => (
    segment.bold ? (
      <strong key={`${index}-${segment.text}`} className="font-bold">
        {segment.text}
      </strong>
    ) : (
      <React.Fragment key={`${index}-${segment.text}`}>
        {segment.text}
      </React.Fragment>
    )
  ));
};

const buildDirectoryMaps = async () => {
  const directory = await fetchAssigneeDirectory(supabase);
  return {
    userNameMap: directory.users.reduce<Record<string, string>>((acc, user) => {
      acc[user.id] = user.display_name || user.id;
      return acc;
    }, {}),
    roleTitleMap: directory.roles.reduce<Record<string, string>>((acc, role) => {
      acc[role.id] = role.title || role.id;
      return acc;
    }, {}),
  };
};

const shouldPauseNotesPolling = (error: any) => {
  if (!error) return false;
  const status = Number(error?.status || 0);
  if (status >= 500) return true;
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST301' || code === 'PGRST302') return true;
  return false;
};

const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({ isMobile }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [responsibilities, setResponsibilities] = useState<any[]>([]);
  const [showMore, setShowMore] = useState({ notes: false, tasks: false, responsibilities: false });
  const [taskViewKey, setTaskViewKey] = useState<TaskViewPresetKey>('all');
  const [taskSortDirection, setTaskSortDirection] = useState<CreatedSortDirection>('desc');
  const [profile, setProfile] = useState<{ id: string | null; role_id: string | null }>({ id: null, role_id: null });
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});
  const [createdByNameMap, setCreatedByNameMap] = useState<Record<string, string>>({});
  const [directoryUsers, setDirectoryUsers] = useState<Array<{ id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>>([]);
  const [directoryRoles, setDirectoryRoles] = useState<Array<{ id: string; title: string }>>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroupRow[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChatGroupRow | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberDrafts, setGroupMemberDrafts] = useState<string[]>([]);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [noteModuleId, setNoteModuleId] = useState<string | null>(null);
  const [noteRecordId, setNoteRecordId] = useState<string | null>(null);
  const [noteRecordOptions, setNoteRecordOptions] = useState<{ label: string; value: string }[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteReplyTo, setNoteReplyTo] = useState<string | null>(null);
  const [noteAttachments, setNoteAttachments] = useState<File[]>([]);
  const [noteSmsNotificationEnabled, setNoteSmsNotificationEnabled] = useState(false);
  const [selectedNoteUserId, setSelectedNoteUserId] = useState<string | null>(null);
  const [noteUserSearch, setNoteUserSearch] = useState('');
  const [noteMessageSearch, setNoteMessageSearch] = useState('');
  const [noteMentionPickerOpen, setNoteMentionPickerOpen] = useState(false);
  const [noteMessageSearchOpen, setNoteMessageSearchOpen] = useState(false);
  const [mobileNoteSearchOpen, setMobileNoteSearchOpen] = useState(false);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [forwardingNote, setForwardingNote] = useState<any | null>(null);
  const [forwardTargetUserIds, setForwardTargetUserIds] = useState<string[]>([]);
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [desktopActiveKey, setDesktopActiveKey] = useState<'notes' | 'tasks' | 'responsibilities'>('tasks');
  const [mobileActiveKey, setMobileActiveKey] = useState<'notes' | 'tasks' | 'responsibilities'>('tasks');
  const [responsibilityViewKey, setResponsibilityViewKey] = useState('all');
  const [responsibilitySortDirection, setResponsibilitySortDirection] = useState<CreatedSortDirection>('desc');
  const [previewRecord, setPreviewRecord] = useState<{ moduleId: string; recordId: string; label?: string } | null>(null);
  const [taskProcessModalTask, setTaskProcessModalTask] = useState<any | null>(null);
  const [taskProcessHostKey, setTaskProcessHostKey] = useState(0);
  const [selectedConversationNotes, setSelectedConversationNotes] = useState<any[] | null>(null);
  const [seenNoteIds, setSeenNoteIds] = useState<Set<string>>(() => loadSeenSet(SEEN_NOTES_STORAGE_KEY));
  const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_TASKS_STORAGE_KEY));
  const [seenResponsibilityIds, setSeenResponsibilityIds] = useState<Set<string>>(() => loadSeenSet(SEEN_RESP_STORAGE_KEY));
  const [seenCompletedTaskIds, setSeenCompletedTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY));
  const [dismissedUiNotificationIds, setDismissedUiNotificationIds] = useState<Set<string>>(() => loadSeenSet(DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY));
  const [uiNotifications, setUiNotifications] = useState<UiNotificationItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingResponsibilities, setLoadingResponsibilities] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const prevNotesRef = useRef<Set<string>>(new Set());
  const prevTasksRef = useRef<Set<string>>(new Set());
  const prevResponsibilitiesRef = useRef<Set<string>>(new Set());
  const notificationsReadyRef = useRef(false);
  const notesPollingPausedRef = useRef(false);
  const notesPollingPauseLoggedRef = useRef(false);
  const mobileDrawerHistoryActiveRef = useRef(false);
  const notesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const noteShouldStickToBottomRef = useRef(true);
  const noteForceScrollToBottomRef = useRef(false);
  const lastLoadedAtRef = useRef<Record<NotificationSectionKey, number>>({
    notes: 0,
    tasks: 0,
    responsibilities: 0,
  });
  const liveRefreshTimerRef = useRef<number | null>(null);
  const realtimeDisabledRef = useRef(false);
  const refreshAllRef = useRef<((notify?: boolean, options?: { force?: boolean }) => Promise<void>) | null>(null);
  const notificationSoundWindowRef = useRef<{ startedAt: number; plays: number }>({ startedAt: 0, plays: 0 });

  const tasksConfig = MODULES['tasks'];
  const statusOptions = tasksConfig?.fields?.find((f: any) => f.key === 'status')?.options || [];
  const priorityOptions = tasksConfig?.fields?.find((f: any) => f.key === 'priority')?.options || [];
  const toNumber = (value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const moduleOptions = Object.values(MODULES)
    .filter((mod: any) => mod?.id && (mod?.table || mod?.id))
    .map((mod: any) => ({ label: mod.titles?.fa || mod.id, value: mod.id }));

  useEffect(() => {
    const loadProfile = async () => {
      const snapshot = await fetchSessionBootstrap(supabase);
      if (!snapshot.user?.id) return;
      setProfile({ id: snapshot.user.id, role_id: snapshot.roleId || null });
    };
    loadProfile();
  }, []);

  useEffect(() => {
    persistSeenSet(SEEN_NOTES_STORAGE_KEY, seenNoteIds);
  }, [seenNoteIds]);

  useEffect(() => {
    persistSeenSet(SEEN_TASKS_STORAGE_KEY, seenTaskIds);
  }, [seenTaskIds]);

  useEffect(() => {
    persistSeenSet(SEEN_RESP_STORAGE_KEY, seenResponsibilityIds);
  }, [seenResponsibilityIds]);

  useEffect(() => {
    persistSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY, seenCompletedTaskIds);
  }, [seenCompletedTaskIds]);

  useEffect(() => {
    persistSeenSet(DISMISSED_UI_NOTIFICATIONS_STORAGE_KEY, dismissedUiNotificationIds);
  }, [dismissedUiNotificationIds]);

  useEffect(() => {
    if (!profile.id) return;
    let cancelled = false;
    const loadChatGroups = async () => {
      const { data, error } = await supabase
        .from('chat_groups')
        .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) {
        if (!isMissingColumnError(error, 'user_ids')) {
          console.warn('Could not load chat groups', error);
        }
        if (!cancelled) setChatGroups([]);
        return;
      }

      const visibleGroups = (data || [])
        .map((row: any) => ({
          id: String(row?.id || ''),
          org_id: row?.org_id ? String(row.org_id) : null,
          name: String(row?.name || '').trim() || 'گروه',
          user_ids: Array.isArray(row?.user_ids) ? row.user_ids.map((id: any) => String(id)) : [],
          role_ids: Array.isArray(row?.role_ids) ? row.role_ids.map((id: any) => String(id)) : [],
          created_by: row?.created_by ? String(row.created_by) : null,
          created_at: row?.created_at ? String(row.created_at) : null,
          updated_at: row?.updated_at ? String(row.updated_at) : null,
        }))
        .filter((group: ChatGroupRow) => (
          group.created_by === String(profile.id || '')
          || group.user_ids.includes(String(profile.id || ''))
          || (profile.role_id ? group.role_ids.includes(String(profile.role_id)) : false)
        ));

      if (!cancelled) {
        setChatGroups(visibleGroups);
      }
    };
    void loadChatGroups();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.role_id]);

  useEffect(() => {
    return;
    if (!open) return;
    if (mentionOptions.length > 0) return;
    const loadMentions = async () => {
      const fetchRoles = async () => {
        const primary = await supabase
          .from('org_roles')
          .select('*')
          .limit(200);

        if (!primary.error) return normalizeRoleRows(primary.data || []);

        if (isMissingColumnError(primary.error, 'title')) {
          const byName = await supabase
            .from('org_roles')
            .select('*')
            .limit(200);
          if (!byName.error) return normalizeRoleRows(byName.data || []);

          const idOnly = await supabase.from('org_roles').select('*').limit(200);
          if (!idOnly.error) return normalizeRoleRows(idOnly.data || []);
        }

        return [] as Array<{ id: string; title: string }>;
      };

      const [{ data: profiles }, roles] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }).limit(200),
        fetchRoles(),
      ]);
      const opts = [
        ...(profiles || []).map((p: any) => ({ label: `عضو: ${p.full_name || p.id}`, value: `user:${p.id}` })),
        ...(roles || []).map((r: any) => ({ label: `نقش: ${r.title || r.id}`, value: `role:${r.id}` })),
      ];
      setMentionOptions(opts);
    };
    loadMentions();
  }, [mentionOptions.length, open]);

  useEffect(() => {
    if (!profile.id) return;
    if (!open && !groupModalOpen && !forwardingNote) return;
    let cancelled = false;
    const loadMentionDirectory = async () => {
      try {
        const directory = await fetchAssigneeDirectory(supabase);
        if (cancelled) return;
      setDirectoryUsers(directory.users || []);
      setDirectoryRoles(directory.roles || []);
      setMentionOptions([
        ...directory.users.map((user) => ({ label: `عضو: ${user.display_name || user.id}`, value: `user:${user.id}` })),
        ...directory.roles.map((role) => ({ label: `نقش: ${role.title || role.id}`, value: `role:${role.id}` })),
      ]);
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not load assignee directory in notifications', error);
        }
      }
    };
    void loadMentionDirectory();
    return () => {
      cancelled = true;
    };
  }, [Boolean(forwardingNote), groupModalOpen, open, profile.id]);

  useEffect(() => {
    const loadNoteRecords = async () => {
      if (!noteModuleId) {
        setNoteRecordOptions([]);
        return;
      }
      const mod = MODULES[noteModuleId];
      const table = mod?.table || noteModuleId;
      const { data } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      const options = (data || []).map((row: any) => ({
        label: formatRecordLabel(row),
        value: row.id,
      }));
      setNoteRecordOptions(options);
    };
    loadNoteRecords();
  }, [noteModuleId]);

  const buildRecordTitleMap = async (items: { module_id: string; record_id: string }[]) => {
    const grouped: Record<string, string[]> = {};
    items.forEach((item) => {
      if (!item.module_id || !item.record_id) return;
      grouped[item.module_id] = grouped[item.module_id] || [];
      if (!grouped[item.module_id].includes(item.record_id)) grouped[item.module_id].push(item.record_id);
    });

    if (Object.keys(grouped).length === 0) return;

    const map: Record<string, string> = {};
    await Promise.all(
      Object.entries(grouped).map(async ([moduleId, ids]) => {
        const config = MODULES[moduleId];
        const table = config?.table || moduleId;
        if (!table) return;
        const { data } = await supabase
          .from(table)
          .select('*')
          .in('id', ids);
        (data || []).forEach((row: any) => {
          map[`${moduleId}:${row.id}`] = getRecordTitle(row, config, { fallback: formatRecordLabel(row, moduleId) });
        });
      })
    );
    setRecordTitleMap((prev) => ({ ...prev, ...map }));
  };

  const fetchAssignedIdsForModule = async (table: string, userId: string, roleId: string | null) => {
    const mergeUniqueRows = (rows: any[]) => {
      const map = new Map<string, any>();
      (rows || []).forEach((row) => {
        if (!row?.id) return;
        map.set(String(row.id), row);
      });
      return Array.from(map.values());
    };

    const queryIds = async (query: any) => {
      const { data, error } = await query.limit(200);
      if (error) return { data: [] as any[], error };
      return { data: data || [], error: null };
    };

    const tryTypedQuery = async () => {
      const [userResult, roleTypedResult] = await Promise.all([
        queryIds(
          supabase
            .from(table)
            .select('id')
            .eq('assignee_type', 'user')
            .eq('assignee_id', userId)
        ),
        roleId
          ? queryIds(
              supabase
                .from(table)
                .select('id')
                .eq('assignee_type', 'role')
                .eq('assignee_role_id', roleId)
            )
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (userResult.error) {
        return { data: [] as any[], error: userResult.error };
      }

      if (roleTypedResult.error) {
        if (isMissingColumnError(roleTypedResult.error, 'assignee_role_id') && roleId) {
          const legacyRoleResult = await queryIds(
            supabase
              .from(table)
              .select('id')
              .eq('assignee_type', 'role')
              .eq('assignee_id', roleId)
          );
          if (legacyRoleResult.error) {
            return { data: [] as any[], error: legacyRoleResult.error };
          }
          return { data: mergeUniqueRows([...(userResult.data || []), ...(legacyRoleResult.data || [])]), error: null };
        }
        return { data: [] as any[], error: roleTypedResult.error };
      }

      return { data: mergeUniqueRows([...(userResult.data || []), ...(roleTypedResult.data || [])]), error: null };
    };

    const tryIdOnlyQuery = async () => {
      const [userResult, roleResult] = await Promise.all([
        queryIds(
          supabase
            .from(table)
            .select('id')
            .eq('assignee_id', userId)
        ),
        roleId
          ? queryIds(
              supabase
                .from(table)
                .select('id')
                .eq('assignee_id', roleId)
            )
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      const firstError = userResult.error || roleResult.error;
      if (firstError && !isMissingColumnError(firstError, 'assignee_id')) {
        return { data: [] as any[], error: firstError };
      }
      return { data: mergeUniqueRows([...(userResult.data || []), ...(roleResult.data || [])]), error: null };
    };

    const cachedMode = ASSIGNEE_QUERY_MODE_CACHE.get(table);
    if (cachedMode === 'none') return [];

    if (cachedMode === 'id_only') {
      const fallback = await tryIdOnlyQuery();
      if (!fallback.error) return fallback.data || [];
      if (isMissingColumnError(fallback.error, 'assignee_id')) {
        ASSIGNEE_QUERY_MODE_CACHE.set(table, 'none');
      }
      return [];
    }

    let result = await tryTypedQuery();
    if (!result.error) {
      ASSIGNEE_QUERY_MODE_CACHE.set(table, 'primary');
      return result.data || [];
    }

    if (isMissingColumnError(result.error, 'assignee_type')) {
      const fallback = await tryIdOnlyQuery();
      if (!fallback.error) {
        ASSIGNEE_QUERY_MODE_CACHE.set(table, 'id_only');
        return fallback.data || [];
      }
      if (isMissingColumnError(fallback.error, 'assignee_id')) {
        ASSIGNEE_QUERY_MODE_CACHE.set(table, 'none');
      }
      return [];
    }

    if (isMissingColumnError(result.error, 'assignee_id')) {
      ASSIGNEE_QUERY_MODE_CACHE.set(table, 'none');
      return [];
    }

    return result.data || [];
  };

  const getAssignedRecordPairs = async () => {
    if (!profile.id) return [] as { module_id: string; record_id: string }[];
    const userId = profile.id;
    const roleId = profile.role_id;

    const modules = Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod));

    const pairs: { module_id: string; record_id: string }[] = [];
    for (const mod of modules) {
      const table = mod.table || mod.id;
      const data = await fetchAssignedIdsForModule(table, userId, roleId);
      (data || []).forEach((row: any) => {
        pairs.push({ module_id: mod.id, record_id: row.id });
      });
    }
    return pairs;
  };

  const fetchNotes = async () => {
    if (!profile.id) return [];
    if (notesPollingPausedRef.current) return [];
    const userId = profile.id;
    const roleId = profile.role_id;

    const [{ data: mentionedUser, error: mentionedUserError }, { data: mentionedRole, error: mentionedRoleError }] = await Promise.all([
      supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .contains('mention_user_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(40),
      roleId
        ? supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .contains('mention_role_ids', [roleId])
            .order('created_at', { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    const firstError = mentionedUserError || mentionedRoleError;
    if (shouldPauseNotesPolling(firstError)) {
      notesPollingPausedRef.current = true;
      if (!notesPollingPauseLoggedRef.current) {
        notesPollingPauseLoggedRef.current = true;
        console.warn('Notes polling paused due to backend error.', firstError);
      }
      return [];
    }

    const { data: myNotes, error: myNotesError } = await supabase
      .from('notes')
      .select(NOTE_SELECT_FIELDS)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (shouldPauseNotesPolling(myNotesError)) {
      notesPollingPausedRef.current = true;
      if (!notesPollingPauseLoggedRef.current) {
        notesPollingPauseLoggedRef.current = true;
        console.warn('Notes polling paused due to backend error.', myNotesError);
      }
      return [];
    }
    const myNoteIds = (myNotes || []).map((n: any) => n.id);

    let replyNotes: any[] = [];
    if (myNoteIds.length) {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_SELECT_FIELDS)
        .in('reply_to', myNoteIds)
        .order('created_at', { ascending: false })
        .limit(40);
      if (shouldPauseNotesPolling(error)) {
        notesPollingPausedRef.current = true;
        if (!notesPollingPauseLoggedRef.current) {
          notesPollingPauseLoggedRef.current = true;
          console.warn('Notes polling paused due to backend error.', error);
        }
        return [];
      }
      replyNotes = data || [];
    }

    const withTimeout = async <T,>(promise: Promise<T>, fallback: T, timeoutMs = 1200) => {
      let timeoutId: number | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    const assignedPairs = await withTimeout(getAssignedRecordPairs(), [] as { module_id: string; record_id: string }[]);
    const grouped: Record<string, string[]> = {};
    assignedPairs.forEach((item) => {
      if (!item.module_id || !item.record_id) return;
      grouped[item.module_id] = grouped[item.module_id] || [];
      if (!grouped[item.module_id].includes(item.record_id)) grouped[item.module_id].push(item.record_id);
    });
    const assignedNotes: any[] = [];
    await withTimeout(Promise.all(
      Object.entries(grouped).map(async ([moduleId, ids]) => {
        const { data, error } = await supabase
          .from('notes')
          .select(NOTE_SELECT_FIELDS)
          .eq('module_id', moduleId)
          .in('record_id', ids)
          .order('created_at', { ascending: false })
          .limit(40);
        if (shouldPauseNotesPolling(error)) {
          notesPollingPausedRef.current = true;
          if (!notesPollingPauseLoggedRef.current) {
            notesPollingPauseLoggedRef.current = true;
            console.warn('Notes polling paused due to backend error.', error);
          }
          return;
        }
        if (data?.length) assignedNotes.push(...data);
      })
    ), [] as any[]);

    const merged = [...(mentionedUser || []), ...(mentionedRole || []), ...replyNotes, ...(myNotes || []), ...assignedNotes]
      .filter((note: any) => String(note?.source_type || '').trim() !== 'ai' && String(note?.metadata?.source_type || '').trim() !== 'ai');
    const uniq = new Map<string, any>();
    merged.forEach((note) => {
      uniq.set(note.id, note);
    });
    const result = Array.from(uniq.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    await buildRecordTitleMap(result.map((n) => ({ module_id: n.module_id, record_id: n.record_id })));
    const authorIds = Array.from(new Set(result.map((n: any) => n.author_id).filter(Boolean)));
    if (authorIds.length) {
      const { userNameMap } = await buildDirectoryMaps();
      const map = authorIds.reduce<Record<string, string>>((acc, authorId) => {
        acc[String(authorId)] = userNameMap[String(authorId)] || String(authorId);
        return acc;
      }, {});
      setAuthorNameMap(map);
    }
    return result;
  };

  const fetchTasks = async () => {
    if (!profile.id) return [];
    const userId = profile.id;
    const roleId = profile.role_id;
    const buildTasksQuery = () =>
      supabase
        .from('tasks')
        .select('id, name, status, priority, produced_qty, created_at, start_date, due_date, assignee_id, assignee_role_id, assignee_type, production_line_id, related_to_module, related_product, related_customer, related_supplier, related_production_order, related_invoice, purchase_invoice_id, project_id, marketing_lead_id, source_module_id, source_record_id')
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(50);

    const { data } = roleId
      ? await (async () => {
          const [userResult, roleTypedResult] = await Promise.all([
            buildTasksQuery().eq('assignee_type', 'user').eq('assignee_id', userId),
            buildTasksQuery().eq('assignee_type', 'role').eq('assignee_role_id', roleId),
          ]);
          if (!userResult.error && !roleTypedResult.error) {
            return { data: [...(userResult.data || []), ...(roleTypedResult.data || [])], error: null };
          }
          if (userResult.error && !isMissingColumnError(userResult.error, 'assignee_type') && !isMissingColumnError(userResult.error, 'assignee_id')) return userResult;
          if (roleTypedResult.error && !isMissingColumnError(roleTypedResult.error, 'assignee_role_id') && !isMissingColumnError(roleTypedResult.error, 'assignee_type') && !isMissingColumnError(roleTypedResult.error, 'assignee_id')) return roleTypedResult;
          const [legacyUserResult, legacyRoleResult] = await Promise.all([
            buildTasksQuery().eq('assignee_id', userId),
            buildTasksQuery().eq('assignee_id', roleId),
          ]);
          if (legacyUserResult.error && !isMissingColumnError(legacyUserResult.error, 'assignee_id')) return legacyUserResult;
          if (legacyRoleResult.error && !isMissingColumnError(legacyRoleResult.error, 'assignee_id')) return legacyRoleResult;
          return { data: [...(legacyUserResult.data || []), ...(legacyRoleResult.data || [])], error: null };
        })()
      : await buildTasksQuery().eq('assignee_type', 'user').eq('assignee_id', userId);
    const tasksList = (data || []).filter((task: any) => {
      const normalizedStatus = String(task?.status || '').toLowerCase();
      const isCompleted = normalizedStatus === 'done' || normalizedStatus === 'completed';
      if (isCompleted && seenCompletedTaskIds.has(String(task?.id || ''))) {
        return false;
      }
      return normalizedStatus !== 'canceled';
    });

    const relatedPairs: { module_id: string; record_id: string }[] = [];
    tasksList.forEach((task) => {
      const sourceLink = resolveTaskSourceLink(task);
      if (sourceLink.moduleId && sourceLink.recordId) {
        relatedPairs.push({ module_id: sourceLink.moduleId, record_id: sourceLink.recordId });
      }
    });
    const assigneeIds = Array.from(
      new Set(tasksList.filter((task: any) => task.assignee_type !== 'role').map((task: any) => task.assignee_id).filter(Boolean))
    );
    const roleIds = Array.from(
      new Set(tasksList.filter((task: any) => task.assignee_type === 'role').map((task: any) => task.assignee_role_id || task.assignee_id).filter(Boolean))
    );
    if (assigneeIds.length) {
      const { userNameMap } = await buildDirectoryMaps();
      const map = assigneeIds.reduce<Record<string, string>>((acc, assigneeId) => {
        acc[String(assigneeId)] = userNameMap[String(assigneeId)] || String(assigneeId);
        return acc;
      }, {});
      setAssigneeNameMap(map);
    }
    if (roleIds.length) {
      const { roleTitleMap } = await buildDirectoryMaps();
      const map = roleIds.reduce<Record<string, string>>((acc, roleLookupId) => {
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || String(roleLookupId);
        return acc;
      }, {});
      setRoleNameMap(map);
    }
    await buildRecordTitleMap(relatedPairs);
    return tasksList;
  };

  const fetchResponsibilities = async () => {
    if (!profile.id) return [];
    const userId = profile.id;
    const roleId = profile.role_id;

    const modules = Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id))
      .filter((mod: any) => supportsModuleAssignee(mod));

    const results: any[] = [];
    for (const mod of modules) {
      const table = mod.table || mod.id;
      const ids = await fetchAssignedIdsForModule(table, userId, roleId);
      const idList = (ids || []).map((row: any) => row.id).filter(Boolean);
      if (!idList.length) continue;
      const { data } = await supabase
        .from(table)
        .select('*')
        .in('id', idList)
        .order('created_at', { ascending: false })
        .limit(50);
      (data || []).forEach((row: any) => {
        results.push({
          ...row,
          module_id: mod.id,
          module_title: mod.titles?.fa || mod.id,
        });
      });
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const loadPeopleMaps = async (items: any[]) => {
    const assigneeIds = Array.from(
      new Set(items.filter((item: any) => item.assignee_type !== 'role').map((item: any) => item.assignee_id).filter(Boolean))
    );
    const roleIds = Array.from(
      new Set(items.filter((item: any) => item.assignee_type === 'role').map((item: any) => item.assignee_role_id || item.assignee_id).filter(Boolean))
    );
    const createdByIds = Array.from(new Set(items.map((i: any) => i.created_by || i.created_by_id).filter(Boolean)));
    const { userNameMap, roleTitleMap } = await buildDirectoryMaps();

    if (assigneeIds.length) {
      const map = assigneeIds.reduce<Record<string, string>>((acc, assigneeId) => {
        acc[String(assigneeId)] = userNameMap[String(assigneeId)] || String(assigneeId);
        return acc;
      }, {});
      setAssigneeNameMap((prev) => ({ ...prev, ...map }));
    }
    if (roleIds.length) {
      const map = roleIds.reduce<Record<string, string>>((acc, roleLookupId) => {
        acc[String(roleLookupId)] = roleTitleMap[String(roleLookupId)] || String(roleLookupId);
        return acc;
      }, {});
      setRoleNameMap((prev) => ({ ...prev, ...map }));
    }
    if (createdByIds.length) {
      const map = createdByIds.reduce<Record<string, string>>((acc, creatorId) => {
        acc[String(creatorId)] = userNameMap[String(creatorId)] || String(creatorId);
        return acc;
      }, {});
      setCreatedByNameMap((prev) => ({ ...prev, ...map }));
    }
  };

  const isSectionFresh = (section: NotificationSectionKey) => (
    Date.now() - lastLoadedAtRef.current[section] < NOTIFICATIONS_CACHE_TTL_MS
  );

  const safeSectionFetch = async <T,>(
    loader: () => Promise<T>,
    type: NotificationSectionKey,
    fallback: T,
  ) => {
    try {
      return await loader();
    } catch (error) {
      if (type === 'notes') {
        notesPollingPausedRef.current = true;
        if (!notesPollingPauseLoggedRef.current) {
          notesPollingPauseLoggedRef.current = true;
          console.warn('Notes polling paused due to network/CORS error.', error);
        }
      } else {
        console.warn(`Failed to fetch ${type}:`, error);
      }
      return fallback;
    }
  };

  const refreshSection = async (section: NotificationSectionKey, options?: { force?: boolean }) => {
    if (!profile.id) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!options?.force && isSectionFresh(section)) return;

    if (section === 'notes') {
      const showSkeleton = notes.length === 0;
      if (showSkeleton) setLoadingNotes(true);
      const notesData = await safeSectionFetch(() => fetchNotes(), 'notes', [] as any[]);
      setNotes(notesData);
      lastLoadedAtRef.current.notes = Date.now();
      if (showSkeleton) setLoadingNotes(false);
      return;
    }

    if (section === 'tasks') {
      const showSkeleton = tasks.length === 0;
      if (showSkeleton) setLoadingTasks(true);
      const tasksData = await safeSectionFetch(() => fetchTasks(), 'tasks', [] as any[]);
      setTasks(tasksData);
      lastLoadedAtRef.current.tasks = Date.now();
      const completedTaskIds = tasksData
        .filter((task: any) => {
          const normalizedStatus = String(task?.status || '').toLowerCase();
          return normalizedStatus === 'done' || normalizedStatus === 'completed';
        })
        .map((task: any) => String(task.id));
      if (completedTaskIds.length) {
        setSeenCompletedTaskIds((prev) => new Set([...prev, ...completedTaskIds]));
      }
      if (showSkeleton) setLoadingTasks(false);
      return;
    }

    const showSkeleton = responsibilities.length === 0;
    if (showSkeleton) setLoadingResponsibilities(true);
    const responsibilitiesData = await safeSectionFetch(() => fetchResponsibilities(), 'responsibilities', [] as any[]);
    setResponsibilities(responsibilitiesData);
    lastLoadedAtRef.current.responsibilities = Date.now();
    await buildRecordTitleMap(responsibilitiesData.map((r: any) => ({ module_id: r.module_id, record_id: r.id })));
    await loadPeopleMaps(responsibilitiesData);
    if (showSkeleton) setLoadingResponsibilities(false);
  };

  useEffect(() => {
    const handleNotesUpdated = () => {
      notesPollingPausedRef.current = false;
      notesPollingPauseLoggedRef.current = false;
      lastLoadedAtRef.current.notes = 0;
      void refreshSection('notes', { force: true });
    };
    window.addEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated);
    return () => window.removeEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated);
  }, [profile.id]);

  const refreshAll = async (notify = false, options?: { force?: boolean }) => {
    if (!profile.id) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    const cacheIsFresh = (Object.keys(lastLoadedAtRef.current) as NotificationSectionKey[]).every((key) => (
      now - lastLoadedAtRef.current[key] < NOTIFICATIONS_CACHE_TTL_MS
    ));
    if (!options?.force && cacheIsFresh) return;

    const showNotesSkeleton = notes.length === 0;
    const showTasksSkeleton = tasks.length === 0;
    const showResponsibilitiesSkeleton = responsibilities.length === 0;

    if (showNotesSkeleton) setLoadingNotes(true);
    if (showTasksSkeleton) setLoadingTasks(true);
    if (showResponsibilitiesSkeleton) setLoadingResponsibilities(true);
    const safeFetch = async <T,>(loader: () => Promise<T>, type: 'notes' | 'tasks' | 'responsibilities', fallback: T) => {
      try {
        return await loader();
      } catch (error) {
        if (type === 'notes') {
          notesPollingPausedRef.current = true;
          if (!notesPollingPauseLoggedRef.current) {
            notesPollingPauseLoggedRef.current = true;
            console.warn('Notes polling paused due to network/CORS error.', error);
          }
        } else {
          console.warn(`Failed to fetch ${type}:`, error);
        }
        return fallback;
      }
    };
    const [notesData, tasksData, responsibilitiesData] = await Promise.all([
      safeFetch(() => fetchNotes(), 'notes', [] as any[]),
      safeFetch(() => fetchTasks(), 'tasks', [] as any[]),
      safeFetch(() => fetchResponsibilities(), 'responsibilities', [] as any[]),
    ]);
    setNotes(notesData);
    setTasks(tasksData);
    setResponsibilities(responsibilitiesData);
    const loadedAt = Date.now();
    lastLoadedAtRef.current = {
      notes: loadedAt,
      tasks: loadedAt,
      responsibilities: loadedAt,
    };
    const completedTaskIds = tasksData
      .filter((task: any) => {
        const normalizedStatus = String(task?.status || '').toLowerCase();
        return normalizedStatus === 'done' || normalizedStatus === 'completed';
      })
      .map((task: any) => String(task.id));
    if (completedTaskIds.length) {
      setSeenCompletedTaskIds((prev) => new Set([...prev, ...completedTaskIds]));
    }
    await buildRecordTitleMap(responsibilitiesData.map((r: any) => ({ module_id: r.module_id, record_id: r.id })));
    await loadPeopleMaps(responsibilitiesData);
    if (showNotesSkeleton) setLoadingNotes(false);
    if (showTasksSkeleton) setLoadingTasks(false);
    if (showResponsibilitiesSkeleton) setLoadingResponsibilities(false);

    if (notify && !notificationsReadyRef.current) {
      notificationsReadyRef.current = true;
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      notesPollingPausedRef.current = false;
      notesPollingPauseLoggedRef.current = false;
      await refreshAll(false, { force: true });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  const activeDrawerSection = isMobile ? mobileActiveKey : desktopActiveKey;

  useEffect(() => {
    if (open) {
      void refreshSection(activeDrawerSection);
    }
  }, [activeDrawerSection, open, profile.id]);

  useEffect(() => {
    if (!profile.id) return;
    const interval = setInterval(() => {
      if (open) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshAll(true, { force: true });
    }, 20000);
    return () => clearInterval(interval);
  }, [open, profile.id, profile.role_id]);

  useEffect(() => {
    if (!profile.id) return;
    if (realtimeDisabledRef.current) return;
    const currentUserId = String(profile.id || '').trim();
    const currentRoleId = String(profile.role_id || '').trim();
    if (!currentUserId) return;

    const hasAssigneeMatch = (row: any) => {
      if (!row || typeof row !== 'object') return false;
      const assigneeType = String(row.assignee_type || '').trim().toLowerCase();
      const assigneeId = String(row.assignee_id || '').trim();
      const assigneeRoleId = String(row.assignee_role_id || '').trim();
      if (assigneeType === 'user') return assigneeId === currentUserId;
      if (assigneeType === 'role') {
        if (!currentRoleId) return false;
        return assigneeRoleId === currentRoleId || assigneeId === currentRoleId;
      }
      return (
        assigneeId === currentUserId
        || (!!currentRoleId && (assigneeRoleId === currentRoleId || assigneeId === currentRoleId))
      );
    };

    const normalizeIdArray = (value: any): string[] => {
      if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
      if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
        return value
          .replace(/^\{|\}$/g, '')
          .split(',')
          .map((item) => String(item || '').replace(/"/g, '').trim())
          .filter(Boolean);
      }
      return [];
    };

    const hasNoteMatch = (row: any) => {
      if (!row || typeof row !== 'object') return false;
      const authorId = String(row.author_id || '').trim();
      if (authorId === currentUserId) return true;
      const mentionUserIds = normalizeIdArray(row.mention_user_ids);
      if (mentionUserIds.includes(currentUserId)) return true;
      if (currentRoleId) {
        const mentionRoleIds = normalizeIdArray(row.mention_role_ids);
        if (mentionRoleIds.includes(currentRoleId)) return true;
      }
      return false;
    };

    const scheduleLiveRefresh = () => {
      if (liveRefreshTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(liveRefreshTimerRef.current);
      }
      if (typeof window === 'undefined') {
        void refreshAllRef.current?.(true, { force: true });
        return;
      }
      liveRefreshTimerRef.current = window.setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void refreshAllRef.current?.(true, { force: true });
      }, 400);
    };

    const channel = supabase.channel(`notifications-live-${currentUserId}-${currentRoleId || 'none'}`);

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, (payload: any) => {
        if (hasNoteMatch(payload?.new)) scheduleLiveRefresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, (payload: any) => {
        if (hasNoteMatch(payload?.new) || hasNoteMatch(payload?.old)) scheduleLiveRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload: any) => {
        if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload: any) => {
        if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh();
      });

    RESPONSIBILITY_REALTIME_TABLES.forEach((table) => {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload: any) => {
          if (hasAssigneeMatch(payload?.new)) scheduleLiveRefresh();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (payload: any) => {
          if (hasAssigneeMatch(payload?.new) || hasAssigneeMatch(payload?.old)) scheduleLiveRefresh();
        });
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeDisabledRef.current = true;
        void supabase.removeChannel(channel);
      }
    });

    return () => {
      if (liveRefreshTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.role_id]);

  const notesCount = notes.filter((n: any) => !seenNoteIds.has(String(n.id))).length;
  const tasksCount = tasks.filter((t: any) => !seenTaskIds.has(String(t.id))).length;
  const responsibilitiesCount = responsibilities.filter((r: any) => !seenResponsibilityIds.has(String(r.id))).length;
  const totalCount = notesCount + tasksCount + responsibilitiesCount;
  const filteredTasks = useMemo(() => {
    const parseTime = (value: any) => {
      if (!value) return null;
      const date = new Date(value);
      const time = date.getTime();
      return Number.isNaN(time) ? null : time;
    };
    const sortRows = (rows: any[], direction: CreatedSortDirection) => (
      [...rows].sort((a: any, b: any) => {
        const aTime = parseTime(a?.created_at) ?? 0;
        const bTime = parseTime(b?.created_at) ?? 0;
        return direction === 'asc' ? aTime - bTime : bTime - aTime;
      })
    );
    const now = Date.now();
    const normalized = [...tasks];
    const isDone = (task: any) => {
      const status = String(task?.status || '').toLowerCase();
      return status === 'done' || status === 'completed';
    };
    const isCanceled = (task: any) => String(task?.status || '').toLowerCase() === 'canceled';

    const next = normalized.filter((task: any) => {
      if (isCanceled(task)) return false;
      const dueAt = parseTime(task?.due_date);
      switch (taskViewKey) {
        case 'overdue':
          return !isDone(task)
            && String(task?.status || '').toLowerCase() !== 'in_progress'
            && dueAt !== null
            && dueAt < now;
        case 'in_progress':
          return String(task?.status || '').toLowerCase() === 'in_progress';
        case 'upcoming':
          return !isDone(task)
            && String(task?.status || '').toLowerCase() !== 'in_progress'
            && dueAt !== null
            && dueAt >= now;
        case 'all':
        default:
          return true;
      }
    });

    next.sort((a: any, b: any) => {
      const dueA = parseTime(a?.due_date);
      const dueB = parseTime(b?.due_date);
      const startA = parseTime(a?.start_date);
      const startB = parseTime(b?.start_date);
      const createdA = parseTime(a?.created_at) || 0;
      const createdB = parseTime(b?.created_at) || 0;

      if (taskViewKey === 'overdue') {
        if (dueA === null && dueB === null) return createdB - createdA;
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        if (dueA !== dueB) return dueA - dueB;
        return createdA - createdB;
      }

      if (taskViewKey === 'in_progress') {
        const anchorA = startA ?? createdA;
        const anchorB = startB ?? createdB;
        if (anchorA !== anchorB) return anchorA - anchorB;
        return createdA - createdB;
      }

      if (taskViewKey === 'upcoming') {
        if (dueA === null && dueB === null) return createdB - createdA;
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        if (dueA !== dueB) return dueA - dueB;
        return createdB - createdA;
      }

      return createdB - createdA;
    });

    return sortRows(next, taskSortDirection);
  }, [taskSortDirection, taskViewKey, tasks]);
  const directoryUserMap = useMemo(
    () => directoryUsers.reduce<Record<string, { id: string; display_name: string; avatar_url?: string | null; role_id?: string | null }>>((acc, user) => {
      acc[String(user.id)] = user;
      return acc;
    }, {}),
    [directoryUsers]
  );
  const roleLookup = useMemo(
    () => directoryRoles.reduce<Record<string, string>>((acc, role) => {
      acc[String(role.id)] = role.title;
      return acc;
    }, {}),
    [directoryRoles]
  );
  const noteLookup = useMemo(
    () => new Map(notes.map((note: any) => [String(note.id), note])),
    [notes]
  );
  const chatGroupMap = useMemo(
    () => chatGroups.reduce<Record<string, ChatGroupRow>>((acc, group) => {
      acc[String(group.id)] = group;
      return acc;
    }, {}),
    [chatGroups]
  );
  const selectedChatGroupId = useMemo(
    () => getChatGroupSelectionId(selectedNoteUserId),
    [selectedNoteUserId]
  );
  const selectedChatGroup = useMemo(
    () => (selectedChatGroupId ? chatGroupMap[selectedChatGroupId] || null : null),
    [chatGroupMap, selectedChatGroupId]
  );
  const resolveGroupMemberUserIds = useCallback((group: ChatGroupRow | null | undefined) => {
    if (!group) return [] as string[];
    const resolved = new Set<string>((group.user_ids || []).map((id) => String(id)));
    if (Array.isArray(group.role_ids) && group.role_ids.length > 0) {
      directoryUsers.forEach((user) => {
        if (user.role_id && group.role_ids.includes(String(user.role_id))) {
          resolved.add(String(user.id));
        }
      });
    }
    return Array.from(resolved);
  }, [directoryUsers]);
  const filteredNotes = useMemo(() => {
    const sourceNotes = selectedNoteUserId && selectedConversationNotes !== null
      ? selectedConversationNotes
      : notes;
    if (!selectedNoteUserId) return sourceNotes;
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return sourceNotes.filter((note: any) => isSystemNote(note));
    }
    if (selectedChatGroupId) {
      return sourceNotes.filter((note: any) => String(note?.metadata?.chat_group_id || '').trim() === selectedChatGroupId);
    }
    const targetUserId = String(selectedNoteUserId);
    const currentUserId = String(profile.id || '');
    return sourceNotes.filter((note: any) =>
      isDirectConversationNote(note, currentUserId, targetUserId, noteLookup)
    );
  }, [noteLookup, notes, profile.id, selectedChatGroupId, selectedConversationNotes, selectedNoteUserId]);
  const noteUsersWithActivity = useMemo(() => (
    directoryUsers
      .filter((user) => String(user.id) !== String(profile.id || ''))
      .map((user) => {
        const conversationNotes = notes.filter((note: any) =>
          isDirectConversationNote(note, String(profile.id || ''), String(user.id), noteLookup)
        );
        const latestMessageAt = conversationNotes.reduce<number>((latest, note: any) => {
          const createdAt = new Date(note?.created_at || '').getTime();
          return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
        }, 0);
        const unreadCount = conversationNotes.filter((note: any) => (
          String(note?.author_id || '') !== String(profile.id || '')
          && !seenNoteIds.has(String(note?.id || ''))
        )).length;

        return {
          ...user,
          noteCount: conversationNotes.length,
          latestMessageAt,
          unreadCount,
        };
      })
      .sort((a, b) => {
        if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''), 'fa');
      })
  ), [directoryUsers, noteLookup, notes, profile.id, seenNoteIds]);
  const noteGroupsWithActivity = useMemo(() => (
    chatGroups
      .map((group) => {
        const conversationNotes = notes.filter((note: any) => String(note?.metadata?.chat_group_id || '').trim() === String(group.id));
        const latestMessageAt = conversationNotes.reduce<number>((latest, note: any) => {
          const createdAt = new Date(note?.created_at || '').getTime();
          return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
        }, 0);
        const unreadCount = conversationNotes.filter((note: any) => (
          String(note?.author_id || '') !== String(profile.id || '')
          && !seenNoteIds.has(String(note?.id || ''))
        )).length;
        return {
          id: `${CHAT_GROUP_PREFIX}${group.id}`,
          kind: 'group' as const,
          displayName: group.name,
          noteCount: conversationNotes.length,
          latestMessageAt,
          unreadCount,
          groupId: String(group.id),
          isGroup: true,
        };
      })
      .filter((group) => group.noteCount > 0 || group.unreadCount > 0)
      .sort((a, b) => {
        if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
      })
  ), [chatGroups, notes, profile.id, seenNoteIds]);
  const systemNoteStats = useMemo(() => {
    const systemNotes = notes.filter((note: any) => isSystemNote(note));
    const latestMessageAt = systemNotes.reduce<number>((latest, note: any) => {
      const createdAt = new Date(note?.created_at || '').getTime();
      return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
    }, 0);
    const unreadCount = systemNotes.filter((note: any) => !seenNoteIds.has(String(note?.id || ''))).length;
    return { noteCount: systemNotes.length, latestMessageAt, unreadCount };
  }, [notes, seenNoteIds]);
  const noteConversations = useMemo<ConversationListItem[]>(() => {
    const directItems: ConversationListItem[] = noteUsersWithActivity.map((user) => ({
      id: String(user.id),
      kind: 'direct',
      displayName: user.display_name,
      avatarUrl: user.avatar_url || null,
      noteCount: user.noteCount,
      unreadCount: user.unreadCount,
      latestMessageAt: user.latestMessageAt,
      roleLabel: user.role_id ? roleLookup[String(user.role_id)] || null : null,
      userId: String(user.id),
      isGroup: false,
    }));
    return [...noteGroupsWithActivity, ...directItems].sort((a, b) => {
      if (b.latestMessageAt !== a.latestMessageAt) return b.latestMessageAt - a.latestMessageAt;
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fa');
    });
  }, [noteGroupsWithActivity, noteUsersWithActivity, roleLookup]);
  const visibleNoteConversations = useMemo(() => {
    const search = String(noteUserSearch || '').trim().toLowerCase();
    if (!search) return noteConversations;
    return noteConversations.filter((item) =>
      String(item.displayName || '').toLowerCase().includes(search)
    );
  }, [noteConversations, noteUserSearch]);
  const selectedNoteUser = useMemo(() => {
    if (!selectedNoteUserId) return null;
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
      return {
        id: SYSTEM_MESSAGES_USER_ID,
        display_name: 'پیام‌های سیستم',
        avatar_url: null,
        role_id: null,
      };
    }
    if (selectedChatGroupId) {
      return null;
    }
    return directoryUserMap[String(selectedNoteUserId)] || null;
  }, [directoryUserMap, selectedChatGroupId, selectedNoteUserId]);
  const orderedFilteredNotes = useMemo(
    () => [...filteredNotes].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [filteredNotes]
  );
  const normalizedNoteMessageSearch = useMemo(
    () => String(noteMessageSearch || '').trim().toLowerCase(),
    [noteMessageSearch]
  );
  const displayedChatNotes = useMemo(() => {
    if (!normalizedNoteMessageSearch) return orderedFilteredNotes;
    return orderedFilteredNotes.filter((note: any) => {
      const parsedContent = parseNoteContent(note.content);
      const authorLabel = String(
        note.author_name
        || directoryUserMap[String(note.author_id || '')]?.display_name
        || authorNameMap[note.author_id]
        || ''
      ).toLowerCase();
      const attachmentNames = parsedContent.attachments.map((attachment) => attachment.name).join(' ').toLowerCase();
      const haystack = `${parsedContent.text || ''} ${authorLabel} ${attachmentNames}`.toLowerCase();
      return haystack.includes(normalizedNoteMessageSearch);
    });
  }, [authorNameMap, directoryUserMap, normalizedNoteMessageSearch, orderedFilteredNotes]);
  const activeConversationRoleLabel = useMemo(() => {
    if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) return 'اعلان‌های گردش کارها و اتوماسیون‌ها';
    if (selectedChatGroup) {
      const memberCount = resolveGroupMemberUserIds(selectedChatGroup).length;
      return `${toPersianNumber(String(memberCount))} عضو`;
    }
    if (!selectedNoteUser?.role_id) return 'بدون نقش';
    return roleLookup[String(selectedNoteUser.role_id)] || 'بدون نقش';
  }, [resolveGroupMemberUserIds, roleLookup, selectedChatGroup, selectedNoteUser, selectedNoteUserId]);
  const forwardTargetOptions = useMemo(
    () => [
      ...chatGroups.map((group) => ({
        label: `گروه: ${group.name}`,
        value: `${CHAT_GROUP_PREFIX}${group.id}`,
        searchText: `گروه ${group.name}`.toLowerCase(),
      })),
      ...directoryUsers
        .filter((user) => String(user.id) !== String(profile.id || ''))
        .map((user) => {
          const roleLabel = user.role_id ? roleLookup[String(user.role_id)] : '';
          return {
            label: roleLabel ? `${user.display_name} - ${roleLabel}` : user.display_name,
            value: String(user.id),
            searchText: `${user.display_name} ${roleLabel || ''}`.toLowerCase(),
          };
        }),
    ],
    [chatGroups, directoryUsers, profile.id, roleLookup]
  );
  const responsibilityViews = useMemo(() => {
    const seen = new Set<string>();
    const items = [{ key: 'all', label: 'همه رکوردها' }];
    responsibilities.forEach((item: any) => {
      const moduleId = String(item?.module_id || '').trim();
      if (!moduleId || seen.has(moduleId)) return;
      seen.add(moduleId);
      items.push({
        key: moduleId,
        label: MODULES[moduleId]?.titles?.fa || moduleId,
      });
    });
    return items;
  }, [responsibilities]);
  const filteredResponsibilities = useMemo(() => (
    [...(
      responsibilityViewKey === 'all'
        ? responsibilities
        : responsibilities.filter((item: any) => String(item?.module_id || '') === responsibilityViewKey)
    )].sort((a: any, b: any) => {
      const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return responsibilitySortDirection === 'asc' ? -1 : 1;
      if (Number.isNaN(bTime)) return responsibilitySortDirection === 'asc' ? 1 : -1;
      return responsibilitySortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    })
  ), [responsibilities, responsibilitySortDirection, responsibilityViewKey]);
  useEffect(() => {
    if (responsibilityViewKey === 'all') return;
    if (responsibilityViews.some((view) => view.key === responsibilityViewKey)) return;
    setResponsibilityViewKey('all');
  }, [responsibilityViewKey, responsibilityViews]);
  const getModuleCardFields = (moduleConfig: any) => {
    const fields = moduleConfig?.fields || [];
    return {
      imageField: fields.find((field: any) => field?.type === FieldType.IMAGE)?.key,
      tagsField: fields.find((field: any) => field?.type === FieldType.TAGS || field?.key === 'tags')?.key,
      statusField: fields.find((field: any) => field?.type === FieldType.STATUS || field?.key === 'status')?.key,
      categoryField: fields.find((field: any) => ['category', 'task_type'].includes(String(field?.key || '')))?.key,
    };
  };
  const openPreviewRecord = (moduleId: string, recordId: string, label?: string) => {
    if (!moduleId || !recordId) return;
    setPreviewRecord({ moduleId, recordId, label });
  };
  const taskProcessTarget = useMemo(() => {
    if (!taskProcessModalTask) return null;
    const relatedModuleId = String(taskProcessModalTask?.related_to_module || '').trim();
    const relatedRecordId =
      taskProcessModalTask?.related_production_order
      || taskProcessModalTask?.project_id
      || taskProcessModalTask?.marketing_lead_id
      || taskProcessModalTask?.related_customer
      || taskProcessModalTask?.related_invoice
      || taskProcessModalTask?.purchase_invoice_id;
    if (!relatedModuleId || !relatedRecordId) return null;
    return {
      moduleId: relatedModuleId,
      recordId: String(relatedRecordId),
      lineId: taskProcessModalTask?.production_line_id ? String(taskProcessModalTask.production_line_id) : null,
    };
  }, [taskProcessModalTask]);
  const badgeColor = 'rgb(var(--brand-500-rgb))';
  const drawerHeaderStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgb(var(--brand-700-rgb)) 0%, rgb(var(--brand-500-rgb)) 100%)',
    borderBottom: '1px solid rgba(var(--brand-300-rgb), 0.35)',
    color: '#fff',
  };
  const desktopDrawerBodyStyle: React.CSSProperties = {
    padding: 0,
  };
  const mobileDrawerBodyStyle: React.CSSProperties = {
    padding: 0,
    overflow: 'hidden',
    background: 'transparent',
  };
  const drawerContentStyle: React.CSSProperties = {
    overflow: 'hidden',
  };
  function scrollNotesToBottom(behavior: ScrollBehavior = 'auto') {
    const node = notesScrollContainerRef.current;
    if (!node) return;
    if (behavior === 'auto') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    if (typeof window === 'undefined') {
      node.scrollTop = node.scrollHeight;
      return;
    }
    window.requestAnimationFrame(() => {
      const currentNode = notesScrollContainerRef.current;
      if (!currentNode) return;
      currentNode.scrollTo({ top: currentNode.scrollHeight, behavior });
    });
  }
  const handleNotesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    noteShouldStickToBottomRef.current = distanceToBottom <= 80;
  }, []);

  const handleClose = useCallback(() => {
    mobileDrawerHistoryActiveRef.current = false;
    setMobileNoteSearchOpen(false);
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    setForwardingNote(null);
    setForwardTargetUserIds([]);
    setSeenNoteIds((prev) => new Set([...prev, ...notes.map((n: any) => String(n.id))]));
    setSeenTaskIds((prev) => new Set([...prev, ...tasks.map((t: any) => String(t.id))]));
    setSeenResponsibilityIds((prev) => new Set([...prev, ...responsibilities.map((r: any) => String(r.id))]));
    setPreviewRecord(null);
    setTaskProcessModalTask(null);
    setOpen(false);
  }, [notes, responsibilities, tasks]);

  useEffect(() => {
    setNoteMessageSearch('');
    setNoteMessageSearchOpen(false);
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = true;
  }, [selectedNoteUserId]);

  useEffect(() => {
    if (!open || !profile.id || !selectedNoteUserId) {
      setSelectedConversationNotes(null);
      return;
    }

    let cancelled = false;

    const fetchSelectedConversationNotes = async () => {
      try {
        let nextNotes: any[] = [];

        if (selectedNoteUserId === SYSTEM_MESSAGES_USER_ID) {
          const { data, error } = await supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .or('source_type.eq.system,metadata->>source_type.eq.system')
            .order('created_at', { ascending: false })
            .limit(120);
          if (error) throw error;
          nextNotes = (data || []).filter((note: any) => isSystemNote(note));
        } else if (selectedChatGroupId) {
          const { data, error } = await supabase
            .from('notes')
            .select(NOTE_SELECT_FIELDS)
            .contains('metadata', { chat_group_id: selectedChatGroupId })
            .order('created_at', { ascending: false })
            .limit(120);
          if (error) throw error;
          nextNotes = data || [];
        } else {
          const currentUserId = String(profile.id || '');
          const targetUserId = String(selectedNoteUserId || '');
          const [sentResult, receivedResult] = await Promise.all([
            supabase
              .from('notes')
              .select(NOTE_SELECT_FIELDS)
              .eq('author_id', currentUserId)
              .contains('mention_user_ids', [targetUserId])
              .order('created_at', { ascending: false })
              .limit(80),
            supabase
              .from('notes')
              .select(NOTE_SELECT_FIELDS)
              .eq('author_id', targetUserId)
              .contains('mention_user_ids', [currentUserId])
              .order('created_at', { ascending: false })
              .limit(80),
          ]);
          if (sentResult.error) throw sentResult.error;
          if (receivedResult.error) throw receivedResult.error;
          const unique = new Map<string, any>();
          [...(sentResult.data || []), ...(receivedResult.data || [])].forEach((note: any) => {
            unique.set(String(note.id), note);
          });
          nextNotes = Array.from(unique.values());
        }

        if (cancelled) return;
        setSelectedConversationNotes(
          nextNotes.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        );
        noteShouldStickToBottomRef.current = true;
        noteForceScrollToBottomRef.current = true;
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to fetch selected conversation history.', error);
          setSelectedConversationNotes(null);
        }
      }
    };

    void fetchSelectedConversationNotes();

    return () => {
      cancelled = true;
    };
  }, [open, profile.id, selectedChatGroupId, selectedNoteUserId]);

  useEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    noteShouldStickToBottomRef.current = true;
    noteForceScrollToBottomRef.current = true;
  }, [activeDrawerSection, open]);

  useLayoutEffect(() => {
    if (!open || activeDrawerSection !== 'notes') return;
    const shouldForceScroll = noteForceScrollToBottomRef.current;
    if (!shouldForceScroll && !noteShouldStickToBottomRef.current) return;
    scrollNotesToBottom(shouldForceScroll ? 'auto' : 'smooth');
    noteForceScrollToBottomRef.current = false;
  }, [activeDrawerSection, displayedChatNotes, open]);

  const playNotificationChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const soundWindow = notificationSoundWindowRef.current;
    if (now - soundWindow.startedAt > 12000) {
      soundWindow.startedAt = now;
      soundWindow.plays = 0;
    }
    if (soundWindow.plays >= 2) return;

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startedAt = audioContext.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(660, startedAt + 0.18);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.012, startedAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.28);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 0.3);
      oscillator.onended = () => {
        void audioContext.close().catch(() => undefined);
      };
      soundWindow.plays += 1;
    } catch {
      // Ignore autoplay/audio context failures.
    }
  }, []);

  const requestDrawerClose = useCallback(() => {
    if (
      isMobile
      && open
      && mobileDrawerHistoryActiveRef.current
      && typeof window !== 'undefined'
    ) {
      window.history.back();
      return;
    }

    handleClose();
  }, [handleClose, isMobile, open]);

  useEffect(() => {
    if (!isMobile || !open || typeof window === 'undefined') return;
    if (!mobileDrawerHistoryActiveRef.current) {
      window.history.pushState({ notificationsDrawer: true }, '', window.location.href);
      mobileDrawerHistoryActiveRef.current = true;
    }

    const handlePopState = () => {
      if (!mobileDrawerHistoryActiveRef.current) return;
      mobileDrawerHistoryActiveRef.current = false;
      handleClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!open) {
        mobileDrawerHistoryActiveRef.current = false;
      }
    };
  }, [handleClose, isMobile, open]);

  const handleTaskProducedQtyChange = async (taskId: string, value: number | null) => {
    try {
      const nextProducedQty = Math.max(0, toNumber(value));
      const { error } = await supabase
        .from('tasks')
        .update({ produced_qty: nextProducedQty })
        .eq('id', taskId);
      if (error) throw error;
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? { ...item, produced_qty: nextProducedQty }
          : item
      )));
    } catch (err) {
      console.warn('Could not save produced quantity for notification task', err);
    }
  };

  const getChatGroupPayload = useCallback((group: ChatGroupRow | null | undefined) => {
    if (!group) {
      return {
        mentionUserIds: [] as string[],
        mentionRoleIds: [] as string[],
        metadata: null as Record<string, any> | null,
      };
    }
    return {
      mentionUserIds: resolveGroupMemberUserIds(group).filter((id) => id !== String(profile.id || '')),
      mentionRoleIds: Array.from(new Set((group.role_ids || []).map((id) => String(id)))),
      metadata: { chat_group_id: String(group.id) },
    };
  }, [profile.id, resolveGroupMemberUserIds]);

  const parseMentionSelections = (values: string[]) => {
    const mentionUserIds = new Set<string>();
    const mentionRoleIds = new Set<string>();

    (values || []).forEach((value) => {
      const normalizedValue = String(value || '').trim();
      if (normalizedValue.startsWith('user:')) mentionUserIds.add(normalizedValue.replace('user:', ''));
      if (normalizedValue.startsWith('role:')) mentionRoleIds.add(normalizedValue.replace('role:', ''));
    });

    if (selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID && !selectedChatGroupId) {
      mentionUserIds.add(String(selectedNoteUserId));
    }

    return {
      mentionUserIds: Array.from(mentionUserIds),
      mentionRoleIds: Array.from(mentionRoleIds),
    };
  };

  const resetNoteComposer = () => {
    setNoteText('');
    setNoteReplyTo(null);
    setMentionValues([]);
    setNoteAttachments([]);
    setNoteMentionPickerOpen(false);
    setNoteSmsNotificationEnabled(false);
  };

  const submitNote = async () => {
    if (!noteText.trim() && noteAttachments.length === 0) return;

    try {
      const scope = normalizeNoteScope(noteModuleId, noteRecordId);
      const { mentionUserIds, mentionRoleIds } = parseMentionSelections(mentionValues);
      const groupPayload = getChatGroupPayload(selectedChatGroup);
      const attachments = noteAttachments.length > 0
        ? await uploadNoteAttachments(scope.hasLinkedRecord ? scope.module_id : null, scope.hasLinkedRecord ? scope.record_id : null, noteAttachments)
        : [];

      const payload = {
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(noteText, attachments),
        reply_to: noteReplyTo || null,
        mention_user_ids: Array.from(new Set([...mentionUserIds, ...groupPayload.mentionUserIds])),
        mention_role_ids: Array.from(new Set([...mentionRoleIds, ...groupPayload.mentionRoleIds])),
        author_id: profile.id,
        author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
        metadata: groupPayload.metadata,
      };

      await insertNotesWithFallback([payload]);
      if (noteSmsNotificationEnabled) {
        await sendNoteSmsNotifications({
          authorName: String(directoryUserMap[String(profile.id || '')]?.display_name || '').trim() || 'کاربر',
          noteText,
          mentionUserIds: payload.mention_user_ids,
          mentionRoleIds: payload.mention_role_ids,
          moduleId: scope.module_id,
          recordId: scope.record_id,
        });
      }

      noteShouldStickToBottomRef.current = true;
      noteForceScrollToBottomRef.current = true;
      resetNoteComposer();
      await refreshSection('notes', { force: true });
    } catch (error: any) {
      message.error(String(error?.message || 'ثبت یادداشت ناموفق بود.'));
    }
  };

  const openForwardModal = (note: any) => {
    setForwardingNote(note);
    setForwardTargetUserIds(
      selectedNoteUserId && selectedNoteUserId !== SYSTEM_MESSAGES_USER_ID
        ? [String(selectedNoteUserId)]
        : []
    );
  };

  const submitForward = async () => {
    if (!forwardingNote || forwardTargetUserIds.length === 0) return;

    const targetIds = Array.from(
      new Set(
        forwardTargetUserIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );

    if (targetIds.length === 0) {
      message.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    const scope = normalizeNoteScope(forwardingNote.module_id, forwardingNote.record_id);
    const parsedContent = parseNoteContent(forwardingNote.content);
    const payloads = targetIds.flatMap((targetId) => {
      if (isChatGroupSelection(targetId)) {
        const group = chatGroupMap[String(getChatGroupSelectionId(targetId) || '')] || null;
        if (!group) return [];
        const groupPayload = getChatGroupPayload(group);
        return [{
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(parsedContent.text, parsedContent.attachments),
          reply_to: null,
          mention_user_ids: groupPayload.mentionUserIds,
          mention_role_ids: groupPayload.mentionRoleIds,
          author_id: profile.id,
          author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
          metadata: groupPayload.metadata,
        }];
      }

      if (targetId === String(profile.id || '')) return [];
      return [{
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(parsedContent.text, parsedContent.attachments),
        reply_to: null,
        mention_user_ids: [targetId],
        mention_role_ids: [],
        author_id: profile.id,
        author_name: directoryUserMap[String(profile.id || '')]?.display_name || null,
        metadata: null,
      }];
    });

    if (payloads.length === 0) {
      message.warning('حداقل یک گیرنده معتبر انتخاب کنید.');
      return;
    }

    setForwardSubmitting(true);
    try {
      await insertNotesWithFallback(payloads);
      noteShouldStickToBottomRef.current = true;
      noteForceScrollToBottomRef.current = true;
      setForwardingNote(null);
      setForwardTargetUserIds([]);
      message.success('پیام فوروارد شد.');
      await refreshSection('notes', { force: true });
    } catch (error: any) {
      message.error(String(error?.message || 'فوروارد پیام ناموفق بود.'));
    } finally {
      setForwardSubmitting(false);
    }
  };

  const groupMemberOptions = useMemo(
    () => [
      ...directoryRoles.map((role) => ({
        label: `نقش: ${role.title}`,
        value: `role:${role.id}`,
      })),
      ...directoryUsers.map((user) => ({
        label: `عضو: ${user.display_name}`,
        value: `user:${user.id}`,
      })),
    ],
    [directoryRoles, directoryUsers]
  );

  const handleSubmitGroup = async () => {
    const trimmedName = String(groupNameDraft || '').trim();
    if (!trimmedName) {
      message.warning('نام گروه را وارد کنید.');
      return;
    }

    const userIds = Array.from(new Set(
      groupMemberDrafts
        .filter((value) => String(value || '').startsWith('user:'))
        .map((value) => String(value).replace('user:', ''))
        .filter(Boolean)
    ));
    const roleIds = Array.from(new Set(
      groupMemberDrafts
        .filter((value) => String(value || '').startsWith('role:'))
        .map((value) => String(value).replace('role:', ''))
        .filter(Boolean)
    ));

    setGroupSubmitting(true);
    try {
      if (editingGroup?.id) {
        const { data, error } = await supabase
          .from('chat_groups')
          .update({
            name: trimmedName,
            user_ids: userIds,
            role_ids: roleIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGroup.id)
          .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
          .single();
        if (error) throw error;
        const nextGroup: ChatGroupRow = {
          id: String(data?.id || editingGroup.id),
          org_id: data?.org_id ? String(data.org_id) : null,
          name: String(data?.name || trimmedName),
          user_ids: Array.isArray(data?.user_ids) ? data.user_ids.map((id: any) => String(id)) : userIds,
          role_ids: Array.isArray(data?.role_ids) ? data.role_ids.map((id: any) => String(id)) : roleIds,
          created_by: data?.created_by ? String(data.created_by) : editingGroup.created_by,
          created_at: data?.created_at ? String(data.created_at) : editingGroup.created_at,
          updated_at: data?.updated_at ? String(data.updated_at) : new Date().toISOString(),
        };
        setChatGroups((prev) => prev.map((group) => group.id === nextGroup.id ? nextGroup : group));
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${nextGroup.id}`);
      } else {
        const { data, error } = await supabase
          .from('chat_groups')
          .insert([{
            name: trimmedName,
            user_ids: userIds,
            role_ids: roleIds,
            created_by: profile.id,
          }])
          .select('id, org_id, name, user_ids, role_ids, created_by, created_at, updated_at')
          .single();
        if (error) throw error;
        const nextGroup: ChatGroupRow = {
          id: String(data?.id || ''),
          org_id: data?.org_id ? String(data.org_id) : null,
          name: String(data?.name || trimmedName),
          user_ids: Array.isArray(data?.user_ids) ? data.user_ids.map((id: any) => String(id)) : userIds,
          role_ids: Array.isArray(data?.role_ids) ? data.role_ids.map((id: any) => String(id)) : roleIds,
          created_by: data?.created_by ? String(data.created_by) : String(profile.id || ''),
          created_at: data?.created_at ? String(data.created_at) : null,
          updated_at: data?.updated_at ? String(data.updated_at) : null,
        };
        setChatGroups((prev) => [nextGroup, ...prev]);
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${nextGroup.id}`);
      }

      setGroupModalOpen(false);
      setEditingGroup(null);
      setGroupNameDraft('');
      setGroupMemberDrafts([]);
      message.success(editingGroup ? 'گروه ویرایش شد.' : 'گروه ایجاد شد.');
    } catch (error: any) {
      message.error(String(error?.message || 'ذخیره گروه ناموفق بود.'));
    } finally {
      setGroupSubmitting(false);
    }
  };

  const resolveDirectConversationTargetUserId = useCallback((note: any) => {
    const currentUserId = String(profile.id || '');
    if (!currentUserId || !note) return null;
    const authorId = String(note?.author_id || '').trim();
    if (authorId && authorId !== currentUserId) return authorId;
    const mentioned = getNoteMentionUserIds(note).find((id: string) => String(id) !== currentUserId);
    if (mentioned) return String(mentioned);
    const replyTarget = note?.reply_to ? noteLookup.get(String(note.reply_to)) : null;
    const replyAuthorId = String(replyTarget?.author_id || '').trim();
    return replyAuthorId && replyAuthorId !== currentUserId ? replyAuthorId : null;
  }, [noteLookup, profile.id]);

  useEffect(() => {
    const currentNoteIds = new Set(notes.map((note: any) => String(note?.id || '')).filter(Boolean));
    const currentTaskIds = new Set(tasks.map((task: any) => String(task?.id || '')).filter(Boolean));
    const currentResponsibilityIds = new Set(responsibilities.map((item: any) => String(item?.id || '')).filter(Boolean));

    if (!notificationsReadyRef.current) {
      prevNotesRef.current = currentNoteIds;
      prevTasksRef.current = currentTaskIds;
      prevResponsibilitiesRef.current = currentResponsibilityIds;
      if (currentNoteIds.size > 0 || currentTaskIds.size > 0 || currentResponsibilityIds.size > 0) {
        notificationsReadyRef.current = true;
      }
      return;
    }

    const newNotifications: UiNotificationItem[] = [
      ...notes
        .filter((note: any) => {
          const noteId = String(note?.id || '');
          return (
            noteId
            && !prevNotesRef.current.has(noteId)
            && !seenNoteIds.has(noteId)
            && !dismissedUiNotificationIds.has(`note:${noteId}`)
          );
        })
        .map((note: any) => {
          const parsed = parseNoteContent(note.content);
          const groupId = String(note?.metadata?.chat_group_id || '').trim();
          const group = groupId ? chatGroupMap[groupId] : null;
          const directUserId = resolveDirectConversationTargetUserId(note);
          const directUser = directUserId ? directoryUserMap[directUserId] : null;
          return {
            id: `note:${String(note.id)}`,
            kind: 'note' as const,
            title: group?.name || directUser?.display_name || note.author_name || 'پیام جدید',
            body: parsed.text || (parsed.attachments.length > 0 ? 'فایل جدید ارسال شد' : 'پیام جدید'),
            createdAt: note.created_at || null,
            hasAttachments: parsed.attachments.length > 0,
            note,
          };
        }),
      ...tasks
        .filter((task: any) => {
          const taskId = String(task?.id || '');
          return (
            taskId
            && !prevTasksRef.current.has(taskId)
            && !seenTaskIds.has(taskId)
            && !dismissedUiNotificationIds.has(`task:${taskId}`)
          );
        })
        .map((task: any) => {
          const localizedStatus = getTaskStatusLabel(task?.status, task, statusOptions) || resolveStatusLabelFallback(task?.status);
          return {
            id: `task:${String(task.id)}`,
            kind: 'task' as const,
            title: task.name || 'فعالیت جدید',
            body: String(task.description || (localizedStatus ? `وضعیت: ${localizedStatus}` : 'به شما ارجاع شده است.')),
            createdAt: task.created_at || null,
            task,
          };
        }),
      ...responsibilities
        .filter((item: any) => {
          const responsibilityId = String(item?.id || '');
          return (
            responsibilityId
            && !prevResponsibilitiesRef.current.has(responsibilityId)
            && !seenResponsibilityIds.has(responsibilityId)
            && !dismissedUiNotificationIds.has(`responsibility:${responsibilityId}`)
          );
        })
        .map((item: any) => ({
          id: `responsibility:${String(item.id)}`,
          kind: 'responsibility' as const,
          title: formatRecordLabel(item, item?.module_id) || 'مسئولیت جدید',
          body: MODULES[String(item?.module_id || '')]?.titles?.faSingular || 'رکورد جدید نیاز به رسیدگی دارد.',
          createdAt: item.created_at || null,
          responsibility: item,
        })),
    ]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (!open && newNotifications.length > 0) {
      setUiNotifications((prev) => {
        const merged = [...newNotifications, ...prev];
        const unique = new Map<string, UiNotificationItem>();
        merged.forEach((item) => {
          if (!unique.has(item.id)) unique.set(item.id, item);
        });
        return Array.from(unique.values()).slice(0, 4);
      });
      playNotificationChime();
    }

    prevNotesRef.current = currentNoteIds;
    prevTasksRef.current = currentTaskIds;
    prevResponsibilitiesRef.current = currentResponsibilityIds;
  }, [
    chatGroupMap,
    directoryUserMap,
    dismissedUiNotificationIds,
    notes,
    open,
    playNotificationChime,
    resolveDirectConversationTargetUserId,
    responsibilities,
    seenNoteIds,
    seenResponsibilityIds,
    seenTaskIds,
    tasks,
  ]);

  useEffect(() => {
    setUiNotifications((prev) => prev.filter((item) => {
      const rawId = String(item?.id || '');
      const [kind, entityId] = rawId.split(':');
      if (!kind || !entityId) return false;
      if (dismissedUiNotificationIds.has(rawId)) return false;
      if (kind === 'note') return !seenNoteIds.has(entityId);
      if (kind === 'task') return !seenTaskIds.has(entityId);
      if (kind === 'responsibility') return !seenResponsibilityIds.has(entityId);
      return false;
    }));
  }, [dismissedUiNotificationIds, seenNoteIds, seenResponsibilityIds, seenTaskIds]);

  const handleDismissUiNotification = useCallback((notificationId: string) => {
    setDismissedUiNotificationIds((prev) => new Set(prev).add(notificationId));
    setUiNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  }, []);

  const openUiNotification = useCallback((item: UiNotificationItem) => {
    if (item.kind === 'note' && item.note) {
      const note = item.note;
      const groupId = String(note?.metadata?.chat_group_id || '').trim();
      if (groupId) {
        setSelectedNoteUserId(`${CHAT_GROUP_PREFIX}${groupId}`);
      } else if (isSystemNote(note)) {
        setSelectedNoteUserId(SYSTEM_MESSAGES_USER_ID);
      } else {
        const directUserId = resolveDirectConversationTargetUserId(note);
        setSelectedNoteUserId(directUserId || null);
      }
      setNoteModuleId(note.module_id || null);
      setNoteRecordId(note.record_id || null);
      setDesktopActiveKey('notes');
      setMobileActiveKey('notes');
      setOpen(true);
      return;
    }

    if (item.kind === 'task' && item.task) {
      const sourceLink = resolveTaskSourceLink(item.task);
      if (sourceLink.moduleId && sourceLink.recordId) {
        setTaskProcessModalTask({ ...item.task });
        setTaskProcessHostKey((prev) => prev + 1);
        return;
      }
      setDesktopActiveKey('tasks');
      setMobileActiveKey('tasks');
      setOpen(true);
      return;
    }

    if (item.kind === 'responsibility' && item.responsibility) {
      const moduleId = String(item.responsibility?.module_id || '').trim();
      const recordId = String(item.responsibility?.id || '').trim();
      if (moduleId && recordId) {
        openPreviewRecord(moduleId, recordId, recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel(item.responsibility, moduleId));
      }
    }
  }, [openPreviewRecord, recordTitleMap, resolveDirectConversationTargetUserId]);

  useEffect(() => {
    if (open || uiNotifications.length === 0) {
      setUiNotificationOverlayItems([]);
      return;
    }

    setUiNotificationOverlayItems(
      uiNotifications.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        hasAttachments: item.hasAttachments,
        onOpen: () => openUiNotification(item),
        onDismiss: () => handleDismissUiNotification(item.id),
      })),
    );
  }, [handleDismissUiNotification, open, openUiNotification, uiNotifications]);

  useEffect(() => () => {
    setUiNotificationOverlayItems([]);
  }, []);

  const renderNotesPanel = (layout: 'desktop' | 'mobile' = 'desktop') => {
    const withUserSidebar = layout === 'desktop';
    const withMobileUserRail = layout === 'mobile';
    const data = displayedChatNotes;
    const noteMap = new Map(notes.map((note: any) => [note.id, note]));
    const panelTitle = selectedChatGroup?.name || (selectedNoteUser ? selectedNoteUser.display_name : 'همه پیام‌ها');
    const panelSubtitle = selectedChatGroup || selectedNoteUser
      ? activeConversationRoleLabel
      : `${toPersianNumber(String(notes.length || 0))} پیام`;

    return (
      <div dir="ltr" className="flex flex-1 min-h-0 bg-[rgba(var(--brand-50-rgb),0.92)] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
        {withUserSidebar ? (
          <div dir="rtl" className="w-[208px] border-r border-[rgba(var(--brand-200-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.14)] bg-[rgba(var(--brand-100-rgb),0.96)] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
            <div className="px-4 py-3 border-b border-[rgba(var(--brand-200-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.22)]">
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
                    ? 'bg-[rgba(var(--brand-100-rgb),0.95)] text-[rgb(var(--brand-700-rgb))]'
                    : 'hover:bg-white/80 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">همه گفتگوها</span>
                  <span className="text-[11px] text-gray-400">{toPersianNumber(String(notes.length || 0))}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNoteSearchOpen(false);
                  setSelectedNoteUserId((prev) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID));
                }}
                className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                  selectedNoteUserId === SYSTEM_MESSAGES_USER_ID
                    ? 'bg-[rgba(var(--brand-100-rgb),0.95)] text-[rgb(var(--brand-700-rgb))]'
                    : 'hover:bg-white/80 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar size={36} className="!bg-[rgba(var(--brand-100-rgb),0.95)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-white/10 dark:!text-[rgb(var(--brand-300-rgb))]">
                    <BellOutlined />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">پیام‌های سیستم</div>
                    <div className="text-[11px] text-gray-400">
                      {systemNoteStats.noteCount > 0 ? `${toPersianNumber(String(systemNoteStats.noteCount))} پیام` : 'بدون پیام'}
                    </div>
                  </div>
                  {systemNoteStats.unreadCount > 0 ? (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {toPersianNumber(String(systemNoteStats.unreadCount))}
                    </span>
                  ) : null}
                </div>
              </button>
              {visibleNoteConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMobileNoteSearchOpen(false);
                    setSelectedNoteUserId((prev) => (prev === item.id ? null : item.id));
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                    selectedNoteUserId === item.id
                      ? 'bg-[rgba(var(--brand-100-rgb),0.95)] text-[rgb(var(--brand-700-rgb))]'
                      : 'hover:bg-white/80 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      size={36}
                      src={!item.isGroup ? item.avatarUrl || undefined : undefined}
                      className={item.isGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}
                    >
                      {item.isGroup ? <TeamOutlined /> : (!item.avatarUrl && String(item.displayName || '?').slice(0, 1))}
                    </Avatar>
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
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col flex-1 min-h-0 bg-[rgba(255,255,255,0.98)] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
          <div className="border-b border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.96)] px-3 py-2.5 dark:border-[rgba(var(--brand-300-rgb),0.14)] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                {selectedChatGroup || selectedNoteUser ? (
                  <Avatar
                    size={withMobileUserRail ? 32 : 36}
                    src={!selectedChatGroup ? selectedNoteUser?.avatar_url || undefined : undefined}
                    className={selectedChatGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}
                  >
                    {selectedChatGroup ? <TeamOutlined /> : (!selectedNoteUser?.avatar_url && String(selectedNoteUser?.display_name || '?').slice(0, 1))}
                  </Avatar>
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
                          ...(selectedChatGroup.user_ids || []).map((id) => `user:${id}`),
                          ...(selectedChatGroup.role_ids || []).map((id) => `role:${id}`),
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
                            setChatGroups((prev) => prev.filter((group) => group.id !== selectedChatGroup.id));
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
                    setNoteMessageSearchOpen((prev) => {
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
                placeholder={selectedChatGroup || selectedNoteUser ? 'جستجو در پیام های این گفتگو' : 'جستجو در پیام ها'}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="mt-2"
              />
            ) : null}
          </div>

          <div
            ref={notesScrollContainerRef}
            onScroll={handleNotesScroll}
            className={`flex-1 overflow-y-auto ${withUserSidebar ? 'px-2.5 py-2.5' : 'px-2 py-2'} space-y-2.5`}
          >
            {loadingNotes ? (
              <div className="space-y-3">
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ) : data.length === 0 ? (
              <Empty description={normalizedNoteMessageSearch ? 'پیامی با این جستجو پیدا نشد' : 'پیامی یافت نشد'} />
            ) : (
              data.map((note: any) => {
                const recordKey = `${note.module_id}:${note.record_id}`;
                const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id, module_id: note.module_id }, note.module_id);
                const isSystem = isSystemNote(note);
                const isMine = !isSystem && note.author_id && profile.id && note.author_id === profile.id;
                const author = directoryUserMap[String(note.author_id || '')];
                const authorName = isSystem ? 'پیام‌های سیستم' : (isMine ? 'شما' : (note.author_name || author?.display_name || authorNameMap[note.author_id] || 'کاربر سیستم'));
                const replyTarget = note.reply_to ? noteMap.get(note.reply_to) : null;
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
                const mentionRoles = (note.mention_role_ids || []).map((id: string) => roleLookup[String(id)] || id);

                return (
                  <div key={note.id}>
                    <SharedNoteCard
                      authorName={authorName}
                      createdAtLabel={safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}
                      text={parsedContent.text}
                      attachments={parsedContent.attachments}
                      avatarUrl={author?.avatar_url || null}
                      avatarFallback={authorName}
                      mentionUsers={mentionUsers}
                      mentionRoles={mentionRoles}
                      replyText={replyTarget ? parseNoteContent(replyTarget.content).text : null}
                      replyAuthorName={replyAuthorName}
                      isMine={Boolean(isMine)}
                      variant="default"
                      renderTemplateBold={isSystem}
                      isEdited={Boolean(note.is_edited)}
                      isEditing={editingNoteId === note.id}
                      editingValue={editingNoteValue}
                      onEditingChange={setEditingNoteValue}
                      onSaveEdit={async () => {
                        if (!editingNoteValue.trim()) return;
                        const nextContent = serializeNoteContent(editingNoteValue, parsedContent.attachments);
                        await supabase.from('notes').update({ content: nextContent, is_edited: true }).eq('id', note.id);
                        setNotes((prev) => prev.map((n: any) => (n.id === note.id ? { ...n, content: nextContent, is_edited: true } : n)));
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
                      onEdit={isMine ? () => {
                        setEditingNoteId(note.id);
                        setEditingNoteValue(parsedContent.text || '');
                      } : undefined}
                      onDelete={isMine ? async () => {
                        await supabase.from('notes').delete().eq('id', note.id);
                        setNotes((prev) => prev.filter((n: any) => n.id !== note.id));
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
              })
            )}
          </div>

          <SharedNoteComposer
            header={(
              <div className="flex flex-col gap-2">
                <div
                  dir="rtl"
                  className={withMobileUserRail ? 'flex items-center gap-2' : 'flex items-center flex-wrap gap-2'}
                >
                  <Select
                    placeholder="ماژول"
                    value={noteModuleId}
                    onChange={(val) => {
                      setNoteModuleId(val);
                      setNoteRecordId(null);
                    }}
                    options={moduleOptions}
                    size="small"
                    className={withMobileUserRail ? 'min-w-[112px] max-w-[112px] shrink-0' : 'min-w-[120px]'}
                    styles={{ popup: { root: { minWidth: 220 } } }}
                  />
                  <div className="flex min-w-0 items-center gap-1">
                    <Select
                      placeholder="رکورد"
                      value={noteRecordId}
                      onChange={setNoteRecordId}
                      options={noteRecordOptions}
                      size="small"
                      showSearch
                      optionFilterProp="label"
                      disabled={!noteModuleId}
                      className="min-w-0 flex-1"
                      style={{ width: '100%' }}
                      styles={{ popup: { root: { minWidth: 280 } } }}
                    />
                    <div className="shrink-0">
                      <QrScanPopover
                        label=""
                        buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
                        buttonClassName="text-[rgba(var(--brand-700-rgb),0.85)] dark:text-[rgba(var(--brand-300-rgb),0.9)] hover:text-leather-500"
                        onScan={({ moduleId, recordId }) => {
                          if (moduleId && recordId) {
                            setNoteModuleId(moduleId);
                            setNoteRecordId(recordId);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            value={noteText}
            onChange={setNoteText}
            onSubmit={submitNote}
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
            onToggleMentionPicker={() => setNoteMentionPickerOpen((prev) => !prev)}
            attachments={noteAttachments}
            onFilesSelected={(files) => {
              setNoteAttachments((prev) => {
                const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
                files.forEach((file) => {
                  map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveAttachment={(fileName) => {
              setNoteAttachments((prev) => prev.filter((file) => file.name !== fileName));
            }}
            replyActive={Boolean(noteReplyTo)}
            onClearReply={() => setNoteReplyTo(null)}
            smsNotificationEnabled={noteSmsNotificationEnabled}
            onSmsNotificationChange={setNoteSmsNotificationEnabled}
            submitDisabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || (!noteText.trim() && noteAttachments.length === 0)}
          />
        </div>
        {withMobileUserRail ? (
          <div dir="rtl" className="w-[64px] shrink-0 overflow-hidden border-l border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-100-rgb),0.96)] dark:border-[rgba(var(--brand-300-rgb),0.14)] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
            <div className="flex h-full flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden px-1 py-2">
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
                className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/80 dark:hover:bg-white/5"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-[10px] font-bold ${
                  !selectedNoteUserId
                    ? 'border-[rgba(var(--brand-400-rgb),0.75)] bg-[rgba(var(--brand-100-rgb),0.95)] text-[rgb(var(--brand-700-rgb))]'
                    : 'border-[rgba(var(--brand-200-rgb),0.7)] bg-white/90 text-gray-600 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-white/5 dark:text-gray-200'
                }`}>
                  همه
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{toPersianNumber(String(notes.length || 0))}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedNoteUserId((prev) => (prev === SYSTEM_MESSAGES_USER_ID ? null : SYSTEM_MESSAGES_USER_ID))}
                className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/80 dark:hover:bg-white/5"
                title="پیام‌های سیستم"
              >
                <div className="relative">
                  <Badge count={systemNoteStats.unreadCount > 0 ? toPersianNumber(String(systemNoteStats.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                    <Avatar
                      size={38}
                      className={`!bg-[rgba(var(--brand-100-rgb),0.95)] !text-[rgb(var(--brand-700-rgb))] dark:!bg-white/10 dark:!text-[rgb(var(--brand-300-rgb))] ${
                        selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'ring-2 ring-[rgb(var(--brand-500-rgb))] ring-offset-2 ring-offset-white dark:ring-offset-[rgba(var(--app-dark-surface-rgb),1)]' : ''
                      }`}
                    >
                      <BellOutlined />
                    </Avatar>
                  </Badge>
                </div>
                <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                  سیستم
                </span>
              </button>

              {visibleNoteConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedNoteUserId((prev) => (prev === item.id ? null : item.id))}
                  className="flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-white/80 dark:hover:bg-white/5"
                  title={item.displayName}
                >
                  <div className="relative">
                    <Badge count={item.unreadCount > 0 ? toPersianNumber(String(item.unreadCount)) : 0} size="small" offset={[-2, 2]}>
                      <Avatar
                        size={38}
                        src={!item.isGroup ? item.avatarUrl || undefined : undefined}
                        className={`${selectedNoteUserId === item.id ? 'ring-2 ring-[rgb(var(--brand-500-rgb))] ring-offset-2 ring-offset-white dark:ring-offset-[rgba(var(--app-dark-surface-rgb),1)]' : ''} ${item.isGroup ? '!bg-amber-100 !text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300' : ''}`}
                      >
                        {item.isGroup ? <TeamOutlined /> : (!item.avatarUrl && String(item.displayName || '?').slice(0, 1))}
                      </Avatar>
                    </Badge>
                    <span className="absolute -left-1 bottom-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] text-[rgb(var(--brand-700-rgb))] shadow-sm dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)] dark:text-[rgb(var(--brand-300-rgb))]">
                      {item.isGroup ? <TeamOutlined /> : <LeftOutlined />}
                    </span>
                  </div>
                  <span className="line-clamp-2 text-center text-[10px] leading-4 text-gray-500 dark:text-gray-400">
                    {item.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderNotes = () => {
    const data = showMore.notes ? notes : notes.slice(0, MAX_ITEMS);
    const noteMap = new Map(data.map((n: any) => [n.id, n]));
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loadingNotes ? (
            <div className="space-y-3">
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : data.length === 0 ? (
            <Empty description="نوتیفیکیشن جدیدی ندارید" />
          ) : (
            data.map((note: any) => {
              const recordKey = `${note.module_id}:${note.record_id}`;
              const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id, module_id: note.module_id }, note.module_id);
              const isSystem = isSystemNote(note);
              const isMine = !isSystem && note.author_id && profile.id && note.author_id === profile.id;
              const authorName = isSystem ? 'پیام‌های سیستم' : (isMine ? 'شما' : (note.author_name || authorNameMap[note.author_id] || 'کاربر سیستم'));
              const replyTarget = note.reply_to ? noteMap.get(note.reply_to) : null;
              const parsedContent = parseNoteContent(note.content);
              return (
                <div key={note.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`w-[92%] rounded-2xl px-3 py-2 border shadow-sm ${
                      isMine
                        ? 'bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-600-rgb),0.2)] border-[rgba(var(--brand-300-rgb),0.65)] dark:border-[rgba(var(--brand-300-rgb),0.35)] rounded-tr-sm'
                      : 'bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.94)] border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)] rounded-tl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>{authorName}</span>
                      <span>{safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {replyTarget && (
                      <div className="text-[11px] text-gray-600 dark:text-gray-300 bg-[rgba(var(--brand-50-rgb),0.96)] dark:bg-[rgba(var(--brand-700-rgb),0.38)] rounded-lg p-2 mb-2">
                        پاسخ به: {renderTemplateAwareText(parseNoteContent(replyTarget.content).text || '', isSystem)}
                      </div>
                    )}
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {renderTemplateAwareText(parsedContent.text, isSystem)}
                    </div>
                    {parsedContent.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parsedContent.attachments.map((attachment) => (
                          <a
                            key={`${attachment.url}-${attachment.name}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-[rgba(var(--brand-300-rgb),0.5)] bg-[rgba(var(--brand-50-rgb),0.9)] px-2.5 py-1 text-[11px] text-[rgb(var(--brand-700-rgb))] dark:border-[rgba(var(--brand-300-rgb),0.25)] dark:bg-[rgba(var(--brand-700-rgb),0.18)] dark:text-[rgb(var(--brand-300-rgb))]"
                          >
                            <span className="max-w-[180px] truncate">{attachment.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-gray-500">
                      رکورد مرتبط: <Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>{recordTitle}</Link>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                      <Button
                        type="text"
                        size="small"
                        icon={<EnterOutlined />}
                        onClick={() => {
                          setNoteReplyTo(note.id);
                          setNoteModuleId(note.module_id || null);
                          setNoteRecordId(note.record_id || null);
                        }}
                      />
                      {isMine && (
                        <>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteValue(parsedContent.text || '');
                            }}
                          />
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={async () => {
                              await supabase.from('notes').delete().eq('id', note.id);
                              setNotes((prev) => prev.filter((n: any) => n.id !== note.id));
                            }}
                          />
                        </>
                      )}
                    </div>
                    {editingNoteId === note.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        <Input.TextArea
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          autoSize={{ minRows: 2, maxRows: 4 }}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="primary"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={async () => {
                              if (!editingNoteValue.trim()) return;
                              const nextContent = serializeNoteContent(editingNoteValue, parsedContent.attachments);
                              await supabase.from('notes').update({ content: nextContent, is_edited: true }).eq('id', note.id);
                              setNotes((prev) => prev.map((n: any) => (n.id === note.id ? { ...n, content: nextContent, is_edited: true } : n)));
                              setEditingNoteId(null);
                              setEditingNoteValue('');
                            }}
                          >
                            ذخیره
                          </Button>
                          <Button size="small" onClick={() => setEditingNoteId(null)}>
                            انصراف
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {notes.length > MAX_ITEMS && (
            <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, notes: !prev.notes }))}>
              {showMore.notes ? 'نمایش کمتر' : 'نمایش بیشتر'}
            </Button>
          )}
        </div>
        <div className="border-t border-[rgba(var(--brand-200-rgb),0.7)] dark:border-[rgba(var(--brand-300-rgb),0.25)] bg-[rgba(var(--brand-50-rgb),0.98)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.98)] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Select
              placeholder="ماژول"
              value={noteModuleId}
              onChange={(val) => {
                setNoteModuleId(val);
                setNoteRecordId(null);
              }}
              options={moduleOptions}
              size="small"
              className="min-w-[110px]"
            />
            <Select
              placeholder="رکورد"
              value={noteRecordId}
              onChange={setNoteRecordId}
              options={noteRecordOptions}
              size="small"
              showSearch
              optionFilterProp="label"
              className="flex-1"
            />
            <QrScanPopover
              label=""
              buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
              buttonClassName="text-[rgba(var(--brand-700-rgb),0.85)] dark:text-[rgba(var(--brand-300-rgb),0.9)] hover:text-leather-500"
              onScan={({ moduleId, recordId }) => {
                if (moduleId && recordId) {
                  setNoteModuleId(moduleId);
                  setNoteRecordId(recordId);
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Input.TextArea
              placeholder={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID ? 'این گفتگو فقط پیام‌های سیستم را نمایش می‌دهد.' : 'یادداشت جدید...'}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="rounded-lg border-gray-300"
              disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
            />
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="منشن عضو یا تیم (اختیاری)"
              value={mentionValues}
              onChange={(v) => setMentionValues(v || [])}
              options={mentionOptions}
              optionFilterProp="label"
              className="w-full"
              disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID}
              getPopupContainer={(node) => node.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 1100, minWidth: 240 } } }}
            />
            {noteReplyTo && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <EnterOutlined />
                <span>پاسخ به یادداشت انتخاب شده</span>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setNoteReplyTo(null)} />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                type="primary"
                disabled={selectedNoteUserId === SYSTEM_MESSAGES_USER_ID || (!noteText.trim() && noteAttachments.length === 0)}
                onClick={async () => {
                  await submitNote();
                }}
              >
                ارسال
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCreatedAtSortControls = (
    direction: CreatedSortDirection,
    setDirection: React.Dispatch<React.SetStateAction<CreatedSortDirection>>,
  ) => (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5 dark:border-gray-700 dark:bg-white/5">
      <Button
        type="text"
        size="small"
        icon={<DownOutlined />}
        className={direction === 'desc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setDirection('desc')}
      />
      <Button
        type="text"
        size="small"
        icon={<UpOutlined />}
        className={direction === 'asc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setDirection('asc')}
      />
    </div>
  );

  const renderTasksPanel = (mode: 'list' | 'grid' = 'list') => {
    const data = showMore.tasks ? filteredTasks : filteredTasks.slice(0, MAX_ITEMS);
    const relationOptionsByField = tasks.reduce<Record<string, Array<{ label: string; value: string }>>>((acc, task: any) => {
      const entries: Array<[string, string | null | undefined]> = [
        ['related_product', task?.related_product],
        ['related_customer', task?.related_customer],
        ['related_supplier', task?.related_supplier],
        ['related_production_order', task?.related_production_order],
        ['related_invoice', task?.related_invoice],
        ['purchase_invoice_id', task?.purchase_invoice_id],
        ['project_id', task?.project_id],
        ['marketing_lead_id', task?.marketing_lead_id],
      ];

      entries.forEach(([fieldKey, recordId]) => {
        if (!recordId || !task?.related_to_module) return;
        const recordKey = `${task.related_to_module}:${recordId}`;
        const label = recordTitleMap[recordKey] || formatRecordLabel({ id: recordId, module_id: task.related_to_module }, task.related_to_module);
        const current = acc[fieldKey] || [];
        if (!current.some((item) => String(item.value) === String(recordId))) {
          current.push({ label, value: String(recordId) });
        }
        acc[fieldKey] = current;
      });

      return acc;
    }, {});

    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm overflow-hidden">
          {renderCreatedAtSortControls(taskSortDirection, setTaskSortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {TASK_VIEW_PRESETS.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setTaskViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, tasks: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  taskViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/create')}
          >
            افزودن فعالیت
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingTasks ? (
            <div className="space-y-2">
              <Skeleton active paragraph={{ rows: 2 }} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : data.length === 0 ? (
            <Empty description="فعالیتی یافت نشد" />
          ) : mode === 'grid' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {data.map((task: any) => (
                <RenderCardItem
                  key={task.id}
                  item={task}
                  moduleId="tasks"
                  moduleConfig={tasksConfig}
                  statusField="status"
                  categoryField="task_type"
                  tagsField="tags"
                  allUsers={directoryUsers}
                  allRoles={directoryRoles}
                  selectedRowKeys={[]}
                  setSelectedRowKeys={() => undefined}
                  navigate={(path) => {
                    const [, moduleId, recordId] = String(path || '').split('/');
                    if (!moduleId || !recordId) return;
                    if (moduleId === 'tasks') {
                      setTaskProcessModalTask({ ...task });
                      setTaskProcessHostKey((prev) => prev + 1);
                      return;
                    }
                    openPreviewRecord(
                      moduleId,
                      recordId,
                      recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ id: recordId, module_id: moduleId }, moduleId)
                    );
                  }}
                  canViewField={() => true}
                  relationOptions={relationOptionsByField}
                  hideSelection
                />
              ))}
            </div>
          ) : (
            <List
              dataSource={data}
              renderItem={(task: any) => {
                const sourceLink = resolveTaskSourceLink(task);
                const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
                const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
                return (
                  <TaskSummaryCard
                    task={task}
                    statusOptions={statusOptions}
                    priorityOptions={priorityOptions}
                    assigneeNameMap={assigneeNameMap}
                    roleNameMap={roleNameMap}
                    recordTitle={recordTitle}
                    onClose={handleClose}
                    onStatusChange={async (taskId, status) => {
                      const currentTask = tasks.find((row: any) => String(row?.id) === String(taskId)) || null;
                      const updatedTask = await updateTaskStatusWithAutomation({
                        taskId,
                        nextStatus: status,
                        previousTask: currentTask,
                        currentUser: {
                          id: profile.id,
                          fullName: createdByNameMap[String(profile.id || '')] || null,
                        },
                      });
                      setTasks((prev) => prev.map((row: any) => (
                        row.id === taskId ? { ...row, ...updatedTask } : row
                      )));
                    }}
                    onProducedQtyChange={async (taskId, value) => {
                      await handleTaskProducedQtyChange(taskId, value);
                    }}
                    onTaskUpdated={async (updatedTask) => {
                      setTasks((prev) => prev.map((row: any) => (
                        String(row?.id || '') === String(updatedTask?.id || '')
                          ? { ...row, ...updatedTask }
                          : row
                      )));
                    }}
                    currentUser={{
                      id: profile.id,
                      fullName: createdByNameMap[String(profile.id || '')] || null,
                    }}
                  />
                );
              }}
            />
          )}
        </div>

        {filteredTasks.length > MAX_ITEMS ? (
          <Button type="link" onClick={() => setShowMore((prev) => ({ ...prev, tasks: !prev.tasks }))}>
            {showMore.tasks ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        ) : null}
      </div>
    );
  };

  const renderTasks = () => {
    const data = showMore.tasks ? filteredTasks : filteredTasks.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm overflow-hidden">
          {renderCreatedAtSortControls(taskSortDirection, setTaskSortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {TASK_VIEW_PRESETS.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setTaskViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, tasks: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  taskViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/create')}
          >
            افزودن فعالیت
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
        {loadingTasks ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="فعالیتی یافت نشد" />
        ) : (
          <List
            dataSource={data}
            renderItem={(task: any) => {
              const sourceLink = resolveTaskSourceLink(task);
              const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
              const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
              return (
                <TaskSummaryCard
                  task={task}
                  statusOptions={statusOptions}
                  priorityOptions={priorityOptions}
                  assigneeNameMap={assigneeNameMap}
                  roleNameMap={roleNameMap}
                  recordTitle={recordTitle}
                  onClose={handleClose}
                  onStatusChange={async (taskId, status) => {
                    const currentTask = filteredTasks.find((row: any) => String(row?.id) === String(taskId)) || null;
                    const updatedTask = await updateTaskStatusWithAutomation({
                      taskId,
                      nextStatus: status,
                      previousTask: currentTask,
                      currentUser: {
                        id: profile.id,
                        fullName: createdByNameMap[String(profile.id || '')] || null,
                      },
                    });
                    setTasks((prev) => prev.map((row: any) => (
                      row.id === taskId ? { ...row, ...updatedTask } : row
                    )));
                  }}
                  onProducedQtyChange={async (taskId, value) => {
                    await handleTaskProducedQtyChange(taskId, value);
                  }}
                  onTaskUpdated={async (updatedTask) => {
                    setTasks((prev) => prev.map((row: any) => (
                      String(row?.id || '') === String(updatedTask?.id || '')
                        ? { ...row, ...updatedTask }
                        : row
                    )));
                  }}
                  currentUser={{
                    id: profile.id,
                    fullName: createdByNameMap[String(profile.id || '')] || null,
                  }}
                />
              );
            }}
          />
        )}
        </div>
        {filteredTasks.length > MAX_ITEMS && (
          <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, tasks: !prev.tasks }))}>
            {showMore.tasks ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        )}
      </div>
    );
  };

  const renderResponsibilitiesPanel = (mode: 'list' | 'grid' = 'list') => {
    const data = showMore.responsibilities ? filteredResponsibilities : filteredResponsibilities.slice(0, MAX_ITEMS);

    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        {mode === 'grid' ? (
          <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm overflow-hidden">
            {renderCreatedAtSortControls(responsibilitySortDirection, setResponsibilitySortDirection)}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
              {responsibilityViews.map((view) => (
                <div
                  key={view.key}
                  onClick={() => {
                    setResponsibilityViewKey(view.key);
                    setShowMore((prev) => ({ ...prev, responsibilities: false }));
                  }}
                  className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                    responsibilityViewKey === view.key
                      ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                      : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {view.label}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loadingResponsibilities ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="مسئولیتی یافت نشد" />
        ) : mode === 'grid' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {data.map((item: any) => {
                const moduleConfig = MODULES[item.module_id];
                if (!moduleConfig) return null;
                const { imageField, tagsField, statusField, categoryField } = getModuleCardFields(moduleConfig);
                return (
                  <RenderCardItem
                    key={`${item.module_id}:${item.id}`}
                    item={item}
                    moduleId={item.module_id}
                    moduleConfig={moduleConfig}
                    imageField={imageField}
                    tagsField={tagsField}
                    statusField={statusField}
                    categoryField={categoryField}
                    allUsers={directoryUsers}
                    allRoles={directoryRoles}
                    selectedRowKeys={[]}
                    setSelectedRowKeys={() => undefined}
                    navigate={(path) => {
                      const [, moduleId, recordId] = String(path || '').split('/');
                      if (!moduleId || !recordId) return;
                      openPreviewRecord(
                        moduleId,
                        recordId,
                        recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ ...item, id: recordId, module_id: moduleId }, moduleId)
                      );
                    }}
                    canViewField={() => true}
                    hideSelection
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <List
            dataSource={data}
            renderItem={(item: any) => {
              const recordKey = `${item.module_id}:${item.id}`;
              const title = recordTitleMap[recordKey] || formatRecordLabel(item, item.module_id);
              const moduleConfig = MODULES[item.module_id];
              const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
              const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
              const statusLabel = resolveOptionLabel(item.status, statusField?.options) || resolveStatusLabelFallback(item.status);
              const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
              const assigneeLabel = item.assignee_type === 'role'
                ? (roleNameMap[String(getResolvedAssigneeId(item) || '')] || 'نقش')
                : (assigneeNameMap[String(getResolvedAssigneeId(item) || '')] || 'کاربر');
              const createdById = item.created_by || item.created_by_id;
              const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
              return (
                <div className="mb-2">
                  <div className="bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)] border border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                    <Link to={`/${item.module_id}/${item.id}`} className="text-sm text-gray-800 dark:text-gray-200" onClick={handleClose}>
                      {title}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryLabel ? (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {categoryLabel}
                        </span>
                      ) : null}
                      {statusLabel ? (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        {item.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                        {assigneeLabel}
                      </span>
                      <span>{safeJalaliFormat(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {createdByLabel ? (
                      <div className="text-[11px] text-gray-400 mt-1">
                        ایجاد کننده: {createdByLabel}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }}
          />
        )}

        {filteredResponsibilities.length > MAX_ITEMS ? (
          <Button type="link" onClick={() => setShowMore((prev) => ({ ...prev, responsibilities: !prev.responsibilities }))}>
            {showMore.responsibilities ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        ) : null}
      </div>
    );
  };

  const renderResponsibilities = () => {
    const data = showMore.responsibilities ? filteredResponsibilities : filteredResponsibilities.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm overflow-hidden">
          {renderCreatedAtSortControls(responsibilitySortDirection, setResponsibilitySortDirection)}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {responsibilityViews.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setResponsibilityViewKey(view.key);
                  setShowMore((prev) => ({ ...prev, responsibilities: false }));
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  responsibilityViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-md font-bold'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>
        {loadingResponsibilities ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="مسئولیتی یافت نشد" />
        ) : (
          <List
            dataSource={data}
            renderItem={(item: any) => {
              const recordKey = `${item.module_id}:${item.id}`;
              const title = recordTitleMap[recordKey] || formatRecordLabel(item, item.module_id);
              const moduleConfig = MODULES[item.module_id];
              const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
              const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
              const statusLabel = resolveOptionLabel(item.status, statusField?.options) || resolveStatusLabelFallback(item.status);
              const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
              const assigneeLabel = item.assignee_type === 'role'
                ? (roleNameMap[String(getResolvedAssigneeId(item) || '')] || 'نقش')
                : (assigneeNameMap[String(getResolvedAssigneeId(item) || '')] || 'کاربر');
              const createdById = item.created_by || item.created_by_id;
              const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
              return (
                <div className="mb-2">
                  <div className="bg-white dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)] border border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)] rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                    <Link to={`/${item.module_id}/${item.id}`} className="text-sm text-gray-800 dark:text-gray-200" onClick={handleClose}>
                      {title}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryLabel && (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {categoryLabel}
                        </span>
                      )}
                      {statusLabel && (
                        <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        {item.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                        {assigneeLabel}
                      </span>
                      <span>{safeJalaliFormat(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {createdByLabel && (
                      <div className="text-[11px] text-gray-400 mt-1">
                        ایجاد کننده: {createdByLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
        {filteredResponsibilities.length > MAX_ITEMS && (
          <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, responsibilities: !prev.responsibilities }))}>
            {showMore.responsibilities ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        )}
      </div>
    );
  };

  const contentDesktop = (
    <div className="w-[880px] max-w-[90vw] h-[90vh] p-4">
      <div className="grid grid-cols-3 gap-4 h-full min-h-0">
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]"> یادداشت‌ها</div>
          <Badge count={formatBadgeCount(notesCount)} color={badgeColor} />
        </div>
        {renderNotes()}
      </div>
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">فعالیت های من</div>
          <Badge count={formatBadgeCount(tasksCount)} color={badgeColor} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderTasks()}
        </div>
      </div>
      <div className="flex flex-col border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] rounded-2xl bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-[rgba(var(--brand-100-rgb),0.85)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.95)] border-b border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.18)]">
          <div className="font-bold text-[rgb(var(--brand-700-rgb))] dark:text-[rgb(var(--brand-300-rgb))]">مسئولیت‌های من</div>
          <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderResponsibilities()}
        </div>
      </div>
      </div>
    </div>
  );

  const contentMobile = (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-[rgb(var(--app-dark-surface-rgb))]">
      <Tabs
        activeKey={mobileActiveKey}
        onChange={(key) => setMobileActiveKey(key as 'notes' | 'tasks' | 'responsibilities')}
        className="h-full min-h-0 [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:min-h-0"
        items={[
          {
            key: 'notes',
            label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌ها</span></Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderNotes()}</div>,
          },
          {
            key: 'tasks',
            label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderTasks()}</div>,
          },
          {
            key: 'responsibilities',
            label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderResponsibilities()}</div>,
          },
        ]}
      />
    </div>
  );

  const contentDesktopModern = (
    <div className="w-[780px] max-w-[88vw] h-[90vh] p-3">
      <div className="h-full rounded-xl border border-[rgba(var(--brand-300-rgb),0.35)] dark:border-[rgba(var(--brand-300-rgb),0.22)] bg-[rgba(var(--brand-50-rgb),0.62)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.62)] overflow-hidden">
        <Tabs
          activeKey={desktopActiveKey}
          onChange={(key) => setDesktopActiveKey(key as 'notes' | 'tasks' | 'responsibilities')}
          className="h-full [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full"
          items={[
            {
              key: 'notes',
              label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌ها</span></Badge>,
              children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden">{renderNotesPanel('desktop')}</div>,
            },
            {
              key: 'tasks',
              label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
              children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden px-3 pb-3">{renderTasksPanel('grid')}</div>,
            },
            {
              key: 'responsibilities',
              label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
              children: <div className="h-[calc(90vh-120px)] flex flex-col overflow-hidden px-3 pb-3">{renderResponsibilitiesPanel('grid')}</div>,
            },
          ]}
        />
      </div>
    </div>
  );

  const contentMobileModern = (
    <div className="h-full min-h-0 flex flex-col bg-[rgb(var(--brand-50-rgb))] dark:bg-[rgb(var(--app-dark-surface-rgb))]">
      <Tabs
        activeKey={mobileActiveKey}
        onChange={(key) => setMobileActiveKey(key as 'notes' | 'tasks' | 'responsibilities')}
        className="h-full min-h-0 [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-content-holder]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:min-h-0"
        items={[
          {
            key: 'notes',
            label: <Badge count={formatBadgeCount(notesCount)} color={badgeColor}><span className="px-1">پیام‌ها</span></Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden">{renderNotesPanel('mobile')}</div>,
          },
          {
            key: 'tasks',
            label: <Badge count={formatBadgeCount(tasksCount)} color={badgeColor}>فعالیت‌های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2">{renderTasksPanel('grid')}</div>,
          },
          {
            key: 'responsibilities',
            label: <Badge count={formatBadgeCount(responsibilitiesCount)} color={badgeColor}>مسئولیت‌های من</Badge>,
            children: <div className="h-full min-h-0 flex flex-col overflow-hidden px-2 pb-2">{renderResponsibilitiesPanel('grid')}</div>,
          },
        ]}
      />
    </div>
  );
  void contentDesktop;
  void contentMobile;

  const drawerContainer = typeof document === 'undefined' ? undefined : () => document.body;

  return (
    <>
      <Badge count={formatBadgeCount(totalCount)} size="small" color={badgeColor}>
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined className="text-gray-500 dark:text-gray-400" />}
          onClick={() => setOpen(true)}
        />
      </Badge>

      {isMobile ? (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">اعلانات</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} className="text-white" />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="top"
          height="100dvh"
          open={open}
          onClose={requestDrawerClose}
          getContainer={drawerContainer}
          rootClassName="notifications-drawer"
          styles={{ body: mobileDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentMobileModern}
        </Drawer>
      ) : (
        <Drawer
          title={(
            <div className="flex items-center justify-between w-full pr-2">
              <span className="text-white">نوتیفیکیشن‌ها</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={refreshing} className="text-white" />}
                onClick={handleManualRefresh}
              />
            </div>
          )}
          placement="left"
          width={800}
          open={open}
          onClose={handleClose}
          getContainer={drawerContainer}
          rootClassName="notifications-drawer"
          styles={{ body: desktopDrawerBodyStyle, header: drawerHeaderStyle, content: drawerContentStyle }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentDesktopModern}
        </Drawer>
      )}
      {previewRecord ? (
        <RelatedRecordPopover
          moduleId={previewRecord.moduleId}
          recordId={previewRecord.recordId}
          label={previewRecord.label}
          mode="modal"
          open={!!previewRecord}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPreviewRecord(null);
          }}
          overlayZIndex={1200}
        />
      ) : null}
      {taskProcessTarget ? (
        <div className="hidden" aria-hidden="true">
          <ProductionStagesField
            key={`${taskProcessHostKey}-${String(taskProcessModalTask?.id || '')}`}
            recordId={taskProcessTarget.recordId}
            moduleId={taskProcessTarget.moduleId}
            autoOpenTaskId={taskProcessModalTask?.id ? String(taskProcessModalTask.id) : null}
            readOnly
            compact
            cardCompact
            allowReportEditInReadOnly
            lazyLoad
            onlyLineId={taskProcessTarget.lineId}
          />
        </div>
      ) : null}
      <Modal
        title={editingGroup ? 'ویرایش گروه' : 'ایجاد گروه جدید'}
        open={groupModalOpen}
        onCancel={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
          setGroupNameDraft('');
          setGroupMemberDrafts([]);
        }}
        onOk={handleSubmitGroup}
        confirmLoading={groupSubmitting}
        okText={editingGroup ? 'ذخیره' : 'ایجاد'}
        cancelText="انصراف"
      >
        <div className="space-y-3">
          <Input
            value={groupNameDraft}
            onChange={(event) => setGroupNameDraft(event.target.value)}
            placeholder="نام گروه"
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            value={groupMemberDrafts}
            onChange={(values) => setGroupMemberDrafts((values || []).map((value) => String(value)))}
            options={groupMemberOptions}
            optionFilterProp="label"
            placeholder="انتخاب اعضا و نقش‌ها"
            className="w-full"
            maxTagCount="responsive"
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 1400 } } }}
            listHeight={280}
          />
          <div className="text-xs text-gray-500">
            با انتخاب نقش، همه اعضای دارای آن نقش تا زمانی که همان نقش را داشته باشند عضو گروه می‌مانند.
          </div>
        </div>
      </Modal>
      <Modal
        title="فوروارد پیام"
        open={Boolean(forwardingNote)}
        onCancel={() => {
          setForwardingNote(null);
          setForwardTargetUserIds([]);
        }}
        onOk={submitForward}
        confirmLoading={forwardSubmitting}
        okText="فوروارد"
        cancelText="انصراف"
        okButtonProps={{ disabled: forwardTargetUserIds.length === 0 }}
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.7)] px-3 py-2 text-sm text-gray-700">
            {forwardingNote ? (parseNoteContent(forwardingNote.content).text || 'بدون متن') : ''}
          </div>
          <Select
            mode="multiple"
            showSearch
            allowClear
            value={forwardTargetUserIds}
            onChange={(values) => setForwardTargetUserIds((values || []).map((value) => String(value)))}
            placeholder="یک یا چند گیرنده انتخاب کنید"
            optionFilterProp="searchText"
            filterOption={(input, option) => String(option?.searchText || '').includes(String(input || '').trim().toLowerCase())}
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 1400 } } }}
            options={forwardTargetOptions}
            maxTagCount="responsive"
            className="w-full"
          />
        </div>
      </Modal>
    </>
  );
};

export default NotificationsPopover;
