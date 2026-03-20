import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  BgColorsOutlined,
  CompressOutlined,
  DeleteOutlined,
  ExpandOutlined,
  MinusOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Button, Divider, Tooltip } from 'antd';
import { Extension } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';

interface PrintTemplateEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  onEditorReady?: (editor: any | null) => void;
  onFocusSection?: () => void;
}

const mergeStyleParts = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: () => ({}),
      },
      printBlock: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-print-block') || null,
        renderHTML: (attributes) => {
          if (!attributes.printBlock) return {};
          return {
            'data-print-block': attributes.printBlock,
          };
        },
      },
      borderColor: {
        default: '#d1d5db',
        parseHTML: (element) =>
          element.getAttribute('data-border-color') ||
          element.style.getPropertyValue('--table-border-color') ||
          element.style.borderColor ||
          '#d1d5db',
        renderHTML: (attributes) => {
          const borderColor = attributes.borderColor || '#d1d5db';
          const baseStyle = mergeStyleParts(attributes.inlineStyle);
          return {
            'data-border-color': borderColor,
            style: mergeStyleParts(baseStyle, `--table-border-color: ${borderColor}; border-color: ${borderColor};`),
          };
        },
      },
    };
  },
});

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: () => ({}),
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-background-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          const baseStyle = mergeStyleParts(attributes.inlineStyle);
          if (!attributes.backgroundColor) return baseStyle ? { style: baseStyle } : {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: mergeStyleParts(baseStyle, `background-color: ${attributes.backgroundColor};`),
          };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: () => ({}),
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-background-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          const baseStyle = mergeStyleParts(attributes.inlineStyle);
          if (!attributes.backgroundColor) return baseStyle ? { style: baseStyle } : {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: mergeStyleParts(baseStyle, `background-color: ${attributes.backgroundColor};`),
          };
        },
      },
    };
  },
});

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ chain }: any) =>
          chain().updateAttributes('paragraph', { lineHeight }).updateAttributes('heading', { lineHeight }).run(),
      unsetLineHeight:
        () =>
        ({ chain }: any) =>
          chain().updateAttributes('paragraph', { lineHeight: null }).updateAttributes('heading', { lineHeight: null }).run(),
    } as any;
  },
});

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
        renderHTML: () => ({}),
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height') || element.style.height || null,
        renderHTML: () => ({}),
      },
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const width = String(HTMLAttributes.width || '').trim();
    const height = String(HTMLAttributes.height || '').trim();
    const inlineStyle = String(HTMLAttributes.inlineStyle || '').trim();
    const sizeStyle = [
      width ? `width:${width}` : '',
      height ? `height:${height}` : '',
    ]
      .filter(Boolean)
      .join(';');
    const style = [inlineStyle, sizeStyle].filter(Boolean).join(';');
    const attrs: Record<string, any> = {
      src: HTMLAttributes.src,
      alt: HTMLAttributes.alt,
      title: HTMLAttributes.title,
    };
    if (style) attrs.style = style;
    return ['img', attrs];
  },
});

const StyledParagraph = Paragraph.extend({
  parseHTML() {
    return [{ tag: 'p' }, { tag: 'div' }];
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: (attributes) => (attributes.inlineStyle ? { style: attributes.inlineStyle } : {}),
      },
    };
  },
});

const StyledHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inlineStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: (attributes) => (attributes.inlineStyle ? { style: attributes.inlineStyle } : {}),
      },
    };
  },
});

