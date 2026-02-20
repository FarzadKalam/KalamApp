import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Empty, Spin } from 'antd';
import { BankOutlined, UsergroupAddOutlined, ClusterOutlined, FunctionOutlined, ApartmentOutlined, ApiOutlined } from '@ant-design/icons';
import CompanyTab from './CompanyTab';
import UsersTab from './UsersTab';
import RolesTab from './RolesTab';
import ConnectionsTab from './ConnectionsTab';
import ModuleListRefine from '../ModuleList_Refine';
import { supabase } from '../../supabaseClient';
import { SETTINGS_PERMISSION_KEY, WORKFLOWS_PERMISSION_KEY } from '../../utils/permissions';
import WorkflowsManager from '../../components/workflows/WorkflowsManager';

const SettingsPage: React.FC = () => {
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const fetchPermissions = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          if (active) {
            setTabPermissions({});
            setLoadingPermissions(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.role_id) {
          if (active) {
            setTabPermissions({});
            setLoadingPermissions(false);
          }
          return;
        }

        const { data: role } = await supabase
          .from('org_roles')
          .select('permissions')
          .eq('id', profile.role_id)
          .maybeSingle();

        const settingsPerms = role?.permissions?.[SETTINGS_PERMISSION_KEY] || {};
        const workflowsPerms = role?.permissions?.[WORKFLOWS_PERMISSION_KEY] || {};
        const canViewSettings = settingsPerms.view !== false;
        const fields = settingsPerms.fields || {};
        const workflowFields = workflowsPerms.fields || {};

        if (active) {
          if (!canViewSettings) {
            setTabPermissions({
              company: false,
              users: false,
              roles: false,
              formulas: false,
              connections: false,
              workflows: false,
            });
          } else {
            setTabPermissions({
              company: fields.company !== false,
              users: fields.users !== false,
              roles: fields.roles !== false,
              formulas: fields.formulas !== false,
              connections: fields.connections !== false,
              workflows:
                fields.workflows !== false &&
                workflowsPerms.view !== false &&
                workflowFields.settings_tab !== false,
            });
          }
          setLoadingPermissions(false);
        }
      } catch {
        if (active) {
          setTabPermissions({});
          setLoadingPermissions(false);
        }
      }
    };

    fetchPermissions();
    return () => {
      active = false;
    };
  }, []);

  const baseItems = useMemo(
    () => [
      {
        key: 'company',
        label: <span className="flex items-center gap-2 text-base"><BankOutlined /> مشخصات شرکت</span>,
        children: <CompanyTab />,
      },
      {
        key: 'users',
        label: <span className="flex items-center gap-2 text-base"><UsergroupAddOutlined /> مدیریت کاربران</span>,
        children: <UsersTab />,
      },
      {
        key: 'roles',
        label: <span className="flex items-center gap-2 text-base"><ClusterOutlined /> چارت سازمانی</span>,
        children: <RolesTab />,
      },
      {
        key: 'formulas',
        label: <span className="flex items-center gap-2 text-base"><FunctionOutlined /> فرمول های محاسباتی</span>,
        children: <ModuleListRefineWrapper moduleId="calculation_formulas" />,
      },
      {
        key: 'connections',
        label: <span className="flex items-center gap-2 text-base"><ApiOutlined /> اتصالات</span>,
        children: <ConnectionsTab />,
      },
      {
        key: 'workflows',
        label: <span className="flex items-center gap-2 text-base"><ApartmentOutlined /> گردش کارها</span>,
        children: <WorkflowsManager inline defaultModuleId={null} context="settings" />,
      },
    ],
    []
  );

  const items = useMemo(() => {
    if (Object.keys(tabPermissions).length === 0) return baseItems;
    return baseItems.filter((item) => tabPermissions[item.key] !== false);
  }, [baseItems, tabPermissions]);

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        {loadingPermissions ? (
          <div className="h-[55vh] flex items-center justify-center">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-[55vh] flex items-center justify-center">
            <Empty description="دسترسی به تب های تنظیمات ندارید" />
          </div>
        ) : (
          <Tabs defaultActiveKey={items[0]?.key || 'company'} items={items} size="large" className="dark:text-gray-200" />
        )}
      </div>
      <style>{`
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-tabs-ink-bar { background: #d4a373 !important; }
      `}</style>
    </div>
  );
};

export default SettingsPage;

const ModuleListRefineWrapper: React.FC<{ moduleId: string }> = ({ moduleId }) => {
  return <ModuleListRefine moduleIdOverride={moduleId} />;
};
