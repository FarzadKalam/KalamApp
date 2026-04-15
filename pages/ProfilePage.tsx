import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { 
        Avatar, Button, Tag, Spin, Tabs, Descriptions, message, Drawer, Form, Input, Select, Switch, Upload, Alert, Table, Checkbox
} from 'antd';
import { 
    UserOutlined, ArrowRightOutlined, CheckCircleOutlined, 
    CloseCircleOutlined, IdcardOutlined, SafetyCertificateOutlined, EditOutlined, UploadOutlined
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { profilesModule } from '../modules/profilesConfig'; // کانفیگ جدید را ایمپورت کنید
import { FieldType, ModuleField } from '../types';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { getPhoneOtpStatusMeta, lookupPhoneLoginCandidate, type PhoneLoginCandidateCheck } from '../utils/phoneAuth';
import { normalizeIranMobile } from '../utils/phoneNumber';
import { normalizeDigitsToEnglish } from '../utils/persianNumericInput';
import { getPreferredRelationTargetField } from '../utils/relationTargetField';
import { fetchCurrentUserRoleContext } from '../utils/permissions';
import { fetchSessionBootstrap, getCachedAuthUser } from '../utils/sessionCache';
import { SOFTWARE_ROLE_OPTIONS, canManageSuperAdminByRoleContext, canManageUsersByRoleContext } from '../utils/softwareRoles';
import PhoneActionsPopover from '../components/PhoneActionsPopover';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';

const normalizeOtpToken = (value: unknown): string =>
    normalizeDigitsToEnglish(String(value || '')).replace(/\D/g, '');

const ProfilePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
    const [roles, setRoles] = useState<any[]>([]);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
    const [currentUserRoleTitle, setCurrentUserRoleTitle] = useState<string | null>(null);
    const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [phoneAuthState, setPhoneAuthState] = useState<PhoneLoginCandidateCheck | null>(null);
    const [phoneOtpCode, setPhoneOtpCode] = useState('');
    const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
    const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
    const [profileFieldPermissions, setProfileFieldPermissions] = useState<Record<string, boolean>>({});
    const [activeToggleLoading, setActiveToggleLoading] = useState(false);
    const [selfAvatarUploading, setSelfAvatarUploading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRows, setActivityRows] = useState<any[]>([]);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [relatedEmployee, setRelatedEmployee] = useState<any | null>(null);
  useEffect(() => {
    fetchProfile();
        loadCurrentUserRole();
  }, [id]);

    useEffect(() => {
        fetchRoles();
    }, [currentOrgId]);

    const fetchRoles = async () => {
        if (!currentOrgId) {
            setRoles([]);
            return;
        }
        const { data: rolesData, error } = await supabase
            .from('org_roles')
            .select('id, title')
            .eq('org_id', currentOrgId)
            .order('created_at');
        if (error) {
            const fallback = await supabase
                .from('org_roles')
                .select('*')
                .eq('org_id', currentOrgId)
                .order('created_at');
            setRoles(fallback.data || []);
            return;
        }
        setRoles(rolesData || []);
    };

    const loadCurrentUserRole = async () => {
        const snapshot = await fetchSessionBootstrap(supabase);
        const currentUserId = snapshot.user?.id || null;
        setCurrentUserId(currentUserId);
        if (!currentUserId) return;
        setCurrentUserRole(snapshot.profile?.role || null);
        setCurrentUserRoleId(snapshot.roleId || null);
        setCurrentOrgId(snapshot.orgId || null);
        if (snapshot.roleId) {
            const { data: roleRow } = await supabase
                .from('org_roles')
                .select('title')
                .eq('id', snapshot.roleId)
                .maybeSingle();
            setCurrentUserRoleTitle(String(roleRow?.title || '').trim() || null);
        } else {
            setCurrentUserRoleTitle(null);
        }
        const context = await fetchCurrentUserRoleContext(supabase);
        setProfileFieldPermissions(context.permissions?.profiles?.fields || {});
    };

    const formatPersianDate = (val: any, format: string) => {
        if (!val) return <span dir="ltr">-</span>;
        try {
            const jsDate = new Date(val);
            if (Number.isNaN(jsDate.getTime())) return <span dir="ltr">-</span>;
            const formatted = new DateObject({
                date: jsDate,
                calendar: gregorian,
                locale: gregorian_en,
            })
                .convert(persian, persian_fa)
                .format(format);
            return <span dir="ltr">{toPersianNumber(formatted)}</span>;
        } catch {
            return <span dir="ltr">-</span>;
        }
    };

    const buildActivityRows = (loginRows: any[], changelogRows: any[]) => {
        const getModuleFaTitle = (moduleId: string) => {
            const title = MODULES[moduleId]?.titles?.fa;
            return title || 'ماژول';
        };

        const getFieldFaLabel = (moduleId: string, fieldName: string) => {
            const module = MODULES[moduleId];
            if (!module || !fieldName) return null;

            const directField = (module.fields || []).find((field: any) => String(field?.key || '') === String(fieldName));
            if (directField?.labels?.fa) return directField.labels.fa;

            for (const block of module.blocks || []) {
                if (String(block?.id || '') === String(fieldName) && block?.titles?.fa) {
                    return block.titles.fa;
                }
                const tableColumn = (block?.tableColumns || []).find((col: any) => String(col?.key || '') === String(fieldName));
                if (tableColumn?.title) return String(tableColumn.title);
            }

            return null;
        };

        const loginItems = (loginRows || []).map((row: any) => ({
            id: `login:${row.id}`,
            type: 'login',
            created_at: row.created_at,
            title: 'ورود',
            detail: row.login_method === 'otp' ? 'ورود با کد پیامکی' : 'ورود با رمز عبور',
        }));

        const actionLabelMap: Record<string, string> = {
            create: 'ایجاد',
            update: 'ویرایش',
            edit: 'ویرایش',
            delete: 'حذف',
            upload: 'آپلود',
            assign: 'ارجاع',
        };

        const changeItems = (changelogRows || []).map((row: any) => {
            const moduleTitle = getModuleFaTitle(String(row.module_id || ''));
            const actionLabel = actionLabelMap[String(row.action || '').toLowerCase()] || 'تغییر';
            const fieldLabel = getFieldFaLabel(String(row.module_id || ''), String(row.field_name || ''));
            const detailParts = [
                moduleTitle,
                row.record_title ? `رکورد: ${row.record_title}` : '',
                fieldLabel ? `فیلد: ${fieldLabel}` : '',
            ];
            return {
                id: `change:${row.id}`,
                type: 'change',
                created_at: row.created_at,
                title: actionLabel,
                detail: detailParts.filter(Boolean).join(' - '),
            };
        });

        return [...loginItems, ...changeItems]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 20);
    };

    const loadActivityData = async (targetUserId: string) => {
        if (!targetUserId) {
            setActivityRows([]);
            setLastLoginAt(null);
            return;
        }
        setActivityLoading(true);
        try {
            const [{ data: loginRows }, { data: changelogRows }] = await Promise.all([
                supabase
                    .from('user_login_events')
                    .select('id, login_method, created_at')
                    .eq('user_id', targetUserId)
                    .order('created_at', { ascending: false })
                    .limit(20),
                supabase
                    .from('changelogs')
                    .select('id, module_id, action, record_title, field_name, created_at')
                    .eq('user_id', targetUserId)
                    .order('created_at', { ascending: false })
                    .limit(20),
            ]);

            const rows = buildActivityRows(loginRows || [], changelogRows || []);
            setActivityRows(rows);
            setLastLoginAt((loginRows || [])[0]?.created_at || null);
        } catch (error) {
            console.warn('Could not load profile activity', error);
            setActivityRows([]);
            setLastLoginAt(null);
        } finally {
            setActivityLoading(false);
        }
    };

  const fetchProfile = async () => {
    setLoading(true);
    let userId = id;
    let userEmail = '';

    // 1. دریافت شناسه و ایمیل کاربر (چه لاگین شده چه از پارامتر)
    if (!userId) {
        const user = await getCachedAuthUser(supabase);
        if (user) {
            userId = user.id;
            userEmail = user.email || '';
        }
    } else {
        // اگر داریم پروفایل کس دیگری را می‌بینیم، باید ایمیلش را جداگانه بگیریم (اگر ادمین باشیم)
        // فعلا فرض می‌کنیم ایمیل فقط برای خود کاربر در دسترس است یا در پروفایل ذخیره شده
    }

    if (userId) {
        // 2. دریافت اطلاعات از جدول پروفایل + سازمان
        const { data, error } = await supabase
            .from(profilesModule.table)
            .select(`
                *,
                organizations (name)
            `)
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            message.error('خطا در دریافت پروفایل');
        } else {
            // 3. ترکیب داده‌ها (ایمیل را به دیتای پروفایل اضافه می‌کنیم تا ماژولار نمایش داده شود)
            const nextRecord = {
                ...data,
                email: userEmail || data.email, // اولویت با ایمیل جدول Auth
                // هندل کردن رابطه‌ها برای دسترسی راحت‌تر
                organizations: Array.isArray(data.organizations) ? data.organizations[0] : data.organizations
            };
            setRecord(nextRecord);
            try {
                const { data: employeeData } = await supabase
                    .from('employees')
                    .select('id, full_name, system_code, job_title, employment_status')
                    .eq('related_profile_id', userId)
                    .maybeSingle();
                setRelatedEmployee(employeeData || null);
            } catch {
                setRelatedEmployee(null);
            }
            const normalizedPhone = normalizeIranMobile(nextRecord.mobile_1 || nextRecord.mobile || '');
            if (normalizedPhone) {
                const candidate = await lookupPhoneLoginCandidate(normalizedPhone);
                setPhoneAuthState(candidate);
            } else {
                setPhoneAuthState(null);
            }
            await loadActivityData(String(userId));
        }
    }
    else {
        setRelatedEmployee(null);
    }
    setLoading(false);
  };

    const fallbackCurrentRoleTitle = useMemo(() => {
        const currentRole = roles.find((role) => String(role?.id || '') === String(currentUserRoleId || ''));
        return String(currentRole?.title || '').trim();
    }, [currentUserRoleId, roles]);

    const effectiveCurrentRoleTitle = String(currentUserRoleTitle || fallbackCurrentRoleTitle || '').trim();
    const canManageUsers = canManageUsersByRoleContext(currentUserRole, effectiveCurrentRoleTitle);
    const canManageSuperAdmin = canManageSuperAdminByRoleContext(currentUserRole, effectiveCurrentRoleTitle);
    const canEditOwnAvatar = Boolean(currentUserId && record?.id && String(currentUserId) === String(record.id));

    const canEditRecord = (currentRecord: any) => {
        if (!canManageUsers) return false;
        if (currentRecord?.role === 'super_admin' && !canManageSuperAdmin) {
            return false;
        }
        return true;
    };

    const handleOpenEdit = () => {
        if (!record || !canEditRecord(record)) {
            message.error('دسترسی کافی ندارید');
            return;
        }
        setDrawerMode('edit');
        setAvatarUrl(record.avatar_url || null);
        form.setFieldsValue({
            full_name: record.full_name,
            email: record.email,
            mobile: record.mobile_1,
            role_id: record.role_id || null,
            role: record.role || null,
            is_active: record.is_active !== false,
            password: ''
        });
        setIsDrawerOpen(true);
    };

    const handleOpenCreate = () => {
        if (!canManageUsers) {
            message.error('دسترسی کافی ندارید');
            return;
        }
        setDrawerMode('create');
        setAvatarUrl(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setIsDrawerOpen(true);
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
                detail: 'تصویر پروفایل',
            });
            const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(fileName);
            setAvatarUrl(data.publicUrl);
            return false;
        } catch (error) {
            if (isUploadCanceledError(error)) return false;
            message.error('خطا در آپلود عکس');
            return false;
        }
    };

    const handleSelfAvatarUpload = async (file: File) => {
        if (!record?.id || !canEditOwnAvatar) {
            message.error('فقط صاحب این پروفایل می‌تواند عکس خود را بروزرسانی کند.');
            return false;
        }

        setSelfAvatarUploading(true);
        try {
            const fileExtension = String(file.name.split('.').pop() || 'jpg').trim() || 'jpg';
            const filePath = `avatars/${record.id}/avatar-${Date.now()}.${fileExtension}`;
            await uploadFileWithProgress({
                client: fileStorageClient,
                bucket: FILE_STORAGE_BUCKET,
                path: filePath,
                file,
                label: file.name || 'آواتار',
                detail: 'تصویر پروفایل',
            });
            const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
            const nextAvatarUrl = String(data?.publicUrl || '').trim();
            if (!nextAvatarUrl) {
                throw new Error('لینک تصویر پروفایل تولید نشد.');
            }

            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: nextAvatarUrl })
                .eq('id', record.id);
            if (error) throw error;

            setRecord((prev: any) => ({ ...(prev || {}), avatar_url: nextAvatarUrl }));
            setAvatarUrl(nextAvatarUrl);
            message.success('عکس پروفایل بروزرسانی شد.');
        } catch (error) {
            if (isUploadCanceledError(error)) return false;
            message.error('خطا در بروزرسانی عکس پروفایل');
        } finally {
            setSelfAvatarUploading(false);
        }

        return false;
    };

    const handleResetPassword = async (email?: string | null) => {
        if (!email) {
            message.error('ایمیل کاربر ثبت نشده است');
            return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/login`,
        });
        if (error) {
            message.error(toFaErrorMessage(error, 'ارسال ایمیل ناموفق بود.'));
        } else {
            message.success('لینک بازیابی رمز به ایمیل ارسال شد');
        }
    };

    const handleSendSms = () => {
        message.info('ارسال پیامک نیازمند اتصال به سرویس پیامکی است.');
    };

    const handleActiveToggle = async (checked: boolean) => {
        if (!record || !canEditRecord(record) || profileFieldPermissions.is_active === false) {
            message.error('دسترسی کافی ندارید');
            return;
        }
        setActiveToggleLoading(true);
        try {
            const { error } = await supabase.from('profiles').update({ is_active: checked }).eq('id', record.id);
            if (error) throw error;
            setRecord((prev: any) => ({ ...(prev || {}), is_active: checked }));
            message.success('وضعیت کاربر بروزرسانی شد');
        } catch (error: any) {
            message.error(toFaErrorMessage(error, 'بروزرسانی وضعیت ناموفق بود.'));
        } finally {
            setActiveToggleLoading(false);
        }
    };

    const handleBeginPhoneVerification = async () => {
        const normalizedPhone = normalizeIranMobile(record?.mobile_1 || record?.mobile || '');
        if (!normalizedPhone) {
            message.error('برای این کاربر شماره موبایل معتبر ثبت نشده است.');
            return;
        }
        if (!currentUserId || currentUserId !== record?.id) {
            message.error('تایید اولیه شماره فقط باید توسط خود کاربر انجام شود.');
            return;
        }

        setPhoneOtpLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
            if (error) throw error;
            setPhoneOtpRequested(true);
            message.success('کد تایید شماره موبایل ارسال شد.');
        } catch (err: any) {
            message.error(toFaErrorMessage(err, 'ارسال کد تایید شماره ناموفق بود.'));
        } finally {
            setPhoneOtpLoading(false);
        }
    };

    const handleConfirmPhoneVerification = async () => {
        const normalizedPhone = normalizeIranMobile(record?.mobile_1 || record?.mobile || '');
        const normalizedOtpToken = normalizeOtpToken(phoneOtpCode);
        if (!normalizedPhone) {
            message.error('برای این کاربر شماره موبایل معتبر ثبت نشده است.');
            return;
        }
        if (!normalizedOtpToken) {
            message.error('کد تایید شماره موبایل را وارد کنید.');
            return;
        }

        setPhoneOtpLoading(true);
        try {
            const { error } = await supabase.auth.verifyOtp({
                phone: normalizedPhone,
                token: normalizedOtpToken,
                type: 'phone_change',
            });
            if (error) throw error;
            setPhoneOtpCode('');
            setPhoneOtpRequested(false);
            message.success('شماره موبایل برای ورود پیامکی تایید شد.');
            await fetchProfile();
        } catch (err: any) {
            message.error(toFaErrorMessage(err, 'تایید شماره موبایل ناموفق بود.'));
        } finally {
            setPhoneOtpLoading(false);
        }
    };

    const handleSave = async (values: any) => {
        if (!canManageUsers && drawerMode === 'create') {
            message.error('دسترسی کافی ندارید');
            return;
        }
        setSubmitting(true);
        try {
            if (drawerMode === 'edit' && record) {
                const { error } = await supabase.from('profiles').update({
                    org_id: record.org_id || currentOrgId,
                    full_name: values.full_name,
                    email: values.email,
                    mobile_1: values.mobile,
                    role_id: values.role_id,
                    role: values.role,
                    avatar_url: avatarUrl ?? record.avatar_url,
                    is_active: values.is_active,
                }).eq('id', record.id);
                if (error) throw error;

                if (values.password) {
                    const authUser = await getCachedAuthUser(supabase);
                    const currentUserId = authUser?.id || null;
                    if (currentUserId && currentUserId === record.id) {
                        const { error: passError } = await supabase.auth.updateUser({ password: values.password });
                        if (passError) throw passError;
                    }
                }
                message.success('پروفایل بروزرسانی شد');
                await fetchProfile();
            }

            if (drawerMode === 'create') {
                if (!currentOrgId) {
                    throw new Error('سازمان جاری برای ثبت دعوت کاربر قابل تشخیص نیست.');
                }
                const normalizedPhone = normalizeIranMobile(values.mobile);
                if (!normalizedPhone) {
                    throw new Error('شماره موبایل معتبر نیست.');
                }
                const existingCandidate = await lookupPhoneLoginCandidate(normalizedPhone);
                if (existingCandidate?.exists_in_profiles) {
                    throw new Error('برای این شماره موبایل قبلا کاربر ثبت شده است.');
                }

                const invitePayload = {
                    org_id: currentOrgId,
                    full_name: values.full_name,
                    phone_e164: normalizedPhone,
                    email: values.email || null,
                    role_id: values.role_id,
                    role: values.role,
                    is_active: values.is_active !== false,
                };

                const { data: existingInvite, error: inviteLookupError } = await supabase
                    .from('phone_signup_invites')
                    .select('id')
                    .eq('phone_e164', normalizedPhone)
                    .is('consumed_at', null)
                    .maybeSingle();

                if (inviteLookupError) throw inviteLookupError;

                const { error } = existingInvite?.id
                    ? await supabase
                        .from('phone_signup_invites')
                        .update(invitePayload)
                        .eq('id', existingInvite.id)
                    : await supabase
                        .from('phone_signup_invites')
                        .insert([invitePayload]);

                if (error) throw error;
                message.success('دعوت کاربر با شماره ثبت شد. کاربر بعد از اولین ورود با کد یکبارمصرف فعال می‌شود.');
            }

            setIsDrawerOpen(false);
            form.resetFields();
            setAvatarUrl(null);
        } catch (err: any) {
            message.error(toFaErrorMessage(err, 'ذخیره پروفایل ناموفق بود.'));
        } finally {
            setSubmitting(false);
        }
    };

  // --- تابع رندر کننده هوشمند فیلدها ---
    const renderFieldValue = (field: ModuleField, value: any, allData: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-gray-400">---</span>;

    switch (field.type) {
        case FieldType.CHECKBOX:
            return value ? 
                <Tag color="green" icon={<CheckCircleOutlined />}>فعال</Tag> : 
                <Tag color="red" icon={<CloseCircleOutlined />}>غیرفعال</Tag>;
        
        case FieldType.DATE:
            return formatPersianDate(value, 'YYYY/MM/DD');

        case FieldType.RELATION: {
            const relationKey = field.relationConfig?.targetModule || '';
            const relData = relationKey ? allData[relationKey] : undefined;
            const displayKey = getPreferredRelationTargetField(field.relationConfig?.targetModule, field.relationConfig?.targetField);
            const displayVal = relData ? relData[displayKey] : value;
            return <span className="font-medium text-leather-600 dark:text-leather-400">{displayVal}</span>;
        }

        case FieldType.SELECT: {
            const option = field.options?.find((opt: any) => opt.value === value);
            return option ? <Tag color={option.color}>{option.label}</Tag> : value;
        }

        default: // TEXT, etc.
            if (['mobile', 'mobile_1', 'mobile_2', 'phone'].includes(field.key)) {
                const phoneValue = field.key === 'mobile'
                    ? (allData?.mobile_1 || allData?.mobile || value)
                    : value;
                return (
                    <PhoneActionsPopover
                        value={phoneValue}
                        moduleId="profiles"
                        record={allData}
                    />
                );
            }
            return <span className="text-gray-700 dark:text-gray-300">{value}</span>;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Spin size="large" /></div>;
  if (!record) return null;

    // بقیه فیلدها برای نمایش در تب جزئیات
    const detailFields = profilesModule.fields.filter((f: any) => !['full_name', 'job_title', 'is_active'].includes(f.key));
    const phoneStatusMeta = getPhoneOtpStatusMeta(phoneAuthState, record?.mobile_1 || record?.mobile);
    const canSelfVerifyPhone = !!currentUserId && currentUserId === record?.id;
    const canToggleActive = canEditRecord(record) && profileFieldPermissions.is_active !== false;
    const canShowPhoneVerificationActions =
        canSelfVerifyPhone &&
        phoneStatusMeta.color !== 'success' &&
        phoneStatusMeta.text !== 'کاربر غیرفعال';

    const activityColumns = [
        {
            title: 'نوع',
            dataIndex: 'title',
            key: 'title',
            width: 90,
            render: (_: any, row: any) => (
                <Tag color={row.type === 'login' ? 'blue' : 'gold'}>
                    {row.type === 'login' ? 'ورود' : row.title}
                </Tag>
            ),
        },
        {
            title: 'شرح',
            dataIndex: 'detail',
            key: 'detail',
            render: (value: string) => <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>,
        },
        {
            title: 'زمان',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 150,
            render: (value: string) => formatPersianDate(value, 'YYYY/MM/DD HH:mm'),
        },
    ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fadeIn">
      {/* هدر و دکمه بازگشت */}
      <div className="flex items-center justify-between mb-6">
        <Button 
            icon={<ArrowRightOutlined />} 
            type="text" 
            className="text-gray-600 dark:text-gray-300" 
            onClick={() => navigate(-1)}
        >
            بازگشت
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- ستون سمت چپ: خلاصه پروفایل --- */}
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] text-center shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden sticky top-24 pb-8">
                <div className="h-32 bg-gradient-to-br from-leather-600 to-leather-800 relative"></div>

                <div className="px-6 relative -mt-16">
                    <Avatar 
                        size={128} 
                        src={record.avatar_url} 
                        icon={<UserOutlined />} 
                        className="bg-white border-4 border-white dark:border-[#1a1a1a] shadow-xl text-leather-500 text-5xl mb-4"
                    >
                        {record.full_name?.[0]?.toUpperCase()}
                    </Avatar>
                    {canEditOwnAvatar ? (
                        <div className="mb-4">
                            <Upload
                                showUploadList={false}
                                beforeUpload={handleSelfAvatarUpload}
                                accept="image/*"
                                disabled={selfAvatarUploading}
                            >
                                <Button
                                    icon={<UploadOutlined />}
                                    loading={selfAvatarUploading}
                                    className="rounded-xl"
                                >
                                    بروزرسانی عکس پروفایل
                                </Button>
                            </Upload>
                        </div>
                    ) : null}

                    {/* نمایش فیلدهای اصلی (نام، شغل، وضعیت) */}
                    <h1 className="text-2xl font-black text-gray-800 dark:text-white mb-1">
                        {record.full_name || 'کاربر'}
                    </h1>
                    <p className="text-leather-500 font-medium mb-2">
                        {record.job_title}
                    </p>
                    <div className="mb-6">
                        {renderFieldValue(profilesModule.fields.find((f: any) => f.key === 'is_active')!, record.is_active, record)}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button type="primary" icon={<EditOutlined />} className="bg-leather-500 rounded-xl" onClick={handleOpenEdit} disabled={!canEditRecord(record)}>ویرایش</Button>
                        <Button className="rounded-xl dark:bg-white/5 dark:text-gray-300" onClick={() => handleResetPassword(record.email)}>تغییر رمز</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        <Button className="rounded-xl dark:bg-white/5 dark:text-gray-300" onClick={handleSendSms}>ارسال پیامک</Button>
                        <Button className="rounded-xl dark:bg-white/5 dark:text-gray-300" onClick={handleOpenCreate} disabled={!canManageUsers}>دعوت کاربر</Button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-white/5 px-4 py-3 text-right">
                        <Checkbox
                            checked={record.is_active !== false}
                            onChange={(e) => handleActiveToggle(e.target.checked)}
                            disabled={!canToggleActive || activeToggleLoading}
                        >
                            کاربر فعال است
                        </Checkbox>
                    </div>
                </div>
            </div>
        </div>

        {/* --- ستون سمت راست: جزئیات کامل (رندر داینامیک) --- */}
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <StatisticCard title="سابقه فعالیت" value={(() => {
                                    try {
                                        const created = new Date(record.created_at);
                                        if (Number.isNaN(created.getTime())) return '-';
                                        const diffMs = Date.now() - created.getTime();
                                        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                        return toPersianNumber(days);
                                    } catch {
                                        return '-';
                                    }
                                })()} suffix=" روز" />
                <StatisticCard title="نقش نرم‌افزاری" value={renderFieldValue(profilesModule.fields.find((f: any) => f.key === 'role')!, record.role, record)} />
                <StatisticCard title="آخرین ورود" value={formatPersianDate(lastLoginAt, 'YYYY/MM/DD HH:mm')} />
            </div>

            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-gray-200 dark:border-gray-800 min-h-[400px]">
                <Tabs 
                    items={[
                        {
                            key: '1',
                            label: <span><IdcardOutlined /> مشخصات فردی و سازمانی</span>,
                            children: (
                                <div className="mt-6">
                                    <Descriptions 
                                        bordered 
                                        column={1} 
                                        className="custom-descriptions"
                                    >
                                        {/* حلقه روی تمام فیلدها برای ساخت سطرها */}
                                        <Descriptions.Item label="کارمند مرتبط">
                                            {relatedEmployee ? (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className="font-medium text-leather-600 dark:text-leather-400">
                                                        {relatedEmployee.full_name || 'کارمند'}
                                                        {relatedEmployee.system_code ? ` - ${relatedEmployee.system_code}` : ''}
                                                        {relatedEmployee.job_title ? ` (${relatedEmployee.job_title})` : ''}
                                                    </span>
                                                    <Button
                                                        size="small"
                                                        className="rounded-lg"
                                                        onClick={() => navigate(`/employees/${relatedEmployee.id}`)}
                                                    >
                                                        مشاهده پرونده کارمند
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className="text-gray-400">هنوز به رکورد کارمند متصل نشده است</span>
                                                    {canEditRecord(record) ? (
                                                        <Button
                                                            size="small"
                                                            type="primary"
                                                            className="bg-leather-600 rounded-lg"
                                                            onClick={() =>
                                                                navigate('/employees/create', {
                                                                    state: {
                                                                        initialValues: {
                                                                            related_profile_id: record.id,
                                                                            full_name: record.full_name || null,
                                                                            mobile_1: record.mobile_1 || record.mobile || null,
                                                                            email: record.email || null,
                                                                            job_title: record.job_title || null,
                                                                        },
                                                                    },
                                                                })
                                                            }
                                                        >
                                                            ایجاد پرونده کارمند
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            )}
                                        </Descriptions.Item>
                                        {detailFields.map((field: any) => (
                                            <Descriptions.Item key={field.key} label={field.labels?.fa || field.key}>
                                                {renderFieldValue(field, record[field.key], record)}
                                            </Descriptions.Item>
                                        ))}
                                    </Descriptions>
                                </div>
                            )
                        },
                        {
                            key: '2',
                            label: <span><SafetyCertificateOutlined /> امنیت</span>,
                            children: (
                                <div className="py-6 space-y-4">
                                    <Alert
                                        type={phoneStatusMeta.color === 'success' ? 'success' : phoneStatusMeta.color === 'error' ? 'error' : 'info'}
                                        showIcon
                                        message={`وضعیت ورود پیامکی: ${phoneStatusMeta.text}`}
                                        description={
                                            phoneStatusMeta.text === 'کاربر غیرفعال'
                                                ? 'این حساب غیرفعال است و تا زمان فعال شدن، ورود پیامکی برای آن در دسترس نخواهد بود.'
                                                : phoneStatusMeta.color === 'success'
                                                ? 'شماره موبایل شما تایید شده و ورود پیامکی برای این حساب فعال است.'
                                                : canSelfVerifyPhone
                                                    ? 'برای فعال شدن ورود با کد یکبارمصرف، یک بار شماره موبایل خود را تایید کنید.'
                                                    : 'فعال‌سازی ورود پیامکی باید از پروفایل شخصی خود کاربر انجام شود.'
                                        }
                                    />
                                    <Descriptions bordered column={1} className="custom-descriptions">
                                        <Descriptions.Item label="شماره موبایل">
                                            {record.mobile_1 || record.mobile ? (
                                              <PhoneActionsPopover value={record.mobile_1 || record.mobile} moduleId="profiles" record={record} />
                                            ) : (
                                              <span className="text-gray-400">---</span>
                                            )}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="آمادگی ورود پیامکی">
                                            <Tag color={phoneStatusMeta.color === 'success' ? 'green' : phoneStatusMeta.color === 'processing' ? 'blue' : phoneStatusMeta.color === 'warning' ? 'orange' : 'default'}>
                                                {phoneStatusMeta.text}
                                            </Tag>
                                        </Descriptions.Item>
                                    </Descriptions>
                                    {canShowPhoneVerificationActions ? (
                                        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                                            <div className="font-semibold">تایید شماره موبایل</div>
                                            <div className="text-sm text-gray-500">
                                                یک کد تایید به شماره ثبت‌شده شما ارسال می‌شود و پس از ثبت آن، ورود پیامکی فعال خواهد شد.
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Button type="primary" className="bg-leather-600" loading={phoneOtpLoading && !phoneOtpRequested} onClick={handleBeginPhoneVerification}>
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
                                                <Button type="primary" loading={phoneOtpLoading && phoneOtpRequested} onClick={handleConfirmPhoneVerification}>
                                                    تایید شماره
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )
                        }
                    ]} 
                />
            </div>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-gray-200 dark:border-gray-800">
                <div className="mb-4 text-lg font-bold text-gray-800 dark:text-white">
                    گزارش عملکرد کاربر
                </div>
                <Table
                    size="small"
                    rowKey="id"
                    loading={activityLoading}
                    dataSource={activityRows}
                    columns={activityColumns}
                    pagination={false}
                    locale={{ emptyText: 'هنوز گزارشی ثبت نشده است' }}
                    scroll={{ y: 320 }}
                />
            </div>
        </div>
      </div>

      <style>{`
        .dark .custom-descriptions .ant-descriptions-item-label { background-color: #262626; color: #aaa; border-color: #303030; }
        .dark .custom-descriptions .ant-descriptions-item-content { background-color: #1a1a1a; color: #ddd; border-color: #303030; }
        .dark .custom-descriptions .ant-descriptions-view { border-color: #303030; }
      `}</style>

            <Drawer
                title={drawerMode === 'edit' ? 'ویرایش پروفایل' : 'دعوت کاربر'}
                width={520}
                onClose={() => setIsDrawerOpen(false)}
                open={isDrawerOpen}
                zIndex={99999}
                styles={{ body: { paddingBottom: 80 } }}
                className="dark:bg-[#141414]"
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <div className="flex justify-center mb-6">
                        <div className="text-center">
                            <Avatar size={80} src={avatarUrl} icon={<UserOutlined />} className="mb-2 bg-gray-100" />
                            <Upload showUploadList={false} beforeUpload={handleAvatarUpload}>
                                <Button size="small" icon={<UploadOutlined />}>آپلود عکس</Button>
                            </Upload>
                        </div>
                    </div>

                    <Form.Item label="نام و نام خانوادگی" name="full_name" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item label="ایمیل" name="email" rules={[{ type: 'email', message: 'ایمیل معتبر نیست' }]}><Input /></Form.Item>
                    <Form.Item label="شماره موبایل" name="mobile" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item label="جایگاه سازمانی" name="role_id" rules={[{ required: true }]}>
                        <Select
                            placeholder="انتخاب کنید"
                            options={roles.map((r) => ({ label: String(r?.title || r?.name || 'بدون عنوان').trim(), value: r.id }))}
                        />
                    </Form.Item>
                    <Form.Item label="نقش نرم‌افزاری" name="role" rules={[{ required: true }]}>
                        <Select
                            placeholder="انتخاب نقش نرم‌افزاری"
                            options={SOFTWARE_ROLE_OPTIONS}
                        />
                    </Form.Item>
                    {drawerMode === 'create' && (
                        <Form.Item label="وضعیت دعوت" name="is_active" valuePropName="checked">
                            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                        </Form.Item>
                    )}
                    {drawerMode === 'edit' && (
                        <Form.Item label="رمز عبور جدید" name="password">
                            <Input.Password placeholder="در صورت نیاز تغییر دهید" />
                        </Form.Item>
                    )}
                    {drawerMode === 'edit' && (
                        <Form.Item label="وضعیت" name="is_active" valuePropName="checked">
                            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                        </Form.Item>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                        <Button onClick={() => setIsDrawerOpen(false)}>انصراف</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} className="bg-leather-600 border-none">
                            {drawerMode === 'edit' ? 'ذخیره تغییرات' : 'ثبت دعوت'}
                        </Button>
                    </div>
                </Form>
            </Drawer>
    </div>
  );
};

const StatisticCard = ({ title, value, suffix }: any) => (
    <div className="bg-white dark:bg-[#1a1a1a] p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center">
        <span className="text-gray-500 dark:text-gray-400 text-sm mb-2">{title}</span>
        <div className="text-lg font-bold text-gray-800 dark:text-white">
            {value} <span className="text-sm text-gray-400 font-normal">{suffix}</span>
        </div>
    </div>
);

export default ProfilePage;

