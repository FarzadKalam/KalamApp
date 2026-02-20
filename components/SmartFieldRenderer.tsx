import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined, PlusOutlined } from '@ant-design/icons';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import ProductionStagesField from './ProductionStagesField';
import PersianDatePicker from './PersianDatePicker';
import RelatedRecordPopover from './RelatedRecordPopover';
import QrScanPopover from './QrScanPopover';
import ProductImagesManager from './ProductImagesManager';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const normalizeNumericString = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  const englishDigits = normalizeDigitsToEnglish(raw)
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');

  const sign = englishDigits.startsWith('-') ? '-' : '';
  const unsigned = englishDigits.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('');
  const hasDot = cleaned.includes('.');
  return `${sign}${integerPart}${hasDot ? `.${decimalPart}` : ''}`;
};

const formatNumericForInput = (raw: any, withGrouping = false): string => {
  const normalized = normalizeNumericString(raw);
  if (!normalized) return '';
  if (!withGrouping) return toPersianNumber(normalized);
  if (normalized === '-' || normalized === '.' || normalized === '-.') return toPersianNumber(normalized);

  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = sign ? normalized.slice(1) : normalized;
  const [integerPart = '', decimalPart] = unsigned.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const output = decimalPart !== undefined ? `${sign}${grouped}.${decimalPart}` : `${sign}${grouped}`;
  return toPersianNumber(output);
};

const formatTextForInput = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return toPersianNumber(normalizeDigitsToEnglish(raw));
};

