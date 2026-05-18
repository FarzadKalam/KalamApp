import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
} from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { getOtpErrorMessage, normalizeOtpToken } from '../../utils/otpAuth';
import { getPhoneOtpStatusMeta, lookupPhoneLoginCandidate } from '../../utils/phoneAuth';
import { formatIranMobileForInput, normalizeIranMobile } from '../../utils/phoneNumber';
import { clearSessionBootstrapCache, fetchSessionBootstrap } from '../../utils/sessionCache';
import { canManageSuperAdminByRoleContext, canManageUsersByRoleContext } from '../../utils/softwareRoles';
import { isUploadCanceledError, uploadFileWithProgress } from '../../utils/uploadFileWithProgress';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';

type ResponsiveBreakpoint = 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

type UserRow = {
  id: string;
  org_id?: string | null;
  role?: string | null;
  role_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  mobile_1?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  voip_enabled?: boolean;
  voip_operator_code?: string | null;
  voip_extension?: string | null;
  voip_service_id?: string | null;
  voip_dial_mode?: 'telefonchy_smartcall' | 'sip_link' | 'tel_link' | null;
  created_at?: string | null;
  org_roles?: any;
  _rowType: 'profile' | 'invite';
  _inviteId?: string | null;
  _isPending?: boolean;
};

const SYSTEM_ROLE_OPTIONS = [
  { label: 'مدیر ارشد', value: 'super_admin' },
  { label: 'مدیر سیستم', value: 'admin' },
  { label: 'مدیر', value: 'manager' },
  { label: 'ویرایشگر', value: 'editor' },
  { label: 'مشاهده‌گر', value: 'viewer' },
];

const VOIP_DIAL_MODE_OPTIONS = [
  { label: 'Smart Call تلفنچی', value: 'telefonchy_smartcall' },
  { label: 'لینک SIP', value: 'sip_link' },
  { label: 'لینک تلفن', value: 'tel_link' },
];

const normalizeRoleToken = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\\s_\\-\\u200c]+/g, ''); /*
    .replace(/[\s_\-‌]+/g, '');

  'مدیر',
  'مدیراشد',
  'مدیرسیستم',
  'مدیرسازمان',
]);

*/
const toInviteDisplayPhone = (value?: string | null) => {
  if (!value) return '';
  return formatIranMobileForInput(value);
};

