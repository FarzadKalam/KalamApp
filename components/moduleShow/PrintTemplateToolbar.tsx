import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterOutlined,
  BarsOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  DownOutlined,
  ExpandOutlined,
  FontSizeOutlined,
  ItalicOutlined,
  MinusOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlusOutlined,
  RedoOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Badge, Button, Divider, Input, InputNumber, Popover, Tooltip } from 'antd';
import type { PrintTemplateVariableOption } from '../../utils/printTemplates/store';

interface PrintTemplateToolbarProps {
  editor: any | null;
  variableOptions?: PrintTemplateVariableOption[];
  activeSectionLabel?: string;
  pageMargins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  onChangePageMargins?: (nextMargins: { top: number; right: number; bottom: number; left: number }) => void;
}

const btnStyle = (active?: boolean) => ({
  borderColor: active ? 'rgb(var(--brand-500-rgb))' : undefined,
  color: active ? 'rgb(var(--brand-500-rgb))' : undefined,
});

const iconBtn = (
  title: string,
  icon: React.ReactNode,
  onClick: () => void,
  disabled?: boolean,
  active?: boolean
) => (
  <Tooltip title={title}>
    <Button
      size="small"
      icon={icon}
      style={btnStyle(active)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
    />
  </Tooltip>
);

const getBrandPalette = () => {
  const fallback = ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#334155'];
  if (typeof window === 'undefined') return fallback;
  const computed = window.getComputedStyle(document.documentElement);
  const keys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
  const colors = keys
    .map((shade) => computed.getPropertyValue(`--brand-${shade}-rgb`).trim())
    .filter(Boolean)
    .map((rgb) => `rgb(${rgb.replace(/\s+/g, ' ').trim()})`);
  return Array.from(new Set(colors.length ? colors : fallback));
};

const PrintTemplateToolbar: React.FC<PrintTemplateToolbarProps> = ({
  editor,
  variableOptions = [],
  activeSectionLabel,
  pageMargins,
  onChangePageMargins,
}) => {
  const [variableSearch, setVariableSearch] = useState('');
  const [textColor, setTextColor] = useState('#111827');
  const [highlightColor, setHighlightColor] = useState('#fde68a');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const brandPalette = useMemo(() => getBrandPalette(), []);
  const currentFontSize = String(editor?.getAttributes?.('textStyle')?.fontSize || '14px');
  const currentLineHeight = String(
    editor?.getAttributes?.('paragraph')?.lineHeight || editor?.getAttributes?.('heading')?.lineHeight || '1.9'
  );

  const filteredVariables = useMemo(() => {
    const q = variableSearch.trim().toLowerCase();
    if (!q) return variableOptions;
    return variableOptions.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q) ||
        String(item.group || '').toLowerCase().includes(q)
    );
  }, [variableOptions, variableSearch]);

  const groupedVariables = useMemo(() => {
    const groups = new Map<string, PrintTemplateVariableOption[]>();
    filteredVariables.forEach((item) => {
      const key = `${item.kind}::${item.group}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const [kind, group] = key.split('::');
      return { kind: kind as 'field' | 'block', group, items };
    });
  }, [filteredVariables]);

  useEffect(() => {
    if (!editor) return;
    const syncColors = () => {
      const markTextColor = String(editor.getAttributes('textStyle')?.color || '').trim();
      const markHighlight = String(editor.getAttributes('highlight')?.color || '').trim();
      if (markTextColor) setTextColor(markTextColor);
      if (markHighlight) setHighlightColor(markHighlight);
    };
    syncColors();
    editor.on('selectionUpdate', syncColors);
    editor.on('update', syncColors);
    return () => {
      editor.off('selectionUpdate', syncColors);
      editor.off('update', syncColors);
    };
  }, [editor]);

  const insertVariable = (item: PrintTemplateVariableOption) => {
    if (!editor) return;
    if (item.kind === 'block' && item.insertHtml) {
      const blockHtml = String(item.insertHtml || '')
        .trim()
        .replace(/>\s+</g, '><');
      if (!blockHtml) return;

      const selection = typeof window !== 'undefined' ? window.getSelection() : null;
      const anchorNode = selection?.anchorNode;
      const anchorElement =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement || null;
      const currentTable = anchorElement?.closest('table') as HTMLElement | null;

      if (currentTable) {
        try {
          const tablePos = editor.view.posAtDOM(currentTable, 0);
          const tableNode = editor.state.doc.nodeAt(tablePos);
          const insertPos = Math.min(
            tablePos + (tableNode?.nodeSize || 1),
            editor.state.doc.content.size
          );
          editor
            .chain()
            .focus()
            .insertContentAt(insertPos, `<p></p>${blockHtml}<p></p>`)
            .run();
          return;
        } catch {
          // fallback to normal insertion
        }
      }

      editor.chain().focus().insertContent(`<p></p>${blockHtml}<p></p>`).run();
      return;
    }
    editor.chain().focus().insertContent(`{{${item.value}}}`).run();
  };

  const insertImageByUrl = () => {
    if (!editor) return;
    const imageUrl = window.prompt('\u0622\u062f\u0631\u0633 \u062a\u0635\u0648\u06cc\u0631 \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f');
    if (!imageUrl || !imageUrl.trim()) return;
    editor.chain().focus().setImage({
      src: imageUrl.trim(),
      width: '180px',
      height: 'auto',
      inlineStyle: 'display:block;width:180px;max-width:180px;height:auto;object-fit:contain;border-radius:10px;'
    }).run();
  };

  const handleLocalImagePick: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (result) {
        editor.chain().focus().setImage({
          src: result,
          width: '180px',
          height: 'auto',
          inlineStyle: 'display:block;width:180px;max-width:180px;height:auto;object-fit:contain;border-radius:10px;'
        }).run();
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const stepFontSize = (delta: number) => {
    if (!editor) return;
    const current = String(editor.getAttributes('textStyle')?.fontSize || '14px');
    const parsed = Number.parseInt(current, 10);
    const next = Math.min(40, Math.max(10, (Number.isFinite(parsed) ? parsed : 14) + delta));
    editor.chain().focus().setFontSize(`${next}px`).run();
  };

  const marginPopoverContent = pageMargins && onChangePageMargins ? (
    <div className="margin-popover-grid">
      {[
        { key: 'top', label: 'بالا' },
        { key: 'right', label: 'راست' },
        { key: 'bottom', label: 'پایین' },
        { key: 'left', label: 'چپ' },
      ].map((item) => (
        <label key={item.key} className="margin-popover-field">
          <span>{item.label}</span>
          <InputNumber
            size="small"
            min={0}
            max={40}
            step={1}
            value={pageMargins[item.key as keyof typeof pageMargins]}
            onChange={(value) =>
              onChangePageMargins({
                ...pageMargins,
                [item.key]: Number(value ?? 0),
              })
            }
            addonAfter="mm"
          />
        </label>
      ))}
    </div>
  ) : null;

  const stepLineHeight = (delta: number) => {
    if (!editor) return;
    const paragraphAttrs = editor.getAttributes('paragraph');
    const headingAttrs = editor.getAttributes('heading');
    const current = Number.parseFloat(String(paragraphAttrs?.lineHeight || headingAttrs?.lineHeight || '1.9'));
    const next = Math.min(3, Math.max(1, Math.round((current + delta) * 10) / 10));
    editor.chain().focus().setLineHeight(String(next)).run();
  };

  return (
    <div className="print-template-toolbar-root">
      {activeSectionLabel && (
        <div className="print-template-toolbar-top">
          <div className="print-template-toolbar-section-badge">بخش فعال: {activeSectionLabel}</div>
        </div>
      )}

      <div className="print-template-toolbar-row">
        {iconBtn('بولد', <BoldOutlined />, () => editor?.chain().focus().toggleBold().run(), !editor, editor?.isActive('bold'))}
        {iconBtn('ایتالیک', <ItalicOutlined />, () => editor?.chain().focus().toggleItalic().run(), !editor, editor?.isActive('italic'))}
        {iconBtn('زیرخط', <UnderlineOutlined />, () => editor?.chain().focus().toggleUnderline().run(), !editor, editor?.isActive('underline'))}
        {iconBtn('تیتر', <FontSizeOutlined />, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), !editor, editor?.isActive('heading', { level: 2 }))}
        {iconBtn(`کوچک‌تر کردن فونت (فعلی: ${currentFontSize})`, <MinusOutlined />, () => stepFontSize(-1), !editor)}
        {iconBtn(`بزرگ‌تر کردن فونت (فعلی: ${currentFontSize})`, <PlusOutlined />, () => stepFontSize(1), !editor)}
        {iconBtn(`کاهش فاصله خطوط (فعلی: ${currentLineHeight})`, <MinusOutlined rotate={90} />, () => stepLineHeight(-0.1), !editor)}
        {iconBtn(`افزایش فاصله خطوط (فعلی: ${currentLineHeight})`, <PlusOutlined rotate={90} />, () => stepLineHeight(0.1), !editor)}
        {iconBtn('لیست نقطه‌ای', <UnorderedListOutlined />, () => editor?.chain().focus().toggleBulletList().run(), !editor, editor?.isActive('bulletList'))}
        {iconBtn('لیست عددی', <OrderedListOutlined />, () => editor?.chain().focus().toggleOrderedList().run(), !editor, editor?.isActive('orderedList'))}
        <Divider type="vertical" />
        {iconBtn('تراز راست', <AlignRightOutlined />, () => editor?.chain().focus().setTextAlign('right').run(), !editor, editor?.isActive({ textAlign: 'right' }))}
        {iconBtn('تراز وسط', <AlignCenterOutlined />, () => editor?.chain().focus().setTextAlign('center').run(), !editor, editor?.isActive({ textAlign: 'center' }))}
        {iconBtn('تراز چپ', <AlignLeftOutlined />, () => editor?.chain().focus().setTextAlign('left').run(), !editor, editor?.isActive({ textAlign: 'left' }))}
        {iconBtn('دوطرفه (justify)', <BarsOutlined />, () => editor?.chain().focus().setTextAlign('justify').run(), !editor, editor?.isActive({ textAlign: 'justify' }))}
        <Divider type="vertical" />
        {iconBtn('جدول', <TableOutlined />, () => editor?.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run(), !editor)}
        {iconBtn('تصویر با آدرس', <PictureOutlined />, insertImageByUrl, !editor)}
        <Tooltip title="آپلود تصویر">
          <Button size="small" icon={<PictureOutlined />} onClick={() => fileInputRef.current?.click()} disabled={!editor} />
        </Tooltip>
        <Divider type="vertical" />
        {iconBtn('Undo', <UndoOutlined />, () => editor?.chain().focus().undo().run(), !editor?.can().undo())}
        {iconBtn('Redo', <RedoOutlined />, () => editor?.chain().focus().redo().run(), !editor?.can().redo())}

        <div className="toolbar-color-box">
          <BgColorsOutlined />
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          <Button
            size="small"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().setColor(textColor).run()}
            disabled={!editor}
          >
            رنگ متن
          </Button>
          <div className="toolbar-color-palette">
            {brandPalette.map((color) => (
              <button
                key={`text-${color}`}
                type="button"
                className="toolbar-color-swatch"
                style={{ background: color }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTextColor(color);
                  editor?.chain().setColor(color).run();
                }}
                title={color}
                aria-label={`رنگ متن ${color}`}
              />
            ))}
          </div>
        </div>

        <div className="toolbar-color-box">
          <BgColorsOutlined />
          <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} />
          <Button
            size="small"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().setHighlight({ color: highlightColor }).run()}
            disabled={!editor}
          >
            هایلایت
          </Button>
          <div className="toolbar-color-palette">
            {brandPalette.map((color) => (
              <button
                key={`highlight-${color}`}
                type="button"
                className="toolbar-color-swatch"
                style={{ background: color }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setHighlightColor(color);
                  editor?.chain().setHighlight({ color }).run();
                }}
                title={color}
                aria-label={`رنگ هایلایت ${color}`}
              />
            ))}
          </div>
        </div>
        {pageMargins && onChangePageMargins && (
          <Popover trigger="click" placement="bottomLeft" content={marginPopoverContent}>
            <Tooltip title="فاصله اطراف صفحه">
              <Button size="small" icon={<ExpandOutlined />} />
            </Tooltip>
          </Popover>
        )}
      </div>

      {variableOptions.length > 0 && (
        <div className="print-template-toolbar-row variables-row">
          <Input
            size="small"
            placeholder="جست‌وجوی متغیر"
            value={variableSearch}
            onChange={(e) => setVariableSearch(e.target.value)}
            className="toolbar-search"
          />
          <div className="toolbar-variable-popovers">
            {groupedVariables.map((group) => (
              <Popover
                key={`${group.kind}-${group.group}`}
                trigger="click"
                placement="bottomRight"
                overlayClassName="print-variable-popover"
                content={
                  <div className="popover-variable-list">
                    {group.items.length === 0 ? (
                      <div className="popover-empty">موردی پیدا نشد</div>
                    ) : (
                      group.items.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`popover-variable-item ${item.kind === 'block' ? 'block-item' : ''}`}
                          onClick={() => insertVariable(item)}
                          disabled={!editor}
                        >
                          <span className="popover-variable-title">{item.label}</span>
                          <span className="popover-variable-value">{item.description || item.value}</span>
                        </button>
                      ))
                    )}
                  </div>
                }
              >
                <button type="button" className={`variable-group-pill ${group.kind === 'block' ? 'block-pill' : ''}`}>
                  <span>{group.group}</span>
                  <Badge count={group.items.length} style={{ backgroundColor: group.kind === 'block' ? '#8b5cf6' : '#0f766e' }} />
                  <DownOutlined className="text-[10px]" />
                </button>
              </Popover>
            ))}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLocalImagePick} style={{ display: 'none' }} />

      <style>{`
        .print-template-toolbar-root {
          position: sticky;
          top: 0;
          z-index: 12;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.96));
          backdrop-filter: blur(14px);
          box-shadow: 0 16px 30px rgba(15,23,42,0.08);
        }
        .dark .print-template-toolbar-root {
          background: linear-gradient(180deg, rgba(15,23,42,0.94), rgba(17,24,39,0.98));
          border-color: rgba(71, 85, 105, 0.5);
          box-shadow: 0 16px 30px rgba(2,6,23,0.35);
        }
        .print-template-toolbar-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .print-template-toolbar-section-badge {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          border-radius: 999px;
          padding: 6px 12px;
          background: rgba(var(--brand-500-rgb), 0.08);
        }
        .dark .print-template-toolbar-section-badge {
          color: #e2e8f0;
        }
        .print-template-toolbar-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .toolbar-color-box {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.84);
        }
        .dark .toolbar-color-box {
          background: rgba(15,23,42,0.72);
          border-color: rgba(71,85,105,0.44);
        }
        .toolbar-color-box input {
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
        }
        .toolbar-color-palette {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          max-width: 160px;
        }
        .toolbar-color-swatch {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          cursor: pointer;
          padding: 0;
        }
        .variable-group-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.24);
          padding: 6px 12px;
          background: rgba(255,255,255,0.82);
          font-size: 12px;
          color: #334155;
          cursor: pointer;
        }
        .variable-group-pill:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .dark .variable-group-pill {
          background: rgba(15,23,42,0.72);
          border-color: rgba(71,85,105,0.42);
          color: #e2e8f0;
        }
        .variable-group-pill.block-pill {
          border-color: rgba(124,58,237,0.22);
          background: rgba(245,243,255,0.92);
          color: #6d28d9;
        }
        .dark .variable-group-pill.block-pill {
          background: rgba(91,33,182,0.2);
          color: #ddd6fe;
        }
        .variables-row {
          align-items: center;
        }
        .toolbar-search {
          max-width: 240px;
        }
        .toolbar-variable-popovers {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        .popover-variable-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 260px;
          max-width: 360px;
          max-height: 320px;
          overflow: auto;
        }
        .popover-variable-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          text-align: right;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.2);
          padding: 10px 12px;
          background: rgba(255,255,255,0.82);
          cursor: pointer;
        }
        .popover-variable-item.block-item {
          border-color: rgba(124,58,237,0.18);
          background: rgba(245,243,255,0.86);
        }
        .popover-variable-item:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .popover-variable-title {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }
        .popover-variable-value {
          font-size: 11px;
          color: #64748b;
          line-height: 1.7;
        }
        .popover-empty {
          padding: 10px;
          font-size: 12px;
          color: #64748b;
        }
        .margin-popover-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(120px, 1fr));
          gap: 10px;
          min-width: 280px;
        }
        .margin-popover-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: #475569;
        }
        .dark .margin-popover-field {
          color: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

export default PrintTemplateToolbar;
