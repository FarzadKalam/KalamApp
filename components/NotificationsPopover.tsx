import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Drawer, Empty, Input, InputNumber, List, Select, Skeleton, Tabs } from 'antd';
import { BellOutlined, PlusOutlined, UserOutlined, TeamOutlined, MessageOutlined, CloseOutlined, EditOutlined, DeleteOutlined, RollbackOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import QrScanPopover from './QrScanPopover';
import ProductionStagesField from './ProductionStagesField';

interface NotificationsPopoverProps {
  isMobile: boolean;
}

const MAX_ITEMS = 10;
const SEEN_NOTES_STORAGE_KEY = 'notif_seen_notes_v1';
const SEEN_TASKS_STORAGE_KEY = 'notif_seen_tasks_v1';
const SEEN_RESP_STORAGE_KEY = 'notif_seen_responsibilities_v1';
const SEEN_COMPLETED_TASKS_STORAGE_KEY = 'notif_seen_completed_tasks_v1';

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

const formatRecordLabel = (row: any) => {
  if (!row) return '';
  const primary = row.full_name || row.name || row.title || row.system_code || row.id;
  const code = row.system_code && primary !== row.system_code ? ` - ${row.system_code}` : '';
  const label = `${primary || row.id}`;
  if ((label === row.id || !primary) && UUID_REGEX.test(String(row.id || label))) {
    return row.system_code || 'رکورد';
  }
  return `${label}${code}`;
};

const sendBrowserNotification = (title: string, body: string, link?: string) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const notification = new Notification(title, { body, tag: `${title}-${body}` });
  if (link) {
    notification.onclick = () => {
      window.focus();
      window.location.href = link;
      notification.close();
    };
  }
};