const UsersTab: React.FC = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [currentUserRoleTitle, setCurrentUserRoleTitle] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [seedInvite, setSeedInvite] = useState<UserRow | null>(null);
  const [phoneAuthState, setPhoneAuthState] = useState<any | null>(null);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [form] = Form.useForm();

  const mobileValue = Form.useWatch('mobile', form);
  const normalizedFormPhone = useMemo(() => normalizeIranMobile(mobileValue), [mobileValue]);
  const fallbackCurrentRoleTitle = useMemo(() => {
    const currentRole = roles.find((role) => String(role?.id || '') === String(currentUserRoleId || ''));
    return String(currentRole?.title || '').trim();
  }, [currentUserRoleId, roles]);
  const effectiveCurrentRoleTitle = String(currentUserRoleTitle || fallbackCurrentRoleTitle || '').trim();
  const canManageSuperAdmin = canManageSuperAdminByRoleContext(currentUserRole, effectiveCurrentRoleTitle)
    || normalizeRoleToken(effectiveCurrentRoleTitle) === 'مدیراشد';
  const canManageUsers = canManageUsersByRoleContext(currentUserRole, effectiveCurrentRoleTitle);
  const isEditingRealUser = editingUser?._rowType === 'profile';
  const drawerTitle = isEditingRealUser
    ? 'ویرایش کاربر'
    : seedInvite
      ? 'تکمیل ایجاد کاربر'
      : 'ایجاد کاربر';

  useEffect(() => {
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!currentOrgId) {
      setRows([]);
      setRoles([]);
      setLoading(false);
      return;
    }
    void fetchData();
  }, [currentOrgId]);

  useEffect(() => {
    let active = true;
    const loadPhoneStatus = async () => {
      if (!isDrawerOpen || !normalizedFormPhone) {
        if (active) {
          setPhoneAuthState(null);
        }
        return;
      }
      const candidate = await lookupPhoneLoginCandidate(normalizedFormPhone);
      if (active) {
        setPhoneAuthState(candidate);
      }
    };
    loadPhoneStatus();
    return () => {
      active = false;
    };
  }, [isDrawerOpen, normalizedFormPhone]);

  const loadCurrentUser = async () => {
    const snapshot = await fetchSessionBootstrap(supabase, { force: true });
    const snapshotUserId = snapshot.user?.id || null;
    let nextUserId = snapshotUserId;
    let nextSoftwareRole = snapshot.profile?.role || null;
    let nextRoleId = snapshot.roleId || null;
    let nextOrgId = snapshot.orgId || null;
    let nextRoleTitle: string | null = null;

    if (nextUserId && (!nextSoftwareRole || !nextRoleId || !nextOrgId)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, role_id, org_id')
        .eq('id', nextUserId)
        .maybeSingle();
      nextSoftwareRole = profile?.role || nextSoftwareRole;
      nextRoleId = profile?.role_id || nextRoleId;
      nextOrgId = profile?.org_id || nextOrgId;
    }

    if (nextRoleId) {
      const { data: roleRow } = await supabase
        .from('org_roles')
        .select('title')
        .eq('id', nextRoleId)
        .maybeSingle();
      nextRoleTitle = String(roleRow?.title || '').trim() || null;
    }

    setCurrentUserId(nextUserId);
    setCurrentUserRole(nextSoftwareRole);
    setCurrentUserRoleId(nextRoleId);
    setCurrentUserRoleTitle(nextRoleTitle);
    setCurrentOrgId(nextOrgId);
  };

  const fetchData = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const [{ data: usersData, error: usersError }, { data: rolesData, error: rolesError }, { data: invitesData, error: invitesError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, org_id, role, role_id, full_name, email, mobile_1, avatar_url, is_active, voip_enabled, voip_operator_code, voip_extension, voip_service_id, voip_dial_mode, created_at, org_roles(title)')
            .eq('org_id', currentOrgId)
            .order('created_at', { ascending: false }),
          supabase.from('org_roles').select('*').eq('org_id', currentOrgId).order('created_at', { ascending: true }),
          supabase
            .from('phone_signup_invites')
            .select('id, org_id, role, role_id, full_name, email, phone_e164, is_active, created_at')
            .eq('org_id', currentOrgId)
            .is('consumed_at', null)
            .order('created_at', { ascending: false }),
        ]);

      if (usersError) throw usersError;
      if (rolesError) throw rolesError;
      if (invitesError) throw invitesError;

      const profileRows: UserRow[] = (usersData || []).map((row: any) => ({
        ...row,
        _rowType: 'profile',
      }));

      const inviteRows: UserRow[] = (invitesData || []).map((row: any) => ({
        id: `invite:${row.id}`,
        org_id: row.org_id,
        role: row.role,
        role_id: row.role_id,
        full_name: row.full_name,
        email: row.email,
        mobile_1: toInviteDisplayPhone(row.phone_e164),
        avatar_url: null,
        is_active: row.is_active !== false,
        created_at: row.created_at,
        _rowType: 'invite',
        _inviteId: row.id,
        _isPending: true,
      }));

      setRows([...profileRows, ...inviteRows]);
      setRoles(rolesData || []);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'خطا در دریافت کاربران'));
    } finally {
      setLoading(false);
    }
  };

  const getRoleDisplayTitle = (role: any) => {
    return String(role?.title || role?.name || '').trim() || 'بدون عنوان';
  };

  const canEditRecord = (record: UserRow) => {
    if (!canManageUsers) return false;
    if (record._rowType !== 'profile') return true;
    if (record?.role === 'super_admin' && !canManageSuperAdmin) {
      return false;
    }
    return true;
  };

  const canDeleteRecord = (record: UserRow) => {
    if (!canEditRecord(record)) return false;
    if (record._rowType === 'profile' && String(record.id || '') === String(currentUserId || '')) {
      return false;
    }
    return true;
  };

  const handleRoleChange = async (record: UserRow, roleId: string) => {
    if (record._rowType !== 'profile') return;
    const { error } = await supabase.from('profiles').update({ role_id: roleId }).eq('id', record.id);
    if (error) {
      message.error(toFaErrorMessage(error as any, 'تغییر جایگاه سازمانی ناموفق بود'));
      return;
    }
    if (record.id === currentUserId) {
      clearSessionBootstrapCache();
    }
    message.success('جایگاه سازمانی کاربر تغییر کرد');
    fetchData();
  };

  const handleStatusChange = async (record: UserRow, isActive: boolean) => {
    if (record._rowType === 'invite' && record._inviteId) {
      const { error } = await supabase
        .from('phone_signup_invites')
        .update({ is_active: isActive })
        .eq('id', record._inviteId);
      if (error) {
        message.error(toFaErrorMessage(error as any, 'بروزرسانی وضعیت ناموفق بود'));
        return;
      }
      message.success('وضعیت رکورد در انتظار تکمیل بروزرسانی شد');
      fetchData();
      return;
    }

    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', record.id);
    if (error) {
      message.error(toFaErrorMessage(error as any, 'بروزرسانی وضعیت ناموفق بود'));
      return;
    }
    if (record.id === currentUserId) {
      clearSessionBootstrapCache();
    }
    message.success('وضعیت کاربر بروزرسانی شد');
    fetchData();
  };

  const handleDeleteRecord = async (record: UserRow) => {
    if (!canDeleteRecord(record)) {
      message.error('دسترسی کافی ندارید');
      return;
    }

    try {
      if (record._rowType === 'invite' && record._inviteId) {
        const { error } = await supabase
          .from('phone_signup_invites')
          .delete()
          .eq('id', record._inviteId)
          .eq('org_id', currentOrgId);
        if (error) throw error;
        message.success('دعوت کاربر حذف شد');
        await fetchData();
        return;
      }

      await invokeUserAdmin({
        action: 'delete_user',
        userId: record.id,
      });
      message.success('کاربر حذف شد');
      await fetchData();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'حذف کاربر ناموفق بود'));
    }
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      const fileName = `avatar-${Date.now()}.${file.name.split('.').pop()}`;
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: fileName,
        file,
        label: file.name || 'آواتار',
        detail: 'تصویر کاربر',
      });
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(fileName);
      setAvatarUrl(data.publicUrl);
      return false;
    } catch (error) {
      if (isUploadCanceledError(error)) return false;
      message.error(toFaErrorMessage(error as any, 'خطا در آپلود عکس'));
      return false;
    }
  };

  const resetDrawerState = () => {
    setIsDrawerOpen(false);
    setEditingUser(null);
    setSeedInvite(null);
    setAvatarUrl(null);
    setPhoneAuthState(null);
    setPhoneOtpRequested(false);
    setPhoneOtpCode('');
    form.resetFields();
  };

  const openCreateDrawer = () => {
    setEditingUser(null);
    setSeedInvite(null);
    setAvatarUrl(null);
    setPhoneAuthState(null);
    setPhoneOtpRequested(false);
    setPhoneOtpCode('');
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      role: 'viewer',
      voip_enabled: false,
      voip_operator_code: '',
      voip_extension: '',
      voip_service_id: '',
      voip_dial_mode: 'telefonchy_smartcall',
    });
    setIsDrawerOpen(true);
  };

  const openCompleteInviteDrawer = (record: UserRow) => {
    setEditingUser(record);
    setSeedInvite(record);
    setAvatarUrl(null);
    setPhoneOtpRequested(false);
    setPhoneOtpCode('');
    form.resetFields();
    form.setFieldsValue({
      full_name: record.full_name,
      email: record.email,
      mobile: record.mobile_1,
      role_id: record.role_id || null,
      role: record.role || 'viewer',
      is_active: record.is_active !== false,
      voip_enabled: record.voip_enabled === true,
      voip_operator_code: record.voip_operator_code || '',
      voip_extension: record.voip_extension || '',
      voip_service_id: record.voip_service_id || '',
      voip_dial_mode: record.voip_dial_mode || 'telefonchy_smartcall',
    });
    setIsDrawerOpen(true);
  };

  const handleEdit = (record: UserRow) => {
    if (!canEditRecord(record)) {
      message.error('دسترسی کافی ندارید');
      return;
    }
    if (record._rowType === 'invite') {
      openCompleteInviteDrawer(record);
      return;
    }

    setEditingUser(record);
    setSeedInvite(null);
    setAvatarUrl(record.avatar_url || null);
    setPhoneOtpRequested(false);
    setPhoneOtpCode('');
    form.resetFields();
    form.setFieldsValue({
      full_name: record.full_name,
      email: record.email,
      mobile: record.mobile_1,
      role_id: record.role_id || null,
      role: record.role || 'viewer',
      is_active: record.is_active !== false,
      voip_enabled: record.voip_enabled === true,
      voip_operator_code: record.voip_operator_code || '',
      voip_extension: record.voip_extension || '',
      voip_service_id: record.voip_service_id || '',
      voip_dial_mode: record.voip_dial_mode || 'telefonchy_smartcall',
      password: '',
      password_confirm: '',
    });
    setIsDrawerOpen(true);
  };

  const invokeUserAdmin = async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('user-admin', {
      body,
    });
    if (error) throw error;
    if (data?.success === false) {
      const nextError: any = new Error(String(data?.message || 'خطا در عملیات کاربر'));
      if (data?.reason_code) nextError.code = String(data.reason_code);
      throw nextError;
    }
    return data;
  };

  const buildVoipProfilePatch = (values: any) => ({
    voip_enabled: values.voip_enabled === true,
    voip_operator_code: String(values.voip_operator_code || '').trim() || null,
    voip_extension: String(values.voip_extension || '').trim() || null,
    voip_service_id: String(values.voip_service_id || '').trim() || null,
    voip_dial_mode: values.voip_dial_mode || 'telefonchy_smartcall',
  });

  const handleAddOrEditUser = async (values: any) => {
    if (!canManageUsers) {
      message.error('دسترسی کافی ندارید');
      return;
    }

    const normalizedPhone = normalizeIranMobile(values.mobile);
    if (!normalizedPhone) {
      message.error('شماره موبایل معتبر نیست.');
      return;
    }

    if (!isEditingRealUser) {
      if (!values.password || String(values.password).trim().length < 6) {
        message.error('رمز عبور باید حداقل ۶ کاراکتر باشد.');
        return;
      }
      if (values.password !== values.password_confirm) {
        message.error('رمز عبور و تکرار آن یکسان نیست.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEditingRealUser && editingUser) {
        await invokeUserAdmin({
          action: 'update_user',
          userId: editingUser.id,
          orgId: editingUser.org_id || currentOrgId,
          fullName: values.full_name,
          email: values.email || null,
          phone: normalizedPhone,
          roleId: values.role_id || null,
          role: values.role || 'viewer',
          avatarUrl: avatarUrl ?? editingUser.avatar_url ?? null,
          isActive: values.is_active !== false,
          password: values.password || undefined,
        });

        const { error: voipUpdateError } = await supabase
          .from('profiles')
          .update(buildVoipProfilePatch(values))
          .eq('id', editingUser.id);
        if (voipUpdateError) throw voipUpdateError;

        if (editingUser.id === currentUserId) {
          clearSessionBootstrapCache();
        }
        message.success('اطلاعات کاربر بروزرسانی شد');
        await fetchData();
        const updatedRecord = rows.find((row) => row._rowType === 'profile' && row.id === editingUser.id) || editingUser;
        setEditingUser(updatedRecord);
      } else {
        const candidate = await lookupPhoneLoginCandidate(normalizedPhone);
        if (candidate?.exists_in_profiles) {
          throw new Error('برای این شماره موبایل قبلا کاربر ثبت شده است.');
        }

        const created = await invokeUserAdmin({
          action: 'create_user',
          orgId: seedInvite?.org_id || currentOrgId,
          fullName: values.full_name,
          email: values.email || null,
          phone: normalizedPhone,
          roleId: values.role_id || null,
          role: values.role || 'viewer',
          avatarUrl: avatarUrl || null,
          isActive: values.is_active !== false,
          password: values.password,
        });

        message.success('کاربر با موفقیت ایجاد شد. حالا می‌توانید شماره او را همین‌جا تایید کنید.');
        await fetchData();
        const createdId = String(created?.profile?.id || created?.user?.id || '').trim();
        if (createdId) {
          const { data: createdProfile } = await supabase
            .from('profiles')
            .update(buildVoipProfilePatch(values))
            .eq('id', createdId)
            .select('id, org_id, role, role_id, full_name, email, mobile_1, avatar_url, is_active, voip_enabled, voip_operator_code, voip_extension, voip_service_id, voip_dial_mode, created_at, org_roles(title)')
            .maybeSingle();
          if (createdProfile) {
            setEditingUser({
              ...createdProfile,
              _rowType: 'profile',
            });
            setSeedInvite(null);
            form.setFieldsValue({
              full_name: createdProfile.full_name,
              email: createdProfile.email,
              mobile: createdProfile.mobile_1,
              role_id: createdProfile.role_id || null,
              role: createdProfile.role || 'viewer',
              is_active: createdProfile.is_active !== false,
              voip_enabled: createdProfile.voip_enabled === true,
              voip_operator_code: createdProfile.voip_operator_code || '',
              voip_extension: createdProfile.voip_extension || '',
              voip_service_id: createdProfile.voip_service_id || '',
              voip_dial_mode: createdProfile.voip_dial_mode || 'telefonchy_smartcall',
              password: '',
              password_confirm: '',
            });
            setAvatarUrl(createdProfile.avatar_url || avatarUrl || null);
            setIsDrawerOpen(true);
          } else {
            resetDrawerState();
          }
        } else {
          resetDrawerState();
        }
      }
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'ذخیره کاربر ناموفق بود'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    if (!editingUser || editingUser._rowType !== 'profile') return;
    if (!normalizedFormPhone) {
      message.error('شماره موبایل معتبر نیست.');
      return;
    }
    if (normalizeIranMobile(editingUser.mobile_1 || '') !== normalizedFormPhone) {
      message.warning('ابتدا تغییرات شماره موبایل را ذخیره کنید، سپس کد تایید بفرستید.');
      return;
    }

    setPhoneOtpLoading(true);
    try {
      await invokeUserAdmin({
        action: 'send_phone_otp',
        userId: editingUser.id,
        phone: normalizedFormPhone,
      });
      setPhoneOtpRequested(true);
      message.success('کد تایید شماره موبایل ارسال شد.');
    } catch (error) {
      message.error(getOtpErrorMessage(error as any, 'ارسال کد تایید ناموفق بود'));
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!editingUser || editingUser._rowType !== 'profile') return;
    const normalizedOtpToken = normalizeOtpToken(phoneOtpCode);
    if (!normalizedFormPhone) {
      message.error('شماره موبایل معتبر نیست.');
      return;
    }
    if (!normalizedOtpToken) {
      message.error('کد تایید را وارد کنید.');
      return;
    }
    if (normalizeIranMobile(editingUser.mobile_1 || '') !== normalizedFormPhone) {
      message.warning('ابتدا تغییرات شماره موبایل را ذخیره کنید، سپس کد تایید را ثبت کنید.');
      return;
    }

    setPhoneOtpLoading(true);
    try {
      await invokeUserAdmin({
        action: 'verify_phone_otp',
        userId: editingUser.id,
        phone: normalizedFormPhone,
        token: normalizedOtpToken,
      });
      setPhoneOtpRequested(false);
      setPhoneOtpCode('');
      setPhoneAuthState(await lookupPhoneLoginCandidate(normalizedFormPhone));
      message.success('شماره موبایل برای ورود پیامکی تایید شد.');
    } catch (error) {
      message.error(getOtpErrorMessage(error as any, 'تایید شماره ناموفق بود'));
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const phoneStatusMeta = getPhoneOtpStatusMeta(phoneAuthState, mobileValue);

  const columns = [
    {
      title: 'کاربر',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text: string, record: UserRow) => {
        const content = (
          <>
            <Avatar
              src={record.avatar_url}
              icon={<UserOutlined />}
              className="bg-leather-100 text-leather-600 border border-leather-200"
              size={40}
            />
            <div className="flex flex-col">
              <span className="font-bold text-gray-700 dark:text-gray-200 group-hover:text-leather-600 transition-colors">
                {text || 'بدون نام'}
              </span>
              <span className="text-xs text-gray-400">{record.email || 'بدون ایمیل'}</span>
              {record._isPending ? (
                <Tag color="gold" className="w-fit mt-1">
                  در انتظار تکمیل ایجاد
                </Tag>
              ) : null}
            </div>
          </>
        );

        if (record._rowType !== 'profile') {
          return <div className="flex items-center gap-3">{content}</div>;
        }

        return (
          <Link to={`/profile/${record.id}`} className="flex items-center gap-3 group">
            {content}
          </Link>
        );
      },
    },
    {
      title: 'موبایل',
      dataIndex: 'mobile_1',
      key: 'mobile',
      className: 'text-gray-600 dark:text-gray-400 font-mono',
      responsive: ['md'] as ResponsiveBreakpoint[],
    },
    {
      title: 'جایگاه سازمانی',
      key: 'role',
      render: (_: any, record: UserRow) =>
        record._rowType === 'profile' ? (
          <Select
            value={record.role_id || undefined}
            style={{ width: '100%', minWidth: 140 }}
            placeholder="انتخاب جایگاه"
            onChange={(val) => handleRoleChange(record, val)}
            options={roles.map((role) => ({ label: getRoleDisplayTitle(role), value: role.id }))}
            className="custom-select"
            disabled={!canEditRecord(record)}
            getPopupContainer={resolveOverlayPopupContainer}
          />
        ) : (
          <Tag>{record.role_id ? roles.find((role) => role.id === record.role_id)?.title || 'در انتظار تعیین' : 'در انتظار تعیین'}</Tag>
        ),
    },
    {
      title: 'وضعیت',
      key: 'status',
      width: 120,
      render: (_: any, record: UserRow) => (
        <Switch
          checked={record.is_active !== false}
          checkedChildren="فعال"
          unCheckedChildren="غیرفعال"
          onChange={(checked) => handleStatusChange(record, checked)}
          className="bg-gray-300"
          disabled={!canEditRecord(record)}
        />
      ),
    },
    {
      title: 'عملیات',
      key: 'actions',
      width: 220,
      render: (_: any, record: UserRow) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(record)} disabled={!canEditRecord(record)}>
            {record._rowType === 'invite' ? 'تکمیل ایجاد' : 'ویرایش'}
          </Button>
          <Popconfirm
            title={record._rowType === 'invite' ? 'حذف دعوت کاربر' : 'حذف کاربر'}
            description={
              record._rowType === 'invite'
                ? 'این دعوت حذف شود؟'
                : 'این کاربر از سیستم حذف شود؟'
            }
            okText="حذف"
            cancelText="انصراف"
            onConfirm={() => handleDeleteRecord(record)}
            disabled={!canDeleteRecord(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!canDeleteRecord(record)}>
              حذف
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="py-4">
      <div className="flex justify-end mb-4">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateDrawer}
          className="bg-leather-600 hover:!bg-leather-500 border-none h-10 px-6"
          disabled={!canManageUsers}
        >
          ایجاد کاربر
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          className="custom-erp-table min-w-[760px]"
          scroll={{ x: 'max-content' }}
        />
      </div>

      <Drawer
        title={drawerTitle}
        width={560}
        onClose={resetDrawerState}
        open={isDrawerOpen}
        zIndex={1600}
        getContainer={typeof document === 'undefined' ? undefined : () => document.body}
        styles={{ body: { paddingBottom: 96 } }}
        className="dark:bg-[#141414]"
      >
        <Form form={form} layout="vertical" onFinish={handleAddOrEditUser}>
          <div className="flex justify-center mb-6">
            <div className="text-center">
              <Avatar size={80} src={avatarUrl} icon={<UserOutlined />} className="mb-2 bg-gray-100" />
              <Upload showUploadList={false} beforeUpload={handleAvatarUpload}>
                <Button size="small" icon={<UploadOutlined />}>
                  آپلود عکس
                </Button>
              </Upload>
            </div>
          </div>

          <Form.Item label="نام و نام خانوادگی" name="full_name" rules={[{ required: true, message: 'نام کاربر الزامی است' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="ایمیل" name="email" rules={[{ type: 'email', message: 'ایمیل معتبر نیست' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="شماره موبایل" name="mobile" rules={[{ required: true, message: 'شماره موبایل الزامی است' }]}>
            <Input dir="ltr" placeholder="0912..." />
          </Form.Item>
          <Form.Item label="جایگاه سازمانی" name="role_id" rules={[{ required: true, message: 'جایگاه سازمانی الزامی است' }]}>
            <Select placeholder="انتخاب کنید" options={roles.map((role) => ({ label: getRoleDisplayTitle(role), value: role.id }))} getPopupContainer={resolveOverlayPopupContainer} />
          </Form.Item>
          <Form.Item label="نقش سیستمی" name="role" rules={[{ required: true, message: 'نقش سیستمی الزامی است' }]}>
            <Select placeholder="انتخاب نقش" options={SYSTEM_ROLE_OPTIONS} getPopupContainer={resolveOverlayPopupContainer} />
          </Form.Item>
          {!isEditingRealUser ? (
            <>
              <Form.Item label="رمز عبور" name="password" rules={[{ required: true, min: 6, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }]}>
                <Input.Password placeholder="حداقل ۶ کاراکتر" />
              </Form.Item>
              <Form.Item
                label="تکرار رمز عبور"
                name="password_confirm"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'تکرار رمز عبور الزامی است' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('با رمز عبور یکسان نیست'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="تکرار رمز عبور" />
              </Form.Item>
            </>
          ) : (
            <Form.Item label="رمز عبور جدید" name="password">
              <Input.Password placeholder="در صورت نیاز تغییر دهید" />
            </Form.Item>
          )}
          <Form.Item label="وضعیت" name="is_active" valuePropName="checked" initialValue>
            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
          </Form.Item>

          <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="mb-3 font-semibold">تنظیمات VoIP</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Form.Item label="فعال در VoIP" name="voip_enabled" valuePropName="checked" className="mb-0">
                <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
              </Form.Item>
              <Form.Item label="حالت شماره‌گیری" name="voip_dial_mode" className="mb-0">
                <Select options={VOIP_DIAL_MODE_OPTIONS} getPopupContainer={resolveOverlayPopupContainer} />
              </Form.Item>
              <Form.Item label="کد اپراتور تلفنچی" name="voip_operator_code" className="mb-0">
                <Input placeholder="کد اپراتور" />
              </Form.Item>
              <Form.Item label="داخلی VoIP" name="voip_extension" className="mb-0">
                <Input placeholder="مثال: 101" />
              </Form.Item>
              <Form.Item label="شناسه سرویس VoIP" name="voip_service_id" className="mb-0 md:col-span-2">
                <Input placeholder="در صورت تفاوت با اتصال پیش‌فرض" />
              </Form.Item>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="font-semibold">ورود پیامکی</div>
            {!isEditingRealUser ? (
              <Alert
                type="info"
                showIcon
                message="بعد از ثبت اولیه کاربر"
                description="ابتدا کاربر را ذخیره کنید. بعد از آن، از همین بخش می‌توانید کد تایید شماره موبایل را ارسال و ثبت کنید."
              />
            ) : (
              <>
                <Alert
                  type={
                    phoneStatusMeta.color === 'success'
                      ? 'success'
                      : phoneStatusMeta.color === 'error'
                        ? 'error'
                        : 'info'
                  }
                  showIcon
                  message={`وضعیت ورود پیامکی: ${phoneStatusMeta.text}`}
                  description={
                    normalizedFormPhone
                      ? 'اگر شماره را تغییر داده‌اید، ابتدا ذخیره کنید و بعد کد تایید را بفرستید.'
                      : 'برای این کاربر هنوز شماره موبایل معتبری ثبت نشده است.'
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="primary" className="bg-leather-600" loading={phoneOtpLoading && !phoneOtpRequested} onClick={handleSendPhoneOtp}>
                    ارسال کد تایید
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    dir="ltr"
                    placeholder="کد تایید"
                    value={phoneOtpCode}
                    onChange={(e) => setPhoneOtpCode(e.target.value)}
                  />
                  <Button type="primary" loading={phoneOtpLoading && phoneOtpRequested} onClick={handleVerifyPhoneOtp}>
                    تایید شماره
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
            <Button onClick={resetDrawerState}>انصراف</Button>
            <Button type="primary" htmlType="submit" loading={submitting} icon={<SaveOutlined />} className="bg-leather-600 border-none">
              {isEditingRealUser ? 'ذخیره تغییرات' : 'ثبت کاربر'}
            </Button>
          </div>
        </Form>
      </Drawer>

      <style>{`
        .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
        .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
        .dark .ant-drawer-content { background-color: #1a1a1a; }
        .dark .ant-drawer-header { border-bottom: 1px solid #303030; color: white; }
        .dark .ant-drawer-title { color: white; }
        .dark .ant-form-item-label > label { color: #ccc; }
        .dark .ant-input, .dark .ant-select-selector { background-color: #262626 !important; border-color: #444 !important; color: white !important; }
      `}</style>
    </div>
  );
};

export default UsersTab;
