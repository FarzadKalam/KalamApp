import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Modal, Popconfirm, Select, Space, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import WorkflowEditorModal from './WorkflowEditorModal';
import { WorkflowCondition, WorkflowRecord, createWorkflowId } from '../../utils/workflowTypes';
import { isSaasAdminModuleId, WORKFLOWS_PERMISSION_KEY } from '../../utils/permissions';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveSelectPopupContainer } from '../../utils/popupContainer';
import { useSearchParams } from 'react-router-dom';

type WorkflowsManagerProps = {
  inline?: boolean;
  open?: boolean;
  onClose?: () => void;
  defaultModuleId?: string | null;
  context?: 'settings' | 'module_list';
};

type WorkflowsPermission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
  fields: Record<string, boolean>;
};

const defaultPerms: WorkflowsPermission = {
  view: true,
  edit: true,
  delete: true,
  fields: {
    settings_tab: true,
    module_list_button: true,
  },
};

const triggerLabelMap: Record<string, string> = {
  on_create: 'ایجاد رکورد',
  on_upsert: 'ایجاد/به‌روزرسانی',
  interval: 'زمان‌بندی',
};

const WorkflowsManager: React.FC<WorkflowsManagerProps> = ({
  inline = false,
  open = false,
  onClose,
  defaultModuleId,
  context = 'module_list',
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<WorkflowRecord[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string>(defaultModuleId || 'all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WorkflowRecord | null>(null);
  const [isCreatingFromMediaDraft, setIsCreatingFromMediaDraft] = useState(false);
  const [permissions, setPermissions] = useState<WorkflowsPermission>(defaultPerms);
  const [searchParams] = useSearchParams();
  const [openedDraftKey, setOpenedDraftKey] = useState('');

  const instagramMediaDraft = useMemo(() => {
    const permalink = String(searchParams.get('instagramMediaPermalink') || '').trim();
    const mediaType = String(searchParams.get('instagramMediaType') || '').trim();
    const mediaLabel = String(searchParams.get('instagramMediaLabel') || '').trim();
    if (!permalink || !['post', 'reel', 'story'].includes(mediaType)) return null;
    const isStory = mediaType === 'story';
    const conditionsAll: WorkflowCondition[] = [
      { id: createWorkflowId(), field: 'event_type', operator: 'eq', value: isStory ? 'direct_received' : 'comment_received' },
      { id: createWorkflowId(), field: 'media_permalink', operator: 'eq', value: permalink },
      { id: createWorkflowId(), field: 'media_type', operator: 'eq', value: mediaType },
    ];
    return {
      key: `${mediaType}:${permalink}`,
      moduleId: 'instagram_interaction_events',
      name: `${isStory ? 'پاسخ خودکار ریپلای' : 'پاسخ خودکار کامنت'} ${mediaLabel || (isStory ? 'استوری' : 'پست')}`,
      description: isStory ? 'فقط برای ریپلای‌های همین استوری اجرا می‌شود.' : 'فقط برای کامنت‌های همین رسانه اجرا می‌شود.',
      triggerType: 'on_create' as const,
      conditionsAll,
      actions: [{ id: createWorkflowId(), type: isStory ? 'send_instagram_message' as const : 'reply_instagram_comment' as const, config: { message: '' } }],
    };
  }, [searchParams]);

  const moduleOptions = useMemo(
    () =>
      Object.values(MODULES)
        .filter((module) => !isSaasAdminModuleId(module.id))
        .map((module) => ({ label: module.titles.fa, value: module.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    []
  );

  const canView = permissions.view !== false;
  const canEdit = permissions.edit !== false;
  const canDelete = permissions.delete !== false;
  const canRenderByContext =
    context === 'settings'
      ? permissions.fields?.settings_tab !== false
      : permissions.fields?.module_list_button !== false;
  const editorInitialModuleId = useMemo(() => {
    if (editingRecord?.module_id) return editingRecord.module_id;
    if (defaultModuleId) return defaultModuleId;
    if (moduleFilter !== 'all') return moduleFilter;
    return null;
  }, [defaultModuleId, editingRecord?.module_id, moduleFilter]);

  const fetchPermissions = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.role_id) return;

      const { data: role } = await supabase
        .from('org_roles')
        .select('permissions')
        .eq('id', profile.role_id)
        .maybeSingle();

      const perms = role?.permissions?.[WORKFLOWS_PERMISSION_KEY] || {};
      setPermissions({
        view: perms.view !== false,
        edit: perms.edit !== false,
        delete: perms.delete !== false,
        fields: {
          ...defaultPerms.fields,
          ...(perms.fields || {}),
        },
      });
    } catch {
      setPermissions(defaultPerms);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('workflows').select('*').order('created_at', { ascending: false });
      if (moduleFilter !== 'all') {
        query = query.or(`module_id.eq.${moduleFilter},module_ids.cs.{${moduleFilter}}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      setRecords((data || []) as WorkflowRecord[]);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت گردش کارها'));
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    if (!inline && !open) return;
    if (!canView) return;
    if (!canRenderByContext) return;
    fetchRecords();
  }, [inline, open, canView, canRenderByContext, fetchRecords]);

  useEffect(() => {
    if (defaultModuleId && moduleFilter === 'all') {
      setModuleFilter(defaultModuleId);
    }
  }, [defaultModuleId, moduleFilter]);

  useEffect(() => {
    if (!instagramMediaDraft || openedDraftKey === instagramMediaDraft.key || !canEdit || !canRenderByContext) return;
    setEditingRecord(null);
    setIsCreatingFromMediaDraft(true);
    setModuleFilter('instagram_interaction_events');
    setEditorOpen(true);
    setOpenedDraftKey(instagramMediaDraft.key);
  }, [canEdit, canRenderByContext, instagramMediaDraft, openedDraftKey]);

  const toggleActive = async (record: WorkflowRecord, checked: boolean) => {
    if (!canEdit) return;
    try {
      const { error } = await supabase.from('workflows').update({ is_active: checked }).eq('id', record.id);
      if (error) throw error;
      setRecords((prev) => prev.map((item) => (item.id === record.id ? { ...item, is_active: checked } : item)));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در تغییر وضعیت'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    try {
      const { error } = await supabase.from('workflows').delete().eq('id', id);
      if (error) throw error;
      message.success('گردش کار حذف شد.');
      fetchRecords();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف گردش کار'));
    }
  };

  const columns = [
    {
      title: 'نام گردش کار',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, row: WorkflowRecord) => (
        <div className="min-w-[180px]">
          <div className="flex flex-wrap items-center gap-1">
            <div className="font-bold text-gray-800 dark:text-gray-100">{row?.name || '-'}</div>
            {row?.scope_type === 'process_activator' ? (
              <Tag icon={<ThunderboltOutlined />} color="gold">فعال‌کننده فرآیند</Tag>
            ) : null}
          </div>
          {row?.description ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{row.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'ماژول مرتبط',
      dataIndex: 'module_id',
      key: 'module_id',
      width: 180,
      render: (moduleId: string, row: WorkflowRecord) => {
        const moduleIds = Array.from(new Set(
          row?.scope_type === 'process_activator'
            ? (Array.isArray(row?.module_ids) ? row.module_ids : [moduleId])
            : [moduleId],
        )).filter(Boolean);
        return (
          <Space size={[4, 4]} wrap>
            {moduleIds.map((targetModuleId) => (
              <Tag key={targetModuleId}>
                {MODULES[targetModuleId]?.titles?.fa || targetModuleId}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'شرایط اجرا',
      dataIndex: 'trigger_type',
      key: 'trigger_type',
      width: 180,
      render: (triggerType: string) => triggerLabelMap[triggerType] || triggerType || '-',
    },
    {
      title: 'اقدام‌ها',
      dataIndex: 'actions',
      key: 'actions',
      width: 120,
      render: (actions: any[]) => <Tag color="default">{Array.isArray(actions) ? actions.length : 0}</Tag>,
    },
    {
      title: 'وضعیت',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 120,
      render: (active: boolean, row: WorkflowRecord) => (
        <Switch
          checked={active !== false}
          checkedChildren="فعال"
          unCheckedChildren="غیرفعال"
          disabled={!canEdit}
          onChange={(checked) => toggleActive(row, checked)}
        />
      ),
    },
    {
      title: 'عملیات',
      key: 'actions_col',
      width: 140,
      render: (_: any, row: WorkflowRecord) => {
        const isProcessActivator = row?.scope_type === 'process_activator';
        return (
          <Space>
            <Tooltip title={isProcessActivator ? 'ویرایش از داخل الگوی فرآیند انجام می‌شود' : undefined}>
              <Button
                size="small"
                disabled={!canEdit || isProcessActivator}
                onClick={() => {
                  setEditingRecord(row);
                  setIsCreatingFromMediaDraft(false);
                  setEditorOpen(true);
                }}
              >
                ویرایش
              </Button>
            </Tooltip>
          <Popconfirm
            title="حذف گردش کار"
            description="آیا از حذف این گردش کار مطمئن هستید؟"
            onConfirm={() => handleDelete(row.id)}
            okText="حذف"
            cancelText="انصراف"
            disabled={!canDelete || isProcessActivator}
          >
            <Tooltip title={isProcessActivator ? 'حذف از داخل الگوی فرآیند انجام می‌شود' : 'حذف گردش کار'}>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={!canDelete || isProcessActivator}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
        );
      },
    },
  ];

  const content = (
    <div className={inline ? '' : 'px-1'}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Space wrap>
          <Select
            value={moduleFilter}
            onChange={(val) => setModuleFilter(String(val))}
            options={[{ label: 'همه ماژول‌ها', value: 'all' }, ...moduleOptions]}
            className="min-w-[220px]"
            showSearch
            optionFilterProp="label"
            getPopupContainer={resolveSelectPopupContainer}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRecords} />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canEdit}
          className="bg-leather-600 hover:!bg-leather-500"
          onClick={() => {
            setEditingRecord(null);
            setIsCreatingFromMediaDraft(false);
            setEditorOpen(true);
          }}
        >
          افزودن گردش کار
        </Button>
      </div>

      {!canView || !canRenderByContext ? (
        <div className="py-16">
          <Empty description="دسترسی مشاهده گردش کارها را ندارید" />
        </div>
      ) : loading ? (
        <div className="h-56 flex items-center justify-center">
          <Spin size="large" />
        </div>
      ) : (
        <Table
          rowKey="id"
          columns={columns as any}
          dataSource={records}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'هیچ گردش کاری ثبت نشده است.' }}
          scroll={{ x: 960 }}
        />
      )}

      {editorOpen ? (
        <WorkflowEditorModal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSaved={() => fetchRecords()}
          initialModuleId={editorInitialModuleId}
          initialDraft={isCreatingFromMediaDraft ? instagramMediaDraft : null}
          record={editingRecord}
          canEdit={canEdit}
          moduleOptions={moduleOptions}
        />
      ) : null}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span className="flex items-center gap-2">
          <SettingOutlined />
          مدیریت گردش کارها
        </span>
      }
      footer={null}
      width={1200}
      destroyOnHidden={false}
    >
      {content}
    </Modal>
  );
};

export default WorkflowsManager;