interface SmartFieldRendererProps {
  field: ModuleField;
  value: any;
  onChange: (value: any) => void;
  label?: string; 
  type?: string;
  options?: any[];
  relationModule?: string;
  compactMode?: boolean;
  forceEditMode?: boolean;
  onSave?: (val: any) => void;
  onOptionsUpdate?: () => void;
  allValues?: Record<string, any>;
  recordId?: string;
  moduleId?: string;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [quickCreateForm] = Form.useForm();
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateRelationOptions, setQuickCreateRelationOptions] = useState<Record<string, any[]>>({});
  const [quickCreateDynamicOptions, setQuickCreateDynamicOptions] = useState<Record<string, any[]>>({});
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const fieldOptions = field?.options || options || [];
  const isReadonly = field?.readonly === true || field?.nature === FieldNature.SYSTEM;
  const relationConfigAny = field.relationConfig as any;
  const quickCreateTargetModuleId = relationConfigAny?.targetModule as string | undefined;
  const quickCreateTargetModule = quickCreateTargetModuleId ? MODULES[quickCreateTargetModuleId] : undefined;
  const quickCreateTargetField = useMemo(() => {
    const configured = relationConfigAny?.targetField;
    if (configured) return String(configured);
    const moduleFields = quickCreateTargetModule?.fields || [];
    const preferredKeys = ['name', 'title', 'full_name', 'business_name', 'shelf_number', 'system_code'];
    const preferred = moduleFields.find((f: any) => preferredKeys.includes(String(f?.key || '')));
    if (preferred?.key) return String(preferred.key);
    const headerField = moduleFields.find((f: any) => f?.location === 'header');
    if (headerField?.key) return String(headerField.key);
    return 'name';
  }, [relationConfigAny?.targetField, quickCreateTargetModule]);

  const quickCreateFields = useMemo(() => {
    const moduleFields = quickCreateTargetModule?.fields || [];
    const unsupported = new Set<string>([
      FieldType.IMAGE,
      FieldType.TAGS,
      FieldType.PROGRESS_STAGES,
      FieldType.JSON,
      FieldType.READONLY_LOOKUP,
    ]);

    const selected = moduleFields
      .filter((f: any) => !!f?.key)
      .filter((f: any) => f?.nature !== FieldNature.SYSTEM)
      .filter((f: any) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(String(f?.key || '')))
      .filter((f: any) => !unsupported.has(String(f?.type || '')))
      .filter((f: any) => {
        const isHeader = f?.location === 'header';
        const isRequiredField = f?.validation?.required === true;
        const isKeyField = f?.isKey === true;
        const isTableColumn = f?.isTableColumn === true;
        const isTargetField = String(f?.key || '') === quickCreateTargetField;
        return isHeader || isRequiredField || isKeyField || isTableColumn || isTargetField;
      })
      .sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0));

    const map = new Map<string, ModuleField>();
    selected.forEach((f: any) => map.set(String(f.key), f as ModuleField));

    if (!map.has(quickCreateTargetField)) {
      const existing = moduleFields.find((f: any) => String(f?.key || '') === quickCreateTargetField);
      if (existing && existing.nature !== FieldNature.SYSTEM) {
        map.set(quickCreateTargetField, existing as ModuleField);
      } else {
        map.set(quickCreateTargetField, {
          key: quickCreateTargetField,
          type: FieldType.TEXT,
          labels: { fa: quickCreateTargetField, en: quickCreateTargetField },
          validation: { required: true },
        } as ModuleField);
      }
    }

    return Array.from(map.values()).sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0));
  }, [quickCreateTargetField, quickCreateTargetModule]);

  const fieldAny = field as any;
  if (fieldAny?.dependsOn && allValues) {
      const parentValue = allValues[fieldAny.dependsOn.field];
      if (parentValue && fieldAny.dependsOn.map) {
          // const subset = fieldAny.dependsOn.map[parentValue];
      }
  }

  if (!compactMode && forceEditMode && field?.nature === FieldNature.SYSTEM) {
      return <Input type="hidden" value={value} />;
  }

  const formatPersian = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
    if (!val) return '-';
    try {
      let dateObj: DateObject | null = null;

      if (kind === 'TIME') {
        dateObj = new DateObject({
          date: `1970-01-01 ${val}`,
          format: 'YYYY-MM-DD HH:mm',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else if (kind === 'DATE') {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        if (typeof val === 'string') {
          const direct = new Date(val);
          if (!Number.isNaN(direct.getTime())) {
            dateObj = new DateObject({ date: direct, calendar: gregorian, locale: gregorian_en });
          } else {
            dateObj = new DateObject({
              date: val,
              format: 'YYYY-MM-DD HH:mm',
              calendar: gregorian,
              locale: gregorian_en,
            });
          }
        } else if (val instanceof Date) {
          dateObj = new DateObject({ date: val, calendar: gregorian, locale: gregorian_en });
        } else {
          dateObj = new DateObject({ date: val, calendar: gregorian, locale: gregorian_en });
        }
      }

      if (!dateObj) return '-';
      const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '-';
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

      msg.success('تصویر با موفقیت آپلود شد');
      onChange(publicUrl);
      return publicUrl;
    } catch (error: any) {
      console.error('خطا در آپلود تصویر:', error);
      msg.error(`خطا در آپلود: ${error.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const closeQuickCreate = () => {
    setQuickCreateOpen(false);
    quickCreateForm.resetFields();
    setQuickCreateRelationOptions({});
    setQuickCreateDynamicOptions({});
  };

  useEffect(() => {
    if (!quickCreateOpen) return;
    const defaults: Record<string, any> = {};
    quickCreateFields.forEach((f: any) => {
      if (f?.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
    });
    quickCreateForm.setFieldsValue(defaults);
  }, [quickCreateOpen, quickCreateFields, quickCreateForm]);

  useEffect(() => {
    if (!quickCreateOpen || quickCreateFields.length === 0) return;
    let cancelled = false;

    const loadOptions = async () => {
      const relationMap: Record<string, any[]> = {};
      const dynamicMap: Record<string, any[]> = {};

      for (const quickField of quickCreateFields) {
        if (!quickField?.key) continue;

        if (quickField.dynamicOptionsCategory) {
          try {
            const { data } = await supabase
              .from('dynamic_options')
              .select('label, value')
              .eq('category', quickField.dynamicOptionsCategory)
              .eq('is_active', true)
              .order('display_order', { ascending: true });
            dynamicMap[quickField.dynamicOptionsCategory] = (data || []).map((item: any) => ({
              label: item.label,
              value: item.value,
            }));
          } catch (err) {
            console.warn('Failed loading dynamic options:', quickField.dynamicOptionsCategory, err);
          }
        }

        if (quickField.type === FieldType.RELATION && quickField.relationConfig?.targetModule) {
          const targetModule = quickField.relationConfig.targetModule;
          const targetField = (quickField.relationConfig as any)?.targetField || 'name';
          const isShelvesTarget = targetModule === 'shelves';
          const extraSelect = isShelvesTarget ? ', shelf_number' : '';
          try {
            const { data, error } = await supabase
              .from(targetModule)
              .select(`id, ${targetField}, system_code${extraSelect}`)
              .limit(200);
            if (error) throw error;
            relationMap[quickField.key] = (data || []).map((item: any) => ({
              label: item.system_code
                ? `${item[targetField] || item.shelf_number || item.system_code || item.id} (${item.system_code})`
                : (item[targetField] || item.shelf_number || item.id),
              value: item.id,
            }));
          } catch (err) {
            console.warn('Failed loading relation options:', quickField.key, err);
          }
        }
      }

      if (!cancelled) {
        setQuickCreateRelationOptions(relationMap);
        setQuickCreateDynamicOptions(dynamicMap);
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [quickCreateOpen, quickCreateFields]);

  const handleQuickCreate = async () => {
    if (!quickCreateTargetModuleId) return;
    setQuickCreateLoading(true);
    try {
      const values = await quickCreateForm.validateFields();
      const payload: Record<string, any> = {};

      quickCreateFields.forEach((f: any) => {
        if (!f?.key) return;
        let nextValue = values?.[f.key];
        if (nextValue === undefined) return;
        if (typeof nextValue === 'string') nextValue = nextValue.trim();
        if (nextValue === '') nextValue = null;
        payload[f.key] = nextValue;
      });

      if (!payload[quickCreateTargetField]) {
        throw new Error(`فیلد "${quickCreateTargetField}" الزامی است.`);
      }

      const selectFields = Array.from(new Set(['id', quickCreateTargetField])).join(', ');
      const { data: inserted, error } = await supabase
        .from(quickCreateTargetModuleId)
        .insert([payload])
        .select(selectFields)
        .single();
      if (error) throw error;

      msg.success('رکورد جدید ایجاد شد');
      closeQuickCreate();
      if (onOptionsUpdate) onOptionsUpdate();
      const insertedRow: any = inserted as any;
      if (insertedRow?.id) onChange(insertedRow.id);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      msg.error('خطا در ایجاد رکورد: ' + (err?.message || 'نامشخص'));
    } finally {
      setQuickCreateLoading(false);
    }
  };

  const handleScan = () => {
    if (scannedCode) {
      const found = fieldOptions.find((opt: any) => 
        String(opt.value) === scannedCode || 
        (opt.label && opt.label.includes(scannedCode))
      );
      if (found) {
        onChange(found.value);
        setIsScanModalOpen(false);
        setScannedCode('');
      } else {
         if (fieldType === FieldType.TEXT) {
             onChange(scannedCode);
             setIsScanModalOpen(false);
         } else {
             msg.error('موردی یافت نشد');
         }
      }
    }
  };

  const renderInputContent = () => {
    if (fieldType === FieldType.PROGRESS_STAGES) {
      const status = (allValues as any)?.status;
      const isOrder = moduleId === 'production_orders';
      const isBom = moduleId === 'production_boms';
      const canEditStages = isOrder && String(status || '').toLowerCase() !== 'completed';
      return (
        <ProductionStagesField
          recordId={recordId}
          moduleId={moduleId}
          readOnly={isBom ? false : !canEditStages}
          compact={compactMode}
          orderStatus={isOrder ? (allValues as any)?.status : null}
          draftStages={(allValues as any)?.production_stages_draft || []}
          showWageSummary={isOrder}
        />
      );
    }

    if (!forceEditMode) {
        if (fieldType === FieldType.CHECKBOX) {
            return value ? <Tag color="green">بله</Tag> : <Tag color="red">خیر</Tag>;
        }
        if (fieldType === FieldType.IMAGE && value) {
            return <Image src={value} width={40} className="rounded border" />;
        }
        if (fieldType === FieldType.PRICE) {
          const formatted = value ? formatPersianPrice(value, true) : '۰';
          return <span className="font-bold text-gray-700 dark:text-gray-300 text-xs persian-number">{formatted}</span>;
        }
        if (fieldType === FieldType.DATE) {
          return <span className="font-mono persian-number">{formatPersian(value, 'DATE')}</span>;
        }
        if (fieldType === FieldType.DATETIME) {
          return <span className="font-mono persian-number">{formatPersian(value, 'DATETIME')}</span>;
        }
        if (fieldType === FieldType.TIME) {
          return <span className="font-mono persian-number">{formatPersian(value, 'TIME')}</span>;
        }
        if (fieldType === FieldType.SELECT || fieldType === FieldType.RELATION || fieldType === FieldType.STATUS) {
             const selectedOpt = fieldOptions.find((o: any) => o.value === value);
             if (fieldType === FieldType.STATUS && selectedOpt) {
                 return <Tag color={selectedOpt.color}>{selectedOpt.label}</Tag>;
             }
             if (fieldType === FieldType.RELATION && field.relationConfig?.targetModule && value) {
                 return (
                   <RelatedRecordPopover
                     moduleId={field.relationConfig.targetModule}
                     recordId={String(value)}
                     label={selectedOpt ? selectedOpt.label : String(value)}
                   />
                 );
             }
             return <span className="text-gray-800">{selectedOpt ? selectedOpt.label : (value || '-')}</span>;
        }
        if (fieldType === FieldType.TAGS) {
             if (Array.isArray(value) && value.length > 0) {
                 return <div className="flex gap-1">{value.map((t: string, i: number) => <Tag key={i}>{t}</Tag>)}</div>;
             }
             return <span>-</span>;
        }
        
        return <span className="text-gray-800 break-words">{toPersianNumber(value) || (compactMode ? '' : '-')}</span>;
    }

    const commonProps = {
        value,
        onChange: (val: any) => onChange(val),
        disabled: !forceEditMode || isReadonly,
        placeholder: compactMode ? undefined : fieldLabel,
        style: { width: '100%' }
    };

    switch (fieldType) {
      case FieldType.TEXT:
        return (
          <Input
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
            allowClear
          />
        );
      
      case FieldType.LONG_TEXT:
        return (
          <Input.TextArea
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
            rows={compactMode ? 1 : 4}
          />
        );
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return (
            <InputNumber 
                {...commonProps}
                className="w-full persian-number" 
                controls={false}
                stringMode
                inputMode="decimal"
                formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
                parser={(val) => normalizeNumericString(val)}
            />
        );
      case FieldType.SELECT:
      case FieldType.STATUS:
        if (field.dynamicOptionsCategory) {
             return (
                 <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 4000 }}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 4000 }}
            />
        );

      case FieldType.MULTI_SELECT:
        if (field.dynamicOptionsCategory) {
             return (
                <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    mode="multiple"
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 4000 }}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                mode="multiple"
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 4000 }}
            />
        );

      case FieldType.RELATION:
        const canQuickCreate = !!field.relationConfig?.targetModule;
        let filteredOptions = fieldOptions;
        
        const relConfigAny = field.relationConfig as any;
        if (relConfigAny?.dependsOn && allValues) {
             const depVal = allValues[relConfigAny.dependsOn];
             if (!depVal) {
                 return <Select disabled placeholder="ابتدا فیلد مرتبط را انتخاب کنید" style={{width:'100%'}} value={value} options={[]} />;
             }
             filteredOptions = fieldOptions.filter((opt: any) => opt.module === depVal);
        }

          return (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex gap-1 w-full min-w-0">
                <Select 
                    {...commonProps}
                    style={{ ...((commonProps as any)?.style || {}), width: 'auto', flex: 1, minWidth: 0 }}
                    className="min-w-0"
                    showSearch
                    options={filteredOptions}
                    optionFilterProp="label"
                    getPopupContainer={() => document.body}
                    popupMatchSelectWidth={false}
                    dropdownStyle={{ zIndex: 4000, minWidth: 320 }}
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    dropdownRender={(menu) => (
                        <>
                          {menu}
                          {!compactMode && canQuickCreate && (
                              <>
                                  <div className="h-[1px] bg-gray-100 my-1"></div>
                                  <div 
                                      className="p-2 text-blue-500 cursor-pointer text-xs hover:bg-blue-50 flex items-center gap-1"
                                      onClick={() => setQuickCreateOpen(true)}
                                  >
                                      <PlusOutlined /> افزودن مورد جدید...
                                  </div>
                              </>
                          )}
                        </>
                    )}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  onScan={({ raw, moduleId, recordId }) => {
                    if (recordId && moduleId === field.relationConfig?.targetModule) {
                      onChange(recordId);
                      return;
                    }
                    const match = filteredOptions.find((opt: any) =>
                      String(opt.value) === raw || String(opt.label) === raw
                    );
                    if (match) onChange(match.value);
                  }}
                />
                {canQuickCreate && (
                  <Button
                    icon={<PlusOutlined />}
                    className="shrink-0"
                    onClick={() => setQuickCreateOpen(true)}
                    disabled={!forceEditMode || isReadonly}
                  />
                )}
              </div>
              {value && field.relationConfig?.targetModule && (
                <RelatedRecordPopover
                  moduleId={field.relationConfig.targetModule}
                  recordId={String(value)}
                  label={filteredOptions.find((opt: any) => opt.value === value)?.label || String(value)}
                >
                  <span className="text-xs text-leather-600 cursor-pointer hover:underline">
                    مشاهده سریع رکورد مرتبط
                  </span>
                </RelatedRecordPopover>
              )}
           </div>
        );

      case FieldType.DATE:
        return (
          <PersianDatePicker
            type="DATE"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب تاریخ"}
          />
        );

      case FieldType.TIME:
        return (
          <PersianDatePicker
            type="TIME"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب زمان"}
          />
        );

      case FieldType.DATETIME:
        return (
          <PersianDatePicker
            type="DATETIME"
            value={value}
            onChange={onChange}
            className="w-full"
            disabled={!forceEditMode}
            placeholder={compactMode ? undefined : "انتخاب تاریخ و زمان"}
          />
        );

      case FieldType.TAGS:
        if (recordId && moduleId) {
          return (
            <TagInput
              recordId={recordId}
              moduleId={moduleId}
              initialTags={value || []}
              onChange={onOptionsUpdate as any}
              {...({ disabled: !forceEditMode } as any)}
            />
          );
        }
        return <Input disabled placeholder="بعد از ذخیره، تگ‌ها قابل ویرایش است" />;

      case FieldType.IMAGE:
        return (
            <div className="flex flex-col gap-2">
              <Upload 
                  listType="picture-card" 
                  showUploadList={false} 
                  beforeUpload={(file) => { handleImageUpload(file); return false; }}
                  disabled={uploading || !forceEditMode || isReadonly}
                  fileList={[]}
              >
                  {uploading ? (
                    <div><LoadingOutlined /><div style={{ marginTop: 8 }}>...</div></div>
                  ) : value ? (
                    <img src={value} alt="avatar" style={{ width: '100%', borderRadius: 8 }} />
                  ) : (
                    <div><UploadOutlined /><div style={{ marginTop: 8 }}>آپلود</div></div>
                  )}
              </Upload>
              {moduleId === 'products' && (
                <>
                  <Button size="small" onClick={() => setIsGalleryOpen(true)} disabled={!forceEditMode}>
                    مدیریت تصاویر
                  </Button>
                  <ProductImagesManager
                    open={isGalleryOpen}
                    onClose={() => setIsGalleryOpen(false)}
                    productId={recordId}
                    mainImage={value}
                    onMainImageChange={(url) => onChange(url)}
                    canEdit={forceEditMode && !isReadonly}
                  />
                </>
              )}
            </div>
        );

      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} disabled={!forceEditMode || isReadonly} />;

      default:
        return (
          <Input
            {...commonProps}
            value={formatTextForInput(value)}
            onChange={e => onChange(normalizeDigitsToEnglish(e.target.value))}
          />
        );
    }
  };

  const canRelationQuickCreate = fieldType === FieldType.RELATION
    && !!field.relationConfig?.targetModule;

  if (compactMode) {
      return (
        <div className="w-full">
            {renderInputContent()}
            
            {canRelationQuickCreate && (
                <RelationQuickCreateInline 
                    open={quickCreateOpen}
                    label={fieldLabel}
                    fields={quickCreateFields}
                    form={quickCreateForm}
                    loading={quickCreateLoading}
                    relationOptions={quickCreateRelationOptions}
                    dynamicOptions={quickCreateDynamicOptions}
                    onCancel={closeQuickCreate}
                    onOk={handleQuickCreate}
                />
            )}
             <Modal 
                title="اسکن بارکد" 
                open={isScanModalOpen} 
                onCancel={() => setIsScanModalOpen(false)} 
                footer={null}
                zIndex={10000}
            >
                <Input 
                    autoFocus 
                    placeholder="کد را اسکن کنید..." 
                    value={scannedCode} 
                    onChange={e => setScannedCode(e.target.value)}
                    onPressEnter={handleScan} 
                    suffix={<QrcodeOutlined />}
                />
            </Modal>
        </div>
      );
  }

  const formItemProps: any = {
      label: fieldLabel,
      name: fieldKey,
      rules: [{ required: isRequired, message: 'الزامی است' }],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
  };

  return (
    <>
        <Form.Item {...formItemProps}>
            {renderInputContent()}
        </Form.Item>

        {canRelationQuickCreate && (
            <RelationQuickCreateInline 
                open={quickCreateOpen}
                label={fieldLabel}
                fields={quickCreateFields}
                form={quickCreateForm}
                loading={quickCreateLoading}
                relationOptions={quickCreateRelationOptions}
                dynamicOptions={quickCreateDynamicOptions}
                onCancel={closeQuickCreate}
                onOk={handleQuickCreate}
            />
        )}
        <Modal 
            title="اسکن بارکد" 
            open={isScanModalOpen} 
            onCancel={() => setIsScanModalOpen(false)} 
            footer={null}
            zIndex={10000}
        >
            <Input 
                autoFocus 
                placeholder="کد را اسکن کنید..." 
                value={scannedCode} 
                onChange={e => setScannedCode(e.target.value)}
                onPressEnter={handleScan} 
                suffix={<QrcodeOutlined />}
            />
        </Modal>
    </>
  );
};

export default SmartFieldRenderer;

interface QuickCreateProps {
  open: boolean;
  label: string;
  fields: ModuleField[];
  form: any;
  loading: boolean;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  onCancel: () => void;
  onOk: () => void;
}

export const RelationQuickCreateInline: React.FC<QuickCreateProps> = ({
  open,
  label,
  fields,
  form,
  loading,
  relationOptions,
  dynamicOptions,
  onCancel,
  onOk,
}) => {
  const renderQuickField = (field: ModuleField) => {
    const isDisabled = (field as any)?.readonly === true;
    const baseSelectProps = {
      showSearch: true,
      allowClear: true,
      optionFilterProp: 'label' as const,
      getPopupContainer: () => document.body,
      dropdownStyle: { zIndex: 5000 },
      className: 'w-full',
      disabled: isDisabled,
    };

    switch (field.type) {
      case FieldType.TEXT:
        return (
          <Input
            allowClear
            disabled={isDisabled}
            value={formatTextForInput(form.getFieldValue(field.key))}
            onChange={(e) => form.setFieldValue(field.key, normalizeDigitsToEnglish(e.target.value))}
          />
        );
      case FieldType.LONG_TEXT:
        return (
          <Input.TextArea
            rows={2}
            disabled={isDisabled}
            value={formatTextForInput(form.getFieldValue(field.key))}
            onChange={(e) => form.setFieldValue(field.key, normalizeDigitsToEnglish(e.target.value))}
          />
        );
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return (
          <InputNumber
            className="w-full persian-number"
            controls={false}
            disabled={isDisabled}
            stringMode
            inputMode="decimal"
            formatter={(val, info) => formatNumericForInput(info?.input ?? val, true)}
            parser={(val) => normalizeNumericString(val)}
          />
        );
      case FieldType.SELECT:
      case FieldType.STATUS: {
        const opts = field.dynamicOptionsCategory
          ? (dynamicOptions[field.dynamicOptionsCategory] || [])
          : (field.options || []);
        return <Select {...baseSelectProps} options={opts as any[]} />;
      }
      case FieldType.MULTI_SELECT: {
        const opts = field.dynamicOptionsCategory
          ? (dynamicOptions[field.dynamicOptionsCategory] || [])
          : (field.options || []);
        return <Select {...baseSelectProps} mode="multiple" options={opts as any[]} />;
      }
      case FieldType.RELATION:
        return <Select {...baseSelectProps} options={relationOptions[field.key] || []} />;
      case FieldType.DATE:
        return <Input placeholder="YYYY-MM-DD" disabled={isDisabled} />;
      case FieldType.TIME:
        return <Input placeholder="HH:mm" disabled={isDisabled} />;
      case FieldType.DATETIME:
        return <Input placeholder="YYYY-MM-DD HH:mm" disabled={isDisabled} />;
      case FieldType.CHECKBOX:
        return <Switch disabled={isDisabled} />;
      default:
        return (
          <Input
            allowClear
            disabled={isDisabled}
            value={formatTextForInput(form.getFieldValue(field.key))}
            onChange={(e) => form.setFieldValue(field.key, normalizeDigitsToEnglish(e.target.value))}
          />
        );
    }
  };

  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="افزودن"
      cancelText="انصراف"
      confirmLoading={loading}
      destroyOnClose
      zIndex={2000} 
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onOk}
        className="max-h-[60vh] overflow-y-auto pr-1"
      >
        {fields.map((field) => (
          <Form.Item
            key={field.key}
            name={field.key}
            label={field.labels?.fa || field.key}
            valuePropName={field.type === FieldType.CHECKBOX ? 'checked' : 'value'}
            rules={field.validation?.required ? [{ required: true, message: 'الزامی است' }] : undefined}
          >
            {renderQuickField(field)}
          </Form.Item>
        ))}
      </Form>
      <div className="text-xs text-gray-400 mt-1">
        فیلدهای کلیدی، هدر، الزامی و ستون‌های لیست برای ثبت سریع نمایش داده شده‌اند.
      </div>
    </Modal>
  );
};
