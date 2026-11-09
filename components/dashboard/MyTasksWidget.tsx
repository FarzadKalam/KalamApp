import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { fetchCurrentUserRecordAccessContext } from '../../utils/permissions';
import { runSelectWithCompatibleColumns } from '../../utils/selectCompat';
import { getTaskStatusOptions } from '../../utils/processTaskStatusOptions';
import { TASK_RUNTIME_UPDATED_EVENT, applyTaskRuntimeUpdate, type TaskRuntimeUpdatedPayload } from '../../utils/taskRuntimeEvents';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import TaskNotificationListRow from '../tasks/TaskNotificationListRow';
import DashboardWidgetFrame from './DashboardWidgetFrame';

const COLUMNS = ['id','org_id','name','status','priority','task_type','due_date','start_date','updated_at','recurrence_info','assignee_id','assignee_role_id','assignee_type','source_module_id','source_record_id','related_to_module','process_group_id','source_template_id','production_line_id','related_production_order','project_id','tags','is_locked','locked_at','locked_by'];
const PAGE_SIZE = 8;
function MyTasksWidget({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [directory, setDirectory] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [access, setAccess] = useState<Awaited<ReturnType<typeof fetchCurrentUserRecordAccessContext>> | null>(null);
  const [hasMore, setHasMore] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const nextOffset = useRef(0);
  const request = useRef(0);
  const load = useCallback(async (append = false) => {
    const current = ++request.current, offset = append ? nextOffset.current : 0;
    if (append) setLoadingMore(true);else setLoading(true);
    setError('');
    try {
      const context = await fetchCurrentUserRecordAccessContext(supabase);
      if (current !== request.current || context.orgId !== orgId) return;
      setAccess(context);
      if (!context.userId || context.permissions?.tasks?.view === false) { setRows([]);setHasMore(false);return; }
      const roleClause = context.roleId ? `,assignee_role_id.eq.${context.roleId},assignee_id.eq.${context.roleId}` : '';
      const result = await runSelectWithCompatibleColumns<any>({ cacheKey: 'dashboard-my-tasks', columns: COLUMNS, execute: columns => supabase.from('tasks').select(columns).eq('org_id', orgId)
        .or(`assignee_id.eq.${context.userId}${roleClause}`).not('status', 'in', '(done,completed,canceled,cancelled)').order('due_date', { ascending: true, nullsFirst: false }).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE) });
      if (result.error) throw result.error;
      if (current === request.current) {
        const page = (result.data || []).slice(0, PAGE_SIZE);
        setRows(previous => append ? [...new Map([...previous, ...page].map(task => [task.id, task])).values()] : page);
        nextOffset.current = offset + PAGE_SIZE;
        setHasMore((result.data || []).length > PAGE_SIZE);
      }
    } catch (cause) { if (current === request.current) setError(toFaErrorMessage(cause as any, 'دریافت فعالیت‌ها انجام نشد.')); }
    finally { if (current === request.current) { setLoading(false);setLoadingMore(false); } }
  }, [orgId]);
  useEffect(() => { void load();return () => { request.current++; }; }, [load]);
  useEffect(() => {
    let active = true;
    void fetchAssigneeDirectory(supabase).then((dir) => {
      if (active) setDirectory({ users: dir.users || [], roles: dir.roles || [] });
    }).catch(() => {});
    return () => { active = false; };
  }, [orgId]);
  useEffect(() => {
    const update = (event: Event) => { const task = (event as CustomEvent<TaskRuntimeUpdatedPayload>).detail?.task;if (!task?.id || (task.org_id && task.org_id !== orgId)) return;setRows(previous => applyTaskRuntimeUpdate(previous, task)); };
    window.addEventListener(TASK_RUNTIME_UPDATED_EVENT, update);return () => window.removeEventListener(TASK_RUNTIME_UPDATED_EVENT, update);
  }, [orgId]);
  if (access?.permissions?.tasks?.view === false) return null;
  return <DashboardWidgetFrame widgetId="my_tasks" title="کارهای من" defaultOrder={4} onRefresh={() => { void load(); }}>
    <Card title="کارهای من" className="dashboard-content-card">
      {error && <Alert showIcon type="error" message={error} action={<Button onClick={() => void load()}>تلاش دوباره</Button>} />}
      {loading && !rows.length ? <div className="dashboard-widget-loading" role="status" aria-label="در حال دریافت کارهای من"><Skeleton active avatar paragraph={{ rows: 3 }} /></div> : !rows.length && !error ? <div className="dashboard-widget-loading"><Empty description="فعالیت بازی برای شما پیدا نشد." /></div> : <div className="dashboard-task-list">{rows.map(task => <TaskNotificationListRow key={task.id} task={task} compact statusOptions={getTaskStatusOptions(task)}
        priorityOptions={MODULES.tasks?.fields.find(field => field.key === 'priority')?.options || []}
        allUsers={directory.users}
        allRoles={directory.roles}
        currentUser={{ id: access?.userId }}
        readOnly={!access || access.permissions?.tasks?.edit === false}
        canViewField={key => access?.permissions?.tasks?.fields?.[key] !== false}
        onTaskUpdated={next => setRows(previous => applyTaskRuntimeUpdate(previous, next))} />)}</div>}
      <div className="dashboard-task-footer">{hasMore && <Button onClick={() => void load(true)} loading={loadingMore} disabled={loading}>مشاهده بیشتر…</Button>}<Button type="link" onClick={() => navigate('/tasks')}>مشاهدهٔ همهٔ فعالیت‌ها</Button></div>
    </Card>
  </DashboardWidgetFrame>;
}
export default React.memo(MyTasksWidget);
