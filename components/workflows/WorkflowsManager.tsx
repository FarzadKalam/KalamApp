import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Modal, Popconfirm, Select, Space, Spin, Switch, Table, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import WorkflowEditorModal from './WorkflowEditorModal';
import { WorkflowRecord } from '../../utils/workflowTypes';
import { WORKFLOWS_PERMISSION_KEY } from '../../utils/permissions';

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
  const [permissions, setPermissions] = useState<WorkflowsPermission>(defaultPerms);

  const moduleOptions = useMemo(
    () =>
      Object.values(MODULES)
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
        query = query.eq('module_id', moduleFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      setRecords((data || []) as WorkflowRecord[]);
    } catch (err: any) {
      message.error(`خطا در دریافت گردش کارها: ${err?.message || 'نامشخص'}`);
    } finally {
      setLoading(false);
    }
  }, [message, moduleFilter]);

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

  const toggleActive = async (record: WorkflowRecord, checked: boolean) => {
    if (!canEdit) return;
    try {
      const { error } = await supabase.from('workflows').update({ is_active: checked }).eq('id', record.id);
      if (error) throw error;
      setRecords((prev) => prev.map((item) => (item.id === record.id ? { ...item, is_active: checked } : item)));
    } catch (err: any) {
      message.error(`خطا در تغییر وضعیت: ${err?.message || 'نامشخص'}`);
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
      message.error(`خطا در حذف گردش کار: ${err?.message || 'نامشخص'}`);
    }
  };

  const columns = [
    {
      title: 'نام گردش کار',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, row: WorkflowRecord) => (
        <div className="min-w-[180px]">
          <div className="font-bold text-gray-800 dark:text-gray-100">{row?.name || '-'}</div>
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
      render: (moduleId: string) => MODULES[moduleId]?.titles?.fa || moduleId || '-',
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
      render: (_: any, row: WorkflowRecord) => (
        <Space>
          <Button
            size="small"
            disabled={!canEdit}
            onClick={() => {
              setEditingRecord(row);
              setEditorOpen(true);
            }}
          >
            ویرایش
          </Button>
          <Popconfirm
            title="حذف گردش کار"
            description="آیا از حذف این گردش کار مطمئن هستید؟"
            onConfirm={() => handleDelete(row.id)}
            okText="حذف"
            cancelText="انصراف"
            disabled={!canDelete}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={!canDelete} />
          </Popconfirm>
        </Space>
      ),
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

      <WorkflowEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => fetchRecords()}
        initialModuleId={defaultModuleId}
        record={editingRecord}
        canEdit={canEdit}
        moduleOptions={moduleOptions}
      />
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
      destroyOnClose={false}
    >
      {content}
    </Modal>
  );
};

export default WorkflowsManager;