const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({ isMobile }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [responsibilities, setResponsibilities] = useState<any[]>([]);
  const [showMore, setShowMore] = useState({ notes: false, tasks: false, responsibilities: false });
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [profile, setProfile] = useState<{ id: string | null; role_id: string | null }>({ id: null, role_id: null });
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});
  const [createdByNameMap, setCreatedByNameMap] = useState<Record<string, string>>({});
  const [noteModuleId, setNoteModuleId] = useState<string | null>(null);
  const [noteRecordId, setNoteRecordId] = useState<string | null>(null);
  const [noteRecordOptions, setNoteRecordOptions] = useState<{ label: string; value: string }[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteReplyTo, setNoteReplyTo] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [seenNoteIds, setSeenNoteIds] = useState<Set<string>>(() => loadSeenSet(SEEN_NOTES_STORAGE_KEY));
  const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_TASKS_STORAGE_KEY));
  const [seenResponsibilityIds, setSeenResponsibilityIds] = useState<Set<string>>(() => loadSeenSet(SEEN_RESP_STORAGE_KEY));
  const [seenCompletedTaskIds, setSeenCompletedTaskIds] = useState<Set<string>>(() => loadSeenSet(SEEN_COMPLETED_TASKS_STORAGE_KEY));
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingResponsibilities, setLoadingResponsibilities] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const prevNotesRef = useRef<Set<string>>(new Set());
  const prevTasksRef = useRef<Set<string>>(new Set());
  const prevResponsibilitiesRef = useRef<Set<string>>(new Set());
  const notificationsReadyRef = useRef(false);

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
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      if (!userId) return;
      const { data } = await supabase.from('profiles').select('id, role_id').eq('id', userId).maybeSingle();
      setProfile({ id: userId, role_id: data?.role_id || null });
    };
    loadProfile();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
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
    const loadMentions = async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }).limit(200),
        supabase.from('org_roles').select('id, title').order('title', { ascending: true }).limit(200),
      ]);
      const opts = [
        ...(profiles || []).map((p: any) => ({ label: `عضو: ${p.full_name || p.id}`, value: `user:${p.id}` })),
        ...(roles || []).map((r: any) => ({ label: `نقش: ${r.title || r.id}`, value: `role:${r.id}` })),
      ];
      setMentionOptions(opts);
    };
    loadMentions();
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const defaults = statusOptions
      .map((opt: any) => opt.value)
      .filter((val: string) => val !== 'done' && val !== 'canceled');
    setStatusFilter(defaults);
  }, [open, statusOptions]);

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
          map[`${moduleId}:${row.id}`] = formatRecordLabel(row);
        });
      })
    );
    setRecordTitleMap((prev) => ({ ...prev, ...map }));
  };

  const fetchAssignedIdsForModule = async (table: string, userId: string, roleId: string | null) => {
    const base = supabase.from(table).select('id').limit(200);
    const filtersPrimary = roleId
      ? `and(assignee_type.eq.user,assignee_id.eq.${userId}),and(assignee_type.eq.role,assignee_id.eq.${roleId})`
      : `and(assignee_type.eq.user,assignee_id.eq.${userId}),assignee_id.eq.${userId}`;
    const filtersNoType = `assignee_id.eq.${userId}`;

    const tryQuery = async (filters: string) => {
      const { data, error } = await base.or(filters);
      if (error) return { data: [] as any[], error };
      return { data: data || [], error: null };
    };

    let result = await tryQuery(filtersPrimary);
    if (result.error) result = await tryQuery(filtersNoType);

    return result.data || [];
  };

  const getAssignedRecordPairs = async () => {
    if (!profile.id) return [] as { module_id: string; record_id: string }[];
    const userId = profile.id;
    const roleId = profile.role_id;

    const modules = Object.values(MODULES)
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id));

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
    const userId = profile.id;
    const roleId = profile.role_id;

    const [{ data: mentionedUser }, { data: mentionedRole }] = await Promise.all([
      supabase
        .from('notes')
        .select('id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to')
        .contains('mention_user_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(40),
      roleId
        ? supabase
            .from('notes')
            .select('id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to')
            .contains('mention_role_ids', [roleId])
            .order('created_at', { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const { data: myNotes } = await supabase
      .from('notes')
      .select('id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);
    const myNoteIds = (myNotes || []).map((n: any) => n.id);

    let replyNotes: any[] = [];
    if (myNoteIds.length) {
      const { data } = await supabase
        .from('notes')
        .select('id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to')
        .in('reply_to', myNoteIds)
        .order('created_at', { ascending: false })
        .limit(40);
      replyNotes = data || [];
    }

    const assignedPairs = await getAssignedRecordPairs();
    const grouped: Record<string, string[]> = {};
    assignedPairs.forEach((item) => {
      if (!item.module_id || !item.record_id) return;
      grouped[item.module_id] = grouped[item.module_id] || [];
      if (!grouped[item.module_id].includes(item.record_id)) grouped[item.module_id].push(item.record_id);
    });
    const assignedNotes: any[] = [];
    await Promise.all(
      Object.entries(grouped).map(async ([moduleId, ids]) => {
        const { data } = await supabase
          .from('notes')
          .select('id, module_id, record_id, content, author_id, author_name, mention_user_ids, mention_role_ids, created_at, reply_to')
          .eq('module_id', moduleId)
          .in('record_id', ids)
          .order('created_at', { ascending: false })
          .limit(40);
        if (data?.length) assignedNotes.push(...data);
      })
    );

    const merged = [...(mentionedUser || []), ...(mentionedRole || []), ...replyNotes, ...(myNotes || []), ...assignedNotes];
    const uniq = new Map<string, any>();
    merged.forEach((note) => {
      uniq.set(note.id, note);
    });
    const result = Array.from(uniq.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    await buildRecordTitleMap(result.map((n) => ({ module_id: n.module_id, record_id: n.record_id })));
    const authorIds = Array.from(new Set(result.map((n: any) => n.author_id).filter(Boolean)));
    if (authorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name || p.id; });
      setAuthorNameMap(map);
    }
    return result;
  };

  const fetchTasks = async (statuses: string[]) => {
    if (!profile.id) return [];
    const userId = profile.id;
    const roleId = profile.role_id;
    const requestedStatuses = (Array.isArray(statuses) ? statuses : []).map((item) => String(item));
    const queryStatuses = Array.from(new Set([...requestedStatuses, 'done']));
    const fallbackStatuses = ['todo', 'in_progress', 'review', 'done'];

    let query = supabase
      .from('tasks')
      .select('id, name, status, priority, produced_qty, created_at, due_date, assignee_id, assignee_type, production_line_id, related_to_module, related_product, related_customer, related_supplier, related_production_order, related_invoice')
      .in('status', queryStatuses.length ? queryStatuses : fallbackStatuses)
      .order('created_at', { ascending: false })
      .limit(50);

    if (roleId) {
      query = query.or(`and(assignee_type.eq.user,assignee_id.eq.${userId}),and(assignee_type.eq.role,assignee_id.eq.${roleId})`);
    } else {
      query = query.eq('assignee_id', userId).eq('assignee_type', 'user');
    }

    const { data } = await query;
    const tasksList = (data || []).filter((task: any) => {
      const normalizedStatus = String(task?.status || '').toLowerCase();
      const isCompleted = normalizedStatus === 'done' || normalizedStatus === 'completed';
      if (isCompleted && seenCompletedTaskIds.has(String(task?.id || ''))) {
        return false;
      }
      if (!requestedStatuses.length) {
        return normalizedStatus !== 'canceled';
      }
      return requestedStatuses.includes(normalizedStatus) || isCompleted;
    });

    const relatedPairs: { module_id: string; record_id: string }[] = [];
    tasksList.forEach((task) => {
      const moduleId = task.related_to_module;
      const recordId = task.related_product || task.related_customer || task.related_supplier || task.related_production_order || task.related_invoice;
      if (moduleId && recordId) relatedPairs.push({ module_id: moduleId, record_id: recordId });
    });
    const assigneeIds = Array.from(new Set(tasksList.map((t: any) => t.assignee_id).filter(Boolean)));
    const roleIds = Array.from(new Set(tasksList.filter((t: any) => t.assignee_type === 'role').map((t: any) => t.assignee_id).filter(Boolean)));
    if (assigneeIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name || p.id; });
      setAssigneeNameMap(map);
    }
    if (roleIds.length) {
      const { data: roles } = await supabase.from('org_roles').select('id, title').in('id', roleIds);
      const map: Record<string, string> = {};
      (roles || []).forEach((r: any) => { map[r.id] = r.title || r.id; });
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
      .filter((mod: any) => mod?.id !== 'tasks' && (mod?.table || mod?.id));

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
    const assigneeIds = Array.from(new Set(items.map((i: any) => i.assignee_id).filter(Boolean)));
    const roleIds = Array.from(new Set(items.filter((i: any) => i.assignee_type === 'role').map((i: any) => i.assignee_id).filter(Boolean)));
    const createdByIds = Array.from(new Set(items.map((i: any) => i.created_by || i.created_by_id).filter(Boolean)));

    if (assigneeIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name || p.id; });
      setAssigneeNameMap((prev) => ({ ...prev, ...map }));
    }
    if (roleIds.length) {
      const { data: roles } = await supabase.from('org_roles').select('id, title').in('id', roleIds);
      const map: Record<string, string> = {};
      (roles || []).forEach((r: any) => { map[r.id] = r.title || r.id; });
      setRoleNameMap((prev) => ({ ...prev, ...map }));
    }
    if (createdByIds.length) {
      const { data: creators } = await supabase.from('profiles').select('id, full_name').in('id', createdByIds);
      const map: Record<string, string> = {};
      (creators || []).forEach((p: any) => { map[p.id] = p.full_name || p.id; });
      setCreatedByNameMap((prev) => ({ ...prev, ...map }));
    }
  };

  const refreshAll = async (notify = false) => {
    if (!profile.id) return;
    setLoadingNotes(true);
    setLoadingTasks(true);
    setLoadingResponsibilities(true);
    const [notesData, tasksData, responsibilitiesData] = await Promise.all([
      fetchNotes(),
      fetchTasks(
        statusFilter.length
          ? statusFilter
          : statusOptions
              .map((o: any) => String(o.value))
              .filter((val: string) => val !== 'done' && val !== 'canceled')
      ),
      fetchResponsibilities(),
    ]);
    setNotes(notesData);
    setTasks(tasksData);
    setResponsibilities(responsibilitiesData);
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
    setLoadingNotes(false);
    setLoadingTasks(false);
    setLoadingResponsibilities(false);

    if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      if (!notificationsReadyRef.current) {
        prevNotesRef.current = new Set(notesData.map((n: any) => n.id));
        prevTasksRef.current = new Set(tasksData.map((t: any) => t.id));
        prevResponsibilitiesRef.current = new Set(responsibilitiesData.map((r: any) => r.id));
        notificationsReadyRef.current = true;
        return;
      }
      const newNotes = notesData.filter((n: any) => !prevNotesRef.current.has(n.id));
      const newTasks = tasksData.filter((t: any) => !prevTasksRef.current.has(t.id));
      const newResponsibilities = responsibilitiesData.filter((r: any) => !prevResponsibilitiesRef.current.has(r.id));

      newNotes.forEach((note: any) => {
        sendBrowserNotification('یادداشت جدید', note.content || 'پیام جدید', `/${note.module_id}/${note.record_id}`);
      });
      newTasks.forEach((task: any) => {
        sendBrowserNotification('وظیفه جدید', task.name || 'وظیفه جدید', `/tasks/${task.id}`);
      });
      newResponsibilities.forEach((item: any) => {
        sendBrowserNotification('مسئولیت جدید', formatRecordLabel(item) || 'مسئولیت جدید', `/${item.module_id}/${item.id}`);
      });

      prevNotesRef.current = new Set(notesData.map((n: any) => n.id));
      prevTasksRef.current = new Set(tasksData.map((t: any) => t.id));
      prevResponsibilitiesRef.current = new Set(responsibilitiesData.map((r: any) => r.id));
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) refreshAll(true);
  }, [open, profile.id]);

  useEffect(() => {
    if (!profile.id) return;
    const interval = setInterval(() => {
      refreshAll(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [profile.id, profile.role_id]);

  useEffect(() => {
    if (!open) return;
    if (statusFilter.length) {
      fetchTasks(statusFilter).then((nextTasks) => {
        setTasks(nextTasks);
        const completedTaskIds = (nextTasks || [])
          .filter((task: any) => {
            const normalizedStatus = String(task?.status || '').toLowerCase();
            return normalizedStatus === 'done' || normalizedStatus === 'completed';
          })
          .map((task: any) => String(task.id));
        if (completedTaskIds.length) {
          setSeenCompletedTaskIds((prev) => new Set([...prev, ...completedTaskIds]));
        }
      });
    }
  }, [statusFilter, open]);

  const notesCount = notes.filter((n: any) => !seenNoteIds.has(String(n.id))).length;
  const tasksCount = tasks.filter((t: any) => !seenTaskIds.has(String(t.id))).length;
  const responsibilitiesCount = responsibilities.filter((r: any) => !seenResponsibilityIds.has(String(r.id))).length;
  const totalCount = notesCount + tasksCount + responsibilitiesCount;

  const handleClose = () => {
    setSeenNoteIds((prev) => new Set([...prev, ...notes.map((n: any) => String(n.id))]));
    setSeenTaskIds((prev) => new Set([...prev, ...tasks.map((t: any) => String(t.id))]));
    setSeenResponsibilityIds((prev) => new Set([...prev, ...responsibilities.map((r: any) => String(r.id))]));
    setOpen(false);
  };

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
              const recordTitle = recordTitleMap[recordKey] || formatRecordLabel({ id: note.record_id });
              const isMine = note.author_id && profile.id && note.author_id === profile.id;
              const authorName = isMine ? 'شما' : (note.author_name || authorNameMap[note.author_id] || 'کاربر سیستم');
              const replyTarget = note.reply_to ? noteMap.get(note.reply_to) : null;
              return (
                <div key={note.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`w-[92%] rounded-2xl px-3 py-2 border shadow-sm ${
                      isMine
                        ? 'bg-[#f7efe6] border-[#e7d7c6] rounded-br-sm'
                        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-gray-700 rounded-bl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>{authorName}</span>
                      <span>{safeJalaliFormat(note.created_at, 'YYYY/MM/DD HH:mm')}</span>
                    </div>
                    {replyTarget && (
                      <div className="text-[11px] text-gray-500 bg-gray-50 dark:bg-white/10 rounded-lg p-2 mb-2">
                        پاسخ به: {replyTarget.content || ''}
                      </div>
                    )}
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      رکورد مرتبط: <Link to={`/${note.module_id}/${note.record_id}`} className="text-leather-600" onClick={handleClose}>{recordTitle}</Link>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                      <Button
                        type="text"
                        size="small"
                        icon={<RollbackOutlined />}
                        onClick={() => {
                          setNoteReplyTo(note.id);
                          setNoteModuleId(note.module_id);
                          setNoteRecordId(note.record_id);
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
                              setEditingNoteValue(note.content || '');
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
                              await supabase.from('notes').update({ content: editingNoteValue, is_edited: true }).eq('id', note.id);
                              setNotes((prev) => prev.map((n: any) => (n.id === note.id ? { ...n, content: editingNoteValue, is_edited: true } : n)));
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
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#1f1f1f] px-4 py-3">
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
              buttonClassName="text-gray-500 hover:text-leather-500"
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
              placeholder="یادداشت جدید..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="rounded-lg border-gray-300"
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
              getPopupContainer={(node) => node.parentElement || document.body}
              dropdownStyle={{ zIndex: 3000, minWidth: 240 }}
            />
            {noteReplyTo && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <MessageOutlined />
                <span>پاسخ به یادداشت انتخاب شده</span>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setNoteReplyTo(null)} />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                type="primary"
                onClick={async () => {
                  if (!noteModuleId || !noteRecordId || !noteText.trim()) return;
                  const mentionUserIds = mentionValues.filter(v => v.startsWith('user:')).map(v => v.replace('user:', ''));
                  const mentionRoleIds = mentionValues.filter(v => v.startsWith('role:')).map(v => v.replace('role:', ''));
                  await supabase.from('notes').insert([
                    {
                      module_id: noteModuleId,
                      record_id: noteRecordId,
                      content: noteText,
                      reply_to: noteReplyTo || null,
                      mention_user_ids: mentionUserIds,
                      mention_role_ids: mentionRoleIds,
                    }
                  ]);
                  setNoteText('');
                  setNoteReplyTo(null);
                  setMentionValues([]);
                  await refreshAll();
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

  const renderTasks = () => {
    const data = showMore.tasks ? tasks : tasks.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            mode="multiple"
            size="small"
            placeholder="فیلتر وضعیت"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions.map((opt: any) => ({ label: opt.label, value: opt.value }))}
            className="min-w-[200px]"
          />
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/create')}
          >
            افزودن وظیفه
          </Button>
        </div>
        {loadingTasks ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="وظیفه‌ای یافت نشد" />
        ) : (
          <List
            dataSource={data}
            renderItem={(task: any) => {
              const moduleId = task.related_to_module;
              const recordId = task.related_product || task.related_customer || task.related_supplier || task.related_production_order || task.related_invoice;
              const recordKey = moduleId && recordId ? `${moduleId}:${recordId}` : null;
              const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
              const statusColor = task.status === 'done' ? 'border-green-300' : task.status === 'canceled' ? 'border-red-300' : task.status === 'review' ? 'border-orange-300' : 'border-gray-200';
              const isProductionTask = (
                String(task?.related_to_module || '') === 'production_orders'
                && task?.related_production_order
                && task?.production_line_id
              );
              const canEditProducedQty = !['todo', 'pending'].includes(String(task?.status || '').toLowerCase());
              return (
                <div className="mb-2">
                  <div className={`bg-white dark:bg-white/5 border ${statusColor} dark:border-gray-700 rounded-xl p-3`}>
                  <div className="flex items-center justify-between">
                    <Link to={`/tasks/${task.id}`} className="font-bold text-gray-800 dark:text-gray-200" onClick={handleClose}>{task.name}</Link>
                    <Select
                      size="small"
                      value={task.status}
                      onChange={async (val) => {
                        await supabase.from('tasks').update({ status: val }).eq('id', task.id);
                        setTasks((prev) => prev.map((t: any) => (t.id === task.id ? { ...t, status: val } : t)));
                      }}
                      options={statusOptions.map((opt: any) => ({ label: opt.label, value: opt.value }))}
                      style={{ minWidth: 120 }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {task.priority && (
                      <span className="text-[11px] bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                        {resolveOptionLabel(task.priority, priorityOptions) || task.priority}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-[11px] bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                        موعد: {safeJalaliFormat(task.due_date, 'YYYY/MM/DD HH:mm')}
                      </span>
                    )}
                  </div>
                  {isProductionTask && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-600">مقدار تولید شده:</span>
                      <InputNumber
                        size="small"
                        min={0}
                        value={toNumber(task?.produced_qty)}
                        disabled={!canEditProducedQty}
                        className="w-28 persian-number"
                        onChange={(val) => {
                          void handleTaskProducedQtyChange(String(task.id), val);
                        }}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    {recordTitle && moduleId && recordId && (
                      <span>
                        رکورد مرتبط: <Link to={`/${moduleId}/${recordId}`} className="text-leather-600" onClick={handleClose}>{recordTitle}</Link>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      {task.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                      {task.assignee_type === 'role'
                        ? (roleNameMap[task.assignee_id] || 'نقش')
                        : (assigneeNameMap[task.assignee_id] || 'کاربر')}
                    </span>
                  </div>
                  {isProductionTask && (
                    <div className="mt-3 rounded-lg border border-[#d6c2ab] bg-[#faf5ef] p-2">
                      <ProductionStagesField
                        recordId={String(task.related_production_order)}
                        moduleId="production_orders"
                        readOnly
                        compact
                        lazyLoad
                        onlyLineId={String(task.production_line_id)}
                      />
                    </div>
                  )}
                  </div>
                </div>
              );
            }}
          />
        )}
        {tasks.length > MAX_ITEMS && (
          <Button type="link" onClick={() => setShowMore(prev => ({ ...prev, tasks: !prev.tasks }))}>
            {showMore.tasks ? 'نمایش کمتر' : 'نمایش بیشتر'}
          </Button>
        )}
      </div>
    );
  };

  const renderResponsibilities = () => {
    const data = showMore.responsibilities ? responsibilities : responsibilities.slice(0, MAX_ITEMS);
    return (
      <div className="flex flex-col gap-3">
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
              const title = recordTitleMap[recordKey] || formatRecordLabel(item);
              const moduleConfig = MODULES[item.module_id];
              const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
              const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
              const statusLabel = resolveOptionLabel(item.status, statusField?.options);
              const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
              const assigneeLabel = item.assignee_type === 'role'
                ? (roleNameMap[item.assignee_id] || 'نقش')
                : (assigneeNameMap[item.assignee_id] || 'کاربر');
              const createdById = item.created_by || item.created_by_id;
              const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
              return (
                <div className="mb-2">
                  <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                    <Link to={`/${item.module_id}/${item.id}`} className="text-sm text-gray-800 dark:text-gray-200" onClick={handleClose}>
                      {title}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryLabel && (
                        <span className="text-[11px] bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                          {categoryLabel}
                        </span>
                      )}
                      {statusLabel && (
                        <span className="text-[11px] bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
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
        {responsibilities.length > MAX_ITEMS && (
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
      <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-2xl bg-white/60 dark:bg-white/5 h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-white/90 dark:bg-[#1f1f1f]">
          <div className="font-bold text-gray-700">یادداشت‌ها</div>
          <Badge count={formatBadgeCount(notesCount)} color="#ef4444" />
        </div>
        {renderNotes()}
      </div>
      <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-2xl bg-white/60 dark:bg-white/5 h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-white/90 dark:bg-[#1f1f1f]">
          <div className="font-bold text-gray-700">وظایف من</div>
          <Badge count={formatBadgeCount(tasksCount)} color="#ef4444" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderTasks()}
        </div>
      </div>
      <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-2xl bg-white/60 dark:bg-white/5 h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10 bg-white/90 dark:bg-[#1f1f1f]">
          <div className="font-bold text-gray-700">مسئولیت‌های من</div>
          <Badge count={formatBadgeCount(responsibilitiesCount)} color="#ef4444" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {renderResponsibilities()}
        </div>
      </div>
      </div>
    </div>
  );

  const contentMobile = (
    <div className="h-full flex flex-col">
      <Tabs
        defaultActiveKey="tasks"
        items={[
          {
            key: 'notes',
            label: <Badge count={formatBadgeCount(notesCount)} color="#ef4444">یادداشت‌ها</Badge>,
            children: <div className="h-[calc(90vh-56px)] flex flex-col">{renderNotes()}</div>,
          },
          {
            key: 'tasks',
            label: <Badge count={formatBadgeCount(tasksCount)} color="#ef4444">وظایف من</Badge>,
            children: <div className="h-[calc(90vh-56px)] flex flex-col overflow-hidden">{renderTasks()}</div>,
          },
          {
            key: 'resp',
            label: <Badge count={formatBadgeCount(responsibilitiesCount)} color="#ef4444">مسئولیت‌های من</Badge>,
            children: <div className="h-[calc(90vh-56px)] flex flex-col overflow-hidden">{renderResponsibilities()}</div>,
          },
        ]}
      />
    </div>
  );

  return (
    <>
      <Badge count={formatBadgeCount(totalCount)} size="small" color="#c58f60">
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
          height="90vh"
          open={open}
          onClose={handleClose}
          bodyStyle={{ padding: 16 }}
          headerStyle={{ background: '#8b5a2b' }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentMobile}
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
          width={900}
          open={open}
          onClose={handleClose}
          bodyStyle={{ padding: 0 }}
          headerStyle={{ background: '#8b5a2b' }}
          closeIcon={<CloseOutlined className="text-white" />}
        >
          {contentDesktop}
        </Drawer>
      )}
    </>
  );
};

export default NotificationsPopover;
