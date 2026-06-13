import type { CSSProperties } from 'react';
import type { StoredPrintTemplate } from './store';

export type PrintLetterheadOrientation = 'portrait' | 'landscape';
export type PrintLetterheadSlotId = 'portrait_1' | 'portrait_2' | 'landscape_1' | 'landscape_2';
export type PrintLetterheadItemType = 'date' | 'number' | 'attachment' | 'title' | 'qr' | 'body' | 'signatures';

export interface PrintLetterheadLayoutItem {
  id: string;
  type: PrintLetterheadItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  zIndex: number;
}

export interface PrintLetterheadLayout {
  version: 1;
  orientation: PrintLetterheadOrientation;
  items: PrintLetterheadLayoutItem[];
}

export interface PrintLetterheadConfig {
  id: string;
  slotId: PrintLetterheadSlotId;
  orientation: PrintLetterheadOrientation;
  title: string;
  imageUrl: string | null;
  isActive: boolean;
  layout: PrintLetterheadLayout;
  sortOrder: number;
}

export const PRINT_LETTERHEAD_ITEM_LABELS: Record<PrintLetterheadItemType, string> = {
  date: 'تاریخ',
  number: 'شماره',
  attachment: 'پیوست',
  title: 'عنوان',
  qr: 'QR',
  body: 'بدنه',
  signatures: 'ردیف امضاها',
};

export const PRINT_LETTERHEAD_SLOT_ORDER: Array<{
  slotId: PrintLetterheadSlotId;
  orientation: PrintLetterheadOrientation;
  label: string;
  sortOrder: number;
}> = [
  { slotId: 'portrait_1', orientation: 'portrait', label: 'سربرگ عمودی ۱', sortOrder: 1 },
  { slotId: 'portrait_2', orientation: 'portrait', label: 'سربرگ عمودی ۲', sortOrder: 2 },
  { slotId: 'landscape_1', orientation: 'landscape', label: 'سربرگ افقی ۱', sortOrder: 3 },
  { slotId: 'landscape_2', orientation: 'landscape', label: 'سربرگ افقی ۲', sortOrder: 4 },
];

