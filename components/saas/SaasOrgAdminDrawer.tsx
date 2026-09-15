import React, { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, RocketOutlined } from '@ant-design/icons';
import { executeSaasModuleAction } from '../../utils/saasAdminModules';

const { Text } = Typography;

type Props = {
  open: boolean;
  record: Record<string, any>;
  onClose: () => void;
  onChanged: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  trial: 'آزمایشی',
  suspended: 'تعلیق‌شده',
  draft: 'پیش‌نویس',
  failed: 'ناموفق',
  needs_admin_review: 'نیازمند بررسی',
};

const statusColor = (status: unknown) => {
  switch (String(status || '').trim()) {
    case 'active': return 'green';
    case 'trial': return 'blue';
    case 'suspended': return 'red';
    case 'failed': return 'red';
    case 'needs_admin_review': return 'orange';
    default: return 'default';
  }
};

const displayDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fa-IR');
};

const SaasOrgAdminDrawer: React.FC<Props> = ({ open, record, onClose, onChanged }) => {
  const { message } = App.useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const sourceKind = String(record?.source_kind || 'org').trim();
  const isDemoOrg = sourceKind === 'org' && record?.is_demo === true;

  const runAction = async (actionId: 'convert_request_to_org' | 'delete_demo_org') => {
    setActionLoading(actionId);
    try {
      const result = await executeSaasModuleAction('saas_orgs', actionId, record);
      message.success(result.message || 'عملیات انجام شد.');
      onChanged();
    } catch (error: any) {
      message.error(error?.message || 'عملیات سازمان ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Drawer
      title={record?.org_name || 'جزئیات سازمان'}
      open={open}
      onClose={onClose}
      width="min(520px, 100vw)"
      placement="left"
      destroyOnHidden
    >
      <Space direction="vertical" size={16} className="w-full">
        {sourceKind === 'request' ? (
          <Alert
            type="info"
            showIcon
            message="درخواست در انتظار ایجاد سازمان"
            description="این مورد هنوز سازمان فعال نیست و فقط پس از بررسی مدیر قابل ایجاد است."
          />
        ) : null}

        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام سازمان">{record?.org_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="آدرس">
            {record?.resolved_host || record?.slug ? (
              <Text className="ltr-text">{record?.resolved_host || `${record.slug}.tazesystem.ir`}</Text>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت">
            <Tag color={statusColor(record?.status)}>{STATUS_LABELS[String(record?.status || '')] || record?.status || '—'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت ایجاد">{record?.provision_state === 'request_pending' ? 'در انتظار ایجاد' : 'ایجاد شده'}</Descriptions.Item>
          <Descriptions.Item label="پلن">{record?.plan_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="دمو">{record?.is_demo ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="فقط خواندن">{record?.is_readonly ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="پایان دوره آزمایشی">{displayDate(record?.trial_ends_at)}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="right" plain>مالک و اطلاعات تماس</Divider>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام مالک / متقاضی">{record?.owner_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="ایمیل">{record?.owner_email || '—'}</Descriptions.Item>
          <Descriptions.Item label="موبایل">{record?.primary_contact_mobile || '—'}</Descriptions.Item>
          <Descriptions.Item label="زمان ثبت">{displayDate(record?.provisioned_at)}</Descriptions.Item>
        </Descriptions>

        {sourceKind === 'request' ? (
          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={actionLoading === 'convert_request_to_org'}
            onClick={() => void runAction('convert_request_to_org')}
          >
            ایجاد سازمان از این درخواست
          </Button>
        ) : null}

        {isDemoOrg ? (
          <div className="rounded-xl border border-red-200 p-3">
            <Text strong type="danger">عملیات خطرناک</Text>
            <div className="mt-3">
              <Popconfirm
                title="حذف کامل نسخه دمو"
                description="تمام داده‌های این نسخه دمو حذف می‌شود و قابل بازگشت نیست."
                okText="حذف کامل"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: actionLoading === 'delete_demo_org' }}
                onConfirm={() => runAction('delete_demo_org')}
              >
                <Button danger icon={<DeleteOutlined />} loading={actionLoading === 'delete_demo_org'}>
                  حذف کامل نسخه دمو
                </Button>
              </Popconfirm>
            </div>
          </div>
        ) : null}
      </Space>
    </Drawer>
  );
};

export default SaasOrgAdminDrawer;
