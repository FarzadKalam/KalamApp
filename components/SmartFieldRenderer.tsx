import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button, Space } from 'antd';
import {
  UploadOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  PlusOutlined,
  EllipsisOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PushpinOutlined,
  SaveOutlined,
  TeamOutlined,
  UserOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import maplibregl from 'maplibre-gl';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import DynamicSelectField from './DynamicSelectField';
import AdaptiveSelectField from './AdaptiveSelectField';
import TagInput from './TagInput';
import ProductionStagesField from './ProductionStagesField';
import PersianDatePicker from './PersianDatePicker';
import RelatedRecordPopover from './RelatedRecordPopover';
import QrScanPopover from './QrScanPopover';
import RecordFilesManager from './RecordFilesManager';
import PhoneFieldInput from './PhoneFieldInput';
import PhoneActionsPopover from './PhoneActionsPopover';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { formatLocationValue, IRAN_BOUNDS, IRAN_CENTER, LocationLatLng, parseLocationValue } from '../utils/location';
import { buildMapStyle, buildMapTransformRequest, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL, sanitizeMapStyle } from '../utils/mapConfig';
import { attachMissingMapImageFallback, ensureMapLibreRTLTextPlugin } from '../utils/maplibreRuntime';
import { createThemeMapPinElement } from '../utils/mapPin';
import { isAutoNameEnabled, normalizeAutoNameEnabled } from '../utils/autoName';
import { useCurrencyConfig } from '../utils/currency';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { getSafeOptionFallback } from '../utils/optionHelpers';
import { fetchCurrentUserRolePermissions, resolveReadyTextPermissions } from '../utils/permissions';
import { fetchAssigneeDirectory, fetchDynamicOptionsByCategory } from '../utils/referenceData';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../utils/systemCode';
import { getPreferredRelationTargetField } from '../utils/relationTargetField';
import { fetchRelationOptionsForField, RELATION_DEFAULT_LIMIT } from '../utils/relationOptions';
import { mergeSelectOptions } from '../utils/selectOptions';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import { buildResolvedAssigneeCombo } from '../utils/assigneeValue';
import { supportsGlobalAssignee, supportsGlobalAssigneeType, supportsGlobalRoleAssignee } from '../utils/assigneeSupport';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { resolveConfiguredDefaultValue } from '../utils/defaultValues';
import { getProcessTemplateModuleOptions } from '../utils/workflowHelpers';
import { normalizeProcessTargetModuleIds } from '../utils/processTargets';
import { fetchTaskSourceRecordOptions, getTaskModuleOptions, normalizeTaskSourceValues } from '../utils/taskMeta';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { buildImagePreviewUrl } from '../utils/imagePreview';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { createFileManagerOriginForUpload, detectFileManagerTables } from '../utils/fileManagerService';
import {
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveOverlayPopupContainer,
  resolveSelectPopupContainer,
} from '../utils/popupContainer';

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const isDuplicateSystemCodeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '23505' && text.includes('system_code');
};

const isStatementTimeoutError = (error: any) => {
  const code = String(error?.code || '').trim();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '57014' || text.includes('statement timeout');
};

const formatDisplayText = (rawValue: any, fallback = '-'): string => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;
  if (Array.isArray(rawValue)) {
    const parts = rawValue
      .map((item) => formatDisplayText(item, ''))
      .map((item) => item.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts.join('، ') : fallback;
  }
  if (typeof rawValue === 'object') {
    const candidate = (
      rawValue.title
      ?? rawValue.label
      ?? rawValue.name
      ?? rawValue.full_name
      ?? rawValue.business_name
      ?? rawValue.legal_name
      ?? rawValue.system_code
      ?? rawValue.value
      ?? rawValue.id
    );
    if (candidate !== rawValue && candidate !== null && candidate !== undefined && candidate !== '') {
      return formatDisplayText(candidate, fallback);
    }
    try {
      const serialized = JSON.stringify(rawValue);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }
  const normalized = String(rawValue).trim();
  return normalized || fallback;
};

const formatPersianDisplayText = (rawValue: any, fallback = '-') => {
  const text = formatDisplayText(rawValue, fallback);
  return text ? toPersianNumber(text) : fallback;
};

const isMissingAuditColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42703'
    || code === 'PGRST204'
    || text.includes('created_by')
    || text.includes('updated_by')
  );
};

const isMissingColumnLikeError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST200') return true;
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const extractMissingColumnName = (error: any): string | null => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (!text) return null;
  const patterns = [
    /column\s+"([^"]+)"/i,
    /column\s+'([^']+)'/i,
    /could not find the\s+'([^']+)'\s+column/i,
    /([a-z0-9_]+)\s+does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return null;
};

const omitColumnIfPresent = (payload: Record<string, any>, column: string | null) => {
  if (!column) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, column)) return payload;
  const next = { ...payload };
  delete next[column];
  return next;
};

const createQuickCreateUserError = (message: string) =>
  Object.assign(new Error(message), { userFacing: true });

const buildMinimalSupplierPayload = (payload: Record<string, any>) => {
  const allowedKeys = new Set([
    'business_name',
    'first_name',
    'last_name',
    'mobile_1',
    'mobile_2',
    'phone',
    'prefix',
    'province',
    'city',
    'address',
    'location',
    'website',
    'supply_type',
    'rank',
    'image_url',
    'created_by',
    'updated_by',
    'system_code',
  ]);
  return Object.keys(payload || {}).reduce<Record<string, any>>((acc, key) => {
    if (!allowedKeys.has(key)) return acc;
    acc[key] = payload[key];
    return acc;
  }, {});
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

const resolveFormatterSourceValue = (inputValue: any, currentValue: any) => {
  if (inputValue === '' && currentValue !== null && currentValue !== undefined && String(currentValue) !== '') {
    return currentValue;
  }
  return inputValue ?? currentValue;
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

const LocationPickerMap: React.FC<{
  value: LocationLatLng | null;
  onChange: (value: LocationLatLng) => void;
}> = ({ value, onChange }) => {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markerRef = React.useRef<maplibregl.Marker | null>(null);
  const mapMaxZoom = Math.max(MAP_MAX_ZOOM, 18);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
    const center: [number, number] = value ? [value.lng, value.lat] : [IRAN_CENTER[1], IRAN_CENTER[0]];
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const rasterFallbackStyle = buildRasterStyle();
    let fallbackApplied = false;

    ensureMapLibreRTLTextPlugin();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: (useRemoteStyle ? rasterFallbackStyle : buildMapStyle()) as any,
      transformRequest: buildMapTransformRequest() as any,
      center,
      zoom: value ? 12 : 5,
      minZoom: 4,
      maxZoom: mapMaxZoom,
      maxBounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      attributionControl: {},
    });

    mapRef.current = map;
    map.on('load', () => {
      map.resize();
      window.requestAnimationFrame(() => map.resize());
      window.setTimeout(() => map.resize(), 220);
    });
    attachMissingMapImageFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-left'
    );
    map.on('error', (event: any) => {
      if (!useRemoteStyle || fallbackApplied) return;
      const message = String(event?.error?.message || event?.error || '').toLowerCase();
      if (!message) return;

      const shouldFallback =
        message.includes('failed to fetch') ||
        message.includes('ajaxerror') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('err_connection') ||
        message.includes('style');

      if (!shouldFallback) return;

      fallbackApplied = true;
      map.setStyle(rasterFallbackStyle as any, { diff: false } as any);
    });
    if (useRemoteStyle) {
      map.setStyle(MAP_STYLE_URL, { diff: false, transformStyle: sanitizeMapStyle } as any);
    }
    map.on('click', (event) => {
      onChange({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapMaxZoom, onChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat: [number, number] = [value.lng, value.lat];
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 11), duration: 400 });

    if (!markerRef.current) {
      const markerElement = createThemeMapPinElement({ interactive: false, size: 'md' });
      markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
      return;
    }

    markerRef.current.setLngLat(lngLat);
  }, [value]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: 360, borderRadius: 12 }} />;
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
  disableRequired?: boolean;
  overlayZIndexBase?: number;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
}