const iconBtn = (title: string, icon: React.ReactNode, onClick: () => void, disabled?: boolean) => (
  <Tooltip title={title}>
    <Button size="small" icon={icon} onClick={onClick} disabled={disabled} />
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

const PrintTemplateEditor: React.FC<PrintTemplateEditorProps> = ({
  value,
  onChange,
  placeholder = 'قالب چاپ را اینجا طراحی کنید...',
  minHeight = 240,
  onEditorReady,
  onFocusSection,
}) => {
  const [cellColor, setCellColor] = useState('#fef3c7');
  const [tableBorderColor, setTableBorderColor] = useState('#d1d5db');
  const brandPalette = useMemo(() => getBrandPalette(), []);
  const cellDragSelectionRef = useRef<null | {
    table: HTMLTableElement;
    startCell: HTMLElement;
  }>(null);

  const selectTableRow = () => {
    if (!editor) return;
    const selection = editor.state.selection as any;
    const $anchorCell = selection?.$anchorCell;
    if (!$anchorCell) return;
    const tr = editor.state.tr.setSelection(CellSelection.rowSelection($anchorCell));
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const selectTableColumn = () => {
    if (!editor) return;
    const selection = editor.state.selection as any;
    const $anchorCell = selection?.$anchorCell;
    if (!$anchorCell) return;
    const tr = editor.state.tr.setSelection(CellSelection.colSelection($anchorCell));
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const selectCurrentTable = () => {
    if (!editor) return;
    const table = getActiveTableDom();
    if (!table) return;
    const tablePos = editor.view.posAtDOM(table, 0);
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tablePos));
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const getActiveTableDom = () => {
    if (typeof window === 'undefined') return null;
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement || null;
    return anchorElement?.closest('table') as HTMLTableElement | null;
  };

  const getSelectedImageWidth = () => {
    if (!editor || !editor.isActive('image')) return null;
    const attrs = editor.getAttributes('image') as Record<string, any>;
    const widthRaw = String(attrs?.width || '').trim();
    const styleRaw = String(attrs?.inlineStyle || '').trim();
    const styleWidth = styleRaw.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)?.[1]?.trim() || '';
    const parsed = Number.parseInt((widthRaw || styleWidth || '').replace('px', '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const updateImageSizing = (next: { width?: string | null; height?: string | null; inlineStyle?: string | null }) => {
    if (!editor || !editor.isActive('image')) return;
    const attrs = editor.getAttributes('image') as Record<string, any>;
    editor
      .chain()
      .focus()
      .updateAttributes('image', {
        width: next.width ?? attrs?.width ?? null,
        height: next.height ?? attrs?.height ?? null,
        inlineStyle: next.inlineStyle ?? attrs?.inlineStyle ?? null,
      })
      .run();
  };

  const stepImageWidth = (delta: number) => {
    const current = getSelectedImageWidth() || 120;
    const nextWidth = Math.max(32, Math.min(900, current + delta));
    updateImageSizing({
      width: `${nextWidth}px`,
      height: 'auto',
      inlineStyle: `display:block;max-width:100%;width:${nextWidth}px;height:auto;object-fit:contain;`,
    });
  };

  const fitImageToCell = () => {
    updateImageSizing({
      width: '100%',
      height: 'auto',
      inlineStyle: 'display:block;width:100%;max-width:100%;height:auto;object-fit:contain;',
    });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
      }),
      StyledParagraph,
      StyledHeading,
      Underline,
      TextStyle,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      CustomImage.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      CustomTable.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
    ],
    content: value,
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      attributes: { class: 'print-template-editor-content' },
      handleDOMEvents: {
        focus: () => {
          onFocusSection?.();
          return false;
        },
        mousedown: (view: any, event: Event) => {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const target = mouseEvent.target as HTMLElement | null;
          const cell = target?.closest?.('td,th') as HTMLElement | null;
          const table = target?.closest?.('table') as HTMLTableElement | null;
          if (!cell || !table) {
            cellDragSelectionRef.current = null;
            return false;
          }
          cellDragSelectionRef.current = { table, startCell: cell };
          const startPos = view.posAtDOM(cell, 0);
          const $start = view.state.doc.resolve(
            Math.min(startPos + 1, view.state.doc.content.size)
          );
          view.dispatch(view.state.tr.setSelection(new CellSelection($start, $start)));
          view.focus();
          return false;
        },
        mousemove: (view: any, event: Event) => {
          const dragState = cellDragSelectionRef.current;
          if (!dragState) return false;
          const target = (event as MouseEvent).target as HTMLElement | null;
          const cell = target?.closest?.('td,th') as HTMLElement | null;
          const table = target?.closest?.('table') as HTMLTableElement | null;
          if (!cell || !table || table !== dragState.table) return false;
          const startPos = view.posAtDOM(dragState.startCell, 0);
          const endPos = view.posAtDOM(cell, 0);
          const $start = view.state.doc.resolve(
            Math.min(startPos + 1, view.state.doc.content.size)
          );
          const $end = view.state.doc.resolve(
            Math.min(endPos + 1, view.state.doc.content.size)
          );
          view.dispatch(view.state.tr.setSelection(new CellSelection($start, $end)));
          view.focus();
          return true;
        },
        mouseup: () => {
          cellDragSelectionRef.current = null;
          return false;
        },
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    onEditorReady?.(editor || null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !editor.isActive('table')) return;
    const attrs = editor.getAttributes('table') as Record<string, any>;
    if (attrs.borderColor) setTableBorderColor(String(attrs.borderColor));
  }, [editor, value]);

  useEffect(() => {
    const clearDragSelection = () => {
      cellDragSelectionRef.current = null;
    };

    window.addEventListener('mouseup', clearDragSelection);
    return () => window.removeEventListener('mouseup', clearDragSelection);
  }, []);

  const tableTools = editor?.isActive('table') ? (
    <BubbleMenu editor={editor} shouldShow={() => editor.isActive('table') && editor.isFocused}>
      <div className="table-bubble-menu">
        {iconBtn('ردیف بالا', <ArrowUpOutlined />, () => editor.chain().focus().addRowBefore().run(), !editor)}
        {iconBtn('ردیف پایین', <ArrowDownOutlined />, () => editor.chain().focus().addRowAfter().run(), !editor)}
        {iconBtn('حذف ردیف', <DeleteOutlined />, () => editor.chain().focus().deleteRow().run(), !editor)}
        <Divider type="vertical" />
        {iconBtn('ستون راست', <ArrowRightOutlined />, () => editor.chain().focus().addColumnBefore().run(), !editor)}
        {iconBtn('ستون چپ', <ArrowLeftOutlined />, () => editor.chain().focus().addColumnAfter().run(), !editor)}
        {iconBtn('حذف ستون', <DeleteOutlined />, () => editor.chain().focus().deleteColumn().run(), !editor)}
        <Divider type="vertical" />
        {iconBtn('انتخاب ردیف', <ArrowRightOutlined />, selectTableRow, !editor)}
        {iconBtn('انتخاب ستون', <ArrowDownOutlined />, selectTableColumn, !editor)}
        {iconBtn('انتخاب جدول', <TableOutlined />, selectCurrentTable, !editor)}
        <Divider type="vertical" />
        {iconBtn('مرج', <CompressOutlined />, () => editor.chain().focus().mergeCells().run(), !editor)}
        {iconBtn('جداسازی', <ExpandOutlined />, () => editor.chain().focus().splitCell().run(), !editor)}
        {iconBtn('حذف جدول', <DeleteOutlined />, () => editor.chain().focus().deleteTable().run(), !editor)}
        <Divider type="vertical" />
        <label className="color-chip" title="رنگ کادر جدول">
          <TableOutlined />
          <input
            type="color"
            value={tableBorderColor}
            onChange={(e) => {
              const nextColor = e.target.value;
              setTableBorderColor(nextColor);
              editor.chain().focus().updateAttributes('table', { borderColor: nextColor }).run();
            }}
          />
          <div className="color-chip-swatches">
            {brandPalette.map((color: string) => (
              <button
                key={`table-border-${color}`}
                type="button"
                className="color-swatch"
                style={{ background: color }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setTableBorderColor(color);
                  editor.chain().focus().updateAttributes('table', { borderColor: color }).run();
                }}
                title={color}
              />
            ))}
          </div>
        </label>
        <label className="color-chip" title="رنگ سلول">
          <BgColorsOutlined />
          <input
            type="color"
            value={cellColor}
            onChange={(e) => {
              const nextColor = e.target.value;
              setCellColor(nextColor);
              editor.chain().focus().setCellAttribute('backgroundColor', nextColor).run();
            }}
          />
          <div className="color-chip-swatches">
            {brandPalette.map((color: string) => (
              <button
                key={`table-cell-${color}`}
                type="button"
                className="color-swatch"
                style={{ background: color }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setCellColor(color);
                  editor.chain().focus().setCellAttribute('backgroundColor', color).run();
                }}
                title={color}
              />
            ))}
          </div>
        </label>
      </div>
    </BubbleMenu>
  ) : null;
  const imageTools = editor?.isActive('image') ? (
    <BubbleMenu editor={editor} shouldShow={() => editor.isActive('image') && editor.isFocused}>
      <div className="table-bubble-menu">
        {iconBtn('کوچک‌کردن تصویر', <MinusOutlined />, () => stepImageWidth(-12), !editor)}
        {iconBtn('بزرگ‌کردن تصویر', <PlusOutlined />, () => stepImageWidth(12), !editor)}
        {iconBtn('فیت داخل سلول', <CompressOutlined />, fitImageToCell, !editor)}
      </div>
    </BubbleMenu>
  ) : null;

  return (
    <div className="print-template-editor-root">
      {tableTools}
      {imageTools}
      <EditorContent editor={editor} />

      <style>{`
        .print-template-editor-root {
          position: relative;
          background: transparent;
          overflow: visible;
        }
        .print-template-editor-content {
          min-height: ${Math.max(minHeight, 120)}px;
          padding: 14px 16px;
          outline: none;
          direction: rtl;
          text-align: right;
          font-family: inherit;
          line-height: 1.9;
          color: #0f172a;
          background: transparent;
          user-select: text;
          -webkit-user-select: text;
        }
        .print-template-editor-content * {
          user-select: text;
          -webkit-user-select: text;
        }
        .print-template-editor-content p {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        .print-template-editor-content td p,
        .print-template-editor-content th p {
          margin: 0 !important;
          font-size: inherit !important;
          line-height: 1.6 !important;
        }
        .print-template-editor-content td p:empty,
        .print-template-editor-content th p:empty {
          display: none !important;
        }
        .print-template-editor-content td br.ProseMirror-trailingBreak,
        .print-template-editor-content th br.ProseMirror-trailingBreak {
          display: none !important;
        }
        .print-template-editor-content h2 {
          margin: 0 0 10px 0;
          font-size: 20px;
          line-height: 1.8;
        }
        .print-template-editor-content img {
          max-width: 100%;
          height: auto;
          display: block;
          object-fit: contain;
        }
        .print-template-editor-content table {
          border-collapse: collapse;
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          margin: 10px 0;
          --table-border-color: #d1d5db;
        }
        .print-template-editor-content th,
        .print-template-editor-content td {
          border: 1px solid var(--table-border-color, #d1d5db) !important;
          padding: 4px 5px;
          vertical-align: top;
          position: relative;
          cursor: text;
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
          font-size: inherit;
        }
        .print-template-editor-content th:hover,
        .print-template-editor-content td:hover {
          background: rgba(var(--brand-500-rgb), 0.04);
        }
        .print-template-editor-content .column-resize-handle {
          position: absolute;
          top: 0;
          bottom: -1px;
          inset-inline-end: -2px;
          width: 5px;
          background: rgba(var(--brand-500-rgb), 0.55);
        }
        .print-template-editor-content.resize-cursor {
          cursor: col-resize;
        }
        .print-template-editor-content .grip-column,
        .print-template-editor-content .grip-row,
        .print-template-editor-content .grip-table,
        .print-template-editor-content .grip-cell,
        .print-template-editor-content .tableGripColumn,
        .print-template-editor-content .tableGripRow,
        .print-template-editor-content .tableGripTable,
        .print-template-editor-content .column-grip,
        .print-template-editor-content .row-grip,
        .print-template-editor-content .table-grip {
          display: none !important;
          pointer-events: none !important;
        }
        .print-template-editor-content .selectedCell:after {
          background: rgba(var(--brand-500-rgb), 0.08);
          border: 1px solid rgba(var(--brand-500-rgb), 0.35);
        }
        .print-template-editor-content .ProseMirror-selectednode table,
        .print-template-editor-content .ProseMirror-selectednode {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.28);
        }
        .print-template-editor-content table:hover {
          box-shadow: 0 0 0 1px rgba(var(--brand-500-rgb), 0.16);
        }
        .table-bubble-menu {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          max-width: 560px;
          padding: 8px;
          border: 1px solid rgba(229, 231, 235, 0.9);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
          backdrop-filter: blur(10px);
        }
        .dark .table-bubble-menu {
          background: rgba(17, 24, 39, 0.96);
          border-color: rgba(71, 85, 105, 0.95);
        }
        .color-chip {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 10px;
          padding: 4px 8px;
          background: rgba(255,255,255,0.92);
        }
        .dark .color-chip {
          background: rgba(15,23,42,0.9);
          border-color: rgba(71,85,105,0.5);
        }
        .color-chip input {
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
        }
        .color-chip-swatches {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          max-width: 160px;
        }
        .color-swatch {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.5);
          cursor: pointer;
          padding: 0;
        }
        @media (max-width: 768px) {
          .table-bubble-menu {
            max-width: 92vw;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintTemplateEditor;

