import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Spin,
  Tag,
} from 'antd';
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { FieldLocation, FieldNature, FieldType, ModuleField } from '../types';
import PersianDatePicker from '../components/PersianDatePicker';
import ChequePreviewCard from '../components/accounting/ChequePreviewCard';
import { supabase } from '../supabaseClient';
import { fetchCurrentUserRolePermissions } from '../utils/permissions';
import { isAccountingMinimalModule } from '../utils/accountingModules';
import {
  formatNumericForInput,
  normalizeNumericString,
  parseNumericInput,
  preventNonNumericKeyDown,
  preventNonNumericPaste,
} from '../utils/persianNumericInput';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';

const sortByOrder = (a: ModuleField, b: ModuleField) => (a.order || 0) - (b.order || 0);

const isNumericField = (fieldType: FieldType) =>
  fieldType === FieldType.NUMBER ||
  fieldType === FieldType.PRICE ||
  fieldType === FieldType.PERCENTAGE ||
  fieldType === FieldType.PERCENTAGE_OR_AMOUNT ||
  fieldType === FieldType.STOCK;

const CHEQUE_INLINE_FIELD_KEYS = new Set<string>([
  'issue_date',
  'serial_no',
  'sayad_id',
  'bank_name',
  'branch_name',
  'branch_code',
  'amount',
  'payee_name',
  'payee_identifier',
  'account_holder_name',
]);

