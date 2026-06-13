import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, InputNumber, Modal, Switch, Typography } from 'antd';
import ResilientImage from '../common/ResilientImage';
import {
  buildDefaultPrintLetterheadLayout,
  getPrintLetterheadItemLabel,
  normalizePrintLetterheadLayout,
  toPercentStyle,
  type PrintLetterheadConfig,
  type PrintLetterheadItemType,
  type PrintLetterheadLayout,
  type PrintLetterheadLayoutItem,
} from '../../utils/printTemplates/letterheads';

interface PrintLetterheadDesignerModalProps {
  open: boolean;
  letterhead: PrintLetterheadConfig | null;
  onClose: () => void;
  onSave: (layout: PrintLetterheadLayout) => void;
}

type DragMode =
  | { type: 'move'; itemId: string; startX: number; startY: number; initial: PrintLetterheadLayoutItem }
  | { type: 'resize'; itemId: string; startX: number; startY: number; initial: PrintLetterheadLayoutItem; corner: 'br' | 'bl' | 'tr' | 'tl' }
  | null;

const DESIGNER_FRAME_WIDTH = 760;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const OPTIONAL_ITEM_TYPES = new Set<PrintLetterheadItemType>(['date', 'number', 'attachment', 'title', 'qr']);

const getFrameHeight = (orientation: 'portrait' | 'landscape') =>
  orientation === 'landscape' ? Math.round((DESIGNER_FRAME_WIDTH * 210) / 297) : Math.round((DESIGNER_FRAME_WIDTH * 297) / 210);

const updateLayoutItem = (
  items: PrintLetterheadLayoutItem[],
  itemId: string,
  updater: (item: PrintLetterheadLayoutItem) => PrintLetterheadLayoutItem,
) => items.map((item) => (item.id === itemId ? updater(item) : item));

const resizeByCorner = (
  item: PrintLetterheadLayoutItem,
  deltaXPercent: number,
  deltaYPercent: number,
  corner: 'br' | 'bl' | 'tr' | 'tl',
) => {
  let next = { ...item };
  if (corner === 'br') {
    next.width = clamp(item.width + deltaXPercent, 4, 100 - item.x);
    next.height = clamp(item.height + deltaYPercent, 3, 100 - item.y);
  } else if (corner === 'bl') {
    const nextX = clamp(item.x + deltaXPercent, 0, item.x + item.width - 4);
    next.width = clamp(item.width - (nextX - item.x), 4, 100);
    next.x = nextX;
    next.height = clamp(item.height + deltaYPercent, 3, 100 - item.y);
  } else if (corner === 'tr') {
    next.width = clamp(item.width + deltaXPercent, 4, 100 - item.x);
    const nextY = clamp(item.y + deltaYPercent, 0, item.y + item.height - 3);
    next.height = clamp(item.height - (nextY - item.y), 3, 100);
    next.y = nextY;
  } else {
    const nextX = clamp(item.x + deltaXPercent, 0, item.x + item.width - 4);
    const nextY = clamp(item.y + deltaYPercent, 0, item.y + item.height - 3);
    next.width = clamp(item.width - (nextX - item.x), 4, 100);
    next.height = clamp(item.height - (nextY - item.y), 3, 100);
    next.x = nextX;
    next.y = nextY;
  }
  return {
    ...next,
    x: round2(next.x),
    y: round2(next.y),
    width: round2(next.width),
    height: round2(next.height),
  };
};

