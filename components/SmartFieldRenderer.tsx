import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined, PlusOutlined } from '@ant-design/icons';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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
import RecordFilesManager from './RecordFilesManager';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { formatLocationValue, IRAN_BOUNDS, IRAN_CENTER, LocationLatLng, parseLocationValue } from '../utils/location';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '../utils/mapConfig';

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

const NAVIGATION_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

const SHORTCUT_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y']);
const NUMERIC_CHAR_PATTERN = /^[0-9\u06F0-\u06F9\u0660-\u0669.,\u066b\u066c-]$/;

const preventNonNumericKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
  const key = String(event.key || '');
  if (!key) return;

  if (NAVIGATION_KEYS.has(key)) return;

  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);
  if (ctrlOrMeta && SHORTCUT_KEYS.has(key.toLowerCase())) return;
  if (event.altKey) return;
  if (key.length > 1) return;

  if (!NUMERIC_CHAR_PATTERN.test(key)) {
    event.preventDefault();
  }
};

const preventNonNumericPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
  const raw = String(event.clipboardData?.getData('text') || '');
  if (!raw.trim()) return;
  const normalized = normalizeNumericString(raw);
  if (!normalized) {
    event.preventDefault();
  }
};

const formatTextForInput = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return toPersianNumber(normalizeDigitsToEnglish(raw));
};

const LocationMapEvents: React.FC<{ onPick: (value: LocationLatLng) => void }> = ({ onPick }) => {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
};

const LocationMapCenter: React.FC<{ center: LocationLatLng | null }> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 11), { animate: true });
  }, [map, center]);

  return null;
};