const AccountingRecordPage: React.FC = () => {
  const { moduleId, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const isChequeModule = moduleId === 'cheques';
  const isCreate = location.pathname.endsWith('/create');
  const isEditMode = isCreate || location.pathname.endsWith('/edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [canDelete, setCanDelete] = useState(true);
  const [fieldPerms, setFieldPerms] = useState<Record<string, boolean>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const visibleFields = useMemo(() => {
    if (!moduleConfig) return [] as ModuleField[];
    return (moduleConfig.fields || [])
      .filter((f) => fieldPerms[f.key] !== false)
      .sort(sortByOrder);
  }, [moduleConfig, fieldPerms]);

  const chequeInlineFields = useMemo(() => {
    if (!isChequeModule) return [] as ModuleField[];
    return visibleFields.filter((field) => CHEQUE_INLINE_FIELD_KEYS.has(field.key));
  }, [isChequeModule, visibleFields]);

  const standardFields = useMemo(() => {
    if (!isChequeModule) return visibleFields;
    return visibleFields.filter((field) => !CHEQUE_INLINE_FIELD_KEYS.has(field.key));
  }, [isChequeModule, visibleFields]);

  const headerFields = useMemo(
    () => standardFields.filter((field) => field.location === FieldLocation.HEADER),
    [standardFields]
  );

  const fieldsByBlock = useMemo(() => {
    const map = new Map<string, ModuleField[]>();
    standardFields.forEach((field) => {
      if (!field.blockId) return;
      if (!map.has(field.blockId)) map.set(field.blockId, []);
      map.get(field.blockId)!.push(field);
    });
    map.forEach((items) => items.sort(sortByOrder));
    return map;
  }, [standardFields]);

  const looseFields = useMemo(
    () =>
      standardFields.filter(
        (field) => field.location !== FieldLocation.HEADER && !field.blockId
      ),
    [standardFields]
  );

  const getFieldOptions = useCallback(
    (field: ModuleField) => {
      if (field.type === FieldType.RELATION) {
        return relationOptions[field.key] || [];
      }
      if ((field as any).dynamicOptionsCategory) {
        return dynamicOptions[(field as any).dynamicOptionsCategory] || [];
      }
      return (field.options || []) as Array<{ value: string; label: string; color?: string }>;
    },
    [dynamicOptions, relationOptions]
  );

  const getUserName = useCallback(
    (uid?: string | null) => {
      if (!uid) return '-';
      return userNames[uid] || uid;
    },
    [userNames]
  );

  const renderDateTime = useCallback((value?: string | null) => {
    if (!value) return '-';
    const formatted = safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
    return formatted ? toPersianNumber(formatted) : '-';
  }, []);

  const handleChequeInlineFieldChange = useCallback(
    (fieldKey: string, value: any) => {
      setFormData((prev) => ({ ...prev, [fieldKey]: value }));
      form.setFieldsValue({ [fieldKey]: value });
    },
    [form]
  );

  const loadRelationOptions = useCallback(async () => {
    if (!moduleConfig) return {};
    const relationFields = (moduleConfig.fields || []).filter(
      (field) => field.type === FieldType.RELATION && field.relationConfig?.targetModule
    );

    const pairs = await Promise.all(
      relationFields.map(async (field) => {
        const targetModule = String(field.relationConfig?.targetModule || '');
        const targetField = String(field.relationConfig?.targetField || 'id');
        let selectExpr = `id, ${targetField}`;

        if (targetModule === 'chart_of_accounts' && targetField !== 'code') {
          selectExpr += ', code';
        }

        const { data, error } = await supabase
          .from(targetModule)
          .select(selectExpr)
          .limit(500);
        if (error) {
          return [field.key, []] as const;
        }

        const options = (data || []).map((row: any) => {
          const primaryLabel = String(row?.[targetField] || row?.name || row?.title || row?.id);
          if (targetModule === 'chart_of_accounts' && row?.code) {
            return { value: row.id, label: `[${toPersianNumber(row.code)}] ${primaryLabel}` };
          }
          return { value: row.id, label: primaryLabel };
        });

        const filtered = targetModule === moduleId && id
          ? options.filter((option) => String(option.value) !== String(id))
          : options;
        return [field.key, filtered] as const;
      })
    );

    return pairs.reduce<Record<string, Array<{ value: string; label: string }>>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }, [id, moduleConfig, moduleId]);

  const loadDynamicOptions = useCallback(async () => {
    if (!moduleConfig) return {};
    const categories = Array.from(
      new Set(
        (moduleConfig.fields || [])
          .map((field: any) => field.dynamicOptionsCategory as string | undefined)
          .filter(Boolean)
      )
    ) as string[];

    if (!categories.length) return {};
    const pairs = await Promise.all(
      categories.map(async (category) => {
        const { data } = await supabase
          .from('dynamic_options')
          .select('label,value')
          .eq('category', category)
          .eq('is_active', true);
        return [category, (data || []) as Array<{ value: string; label: string }>] as const;
      })
    );

    return pairs.reduce<Record<string, Array<{ value: string; label: string }>>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }, [moduleConfig]);

  const load = useCallback(async () => {
    if (!moduleId || !moduleConfig || !isAccountingMinimalModule(moduleId)) return;

    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const modulePerms = permissions?.[moduleId] || {};
      setCanView(modulePerms.view !== false);
      setCanEdit(modulePerms.edit !== false);
      setCanDelete(modulePerms.delete !== false);
      setFieldPerms(modulePerms.fields || {});

      if (modulePerms.view === false) {
        setRecord(null);
        setFormData({});
        return;
      }

      const [relOpts, dynOpts] = await Promise.all([loadRelationOptions(), loadDynamicOptions()]);
      setRelationOptions(relOpts);
      setDynamicOptions(dynOpts);

      if (isCreate) {
        const initialValues = ((location.state as any)?.initialValues || {}) as Record<string, any>;
        setRecord(null);
        setFormData(initialValues);
        form.setFieldsValue(initialValues);
        return;
      }

      if (!id) return;

      const { data, error } = await supabase.from(moduleConfig.table).select('*').eq('id', id).single();
      if (error) throw error;
      const row = (data || {}) as Record<string, any>;
      setRecord(row);
      setFormData(row);
      form.setFieldsValue(row);

      const userIds = Array.from(
        new Set(
          [row.created_by, row.updated_by]
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        )
      );

      if (userIds.length > 0) {
        const { data: users } = await supabase.from('profiles').select('id,full_name').in('id', userIds);
        const userMap = (users || []).reduce<Record<string, string>>((acc, user: any) => {
          acc[String(user.id)] = String(user.full_name || user.id);
          return acc;
        }, {});
        setUserNames(userMap);
      } else {
        setUserNames({});
      }
    } catch (err: any) {
      message.error(err?.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }, [form, id, loadDynamicOptions, loadRelationOptions, location.state, message, moduleConfig, moduleId, isCreate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!moduleConfig) return;
    const title = isCreate
      ? `ایجاد ${moduleConfig.titles.fa}`
      : record
        ? String(
            record?.title ||
              record?.name ||
              record?.code ||
            record?.event_key ||
            record?.account_number ||
            record?.sayad_id ||
            record?.id ||
            moduleConfig.titles.fa
          )
        : moduleConfig.titles.fa;

    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: moduleConfig.titles.fa, moduleId: moduleConfig.id, recordName: title },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [isCreate, moduleConfig, record]);

  const renderReadValue = useCallback(
    (field: ModuleField, value: any) => {
      if (value === null || value === undefined || value === '') return '-';

      if (field.type === FieldType.CHECKBOX) {
        return value ? <Tag color="green">بله</Tag> : <Tag color="red">خیر</Tag>;
      }

      if (field.type === FieldType.STATUS || field.type === FieldType.SELECT) {
        const option = getFieldOptions(field).find((o: any) => String(o.value) === String(value));
        const label = option?.label || String(value);
        if (field.type === FieldType.STATUS && option?.color) {
          return <Tag color={option.color}>{label}</Tag>;
        }
        return label;
      }

      if (field.type === FieldType.RELATION) {
        const option = getFieldOptions(field).find((o: any) => String(o.value) === String(value));
        return option?.label || String(value);
      }

      if (field.type === FieldType.DATE) {
        return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || '-');
      }

      if (field.type === FieldType.DATETIME) {
        return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-');
      }

      if (field.type === FieldType.TIME) {
        return toPersianNumber(String(value || '-'));
      }

      if (isNumericField(field.type as FieldType)) {
        return <span className="persian-number">{formatPersianPrice(value)}</span>;
      }

      return toPersianNumber(String(value));
    },
    [getFieldOptions]
  );

  const buildPayload = useCallback(
    (values: Record<string, any>) => {
      const payload: Record<string, any> = {};
      visibleFields.forEach((field) => {
        if (field.nature === FieldNature.SYSTEM || field.readonly) return;

        const raw = values[field.key];
        if (raw === undefined) return;

        if (field.type === FieldType.CHECKBOX) {
          payload[field.key] = Boolean(raw);
          return;
        }

        if (isNumericField(field.type as FieldType)) {
          payload[field.key] = parseNumericInput(raw);
          return;
        }

        if (field.type === FieldType.TEXT || field.type === FieldType.LONG_TEXT) {
          const value = String(raw || '').trim();
          payload[field.key] = value ? value : null;
          return;
        }

        if (field.type === FieldType.RELATION || field.type === FieldType.SELECT || field.type === FieldType.STATUS) {
          payload[field.key] = raw || null;
          return;
        }

        payload[field.key] = raw;
      });

      return payload;
    },
    [visibleFields]
  );

  const handleSave = async () => {
    if (!moduleId || !moduleConfig) return;
    if (!canEdit) {
      message.error('دسترسی ویرایش ندارید');
      return;
    }

    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = buildPayload(values);

      if (isCreate) {
        const { data, error } = await supabase
          .from(moduleConfig.table)
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        message.success('رکورد ایجاد شد');
        navigate(`/${moduleId}/${data.id}`);
        return;
      }

      if (!id) return;
      const { error } = await supabase.from(moduleConfig.table).update(payload).eq('id', id);
      if (error) throw error;
      message.success('تغییرات ذخیره شد');
      navigate(`/${moduleId}/${id}`);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      message.error(err?.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!moduleId || !moduleConfig || !id) return;
    if (!canDelete) {
      message.error('دسترسی حذف ندارید');
      return;
    }
    try {
      setDeleting(true);
      const { error } = await supabase.from(moduleConfig.table).delete().eq('id', id);
      if (error) throw error;
      message.success('رکورد حذف شد');
      navigate(`/${moduleId}`);
    } catch (err: any) {
      message.error(err?.message || 'خطا در حذف');
    } finally {
      setDeleting(false);
    }
  };

  const renderEditControl = (field: ModuleField) => {
    const disabled = !canEdit || field.readonly === true || field.nature === FieldNature.SYSTEM;
    const options = getFieldOptions(field) as Array<{ value: string; label: string }>;

    switch (field.type) {
      case FieldType.LONG_TEXT:
        return <Input.TextArea rows={3} disabled={disabled} />;
      case FieldType.CHECKBOX:
        return <Checkbox disabled={disabled} />;
      case FieldType.DATE:
        return <PersianDatePicker type="DATE" disabled={disabled} />;
      case FieldType.TIME:
        return <PersianDatePicker type="TIME" disabled={disabled} />;
      case FieldType.DATETIME:
        return <PersianDatePicker type="DATETIME" disabled={disabled} />;
      case FieldType.SELECT:
      case FieldType.STATUS:
      case FieldType.RELATION:
        return (
          <Select
            showSearch
            optionFilterProp="label"
            allowClear
            disabled={disabled}
            options={options}
          />
        );
      default:
        if (isNumericField(field.type as FieldType)) {
          return (
            <InputNumber
              className="w-full persian-number"
              controls={false}
              stringMode
              disabled={disabled}
              formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
              parser={(val) => normalizeNumericString(val)}
              onKeyDown={preventNonNumericKeyDown}
              onPaste={preventNonNumericPaste}
            />
          );
        }
        return <Input disabled={disabled} />;
    }
  };

  if (!moduleConfig || !isAccountingMinimalModule(moduleId)) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="صفحه مینیمال برای این ماژول فعال نیست" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی مشاهده ندارید" />
      </div>
    );
  }

  if (!isCreate && !record) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="رکورد پیدا نشد" />
      </div>
    );
  }

  const recordTitle =
    (isCreate ? `ایجاد ${moduleConfig.titles.fa}` : null) ||
    String(
      record?.title ||
        record?.name ||
        record?.code ||
        record?.event_key ||
        record?.account_number ||
        record?.sayad_id ||
        moduleConfig.titles.fa
    );

  const sortedBlocks = (moduleConfig.blocks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto animate-fadeIn">
      <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button icon={<ArrowRightOutlined />} type="text" onClick={() => navigate(`/${moduleId}`)} />
            <h1 className="text-xl md:text-2xl font-black m-0 text-gray-800 dark:text-white">
              {recordTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {!isCreate && !isEditMode && canEdit && id && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/${moduleId}/${id}/edit`)}>
                ویرایش
              </Button>
            )}

            {isEditMode && canEdit && (
              <Button
                type="primary"
                icon={isCreate ? <PlusOutlined /> : <SaveOutlined />}
                className="bg-leather-600 border-none"
                loading={saving}
                onClick={handleSave}
              >
                {isCreate ? 'ایجاد' : 'ذخیره'}
              </Button>
            )}

            {!isCreate && canDelete && (
              <Popconfirm
                title="حذف رکورد"
                description="از حذف این رکورد مطمئن هستید؟"
                okText="حذف"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={handleDelete}
              >
                <Button danger icon={<DeleteOutlined />}>
                  حذف
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>

        {isEditMode ? (
          <Form
            form={form}
            layout="vertical"
            initialValues={formData}
            onValuesChange={(_, allValues) => setFormData(allValues)}
          >
            {isChequeModule &&
              chequeInlineFields.map((field) => (
                <Form.Item
                  key={`inline_${field.key}`}
                  name={field.key}
                  hidden
                  preserve
                  rules={[
                    {
                      required: field.validation?.required === true,
                      message: `${field.labels?.fa || field.key} الزامی است`,
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
              ))}

            {headerFields.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {headerFields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={field.key}
                    label={field.labels?.fa || field.key}
                    rules={[
                      {
                        required: field.validation?.required === true,
                        message: `${field.labels?.fa || field.key} الزامی است`,
                      },
                    ]}
                    valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                  >
                    {renderEditControl(field)}
                  </Form.Item>
                ))}
              </div>
            )}

            {sortedBlocks.map((block) => {
              const fields = fieldsByBlock.get(block.id) || [];
              if (!fields.length) return null;
              return (
                <Card
                  key={block.id}
                  size="small"
                  title={block.titles?.fa || block.id}
                  className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {fields.map((field) => (
                      <Form.Item
                        key={field.key}
                        name={field.key}
                        label={field.labels?.fa || field.key}
                        rules={[
                          {
                            required: field.validation?.required === true,
                            message: `${field.labels?.fa || field.key} الزامی است`,
                          },
                        ]}
                        valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                      >
                        {renderEditControl(field)}
                      </Form.Item>
                    ))}
                  </div>
                </Card>
              );
            })}

            {looseFields.length > 0 && (
              <Card
                size="small"
                title="سایر اطلاعات"
                className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {looseFields.map((field) => (
                    <Form.Item
                      key={field.key}
                      name={field.key}
                      label={field.labels?.fa || field.key}
                      rules={[
                        {
                          required: field.validation?.required === true,
                          message: `${field.labels?.fa || field.key} الزامی است`,
                        },
                      ]}
                      valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
                    >
                      {renderEditControl(field)}
                    </Form.Item>
                  ))}
                </div>
              </Card>
            )}
          </Form>
        ) : (
          <>
            {headerFields.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {headerFields.map((field) => (
                  <div
                    key={field.key}
                    className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                  >
                    <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {renderReadValue(field, record?.[field.key])}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sortedBlocks.map((block) => {
              const fields = fieldsByBlock.get(block.id) || [];
              if (!fields.length) return null;
              return (
                <Card
                  key={block.id}
                  size="small"
                  title={block.titles?.fa || block.id}
                  className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {fields.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                      >
                        <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {renderReadValue(field, record?.[field.key])}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}

            {looseFields.length > 0 && (
              <Card
                size="small"
                title="سایر اطلاعات"
                className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {looseFields.map((field) => (
                    <div
                      key={field.key}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2"
                    >
                      <div className="text-xs text-gray-500 mb-1">{field.labels?.fa || field.key}</div>
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {renderReadValue(field, record?.[field.key])}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {isChequeModule && (
          <Card
            size="small"
            title="نمای چک"
            className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800"
          >
            <div className="mb-3 text-xs text-gray-500">
              پیش نمایش ظاهری چک بر اساس اطلاعات ثبت شده
            </div>
            <ChequePreviewCard
              values={(isEditMode ? formData : record) || {}}
              editable={isEditMode}
              disabled={!canEdit}
              onFieldChange={handleChequeInlineFieldChange}
            />
          </Card>
        )}

        {!isCreate && (
          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <SafetyCertificateOutlined className="text-green-600" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">ایجاد کننده</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(record?.created_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <ClockCircleOutlined className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ایجاد</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">
                  {renderDateTime(record?.created_at)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <EditOutlined className="text-orange-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">آخرین ویرایشگر</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(record?.updated_by)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                <HistoryOutlined className="text-purple-500" />
              </div>
              <div className="flex flex-col">
                <span className="opacity-70">زمان ویرایش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number">
                  {renderDateTime(record?.updated_at)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AccountingRecordPage;