const PrintLetterheadDesignerModal: React.FC<PrintLetterheadDesignerModalProps> = ({
  open,
  letterhead,
  onClose,
  onSave,
}) => {
  const [draftLayout, setDraftLayout] = useState<PrintLetterheadLayout | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragMode>(null);

  useEffect(() => {
    if (!open || !letterhead) return;
    const normalized = normalizePrintLetterheadLayout(letterhead.layout, letterhead.orientation);
    setDraftLayout(normalized);
    setSelectedItemId(normalized.items.find((item) => item.type === 'body')?.id || normalized.items[0]?.id || '');
  }, [letterhead, open]);

  useEffect(() => {
    if (!open) return;
    const handleMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      const frame = frameRef.current;
      if (!state || !frame || !draftLayout) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const deltaXPercent = ((event.clientX - state.startX) / rect.width) * 100;
      const deltaYPercent = ((event.clientY - state.startY) / rect.height) * 100;
      if (state.type === 'move') {
        setDraftLayout((prev) =>
          !prev
            ? prev
            : {
                ...prev,
                items: updateLayoutItem(prev.items, state.itemId, (item) => ({
                  ...item,
                  x: round2(clamp(state.initial.x + deltaXPercent, 0, 100 - item.width)),
                  y: round2(clamp(state.initial.y + deltaYPercent, 0, 100 - item.height)),
                })),
              },
        );
      } else if (state.type === 'resize') {
        setDraftLayout((prev) =>
          !prev
            ? prev
            : {
                ...prev,
                items: updateLayoutItem(prev.items, state.itemId, () =>
                  resizeByCorner(state.initial, deltaXPercent, deltaYPercent, state.corner),
                ),
              },
        );
      }
    };
    const handleUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draftLayout, open]);

  const selectedItem = useMemo(
    () => draftLayout?.items.find((item) => item.id === selectedItemId) || null,
    [draftLayout, selectedItemId],
  );

  const orientation = letterhead?.orientation || 'portrait';
  const frameHeight = getFrameHeight(orientation);
  const layout = draftLayout || buildDefaultPrintLetterheadLayout(orientation);

  const startMove = (event: React.PointerEvent, item: PrintLetterheadLayoutItem) => {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      type: 'move',
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      initial: item,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
    setSelectedItemId(item.id);
  };

  const startResize = (
    event: React.PointerEvent,
    item: PrintLetterheadLayoutItem,
    corner: 'br' | 'bl' | 'tr' | 'tl',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      type: 'resize',
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      initial: item,
      corner,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    setSelectedItemId(item.id);
  };

  const handleChangeSelectedItem = (key: 'x' | 'y' | 'width' | 'height', value: number | null) => {
    if (!selectedItem || !draftLayout || !Number.isFinite(Number(value))) return;
    const nextValue = Number(value);
    setDraftLayout({
      ...draftLayout,
      items: updateLayoutItem(draftLayout.items, selectedItem.id, (item) => {
        if (key === 'x') return { ...item, x: round2(clamp(nextValue, 0, 100 - item.width)) };
        if (key === 'y') return { ...item, y: round2(clamp(nextValue, 0, 100 - item.height)) };
        if (key === 'width') return { ...item, width: round2(clamp(nextValue, 4, 100 - item.x)) };
        return { ...item, height: round2(clamp(nextValue, 3, 100 - item.y)) };
      }),
    });
  };

  const handleToggleSelectedItemVisibility = (checked: boolean) => {
    if (!selectedItem || !draftLayout || !OPTIONAL_ITEM_TYPES.has(selectedItem.type)) return;
    setDraftLayout({
      ...draftLayout,
      items: updateLayoutItem(draftLayout.items, selectedItem.id, (item) => ({ ...item, visible: checked })),
    });
  };

  return (
    <Modal
      title={letterhead ? `شخصی‌سازی ${letterhead.title}` : 'شخصی‌سازی سربرگ'}
      open={open}
      onCancel={onClose}
      onOk={() => draftLayout && onSave(draftLayout)}
      okText="ذخیره چیدمان"
      cancelText="بستن"
      width={1180}
      destroyOnHidden
    >
      {!letterhead ? null : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-4 overflow-auto">
            <div
              ref={frameRef}
              className="relative mx-auto overflow-hidden rounded-[20px] border border-slate-300 dark:border-slate-700 bg-white shadow-xl"
              style={{ width: DESIGNER_FRAME_WIDTH, height: frameHeight, maxWidth: '100%' }}
            >
              <ResilientImage
                src={letterhead.imageUrl || ''}
                preset="gallery"
                alt={letterhead.title}
                className="absolute inset-0 w-full h-full object-fill select-none pointer-events-none"
              />
              {layout.items.map((item) => {
                const isSelected = item.id === selectedItemId;
                return (
                  <div
                    key={item.id}
                    className={`absolute rounded-xl border-2 ${isSelected ? 'border-leather-500 shadow-[0_0_0_2px_rgba(var(--brand-500-rgb),0.18)]' : 'border-slate-400/70'} ${item.visible === false ? 'opacity-40' : ''}`}
                    style={{
                      ...toPercentStyle(item),
                      background: item.type === 'body' ? 'rgba(15,118,110,0.12)' : item.type === 'signatures' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.78)',
                      cursor: 'move',
                      overflow: 'hidden',
                    }}
                    onPointerDown={(event) => startMove(event, item)}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="flex h-full w-full flex-col justify-between p-2 text-[11px] font-semibold text-slate-700">
                      <span>{getPrintLetterheadItemLabel(item.type)}</span>
                      <span className="text-[10px] text-slate-500">{`${round2(item.width)} × ${round2(item.height)}`}</span>
                    </div>
                    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        className="absolute h-3 w-3 rounded-full border border-white bg-leather-500 shadow"
                        style={{
                          top: corner.startsWith('t') ? -6 : undefined,
                          bottom: corner.startsWith('b') ? -6 : undefined,
                          left: corner.endsWith('l') ? -6 : undefined,
                          right: corner.endsWith('r') ? -6 : undefined,
                          cursor: 'nwse-resize',
                        }}
                        onPointerDown={(event) => startResize(event, item, corner)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/40 p-4 flex flex-col gap-4">
            <Typography.Text className="text-sm text-slate-500 dark:text-slate-300">
              هر کادر را بکشید یا از گوشه‌هایش اندازه را تغییر دهید. مختصات به‌صورت درصدی ذخیره می‌شود تا روی اندازه‌های مختلف همان جهت صفحه پایدار بماند.
            </Typography.Text>

            {!selectedItem ? null : (
              <>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div className="font-bold text-slate-800 dark:text-slate-100">{getPrintLetterheadItemLabel(selectedItem.type)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedItem.type === 'body' || selectedItem.type === 'signatures'
                      ? 'این ناحیه‌ها همیشه فعال می‌مانند و فقط جابه‌جایی و تغییر اندازه دارند.'
                      : 'می‌توانید نمایش این فیلد را خاموش یا روشن کنید.'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-slate-500">X</div>
                    <InputNumber className="w-full" min={0} max={100} value={selectedItem.x} onChange={(value) => handleChangeSelectedItem('x', value)} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">Y</div>
                    <InputNumber className="w-full" min={0} max={100} value={selectedItem.y} onChange={(value) => handleChangeSelectedItem('y', value)} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">عرض</div>
                    <InputNumber className="w-full" min={4} max={100} value={selectedItem.width} onChange={(value) => handleChangeSelectedItem('width', value)} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">ارتفاع</div>
                    <InputNumber className="w-full" min={3} max={100} value={selectedItem.height} onChange={(value) => handleChangeSelectedItem('height', value)} />
                  </div>
                </div>

                {OPTIONAL_ITEM_TYPES.has(selectedItem.type) ? (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <span className="text-sm text-slate-600 dark:text-slate-300">نمایش این فیلد</span>
                    <Switch checked={selectedItem.visible !== false} onChange={handleToggleSelectedItemVisibility} />
                  </div>
                ) : null}
              </>
            )}

            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-3 text-xs text-slate-500 dark:text-slate-400">
              در زمان چاپ، فقط بدنه داخل ناحیه «بدنه» صفحه‌بندی می‌شود و ردیف امضاها در ناحیه «ردیف امضاها» روی همه صفحات تکرار خواهد شد.
            </div>

            <Button onClick={() => setDraftLayout(buildDefaultPrintLetterheadLayout(orientation))}>بازگشت به چیدمان پیش‌فرض</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PrintLetterheadDesignerModal;
