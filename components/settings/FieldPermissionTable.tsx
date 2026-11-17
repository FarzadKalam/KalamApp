import React from 'react';
import { Checkbox, Table, Tooltip } from 'antd';
import type { ModulePermissionConfig } from '../../utils/permissions';
import { canFieldAction, PERMISSION_ACTIONS, PERMISSION_ACTION_LABELS, type PermissionAction } from '../../utils/fieldAccess';

type Props = {
  fields: Array<{ key: string; label: string; readonly?: boolean }>;
  permission: ModulePermissionConfig;
  disabled: boolean;
  onChange: (key: string, action: PermissionAction, checked: boolean) => void;
};

const FieldPermissionTable: React.FC<Props> = ({ fields, permission, disabled, onChange }) => (
  <Table size="small" rowKey="key" pagination={false} dataSource={fields} scroll={{ x: 460 }}
    columns={[
      { title: 'فیلد / بخش', dataIndex: 'label', width: 220 },
      ...PERMISSION_ACTIONS.map((action) => ({
        title: action === 'delete' ? <Tooltip title="اجازه پاک‌کردن مقدار فیلد هنگام ویرایش؛ حذف رکورد از دسترسی ماژول تعیین می‌شود.">حذف مقدار</Tooltip> : PERMISSION_ACTION_LABELS[action],
        key: action, width: 80, align: 'center' as const,
        render: (_: unknown, field: Props['fields'][number]) => (field.readonly || field.key.startsWith('__')) && action !== 'view' ? <Tooltip title="این مورد توسط سامانه مدیریت می‌شود.">—</Tooltip> : (
          <Checkbox aria-label={`${PERMISSION_ACTION_LABELS[action]} ${field.label}`}
            checked={canFieldAction(permission, field.key, action)}
            disabled={disabled || (action !== 'view' && (!canFieldAction(permission, field.key, 'view')
              || (action === 'create' ? (permission.create ?? permission.edit) === false : permission.edit === false)))}
            onChange={(event) => onChange(field.key, action, event.target.checked)} />
        ),
      })),
    ]} />
);
export default FieldPermissionTable;
