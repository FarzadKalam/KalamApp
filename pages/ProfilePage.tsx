import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
        Avatar, Button, Tag, Spin, Tabs, Descriptions, message, Drawer, Form, Input, Select, Switch, Upload
} from 'antd';
import { 
    UserOutlined, ArrowRightOutlined, CheckCircleOutlined, 
    CloseCircleOutlined, IdcardOutlined, SafetyCertificateOutlined, EditOutlined, UploadOutlined
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { profilesModule } from '../modules/profilesConfig'; // کانفیگ جدید را ایمپورت کنید
import { FieldType, ModuleField } from '../types';
import { toPersianNumber } from '../utils/persianNumberFormatter';

const ProfilePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
    const [roles, setRoles] = useState<any[]>([]);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<'edit' | 'create'>('edit');
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const authSignUpClient = useMemo(
        () =>
            createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                },
            }),
        []
    );

  useEffect(() => {
    fetchProfile();
        fetchRoles();
        loadCurrentUserRole();
  }, [id]);

    const fetchRoles = async () => {
        const { data: rolesData } = await supabase.from('org_roles').select('*');
        setRoles(rolesData || []);
    };

    const loadCurrentUserRole = async () => {
        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData?.user?.id || null;
        if (!currentUserId) return;
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, role_id')
            .eq('id', currentUserId)
            .single();
        setCurrentUserRole(profile?.role || null);
    };

  const fetchProfile = async () => {
    setLoading(true);
    let userId = id;
    let userEmail = '';

    // 1. دریافت شناسه و ایمیل کاربر (چه لاگین شده چه از پارامتر)
    if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
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
            setRecord({
                ...data,
                email: userEmail || data.email, // اولویت با ایمیل جدول Auth
                // هندل کردن رابطه‌ها برای دسترسی راحت‌تر
                organizations: Array.isArray(data.organizations) ? data.organizations[0] : data.organizations
            });
        }
    }
    setLoading(false);
  };

    const canManageUsers = ['super_admin', 'admin', 'manager'].includes(String(currentUserRole || '').toLowerCase());

    const canEditRecord = (currentRecord: any) => {
        if (!canManageUsers) return false;
        if (currentRecord?.role === 'super_admin' && String(currentUserRole || '').toLowerCase() !== 'super_admin') {
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
        setIsDrawerOpen(true);
    };

    const handleAvatarUpload = async (file: File) => {
        try {
            const fileName = `avatar-${Date.now()}.${file.name.split('.').pop()}`;
            const { error } = await supabase.storage.from('images').upload(fileName, file);
            if (error) throw error;
            const { data } = supabase.storage.from('images').getPublicUrl(fileName);
            setAvatarUrl(data.publicUrl);
            return false;
        } catch {
            message.error('خطا در آپلود عکس');
            return false;
        }
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
            message.error('خطا در ارسال ایمیل: ' + error.message);
        } else {
            message.success('لینک بازیابی رمز به ایمیل ارسال شد');
        }
    };

    const handleSendSms = () => {
        message.info('ارسال پیامک نیازمند اتصال به سرویس پیامکی است.');
    };

    const handleSave = async (values: any) => {
        if (!canManageUsers && drawerMode === 'create') {
            message.error('دسترسی کافی ندارید');
            return;
        }
        if (drawerMode === 'create' && values.password !== values.password_confirm) {
            message.error('رمز عبور و تکرار آن یکسان نیست');
            return;
        }
        setSubmitting(true);
        try {
            if (drawerMode === 'edit' && record) {
                const { error } = await supabase.from('profiles').update({
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
                    const { data: authData } = await supabase.auth.getUser();
                    const currentUserId = authData?.user?.id || null;
                    if (currentUserId && currentUserId === record.id) {
                        const { error: passError } = await supabase.auth.updateUser({ password: values.password });
                        if (passError) throw passError;
                    }
                }
                message.success('پروفایل بروزرسانی شد');
                await fetchProfile();
            }

            if (drawerMode === 'create') {
                const { data: signUpData, error: signUpError } = await authSignUpClient.auth.signUp({
                    email: values.email,
                    password: values.password,
                    options: {
                        data: { full_name: values.full_name, avatar_url: avatarUrl || undefined }
                    }
                });
                if (signUpError) throw signUpError;
                const newUserId = signUpData.user?.id;
                if (!newUserId) throw new Error('ساخت کاربر در Auth ناموفق بود');

                const { error } = await supabase.from('profiles').insert([{
                    id: newUserId,
                    full_name: values.full_name,
                    email: values.email,
                    mobile_1: values.mobile,
                    role_id: values.role_id,
                    role: values.role,
                    avatar_url: avatarUrl,
                    is_active: true
                }]);
                if (error) throw error;
                message.success('کاربر ایجاد شد');
            }

            setIsDrawerOpen(false);
            form.resetFields();
            setAvatarUrl(null);
        } catch (err: any) {
            message.error('خطا: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

  // --- تابع رندر کننده هوشمند فیلدها ---
    const renderFieldValue = (field: ModuleField, value: any, allData: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-gray-400">---</span>;

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
            const displayKey = field.relationConfig?.targetField || 'name';
            const displayVal = relData ? relData[displayKey] : value;
            return <span className="font-medium text-leather-600 dark:text-leather-400">{displayVal}</span>;
        }

        case FieldType.SELECT: {
            const option = field.options?.find((opt: any) => opt.value === value);
            return option ? <Tag color={option.color}>{option.label}</Tag> : value;
        }

        default: // TEXT, etc.
            return <span className="text-gray-700 dark:text-gray-300">{value}</span>;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Spin size="large" /></div>;
  if (!record) return null;

    // بقیه فیلدها برای نمایش در تب جزئیات
    const detailFields = profilesModule.fields.filter((f: any) => !['full_name', 'job_title', 'is_active'].includes(f.key));

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
                        <Button className="rounded-xl dark:bg-white/5 dark:text-gray-300" onClick={handleOpenCreate} disabled={!canManageUsers}>ایجاد کاربر</Button>
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
                <StatisticCard title="نقش سیستم" value={renderFieldValue(profilesModule.fields.find((f: any) => f.key === 'role')!, record.role, record)} />
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
                            children: <div className="py-10 text-center text-gray-400">اطلاعات امنیتی</div>
                        }
                    ]} 
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
                title={drawerMode === 'edit' ? 'ویرایش پروفایل' : 'ایجاد کاربر'}
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
                    <Form.Item label="ایمیل" name="email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
                    <Form.Item label="شماره موبایل" name="mobile" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item label="جایگاه سازمانی" name="role_id" rules={[{ required: true }]}>
                        <Select placeholder="انتخاب کنید" options={roles.map(r => ({ label: r.title, value: r.id }))} />
                    </Form.Item>
                    <Form.Item label="نقش (متنی)" name="role" rules={[{ required: true }]}>
                        <Select
                            placeholder="انتخاب نقش"
                            options={[
                                { label: 'super_admin', value: 'super_admin' },
                                { label: 'admin', value: 'admin' },
                                { label: 'manager', value: 'manager' },
                                { label: 'viewer', value: 'viewer' },
                            ]}
                        />
                    </Form.Item>
                    {drawerMode === 'create' && (
                        <Form.Item label="رمز عبور" name="password" rules={[{ required: true, min: 6 }]}>
                            <Input.Password placeholder="حداقل ۶ کاراکتر" />
                        </Form.Item>
                    )}
                    {drawerMode === 'create' && (
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
                            {drawerMode === 'edit' ? 'ذخیره تغییرات' : 'ثبت کاربر'}
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