const LETTERHEAD_VARIANT_PREFIX = 'org_letterhead::';
const normalizeText = (value: unknown) => String(value || '').trim();
const toNumberInRange = (value: unknown, fallback: number, min = 0, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const isItemType = (value: unknown): value is PrintLetterheadItemType =>
  ['date', 'number', 'attachment', 'title', 'qr', 'body', 'signatures'].includes(String(value || '').trim());

const createDefaultLayoutItem = (
  type: PrintLetterheadItemType,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  visible = true,
): PrintLetterheadLayoutItem => ({
  id: `item_${type}`,
  type,
  x,
  y,
  width,
  height,
  visible,
  zIndex,
});

export const buildDefaultPrintLetterheadLayout = (
  orientation: PrintLetterheadOrientation,
): PrintLetterheadLayout => ({
  version: 1,
  orientation,
  items:
    orientation === 'landscape'
      ? [
          createDefaultLayoutItem('title', 36, 7, 28, 5, 4, true),
          createDefaultLayoutItem('date', 71, 8, 16, 4, 4, true),
          createDefaultLayoutItem('number', 71, 13, 16, 4, 4, true),
          createDefaultLayoutItem('attachment', 71, 18, 16, 4, 4, true),
          createDefaultLayoutItem('qr', 88, 7, 8, 11, 3, true),
          createDefaultLayoutItem('body', 7, 24, 89, 56, 1, true),
          createDefaultLayoutItem('signatures', 7, 82, 89, 12, 2, true),
        ]
      : [
          createDefaultLayoutItem('title', 30, 7, 40, 5, 4, true),
          createDefaultLayoutItem('date', 72, 8, 18, 4, 4, true),
          createDefaultLayoutItem('number', 72, 13, 18, 4, 4, true),
          createDefaultLayoutItem('attachment', 72, 18, 18, 4, 4, true),
          createDefaultLayoutItem('qr', 8, 8, 14, 10, 3, true),
          createDefaultLayoutItem('body', 7, 25, 86, 58, 1, true),
          createDefaultLayoutItem('signatures', 7, 85, 86, 10, 2, true),
        ],
});

const normalizeLayoutItems = (
  orientation: PrintLetterheadOrientation,
  rawItems: unknown,
): PrintLetterheadLayoutItem[] => {
  const defaults = buildDefaultPrintLetterheadLayout(orientation).items;
  const defaultByType = new Map(defaults.map((item) => [item.type, item]));
  const next = Array.isArray(rawItems) ? rawItems : [];
  const normalized = next
    .map((item: any) => {
      const type = isItemType(item?.type) ? item.type : null;
      if (!type) return null;
      const fallback = defaultByType.get(type) || defaults[0];
      return {
        id: normalizeText(item?.id) || fallback.id,
        type,
        x: toNumberInRange(item?.x, fallback.x),
        y: toNumberInRange(item?.y, fallback.y),
        width: toNumberInRange(item?.width, fallback.width, 4, 100),
        height: toNumberInRange(item?.height, fallback.height, 3, 100),
        visible: type === 'body' || type === 'signatures' ? true : item?.visible !== false,
        zIndex: Number.isFinite(Number(item?.zIndex)) ? Number(item.zIndex) : fallback.zIndex,
      } satisfies PrintLetterheadLayoutItem;
    })
    .filter(Boolean) as PrintLetterheadLayoutItem[];

  const typeSet = new Set(normalized.map((item) => item.type));
  defaults.forEach((item) => {
    if (!typeSet.has(item.type)) {
      normalized.push({ ...item });
    }
  });

  return normalized.sort((left, right) => left.zIndex - right.zIndex);
};

export const normalizePrintLetterheadLayout = (
  rawLayout: unknown,
  orientation: PrintLetterheadOrientation,
): PrintLetterheadLayout => {
  const raw = rawLayout && typeof rawLayout === 'object' ? (rawLayout as Record<string, any>) : {};
  return {
    version: 1,
    orientation,
    items: normalizeLayoutItems(orientation, raw.items),
  };
};

const buildDefaultLetterheadConfig = (
  slotId: PrintLetterheadSlotId,
  orientation: PrintLetterheadOrientation,
  label: string,
  sortOrder: number,
): PrintLetterheadConfig => ({
  id: slotId,
  slotId,
  orientation,
  title: label,
  imageUrl: null,
  isActive: false,
  layout: buildDefaultPrintLetterheadLayout(orientation),
  sortOrder,
});

const normalizeLegacyLetterheads = (raw: Record<string, any>): PrintLetterheadConfig[] => {
  const variants = [
    {
      slotId: 'portrait_1' as const,
      orientation: 'portrait' as const,
      url: normalizeText(raw.print_letterhead_portrait_url || raw.letterhead_portrait_url),
      layout: raw.print_letterhead_portrait_layout || raw.letterhead_portrait_layout,
    },
    {
      slotId: 'landscape_1' as const,
      orientation: 'landscape' as const,
      url: normalizeText(raw.print_letterhead_landscape_url || raw.letterhead_landscape_url),
      layout: raw.print_letterhead_landscape_layout || raw.letterhead_landscape_layout,
    },
  ];

  return variants
    .filter((item) => item.url)
    .map((item) => {
      const slotMeta = PRINT_LETTERHEAD_SLOT_ORDER.find((entry) => entry.slotId === item.slotId)!;
      return {
        id: item.slotId,
        slotId: item.slotId,
        orientation: item.orientation,
        title: slotMeta.label,
        imageUrl: item.url || null,
        isActive: true,
        layout: normalizePrintLetterheadLayout(item.layout, item.orientation),
        sortOrder: slotMeta.sortOrder,
      } satisfies PrintLetterheadConfig;
    });
};

export const normalizePrintLetterheads = (rawValue: unknown): PrintLetterheadConfig[] => {
  const rawArray = Array.isArray(rawValue)
    ? rawValue
    : rawValue && typeof rawValue === 'object'
      ? normalizeLegacyLetterheads(rawValue as Record<string, any>)
      : [];

  const normalizedMap = new Map<PrintLetterheadSlotId, PrintLetterheadConfig>();
  PRINT_LETTERHEAD_SLOT_ORDER.forEach((slot) => {
    normalizedMap.set(
      slot.slotId,
      buildDefaultLetterheadConfig(slot.slotId, slot.orientation, slot.label, slot.sortOrder),
    );
  });

  rawArray.forEach((entry: any, index) => {
    const slotId = normalizeText(entry?.slotId || entry?.id) as PrintLetterheadSlotId;
    const slotMeta = PRINT_LETTERHEAD_SLOT_ORDER.find((slot) => slot.slotId === slotId);
    if (!slotMeta) return;
    normalizedMap.set(slotId, {
      id: slotId,
      slotId,
      orientation: slotMeta.orientation,
      title: normalizeText(entry?.title) || slotMeta.label,
      imageUrl: normalizeText(entry?.imageUrl || entry?.image_url) || null,
      isActive: entry?.isActive === true,
      layout: normalizePrintLetterheadLayout(entry?.layout, slotMeta.orientation),
      sortOrder: Number.isFinite(Number(entry?.sortOrder)) ? Number(entry.sortOrder) : slotMeta.sortOrder ?? index + 1,
    });
  });

  return PRINT_LETTERHEAD_SLOT_ORDER.map((slot) => normalizedMap.get(slot.slotId)!).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
};

export const getPrintLetterheadSlotLabel = (slotId: PrintLetterheadSlotId) =>
  PRINT_LETTERHEAD_SLOT_ORDER.find((slot) => slot.slotId === slotId)?.label || slotId;

export const getPrintLetterheadItemLabel = (type: PrintLetterheadItemType) =>
  PRINT_LETTERHEAD_ITEM_LABELS[type] || type;

export const getPrintLetterheadBySlotId = (
  letterheads: PrintLetterheadConfig[],
  slotId: PrintLetterheadSlotId,
) => normalizePrintLetterheads(letterheads).find((item) => item.slotId === slotId) || null;

export const getPrintLetterheadById = (letterheads: PrintLetterheadConfig[], letterheadId?: string | null) =>
  normalizePrintLetterheads(letterheads).find((item) => item.id === normalizeText(letterheadId)) || null;

export const getActivePrintLetterheads = (
  letterheads: PrintLetterheadConfig[],
  orientation?: PrintLetterheadOrientation | null,
) =>
  normalizePrintLetterheads(letterheads).filter(
    (item) =>
      item.isActive &&
      Boolean(normalizeText(item.imageUrl)) &&
      (!orientation || item.orientation === orientation),
  );

export const isEligibleForPrintLetterheadVariant = (template: StoredPrintTemplate | null | undefined) =>
  Boolean(
    template?.isSystem === true &&
    template?.renderMode !== 'org_letterhead' &&
    template?.scope &&
    !String(template?.id || '').includes('_catalog_fullpage_')
  );

export const buildOrgLetterheadVariantId = (templateId: string, letterheadId: string) =>
  `${LETTERHEAD_VARIANT_PREFIX}${normalizeText(templateId)}::${normalizeText(letterheadId)}`;

export const parseOrgLetterheadVariantId = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized.startsWith(LETTERHEAD_VARIANT_PREFIX)) return null;
  const payload = normalized.slice(LETTERHEAD_VARIANT_PREFIX.length);
  const [sourceTemplateId, letterheadId] = payload.split('::');
  if (!sourceTemplateId || !letterheadId) return null;
  return {
    sourceTemplateId: normalizeText(sourceTemplateId),
    letterheadId: normalizeText(letterheadId),
  };
};