type ReadyTextItem = {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
};

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false, canViewFilesManager = true, canEditFilesManager = true, canDeleteFilesManager = true, disableRequired = false, overlayZIndexBase = 1400, popupContainer
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
  const [isLongTextExpanded, setIsLongTextExpanded] = useState(false);
  const [readyTextsOpen, setReadyTextsOpen] = useState(false);
  const [readyTextsLoading, setReadyTextsLoading] = useState(false);
  const [addingReadyText, setAddingReadyText] = useState(false);
  const [readyTexts, setReadyTexts] = useState<ReadyTextItem[]>([]);
  const [newReadyTextTitle, setNewReadyTextTitle] = useState('');
  const [newReadyTextContent, setNewReadyTextContent] = useState('');
  const [editingReadyTextId, setEditingReadyTextId] = useState<string | null>(null);
  const [editingReadyTextTitle, setEditingReadyTextTitle] = useState('');
  const [editingReadyTextContent, setEditingReadyTextContent] = useState('');
  const [updatingReadyText, setUpdatingReadyText] = useState(false);
  const [deletingReadyTextId, setDeletingReadyTextId] = useState<string | null>(null);
  const [relationLiveOptions, setRelationLiveOptions] = useState<any[]>([]);
  const [relationExactOption, setRelationExactOption] = useState<any | null>(null);
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationSearchQuery, setRelationSearchQuery] = useState('');
  const relationSearchTimerRef = useRef<number | null>(null);
  const relationRequestVersionRef = useRef(0);
  const relationPendingCountRef = useRef(0);
  const missingExactRelationValueRef = useRef<string | null>(null);
  const [readyTextPermissions, setReadyTextPermissions] = useState({
    canView: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
  });
  const readyTextPinStorageKey = useMemo(
    () => `kalamapp.ready_text_pins.${moduleId || 'global'}.${field.key || 'field'}`,
    [field.key, moduleId]
  );
  const readPinnedReadyTextIds = () => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const raw = window.localStorage.getItem(readyTextPinStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(
        Array.isArray(parsed)
          ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
          : []
      );
    } catch {
      return new Set<string>();
    }
  };
  const sortReadyTexts = (items: ReadyTextItem[]) =>
    [...items].sort((left, right) => {
      const pinnedDelta = Number(Boolean(right?.pinned)) - Number(Boolean(left?.pinned));
      if (pinnedDelta !== 0) return pinnedDelta;
      return String(left?.title || '').localeCompare(String(right?.title || ''), 'fa');
    });
  const [globalImageGalleryItems, setGlobalImageGalleryItems] = useState<Array<{
    id: string;
    url: string;
    label: string;
    createdAt: string | null;
  }>>([]);
  const [globalImageGalleryLoading, setGlobalImageGalleryLoading] = useState(false);
  const supportsFilesGallery = Boolean(moduleId && recordId);
  const canShowFilesGallery = supportsFilesGallery && canViewFilesManager;
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  const selectPopupZIndex = overlayZIndexBase;
  const modalOverlayZIndex = overlayZIndexBase + 10;
  const scanModalZIndex = overlayZIndexBase + 15;
  const quickCreateModalZIndex = overlayZIndexBase + 20;
  const selectPlacement = 'bottomRight' as const;
  const selectPopupContainer = popupContainer || resolveSelectPopupContainer;

  useEffect(() => {
    let cancelled = false;

    const loadPermissions = async () => {
      try {
        const permissions = await fetchCurrentUserRolePermissions(supabase);
        if (cancelled) return;
        setReadyTextPermissions(resolveReadyTextPermissions(permissions, moduleId));
      } catch {
        if (!cancelled) {
          setReadyTextPermissions(resolveReadyTextPermissions(null, moduleId));
        }
      }
    };

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const fieldLabel = getFieldLabelFa(field, { moduleId, fallback: label || 'بدون نام' });
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isLongTextField = fieldType === FieldType.LONG_TEXT || fieldType === FieldType.SUPER_LONG_TEXT;
  const isSuperLongTextField = fieldType === FieldType.SUPER_LONG_TEXT;
  const formattedLongTextValue = isLongTextField ? formatTextForInput(value) : '';
  const [longTextDraftValue, setLongTextDraftValue] = useState(formattedLongTextValue);
  const longTextDraftValueRef = useRef(formattedLongTextValue);
  const longTextFocusedRef = useRef(false);
  const longTextComposingRef = useRef(false);
  const longTextCommitTimerRef = useRef<number | null>(null);
  const lastCommittedLongTextValueRef = useRef(normalizeDigitsToEnglish(formattedLongTextValue));
  const onChangeRef = useRef(onChange);
  const { label: currencyLabel } = useCurrencyConfig();
  const getProtectedDynamicValues = (dynamicCategory?: string) => (
    ['main_unit', 'task_type'].includes(String(dynamicCategory || '').trim())
      ? (field.options || []).map((item: any) => String(item?.value || '')).filter(Boolean)
      : []
  );
  const normalizedLongTextValue = isLongTextField ? String(value || '').trim() : '';
  const longTextLineCount = normalizedLongTextValue ? normalizedLongTextValue.split(/\r?\n/).length : 0;
  const shouldShowLongTextToggle = isLongTextField
    && (
      normalizedLongTextValue.length > (isSuperLongTextField ? 280 : 220)
      || longTextLineCount > (isSuperLongTextField ? 5 : 4)
    );
  const collapsedLongTextMaxHeightClass = isSuperLongTextField ? 'max-h-40' : 'max-h-28';
  const collapsedLongTextMinRows = isSuperLongTextField ? 6 : 4;
  const expandedLongTextMaxRows = isSuperLongTextField ? 24 : 16;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isLongTextField) return;
    const normalizedValue = normalizeDigitsToEnglish(formattedLongTextValue);
    lastCommittedLongTextValueRef.current = normalizedValue;
    if (!longTextFocusedRef.current && !longTextComposingRef.current && longTextDraftValueRef.current !== formattedLongTextValue) {
      longTextDraftValueRef.current = formattedLongTextValue;
      setLongTextDraftValue(formattedLongTextValue);
    }
  }, [formattedLongTextValue, isLongTextField]);

  useEffect(() => () => {
    if (longTextCommitTimerRef.current !== null) {
      window.clearTimeout(longTextCommitTimerRef.current);
      longTextCommitTimerRef.current = null;
    }
  }, []);

  const commitLongTextValue = useCallback((nextValue: string, immediate = false) => {
    const normalizedValue = normalizeDigitsToEnglish(nextValue);
    const runCommit = () => {
      longTextCommitTimerRef.current = null;
      if (lastCommittedLongTextValueRef.current === normalizedValue) return;
      lastCommittedLongTextValueRef.current = normalizedValue;
      onChangeRef.current(normalizedValue);
    };

    if (longTextCommitTimerRef.current !== null) {
      window.clearTimeout(longTextCommitTimerRef.current);
      longTextCommitTimerRef.current = null;
    }

    if (immediate) {
      runCommit();
      return;
    }

    longTextCommitTimerRef.current = window.setTimeout(runCommit, 180);
  }, []);

  const renderSelectOption = (option: any) => {
    const data = option?.data || option;
    const tagLabel = String(data?.tagLabel || '').trim();
    const tagColor = String(data?.tagColor || '').trim() || 'default';
    const optionLabel = String(data?.label || '').trim() || getSafeOptionFallback(data?.value, '-');
    if (!tagLabel) return <span>{optionLabel}</span>;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Tag color={tagColor} style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px', paddingInline: 6 }}>
          {tagLabel}
        </Tag>
        <span className="truncate">{optionLabel}</span>
      </div>
    );
  };
  const isProcessStagesFieldKey = (
    fieldKey === 'execution_process_draft' ||
    fieldKey === 'marketing_process_draft' ||
    fieldKey === 'template_stages_preview' ||
    fieldKey === 'run_stages_preview'
  );
  const isRequired = !disableRequired && (field?.validation?.required || false);
  const fieldOptions = (
    ((moduleId === 'process_templates' && (field?.key === 'module_id' || field?.key === 'module_ids'))
      || (moduleId === 'process_runs' && field?.key === 'module_id'))
      ? getProcessTemplateModuleOptions()
      : moduleId === 'tasks' && field?.key === 'related_to_module'
        ? getTaskModuleOptions()
      : (options || field?.options || [])
  );
  const relationResolvedOptions = useMemo(() => {
    const merged = mergeSelectOptions(fieldOptions as any[], relationLiveOptions as any[]);
    return relationExactOption
      ? mergeSelectOptions(merged as any[], [relationExactOption] as any[])
      : merged;
  }, [fieldOptions, relationExactOption, relationLiveOptions]);
  const isReadonly = field?.readonly === true || field?.nature === FieldNature.SYSTEM;
  const parsedLocation = useMemo(() => parseLocationValue(value), [value]);
  const relationConfigAny = field.relationConfig as any;
  const isTaskSourceRecordField = moduleId === 'tasks' && field?.key === 'source_record_id';
  const resolvedRelationTargetModuleId = (
    isTaskSourceRecordField
      ? String(allValues?.related_to_module || allValues?.source_module_id || '').trim()
      : String(relationConfigAny?.targetModule || '').trim()
  ) || undefined;
  const relationBaseKey = fieldKey.endsWith('_id') ? fieldKey.slice(0, -3) : fieldKey;
  const quickCreateTargetModuleId = resolvedRelationTargetModuleId;
  const quickCreateTargetModule = quickCreateTargetModuleId ? MODULES[quickCreateTargetModuleId] : undefined;
  const canUseRelationQuickCreate = !!quickCreateTargetModuleId
    && !!quickCreateTargetModule
    && quickCreateTargetModule.disableCreate !== true
    && quickCreateTargetModule.systemManaged !== true
    && relationConfigAny?.disableQuickCreate !== true;
  const resolveRelationDisplayLabel = useCallback(() => {
    const matchedOption = relationResolvedOptions.find((item: any) => String(item?.value) === String(value))
      || (fieldOptions as any[]).find((item: any) => String(item?.value) === String(value));
    if (matchedOption?.label) {
      return String(matchedOption.label);
    }

    const rawCandidates = [
      allValues?.[`${fieldKey}_label`],
      allValues?.[`${fieldKey}_name`],
      allValues?.[`${fieldKey}_title`],
      allValues?.[`${fieldKey}_full_name`],
      allValues?.[`${fieldKey}_business_name`],
      allValues?.[`${fieldKey}_system_code`],
      allValues?.[`${relationBaseKey}_label`],
      allValues?.[`${relationBaseKey}_name`],
      allValues?.[`${relationBaseKey}_title`],
      allValues?.[`${relationBaseKey}_full_name`],
      allValues?.[`${relationBaseKey}_business_name`],
      allValues?.[`${relationBaseKey}_legal_name`],
      allValues?.[`${relationBaseKey}_system_code`],
    ];

    const relationValue = relationBaseKey ? allValues?.[relationBaseKey] : null;
    if (relationValue !== null && relationValue !== undefined && typeof relationValue !== 'object') {
      rawCandidates.push(relationValue);
    }

    const relationObject = relationValue && typeof relationValue === 'object' ? relationValue : null;
    if (relationObject && typeof relationObject === 'object') {
      rawCandidates.push(
        relationObject?.label,
        relationObject?.name,
        relationObject?.title,
        relationObject?.full_name,
        relationObject?.business_name,
        relationObject?.legal_name,
        relationObject?.system_code,
      );
    }

    const targetField = String(relationConfigAny?.targetField || '').trim();
    if (targetField) {
      rawCandidates.push(allValues?.[`${relationBaseKey}_${targetField}`]);
      if (relationObject && typeof relationObject === 'object') {
        rawCandidates.push(relationObject?.[targetField]);
      }
    }

    const resolvedCandidate = rawCandidates
      .map((item) => formatDisplayText(item, '').trim())
      .find(Boolean);

    return getSafeOptionFallback(resolvedCandidate || relationExactOption?.label || value);
  }, [allValues, fieldKey, fieldOptions, relationBaseKey, relationConfigAny?.targetField, relationExactOption?.label, relationResolvedOptions, value]);
  const configuredQuickCreateKeys = useMemo(
    () =>
      Array.isArray(relationConfigAny?.quickCreateFieldKeys)
        ? relationConfigAny.quickCreateFieldKeys
            .map((item: any) => String(item || '').trim())
            .filter(Boolean)
        : [],
    [relationConfigAny?.quickCreateFieldKeys]
  );
  const configuredQuickCreateDefaults = useMemo(
    () =>
      relationConfigAny?.quickCreateDefaults && typeof relationConfigAny.quickCreateDefaults === 'object'
        ? relationConfigAny.quickCreateDefaults
        : {},
    [relationConfigAny?.quickCreateDefaults]
  );
  const quickCreateTargetField = useMemo(() => {
    const configured = relationConfigAny?.targetField;
    if (configured) {
      return getPreferredRelationTargetField(quickCreateTargetModuleId, configured);
    }
    const moduleFields = quickCreateTargetModule?.fields || [];
    const preferredKeys = ['name', 'title', 'full_name', 'business_name', 'shelf_number', 'system_code'];
    const preferredField = moduleFields.find((f: any) => preferredKeys.includes(String(f?.key || '')));
    if (preferredField?.key) return String(preferredField.key);
    const headerField = moduleFields.find((f: any) => f?.location === 'header');
    if (headerField?.key) return String(headerField.key);
    return getPreferredRelationTargetField(quickCreateTargetModuleId, null);
  }, [quickCreateTargetModuleId, relationConfigAny?.targetField, quickCreateTargetModule]);
  const quickCreateAutoNameToggleField = useMemo(
    () => quickCreateTargetModule?.fields?.find((f: any) => String(f?.key || '') === 'auto_name_enabled') as ModuleField | undefined,
    [quickCreateTargetModule]
  );
  const quickCreateHasAutoNameToggle = !!quickCreateAutoNameToggleField
    && (quickCreateTargetModuleId === 'products' || quickCreateTargetModuleId === 'production_orders' || quickCreateTargetModuleId === 'customers');

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
        if (configuredQuickCreateKeys.length === 0) return true;
        return configuredQuickCreateKeys.includes(String(f?.key || ''));
      })
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
  }, [configuredQuickCreateKeys, quickCreateTargetField, quickCreateTargetModule]);
  const getQuickCreateFieldValueLabel = (fieldKey: string, rawValue: any) => {
    if (rawValue === undefined || rawValue === null) return '';
    const targetField = quickCreateTargetModule?.fields?.find((item: any) => String(item?.key || '') === fieldKey);
    if (!targetField) return String(rawValue);

    const resolveOptionLabel = (singleValue: any) => {
      if (singleValue === undefined || singleValue === null) return '';
      let matchedOption = (targetField.options || []).find((item: any) => item?.value === singleValue);
      if (matchedOption) return formatDisplayText(matchedOption.label, '');
      if (targetField.dynamicOptionsCategory) {
        matchedOption = (quickCreateDynamicOptions[targetField.dynamicOptionsCategory] || []).find((item: any) => item?.value === singleValue);
        if (matchedOption) return formatDisplayText(matchedOption.label, '');
      }
      if (targetField.type === FieldType.RELATION) {
        const matchedRelation = (quickCreateRelationOptions[fieldKey] || []).find((item: any) => item?.value === singleValue);
        if (matchedRelation) return formatDisplayText(matchedRelation.label, '');
      }
      return String(singleValue);
    };

    if (Array.isArray(rawValue)) {
      return rawValue.map((item) => resolveOptionLabel(item)).filter(Boolean).join('، ');
    }
    return resolveOptionLabel(rawValue);
  };
  const buildQuickCreateAutoProductName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const normalizeDimension = (raw: any) => {
      if (raw === null || raw === undefined) return '';
      const text = String(raw).trim();
      if (!text) return '';
      const numeric = parseFloat(text);
      if (!Number.isFinite(numeric)) return text;
      return String(numeric).replace(/\.0+$/, '');
    };

    const productType = String(values?.product_type || '').trim().toLowerCase();
    if (productType === 'goods') {
      addPart(getQuickCreateFieldValueLabel('category', values?.category));
      addPart(getQuickCreateFieldValueLabel('goods_subgroup', values?.goods_subgroup));
    } else if (productType === 'service') {
      addPart(getQuickCreateFieldValueLabel('product_category', values?.product_category));
      addPart(getQuickCreateFieldValueLabel('service_subgroup', values?.service_subgroup));
    } else {
      addPart(getQuickCreateFieldValueLabel('category', values?.category));
      addPart(getQuickCreateFieldValueLabel('product_category', values?.product_category));
    }

    addPart(getQuickCreateFieldValueLabel('material_type', values?.material_type));
    addPart(getQuickCreateFieldValueLabel('brand_name', values?.brand_name));
    addPart(getQuickCreateFieldValueLabel('color_name', values?.color_name));
    addPart(getQuickCreateFieldValueLabel('feature_name', values?.feature_name));
    addPart(getQuickCreateFieldValueLabel('quality_level', values?.quality_level));

    const explicitSize = getQuickCreateFieldValueLabel('size_value', values?.size_value);
    const lengthValue = normalizeDimension(values?.length_value);
    const widthValue = normalizeDimension(values?.width_value);
    if (lengthValue && widthValue) {
      addPart(`${lengthValue}X${widthValue}`);
    } else if (lengthValue) {
      addPart(`طول ${lengthValue}`);
    } else if (widthValue) {
      addPart(`عرض ${widthValue}`);
    } else {
      addPart(explicitSize);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  const buildQuickCreateAutoCustomerName = (values: any) => {
    const normalize = (input: any) => String(input ?? '').replace(/\s+/g, ' ').trim();
    const businessName = normalize(values?.business_name);
    const personType = normalize(values?.person_type).toLowerCase();

    if (personType === 'legal') {
      const legalName = normalize(values?.legal_name);
      if (legalName && businessName) return `${legalName} - ${businessName}`;
      return legalName || businessName;
    }

    const realName = [values?.prefix, values?.first_name, values?.last_name]
      .map((item) => normalize(item))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (realName && businessName) return `${realName} - ${businessName}`;
    return realName || businessName;
  };
  const buildQuickCreateAutoEmployeeName = (values: any) => {
    const normalize = (input: any) => String(input ?? '').replace(/\s+/g, ' ').trim();
    return [values?.prefix, values?.first_name, values?.last_name]
      .map((item) => normalize(item))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const buildQuickCreateAutoProductionOrderName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const bomLabelRaw = getQuickCreateFieldValueLabel('bom_id', values?.bom_id);
    const bomLabelClean = String(bomLabelRaw || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    addPart(bomLabelClean);
    addPart(getQuickCreateFieldValueLabel('color', values?.color));
    return parts.join(' ');
  };
  const applyQuickCreateAutoNaming = (rawValues: any) => {
    const nextValues = { ...(rawValues || {}) };

    if (quickCreateTargetModuleId === 'products' && isAutoNameEnabled(nextValues.auto_name_enabled)) {
      const nextName = buildQuickCreateAutoProductName(nextValues);
      if (nextName) nextValues.name = nextName;
    }
    if (quickCreateTargetModuleId === 'production_orders' && isAutoNameEnabled(nextValues.auto_name_enabled)) {
      const nextName = buildQuickCreateAutoProductionOrderName(nextValues);
      if (nextName) nextValues.name = nextName;
    }
    if (quickCreateTargetModuleId === 'customers' && isAutoNameEnabled(nextValues.auto_name_enabled)) {
      const nextFullName = buildQuickCreateAutoCustomerName(nextValues);
      if (nextFullName) nextValues.full_name = nextFullName;
    }
    if (quickCreateTargetModuleId === 'employees') {
      const nextFullName = buildQuickCreateAutoEmployeeName(nextValues);
      if (nextFullName) nextValues.full_name = nextFullName;
    }

    return nextValues;
  };

  const fieldAny = field as any;

  useEffect(() => {
    setIsLongTextExpanded(false);
  }, [fieldKey, forceEditMode]);

  const loadRelationOptions = async (searchText = '', exactId?: string | number | null) => {
    if (fieldType !== FieldType.RELATION || !field.relationConfig) return;
    if (isTaskSourceRecordField && !resolvedRelationTargetModuleId) {
      setRelationLiveOptions([]);
      missingExactRelationValueRef.current = null;
      return;
    }
    if (field.relationConfig?.dependsOn) {
      const dependsOnValue = String(allValues?.[field.relationConfig.dependsOn] || '').trim();
      if (!dependsOnValue) {
        setRelationLiveOptions([]);
        missingExactRelationValueRef.current = null;
        return;
      }
    }

    const normalizedSearchText = String(searchText || '').trim();
    const isExactLookup = exactId !== undefined && exactId !== null && exactId !== '';
    if (!isExactLookup && normalizedSearchText.length > 0 && normalizedSearchText.length < 2) {
      setRelationLiveOptions([]);
      return;
    }

    const requestVersion = !isExactLookup ? relationRequestVersionRef.current + 1 : relationRequestVersionRef.current;
    if (!isExactLookup) {
      relationRequestVersionRef.current = requestVersion;
    }

    try {
      relationPendingCountRef.current += 1;
      setRelationLoading(true);
      const remoteOptions = isTaskSourceRecordField
        ? await fetchTaskSourceRecordOptions(supabase, resolvedRelationTargetModuleId, {
            search: isExactLookup ? '' : normalizedSearchText,
            exactId: exactId ?? null,
            limit: RELATION_DEFAULT_LIMIT,
          })
        : await fetchRelationOptionsForField(supabase, field, {
            allValues,
            search: isExactLookup ? '' : normalizedSearchText,
            exactId: exactId ?? null,
            limit: RELATION_DEFAULT_LIMIT,
          });
      if (!isExactLookup && requestVersion !== relationRequestVersionRef.current) {
        return;
      }
      if (exactId) {
        const normalizedExactId = String(exactId);
        if ((remoteOptions || []).length === 0) {
          missingExactRelationValueRef.current = normalizedExactId;
          setRelationLiveOptions((prev) => {
            const alreadyExists = (prev || []).some((item: any) => String(item?.value) === normalizedExactId);
            if (alreadyExists) return prev;
            return [
              ...prev,
              {
                value: exactId,
                label: 'رکورد حذف شده',
                searchText: `رکورد حذف شده ${normalizedExactId}`.trim(),
                module: resolvedRelationTargetModuleId || field.relationConfig?.targetModule,
                missing: true,
              },
            ];
          });
          return;
        }
        missingExactRelationValueRef.current = null;
      }
      setRelationLiveOptions((prev) => (
        isExactLookup
          ? mergeSelectOptions(prev as any[], remoteOptions as any[]) as any[]
          : (remoteOptions as any[])
      ));
    } catch (error) {
      console.warn(`Could not fetch relation options for ${fieldKey}`, error);
    } finally {
      relationPendingCountRef.current = Math.max(0, relationPendingCountRef.current - 1);
      setRelationLoading(relationPendingCountRef.current > 0);
    }
  };

  const resetRelationSearchState = () => {
    if (relationSearchTimerRef.current) {
      window.clearTimeout(relationSearchTimerRef.current);
      relationSearchTimerRef.current = null;
    }
    relationRequestVersionRef.current += 1;
    relationPendingCountRef.current = 0;
    setRelationLoading(false);
    setRelationSearchQuery('');
  };

  useEffect(() => {
    if (fieldType !== FieldType.RELATION) return;
    if (value === undefined || value === null || value === '') return;
    if (String(relationSearchQuery || '').trim().length > 0) return;
    const exists = relationResolvedOptions.some((item: any) => String(item?.value) === String(value));
    if (exists) return;
    if (missingExactRelationValueRef.current === String(value)) return;
    void loadRelationOptions('', value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldType, value, relationResolvedOptions, relationSearchQuery]);

  useEffect(() => {
    if (fieldType !== FieldType.RELATION) {
      setRelationExactOption(null);
      return;
    }
    if (value === undefined || value === null || value === '') {
      setRelationExactOption(null);
      return;
    }
    if (isTaskSourceRecordField && !resolvedRelationTargetModuleId) {
      setRelationExactOption(null);
      return;
    }
    if (!isTaskSourceRecordField && relationConfigAny?.dependsOn) {
      const dependsOnValue = String(allValues?.[relationConfigAny.dependsOn] || '').trim();
      if (!dependsOnValue) {
        setRelationExactOption(null);
        return;
      }
    }

    const existingOption = relationResolvedOptions.find((item: any) => String(item?.value) === String(value));
    if (existingOption?.label) {
      setRelationExactOption(existingOption);
      return;
    }

    const localResolvedLabel = String(resolveRelationDisplayLabel() || '').trim();
    const safeRawValue = String(value ?? '').trim();
    if (localResolvedLabel && localResolvedLabel !== '-' && localResolvedLabel !== safeRawValue) {
      setRelationExactOption({
        value,
        label: localResolvedLabel,
        module: resolvedRelationTargetModuleId || relationConfigAny?.targetModule,
      });
      return;
    }

    let cancelled = false;
    const loadExactOption = async () => {
      try {
        const remoteOptions = isTaskSourceRecordField
          ? await fetchTaskSourceRecordOptions(supabase, resolvedRelationTargetModuleId, {
              exactId: value,
              limit: 1,
            })
          : await fetchRelationOptionsForField(supabase, field, {
              allValues,
              exactId: value,
              limit: 1,
            });
        if (cancelled) return;
        const matched = (remoteOptions || []).find((item: any) => String(item?.value) === String(value)) || null;
        setRelationExactOption(matched);
      } catch {
        if (!cancelled) {
          setRelationExactOption(null);
        }
      }
    };

    void loadExactOption();
    return () => {
      cancelled = true;
    };
  }, [allValues, field, fieldType, isTaskSourceRecordField, relationConfigAny?.dependsOn, relationConfigAny?.targetModule, relationResolvedOptions, resolveRelationDisplayLabel, resolvedRelationTargetModuleId, value]);

  useEffect(() => () => {
    if (relationSearchTimerRef.current) {
      window.clearTimeout(relationSearchTimerRef.current);
    }
  }, []);

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

      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: filePath,
        file,
        label: file.name || 'تصویر',
        detail: fieldLabel,
      });

      const { data: { publicUrl } } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);

      if (recordId && moduleId) {
        const hasFileManagerTables = await detectFileManagerTables(supabase, false);
        if (hasFileManagerTables) {
          try {
            await createFileManagerOriginForUpload({
              moduleId,
              recordId,
              recordTitle: String(recordId),
              fileUrl: publicUrl,
              fileName: file.name || null,
              mimeType: file.type || null,
              fileType: 'image',
              sortOrder: 0,
            });
          } catch (fileManagerError) {
            console.warn('Could not append file entry after image upload into file manager tables', fileManagerError);
          }
        } else {
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
      }

      msg.success('تصویر با موفقیت آپلود شد');
      onChange(publicUrl);
      return publicUrl;
    } catch (error: any) {
      if (isUploadCanceledError(error)) return null;
      console.error('خطا در آپلود تصویر:', error);
      msg.error(toFaErrorMessage(error, 'آپلود فایل ناموفق بود.'));
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

  const loadReadyTexts = async () => {
    setReadyTextsLoading(true);
    try {
      let query = supabase
        .from('ready_texts')
        .select('id, title, content, module_id')
        .order('created_at', { ascending: false })
        .limit(200);
      if (moduleId) {
        query = query.or(`module_id.is.null,module_id.eq.${moduleId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const pinnedIds = readPinnedReadyTextIds();
      const rows = (data || [])
        .map((row: any) => ({
          id: String(row?.id || ''),
          title: String(row?.title || '').trim(),
          content: String(row?.content || ''),
          pinned: pinnedIds.has(String(row?.id || '')),
        }))
        .filter((row) => row.id && row.content.trim().length > 0);
      setReadyTexts(sortReadyTexts(rows));
    } catch (error: any) {
      console.warn('Could not load ready texts', error);
      msg.error('برای متن‌های آماده ابتدا migration مرتبط با جدول ready_texts را اجرا کنید.');
      setReadyTexts([]);
    } finally {
      setReadyTextsLoading(false);
    }
  };

  const openReadyTexts = () => {
    if (!readyTextPermissions.canView) {
      msg.warning('دسترسی مشاهده متن‌های آماده برای این ماژول فعال نیست.');
      return;
    }
    setReadyTextsOpen(true);
    setNewReadyTextTitle('');
    setNewReadyTextContent('');
    setEditingReadyTextId(null);
    setEditingReadyTextTitle('');
    setEditingReadyTextContent('');
    void loadReadyTexts();
  };

  const addReadyText = async () => {
    if (!readyTextPermissions.canAdd) {
      msg.warning('دسترسی افزودن متن آماده برای این ماژول فعال نیست.');
      return;
    }
    const content = String(newReadyTextContent || '').trim();
    const title = String(newReadyTextTitle || '').trim();
    if (!content) {
      msg.warning('متن آماده نمی‌تواند خالی باشد.');
      return;
    }
    setAddingReadyText(true);
    try {
      const payload: any = {
        title: title || content.slice(0, 40),
        content,
        module_id: moduleId || null,
      };
      const { error } = await supabase.from('ready_texts').insert([payload]);
      if (error) throw error;
      setNewReadyTextTitle('');
      setNewReadyTextContent('');
      await loadReadyTexts();
      msg.success('متن آماده اضافه شد.');
    } catch (error: any) {
      console.warn('Could not add ready text', error);
      msg.error('ثبت متن آماده ناموفق بود.');
    } finally {
      setAddingReadyText(false);
    }
  };

  const startEditReadyText = (item: ReadyTextItem) => {
    if (!readyTextPermissions.canEdit) {
      msg.warning('دسترسی ویرایش متن آماده برای این ماژول فعال نیست.');
      return;
    }
    setEditingReadyTextId(item.id);
    setEditingReadyTextTitle(item.title || '');
    setEditingReadyTextContent(item.content || '');
  };

  const cancelEditReadyText = () => {
    setEditingReadyTextId(null);
    setEditingReadyTextTitle('');
    setEditingReadyTextContent('');
  };

  const updateReadyText = async () => {
    if (!editingReadyTextId) return;
    if (!readyTextPermissions.canEdit) {
      msg.warning('دسترسی ویرایش متن آماده برای این ماژول فعال نیست.');
      return;
    }

    const title = String(editingReadyTextTitle || '').trim();
    const content = String(editingReadyTextContent || '').trim();
    if (!content) {
      msg.warning('متن آماده نمی‌تواند خالی باشد.');
      return;
    }

    setUpdatingReadyText(true);
    try {
      const { error } = await supabase
        .from('ready_texts')
        .update({
          title: title || content.slice(0, 40),
          content,
        })
        .eq('id', editingReadyTextId);
      if (error) throw error;
      await loadReadyTexts();
      cancelEditReadyText();
      msg.success('متن آماده بروزرسانی شد.');
    } catch (error) {
      console.warn('Could not update ready text', error);
      msg.error('بروزرسانی متن آماده ناموفق بود.');
    } finally {
      setUpdatingReadyText(false);
    }
  };

  const deleteReadyText = async (id: string) => {
    if (!readyTextPermissions.canDelete) {
      msg.warning('دسترسی حذف متن آماده برای این ماژول فعال نیست.');
      return;
    }

    setDeletingReadyTextId(id);
    try {
      const { error } = await supabase.from('ready_texts').delete().eq('id', id);
      if (error) throw error;
      setReadyTexts((prev) => prev.filter((item) => item.id !== id));
      if (editingReadyTextId === id) {
        cancelEditReadyText();
      }
      msg.success('متن آماده حذف شد.');
    } catch (error) {
      console.warn('Could not delete ready text', error);
      msg.error('حذف متن آماده ناموفق بود.');
    } finally {
      setDeletingReadyTextId(null);
    }
  };
  const toggleReadyTextPin = (id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const nextPinnedIds = readPinnedReadyTextIds();
    if (nextPinnedIds.has(normalizedId)) {
      nextPinnedIds.delete(normalizedId);
    } else {
      nextPinnedIds.add(normalizedId);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(readyTextPinStorageKey, JSON.stringify(Array.from(nextPinnedIds)));
    }
    setReadyTexts((prev) => sortReadyTexts(
      prev.map((item) => (
        item.id === normalizedId
          ? { ...item, pinned: nextPinnedIds.has(normalizedId) }
          : item
      ))
    ));
  };

  const copyReadyText = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      msg.success('متن کپی شد.');
    } catch {
      msg.warning('کپی خودکار ممکن نبود.');
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
    Object.entries(configuredQuickCreateDefaults).forEach(([key, val]) => {
      defaults[key] = resolveConfiguredDefaultValue(val);
    });
    quickCreateFields.forEach((f: any) => {
      if (f?.defaultValue !== undefined) defaults[f.key] = resolveConfiguredDefaultValue(f.defaultValue);
    });
    if (quickCreateHasAutoNameToggle && quickCreateAutoNameToggleField?.defaultValue !== undefined) {
      defaults[quickCreateAutoNameToggleField.key] = normalizeAutoNameEnabled(
        false,
        false
      );
    }
    const frameId = window.requestAnimationFrame(() => {
      quickCreateForm.setFieldsValue(defaults);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    configuredQuickCreateDefaults,
    quickCreateOpen,
    quickCreateFields,
    quickCreateForm,
    quickCreateHasAutoNameToggle,
    quickCreateAutoNameToggleField,
  ]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const nextValues = applyQuickCreateAutoNaming(quickCreateForm.getFieldsValue(true));
    const computedEntries = Object.entries(nextValues).filter(([key, value]) => {
      if (quickCreateTargetModuleId === 'customers' && key === 'full_name') {
        return value && value !== quickCreateForm.getFieldValue('full_name');
      }
      if (quickCreateTargetModuleId === 'employees' && key === 'full_name') {
        return value && value !== quickCreateForm.getFieldValue('full_name');
      }
      if ((quickCreateTargetModuleId === 'products' || quickCreateTargetModuleId === 'production_orders') && key === 'name') {
        return value && value !== quickCreateForm.getFieldValue('name');
      }
      return false;
    });
    if (computedEntries.length === 0) return;
    quickCreateForm.setFieldsValue(Object.fromEntries(computedEntries));
  }, [
    quickCreateForm,
    quickCreateOpen,
    quickCreateTargetModuleId,
    quickCreateRelationOptions,
    quickCreateDynamicOptions,
  ]);

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
            dynamicMap[quickField.dynamicOptionsCategory] = await fetchDynamicOptionsByCategory(
              supabase,
              quickField.dynamicOptionsCategory
            );
          } catch (err) {
            console.warn('Failed loading dynamic options:', quickField.dynamicOptionsCategory, err);
          }
        }

        if (quickField.type === FieldType.RELATION && quickField.relationConfig?.targetModule) {
          const targetModule = quickField.relationConfig.targetModule;
          const targetField = getPreferredRelationTargetField(targetModule, (quickField.relationConfig as any)?.targetField);
          const isShelvesTarget = targetModule === 'shelves';
          const includeSystemCode = targetModule !== 'cheques' && supportsSystemCode(targetModule);
          const extraSelect = isShelvesTarget ? ', shelf_number' : '';
          try {
            const selectVariants = Array.from(
              new Set(
                [
                  `id, ${targetField}${includeSystemCode ? ', system_code' : ''}${extraSelect}`,
                  `id, ${targetField}${extraSelect}`,
                  `id, ${targetField}`,
                ].map((item) => item.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim())
              )
            );
            let data: any[] = [];
            let lastError: any = null;
            for (const selectExpr of selectVariants) {
              const result = await supabase
                .from(targetModule)
                .select(selectExpr)
                .limit(200);
              if (!result.error) {
                data = (result.data || []) as any[];
                lastError = null;
                break;
              }
              const errorCode = String((result.error as any)?.code || '').toUpperCase();
              const errorText = String((result.error as any)?.message || (result.error as any)?.details || '').toLowerCase();
              const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
              if (!isMissingColumn) {
                lastError = result.error;
                break;
              }
              lastError = result.error;
            }
            if (lastError && data.length === 0) throw lastError;
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

  const normalizeQuickCreatePayload = (rawPayload: Record<string, any>) => {
    const payload = { ...(rawPayload || {}) };

    if (quickCreateTargetModuleId === 'customers') {
      const personType = String(payload?.person_type || 'real').trim().toLowerCase();
      const referrerModule = String(payload?.referrer_module || '').trim().toLowerCase();

      if (personType === 'real') {
        payload.legal_name = null;
        payload.national_id = null;
        payload.registration_number = null;
      } else if (personType === 'legal') {
        payload.prefix = null;
        payload.birth_date = null;
        payload.national_code = null;
      }

      if (!payload?.is_employee) {
        payload.related_employee_id = null;
      }
      if (referrerModule !== 'customers') {
        payload.referrer_customer_id = null;
      }
      if (referrerModule !== 'employees') {
        payload.referrer_employee_id = null;
      }
      if (referrerModule !== 'suppliers') {
        payload.referrer_supplier_id = null;
      }
      if (!payload?.portal_enabled) {
        payload.portal_status = payload.portal_status || 'disabled';
        payload.telegram_chat_id = null;
        payload.bale_chat_id = null;
        payload.rubika_chat_id = null;
        if (payload.portal_permissions_override === '') {
          delete payload.portal_permissions_override;
        }
      }
    }

    if (quickCreateTargetModuleId === 'suppliers' && Array.isArray(payload?.rank)) {
      payload.rank = payload.rank.map((item: any) => String(item || '').trim()).filter(Boolean).join(',');
    }

    if (quickCreateTargetModuleId === 'products') {
      delete payload.product_inventory;
    }

    if (quickCreateTargetModuleId === 'shelves') {
      delete payload.shelf_inventory;
      delete payload.shelf_stock_movements;
      delete payload.task_shelf_inventory;
      delete payload.task_shelf_stock_movements;
    }

    if (quickCreateTargetModuleId === 'tasks') {
      return normalizeTaskSourceValues(payload);
    }

    return payload;
  };

  const insertQuickCreatePayload = async (initialPayload: Record<string, any>) => {
    const targetTable = quickCreateTargetModule?.table || quickCreateTargetModuleId;
    if (!targetTable) throw createQuickCreateUserError('ماژول مقصد برای افزودن سریع مشخص نیست.');

    let userId: string | null = null;
    try {
      const snapshot = await fetchSessionBootstrap(supabase);
      userId = snapshot?.user?.id || null;
    } catch {
      userId = null;
    }

    const withAuditFields = (payload: Record<string, any>) => {
      if (!userId) return { ...payload };
      return {
        ...payload,
        created_by: payload.created_by ?? userId,
        updated_by: payload.updated_by ?? userId,
      };
    };

    const insertWithColumnFallback = async (payload: Record<string, any>) => {
      let writablePayload = { ...payload };
      let auditedPayload = withAuditFields(writablePayload);
      let insertResult = await supabase
        .from(targetTable)
        .insert(auditedPayload)
        .select('id')
        .single();

      if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
        insertResult = await supabase
          .from(targetTable)
          .insert(writablePayload)
          .select('id')
          .single();
      }

      while (insertResult.error && isMissingColumnLikeError(insertResult.error)) {
        const missingColumn = extractMissingColumnName(insertResult.error);
        const nextPayload = omitColumnIfPresent(writablePayload, missingColumn);
        if (nextPayload === writablePayload) break;

        writablePayload = nextPayload;
        auditedPayload = withAuditFields(writablePayload);
        insertResult = await supabase
          .from(targetTable)
          .insert(auditedPayload)
          .select('id')
          .single();

        if (insertResult.error && isMissingAuditColumnError(insertResult.error)) {
          insertResult = await supabase
            .from(targetTable)
            .insert(writablePayload)
            .select('id')
            .single();
        }
      }

      return { insertResult, writablePayload };
    };

    let { insertResult, writablePayload } = await insertWithColumnFallback(initialPayload);

    for (
      let attempt = 0;
      insertResult.error
      && supportsSystemCode(quickCreateTargetModuleId)
      && (isDuplicateSystemCodeError(insertResult.error) || isStatementTimeoutError(insertResult.error))
      && attempt < 3;
      attempt += 1
    ) {
      const fallbackSystemCode = await buildClientFallbackSystemCode(
        supabase,
        quickCreateTargetModuleId,
        targetTable
      );
      ({ insertResult, writablePayload } = await insertWithColumnFallback({
        ...writablePayload,
        system_code: fallbackSystemCode,
      }));
    }

    if (insertResult.error && quickCreateTargetModuleId === 'suppliers') {
      const minimalPayload = buildMinimalSupplierPayload(writablePayload);
      const minimalResult = await insertWithColumnFallback(minimalPayload);
      if (!minimalResult.insertResult.error) {
        insertResult = minimalResult.insertResult;
        writablePayload = minimalResult.writablePayload;
      }
    }

    return insertResult;
  };

  const handleQuickCreate = async () => {
    if (!quickCreateTargetModuleId) return;
    setQuickCreateLoading(true);
    try {
      const draftValues = applyQuickCreateAutoNaming(quickCreateForm.getFieldsValue(true));
      quickCreateForm.setFieldsValue(draftValues);
      await quickCreateForm.validateFields();
      const values = applyQuickCreateAutoNaming(quickCreateForm.getFieldsValue(true));
      const payload: Record<string, any> = {};

      quickCreateFields.forEach((f: any) => {
        if (!f?.key) return;
        let nextValue = values?.[f.key];
        if (nextValue === undefined) return;
        if (typeof nextValue === 'string') nextValue = nextValue.trim();
        if (nextValue === '') nextValue = null;
        payload[f.key] = nextValue;
      });

      ['assignee_id', 'assignee_type', 'assignee_role_id'].forEach((key) => {
        if (!(key in values)) return;
        const nextValue = values?.[key];
        payload[key] = nextValue === '' ? null : nextValue;
      });
      if (quickCreateHasAutoNameToggle && quickCreateAutoNameToggleField?.key) {
        payload[quickCreateAutoNameToggleField.key] = normalizeAutoNameEnabled(
          values?.[quickCreateAutoNameToggleField.key],
          false
        );
      }

      const quickCreateTargetValue = payload[quickCreateTargetField];
      if (
        quickCreateTargetValue === undefined
        || quickCreateTargetValue === null
        || (typeof quickCreateTargetValue === 'string' && quickCreateTargetValue.trim() === '')
      ) {
        throw createQuickCreateUserError(`فیلد "${quickCreateTargetField}" الزامی است.`);
      }

      const normalizedPayload = normalizeQuickCreatePayload(payload);
      if (supportsSystemCode(quickCreateTargetModuleId) && !payload.system_code) {
        normalizedPayload.system_code = await buildClientFallbackSystemCode(
          supabase,
          quickCreateTargetModuleId,
          quickCreateTargetModule?.table || quickCreateTargetModuleId
        );
      }
      const insertResult = await insertQuickCreatePayload(normalizedPayload);
      if (insertResult.error) throw insertResult.error;

      msg.success('رکورد جدید ایجاد شد');
      closeQuickCreate();
      if (onOptionsUpdate) onOptionsUpdate();
      const insertedRow: any = insertResult.data as any;
      if (insertedRow?.id) onChange(insertedRow.id);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      const userMessage = err?.userFacing
        ? String(err.message || 'افزودن سریع انجام نشد.')
        : toFaErrorMessage(err, 'افزودن سریع انجام نشد. لطفاً فیلدهای ضروری را بررسی کنید و دوباره تلاش کنید.');
      msg.error(userMessage);
      if (!err?.userFacing) {
        console.warn('Quick create failed:', {
          moduleId: quickCreateTargetModuleId,
          fieldKey,
          error: err,
        });
      }
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
    if (isProcessDraftField) {
      const nextDraftStages = Array.isArray(value)
        ? value
        : (Array.isArray((allValues as any)?.[fieldKey]) ? (allValues as any)[fieldKey] : []);
      const allowTemplateStageEdit = moduleId === 'process_templates' && fieldKey === 'template_stages_preview';
      return (
        <ProductionStagesField
          recordId={recordId}
          moduleId={moduleId}
          automationContextModuleId={
            moduleId === 'process_templates' || moduleId === 'process_runs'
              ? null
              : null
          }
          automationContextModuleIds={
            moduleId === 'process_templates' || moduleId === 'process_runs'
              ? normalizeProcessTargetModuleIds(
                  (allValues as any)?.module_ids,
                  (allValues as any)?.module_id
                )
              : null
          }
          readOnly={!forceEditMode || (isReadonly && !allowTemplateStageEdit)}
          compact={compactMode}
          draftStages={nextDraftStages}
          onDraftStagesChange={(stages) => onChange(stages)}
          forceProcessRecordMode={moduleId !== 'process_templates' && moduleId !== 'process_runs'}
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
          return (
            <span className="font-bold text-gray-700 dark:text-gray-300 text-xs persian-number">
              {formatted}
              <span className="ms-1 text-[10px] opacity-70">{currencyLabel}</span>
            </span>
          );
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
        if (fieldType === FieldType.PHONE) {
          return (
            <PhoneActionsPopover
              value={value}
              moduleId={moduleId}
              record={allValues}
              size={compactMode ? 'sm' : 'lg'}
              className="font-medium w-full min-w-0"
              emptyText={compactMode ? '' : '-'}
            />
          );
        }
        if (fieldType === FieldType.SELECT || fieldType === FieldType.RELATION || fieldType === FieldType.STATUS) {
             const selectedOpt = (fieldType === FieldType.RELATION ? relationResolvedOptions : fieldOptions).find((o: any) => String(o?.value) === String(value));
              if (fieldType === FieldType.STATUS && selectedOpt) {
                   return <Tag color={selectedOpt.color}>{formatDisplayText(selectedOpt.label, getSafeOptionFallback(value))}</Tag>;
                }
                const resolvedLabel = fieldType === FieldType.RELATION
                  ? resolveRelationDisplayLabel()
                  : (selectedOpt ? formatDisplayText(selectedOpt.label, '') : getSafeOptionFallback(value));
                if (fieldType === FieldType.RELATION && resolvedRelationTargetModuleId && value) {
                   const targetModule = String(selectedOpt?.module || resolvedRelationTargetModuleId || '').trim();
                   return (
                      <RelatedRecordPopover
                        moduleId={targetModule || resolvedRelationTargetModuleId}
                        recordId={String(value)}
                        label={resolvedLabel}
                        overlayZIndex={overlayZIndexBase + 40}
                      >
                        <span className="cursor-pointer break-words font-medium text-leather-600 transition-colors hover:text-leather-700 hover:underline">
                          {formatDisplayText(resolvedLabel, getSafeOptionFallback(value))}
                        </span>
                      </RelatedRecordPopover>
                    );
               }
                return <span className="text-gray-800">{formatDisplayText(resolvedLabel, compactMode ? '' : '-')}</span>;
          }
        if (fieldType === FieldType.MULTI_SELECT) {
             const values = Array.isArray(value)
               ? value
               : (value === null || value === undefined || value === '' ? [] : [value]);
             if (values.length === 0) {
               return <span>{compactMode ? '' : '-'}</span>;
             }
             const labels = values.map((item) => {
               const selectedOpt = fieldOptions.find((o: any) => String(o?.value) === String(item));
                if (selectedOpt?.label) return formatDisplayText(selectedOpt.label, '');
                return getSafeOptionFallback(item);
              });
              return <span className="text-gray-800 break-words">{labels.join('، ')}</span>;
        }
        if (fieldType === FieldType.TAGS) {
             if (Array.isArray(value) && value.length > 0) {
                  return <div className="flex flex-wrap gap-1">{value.map((t: any, i: number) => <Tag key={String(t?.id || t?.value || i)} color={typeof t === 'object' ? t?.color : undefined}>{formatDisplayText(t, '')}</Tag>)}</div>;
              }
              return <span>-</span>;
        }
        if (isLongTextField) {
          const rendered = String(value || '').trim();
          return (
            <div className="flex items-start gap-2 w-full">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <div
                    className={`text-gray-800 whitespace-pre-wrap break-words transition-all duration-200 ${isSuperLongTextField ? 'leading-7 text-[15px]' : 'leading-6'} ${shouldShowLongTextToggle && !isLongTextExpanded ? `${collapsedLongTextMaxHeightClass} overflow-hidden` : ''}`}
                  >
                    {rendered ? toPersianNumber(rendered) : (compactMode ? '' : '-')}
                  </div>
                  {shouldShowLongTextToggle && !isLongTextExpanded && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white dark:from-[#1f1f1f] to-transparent" />
                  )}
                </div>
                {shouldShowLongTextToggle && (
                  <Button
                    size="small"
                    type="text"
                    icon={isLongTextExpanded ? <UpOutlined /> : <DownOutlined />}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsLongTextExpanded((prev) => !prev);
                    }}
                    className="mt-2 px-0 text-xs text-gray-500 hover:!text-leather-600"
                  >
                    {isLongTextExpanded ? 'جمع کردن' : 'مشاهده بیشتر'}
                  </Button>
                )}
              </div>
              {readyTextPermissions.canView && (
                <Button
                  size="small"
                  type="text"
                  icon={<EllipsisOutlined />}
                  onClick={openReadyTexts}
                  title="متن‌های آماده"
                  className="shrink-0 text-gray-500"
                />
              )}
            </div>
          );
        }
        
        return <span className="text-gray-800 break-words">{formatPersianDisplayText(value, compactMode ? '' : '-')}</span>;
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

      case FieldType.PHONE:
        return <PhoneFieldInput value={value} onChange={onChange} disabled={!forceEditMode || isReadonly} placeholder={compactMode ? undefined : fieldLabel} />;
      
      case FieldType.LONG_TEXT:
      case FieldType.SUPER_LONG_TEXT:
        return (
          <div className="w-full">
            <div className="flex items-start gap-2 w-full">
            <Input.TextArea
              {...commonProps}
              value={longTextDraftValue}
              onFocus={() => {
                longTextFocusedRef.current = true;
              }}
              onCompositionStart={() => {
                longTextComposingRef.current = true;
              }}
              onCompositionEnd={(event: React.CompositionEvent<HTMLTextAreaElement>) => {
                longTextComposingRef.current = false;
                const nextValue = event.currentTarget.value;
                longTextDraftValueRef.current = nextValue;
                setLongTextDraftValue(nextValue);
                commitLongTextValue(nextValue);
              }}
              onBlur={(event) => {
                longTextFocusedRef.current = false;
                longTextComposingRef.current = false;
                const nextValue = event.target.value;
                longTextDraftValueRef.current = formatTextForInput(nextValue);
                setLongTextDraftValue(formatTextForInput(nextValue));
                commitLongTextValue(nextValue, true);
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                longTextDraftValueRef.current = nextValue;
                setLongTextDraftValue(nextValue);
                if (!longTextComposingRef.current) {
                  commitLongTextValue(nextValue);
                }
              }}
              rows={compactMode ? 1 : collapsedLongTextMinRows}
              autoSize={compactMode
                ? undefined
                : {
                    minRows: collapsedLongTextMinRows,
                    maxRows: isLongTextExpanded ? expandedLongTextMaxRows : collapsedLongTextMinRows + 4,
                  }}
            />
            {readyTextPermissions.canView && (
              <Button
                size="small"
                type="text"
                icon={<EllipsisOutlined />}
                onClick={openReadyTexts}
                title="متن‌های آماده"
                disabled={!forceEditMode || isReadonly}
                className="mt-1 shrink-0 text-gray-500"
              />
            )}
            </div>
            {shouldShowLongTextToggle && !compactMode && (
              <Button
                size="small"
                type="text"
                icon={isLongTextExpanded ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setIsLongTextExpanded((prev) => !prev)}
                className="mt-2 px-0 text-xs text-gray-500 hover:!text-leather-600"
              >
                {isLongTextExpanded ? 'نمایش فشرده' : 'باز کردن کامل'}
              </Button>
            )}
          </div>
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
                formatter={(val, info) => formatNumericForInput(resolveFormatterSourceValue(info?.input, val), true)}
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
                    protectedValues={getProtectedDynamicValues(field.dynamicOptionsCategory)}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    onOptionsUpdate={onOptionsUpdate}
                     disabled={!forceEditMode}
                     getPopupContainer={selectPopupContainer}
                     popupStyle={{ zIndex: selectPopupZIndex }}
                     modalZIndex={modalOverlayZIndex}
                     overlayZIndexBase={selectPopupZIndex}
                     pickerTitle={fieldLabel}
                 />
            );
        }
        return (
            <AdaptiveSelectField
                {...commonProps}
                className={KALAM_SELECT_FIELD_CLASSNAME}
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                optionLabelProp="label"
                getPopupContainer={selectPopupContainer}
                placement={selectPlacement}
                overlayZIndexBase={selectPopupZIndex}
                pickerTitle={fieldLabel}
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
                    protectedValues={getProtectedDynamicValues(field.dynamicOptionsCategory)}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    mode="multiple"
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                    getPopupContainer={selectPopupContainer}
                    popupStyle={{ zIndex: selectPopupZIndex }}
                    modalZIndex={modalOverlayZIndex}
                    overlayZIndexBase={selectPopupZIndex}
                    pickerTitle={fieldLabel}
                />
            );
        }
        return (
            <AdaptiveSelectField
                {...commonProps}
                className={KALAM_SELECT_FIELD_CLASSNAME}
                mode="multiple"
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                optionLabelProp="label"
                getPopupContainer={selectPopupContainer}
                placement={selectPlacement}
                overlayZIndexBase={selectPopupZIndex}
                pickerTitle={fieldLabel}
            />
        );

      case FieldType.RELATION:
        const canQuickCreate = canUseRelationQuickCreate;
        const normalizedRelationSearchQuery = String(relationSearchQuery || '').trim();
        const isRelationSearching = normalizedRelationSearchQuery.length > 0;
        let filteredOptions = isRelationSearching ? relationLiveOptions : relationResolvedOptions;

        if (isTaskSourceRecordField && !resolvedRelationTargetModuleId) {
          return <Select disabled placeholder="ابتدا بخش مرتبط را انتخاب کنید" className={KALAM_SELECT_FIELD_CLASSNAME} style={{ width: '100%' }} value={value} options={[]} />;
        }
        
        const relConfigAny = field.relationConfig as any;
        if (!isTaskSourceRecordField && relConfigAny?.dependsOn && allValues) {
             const depVal = allValues[relConfigAny.dependsOn];
             if (!depVal) {
                 return <Select disabled placeholder="ابتدا فیلد مرتبط را انتخاب کنید" className={KALAM_SELECT_FIELD_CLASSNAME} style={{width:'100%'}} value={value} options={[]} />;
              }
             filteredOptions = (isRelationSearching ? relationLiveOptions : fieldOptions).filter((opt: any) => opt.module === depVal);
        }

          return (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex gap-1 w-full min-w-0">
                <AdaptiveSelectField
                    {...commonProps}
                    style={{ ...((commonProps as any)?.style || {}), width: 'auto', flex: 1, minWidth: 0 }}
                    className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'min-w-0')}
                    showSearch
                    options={filteredOptions}
                    loading={relationLoading}
                    optionRender={renderSelectOption}
                    optionFilterProp="searchText"
                    optionLabelProp="label"
                    getPopupContainer={selectPopupContainer}
                    placement={selectPlacement}
                    autoClearSearchValue
                    popupMatchSelectWidth={false}
                    virtual={false}
                    listHeight={isMobileViewport ? 224 : 320}
                    popupStyle={buildStandardSelectPopupRootStyle({ zIndex: selectPopupZIndex + 20, minWidth: 320, maxWidth: 'min(92vw, 420px)' })}
                    overlayZIndexBase={selectPopupZIndex + 20}
                    filterOption={false}
                    searchValue={relationSearchQuery}
                    onChange={(nextValue) => {
                      resetRelationSearchState();
                      onChange(nextValue);
                    }}
                    notFoundContent={relationLoading ? 'در حال بارگذاری...' : 'موردی یافت نشد'}
                    onOpenChange={(open) => {
                      if (open) {
                        resetRelationSearchState();
                        void loadRelationOptions('');
                      } else {
                        resetRelationSearchState();
                      }
                    }}
                    onSearch={(searchText) => {
                      setRelationSearchQuery(String(searchText || ''));
                      if (relationSearchTimerRef.current) {
                        window.clearTimeout(relationSearchTimerRef.current);
                      }
                      relationSearchTimerRef.current = window.setTimeout(() => {
                        void loadRelationOptions(String(searchText || '').trim());
                      }, 320);
                    }}
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
                    pickerTitle={fieldLabel}
                    sheetSubtitle={resolvedRelationTargetModuleId
                      ? `ماژول: ${MODULES[resolvedRelationTargetModuleId]?.titles?.fa || resolvedRelationTargetModuleId}`
                      : undefined}
                    mobileSearchPlaceholder="جستجوی رکورد مرتبط..."
                    sheetToolbar={!compactMode && canQuickCreate ? (
                      <Button
                        icon={<PlusOutlined />}
                        onClick={() => setQuickCreateOpen(true)}
                        disabled={!forceEditMode || isReadonly}
                      >
                        افزودن مورد جدید
                      </Button>
                    ) : null}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  onScan={({ raw, moduleId, recordId }) => {
                    if (recordId && moduleId === resolvedRelationTargetModuleId) {
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
              {value && resolvedRelationTargetModuleId && (
                <RelatedRecordPopover
                  moduleId={String(filteredOptions.find((opt: any) => String(opt?.value) === String(value))?.module || resolvedRelationTargetModuleId || '')}
                  recordId={String(value)}
                  label={formatDisplayText(filteredOptions.find((opt: any) => String(opt?.value) === String(value))?.label, getSafeOptionFallback(value))}
                  overlayZIndex={overlayZIndexBase + 40}
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
            zIndex={overlayZIndexBase + 40}
            modalContainer={popupContainer}
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
            zIndex={overlayZIndexBase + 40}
            modalContainer={popupContainer}
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
            zIndex={overlayZIndexBase + 40}
            modalContainer={popupContainer}
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
        if (moduleId) {
          return (
            <TagInput
              moduleId={moduleId}
              initialTags={Array.isArray(value) ? value : []}
              onChange={(nextTags) => onChange(nextTags || [])}
              disabled={!forceEditMode || isReadonly}
            />
          );
        }
        return <Input disabled placeholder="تگ‌ها قابل انتخاب نیستند" />;

      case FieldType.IMAGE:
        if (imageSourceMode === 'gallery') {
          return (
            <div className="flex flex-col gap-2">
              {value ? (
                <img src={buildImagePreviewUrl(String(value), 'thumb')} alt="image" style={{ width: '100%', borderRadius: 8, border: '1px solid #f0f0f0', maxHeight: 120, objectFit: 'cover' }} />
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
        if (canShowFilesGallery) {
          return (
            <div className="flex flex-col gap-2">
              {value ? (
                <img src={buildImagePreviewUrl(String(value), 'thumb')} alt="image" style={{ width: '100%', borderRadius: 8, border: '1px solid #f0f0f0', maxHeight: 120, objectFit: 'cover' }} />
              ) : (
                <div className="h-16 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">
                  فایلی انتخاب نشده است
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  onClick={() => setIsGalleryOpen(true)}
                  disabled={!forceEditMode || isReadonly}
                >
                  مدیریت و انتخاب فایل
                </Button>
                {!!value && (
                  <Button
                    size="small"
                    danger
                    onClick={() => onChange(null)}
                    disabled={!forceEditMode || isReadonly}
                  >
                    حذف فایل
                  </Button>
                )}
              </div>
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
                    <img src={buildImagePreviewUrl(String(value), 'thumb')} alt="avatar" style={{ width: '100%', borderRadius: 8 }} />
                  ) : (
                    <div><UploadOutlined /><div style={{ marginTop: 8 }}>آپلود</div></div>
                  )}
              </Upload>
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
    && canUseRelationQuickCreate;
  const globalImageGalleryModalNode = (
    <Modal
      title="انتخاب تصویر از گالری"
      open={isGlobalImageGalleryOpen}
      onCancel={() => setIsGlobalImageGalleryOpen(false)}
      footer={null}
      width={980}
      zIndex={modalOverlayZIndex}
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
              <img src={buildImagePreviewUrl(item.url, 'thumb')} alt={item.label || 'image'} className="w-full h-28 object-cover" />
              <div className="px-2 py-1 text-[11px] text-gray-600 truncate">{item.label || 'تصویر'}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );

  const readyTextsModalNode = (
    <Modal
      title="متن‌های آماده"
      open={readyTextsOpen}
      onCancel={() => setReadyTextsOpen(false)}
      footer={null}
      width={760}
      zIndex={modalOverlayZIndex}
      destroyOnHidden
    >
      <div className="space-y-3">
        {readyTextPermissions.canAdd && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input
                value={newReadyTextTitle}
                onChange={(e) => setNewReadyTextTitle(e.target.value)}
                placeholder="عنوان متن"
                maxLength={120}
              />
              <Input.TextArea
                value={newReadyTextContent}
                onChange={(e) => setNewReadyTextContent(e.target.value)}
                placeholder="متن آماده جدید..."
                autoSize={{ minRows: 1, maxRows: 4 }}
                className="md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end">
              <Button type="primary" onClick={addReadyText} loading={addingReadyText}>
                افزودن متن آماده
              </Button>
            </div>
          </>
        )}

        <div className="border rounded-xl border-gray-200 dark:border-gray-700 max-h-[46vh] overflow-y-auto p-2 space-y-2">
          {readyTextsLoading ? (
            <div className="h-32 flex items-center justify-center text-sm text-gray-500 gap-2">
              <LoadingOutlined />
              در حال بارگذاری...
            </div>
          ) : readyTexts.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-gray-400">
              متنی ثبت نشده است.
            </div>
          ) : (
            readyTexts.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {editingReadyTextId === item.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editingReadyTextTitle}
                          onChange={(e) => setEditingReadyTextTitle(e.target.value)}
                          placeholder="عنوان متن"
                          maxLength={120}
                        />
                        <Input.TextArea
                          value={editingReadyTextContent}
                          onChange={(e) => setEditingReadyTextContent(e.target.value)}
                          autoSize={{ minRows: 2, maxRows: 6 }}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate flex items-center gap-1">
                          {item.pinned ? <PushpinOutlined className="text-amber-500" /> : null}
                          <span>{item.title || 'متن بدون عنوان'}</span>
                        </div>
                        <div className="mt-1 text-xs whitespace-pre-wrap break-words text-gray-600 dark:text-gray-300">
                          {item.content}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 self-start">
                    <Button
                      size="small"
                      type={item.pinned ? 'primary' : 'default'}
                      icon={<PushpinOutlined />}
                      onClick={() => toggleReadyTextPin(item.id)}
                    />
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void copyReadyText(item.content)}
                    />
                    {editingReadyTextId === item.id ? (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          icon={<SaveOutlined />}
                          onClick={() => void updateReadyText()}
                          loading={updatingReadyText}
                        >
                          ذخیره
                        </Button>
                        <Button size="small" onClick={cancelEditReadyText}>
                          انصراف
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="small"
                          onClick={() => {
                            const currentValue = isLongTextField
                              ? normalizeDigitsToEnglish(longTextDraftValueRef.current)
                              : String(value || '');
                            const readyTextValue = String(item.content || '');
                            const nextValue = currentValue
                              ? `${currentValue}${currentValue.endsWith('\n') ? '' : '\n'}${readyTextValue}\n`
                              : `${readyTextValue}\n`;
                            if (isLongTextField) {
                              const formattedNextValue = formatTextForInput(nextValue);
                              longTextDraftValueRef.current = formattedNextValue;
                              setLongTextDraftValue(formattedNextValue);
                              commitLongTextValue(formattedNextValue, true);
                            } else {
                              onChange(nextValue);
                            }
                          }}
                        >
                          درج
                        </Button>
                        {readyTextPermissions.canEdit && (
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => startEditReadyText(item)}
                          />
                        )}
                        {readyTextPermissions.canDelete && (
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingReadyTextId === item.id}
                            onClick={() => {
                              Modal.confirm({
                                title: 'حذف متن آماده',
                                content: 'این متن آماده حذف شود؟',
                                okText: 'حذف',
                                cancelText: 'انصراف',
                                okButtonProps: { danger: true },
                                onOk: async () => {
                                  await deleteReadyText(item.id);
                                },
                              });
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );

  const hasConfiguredTiles = Boolean(MAP_STYLE_URL || import.meta.env.VITE_MAP_TILE_URL);
  const locationPickerModalNode = (
    <Modal
      title="انتخاب موقعیت روی نقشه"
      open={isLocationPickerOpen}
      onCancel={() => setIsLocationPickerOpen(false)}
      width={900}
      zIndex={modalOverlayZIndex}
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
          برای استفاده در محیط داخلی مقدار `VITE_MAP_STYLE_URL` را روی style.json سرور نقشه تنظیم کنید.
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
                    moduleId={quickCreateTargetModuleId}
                    fields={quickCreateFields}
                    form={quickCreateForm}
                    loading={quickCreateLoading}
                    relationOptions={quickCreateRelationOptions}
                    dynamicOptions={quickCreateDynamicOptions}
                    onCancel={closeQuickCreate}
                    onOk={handleQuickCreate}
                    overlayZIndexBase={quickCreateModalZIndex}
                />
            )}
             <Modal 
                title="اسکن بارکد" 
                open={isScanModalOpen} 
                onCancel={() => setIsScanModalOpen(false)} 
                footer={null}
                zIndex={scanModalZIndex}
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
            {readyTextsModalNode}
            {locationPickerModalNode}
        </div>
      );
  }

  const formItemProps: any = {
      label: fieldLabel,
      name: fieldKey,
      required: isRequired,
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
                moduleId={quickCreateTargetModuleId}
                fields={quickCreateFields}
                form={quickCreateForm}
                loading={quickCreateLoading}
                relationOptions={quickCreateRelationOptions}
                dynamicOptions={quickCreateDynamicOptions}
                onCancel={closeQuickCreate}
                onOk={handleQuickCreate}
                overlayZIndexBase={quickCreateModalZIndex}
            />
        )}
        <Modal 
            title="اسکن بارکد" 
            open={isScanModalOpen} 
            onCancel={() => setIsScanModalOpen(false)} 
            footer={null}
            zIndex={scanModalZIndex}
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
        {readyTextsModalNode}
        {locationPickerModalNode}
    </>
  );
};

export default SmartFieldRenderer;

interface QuickCreateProps {
  open: boolean;
  label: string;
  moduleId?: string;
  fields: ModuleField[];
  form: any;
  loading: boolean;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  onCancel: () => void;
  onOk: () => void | Promise<void>;
  overlayZIndexBase?: number;
}

const QuickCreateAutoNameSwitch: React.FC<{
  open: boolean;
  field: ModuleField;
  form: any;
  fallback: boolean;
  disabled?: boolean;
  onImmediateChange: (value: boolean) => void;
}> = React.memo(({ open, field, form, fallback, disabled = false, onImmediateChange }) => {
  const fieldKey = String(field?.key || '');
  const readValue = useCallback(() => {
    if (!fieldKey) return fallback;
    return normalizeAutoNameEnabled(form?.getFieldValue?.(fieldKey), fallback);
  }, [fallback, fieldKey, form]);
  const [checked, setChecked] = useState(() => readValue());

  useEffect(() => {
    if (!open) return;
    setChecked(readValue());
    if (typeof window === 'undefined') return;

    const frameId = window.requestAnimationFrame(() => {
      setChecked(readValue());
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open, readValue]);

  return (
    <Switch
      checked={checked}
      onChange={(nextValue) => {
        const normalized = normalizeAutoNameEnabled(nextValue, fallback);
        setChecked(normalized);
        onImmediateChange(normalized);
      }}
      disabled={disabled}
    />
  );
});

export const RelationQuickCreateInline: React.FC<QuickCreateProps> = ({
  open,
  label,
  moduleId,
  fields,
  form,
  loading,
  relationOptions,
  dynamicOptions,
  onCancel,
  onOk,
  overlayZIndexBase = 12600,
}) => {
  const [fallbackForm] = Form.useForm();
  const effectiveForm = form || fallbackForm;
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const pendingAutoNameToggleValueRef = useRef<boolean | null>(null);
  const pendingAutoNameToggleFrameRef = useRef<number | null>(null);
  const supportsAssignee = supportsGlobalAssignee(String(moduleId || ''));
  const supportsAssigneeType = supportsGlobalAssigneeType(String(moduleId || ''));
  const supportsRoleAssignee = supportsGlobalRoleAssignee(String(moduleId || ''));
  const assigneeLabel = getAssigneeLabel(moduleId);
  const quickCreateModuleConfig = moduleId ? MODULES[moduleId] : undefined;
  const autoNameToggleField = useMemo(
    () => quickCreateModuleConfig?.fields?.find((field: any) => String(field?.key || '') === 'auto_name_enabled') as ModuleField | undefined,
    [quickCreateModuleConfig]
  );
  const showAutoNameToggle = !!autoNameToggleField && (moduleId === 'products' || moduleId === 'production_orders' || moduleId === 'customers');
  const autoNameToggleKey = autoNameToggleField?.key || '';
  const autoNameToggleDefault = false;
  const watchedAssigneeCombo = Form.useWatch('assignee_combo', effectiveForm);
  const watchedQuickCreateValues = Form.useWatch([], effectiveForm) || {};
  const childOverlayZIndexBase = overlayZIndexBase + 100;
  const quickCreatePopupContainer = useCallback((triggerNode?: HTMLElement | null) => {
    return resolveOverlayPopupContainer(triggerNode);
  }, []);
  const clearPendingAutoNameToggleWrite = useCallback(() => {
    if (pendingAutoNameToggleFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(pendingAutoNameToggleFrameRef.current);
    }
    pendingAutoNameToggleFrameRef.current = null;
    pendingAutoNameToggleValueRef.current = null;
  }, []);
  const flushPendingAutoNameToggleWrite = useCallback(() => {
    if (!showAutoNameToggle || !autoNameToggleKey) return;
    if (pendingAutoNameToggleFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(pendingAutoNameToggleFrameRef.current);
    }
    pendingAutoNameToggleFrameRef.current = null;
    if (pendingAutoNameToggleValueRef.current === null) return;
    effectiveForm?.setFieldValue?.(autoNameToggleKey, pendingAutoNameToggleValueRef.current);
    pendingAutoNameToggleValueRef.current = null;
  }, [autoNameToggleKey, effectiveForm, showAutoNameToggle]);
  const setDeferredAutoNameToggleFormValue = useCallback((nextValue: boolean) => {
    if (!autoNameToggleKey) return;
    pendingAutoNameToggleValueRef.current = nextValue;
    if (pendingAutoNameToggleFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(pendingAutoNameToggleFrameRef.current);
    }
    if (typeof window === 'undefined') {
      effectiveForm?.setFieldValue?.(autoNameToggleKey, nextValue);
      pendingAutoNameToggleValueRef.current = null;
      pendingAutoNameToggleFrameRef.current = null;
      return;
    }
    pendingAutoNameToggleFrameRef.current = window.requestAnimationFrame(() => {
      effectiveForm?.setFieldValue?.(autoNameToggleKey, nextValue);
      pendingAutoNameToggleValueRef.current = null;
      pendingAutoNameToggleFrameRef.current = null;
    });
  }, [autoNameToggleKey, effectiveForm]);
  const handleQuickCreateCancel = useCallback(() => {
    clearPendingAutoNameToggleWrite();
    onCancel();
  }, [clearPendingAutoNameToggleWrite, onCancel]);
  const handleQuickCreateOk = useCallback(() => {
    flushPendingAutoNameToggleWrite();
    return onOk();
  }, [flushPendingAutoNameToggleWrite, onOk]);
  const parseAssigneeCombo = (value?: string | null) => {
    if (!value) return { assignee_type: null, assignee_id: null };
    const [type, id] = String(value).split('_');
    return { assignee_type: type || 'user', assignee_id: id || null };
  };
  const currentAssigneeComboValue = String(
    watchedAssigneeCombo
    || buildResolvedAssigneeCombo({
      assignee_id: effectiveForm?.getFieldValue?.('assignee_id'),
      assignee_role_id: effectiveForm?.getFieldValue?.('assignee_role_id'),
      assignee_type: effectiveForm?.getFieldValue?.('assignee_type'),
    })
    || ''
  ).trim();
  const currentAssigneePlaceholder = useMemo(() => {
    if (!currentAssigneeComboValue) return null;
    const { assignee_id, assignee_type } = parseAssigneeCombo(currentAssigneeComboValue);
    if (!assignee_id) return null;
    const normalizedType = String(assignee_type || 'user');
    const matchedUser = assignees.users.find((item: any) => String(item?.id || '') === String(assignee_id));
    const matchedRole = assignees.roles.find((item: any) => String(item?.id || '') === String(assignee_id));
    return {
      label: normalizedType === 'role'
        ? (matchedRole?.title || 'تیم انتخاب‌شده')
        : (matchedUser?.display_name || matchedUser?.full_name || 'مسئول انتخاب‌شده'),
      value: currentAssigneeComboValue,
      emoji: normalizedType === 'role' ? <TeamOutlined /> : <UserOutlined />,
      type: normalizedType,
    };
  }, [assignees.roles, assignees.users, currentAssigneeComboValue]);
  const assigneeOptions = useMemo(() => {
    const userOptions = assignees.users.map((user) => ({
      label: user.display_name || user.full_name,
      value: `user_${user.id}`,
      emoji: <UserOutlined />,
    }));
    const roleOptions = assignees.roles.map((role) => ({
      label: role.title,
      value: `role_${role.id}`,
      emoji: <TeamOutlined />,
    }));

    const hasCurrentUser = currentAssigneePlaceholder?.type === 'user'
      && userOptions.some((item) => item.value === currentAssigneePlaceholder.value);
    const hasCurrentRole = currentAssigneePlaceholder?.type === 'role'
      && roleOptions.some((item) => item.value === currentAssigneePlaceholder.value);

    return [
      {
        label: 'پرسنل',
        title: 'users',
        options: currentAssigneePlaceholder?.type === 'user' && !hasCurrentUser
          ? [currentAssigneePlaceholder, ...userOptions]
          : userOptions,
      },
      ...(supportsRoleAssignee ? [{
        label: 'تیم‌ها',
        title: 'roles',
        options: currentAssigneePlaceholder?.type === 'role' && !hasCurrentRole
          ? [currentAssigneePlaceholder, ...roleOptions]
          : roleOptions,
      }] : []),
    ];
  }, [assignees.roles, assignees.users, currentAssigneePlaceholder, supportsRoleAssignee]);
  const visibleFields = useMemo(
    () => (supportsAssignee
      ? fields.filter((field) => !['assignee_id', 'assignee_type', 'assignee_role_id', 'assignee_combo'].includes(String(field?.key || '')))
      : fields)
      .filter((field) => String(field?.key || '') !== 'auto_name_enabled'),
    [fields, supportsAssignee],
  );

  useEffect(() => () => {
    clearPendingAutoNameToggleWrite();
  }, [clearPendingAutoNameToggleWrite]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const stateKey = `quickCreate:${moduleId}:${label}`;
    window.history.pushState({ quickCreateModal: stateKey }, '', window.location.href);
    const handlePopState = () => handleQuickCreateCancel();
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleQuickCreateCancel, label, moduleId, open]);

  useEffect(() => {
    if (!open || !supportsAssignee) return;
    let cancelled = false;

    const loadAssignees = async () => {
      try {
        setAssigneesLoading(true);
        const directory = await fetchAssigneeDirectory(supabase);
        if (!cancelled) {
          setAssignees(directory);
        }
      } catch (err) {
        console.warn('Failed loading assignee directory for quick create', err);
      } finally {
        if (!cancelled) {
          setAssigneesLoading(false);
        }
      }
    };

    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, [open, supportsAssignee]);

  useEffect(() => {
    if (!open || !supportsAssignee || currentAssigneeComboValue) return;
    let cancelled = false;

    const setDefaultAssigneeToCurrentUser = async () => {
      try {
        const snapshot = await fetchSessionBootstrap(supabase);
        const userId = String(snapshot?.user?.id || '').trim();
        if (!userId || cancelled) return;

        effectiveForm.setFieldValue('assignee_combo', `user_${userId}`);
        effectiveForm.setFieldValue('assignee_id', userId);
        effectiveForm.setFieldValue('assignee_role_id', null);
        if (supportsAssigneeType) {
          effectiveForm.setFieldValue('assignee_type', 'user');
        }

        const profile = snapshot?.profile;
        if (profile?.id) {
          setAssignees((prev) => {
            const exists = prev.users.some((item: any) => String(item?.id || '') === userId);
            if (exists) return prev;
            return {
              ...prev,
              users: [
                {
                  id: profile.id,
                  full_name: profile.full_name,
                  display_name: profile.full_name,
                },
                ...prev.users,
              ],
            };
          });
        }
      } catch (err) {
        console.warn('Failed setting default assignee for quick create', err);
      }
    };

    void setDefaultAssigneeToCurrentUser();
    return () => {
      cancelled = true;
    };
  }, [currentAssigneeComboValue, effectiveForm, open, supportsAssignee, supportsAssigneeType]);

  const renderQuickField = (field: ModuleField) => {
    const fieldDynamicOptionsCategory = String((field as any)?.dynamicOptionsCategory || '').trim();
    const mergedFieldOptions = field.type === FieldType.RELATION
      ? (relationOptions[field.key] || [])
      : mergeSelectOptions(
        field.options as any[],
        fieldDynamicOptionsCategory ? dynamicOptions[fieldDynamicOptionsCategory] : [],
      );

    return (
      <SmartFieldRenderer
        field={field}
        value={effectiveForm.getFieldValue(field.key)}
        onChange={(value) => effectiveForm.setFieldValue(field.key, value)}
        compactMode
        forceEditMode={(field as any)?.readonly !== true}
        options={mergedFieldOptions}
        onOptionsUpdate={() => undefined}
        moduleId={moduleId}
        allValues={watchedQuickCreateValues}
        disableRequired
        overlayZIndexBase={childOverlayZIndexBase}
        popupContainer={quickCreatePopupContainer}
      />
    );
  };
  const renderQuickFieldLabel = (field: ModuleField) => (
    <span className="inline-flex items-center gap-1">
      <span>{getFieldLabelFa(field, { moduleId })}</span>
      {field.validation?.required ? <span className="text-red-500">*</span> : null}
    </span>
  );

  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={handleQuickCreateCancel}
      onOk={handleQuickCreateOk}
      okText="افزودن"
      cancelText="انصراف"
      confirmLoading={loading}
      destroyOnHidden
      zIndex={overlayZIndexBase}
      getContainer={typeof document === 'undefined' ? undefined : () => document.body}
      width={typeof window !== 'undefined' && window.innerWidth < 768 ? 'calc(100vw - 0.75rem)' : 560}
      style={{ top: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : undefined }}
      styles={{
        body: {
          paddingBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : undefined,
        },
      }}
    >
      <Form
        form={effectiveForm}
        layout="vertical"
        onFinish={handleQuickCreateOk}
        className="max-h-[72dvh] overflow-y-auto pr-1"
      >
        {showAutoNameToggle && (
          <div className="mb-4 flex flex-col gap-3">
            {showAutoNameToggle && autoNameToggleField && (
              <div className="h-11 flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full px-3 py-1 gap-2">
                <span className="text-xs text-gray-400 shrink-0">{autoNameToggleField.labels?.fa || 'نامگذاری خودکار'}:</span>
                <div className="flex-1 min-w-0">
                  <QuickCreateAutoNameSwitch
                    open={open}
                    field={autoNameToggleField}
                    form={effectiveForm}
                    fallback={autoNameToggleDefault}
                    onImmediateChange={setDeferredAutoNameToggleFormValue}
                    disabled={(autoNameToggleField as any)?.readonly === true}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {supportsAssignee && (
          <>
            <Form.Item name="assignee_id" noStyle>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item name="assignee_type" noStyle>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item name="assignee_role_id" noStyle>
              <Input type="hidden" />
            </Form.Item>
            <div className="mb-4">
              <div className="h-11 flex items-center justify-between sm:justify-start bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full pl-2 sm:pl-1 pr-3 py-1 gap-1 sm:gap-2">
                <span className="text-xs text-gray-400 shrink-0">{assigneeLabel}:</span>
                <Form.Item name="assignee_combo" noStyle>
                  <Select
                    variant="borderless"
                    placeholder="جستجو یا انتخاب مسئول / نقش"
                    className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, 'w-full max-w-full font-semibold text-gray-700 dark:text-gray-300')}
                    styles={{ popup: { root: buildStandardSelectPopupRootStyle({ minWidth: 220, zIndex: childOverlayZIndexBase }) } }}
                    loading={assigneesLoading}
                    options={assigneeOptions}
                    showSearch
                    optionFilterProp="label"
                    optionLabelProp="label"
                    filterOption={(input, option) =>
                      String(option?.label || '').toLowerCase().includes(String(input || '').trim().toLowerCase())
                    }
                    optionRender={(option) => (
                      <Space>
                        <span role="img" aria-label={option.data.label}>{(option.data as any).emoji}</span>
                        {option.data.label}
                      </Space>
                    )}
                    getPopupContainer={quickCreatePopupContainer}
                    onChange={(value) => {
                      const { assignee_id, assignee_type } = parseAssigneeCombo(String(value || ''));
                      const normalizedType = String(assignee_type || 'user');
                      effectiveForm.setFieldValue('assignee_combo', value || null);
                      effectiveForm.setFieldValue('assignee_id', normalizedType === 'role' ? null : (assignee_id || null));
                      effectiveForm.setFieldValue('assignee_role_id', normalizedType === 'role' && supportsRoleAssignee ? assignee_id : null);
                      if (supportsAssigneeType) {
                        effectiveForm.setFieldValue('assignee_type', normalizedType);
                      }
                    }}
                    allowClear
                    onClear={() => {
                      effectiveForm.setFieldValue('assignee_combo', null);
                      effectiveForm.setFieldValue('assignee_id', null);
                      effectiveForm.setFieldValue('assignee_role_id', null);
                      if (supportsAssigneeType) {
                        effectiveForm.setFieldValue('assignee_type', null);
                      }
                    }}
                  />
                </Form.Item>
              </div>
            </div>
          </>
        )}
        {visibleFields.map((field) => (
          <div key={field.key}>
            <Form.Item
              name={field.key}
              hidden
              rules={field.validation?.required ? [{ required: true, message: 'الزامی است' }] : undefined}
            >
              <Input />
            </Form.Item>
            <Form.Item label={renderQuickFieldLabel(field)} className="!mb-4">
              {renderQuickField(field)}
            </Form.Item>
          </div>
        ))}
      </Form>
      <div className="text-xs text-gray-400 mt-1">
        فیلدهای کلیدی، هدر، الزامی و ستون‌های لیست برای ثبت سریع نمایش داده شده‌اند.
      </div>
    </Modal>
  );
};



