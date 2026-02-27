import React, { useEffect, useState } from 'react';
import { Table, Button, Select, message, Switch, Avatar, Drawer, Form, Input, Upload } from 'antd';
import { UserOutlined, PlusOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase, supabaseSignUpClient } from '../../supabaseClient';

type ResponsiveBreakpoint = 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';
const SYSTEM_ROLE_FA_LABELS: Record<string, string> = {
  super_admin: 'مدیر ارشد',
  admin: 'مدیر سیستم',
  manager: 'مدیر',
  viewer: 'مشاهده‌گر',
};

const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    useEffect(() => {
        fetchData();
        loadCurrentUser();
    }, []);

    const loadCurrentUser = async () => {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        setCurrentUserId(userId);
        if (!userId) return;
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, role_id')
            .eq('id', userId)
            .single();
        setCurrentUserRole(profile?.role || null);
    };

  const fetchData = async () => {
    setLoading(true);
    const { data: usersData } = await supabase.from('profiles').select('*, org_roles(title)');
    const { data: rolesData } = await supabase.from('org_roles').select('*');
    if (usersData) setUsers(usersData);
    if (rolesData) setRoles(rolesData);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
      const { error } = await supabase.from('profiles').update({ role_id: roleId }).eq('id', userId);
      if (!error) { message.success('نقش کاربر تغییر کرد'); fetchData(); }
  };

  const handleStatusChange = async (userId: string, isActive: boolean) => {
      const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (!error) { message.success('وضعیت کاربر تغییر کرد'); fetchData(); }
  };

  const handleAvatarUpload = async (file: File) => {
      try {
          const fileName = `avatar-${Date.now()}.${file.name.split('.').pop()}`;
          const { error } = await supabase.storage.from('images').upload(fileName, file);
          if (error) throw error;
          const { data } = supabase.storage.from('images').getPublicUrl(fileName);
          setAvatarUrl(data.publicUrl);
          return false;
      } catch(e) { message.error('خطا در آپلود عکس'); return false; }
  };

    const canManageUsers = ['super_admin', 'admin', 'manager'].includes(String(currentUserRole || '').toLowerCase());
    const getRoleDisplayTitle = (role: any) => {
        const raw = String(role?.title || role?.name || '').trim();
        const normalized = raw.toLowerCase();
        return SYSTEM_ROLE_FA_LABELS[normalized] || raw || 'بدون عنوان';
    };
    const canEditRecord = (record: any) => {
        if (!canManageUsers) return false;
        if (record?.role === 'super_admin' && String(currentUserRole || '').toLowerCase() !== 'super_admin') {
            return false;
        }
        return true;
    };

    const handleAddOrEditUser = async (values: any) => {
        if (!canManageUsers) {
            message.error('دسترسی کافی ندارید');
            return;
        }
        if (!editingUser && values.password !== values.password_confirm) {
            message.error('رمز عبور و تکرار آن یکسان نیست');
            return;
        }
        setSubmitting(true);
        try {
            if (editingUser) {
                const { error } = await supabase.from('profiles').update({
                    full_name: values.full_name,
                    email: values.email,
                    mobile_1: values.mobile,
                    role_id: values.role_id,
                    role: values.role,
                    avatar_url: avatarUrl ?? editingUser.avatar_url,
                    is_active: values.is_active,
                }).eq('id', editingUser.id);
                if (error) throw error;

                if (values.password && editingUser.id === currentUserId) {
                    const { error: passError } = await supabase.auth.updateUser({ password: values.password });
                    if (passError) throw passError;
                }

                message.success('کاربر بروزرسانی شد');
            } else {
                const { data: signUpData, error: signUpError } = await supabaseSignUpClient.auth.signUp({
                    email: values.email,
                    password: values.password,
                    options: {
                        data: { full_name: values.full_name, avatar_url: avatarUrl || undefined }
                    }
                });
                if (signUpError) throw signUpError;
                const newUserId = signUpData.user?.id;
                if (!newUserId) {
                    throw new Error('ساخت کاربر در Auth ناموفق بود');
                }

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
                message.success('کاربر اضافه شد');
            }

            setIsDrawerOpen(false);
            setEditingUser(null);
            form.resetFields();
            setAvatarUrl(null);
            fetchData();
        } catch (error: any) {
            message.error('خطا: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (record: any) => {
        if (!canManageUsers) {
            message.error('دسترسی کافی ندارید');
            return;
        }
        setEditingUser(record);
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

  const columns = [
      {
          title: 'کاربر',
          dataIndex: 'full_name',
          key: 'full_name',
          render: (text: string, record: any) => (
              <Link to={`/profile/${record.id}`} className="flex items-center gap-3 group">
                  <Avatar src={record.avatar_url} icon={<UserOutlined />} className="bg-leather-100 text-leather-600 border border-leather-200" size={40} />
                  <div className="flex flex-col">
                      <span className="font-bold text-gray-700 dark:text-gray-200 group-hover:text-leather-600 transition-colors">{text || 'بدون نام'}</span>
                      <span className="text-xs text-gray-400">{record.email}</span>
                  </div>
              </Link>
          )
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
                    render: (_: any, record: any) => (
                            <Select
                                value={record.role_id}
                                style={{ width: '100%', minWidth: 140 }}
                                placeholder="انتخاب نقش"
                                onChange={(val) => handleRoleChange(record.id, val)}
                                options={roles.map(r => ({ label: getRoleDisplayTitle(r), value: r.id }))}
                                className="custom-select"
                                disabled={!canEditRecord(record)}
                            />
                    )
            },
      {
          title: 'وضعیت',
          key: 'status',
          width: 110,
                    render: (_: any, record: any) => (
              <Switch 
                checked={record.is_active} 
                checkedChildren="فعال" 
                unCheckedChildren="غیرفعال"
                onChange={(checked) => handleStatusChange(record.id, checked)}
                className="bg-gray-300"
                                disabled={!canEditRecord(record)}
              />
          )
      },
      {
          title: 'عملیات',
          key: 'actions',
          width: 190,
          render: (_: any, record: any) => (
              <div className="flex items-center gap-2">
                  <Button size="small" onClick={() => handleEdit(record)} disabled={!canEditRecord(record)}>ویرایش</Button>
                  <Button size="small" onClick={() => handleResetPassword(record.email)} disabled={!canEditRecord(record)}>ارسال لینک تغییر رمز</Button>
              </div>
          )
      }
  ];

  return (
    <div className="py-4">
                <div className="flex justify-end mb-4">
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => { setEditingUser(null); form.resetFields(); setAvatarUrl(null); setIsDrawerOpen(true); }}
                            className="bg-leather-600 hover:!bg-leather-500 border-none h-10 px-6"
                            disabled={!canManageUsers}
                        >
                            کاربر جدید
                        </Button>
        </div>

        <div className="overflow-x-auto">
            <Table
                dataSource={users}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                className="custom-erp-table min-w-[760px]"
                scroll={{ x: 'max-content' }}
            />
        </div>

                <Drawer
                        title={editingUser ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}
            width={500}
            onClose={() => setIsDrawerOpen(false)}
            open={isDrawerOpen}
            zIndex={99999} /* فیکس: اولویت بسیار بالا برای نمایش روی سایدبار */
            styles={{ body: { paddingBottom: 80 } }}
            className="dark:bg-[#141414]"
        >
                        <Form form={form} layout="vertical" onFinish={handleAddOrEditUser}>
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
                    <Select placeholder="انتخاب کنید" options={roles.map(r => ({ label: getRoleDisplayTitle(r), value: r.id }))} />
                </Form.Item>
                                <Form.Item label="نقش (متنی)" name="role" rules={[{ required: true }]}>
                                        <Select
                                            placeholder="انتخاب نقش"
                                            options={[
                                                { label: 'مدیر ارشد', value: 'super_admin' },
                                                { label: 'مدیر سیستم', value: 'admin' },
                                                { label: 'مدیر', value: 'manager' },
                                                { label: 'مشاهده‌گر', value: 'viewer' },
                                            ]}
                                        />
                                </Form.Item>
                                {!editingUser && (
                                    <Form.Item label="رمز عبور" name="password" rules={[{ required: true, min: 6 }]}>
                                        <Input.Password placeholder="حداقل ۶ کاراکتر" />
                                    </Form.Item>
                                )}
                                {!editingUser && (
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
                                {editingUser && editingUser.id === currentUserId && (
                                    <Form.Item label="رمز عبور جدید" name="password">
                                        <Input.Password placeholder="در صورت نیاز تغییر دهید" />
                                    </Form.Item>
                                )}
                                {editingUser && (
                                    <Form.Item label="وضعیت" name="is_active" valuePropName="checked">
                                        <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                                    </Form.Item>
                                )}
                
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                    <Button onClick={() => setIsDrawerOpen(false)}>انصراف</Button>
                                        <Button type="primary" htmlType="submit" loading={submitting} icon={<SaveOutlined />} className="bg-leather-600 border-none">
                                            {editingUser ? 'ذخیره تغییرات' : 'ثبت کاربر'}
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
