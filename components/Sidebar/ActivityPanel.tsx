import React, { useEffect, useState } from 'react';
import { App, Button, Checkbox, Empty, List, Spin, Tag, Timeline } from 'antd';
import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import SharedNoteCard from '../notes/SharedNoteCard';
import SharedNoteComposer from '../notes/SharedNoteComposer';
import { parseNoteContent, serializeNoteContent } from '../../utils/noteContent';
import type { NoteAttachment } from '../../utils/noteContent';
import { ensureNoteAttachmentShortcuts, uploadNoteAttachments } from '../../utils/noteAttachments';
import { normalizeNoteScope } from '../../utils/noteScope';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { RelationQuickCreateHost } from '../SmartFieldRenderer';
import { applyTaskSourceRecordFilter, buildTaskSourceInitialValues } from '../../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';
import TaskSummaryCard from '../tasks/TaskSummaryCard';
import {
  buildRelationValueMap,
  combineRelationValueMaps,
  formatRecordDisplayValue,
  parseMaybeJsonValue,
  RelationValueMap,
} from '../../utils/recordDisplayFormatter';
import { NOTES_UPDATED_EVENT } from '../../utils/aiAssistantEvents';
import { insertNotesWithFallback, sendNoteSmsNotifications, sendInvoiceReplySmsToCustomer } from '../../utils/noteDispatch';
import {
  getActivityActionLabel,
  getActivityFieldLabel,
  logAndTouchRecord,
  sanitizeActivityText,
} from '../../utils/recordActivity';

interface ActivityPanelProps {
  moduleId: string;
  recordId: string;
  view: 'notes' | 'tasks' | 'changelogs';
  recordName?: string;
  mentionUsers?: any[];
  mentionRoles?: any[];
  moduleConfig?: any;
}

const isAiNote = (note: any) =>
  String(note?.source_type || '').trim() === 'ai'
  || String(note?.metadata?.source_type || '').trim() === 'ai'
  || String(note?.author_name || '').trim() === 'دستیار هوشمند';