const LocationPickerMap: React.FC<{
  value: LocationLatLng | null;
  onChange: (value: LocationLatLng) => void;
}> = ({ value, onChange }) => {
  const center: [number, number] = value ? [value.lat, value.lng] : IRAN_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={value ? 12 : 5}
      minZoom={4}
      maxZoom={18}
      maxBounds={IRAN_BOUNDS}
      maxBoundsViscosity={1}
      style={{ width: '100%', height: 360, borderRadius: 12 }}
    >
      <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />
      <LocationMapEvents onPick={onChange} />
      <LocationMapCenter center={value} />
      {value && (
        <CircleMarker
          center={[value.lat, value.lng]}
          radius={7}
          pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2 }}
        />
      )}
    </MapContainer>
  );
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
  canViewFilesManager?: boolean;
  canEditFilesManager?: boolean;
  canDeleteFilesManager?: boolean;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false, canViewFilesManager = true, canEditFilesManager = true, canDeleteFilesManager = true
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
  const [isGlobalImageGalleryOpen, setIsGlobalImageGalleryOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState<LocationLatLng | null>(null);
  const [globalImageGalleryItems, setGlobalImageGalleryItems] = useState<Array<{
    id: string;
    url: string;
    label: string;
    createdAt: string | null;
  }>>([]);
  const [globalImageGalleryLoading, setGlobalImageGalleryLoading] = useState(false);
  const supportsFilesGallery = moduleId === 'products' || moduleId === 'production_orders' || moduleId === 'production_boms';
  const canShowFilesGallery = supportsFilesGallery && canViewFilesManager;

  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isProcessStagesFieldKey = (
    fieldKey === 'execution_process_draft' ||
    fieldKey === 'marketing_process_draft' ||
    fieldKey === 'template_stages_preview' ||
    fieldKey === 'run_stages_preview'
  );
  const isRequired = field?.validation?.required || false;
  const fieldOptions = field?.options || options || [];
  const isReadonly = field?.readonly === true || field?.nature === FieldNature.SYSTEM;
  const parsedLocation = useMemo(() => parseLocationValue(value), [value]);
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

  if (!compactMode && forceEditMode && field?.nature === FieldNature.SYSTEM && !isProcessStagesFieldKey) {
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
      const modulePath = moduleId || 'misc';
      const recordPath = recordId || 'draft';
      const filePath = `record_files/${modulePath}/${recordPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

      if (recordId && moduleId) {
        const { error: fileInsertError } = await supabase
          .from('record_files')
          .insert([
            {
              module_id: moduleId,
              record_id: recordId,
              file_url: publicUrl,
              file_type: 'image',
              file_name: file.name || null,
              mime_type: file.type || null,
            },
          ]);
        if (fileInsertError) {
          console.warn('Could not append file entry after image upload', fileInsertError);
        }
      }

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

  const loadGlobalImageGallery = async () => {
    setGlobalImageGalleryLoading(true);
    try {
      const [recordFilesResult, legacyImagesResult] = await Promise.allSettled([
        supabase
          .from('record_files')
          .select('id, module_id, record_id, file_url, file_name, mime_type, file_type, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('product_images')
          .select('id, product_id, image_url, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      const isImageByUrl = (url: unknown) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(String(url || ''));
      const recordFilesRes = recordFilesResult.status === 'fulfilled' ? recordFilesResult.value : null;
      const legacyImagesRes = legacyImagesResult.status === 'fulfilled' ? legacyImagesResult.value : null;

      const recordFileRows = Array.isArray(recordFilesRes?.data) ? recordFilesRes?.data : [];
      const recordFileItems = recordFileRows
        .filter((row: any) => {
          const fileType = String(row?.file_type || '').toLowerCase();
          const mimeType = String(row?.mime_type || '').toLowerCase();
          return fileType === 'image' || mimeType.startsWith('image/') || isImageByUrl(row?.file_url);
        })
        .map((row: any, index: number) => ({
          id: `rf_${row?.id || index}`,
          url: String(row?.file_url || ''),
          label: String(row?.file_name || row?.module_id || 'تصویر'),
          createdAt: row?.created_at ? String(row.created_at) : null,
        }))
        .filter((row: any) => !!row.url);

      const legacyRows = Array.isArray(legacyImagesRes?.data) ? legacyImagesRes?.data : [];
      const legacyItems = legacyRows
        .map((row: any, index: number) => ({
          id: `legacy_${row?.id || index}`,
          url: String(row?.image_url || ''),
          label: `محصول ${String(row?.product_id || '').slice(0, 8) || '-'}`,
          createdAt: row?.created_at ? String(row.created_at) : null,
        }))
        .filter((row: any) => !!row.url);

      const merged = [...recordFileItems, ...legacyItems]
        .sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));

      const deduped: Array<{ id: string; url: string; label: string; createdAt: string | null }> = [];
      const seen = new Set<string>();
      merged.forEach((item) => {
        if (!item.url || seen.has(item.url)) return;
        seen.add(item.url);
        deduped.push(item);
      });

      setGlobalImageGalleryItems(deduped);
      if (!deduped.length && (recordFilesRes?.error || legacyImagesRes?.error)) {
        msg.warning('تصویری برای انتخاب از گالری پیدا نشد');
      }
    } catch (error) {
      console.warn('Could not load global image gallery', error);
      msg.error('خطا در دریافت تصاویر گالری');
      setGlobalImageGalleryItems([]);
    } finally {
      setGlobalImageGalleryLoading(false);
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

    const isProcessDraftField = isProcessStagesFieldKey;
    const isProcessModule = (
      moduleId === 'projects' ||
      moduleId === 'marketing_leads' ||
      moduleId === 'process_templates' ||
      moduleId === 'process_runs'
    );
    if (isProcessDraftField && isProcessModule) {
      const nextDraftStages = Array.isArray(value)
        ? value
        : (Array.isArray((allValues as any)?.[fieldKey]) ? (allValues as any)[fieldKey] : []);
      const allowTemplateStageEdit = moduleId === 'process_templates' && fieldKey === 'template_stages_preview';
      return (
        <ProductionStagesField
          recordId={recordId}
          moduleId={moduleId}
          readOnly={!forceEditMode || (isReadonly && !allowTemplateStageEdit)}
          compact={compactMode}
          draftStages={nextDraftStages}
          onDraftStagesChange={(stages) => onChange(stages)}
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
    const imageSourceMode = String((field as any)?.imageSourceMode || '').toLowerCase();

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
                onKeyDown={preventNonNumericKeyDown}
                onPaste={preventNonNumericPaste}
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
                styles={{ popup: { root: { zIndex: 4000 } } }}
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
                styles={{ popup: { root: { zIndex: 4000 } } }}
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
                    styles={{ popup: { root: { zIndex: 4000, minWidth: 320 } } }}
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    popupRender={(menu) => (
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

      case FieldType.LOCATION:
        return (
          <div className="flex flex-col gap-2">
            <Input
              {...commonProps}
              placeholder={compactMode ? undefined : "مثال: 35.6892, 51.3890"}
              value={formatTextForInput(value)}
              onChange={(e) => onChange(normalizeDigitsToEnglish(e.target.value))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                onClick={() => {
                  setLocationDraft(parsedLocation);
                  setIsLocationPickerOpen(true);
                }}
                disabled={!forceEditMode || isReadonly}
              >
                انتخاب روی نقشه
              </Button>
              {!!value && (
                <Button
                  size="small"
                  danger
                  onClick={() => onChange(null)}
                  disabled={!forceEditMode || isReadonly}
                >
                  حذف موقعیت
                </Button>
              )}
              {parsedLocation && (
                <Tag color="blue">{formatLocationValue(parsedLocation, 5)}</Tag>
              )}
            </div>
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
        if (imageSourceMode === 'gallery') {
          return (
            <div className="flex flex-col gap-2">
              {value ? (
                <img src={String(value)} alt="image" style={{ width: '100%', borderRadius: 8, border: '1px solid #f0f0f0', maxHeight: 120, objectFit: 'cover' }} />
              ) : (
                <div className="h-16 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">
                  تصویری انتخاب نشده است
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  onClick={() => {
                    setIsGlobalImageGalleryOpen(true);
                    void loadGlobalImageGallery();
                  }}
                  disabled={!forceEditMode || isReadonly}
                >
                  انتخاب از گالری
                </Button>
                {!!value && (
                  <Button
                    size="small"
                    danger
                    onClick={() => onChange(null)}
                    disabled={!forceEditMode || isReadonly}
                  >
                    حذف تصویر
                  </Button>
                )}
              </div>
            </div>
          );
        }
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
              {canShowFilesGallery && (
                <>
                  <Button size="small" onClick={() => setIsGalleryOpen(true)}>
                    گالری
                  </Button>
                  <RecordFilesManager
                    open={isGalleryOpen}
                    onClose={() => setIsGalleryOpen(false)}
                    moduleId={String(moduleId || '')}
                    recordId={recordId}
                    mainImage={value}
                    onMainImageChange={(url) => onChange(url)}
                    canEdit={!!canEditFilesManager && !!forceEditMode && !isReadonly}
                    canDelete={!!canDeleteFilesManager && !!forceEditMode && !isReadonly}
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
  const globalImageGalleryModalNode = (
    <Modal
      title="انتخاب تصویر از گالری"
      open={isGlobalImageGalleryOpen}
      onCancel={() => setIsGlobalImageGalleryOpen(false)}
      footer={null}
      width={980}
      zIndex={12000}
      destroyOnHidden
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          تصویر موردنظر را انتخاب کنید.
        </div>
        <Button
          size="small"
          onClick={() => {
            void loadGlobalImageGallery();
          }}
          loading={globalImageGalleryLoading}
        >
          بروزرسانی
        </Button>
      </div>
      {globalImageGalleryLoading ? (
        <div className="h-44 flex items-center justify-center text-gray-500 text-sm gap-2">
          <LoadingOutlined />
          در حال بارگذاری...
        </div>
      ) : globalImageGalleryItems.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-gray-400 text-sm">
          تصویری در گالری یافت نشد.
        </div>
      ) : (
        <div className="max-h-[62vh] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {globalImageGalleryItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-lg border border-gray-200 overflow-hidden bg-white text-right hover:border-leather-400 transition-colors"
              onClick={() => {
                onChange(item.url);
                setIsGlobalImageGalleryOpen(false);
              }}
            >
              <img src={item.url} alt={item.label || 'image'} className="w-full h-28 object-cover" />
              <div className="px-2 py-1 text-[11px] text-gray-600 truncate">{item.label || 'تصویر'}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );

  const hasConfiguredTiles = Boolean(import.meta.env.VITE_MAP_TILE_URL);
  const locationPickerModalNode = (
    <Modal
      title="انتخاب موقعیت روی نقشه"
      open={isLocationPickerOpen}
      onCancel={() => setIsLocationPickerOpen(false)}
      width={900}
      zIndex={12000}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={() => setIsLocationPickerOpen(false)}>
          انصراف
        </Button>,
        <Button
          key="clear"
          onClick={() => {
            setLocationDraft(null);
            onChange(null);
            setIsLocationPickerOpen(false);
          }}
          disabled={!forceEditMode || isReadonly}
        >
          پاک کردن
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={() => {
            if (!locationDraft) return;
            onChange(formatLocationValue(locationDraft));
            setIsLocationPickerOpen(false);
          }}
          disabled={!locationDraft || !forceEditMode || isReadonly}
        >
          ثبت موقعیت
        </Button>,
      ]}
    >
      {!hasConfiguredTiles && (
        <div className="mb-3 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-900 border border-yellow-300">
          برای استفاده در محیط داخلی، مقدار `VITE_MAP_TILE_URL` را روی tile server خودتان تنظیم کنید.
        </div>
      )}
      <div className="mb-2 text-xs text-gray-500">
        با کلیک روی نقشه موقعیت ثبت می‌شود.
      </div>
      <LocationPickerMap value={locationDraft} onChange={setLocationDraft} />
      <div className="mt-2 text-xs text-gray-500">
        موقعیت انتخاب‌شده:
        <span className="font-semibold mr-1">
          {locationDraft ? formatLocationValue(locationDraft, 6) : "انتخاب نشده"}
        </span>
      </div>
    </Modal>
  );

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
            {globalImageGalleryModalNode}
            {locationPickerModalNode}
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
        {globalImageGalleryModalNode}
        {locationPickerModalNode}
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
      styles: { popup: { root: { zIndex: 5000 } } },
      className: 'w-full',
      disabled: isDisabled,
    };

    switch (field.type) {
      case FieldType.TEXT:
        return (
          <Input
            allowClear
            disabled={isDisabled}
          />
        );
      case FieldType.LONG_TEXT:
        return (
          <Input.TextArea
            rows={2}
            disabled={isDisabled}
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
            onKeyDown={preventNonNumericKeyDown}
            onPaste={preventNonNumericPaste}
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
        return <PersianDatePicker type="DATE" disabled={isDisabled} />;
      case FieldType.TIME:
        return <PersianDatePicker type="TIME" disabled={isDisabled} />;
      case FieldType.DATETIME:
        return <PersianDatePicker type="DATETIME" disabled={isDisabled} />;
      case FieldType.CHECKBOX:
        return <Switch disabled={isDisabled} />;
      default:
        return (
          <Input
            allowClear
            disabled={isDisabled}
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
      destroyOnHidden
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