export const buildPrintLetterheadVariants = (
  templates: StoredPrintTemplate[],
  letterheads: PrintLetterheadConfig[],
): StoredPrintTemplate[] => {
  const activeLetterheads = getActivePrintLetterheads(letterheads);
  if (activeLetterheads.length === 0) return templates;

  const variants = templates.flatMap((template) => {
    if (!isEligibleForPrintLetterheadVariant(template)) return [];
    return activeLetterheads
      .filter((letterhead) => letterhead.orientation === (template.orientation || 'portrait'))
      .map((letterhead) => ({
        ...template,
        id: buildOrgLetterheadVariantId(template.id, letterhead.id),
        title: `${template.title} - ${normalizeText(letterhead.title) || getPrintLetterheadSlotLabel(letterhead.slotId)}`,
        description: `${template.description || 'قالب سیستمی'} با ${normalizeText(letterhead.title) || getPrintLetterheadSlotLabel(letterhead.slotId)}`,
        renderMode: 'org_letterhead' as const,
        sourceTemplateId: template.id,
        letterheadId: letterhead.id,
        isVirtual: true,
      }));
  });

  return [...templates, ...variants];
};

export const getPrintLetterheadLayoutItem = (
  layout: PrintLetterheadLayout | null | undefined,
  type: PrintLetterheadItemType,
) => {
  const items = Array.isArray(layout?.items) ? layout!.items : [];
  return items.find((item) => item.type === type) || null;
};

export const toPercentStyle = (item: PrintLetterheadLayoutItem): CSSProperties => ({
  position: 'absolute',
  left: `${item.x}%`,
  top: `${item.y}%`,
  width: `${item.width}%`,
  height: `${item.height}%`,
  zIndex: item.zIndex,
  boxSizing: 'border-box',
});