const ActivityPanel: React.FC<ActivityPanelProps> = ({
  moduleId,
  recordId,
  view,
  recordName = '',
  mentionUsers = [],
  mentionRoles = [],
  moduleConfig,
}) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState('');
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionMap, setMentionMap] = useState<Record<string, { label: string; type: 'user' | 'team' }>>({});
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingLinkedAttachments, setPendingLinkedAttachments] = useState<NoteAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [smsNotificationEnabled, setSmsNotificationEnabled] = useState(false);
  const [sendPublicToCustomer, setSendPublicToCustomer] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string | null; full_name: string | null; avatar_url?: string | null }>({ id: null, full_name: null, avatar_url: null });
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});
  const [authorAvatarMap, setAuthorAvatarMap] = useState<Record<string, string | null>>({});
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [changeRelationValueMap, setChangeRelationValueMap] = useState<RelationValueMap>({});

  const tasksModuleConfig = MODULES.tasks;
  const statusOptions = tasksModuleConfig?.fields?.find((field: any) => field.key === 'status')?.options || [];
  const priorityOptions = tasksModuleConfig?.fields?.find((field: any) => field.key === 'priority')?.options || [];

  const formatPersianDate = (value: unknown, format: string) => {
    if (!value) return '-';
    try {
      const jsDate = new Date(value as any);
      if (Number.isNaN(jsDate.getTime())) return '-';
      return new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa).format(format);
    } catch {
      return '-';
    }
  };

  const getActionColor = (action: string) => {
    if (action === 'create') return '#16a34a';
    if (action === 'update') return 'rgb(var(--brand-500-rgb))';
    if (action === 'delete') return '#dc2626';
    return '#64748b';
  };

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return 'خالی';
    if (typeof value === 'object') {
      return 'جزئیات ثبت‌شده';
    }
    return sanitizeActivityText(value, 'مقدار ثبت‌شده');
  };

  const parseMaybeJson = (value: any) => parseMaybeJsonValue(value);

  const getFieldDef = (fieldKey?: string) => {
    if (!fieldKey) return null;
    return moduleConfig?.fields?.find((field: any) => field.key === fieldKey) || null;
  };

  const getTableDef = (blockId?: string) => (
    moduleConfig?.blocks?.find((block: any) => String(block?.id || '') === String(blockId || ''))
      || null
  );

  const getTableColumnDef = (blockId?: string, columnKey?: string) => {
    const tableDef = getTableDef(blockId);
    if (!tableDef?.tableColumns?.length) return null;
    return tableDef.tableColumns.find((column: any) => String(column?.key || '') === String(columnKey || '')) || null;
  };

  const resolveOptionLabel = (value: any, fieldDef: any) => {
    if (!fieldDef?.options?.length) return null;
    const option = fieldDef.options.find((item: any) => String(item.value) === String(value));
    return option?.label || null;
  };

  const formatChangeValue = (rawValue: unknown, fieldDef: any): string => {
    const value = parseMaybeJson(rawValue);
    if (value === null || value === undefined || value === '') return 'خالی';

    if (Array.isArray(value)) {
      return value
        .map((item) => resolveOptionLabel(item, fieldDef) || formatChangeValue(item, fieldDef))
        .join(', ');
    }

    if (typeof value === 'object') {
      const objectValue = value as any;
      if (objectValue?.label) return objectValue.label;
      if (objectValue?.value) return resolveOptionLabel(objectValue.value, fieldDef) || formatValue(objectValue.value);
      return formatValue(value);
    }

    if (fieldDef?.type === 'price') return formatPersianPrice(value);
    if (fieldDef?.type === 'number') return toPersianNumber(value);
    if (fieldDef?.type === 'date') return safeJalaliFormat(value, 'YYYY/MM/DD');
    if (fieldDef?.type === 'datetime') return safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    if (fieldDef?.type === 'time') return toPersianNumber(String(value));

    return resolveOptionLabel(value, fieldDef) || formatValue(value);
  };

  const formatChangeDisplayValue = (rawValue: unknown, fieldDef: any): string => {
    const value = parseMaybeJson(rawValue);
    return formatRecordDisplayValue(value, fieldDef, changeRelationValueMap, 'خالی');
  };

  const formatChangeTableRows = (rows: any[], tableDef: any): string => {
    if (!Array.isArray(rows) || !tableDef?.tableColumns?.length) return formatValue(rows);
    return rows
      .map((row) => tableDef.tableColumns
        .map((column: any) => {
          const value = row?.[column.key];
          if (value === undefined || value === null || value === '') return null;
          return `${column.title}: ${formatRecordDisplayValue(value, column, changeRelationValueMap, 'خالی')}`;
        })
        .filter(Boolean)
        .join(' | '))
      .filter(Boolean)
      .join('\n');
  };

  const buildTaskInitialValues = () => buildTaskSourceInitialValues(moduleId, recordId);

  useEffect(() => {
    void fetchData();
  }, [moduleId, recordId, view]);

  useEffect(() => {
    if (view !== 'notes') {
      setMentionPickerOpen(false);
      setPendingFiles([]);
      setReplyToId(null);
    }
  }, [view]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const snapshot = await fetchSessionBootstrap(supabase);
        setCurrentUser({
          id: snapshot.user?.id ? String(snapshot.user.id) : null,
          full_name: snapshot.profile?.full_name || null,
          avatar_url: snapshot.profile?.avatar_url || null,
        });
      } catch (err) {
        console.error(err);
      }
    };
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    const buildMentions = (profiles: any[], roles: any[]) => {
      const profileOptions = (profiles || []).map((profile: any) => ({
        label: `عضو: ${profile.full_name || profile.display_name || 'بدون نام'}`,
        value: `user:${profile.id}`,
        avatarUrl: profile.avatar_url || null,
      }));
      const roleOptions = (roles || []).map((role: any) => ({
        label: `تیم: ${role.title || role.name || 'بدون نام'}`,
        value: `role:${role.id}`,
      }));

      const nextMap: Record<string, { label: string; type: 'user' | 'team' }> = {};
      (profiles || []).forEach((profile: any) => {
        nextMap[profile.id] = { label: profile.full_name || profile.display_name || 'بدون نام', type: 'user' };
      });
      (roles || []).forEach((role: any) => {
        nextMap[role.id] = { label: role.title || role.name || 'بدون نام', type: 'team' };
      });

      setMentionMap(nextMap);
      setMentionOptions([...profileOptions, ...roleOptions]);
    };

    const isMissingColumnError = (error: any, columnName: string) => {
      const code = String(error?.code || '').toUpperCase();
      if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
      const messageText = String(error?.message || error?.details || error?.hint || '').toLowerCase();
      const column = columnName.toLowerCase();
      return (
        messageText.includes(`column "${column}"`)
        || messageText.includes(`${column} does not exist`)
        || (messageText.includes('schema cache') && messageText.includes(column))
      );
    };

    const normalizeRoleRows = (rows: any[]) => (
      (rows || []).map((row: any) => ({
        id: row?.id,
        title: String(row?.title || row?.name || row?.id || '').trim(),
      }))
    );

    const fetchRoles = async () => {
      const primary = await supabase.from('org_roles').select('*').limit(200);
      if (!primary.error) return normalizeRoleRows(primary.data || []);

      if (isMissingColumnError(primary.error, 'title')) {
        const byName = await supabase.from('org_roles').select('*').limit(200);
        if (!byName.error) return normalizeRoleRows(byName.data || []);
      }

      return [] as Array<{ id: string; title: string }>;
    };

    const loadProfiles = async () => {
      setMentionsLoading(true);
      try {
        const [{ data: profiles, error: profilesError }, roles] = await Promise.all([
          supabase.from('profiles').select('id, full_name, avatar_url').order('full_name', { ascending: true }).limit(200),
          fetchRoles(),
        ]);

        if (profilesError) {
          console.error(profilesError);
        }

        buildMentions(profiles || [], roles || []);
      } catch (err) {
        console.error(err);
        message.error('دریافت اعضا/تیم‌ها ناموفق بود');
      } finally {
        setMentionsLoading(false);
      }
    };

    if (view !== 'notes') return;
    if (mentionUsers.length || mentionRoles.length) {
      buildMentions(mentionUsers, mentionRoles);
      return;
    }
    void loadProfiles();
  }, [mentionRoles, mentionUsers, view]);

  useEffect(() => {
    if (view !== 'tasks') return;
    let cancelled = false;

    const loadAssigneeDirectory = async () => {
      try {
        const directory = await fetchAssigneeDirectory(supabase);
        if (cancelled) return;
        setAssigneeNameMap(
          directory.users.reduce<Record<string, string>>((acc, user) => {
            acc[user.id] = user.display_name || user.full_name || user.id;
            return acc;
          }, {}),
        );
        setRoleNameMap(
          directory.roles.reduce<Record<string, string>>((acc, role) => {
            acc[role.id] = role.title || role.id;
            return acc;
          }, {}),
        );
      } catch (err) {
        console.warn('Failed loading assignee directory for activity panel', err);
      }
    };

    void loadAssigneeDirectory();
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'changelogs' || !items.length) {
      setChangeRelationValueMap({});
      return;
    }

    let cancelled = false;

    const uniqueByKey = (fields: any[]) => {
      const map = new Map<string, any>();
      fields.forEach((field) => {
        const key = String(field?.key || '').trim();
        if (key && !map.has(key)) map.set(key, field);
      });
      return Array.from(map.values());
    };

    const loadChangelogRelations = async () => {
      try {
        const directFields: any[] = [];
        const directRows: any[] = [];
        const tableFields: any[] = [];
        const tableRows: any[] = [];

        items.forEach((log: any) => {
          const metadata = log?.metadata && typeof log.metadata === 'object' ? log.metadata : {};
          const fieldDef = metadata?.columnKey
            ? getTableColumnDef(log.field_name, metadata.columnKey)
            : getFieldDef(log.field_name);
          if (fieldDef?.key) {
            directFields.push(fieldDef);
            directRows.push({ [fieldDef.key]: parseMaybeJson(log.old_value) });
            directRows.push({ [fieldDef.key]: parseMaybeJson(log.new_value) });
          }

          const tableDef = getTableDef(log.field_name);
          if (!tableDef?.tableColumns?.length) return;

          tableFields.push(...tableDef.tableColumns);
          const oldRows = parseMaybeJson(log.old_value);
          const newRows = parseMaybeJson(log.new_value);
          if (Array.isArray(oldRows)) tableRows.push(...oldRows);
          if (Array.isArray(newRows)) tableRows.push(...newRows);
        });

        const [directMap, tableMap] = await Promise.all([
          buildRelationValueMap(supabase, uniqueByKey(directFields), directRows),
          buildRelationValueMap(supabase, uniqueByKey(tableFields), tableRows),
        ]);

        if (!cancelled) {
          setChangeRelationValueMap(combineRelationValueMaps(directMap, tableMap));
        }
      } catch (err) {
        console.warn('Failed loading changelog relation labels', err);
        if (!cancelled) setChangeRelationValueMap({});
      }
    };

    void loadChangelogRelations();
    return () => {
      cancelled = true;
    };
  }, [items, moduleConfig, view]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === 'changelogs') {
        const { data, error } = await supabase
          .from('changelogs')
          .select('*')
          .eq('module_id', moduleId)
          .eq('record_id', recordId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        const rows = data || [];
        setItems(rows);

        const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const directory = await fetchAssigneeDirectory(supabase);
          const nextMap: Record<string, string> = {};
          const nextAvatarMap: Record<string, string | null> = {};
          directory.users.forEach((row) => {
            if (!userIds.includes(row.id)) return;
            nextMap[row.id] = row.display_name || row.full_name || 'کاربر سیستم';
            nextAvatarMap[row.id] = row.avatar_url || null;
          });
          setAuthorNameMap(nextMap);
          setAuthorAvatarMap(nextAvatarMap);
        } else {
          setAuthorNameMap({});
          setAuthorAvatarMap({});
        }
        return;
      }

      if (view === 'notes') {
        const { data, error } = await supabase
          .from('notes')
          .select('id, module_id, record_id, content, mention_user_ids, mention_role_ids, reply_to, author_id, author_name, source_type, metadata, is_edited, edited_at, created_at')
          .eq('module_id', moduleId)
          .eq('record_id', recordId)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;
        const notes = data || [];
        setItems(notes);

        const authorIds = Array.from(new Set(notes.map((note: any) => note.author_id).filter(Boolean)));
        if (authorIds.length > 0) {
          const directory = await fetchAssigneeDirectory(supabase);
          const nextMap: Record<string, string> = {};
          const nextAvatarMap: Record<string, string | null> = {};
          directory.users.forEach((row) => {
            if (!authorIds.includes(row.id)) return;
            nextMap[row.id] = row.display_name || row.full_name || 'کاربر سیستم';
            nextAvatarMap[row.id] = row.avatar_url || null;
          });
          setAuthorNameMap(nextMap);
          setAuthorAvatarMap(nextAvatarMap);
        } else {
          setAuthorNameMap({});
          setAuthorAvatarMap({});
        }
        return;
      }

      let query = supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      query = applyTaskSourceRecordFilter(query, moduleId, recordId);

      const { data, error } = await query;

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error(err);
      message.error('دریافت اطلاعات با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };
  const shouldAnimateChatEntry = (createdAt: unknown) => {
    const time = new Date(createdAt as any).getTime();
    if (!Number.isFinite(time)) return false;
    return Date.now() - time <= 12_000;
  };

  useEffect(() => {
    if (view !== 'notes') return;
    const handleNotesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ moduleId?: string; recordId?: string }>).detail || {};
      if (
        detail.moduleId
        && detail.recordId
        && (String(detail.moduleId) !== String(moduleId) || String(detail.recordId) !== String(recordId))
      ) {
        return;
      }
      void fetchData();
    };
    window.addEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated as EventListener);
    return () => window.removeEventListener(NOTES_UPDATED_EVENT, handleNotesUpdated as EventListener);
  }, [moduleId, recordId, view]);

  const parseMentionValues = (values: string[]) => {
    const mention_user_ids: string[] = [];
    const mention_role_ids: string[] = [];
    (values || []).forEach((value) => {
      if (value.startsWith('user:')) mention_user_ids.push(value.replace('user:', ''));
      if (value.startsWith('role:')) mention_role_ids.push(value.replace('role:', ''));
    });
    return { mention_user_ids, mention_role_ids };
  };

  const handleSubmit = async () => {
    if (view !== 'notes') return;
    if (!newItem.trim() && pendingFiles.length === 0 && pendingLinkedAttachments.length === 0) return;

    setLoading(true);
    try {
      const { mention_user_ids, mention_role_ids } = parseMentionValues(mentionValues);
      const scope = normalizeNoteScope(moduleId, recordId);
      const attachments = pendingFiles.length > 0
        ? await uploadNoteAttachments(scope.hasLinkedRecord ? scope.module_id : null, scope.hasLinkedRecord ? scope.record_id : null, pendingFiles)
        : [];
      const mergedAttachments = [...pendingLinkedAttachments, ...attachments].filter((attachment, index, all) => {
        const url = String(attachment?.url || '').trim();
        return url && all.findIndex((item) => String(item?.url || '').trim() === url) === index;
      });
      if (pendingLinkedAttachments.length > 0) {
        await ensureNoteAttachmentShortcuts(scope.module_id, scope.record_id, pendingLinkedAttachments);
      }
      const replyTargetNote = replyToId ? items.find((note: any) => note.id === replyToId) : null;
      const replyTargetIsOnlineInvoice = Boolean(
        replyTargetNote &&
        ['online_invoice', 'online_invoice_confirm'].includes(String(replyTargetNote?.metadata?.source || ''))
      );
      const isPublicReply = replyTargetIsOnlineInvoice && sendPublicToCustomer;

      const payload = {
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(newItem, mergedAttachments),
        reply_to: replyToId || null,
        mention_user_ids,
        mention_role_ids,
        author_id: currentUser.id,
        author_name: currentUser.full_name,
        created_at: new Date().toISOString(),
        ...(isPublicReply ? { is_public: true } : {}),
      } as any;

      await insertNotesWithFallback([payload]);
      if (smsNotificationEnabled) {
        if (isPublicReply) {
          await sendInvoiceReplySmsToCustomer({
            moduleId: scope.module_id,
            recordId: scope.record_id,
            recordName: recordName || '',
            systemCode: String(replyTargetNote?.metadata?.system_code || ''),
          });
        } else {
          await sendNoteSmsNotifications({
            authorName: String(currentUser.full_name || '').trim() || 'کاربر',
            noteText: newItem,
            mentionUserIds: mention_user_ids,
            mentionRoleIds: mention_role_ids,
            moduleId: scope.module_id,
            recordId: scope.record_id,
          });
        }
      }

      message.success('یادداشت ثبت شد');
      setNewItem('');
      setMentionValues([]);
      setMentionPickerOpen(false);
      setPendingFiles([]);
      setPendingLinkedAttachments([]);
      setReplyToId(null);
      setSmsNotificationEnabled(false);
      setSendPublicToCustomer(false);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('ثبت با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setEditingValue(parseNoteContent(item.content).text);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const sourceItem = items.find((item: any) => String(item?.id) === String(editingId));
      const parsed = parseNoteContent(sourceItem?.content);
      const { error } = await supabase
        .from('notes')
        .update({
          content: serializeNoteContent(editingValue, parsed.attachments),
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', editingId);
      if (error) throw error;
      setEditingId(null);
      setEditingValue('');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('ویرایش ناموفق بود');
    }
  };

  const handleDelete = async (rowId: string) => {
    try {
      const table = view === 'notes' ? 'notes' : 'tasks';
      const { error } = await supabase.from(table).delete().eq('id', rowId);
      if (error) throw error;
      message.success('حذف شد');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('حذف با خطا مواجه شد');
    }
  };

  if (loading && items.length === 0) {
    return <div className="flex justify-center p-10"><Spin /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {view === 'notes' && 'یادداشت‌ها'}
          {view === 'tasks' && 'فعالیت ها'}
          {view === 'changelogs' && 'تاریخچه تغییرات'}
        </div>
        {recordName ? (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
            {recordName}
          </div>
        ) : null}
      </div>

      {view === 'notes' ? (
        <div className="mb-6 overflow-hidden rounded-2xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.52)] dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.52)]">
          <SharedNoteComposer
            value={newItem}
            onChange={setNewItem}
            onSubmit={handleSubmit}
            mentionOptions={mentionOptions}
            mentionValues={mentionValues}
            onMentionChange={(values) => setMentionValues(values || [])}
            mentionsLoading={mentionsLoading}
            mentionPickerOpen={mentionPickerOpen}
            onToggleMentionPicker={() => setMentionPickerOpen((prev) => !prev)}
            attachments={pendingFiles}
            linkedAttachments={pendingLinkedAttachments}
            onFilesSelected={(files) => {
              setPendingFiles((prev) => {
                const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
                files.forEach((file) => {
                  map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveAttachment={(fileName) => {
              setPendingFiles((prev) => prev.filter((file) => file.name !== fileName));
            }}
            onLinkedAttachmentsSelected={(attachments) => {
              setPendingLinkedAttachments((prev) => {
                const map = new Map(prev.map((attachment) => [String(attachment.url || ''), attachment]));
                attachments.forEach((attachment) => {
                  const url = String(attachment.url || '').trim();
                  if (url) map.set(url, attachment);
                });
                return Array.from(map.values());
              });
            }}
            onRemoveLinkedAttachment={(url) => {
              setPendingLinkedAttachments((prev) => prev.filter((attachment) => String(attachment.url || '') !== String(url || '')));
            }}
            filePickerModuleId={moduleId}
            filePickerRecordId={recordId}
            replyActive={Boolean(replyToId)}
            onClearReply={() => { setReplyToId(null); setSendPublicToCustomer(false); }}
            smsNotificationEnabled={smsNotificationEnabled}
            onSmsNotificationChange={setSmsNotificationEnabled}
            extraActions={(() => {
              if (!replyToId) return undefined;
              const replyTarget = items.find((n: any) => n.id === replyToId);
              const isOnlineInvoice = replyTarget && ['online_invoice', 'online_invoice_confirm'].includes(
                String(replyTarget?.metadata?.source || '')
              );
              if (!isOnlineInvoice) return undefined;
              return (
                <Checkbox
                  checked={sendPublicToCustomer}
                  onChange={(e) => setSendPublicToCustomer(e.target.checked)}
                  className="mr-2 whitespace-nowrap text-[11px]"
                >
                  ارسال در فاکتور برای مشتری
                </Checkbox>
              );
            })()}
            submitDisabled={!newItem.trim() && pendingFiles.length === 0 && pendingLinkedAttachments.length === 0}
          />
        </div>
      ) : null}

      {view === 'tasks' ? (
        <div className="mb-5 flex justify-end">
          <Button type="primary" onClick={() => setQuickTaskOpen(true)}>
            افزودن سریع فعالیت
          </Button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <Empty description="موردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <>
            {view === 'notes' ? (
              <List
                dataSource={items}
                renderItem={(item: any) => {
                  const parsedContent = parseNoteContent(item.content);
                  const isAi = isAiNote(item);
                  const isSystem = String(item?.source_type || '').trim() === 'system'
                    || String(item?.metadata?.source_type || '').trim() === 'system';
                  const isOnlineInvoiceNote = ['online_invoice', 'online_invoice_confirm'].includes(
                    String(item?.metadata?.source || '')
                  );
                  const sourceLabel = isOnlineInvoiceNote
                    ? (moduleId === 'purchase_invoices' ? 'پیام تامین‌کننده' : 'پیام مشتری')
                    : undefined;
                  const authorName = isAi ? 'دستیار هوشمند' : (item.author_name || authorNameMap[item.author_id] || 'کاربر سیستم');
                  const authorAvatarUrl = isAi
                    ? null
                    : (String(item.author_id || '') === String(currentUser.id || '')
                      ? currentUser.avatar_url || authorAvatarMap[item.author_id] || null
                      : authorAvatarMap[item.author_id] || null);
                  const replyTarget = items.find((note) => note.id === item.reply_to);
                  const replyAuthorName = replyTarget
                    ? (isAiNote(replyTarget) ? 'دستیار هوشمند' : (replyTarget.author_name || authorNameMap[replyTarget.author_id] || 'کاربر سیستم'))
                    : null;
                  const mentionUsers = (item.mention_user_ids || []).map((id: string) => mentionMap[id]?.label || id);
                  const mentionRoles = (item.mention_role_ids || []).map((id: string) => mentionMap[id]?.label || id);

                  return (
                    <div className="mb-3">
                      <SharedNoteCard
                        authorName={authorName}
                        createdAtLabel={formatPersianDate(item.created_at, 'YYYY/MM/DD HH:mm')}
                        text={parsedContent.text}
                        attachments={parsedContent.attachments}
                        avatarUrl={authorAvatarUrl}
                        mentionUsers={mentionUsers}
                        mentionRoles={mentionRoles}
                        variant={isAi ? 'ai' : 'default'}
                        animateOnMount={shouldAnimateChatEntry(item.created_at)}
                        renderTemplateBold={isSystem}
                        replyText={replyTarget ? parseNoteContent(replyTarget.content).text : null}
                        replyAuthorName={replyAuthorName}
                        isEditing={editingId === item.id}
                        editingValue={editingValue}
                        onEditingChange={setEditingValue}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={() => {
                          setEditingId(null);
                          setEditingValue('');
                        }}
                        isEdited={Boolean(item.is_edited)}
                        sourceLabel={sourceLabel}
                        onReply={() => setReplyToId(item.id)}
                        onEdit={isAi ? undefined : () => handleEdit(item)}
                        onDelete={isAi ? undefined : () => handleDelete(item.id)}
                      />
                    </div>
                  );
                }}
              />
            ) : null}

            {view === 'tasks' ? (
              <List
                dataSource={items}
                renderItem={(item: any) => (
                  <TaskSummaryCard
                    task={item}
                    statusOptions={statusOptions}
                    priorityOptions={priorityOptions}
                    assigneeNameMap={assigneeNameMap}
                    roleNameMap={roleNameMap}
                    recordTitle={recordName || null}
                    onStatusChange={async (taskId, status) => {
                      const previousTask = item ? { ...item } : null;
                      setItems((prev) => prev.map((row: any) => (
                        String(row?.id || '') === String(taskId)
                          ? { ...row, status }
                          : row
                      )));
                      try {
                        const updatedTask = await updateTaskStatusWithAutomation({
                          taskId,
                          nextStatus: status,
                          previousTask: item,
                          currentUser: {
                            id: currentUser.id,
                            fullName: currentUser.full_name,
                          },
                        });
                        setItems((prev) => prev.map((row: any) => (
                          String(row?.id || '') === String(taskId)
                            ? { ...row, ...updatedTask }
                            : row
                        )));
                        await logAndTouchRecord({
                          supabase,
                          moduleId,
                          recordId,
                          action: 'process_updated',
                          fieldName: 'tasks',
                          fieldLabel: 'فعالیت‌ها',
                          oldValue: item?.status ?? null,
                          newValue: updatedTask?.status ?? status,
                          userId: currentUser.id,
                          metadata: {
                            changeKind: 'task_status_updated',
                            summary: 'وضعیت یکی از فعالیت‌ها تغییر کرد',
                          },
                        });
                      } catch (error) {
                        if (previousTask) {
                          setItems((prev) => prev.map((row: any) => (
                            String(row?.id || '') === String(taskId)
                              ? { ...row, ...previousTask }
                              : row
                          )));
                        }
                        throw error;
                      }
                    }}
                    onProducedQtyChange={async (taskId, value) => {
                      const nextProducedQty = Math.max(0, Number(value || 0));
                      const { error } = await supabase
                        .from('tasks')
                        .update({ produced_qty: nextProducedQty })
                        .eq('id', taskId);
                      if (error) throw error;
                      await logAndTouchRecord({
                        supabase,
                        moduleId,
                        recordId,
                        action: 'process_updated',
                        fieldName: 'tasks',
                        fieldLabel: 'فعالیت‌ها',
                        oldValue: null,
                        newValue: `${toPersianNumber(nextProducedQty)} عدد`,
                        userId: currentUser.id,
                        metadata: {
                          changeKind: 'task_updated',
                          summary: 'مقدار تولید فعالیت بروزرسانی شد',
                        },
                      });
                      await fetchData();
                    }}
                    onTaskUpdated={async () => {
                      await logAndTouchRecord({
                        supabase,
                        moduleId,
                        recordId,
                        action: 'process_updated',
                        fieldName: 'tasks',
                        fieldLabel: 'فعالیت‌ها',
                        oldValue: null,
                        newValue: null,
                        userId: currentUser.id,
                        metadata: {
                          changeKind: 'task_updated',
                          summary: 'جزئیات یکی از فعالیت‌ها بروزرسانی شد',
                        },
                      });
                      await fetchData();
                    }}
                    currentUser={{
                      id: currentUser.id,
                      fullName: currentUser.full_name,
                    }}
                  />
                )}
              />
            ) : null}

            {view === 'changelogs' ? (
              <Timeline
                items={items.map((log: any) => {
                  const action = String(log.action || 'update');
                  const metadata = log?.metadata && typeof log.metadata === 'object' ? log.metadata : {};
                  const tableDef = getTableDef(log.field_name);
                  const columnDef = metadata?.columnKey ? getTableColumnDef(log.field_name, metadata.columnKey) : null;
                  const fieldTitle = sanitizeActivityText(
                    metadata?.columnLabel
                    || log.field_label
                    || getActivityFieldLabel(moduleId, log.field_name, log.field_label)
                  , 'فیلد نامشخص');
                  const fieldDef = columnDef || getFieldDef(log.field_name);
                  const actor = log.user_name || authorNameMap[log.user_id] || 'سیستم';
                  const summary = sanitizeActivityText(
                    metadata?.summary
                    || (tableDef
                      ? `تغییری در جدول «${sanitizeActivityText(log.field_label || metadata?.blockLabel || 'جدول', 'جدول')}» ثبت شد`
                      : `«${fieldTitle}» تغییر کرد`)
                  , 'تغییر ثبت شد');
                  const isTableRowAdded = action === 'table_row_added';
                  const isTableRowRemoved = action === 'table_row_removed';
                  const isTableCellUpdated = action === 'table_cell_updated';
                  const isFileEvent = action === 'file_attached' || action === 'file_removed';
                  const isSimpleSummaryEvent = ['process_template_applied', 'project_auto_referred', 'task_created', 'process_updated', 'tags_updated'].includes(action) || isFileEvent;
                  const hasDiff = (log.old_value !== null || log.new_value !== null);

                  return {
                    color: getActionColor(action),
                    children: (
                      <div className="pb-4 mt-1">
                        <div className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.8)] p-3 shadow-sm dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.75)]">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-gray-800 dark:text-gray-100">{actor}</span>
                            <Tag
                              className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[11px]"
                              style={{
                                backgroundColor: `${getActionColor(action)}18`,
                                color: getActionColor(action),
                              }}
                            >
                              {getActivityActionLabel(action)}
                            </Tag>
                            <span className="text-[10px] text-gray-400">{formatPersianDate(log.created_at, 'HH:mm - YYYY/MM/DD')}</span>
                          </div>

                          {log.record_title || recordName ? (
                            <div className="text-[11px] text-gray-500 mb-2 truncate">
                              {sanitizeActivityText(log.record_title || recordName, 'رکورد')}
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.65)] bg-white/80 p-3 text-[12px] text-gray-700 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-white/5 dark:text-gray-200">
                            <div className="mb-2">
                              {summary}
                            </div>
                            {isSimpleSummaryEvent && log.new_value ? (
                              <div className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700 whitespace-pre-wrap dark:bg-emerald-500/10 dark:text-emerald-300">
                                {sanitizeActivityText(parseMaybeJson(log.new_value), 'جزئیات ثبت شد')}
                              </div>
                            ) : null}
                            {isTableRowAdded && tableDef ? (
                              <div className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700 whitespace-pre-wrap dark:bg-emerald-500/10 dark:text-emerald-300">
                                {formatChangeTableRows([parseMaybeJson(log.new_value) || {}], tableDef)}
                              </div>
                            ) : null}
                            {isTableRowRemoved && tableDef ? (
                              <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 whitespace-pre-wrap dark:bg-rose-500/10 dark:text-rose-300">
                                {formatChangeTableRows([parseMaybeJson(log.old_value) || {}], tableDef)}
                              </div>
                            ) : null}
                            {isTableCellUpdated ? (
                              <div className="space-y-1">
                                <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 line-through whitespace-pre-wrap dark:bg-rose-500/10 dark:text-rose-300">
                                  {formatChangeDisplayValue(log.old_value, fieldDef)}
                                </div>
                                <div className="text-center text-gray-400">↓</div>
                                <div className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700 whitespace-pre-wrap dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {formatChangeDisplayValue(log.new_value, fieldDef)}
                                </div>
                              </div>
                            ) : null}
                            {!isSimpleSummaryEvent && !isTableRowAdded && !isTableRowRemoved && !isTableCellUpdated && hasDiff ? (
                              <div className="space-y-1">
                                <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 line-through whitespace-pre-wrap dark:bg-rose-500/10 dark:text-rose-300">
                                  {tableDef ? formatChangeTableRows(parseMaybeJson(log.old_value) || [], tableDef) : formatChangeDisplayValue(log.old_value, fieldDef)}
                                </div>
                                <div className="text-center text-gray-400">↓</div>
                                <div className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700 whitespace-pre-wrap dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {tableDef ? formatChangeTableRows(parseMaybeJson(log.new_value) || [], tableDef) : formatChangeDisplayValue(log.new_value, fieldDef)}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ),
                  };
                })}
              />
            ) : null}
          </>
        )}
      </div>

      {view === 'tasks' ? (
        <RelationQuickCreateHost
          open={quickTaskOpen}
          targetModuleId="tasks"
          label="فعالیت"
          forceInline
          initialValues={buildTaskInitialValues()}
          onCancel={() => setQuickTaskOpen(false)}
          onCreated={async ({ values }) => {
            await logAndTouchRecord({
              supabase,
              moduleId,
              recordId,
              action: 'task_created',
              fieldName: 'tasks',
              fieldLabel: 'فعالیت‌ها',
              oldValue: null,
              newValue: values?.name || 'فعالیت جدید',
              userId: currentUser.id,
              metadata: {
                changeKind: 'task_created',
                summary: 'فعالیت جدیدی برای این رکورد ایجاد شد',
              },
            });
            await fetchData();
          }}
        />
      ) : null}
    </div>
  );
};

export default ActivityPanel;
