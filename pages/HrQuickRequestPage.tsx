import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Result, Spin, Switch } from 'antd';
import {
  ClockCircleOutlined,
  CloseOutlined,
  EditOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { supabase } from '../supabaseClient';
import PersianDatePicker from '../components/PersianDatePicker';
import AdaptiveSelectField from '../components/AdaptiveSelectField';
import RichTextEditor from '../components/RichTextEditor';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import { safeJalaliFormat } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { resolveOverlayPopupContainer } from '../utils/popupContainer';

type QuickModuleId = 'leave_requests' | 'overtime_requests' | 'mission_requests';

type EmployeeOption = {
  id: string;
  full_name: string | null;
  department: string | null;
  team: string | null;
  related_profile_id: string | null;
};

const QUICK_MODULE_IDS = new Set<QuickModuleId>(['leave_requests', 'overtime_requests', 'mission_requests']);

const renderDateTime = (value: string | null | undefined) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-';

const resolveRequiredRule = (field: ModuleField) =>
  field.validation?.required ? [{ required: true, message: 'این فیلد الزامی است' }] : undefined;

const HrQuickRequestPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleId, id } = useParams();

  const resolvedModuleId = String(moduleId || '') as QuickModuleId;
  const moduleConfig = QUICK_MODULE_IDS.has(resolvedModuleId) ? (MODULES[resolvedModuleId] as ModuleDefinition) : null;
  const assigneeLabel = getAssigneeLabel(resolvedModuleId);
  const isCreate = location.pathname.endsWith('/create');
  const isEdit = location.pathname.endsWith('/edit');
  const isView = !isCreate && !location.pathname.endsWith('/edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const orderedFields = useMemo(
    () => (moduleConfig?.fields || []).filter((field) => field.key !== 'employee_id').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [moduleConfig?.fields],
  );

  const closeToList = useCallback(() => {
    navigate(`/${resolvedModuleId}`);
  }, [navigate, resolvedModuleId]);

  const loadPage = useCallback(async () => {
    if (!moduleConfig) return;
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id || null;
      setCurrentUserId(authUserId);

      const [employeesRes, recordRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, department, team, related_profile_id')
          .eq('employment_status', 'active')
          .order('full_name', { ascending: true }),
        isCreate || !id
          ? Promise.resolve({ data: null, error: null } as any)
          : supabase.from(moduleConfig.table).select('*').eq('id', id).maybeSingle(),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (recordRes?.error) throw recordRes.error;

      const nextEmployees = (employeesRes.data || []) as EmployeeOption[];
      const nextRecord = (recordRes?.data || null) as Record<string, any> | null;

      setEmployees(nextEmployees);
      setRecord(nextRecord);

      const defaultEmployeeId =
        nextRecord?.employee_id ||
        nextEmployees.find((item) => item.related_profile_id && item.related_profile_id === authUserId)?.id ||
        null;

      const nextValues: Record<string, any> = {
        ...nextRecord,
        employee_id: defaultEmployeeId,
      };

      if (resolvedModuleId === 'leave_requests') {
        nextValues.status = nextValues.status || 'pending';
        nextValues.leave_type = nextValues.leave_type || 'daily';
        nextValues.total_days = Number(nextValues.total_days || 0);
        nextValues.total_minutes = Number(nextValues.total_minutes || 0);
      } else if (resolvedModuleId === 'overtime_requests') {
        nextValues.status = nextValues.status || 'pending';
        nextValues.total_minutes = Number(nextValues.total_minutes || 0);
      } else if (resolvedModuleId === 'mission_requests') {
        nextValues.status = nextValues.status || 'pending';
      }

      form.setFieldsValue(nextValues);

      const profileIds = Array.from(new Set([nextRecord?.created_by, nextRecord?.updated_by].filter(Boolean)));
      if (profileIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, full_name').in('id', profileIds);
        if (profilesError) throw profilesError;
        setUserNames(
          Object.fromEntries((profilesData || []).map((item: any) => [String(item.id), String(item.full_name || 'بدون نام')])),
        );
      } else {
        setUserNames({});
      }
    } catch (error: any) {
      console.error(error);
      message.error(toFaErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [form, id, isCreate, message, moduleConfig, resolvedModuleId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!moduleConfig) return;
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: {
          moduleTitle: moduleConfig.titles.fa,
          moduleId: moduleConfig.id,
          recordName: isCreate ? `ایجاد ${moduleConfig.titles.faSingular || moduleConfig.titles.fa}` : moduleConfig.titles.faSingular || moduleConfig.titles.fa,
        },
      }),
    );

    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [isCreate, moduleConfig]);

  const handleValuesChange = (_changedValues: any, allValues: any) => {
    if (resolvedModuleId === 'overtime_requests' && allValues.start_time && allValues.end_time) {
      const [sh, sm] = String(allValues.start_time).split(':').map(Number);
      const [eh, em] = String(allValues.end_time).split(':').map(Number);
      if (![sh, sm, eh, em].some(Number.isNaN)) {
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff >= 0 && diff !== Number(allValues.total_minutes || 0)) {
          form.setFieldValue('total_minutes', diff);
        }
      }
    }

    if (
      resolvedModuleId === 'leave_requests' &&
      allValues.start_date &&
      allValues.end_date &&
      String(allValues.leave_type || '') !== 'hourly'
    ) {
      const start = new Date(`${allValues.start_date}T12:00:00`);
      const end = new Date(`${allValues.end_date}T12:00:00`);
      const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (diff > 0 && diff !== Number(allValues.total_days || 0)) {
        form.setFieldValue('total_days', diff);
      }
    }
  };

  const renderField = (field: ModuleField) => {
    const disabled = isView || field.readonly === true;

    switch (field.type) {
        case FieldType.TEXT:
          return <Input disabled={disabled} />;
        case FieldType.LONG_TEXT:
        case FieldType.SUPER_LONG_TEXT:
          return <RichTextEditor disabled={disabled} minRows={field.type === FieldType.SUPER_LONG_TEXT ? 6 : 3} onChange={() => undefined} />;
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return <InputNumber className="w-full" controls={false} disabled={disabled} />;
      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
          <AdaptiveSelectField
            disabled={disabled}
            options={field.options || []}
            optionFilterProp="label"
            showSearch
            getPopupContainer={resolveOverlayPopupContainer}
            modalContainer={resolveOverlayPopupContainer}
            overlayZIndexBase={12000}
          />
        );
      case FieldType.DATE:
        return <PersianDatePicker type="DATE" disabled={disabled} placeholder={field.labels.fa} />;
      case FieldType.TIME:
        return <PersianDatePicker type="TIME" disabled={disabled} placeholder={field.labels.fa} />;
      case FieldType.DATETIME:
        return <PersianDatePicker type="DATETIME" disabled={disabled} placeholder={field.labels.fa} />;
      case FieldType.CHECKBOX:
        return <Switch disabled={disabled} />;
      default:
        return <Input disabled={disabled} />;
    }
  };

  const handleSave = async () => {
    if (!moduleConfig) return;
    try {
      setSaving(true);
      const values = await form.validateFields();
      const nowIso = new Date().toISOString();
      const payload = {
        ...values,
        updated_by: currentUserId,
        updated_at: nowIso,
      };

      const response = isCreate
        ? await supabase
            .from(moduleConfig.table)
            .insert({
              ...payload,
              created_by: currentUserId,
            })
            .select('*')
            .single()
        : await supabase.from(moduleConfig.table).update(payload).eq('id', id).select('*').single();

      if (response.error) throw response.error;
      message.success(isCreate ? 'رکورد ثبت شد' : 'تغییرات ذخیره شد');
      closeToList();
    } catch (error: any) {
      if (error?.errorFields) return;
      console.error(error);
      message.error(toFaErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!moduleConfig) {
    return <Result status="404" title="ماژول یافت نشد" />;
  }

  const employeeOptions = employees.map((item) => ({
    label: item.full_name || 'بدون نام',
    value: item.id,
    department: item.department || '',
    team: item.team || '',
  }));

  return (
    <Modal
      open
      onCancel={closeToList}
      footer={null}
      destroyOnHidden
      maskClosable={false}
      width={780}
      styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}
      title={
        <div className="flex flex-col gap-1 pl-8">
          <span className="text-base font-black text-gray-800">
            {isCreate ? `افزودن سریع ${moduleConfig.titles.faSingular || moduleConfig.titles.fa}` : moduleConfig.titles.faSingular || moduleConfig.titles.fa}
          </span>
          <span className="text-xs text-gray-500">{isView ? 'نمایش جزئیات درخواست' : 'فرم سریع برای ثبت و ویرایش'}</span>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spin size="large" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
              <Form.Item name="employee_id" label={assigneeLabel} rules={[{ required: true, message: 'انتخاب کارمند الزامی است' }]}>
                <AdaptiveSelectField
                  showSearch
                  optionFilterProp="label"
                  disabled={isView}
                  options={employeeOptions}
                  placeholder={assigneeLabel}
                  optionRender={(option) => {
                    const item = option.data as any;
                    const secondary = [item.department, item.team].filter(Boolean).join(' / ');
                    return (
                      <div className="flex flex-col">
                        <span>{item.label}</span>
                        {secondary ? <span className="text-[11px] text-gray-400">{secondary}</span> : null}
                      </div>
                    );
                  }}
                  getPopupContainer={resolveOverlayPopupContainer}
                  modalContainer={resolveOverlayPopupContainer}
                  overlayZIndexBase={12000}
                />
              </Form.Item>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {orderedFields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={field.key}
                    label={field.labels.fa}
                    rules={resolveRequiredRule(field)}
                    valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                    className={(field.type === FieldType.LONG_TEXT || field.type === FieldType.SUPER_LONG_TEXT) ? 'md:col-span-2' : undefined}
                  >
                    {renderField(field)}
                  </Form.Item>
                ))}
              </div>
            </Form>
          </div>

          {!isCreate && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/5">
              <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <SafetyCertificateOutlined className="text-green-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">ایجادکننده</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{userNames[String(record?.created_by || '')] || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-blue-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">زمان ایجاد</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{renderDateTime(record?.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <HistoryOutlined className="text-amber-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">آخرین ویرایشگر</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{userNames[String(record?.updated_by || '')] || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-violet-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">زمان ویرایش</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{renderDateTime(record?.updated_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button icon={<CloseOutlined />} onClick={closeToList}>
              بستن
            </Button>
            {isView ? (
              <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/${resolvedModuleId}/${id}/edit`)}>
                ویرایش
              </Button>
            ) : (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                {isCreate ? 'ثبت' : isEdit ? 'ذخیره تغییرات' : 'ثبت'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default HrQuickRequestPage;
