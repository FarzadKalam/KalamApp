import React, { useState, useEffect, useMemo } from 'react';
import { List, Input, Button, Checkbox, Timeline, message, Empty, Spin, Select, Tag } from 'antd';
import { SendOutlined, PlusOutlined, DeleteOutlined, EditOutlined, CloseOutlined, MessageOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import RelatedRecordCard from './RelatedRecordCard';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';

interface ActivityPanelProps {
  moduleId: string;
  recordId: string;
  view: 'notes' | 'tasks' | 'changelogs'; // <--- ورودی جدید برای تعیین نوع نمایش
  recordName?: string; // <--- نام رکورد برای نمایش
  mentionUsers?: any[];
  mentionRoles?: any[];
  moduleConfig?: any;
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({ moduleId, recordId, view, recordName = '', mentionUsers = [], mentionRoles = [], moduleConfig }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState('');
  const [mentionValues, setMentionValues] = useState<string[]>([]);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionMap, setMentionMap] = useState<Record<string, { label: string; type: 'user' | 'team' }>>({});
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string | null; full_name: string | null }>({ id: null, full_name: null });
  const [authorNameMap, setAuthorNameMap] = useState<Record<string, string>>({});

  const taskRelationMap = useMemo<Record<string, string>>(() => ({
    products: 'related_product',
    customers: 'related_customer',
    suppliers: 'related_supplier',
    production_orders: 'related_production_order',
    invoices: 'related_invoice',
    purchase_invoices: 'purchase_invoice_id',
    projects: 'project_id',
    marketing_leads: 'marketing_lead_id',
  }), []);

  const tasksModuleConfig = MODULES['tasks'];

  const formatPersianDate = (val: unknown, format: string) => {
    if (!val) return '-';
    try {
      const jsDate = new Date(val as any);
      if (Number.isNaN(jsDate.getTime())) return '-';
      return new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      })
        .convert(persian, persian_fa)
        .format(format);
    } catch {
      return '-';
    }
  };

  const getActionLabel = (action: string) => {
    if (action === 'create') return 'ایجاد رکورد';
    if (action === 'update') return 'ویرایش';
    if (action === 'delete') return 'حذف';
    return 'تغییر';
  };

  const getActionColor = (action: string) => {
    if (action === 'create') return 'green';
    if (action === 'update') return 'blue';
    if (action === 'delete') return 'red';
    return 'gray';
  };

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return 'خالی';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object]';
      }
    }
    return String(value);
  };

  const parseMaybeJson = (value: any) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  };

  const getFieldDef = (fieldKey?: string) => {
    if (!fieldKey) return null;
    return moduleConfig?.fields?.find((f: any) => f.key === fieldKey) || null;
  };

  const resolveOptionLabel = (value: any, fieldDef: any) => {
    if (!fieldDef?.options?.length) return null;
    const option = fieldDef.options.find((opt: any) => String(opt.value) === String(value));
    return option?.label || null;
  };

  const formatChangeValue = (rawValue: unknown, fieldDef: any): string => {
    const value = parseMaybeJson(rawValue);
    if (value === null || value === undefined || value === '') return 'خالی';

    if (Array.isArray(value)) {
      return value
        .map((v) => resolveOptionLabel(v, fieldDef) || formatChangeValue(v, fieldDef))
        .join(', ');
    }

    if (typeof value === 'object') {
      const obj = value as any;
      if (obj?.label) return obj.label;
      if (obj?.value) return resolveOptionLabel(obj.value, fieldDef) || formatValue(obj.value);
      return formatValue(value);
    }

    if (fieldDef?.type === 'price') return formatPersianPrice(value);
    if (fieldDef?.type === 'number') return toPersianNumber(value);
    if (fieldDef?.type === 'date') return safeJalaliFormat(value, 'YYYY/MM/DD');
    if (fieldDef?.type === 'datetime') return safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    if (fieldDef?.type === 'time') return toPersianNumber(String(value));

    return resolveOptionLabel(value, fieldDef) || formatValue(value);
  };

  const formatTableRows = (rows: any[], tableDef: any): string => {
    if (!Array.isArray(rows) || !tableDef?.tableColumns?.length) return formatValue(rows);
    const columns = tableDef.tableColumns;
    const formatCell = (val: any, col: any): string => {
      const colType = col?.type;
      if (colType === 'price') return formatPersianPrice(val);
      if (colType === 'number') return toPersianNumber(val);
      if (colType === 'date') return safeJalaliFormat(val, 'YYYY/MM/DD');
      if (colType === 'datetime') return safeJalaliFormat(val, 'YYYY/MM/DD HH:mm');
      if (colType === 'time') return toPersianNumber(String(val));
      if (Array.isArray(val)) return val.map((v) => formatCell(v, col)).join(', ');
      return resolveOptionLabel(val, col) || formatValue(val);
    };

    return rows
      .map((row) => {
        const parts = columns.map((col: any) => {
          const val = row?.[col.key];
          if (val === undefined || val === null || val === '') return null;
          return `${col.title}: ${formatCell(val, col)}`;
        }).filter(Boolean);
        return parts.join(' | ');
      })
      .filter(Boolean)
        .join('\n');
  };

  useEffect(() => {
    fetchData();
  }, [moduleId, recordId, view]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        if (!userId) return;
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
        setCurrentUser({ id: userId, full_name: profile?.full_name || null });
      } catch (err) {
        console.error(err);
      }
    };
    loadCurrentUser();
  }, []);

  // لیست اعضا برای منشن (پروفایل‌ها)
  useEffect(() => {
    const buildMentions = (profiles: any[], roles: any[]) => {
      const profileOptions = (profiles || []).map((p: any) => ({
        label: `عضو: ${p.full_name || p.id}`,
        value: `user:${p.id}`,
      }));
      const roleOptions = (roles || []).map((r: any) => ({
        label: `تیم: ${r.title || r.id}`,
        value: `role:${r.id}`,
      }));

      const map: Record<string, { label: string; type: 'user' | 'team' }> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = { label: p.full_name || p.id, type: 'user' }; });
      (roles || []).forEach((r: any) => { map[r.id] = { label: r.title || r.id, type: 'team' }; });

      setMentionMap(map);
      setMentionOptions([...profileOptions, ...roleOptions]);
    };

    const isMissingColumnError = (error: any, columnName: string) => {
      const code = String(error?.code || '').toUpperCase();
      if (code === 'PGRST200' || code === 'PGRST204' || code === '42703') return true;
      const messageText = String(error?.message || error?.details || error?.hint || '').toLowerCase();
      const col = columnName.toLowerCase();
      return (
        messageText.includes(`column "${col}"`) ||
        messageText.includes(`${col} does not exist`) ||
        (messageText.includes('schema cache') && messageText.includes(col))
      );
    };

    const normalizeRoleRows = (rows: any[]) =>
      (rows || []).map((row: any) => ({
        id: row?.id,
        title: String(row?.title || row?.name || row?.id || '').trim(),
      }));

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

    const loadProfiles = async () => {
      setMentionsLoading(true);
      try {
        const [{ data: profiles, error: profilesError }, roles] = await Promise.all([
          supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }).limit(200),
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
    if (view === 'notes') {
      if (mentionUsers.length || mentionRoles.length) {
        buildMentions(mentionUsers, mentionRoles);
      } else {
        loadProfiles();
      }
    }
  }, [view, mentionUsers, mentionRoles]);

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
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          const map: Record<string, string> = {};
          (profiles || []).forEach((row: any) => {
            map[row.id] = row.full_name || row.id;
          });
          setAuthorNameMap(map);
        }
        return;
      }

      if (view === 'notes') {
        const { data, error } = await supabase
          .from('notes')
          .select('id, module_id, record_id, content, mention_user_ids, mention_role_ids, reply_to, author_id, author_name, is_edited, edited_at, created_at')
          .eq('module_id', moduleId)
          .eq('record_id', recordId)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;
        const notes = data || [];
        setItems(notes);

        const authorIds = Array.from(new Set(notes.map((note: any) => note.author_id).filter(Boolean)));
        if (authorIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', authorIds);
          const map: Record<string, string> = {};
          (profiles || []).forEach((row: any) => {
            map[row.id] = row.full_name || row.id;
          });
          setAuthorNameMap(map);
        } else {
          setAuthorNameMap({});
        }
        return;
      }

      const relationField = taskRelationMap[moduleId];
      if (!relationField) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq(relationField, recordId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error(err);
      message.error('دریافت اطلاعات با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };

  const parseMentionValues = (values: string[]) => {
    const mention_user_ids: string[] = [];
    const mention_role_ids: string[] = [];
    (values || []).forEach((val) => {
      if (val.startsWith('user:')) mention_user_ids.push(val.replace('user:', ''));
      if (val.startsWith('role:')) mention_role_ids.push(val.replace('role:', ''));
    });
    return { mention_user_ids, mention_role_ids };
  };

  const handleSubmit = async () => {
    if (!newItem.trim()) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();

      if (view === 'notes') {
        const { mention_user_ids, mention_role_ids } = parseMentionValues(mentionValues);
        const payload = {
          module_id: moduleId,
          record_id: recordId,
          content: newItem,
          reply_to: replyToId || null,
          mention_user_ids,
          mention_role_ids,
          author_id: currentUser.id,
          author_name: currentUser.full_name,
          created_at: now,
        } as any;

        const { error } = await supabase.from('notes').insert([payload]);
        if (error) throw error;

        message.success('یادداشت ثبت شد');
        setNewItem('');
        setMentionValues([]);
        setReplyToId(null);
        fetchData();
        return;
      }

      const relationField = taskRelationMap[moduleId];
      const payload = {
        name: newItem,
        status: 'todo',
        created_at: now,
        related_to_module: moduleId,
        ...(relationField ? { [relationField]: recordId } : {})
      } as any;

      const { error } = await supabase.from('tasks').insert([payload]);
      if (error) throw error;

      message.success('وظیفه ایجاد شد');
      setNewItem('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('ثبت با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setEditingValue(item.content || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase
        .from('notes')
        .update({ content: editingValue, is_edited: true, edited_at: new Date().toISOString() })
        .eq('id', editingId);
      if (error) throw error;
      setEditingId(null);
      setEditingValue('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('ویرایش ناموفق بود');
    }
  };

  const toggleTask = async (task: any) => {
    try {
      const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', task.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('به‌روزرسانی وظیفه ناموفق بود');
    }
  };

  const handleDelete = async (rowId: string) => {
    try {
      const table = view === 'notes' ? 'notes' : 'tasks';
      const { error } = await supabase.from(table).delete().eq('id', rowId);
      if (error) throw error;
      message.success('حذف شد');
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('حذف با خطا مواجه شد');
    }
  };

  if (loading && items.length === 0) return <div className="flex justify-center p-10"><Spin /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* عنوان بخش */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {view === 'notes' && 'یادداشت‌های'}
          {view === 'tasks' && 'وظایف'}
          {view === 'changelogs' && 'تاریخچه تغییرات'}
        </div>
        {recordName && (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
            {recordName}
          </div>
        )}
      </div>

      {/* فقط برای یادداشت و وظایف ورودی داریم */}
        {view !== 'changelogs' && (
          <div className="flex gap-2 mb-6">
              {view === 'notes' ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <Input.TextArea 
                      placeholder="یادداشت جدید..." 
                      value={newItem} 
                      onChange={e => setNewItem(e.target.value)} 
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
                      loading={mentionsLoading}
                      optionFilterProp="label"
                      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                      notFoundContent={mentionsLoading ? 'در حال بارگذاری...' : 'موردی یافت نشد'}
                      getPopupContainer={(node) => node.parentElement || document.body}
                      dropdownStyle={{ zIndex: 3000, minWidth: 240 }}
                      className="w-full"
                    />
                    {replyToId && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MessageOutlined />
                        <span>پاسخ به یادداشت انتخاب شده</span>
                        <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setReplyToId(null)} />
                      </div>
                    )}
                  </div>
              ) : (
                  <Input 
                    placeholder="عنوان وظیفه..." 
                    value={newItem} 
                    onChange={e => setNewItem(e.target.value)} 
                    onPressEnter={handleSubmit} 
                    className="rounded-lg border-gray-300 h-10"
                  />
              )}
              <Button type="primary" icon={view === 'notes' ? <SendOutlined /> : <PlusOutlined />} onClick={handleSubmit} className="h-auto rounded-lg" />
              {view === 'tasks' && (
                <Button
                  type="default"
                  className="h-auto rounded-lg"
                  onClick={() => navigate('/tasks/create', { state: { initialValues: { [taskRelationMap[moduleId]]: recordId, related_to_module: moduleId } } })}
                >
                  افزودن وظیفه
                </Button>
              )}
          </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <Empty description="موردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <>
              {view === 'notes' && (
                <List dataSource={items} renderItem={(item: any) => {
                  const authorName = item.author_name || authorNameMap[item.author_id] || 'کاربر سیستم';
                  const isEditing = editingId === item.id;
                  const replyTarget = items.find((note) => note.id === item.reply_to);
                  const mentionUsers = (item.mention_user_ids || []).map((id: string) => mentionMap[id]?.label || id);
                  const mentionRoles = (item.mention_role_ids || []).map((id: string) => mentionMap[id]?.label || id);

                  return (
                    <div className="bg-white dark:bg-white/5 p-4 rounded-xl mb-3 border border-gray-100 dark:border-gray-700 shadow-sm">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-2">
                        <span>{authorName}</span>
                        <span>{formatPersianDate(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                      </div>

                      {replyTarget && (
                        <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 mb-2">
                          پاسخ به: {replyTarget.content || ''}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <Input.TextArea
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                          />
                          <div className="flex gap-2">
                            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleSaveEdit}>ذخیره</Button>
                            <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingId(null)}>انصراف</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{item.content}</div>
                      )}

                      {(mentionUsers.length > 0 || mentionRoles.length > 0) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {mentionUsers.map((label: string) => (
                            <Tag key={label} color="blue" className="text-xs">@{label}</Tag>
                          ))}
                          {mentionRoles.map((label: string) => (
                            <Tag key={label} color="purple" className="text-xs">@{label}</Tag>
                          ))}
                        </div>
                      )}

                      {item.is_edited && (
                        <div className="text-[10px] text-gray-400 mt-1">ویرایش شده</div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <Button type="text" size="small" icon={<MessageOutlined />} onClick={() => setReplyToId(item.id)}>پاسخ</Button>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(item)}>ویرایش</Button>
                        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(item.id)} />
                      </div>
                    </div>
                  );
                }} />
              )}

              {view === 'tasks' && (
                <List dataSource={items} renderItem={(item: any) => (
                  <div className="relative">
                    <RelatedRecordCard
                      moduleId="tasks"
                      item={item}
                      moduleConfig={tasksModuleConfig}
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <Checkbox checked={item.status === 'completed'} onChange={() => toggleTask(item)} />
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleDelete(item.id)}
                      />
                    </div>
                  </div>
                )} />
              )}

              {view === 'changelogs' && (
                <Timeline
                  items={items.map((log: any) => {
                    const action = String(log.action || 'update');
                    const fieldTitle = log.field_label || log.field_name;
                    const fieldDef = getFieldDef(log.field_name);
                    const tableDef = moduleConfig?.blocks?.find((b: any) => b.id === log.field_name);
                    const actor = log.user_name || authorNameMap[log.user_id] || 'سیستم';
                    const hasDiff = fieldTitle && (log.old_value !== null || log.new_value !== null);
                    return {
                      color: getActionColor(action),
                      children: (
                        <div className="text-xs pb-4 mt-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-700">{actor}</span>
                            <span className="text-gray-500">{getActionLabel(action)}</span>
                            <span className="text-[10px] text-gray-400">{formatPersianDate(log.created_at, 'HH:mm - YYYY/MM/DD')}</span>
                          </div>

                          {(log.record_title || recordName) && (
                            <div className="text-[10px] text-gray-500 mb-2 truncate">
                              {log.record_title || recordName}
                            </div>
                          )}

                          {hasDiff && (
                            <div className="bg-gray-50 p-2 rounded text-gray-600">
                              تغییر <b>{fieldTitle}</b>:
                              <div className="mt-1">
                              <span className="text-red-400 line-through mr-1 whitespace-pre-wrap">{tableDef ? formatTableRows(parseMaybeJson(log.old_value) || [], tableDef) : formatChangeValue(log.old_value, fieldDef)}</span>
                                <span className="text-gray-400 mx-1">←</span>
                              <span className="text-green-600 font-bold whitespace-pre-wrap">{tableDef ? formatTableRows(parseMaybeJson(log.new_value) || [], tableDef) : formatChangeValue(log.new_value, fieldDef)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              )}
            </>
          )}
      </div>
    </div>
  );
};

export default ActivityPanel;
