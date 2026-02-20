import React, { useEffect, useMemo, useState } from 'react';
import { Tree, Checkbox, Button, Input, message, Empty, Divider, Switch, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import {
  buildDefaultPermissions,
  collectModulePermissionFields,
  mergePermissionsWithDefaults,
  SETTINGS_PERMISSION_KEY,
  DASHBOARD_PERMISSION_KEY,
  SETTINGS_TAB_PERMISSIONS,
  DASHBOARD_WIDGET_PERMISSIONS,
  WORKFLOWS_PERMISSION_KEY,
  WORKFLOWS_PERMISSION_FIELDS,
  type PermissionMap,
} from '../../utils/permissions';

const { Panel } = Collapse;

const RolesTab: React.FC = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [loading, setLoading] = useState(false);

  const defaultPermissions = useMemo(() => buildDefaultPermissions(MODULES), []);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (!selectedRoleId) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    setPermissions(mergePermissionsWithDefaults(role?.permissions || {}, defaultPermissions));
  }, [selectedRoleId, roles, defaultPermissions]);

  const fetchRoles = async () => {
    const { data } = await supabase.from('org_roles').select('*').order('created_at');
    if (data) setRoles(data);
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    const { error } = await supabase
      .from('org_roles')
      .insert([{ title: newRoleName.trim(), permissions: defaultPermissions }]);
    if (!error) {
      message.success('جایگاه اضافه شد');
      setNewRoleName('');
      fetchRoles();
    }
  };

  const handleDeleteRole = async (id: string) => {
    const { error } = await supabase.from('org_roles').delete().eq('id', id);
    if (!error) {
      message.success('حذف شد');
      if (selectedRoleId === id) setSelectedRoleId(null);
      fetchRoles();
    } else {
      message.error('خطا: ممکن است کاربرانی به این نقش متصل باشند.');
    }
  };

  const handlePermissionChange = (
    moduleId: string,
    type: 'view' | 'edit' | 'delete' | 'field',
    fieldKey?: string,
    checked?: boolean
  ) => {
    setPermissions((prev) => {
      const merged = mergePermissionsWithDefaults(prev, defaultPermissions);
      if (!merged[moduleId]) {
        merged[moduleId] = { view: true, edit: true, delete: true, fields: {} };
      }

      const next = { ...merged };
      const target = {
        ...(next[moduleId] || {}),
        fields: { ...(next[moduleId]?.fields || {}) },
      };

      if (type === 'field' && fieldKey) {
        target.fields![fieldKey] = checked !== false;
      } else {
        (target as any)[type] = checked !== false;
        if (type === 'edit' && checked) target.view = true;
        if (type === 'delete' && checked) target.view = true;
        if (type === 'view' && !checked) {
          target.edit = false;
          target.delete = false;
        }
      }

      next[moduleId] = target;
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setLoading(true);
    const normalized = mergePermissionsWithDefaults(permissions, defaultPermissions);
    const { error } = await supabase
      .from('org_roles')
      .update({ permissions: normalized })
      .eq('id', selectedRoleId);
    if (!error) {
      message.success('دسترسی ها بروزرسانی شد');
      setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? { ...r, permissions: normalized } : r)));
      setPermissions(normalized);
    }
    setLoading(false);
  };

  const treeData = roles.map((role) => ({
    title: (
      <div className="flex justify-between items-center w-full pr-2 text-gray-700 dark:text-gray-300">
        <span>{role.title}</span>
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteRole(role.id);
          }}
        />
      </div>
    ),
    key: role.id,
  }));

  const getModulePerms = (moduleId: string) => {
    const merged = mergePermissionsWithDefaults(permissions, defaultPermissions);
    return merged[moduleId] || { view: true, edit: true, delete: true, fields: {} };
  };

  const renderFieldSwitches = (
    moduleId: string,
    fields: Array<{ key: string; label: string }>,
    disabled: boolean
  ) => {
    const modPerms = getModulePerms(moduleId);
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((field) => (
          <div
            key={field.key}
            className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-white/5 p-2 rounded border border-transparent dark:border-gray-800"
          >
            <Switch
              size="small"
              checked={modPerms.fields?.[field.key] !== false}
              onChange={(checked) => handlePermissionChange(moduleId, 'field', field.key, checked)}
              disabled={disabled}
              className="bg-gray-300"
            />
            <span className="text-gray-600 dark:text-gray-400">{field.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[70vh]">
      <div className="w-full md:w-1/3 bg-gray-50 dark:bg-[#202020] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col">
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="نام جایگاه جدید..."
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddRole}
            className="bg-leather-600 border-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {roles.length > 0 ? (
            <Tree
              className="bg-transparent dark:text-gray-300"
              treeData={treeData}
              selectedKeys={selectedRoleId ? [selectedRoleId] : []}
              onSelect={(keys) => setSelectedRoleId(keys[0] as string)}
              blockNode
            />
          ) : (
            <Empty description={<span className="text-gray-400">هنوز جایگاهی تعریف نشده</span>} />
          )}
        </div>
      </div>

      <div className="w-full md:w-2/3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col">
        {selectedRoleId ? (
          <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
              <h3 className="text-lg font-bold m-0 flex items-center gap-2 text-gray-800 dark:text-white">
                <LockOutlined className="text-leather-600" />
                دسترسی های جایگاه:
                <span className="text-leather-600">{roles.find((r) => r.id === selectedRoleId)?.title}</span>
              </h3>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={savePermissions}
                loading={loading}
                className="bg-green-600 border-none"
              >
                ذخیره دسترسی ها
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <Collapse defaultActiveKey={[Object.values(MODULES)[0]?.id || 'products']} className="dark:bg-transparent dark:border-gray-800">
                {Object.values(MODULES).map((module) => {
                  const modPerms = getModulePerms(module.id);
                  const fields = collectModulePermissionFields(module);
                  const disabled = modPerms.view === false;
                  return (
                    <Panel
                      key={module.id}
                      className="dark:border-gray-800"
                      header={
                        <div className="flex items-center justify-between w-full dark:text-gray-200">
                          <span className="font-bold">{module.titles.fa}</span>
                          <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.view !== false}
                              onChange={(e) => handlePermissionChange(module.id, 'view', undefined, e.target.checked)}
                            >
                              مشاهده
                            </Checkbox>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.edit !== false}
                              disabled={modPerms.view === false}
                              onChange={(e) => handlePermissionChange(module.id, 'edit', undefined, e.target.checked)}
                            >
                              ویرایش/ایجاد
                            </Checkbox>
                            <Checkbox
                              className="dark:text-gray-400"
                              checked={modPerms.delete !== false}
                              disabled={modPerms.view === false}
                              onChange={(e) => handlePermissionChange(module.id, 'delete', undefined, e.target.checked)}
                            >
                              حذف
                            </Checkbox>
                          </div>
                        </div>
                      }
                    >
                      <div className="pl-6 pt-2">
                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                          دسترسی به فیلدها و جداول
                        </Divider>
                        {renderFieldSwitches(module.id, fields, disabled)}
                      </div>
                    </Panel>
                  );
                })}

                <Panel
                  key={SETTINGS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">تنظیمات</span>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی تب های تنظیمات
                    </Divider>
                    {renderFieldSwitches(
                      SETTINGS_PERMISSION_KEY,
                      SETTINGS_TAB_PERMISSIONS,
                      getModulePerms(SETTINGS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={DASHBOARD_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">داشبورد</span>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی ویجت های داشبورد
                    </Divider>
                    {renderFieldSwitches(
                      DASHBOARD_PERMISSION_KEY,
                      DASHBOARD_WIDGET_PERMISSIONS,
                      getModulePerms(DASHBOARD_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>

                <Panel
                  key={WORKFLOWS_PERMISSION_KEY}
                  className="dark:border-gray-800"
                  header={
                    <div className="flex items-center justify-between w-full dark:text-gray-200">
                      <span className="font-bold">گردش کارها</span>
                      <div className="flex gap-4 text-xs" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).view !== false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'view',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          مشاهده
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).edit !== false}
                          disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'edit',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          ویرایش/ایجاد
                        </Checkbox>
                        <Checkbox
                          className="dark:text-gray-400"
                          checked={getModulePerms(WORKFLOWS_PERMISSION_KEY).delete !== false}
                          disabled={getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false}
                          onChange={(e) =>
                            handlePermissionChange(
                              WORKFLOWS_PERMISSION_KEY,
                              'delete',
                              undefined,
                              e.target.checked
                            )
                          }
                        >
                          حذف
                        </Checkbox>
                      </div>
                    </div>
                  }
                >
                  <div className="pl-6 pt-2">
                    <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">
                      دسترسی بخش‌های گردش کار
                    </Divider>
                    {renderFieldSwitches(
                      WORKFLOWS_PERMISSION_KEY,
                      WORKFLOWS_PERMISSION_FIELDS,
                      getModulePerms(WORKFLOWS_PERMISSION_KEY).view === false
                    )}
                  </div>
                </Panel>
              </Collapse>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <TeamOutlined className="text-4xl mb-2 opacity-30" />
            <p>یک جایگاه سازمانی را از لیست سمت راست انتخاب کنید</p>
          </div>
        )}
      </div>
      <style>{`
        .dark .ant-collapse-content { background-color: #1f1f1f; color: #ddd; border-color: #303030; }
        .dark .ant-collapse-header { color: #ddd !important; }
        .dark .ant-tree-node-content-wrapper:hover { background-color: #303030 !important; }
        .dark .ant-tree-node-selected { background-color: #2b1d11 !important; }
      `}</style>
    </div>
  );
};

export default RolesTab;
