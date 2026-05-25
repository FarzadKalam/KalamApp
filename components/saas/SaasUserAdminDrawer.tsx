import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { SOFTWARE_ROLE_OPTIONS } from '../../utils/softwareRoles';
import { formatIranMobileForInput, normalizeIranMobile } from '../../utils/phoneNumber';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import {
  fetchSaasUserDirectory,
  invokeSaasUserAdmin,
  type SaasAdminUserRow,
  type SaasUserDirectory,
  type SaasUserMatchCandidate,
} from '../../utils/saasUserAdmin';

const { Text } = Typography;

type Props = {
  open: boolean;
  record: SaasAdminUserRow | null;
  onClose: () => void;
  onChanged: () => void;
};

const STATUS_META = {
  critical: { label: 'بحرانی', color: 'red' },
  repair_required: { label: 'نیازمند اصلاح', color: 'orange' },
  warning: { label: 'هشدار', color: 'gold' },
  healthy: { label: 'سالم', color: 'green' },
} as const;

const SaasUserAdminDrawer: React.FC<Props> = ({ open, record, onClose, onChanged }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [directory, setDirectory] = useState<SaasUserDirectory>({ organizations: [], roles: [] });
  const [saving, setSaving] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [matches, setMatches] = useState<SaasUserMatchCandidate[]>([]);
  const [matching, setMatching] = useState(false);
  const organizationId = Form.useWatch('org_id', form);

  useEffect(() => {
    if (!open || !record) return;
    form.setFieldsValue({
      full_name: record.full_name || '',
      email: record.email || '',
      mobile: formatIranMobileForInput(record.mobile || ''),
      org_id: record.org_id || undefined,
      role_id: record.role_id || undefined,
      role: record.software_role || 'viewer',
      is_active: record.is_active !== false,
    });
    setOtpRequested(false);
    setOtpCode('');
    setMatches([]);
    void fetchSaasUserDirectory()
      .then(setDirectory)
      .catch((error) => message.error(toFaErrorMessage(error as any, 'خواندن گزینه‌های سازمان ناموفق بود.')));
    if (!record.profile_exists && record.auth_exists) {
      setMatching(true);
      void invokeSaasUserAdmin({ action: 'saas_find_profile_matches', userId: record.id })
        .then((data) => setMatches(Array.isArray(data?.matches) ? data.matches : []))
        .catch((error) => message.error(toFaErrorMessage(error as any, 'بررسی تطبیق حساب یتیم ناموفق بود.')))
        .finally(() => setMatching(false));
    }
  }, [form, message, open, record]);

  const roleOptions = useMemo(
    () => directory.roles
      .filter((role) => !organizationId || String(role.org_id || '') === String(organizationId))
      .map((role) => ({ value: role.value, label: role.label })),
    [directory.roles, organizationId],
  );

  if (!record) return null;
  const status = STATUS_META[record.audit_status] || STATUS_META.warning;

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const mobile = normalizeIranMobile(values.mobile);
      if (values.mobile && !mobile) throw new Error('شماره موبایل معتبر نیست.');
      setSaving(true);
      await invokeSaasUserAdmin({
        action: 'saas_upsert_user',
        userId: record.id,
        fullName: values.full_name,
        email: values.email || null,
        phone: mobile || null,
        orgId: values.org_id || null,
        roleId: values.role_id || null,
        role: values.role || 'viewer',
        isActive: values.is_active !== false,
      });
      message.success(record.profile_exists ? 'اطلاعات کاربر اصلاح شد.' : 'پروفایل کاربر ایجاد و تکمیل شد.');
      onChanged();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, 'ذخیره اطلاعات کاربر ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendOtp = async () => {
    const mobile = normalizeIranMobile(form.getFieldValue('mobile'));
    if (!mobile) {
      message.error('ابتدا شماره موبایل معتبر وارد و ذخیره کنید.');
      return;
    }
    setOtpLoading(true);
    try {
      await invokeSaasUserAdmin({ action: 'saas_send_phone_otp', userId: record.id, phone: mobile });
      setOtpRequested(true);
      message.success('کد تایید ارسال شد.');
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'ارسال کد تایید ناموفق بود.'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const mobile = normalizeIranMobile(form.getFieldValue('mobile'));
    if (!mobile || !otpCode.trim()) return;
    setOtpLoading(true);
    try {
      await invokeSaasUserAdmin({ action: 'saas_verify_phone_otp', userId: record.id, phone: mobile, token: otpCode });
      message.success('ورود پیامکی کاربر تایید شد.');
      setOtpRequested(false);
      setOtpCode('');
      onChanged();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'تایید کد ناموفق بود.'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const preflight = await invokeSaasUserAdmin({ action: 'saas_delete_user_preflight', userId: record.id });
      modal.confirm({
        title: 'حذف کامل کاربر',
        content: `حساب «${preflight.name || record.full_name || 'بدون نام'}»${preflight.organization_name ? ` از سازمان «${preflight.organization_name}»` : ''} به طور کامل حذف شود؟`,
        okText: 'حذف کامل',
        cancelText: 'انصراف',
        okType: 'danger',
        onOk: async () => {
          await invokeSaasUserAdmin({ action: 'saas_delete_user', userId: record.id });
          message.success('کاربر حذف شد.');
          onClose();
          onChanged();
        },
      });
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'حذف کاربر مجاز نیست.'));
    }
  };

  const handleLinkMatch = async (candidate: SaasUserMatchCandidate) => {
    try {
      await invokeSaasUserAdmin({
        action: 'saas_link_orphan_to_profile',
        userId: record.id,
        targetUserId: candidate.userId,
      });
      message.success('حساب یتیم به پروفایل موجود متصل شد.');
      onClose();
      onChanged();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'اتصال حساب یتیم ناموفق بود.'));
    }
  };

  return (
    <Drawer
      title={`مدیریت کاربر: ${record.full_name || 'بدون نام'}`}
      open={open}
      onClose={onClose}
      width="min(560px, 100vw)"
      placement="left"
      styles={{ body: { paddingBottom: 90 } }}
      footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>انصراف</Button><Button type="primary" loading={saving} onClick={handleSave}>ذخیره اصلاحات</Button></div>}
    >
      <Space direction="vertical" className="w-full" size={16}>
        <Alert
          showIcon
          type={record.audit_status === 'critical' ? 'error' : record.audit_status === 'healthy' ? 'success' : 'warning'}
          message={<Space><Tag color={status.color}>{status.label}</Tag><span>{record.issues || 'صحیح'}</span></Space>}
        />
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="حساب ورود">{record.auth_exists ? 'موجود' : 'وجود ندارد'}</Descriptions.Item>
          <Descriptions.Item label="پروفایل">{record.profile_exists ? 'موجود' : 'نیاز به ایجاد'}</Descriptions.Item>
          <Descriptions.Item label="نوع سازمان">{record.is_demo ? 'نسخه دمو' : 'عادی'}</Descriptions.Item>
        </Descriptions>
        {!record.profile_exists && record.auth_exists ? (
          <Alert
            type="info"
            showIcon
            message="تطبیق حساب یتیم"
            description={
              matching
                ? 'در حال بررسی پروفایل‌های مشابه...'
                : matches.length === 0
                  ? 'پروفایل مشابهی پیدا نشد؛ با تکمیل فرم، پروفایل جدید ایجاد می‌شود.'
                  : matches.map((candidate) => {
                    const org = directory.organizations.find((item) => item.value === candidate.orgId);
                    return (
                      <div key={candidate.userId} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 p-2">
                        <span>{candidate.fullName || 'بدون نام'}{org ? ` - ${org.label}` : ''}</span>
                        <Popconfirm
                          title="این حساب یتیم به پروفایل موجود متصل شود؟"
                          description="حساب ورود یتیم حذف و شماره ورود به پروفایل موجود منتقل می‌شود."
                          okText="اتصال"
                          cancelText="انصراف"
                          onConfirm={() => handleLinkMatch(candidate)}
                        >
                          <Button size="small" type="primary">اتصال امن</Button>
                        </Popconfirm>
                      </div>
                    );
                  })
            }
          />
        ) : null}
        <Form form={form} layout="vertical">
          <Collapse defaultActiveKey={['identity', 'access', 'login']} ghost items={[
            {
              key: 'identity',
              label: 'اطلاعات هویتی',
              children: <>
                <Form.Item name="full_name" label="نام و نام خانوادگی" rules={[{ required: true, message: 'نام الزامی است.' }]}><Input /></Form.Item>
                <Form.Item name="email" label="ایمیل"><Input inputMode="email" /></Form.Item>
                <Form.Item name="mobile" label="شماره موبایل"><Input inputMode="tel" /></Form.Item>
              </>,
            },
            {
              key: 'access',
              label: 'دسترسی سازمانی',
              children: <>
                <Form.Item name="org_id" label="سازمان" rules={[{ required: true, message: 'سازمان را انتخاب کنید.' }]}>
                  <Select showSearch optionFilterProp="label" options={directory.organizations.map((org) => ({ value: org.value, label: `${org.label}${org.is_demo ? ' (دمو)' : ''}` }))} />
                </Form.Item>
                <Form.Item name="role_id" label="نقش سازمانی" rules={[{ required: true, message: 'نقش سازمانی را انتخاب کنید.' }]}>
                  <Select showSearch optionFilterProp="label" options={roleOptions} />
                </Form.Item>
                <Form.Item name="role" label="نقش نرم‌افزاری"><Select options={SOFTWARE_ROLE_OPTIONS} /></Form.Item>
                <Form.Item name="is_active" label="فعال باشد" valuePropName="checked"><Switch /></Form.Item>
              </>,
            },
            {
              key: 'login',
              label: 'ورود پیامکی',
              children: <>
                <Text type="secondary">{record.phone_confirmed ? 'شماره موبایل برای ورود پیامکی تایید شده است.' : 'تایید شماره فقط در صورت نیاز به ورود پیامکی لازم است.'}</Text>
                <div className="mt-3 flex gap-2">
                  <Button icon={<SafetyCertificateOutlined />} loading={otpLoading} onClick={handleSendOtp}>ارسال کد تایید</Button>
                </div>
                {otpRequested ? <div className="mt-3 flex gap-2"><Input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="کد تایید" /><Button type="primary" loading={otpLoading} onClick={handleVerifyOtp}>ثبت کد</Button></div> : null}
              </>,
            },
          ]} />
        </Form>
        <div className="rounded-xl border border-red-200 p-3">
          <Text strong type="danger">عملیات خطرناک</Text>
          <div className="mt-3">
            <Popconfirm title="ابتدا وضعیت حذف بررسی شود؟" okText="بررسی" cancelText="انصراف" onConfirm={handleDelete}>
              <Button danger icon={<DeleteOutlined />}>حذف کامل کاربر</Button>
            </Popconfirm>
          </div>
        </div>
      </Space>
    </Drawer>
  );
};

export default SaasUserAdminDrawer;
