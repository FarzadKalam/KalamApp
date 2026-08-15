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
  PictureOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Button, Divider, Tooltip } from 'antd';
import { Extension } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
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
  fixedHeight?: number;
  fillHeight?: boolean;
  contentPadding?: string;
  onEditorReady?: (editor: any | null) => void;
  onFocusSection?: () => void;
}

const mergeStyleParts = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');

const extractStyleValue = (styleText: unknown, propertyNames: string[]) => {
  const raw = String(styleText || '').trim();
  if (!raw) return '';
  for (const propertyName of propertyNames) {
    const match = raw.match(new RegExp(`(?:^|;)\\s*${propertyName}\\s*:\\s*([^;]+)`, 'i'));
    if (match?.[1]) return String(match[1]).trim();
  }
  return '';
};

const setStyleProperty = (styleText: unknown, propertyName: string, value: string | null) => {
  const normalizedName = String(propertyName || '').trim().toLowerCase();
  const segments = String(styleText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith(`${normalizedName}:`));
  if (value && String(value).trim()) {
    segments.push(`${propertyName}: ${String(value).trim()}`);
  }
  return segments.join('; ');
};

const getTableCellWidthValue = (cell: Element | null) => {
  if (!cell) return '';
  const styleWidth = extractStyleValue(cell.getAttribute('style') || '', ['width']);
  const widthAttr = String(cell.getAttribute('width') || '').trim();
  return styleWidth || widthAttr;
};

const normalizeTableMarkup = (html: string) => {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined' || !html || !/<table/i.test(html)) {
    return html;
  }

  try {
    const isEmptyTableSpacer = (element: Element | null) => {
      if (!element) return false;
      const tagName = String(element.tagName || '').toLowerCase();
      if (tagName !== 'p' && tagName !== 'div') return false;
      const text = String(element.textContent || '')
        .replace(/[\u200c\u200d\u200e\u200f\u00a0\s]+/g, '')
        .trim();
      const hasOnlyBreaks = Array.from(element.childNodes).every((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return !String(node.textContent || '').replace(/[\u200c\u200d\u200e\u200f\u00a0\s]+/g, '');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const childTag = String((node as Element).tagName || '').toLowerCase();
        return childTag === 'br';
      });
      return !text && hasOnlyBreaks;
    };

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(`<div id="print-editor-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('print-editor-root');
    if (!root) return html;

    root.querySelectorAll('table').forEach((table) => {
      const firstRow = table.querySelector('tr');
      const cells = Array.from(firstRow?.children || []).filter((node) => {
        const tagName = String((node as Element)?.tagName || '').toLowerCase();
        return tagName === 'td' || tagName === 'th';
      }) as Element[];
      if (!cells.length) return;

      const widthValues = cells.map((cell) => getTableCellWidthValue(cell));
      const hasExplicitWidths = widthValues.some(Boolean);
      const existingColgroup = Array.from(table.children).find(
        (child) => String((child as Element).tagName || '').toLowerCase() === 'colgroup'
      ) as HTMLElement | undefined;
      if (!hasExplicitWidths && !existingColgroup) return;

      const colgroup = existingColgroup || doc.createElement('colgroup');
      if (!existingColgroup) {
        table.insertBefore(colgroup, table.firstChild);
      }

      while (colgroup.children.length < cells.length) {
        colgroup.appendChild(doc.createElement('col'));
      }
      while (colgroup.children.length > cells.length) {
        colgroup.removeChild(colgroup.lastElementChild as Element);
      }

      widthValues.forEach((widthValue, index) => {
        const col = colgroup.children[index] as HTMLElement | undefined;
        const cell = cells[index] as HTMLElement | undefined;
        if (!col || !cell || !widthValue) return;

        col.setAttribute('style', setStyleProperty(col.getAttribute('style') || '', 'width', widthValue));
        cell.setAttribute('style', setStyleProperty(cell.getAttribute('style') || '', 'width', widthValue));

        const pxMatch = widthValue.match(/^(\d+(?:\.\d+)?)px$/i);
        if (pxMatch?.[1]) {
          const pxWidth = `${Math.max(1, Math.round(Number(pxMatch[1])))}`;
          col.setAttribute('width', pxWidth);
          cell.setAttribute('data-colwidth', pxWidth);
        }
      });
    });

    root.querySelectorAll('table').forEach((table) => {
      let previous = table.previousElementSibling;
      while (isEmptyTableSpacer(previous)) {
        const target = previous;
        previous = previous?.previousElementSibling || null;
        target?.remove();
      }

      let next = table.nextElementSibling;
      while (isEmptyTableSpacer(next)) {
        const target = next;
        next = next?.nextElementSibling || null;
        target?.remove();
      }
    });

    return root.innerHTML;
  } catch {
    return html;
  }
};

const toPixelSize = (value: unknown, fallback: number) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw.endsWith('%')) return fallback;
  const parsed = Number.parseFloat(raw.replace('px', '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getImageWidthValue = (attrs: Record<string, any>, fallback: number) => {
  const directWidth = String(attrs.width || '').trim();
  const styleWidth = extractStyleValue(attrs.inlineStyle, ['width', 'max-width']);
  return toPixelSize(directWidth || styleWidth, fallback);
};

const getImageHeightValue = (attrs: Record<string, any>, width: number) => {
  const directHeight = String(attrs.height || '').trim();
  const styleHeight = extractStyleValue(attrs.inlineStyle, ['height', 'max-height']);
  const raw = (directHeight || styleHeight || '').trim();
  if (!raw || raw === 'auto') return null;
  return toPixelSize(raw, Math.round(width * 0.6));
};

const extractVariableToken = (src: unknown) => {
  const raw = String(src || '').trim();
  const match = raw.match(/^{{\s*([^}]+)\s*}}$/);
  return match ? String(match[1] || '').trim() : '';
};

const buildImageInlineStyle = (width: number, height: number | null) => {
  const safeWidth = Math.max(32, Math.round(width));
  const safeHeight = height && height > 0 ? Math.round(height) : null;
  return [
    'display:block',
    `width:${safeWidth}px`,
    `max-width:${safeWidth}px`,
    safeHeight ? `height:${safeHeight}px` : 'height:auto',
    safeHeight ? `max-height:${safeHeight}px` : '',
    'object-fit:contain',
    'border-radius:10px',
  ]
    .filter(Boolean)
    .join(';');
};

const PrintImageNodeView: React.FC<any> = ({ node, selected, updateAttributes, editor, getPos }) => {
  const attrs = (node?.attrs || {}) as Record<string, any>;
  const variableToken = extractVariableToken(attrs.src);
  const width = getImageWidthValue(attrs, 180);
  const height = getImageHeightValue(attrs, width);
  const isVariableImage = Boolean(variableToken);

  const resizeStateRef = useRef<null | {
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number | null;
    horizontal: -1 | 1;
    vertical: -1 | 1;
  }>(null);

  const commitResize = (nextWidth: number, nextHeight: number | null) => {
    const nextAttrs = {
      ...attrs,
      width: `${Math.max(32, Math.round(nextWidth))}px`,
      height: nextHeight && nextHeight > 0 ? `${Math.max(32, Math.round(nextHeight))}px` : 'auto',
      inlineStyle: buildImageInlineStyle(nextWidth, nextHeight),
    };

    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs);
        editor.view.dispatch(tr);
        return;
      }
    }

    updateAttributes(nextAttrs);
  };

  const startResize = (event: React.MouseEvent, horizontal: -1 | 1, vertical: -1 | 1) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor) return;

    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: width,
      startHeight: height,
      horizontal,
      vertical,
    };

    const handleMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const deltaX = (moveEvent.clientX - state.startX) * state.horizontal;
      const deltaY = (moveEvent.clientY - state.startY) * state.vertical;
      const nextWidth = Math.max(32, state.startWidth + deltaX);
      const nextHeight = state.startHeight === null
        ? null
        : Math.max(32, state.startHeight + deltaY);
      commitResize(nextWidth, nextHeight);
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp, { once: true });
  };

  const selectNode = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor || typeof getPos !== 'function') return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const selection = NodeSelection.create(editor.state.doc, pos);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    editor.view.focus();
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`print-editor-image-node ${selected ? 'selected' : ''} ${isVariableImage ? 'variable-image' : ''}`}
      style={{ width: `${width}px`, height: height ? `${height}px` : 'auto' }}
      data-variable-token={variableToken || undefined}
      onMouseDown={selectNode}
      contentEditable={false}
    >
      {isVariableImage ? (
        <div className="print-editor-image-placeholder">
          <div className="print-editor-image-placeholder-icon">
            <PictureOutlined />
          </div>
          <div className="print-editor-image-placeholder-label">{variableToken}</div>
        </div>
      ) : (
        <img
          src={String(attrs.src || '')}
          alt={String(attrs.alt || 'image')}
          title={String(attrs.title || '')}
          draggable={false}
          style={{
            width: `${width}px`,
            height: height ? `${height}px` : 'auto',
            maxWidth: '100%',
            display: 'block',
            objectFit: 'contain',
            borderRadius: 10,
          }}
        />
      )}

      {selected ? (
        <>
          <button type="button" className="print-editor-image-handle handle-nw" onMouseDown={(e) => startResize(e, -1, -1)} />
          <button type="button" className="print-editor-image-handle handle-ne" onMouseDown={(e) => startResize(e, 1, -1)} />
          <button type="button" className="print-editor-image-handle handle-sw" onMouseDown={(e) => startResize(e, -1, 1)} />
          <button type="button" className="print-editor-image-handle handle-se" onMouseDown={(e) => startResize(e, 1, 1)} />
        </>
      ) : null}
    </NodeViewWrapper>
  );
};

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

const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      printOptionalField: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-print-optional-field') || null,
        renderHTML: (attributes) => (
          attributes.printOptionalField
            ? { 'data-print-optional-field': attributes.printOptionalField }
            : {}
        ),
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
      printOptionalField: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-print-optional-field') || null,
        renderHTML: (attributes) => (
          attributes.printOptionalField
            ? { 'data-print-optional-field': attributes.printOptionalField }
            : {}
        ),
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
      printOptionalField: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-print-optional-field') || null,
        renderHTML: (attributes) => (
          attributes.printOptionalField
            ? { 'data-print-optional-field': attributes.printOptionalField }
            : {}
        ),
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
        parseHTML: (element) =>
          element.getAttribute('data-width') ||
          element.getAttribute('width') ||
          element.style.width ||
          element.style.maxWidth ||
          extractStyleValue(element.getAttribute('style') || '', ['width', 'max-width']) ||
          null,
        renderHTML: () => ({}),
      },
      height: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-height') ||
          element.getAttribute('height') ||
          element.style.height ||
          element.style.maxHeight ||
          extractStyleValue(element.getAttribute('style') || '', ['height', 'max-height']) ||
          null,
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
    if (width && /px$/i.test(width)) {
      const normalizedWidth = width.replace(/px$/i, '').trim();
      attrs.width = normalizedWidth;
      attrs['data-width'] = normalizedWidth;
    }
    if (height && /px$/i.test(height)) {
      const normalizedHeight = height.replace(/px$/i, '').trim();
      attrs.height = normalizedHeight;
      attrs['data-height'] = normalizedHeight;
    }
    if (style) attrs.style = style;
    return ['img', attrs];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PrintImageNodeView);
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
    <Button
      size="small"
      icon={icon}
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

const normalizeColorForInput = (value: unknown, fallback = '#d1d5db') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [r, g, b] = raw.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const toHex = (part: string) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  if (typeof window !== 'undefined') {
    const probe = document.createElement('div');
    probe.style.color = raw;
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe).color;
    document.body.removeChild(probe);
    if (computed && computed !== raw) return normalizeColorForInput(computed, fallback);
  }
  return fallback;
};

const PrintTemplateEditor: React.FC<PrintTemplateEditorProps> = ({
  value,
  onChange,
  placeholder = 'قالب چاپ را اینجا طراحی کنید...',
  minHeight = 240,
  fixedHeight,
  fillHeight = false,
  contentPadding = '14px 16px',
  onEditorReady,
  onFocusSection,
}) => {
  const [cellColor, setCellColor] = useState('#fef3c7');
  const [tableBorderColor, setTableBorderColor] = useState('#d1d5db');
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const brandPalette = useMemo(() => getBrandPalette(), []);
  const cellColorInput = useMemo(() => normalizeColorForInput(cellColor, '#fef3c7'), [cellColor]);
  const tableBorderColorInput = useMemo(
    () => normalizeColorForInput(tableBorderColor, '#d1d5db'),
    [tableBorderColor]
  );
  const lastEmittedContentRef = useRef(value || '');
  const pendingLocalContentRef = useRef<string | null>(null);
  const normalizedValue = useMemo(() => {
    const rawValue = value || '';
    return rawValue === lastEmittedContentRef.current ? rawValue : normalizeTableMarkup(rawValue);
  }, [value]);
  const resolvedEditorHeight = fixedHeight ? Math.max(36, Math.round(fixedHeight)) : null;
  const resizeCursorModeRef = useRef<'row' | 'column' | null>(null);
  const cellDragSelectionRef = useRef<null | {
    table: HTMLTableElement;
    startCell: HTMLElement;
    startX: number;
    startY: number;
    active: boolean;
  }>(null);
  const rowResizeStateRef = useRef<null | {
    table: HTMLTableElement;
    row: HTMLTableRowElement;
    startY: number;
    startHeight: number;
  }>(null);

  const resolveCellPos = (view: any, cell: HTMLElement) => {
    const docSize = Math.max(0, view.state.doc.content.size);
    const candidatePositions = [
      view.posAtDOM(cell, 0),
      Math.max(0, view.posAtDOM(cell, 0) - 1),
      Math.max(0, view.posAtDOM(cell, 0) + 1),
    ];
    const isCellNodeName = (name: string) => name === 'tableCell' || name === 'tableHeader';

    for (const candidate of candidatePositions) {
      const safePos = Math.max(0, Math.min(candidate, docSize));
      const $pos = view.state.doc.resolve(safePos);
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const node = $pos.node(depth);
        if (isCellNodeName(String(node?.type?.name || ''))) {
          return $pos.before(depth);
        }
      }
      const nextNodeName = String($pos.nodeAfter?.type?.name || '');
      if (isCellNodeName(nextNodeName)) {
        return safePos;
      }
    }

    return null;
  };

  const createCellRangeSelection = (view: any, anchorCell: HTMLElement, headCell?: HTMLElement) => {
    try {
      const anchorPos = resolveCellPos(view, anchorCell);
      const headPos = resolveCellPos(view, headCell || anchorCell);
      if (anchorPos === null || headPos === null) return null;
      return CellSelection.create(view.state.doc, anchorPos, headPos);
    } catch (_error) {
      return null;
    }
  };

  const createAxisSelection = (view: any, cell: HTMLElement, axis: 'row' | 'column') => {
    try {
      const anchorPos = resolveCellPos(view, cell);
      if (anchorPos === null) return null;
      const $anchorCell = view.state.doc.resolve(anchorPos);
      return axis === 'row'
        ? CellSelection.rowSelection($anchorCell)
        : CellSelection.colSelection($anchorCell);
    } catch (_error) {
      return null;
    }
  };

  const getActiveCellPos = () => {
    if (!editor) return null;
    const $from = editor.state.selection.$from;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      const nodeName = String(node?.type?.name || '');
      if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
        return $from.before(depth);
      }
    }
    return null;
  };

  const setEditorResizeCursor = (view: any, mode: 'row' | 'column' | null) => {
    if (resizeCursorModeRef.current === mode) return;
    resizeCursorModeRef.current = mode;
    const root = view?.dom as HTMLElement | null;
    if (!root) return;
    root.classList.toggle('row-resize-cursor', mode === 'row');
    root.classList.toggle('column-resize-cursor', mode === 'column');
  };

  const getCellResizeIntent = (cell: HTMLElement | null, event: MouseEvent) => {
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    const edgeThreshold = 5;
    const leftDistance = Math.abs(event.clientX - rect.left);
    const rightDistance = Math.abs(event.clientX - rect.right);
    const topDistance = Math.abs(event.clientY - rect.top);
    const bottomDistance = Math.abs(event.clientY - rect.bottom);
    const horizontalDistance = Math.min(leftDistance, rightDistance);
    const verticalDistance = Math.min(topDistance, bottomDistance);
    if (horizontalDistance <= edgeThreshold && horizontalDistance <= verticalDistance) return 'column';
    if (verticalDistance <= edgeThreshold) return 'row';
    return null;
  };

  const isTextSelectionTarget = (target: HTMLElement | null, cell: HTMLElement) => {
    if (!target || target === cell) return false;
    if (target.closest('button,input,textarea,select,img,.print-editor-image-node,.column-resize-handle')) return false;
    const textHost = target.closest('p,h1,h2,h3,h4,h5,h6,li,span,strong,em,a,code');
    if (!textHost || !cell.contains(textHost)) return false;
    return String(textHost.textContent || '').trim().length > 0;
  };

  const shouldStartCellRangeDrag = (target: HTMLElement | null, cell: HTMLElement, event: MouseEvent) => {
    if (event.shiftKey || target === cell) return true;
    return !isTextSelectionTarget(target, cell);
  };

  const applyRowHeight = (view: any, row: HTMLTableRowElement, nextHeight: number) => {
    const safeHeight = Math.max(24, Math.round(nextHeight));
    let tr = view.state.tr;
    let changed = false;
    Array.from(row.cells || []).forEach((cell) => {
      const cellPos = resolveCellPos(view, cell as HTMLElement);
      if (cellPos === null) return;
      const cellNode = tr.doc.nodeAt(cellPos);
      if (!cellNode) return;
      const inlineStyle = setStyleProperty(cellNode.attrs?.inlineStyle, 'height', `${safeHeight}px`);
      const nextAttrs = { ...cellNode.attrs, inlineStyle };
      tr = tr.setNodeMarkup(cellPos, cellNode.type, nextAttrs);
      changed = true;
    });
    if (changed) {
      view.dispatch(tr);
      view.focus();
    }
  };

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
    const tableInfo = getActiveTableInfo();
    if (!tableInfo) return;
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tableInfo.pos));
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const getActiveTableInfo = () => {
    if (!editor) return null;
    const selection = editor.state.selection;
    if (selection instanceof NodeSelection && selection.node?.type?.name === 'table') {
      return { pos: selection.from, node: selection.node };
    }
    const $from = selection.$from;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (String(node?.type?.name || '') === 'table') {
        return { pos: $from.before(depth), node };
      }
    }
    return null;
  };

  const getFirstCellPosInTable = () => {
    const tableInfo = getActiveTableInfo();
    if (!tableInfo) return null;
    let firstCellPos: number | null = null;
    tableInfo.node.descendants((node: any, pos: number) => {
      if (firstCellPos !== null) return false;
      const nodeName = String(node?.type?.name || '');
      if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
        firstCellPos = tableInfo.pos + 1 + pos;
        return false;
      }
      return true;
    });
    return firstCellPos;
  };

  const ensureTableCellSelection = () => {
    if (!editor) return false;
    const activeCellPos = getActiveCellPos();
    const cellPos = activeCellPos ?? getFirstCellPosInTable();
    if (cellPos === null) return false;
    if (activeCellPos !== null) return true;

    const selection = TextSelection.near(editor.state.doc.resolve(Math.min(editor.state.doc.content.size, cellPos + 1)), 1);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    editor.view.focus();
    return true;
  };

  const runTableCommand = (command: () => boolean) => {
    if (!editor || !ensureTableCellSelection()) return;
    command();
    editor.view.focus();
  };

  const deleteCurrentTable = () => {
    if (!editor) return;
    if (editor.chain().focus().deleteTable().run()) return;

    const tableInfo = getActiveTableInfo();
    if (!tableInfo) return;
    const tr = editor.state.tr.delete(tableInfo.pos, tableInfo.pos + tableInfo.node.nodeSize);
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  const insertParagraphAroundTable = (placement: 'before' | 'after') => {
    if (!editor) return;
    const tableInfo = getActiveTableInfo();
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!tableInfo || !paragraph) return;

    const insertPos = placement === 'before' ? tableInfo.pos : tableInfo.pos + tableInfo.node.nodeSize;
    let tr = editor.state.tr.insert(insertPos, paragraph);
    const selectionPos = Math.min(tr.doc.content.size, insertPos + 1);
    tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos)).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
    setTableMenuOpen(false);
  };

  const updateCurrentTableWidth = (delta: number) => {
    if (!editor) return;
    const tableInfo = getActiveTableInfo();
    if (!tableInfo) return;
    const attrs = tableInfo.node.attrs || {};
    const currentWidthText = extractStyleValue(attrs.inlineStyle, ['width']);
    const currentWidth = currentWidthText.endsWith('%')
      ? Number.parseFloat(currentWidthText)
      : 100;
    const nextWidth = Math.max(35, Math.min(100, Math.round((Number.isFinite(currentWidth) ? currentWidth : 100) + delta)));
    let inlineStyle = setStyleProperty(attrs.inlineStyle, 'width', `${nextWidth}%`);
    inlineStyle = setStyleProperty(inlineStyle, 'max-width', '100%');
    inlineStyle = setStyleProperty(inlineStyle, 'margin', '10px auto');
    const tr = editor.state.tr.setNodeMarkup(tableInfo.pos, tableInfo.node.type, {
      ...attrs,
      inlineStyle,
    });
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  const getSelectedImageWidth = () => {
    if (!editor || !editor.isActive('image')) return null;
    const attrs = editor.getAttributes('image') as Record<string, any>;
    const parsed = getImageWidthValue(attrs, 0);
    return parsed > 0 ? parsed : null;
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
      inlineStyle: buildImageInlineStyle(nextWidth, null),
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
        link: false,
        underline: false,
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
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell,
    ],
    content: normalizedValue,
    onUpdate: ({ editor: currentEditor }) => {
      const nextHtml = currentEditor.getHTML();
      lastEmittedContentRef.current = nextHtml;
      pendingLocalContentRef.current = nextHtml;
      onChange(nextHtml);
    },
    editorProps: {
      attributes: { class: 'print-template-editor-content' },
      handleDOMEvents: {
        focus: () => {
          onFocusSection?.();
          return false;
        },
        keydown: (_view: any, event: Event) => {
          const keyboardEvent = event as KeyboardEvent;
          const selection = editor?.state.selection;
          const selectedTable = selection instanceof NodeSelection && selection.node?.type?.name === 'table';
          if (!selectedTable) return false;
          if (keyboardEvent.key === 'Backspace' || keyboardEvent.key === 'Delete') {
            keyboardEvent.preventDefault();
            deleteCurrentTable();
            return true;
          }
          if (keyboardEvent.key === 'Enter') {
            keyboardEvent.preventDefault();
            insertParagraphAroundTable(keyboardEvent.shiftKey ? 'before' : 'after');
            return true;
          }
          return false;
        },
        mousedown: (view: any, event: Event) => {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const rawTarget = mouseEvent.target as Node | null;
          const target = rawTarget instanceof Element
            ? rawTarget as HTMLElement
            : rawTarget?.parentElement || null;
          if (target === view.dom) {
            mouseEvent.preventDefault();
            cellDragSelectionRef.current = null;
            rowResizeStateRef.current = null;
            setEditorResizeCursor(view, null);
            view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
            view.focus();
            return true;
          }
          if (target?.closest?.('.column-resize-handle')) {
            cellDragSelectionRef.current = null;
            rowResizeStateRef.current = null;
            setEditorResizeCursor(view, 'column');
            return false;
          }
          const cell = target?.closest?.('td,th') as HTMLElement | null;
          const table = target?.closest?.('table') as HTMLTableElement | null;
          if (!cell || !table) {
            cellDragSelectionRef.current = null;
            rowResizeStateRef.current = null;
            setEditorResizeCursor(view, null);
            return false;
          }
          if (mouseEvent.detail >= 4) {
            const selection = createCellRangeSelection(view, cell);
            if (!selection) return false;
            mouseEvent.preventDefault();
            cellDragSelectionRef.current = null;
            rowResizeStateRef.current = null;
            setEditorResizeCursor(view, null);
            view.dispatch(view.state.tr.setSelection(selection));
            view.focus();
            return true;
          }
          const resizeIntent = getCellResizeIntent(cell, mouseEvent);
          if (resizeIntent === 'column') {
            cellDragSelectionRef.current = null;
            rowResizeStateRef.current = null;
            if (mouseEvent.detail < 2) {
              setEditorResizeCursor(view, 'column');
              return false;
            }
            const selection = createAxisSelection(view, cell, 'column');
            if (!selection) return false;
            view.dispatch(view.state.tr.setSelection(selection));
            view.focus();
            return true;
          }
          if (resizeIntent === 'row') {
            const row = cell.closest('tr') as HTMLTableRowElement | null;
            if (!row) return false;
            const startHeight = Math.max(24, Math.round(row.getBoundingClientRect().height || 0));
            rowResizeStateRef.current = {
              table,
              row,
              startY: mouseEvent.clientY,
              startHeight,
            };
            setEditorResizeCursor(view, 'row');
            const handleMove = (moveEvent: MouseEvent) => {
              const resizeState = rowResizeStateRef.current;
              if (!resizeState) return;
              const deltaY = moveEvent.clientY - resizeState.startY;
              applyRowHeight(view, resizeState.row, resizeState.startHeight + deltaY);
            };
            const handleUp = () => {
              rowResizeStateRef.current = null;
              setEditorResizeCursor(view, null);
              window.removeEventListener('mousemove', handleMove);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp, { once: true });
            return true;
          }
          // An empty table cell contains only a placeholder paragraph. It must
          // behave like a normal writing area, not like a table-range drag.
          if (!mouseEvent.shiftKey && !String(cell.textContent || '').trim()) {
            const cellPos = resolveCellPos(view, cell);
            if (cellPos === null) return false;
            mouseEvent.preventDefault();
            cellDragSelectionRef.current = null;
            setEditorResizeCursor(view, null);
            const selection = TextSelection.near(
              view.state.doc.resolve(Math.min(view.state.doc.content.size, cellPos + 1)),
              1,
            );
            view.dispatch(view.state.tr.setSelection(selection));
            view.focus();
            return true;
          }
          if (!shouldStartCellRangeDrag(target, cell, mouseEvent)) {
            cellDragSelectionRef.current = null;
            setEditorResizeCursor(view, null);
            return false;
          }
          cellDragSelectionRef.current = {
            table,
            startCell: cell,
            startX: mouseEvent.clientX,
            startY: mouseEvent.clientY,
            active: false,
          };
          setEditorResizeCursor(view, null);
          return false;
        },
        mousemove: (view: any, event: Event) => {
          const mouseEvent = event as MouseEvent;
          const target = mouseEvent.target as HTMLElement | null;
          const hoverCell = target?.closest?.('td,th') as HTMLElement | null;
          const hoverIntent = getCellResizeIntent(hoverCell, mouseEvent);
          setEditorResizeCursor(view, hoverIntent);
          if (hoverIntent && !cellDragSelectionRef.current) return false;
          const dragState = cellDragSelectionRef.current;
          if (!dragState) return false;
          if ((mouseEvent.buttons & 1) !== 1) {
            cellDragSelectionRef.current = null;
            return false;
          }
          const cell = target?.closest?.('td,th') as HTMLElement | null;
          const table = target?.closest?.('table') as HTMLTableElement | null;
          if (!cell || !table || table !== dragState.table) return false;
          const distance = Math.hypot(mouseEvent.clientX - dragState.startX, mouseEvent.clientY - dragState.startY);
          if (!dragState.active && distance < 6) return false;
          const selection = createCellRangeSelection(view, dragState.startCell, cell);
          if (!selection) return false;
          dragState.active = true;
          view.dispatch(view.state.tr.setSelection(selection));
          view.focus();
          return true;
        },
        mouseup: () => {
          cellDragSelectionRef.current = null;
          rowResizeStateRef.current = null;
          return false;
        },
        mouseleave: (view: any) => {
          cellDragSelectionRef.current = null;
          rowResizeStateRef.current = null;
          setEditorResizeCursor(view, null);
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

    if (pendingLocalContentRef.current) {
      if (normalizedValue === pendingLocalContentRef.current) {
        pendingLocalContentRef.current = null;
        return;
      }
      if (currentHtml === pendingLocalContentRef.current) {
        return;
      }
      pendingLocalContentRef.current = null;
    }

    if (normalizedValue !== currentHtml) {
      editor.commands.setContent(normalizedValue || '', { emitUpdate: false });
      lastEmittedContentRef.current = normalizedValue || '';
    }
  }, [editor, normalizedValue]);

  useEffect(() => {
    if (normalizedValue !== value) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, onChange, value]);

  useEffect(() => {
    if (!editor || !editor.isActive('table')) return;
    const attrs = editor.getAttributes('table') as Record<string, any>;
    if (attrs.borderColor) setTableBorderColor(normalizeColorForInput(attrs.borderColor, '#d1d5db'));
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    const closeWhenLeavingTable = () => {
      if (!editor.isActive('table')) setTableMenuOpen(false);
    };
    editor.on('selectionUpdate', closeWhenLeavingTable);
    return () => {
      editor.off('selectionUpdate', closeWhenLeavingTable);
    };
  }, [editor]);

  useEffect(() => {
    const clearDragSelection = () => {
      cellDragSelectionRef.current = null;
    };

    window.addEventListener('mouseup', clearDragSelection);
    return () => window.removeEventListener('mouseup', clearDragSelection);
  }, []);

  const tableTools = editor?.isActive('table') ? (
    <BubbleMenu editor={editor} shouldShow={() => editor.isActive('table') && editor.isFocused}>
      <div className={`table-floating-tools ${tableMenuOpen ? 'open' : ''}`}>
        <Tooltip title={tableMenuOpen ? 'بستن ابزار جدول' : 'ابزار جدول'}>
          <Button
            size="small"
            shape="circle"
            icon={<TableOutlined />}
            className="table-menu-trigger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setTableMenuOpen((prev) => !prev)}
          />
        </Tooltip>
        {tableMenuOpen ? (
          <div className="table-bubble-menu">
            <span className="table-size-hint">عرض ستون و ارتفاع ردیف را با کشیدن لبهٔ سلول تغییر دهید.</span>
            {iconBtn('نوشتن قبل از جدول', <ArrowUpOutlined />, () => insertParagraphAroundTable('before'), !editor)}
            {iconBtn('نوشتن بعد از جدول', <ArrowDownOutlined />, () => insertParagraphAroundTable('after'), !editor)}
            {iconBtn('کوچک‌تر کردن عرض جدول', <MinusOutlined />, () => updateCurrentTableWidth(-10), !editor)}
            {iconBtn('بزرگ‌تر کردن عرض جدول', <PlusOutlined />, () => updateCurrentTableWidth(10), !editor)}
            {iconBtn('انتخاب جدول', <TableOutlined />, selectCurrentTable, !editor)}
            {iconBtn('حذف جدول', <DeleteOutlined />, deleteCurrentTable, !editor)}
            <Divider type="vertical" />
            {iconBtn('ردیف بالا', <ArrowUpOutlined />, () => runTableCommand(() => editor.chain().focus().addRowBefore().run()), !editor)}
            {iconBtn('ردیف پایین', <ArrowDownOutlined />, () => runTableCommand(() => editor.chain().focus().addRowAfter().run()), !editor)}
            {iconBtn('حذف ردیف', <DeleteOutlined />, () => runTableCommand(() => editor.chain().focus().deleteRow().run()), !editor)}
            <Divider type="vertical" />
            {iconBtn('ستون راست', <ArrowRightOutlined />, () => runTableCommand(() => editor.chain().focus().addColumnBefore().run()), !editor)}
            {iconBtn('ستون چپ', <ArrowLeftOutlined />, () => runTableCommand(() => editor.chain().focus().addColumnAfter().run()), !editor)}
            {iconBtn('حذف ستون', <DeleteOutlined />, () => runTableCommand(() => editor.chain().focus().deleteColumn().run()), !editor)}
            <Divider type="vertical" />
            {iconBtn('انتخاب ردیف', <ArrowRightOutlined />, selectTableRow, !editor)}
            {iconBtn('انتخاب ستون', <ArrowDownOutlined />, selectTableColumn, !editor)}
            {iconBtn('مرج', <CompressOutlined />, () => runTableCommand(() => editor.chain().focus().mergeCells().run()), !editor)}
            {iconBtn('جداسازی', <ExpandOutlined />, () => runTableCommand(() => editor.chain().focus().splitCell().run()), !editor)}
            <Divider type="vertical" />
            <label className="color-chip" title="رنگ کادر جدول">
                <TableOutlined />
                <input
                  type="color"
                  value={tableBorderColorInput}
                  onChange={(e) => {
                    const nextColor = e.target.value;
                    setTableBorderColor(nextColor);
                    runTableCommand(() => editor.chain().focus().updateAttributes('table', { borderColor: nextColor }).run());
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
                      runTableCommand(() => editor.chain().focus().updateAttributes('table', { borderColor: color }).run());
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
                  value={cellColorInput}
                  onChange={(e) => {
                    const nextColor = e.target.value;
                    setCellColor(nextColor);
                    runTableCommand(() => editor.chain().focus().setCellAttribute('backgroundColor', nextColor).run());
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
                      runTableCommand(() => editor.chain().focus().setCellAttribute('backgroundColor', color).run());
                    }}
                    title={color}
                  />
                ))}
              </div>
            </label>
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  ) : null;
  const imageTools = editor?.isActive('image') ? (
    <BubbleMenu editor={editor} shouldShow={() => editor.isActive('image') && editor.isFocused}>
      <div className="table-bubble-menu">
        {iconBtn('\u06A9\u0648\u0686\u06A9\u200C\u06A9\u0631\u062F\u0646 \u062A\u0635\u0648\u06CC\u0631', <MinusOutlined />, () => stepImageWidth(-12), !editor)}
        {iconBtn('\u0628\u0632\u0631\u06AF\u200C\u06A9\u0631\u062F\u0646 \u062A\u0635\u0648\u06CC\u0631', <PlusOutlined />, () => stepImageWidth(12), !editor)}
        {iconBtn('\u0641\u06CC\u062A \u062F\u0627\u062E\u0644 \u0633\u0644\u0648\u0644', <CompressOutlined />, fitImageToCell, !editor)}
      </div>
    </BubbleMenu>
  ) : null;

  return (
    <div
      className="print-template-editor-root"
      data-fill-height={fillHeight ? 'true' : 'false'}
      data-fixed-height={resolvedEditorHeight ? 'true' : 'false'}
    >
      {tableTools}
      {imageTools}
      <EditorContent editor={editor} className="print-template-editor-shell" />

      <style>{`
        .print-template-editor-root {
          position: relative;
          background: transparent;
          overflow: visible;
          z-index: 20;
          ${resolvedEditorHeight ? `height: ${resolvedEditorHeight}px;` : ''}
        }
        .print-template-editor-root:focus-within {
          z-index: 80;
        }
        .print-template-editor-root[data-fill-height='true'] {
          height: 100%;
          min-height: 0;
        }
        .print-template-editor-root[data-fill-height='true'] .print-template-editor-shell {
          height: 100%;
          min-height: 0;
        }
        .print-template-editor-content {
          min-height: ${resolvedEditorHeight ?? Math.max(minHeight, 120)}px;
          ${resolvedEditorHeight ? `height: ${resolvedEditorHeight}px;` : ''}
          padding: ${contentPadding};
          outline: none;
          direction: rtl;
          text-align: right;
          font-family: inherit;
          line-height: 1.9;
          color: #0f172a;
          background: transparent;
          user-select: text;
          -webkit-user-select: text;
          box-sizing: border-box;
          overflow: ${resolvedEditorHeight ? 'auto' : 'visible'};
          overscroll-behavior: auto;
          touch-action: auto;
        }
        .dark .print-template-editor-content {
          color: #e5e7eb;
        }
        .print-template-editor-root[data-fill-height='true'] .print-template-editor-content {
          min-height: 0;
          height: 100%;
          overflow: auto;
          overscroll-behavior: auto;
        }
        .print-template-editor-content * {
          user-select: text;
          -webkit-user-select: text;
        }
        .print-template-editor-content > :first-child {
          margin-top: 0 !important;
        }
        .print-template-editor-content > :last-child {
          margin-bottom: 0 !important;
        }
        .print-template-editor-content p {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        .dark .print-template-editor-content p,
        .dark .print-template-editor-content div,
        .dark .print-template-editor-content span,
        .dark .print-template-editor-content li,
        .dark .print-template-editor-content strong,
        .dark .print-template-editor-content em,
        .dark .print-template-editor-content u,
        .dark .print-template-editor-content blockquote,
        .dark .print-template-editor-content code,
        .dark .print-template-editor-content pre,
        .dark .print-template-editor-content h1,
        .dark .print-template-editor-content h2,
        .dark .print-template-editor-content h3,
        .dark .print-template-editor-content h4,
        .dark .print-template-editor-content h5,
        .dark .print-template-editor-content h6,
        .dark .print-template-editor-content td,
        .dark .print-template-editor-content th {
          color: #e5e7eb !important;
        }
        .dark .print-template-editor-content a {
          color: #93c5fd !important;
        }
        .print-template-editor-content td p,
        .print-template-editor-content th p {
          margin: 0 !important;
          font-size: inherit !important;
          line-height: 1.6 !important;
        }
        .print-template-editor-content td p:empty,
        .print-template-editor-content th p:empty {
          display: block !important;
          min-height: 1.6em;
          cursor: text;
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
          border-radius: 10px;
          background: rgba(248, 250, 252, 0.92);
          box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.26);
        }
        .print-editor-image-node {
          position: relative;
          display: inline-flex;
          align-items: stretch;
          justify-content: center;
          max-width: 100%;
          margin: 6px 0;
          vertical-align: top;
          direction: ltr;
          flex: 0 0 auto;
          overflow: visible;
        }
        .print-editor-image-node.variable-image {
          min-width: 84px;
          min-height: 84px;
        }
        .print-editor-image-node.selected {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.55);
          outline-offset: 3px;
          border-radius: 12px;
        }
        .print-editor-image-node img {
          width: 100%;
          max-width: 100%;
          user-select: none;
          -webkit-user-drag: none;
        }
        .print-editor-image-placeholder {
          width: 100%;
          min-height: 84px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border: 1px dashed rgba(var(--brand-500-rgb), 0.5);
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(var(--brand-500-rgb), 0.08), rgba(248,250,252,0.95));
          color: #334155;
          text-align: center;
          box-sizing: border-box;
        }
        .dark .print-editor-image-placeholder {
          background: linear-gradient(180deg, rgba(var(--brand-500-rgb), 0.12), rgba(15,23,42,0.92));
          color: #e2e8f0;
        }
        .print-editor-image-placeholder-icon {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(var(--brand-500-rgb), 0.14);
          color: rgb(var(--brand-500-rgb));
          font-size: 14px;
        }
        .print-editor-image-placeholder-label {
          font-size: 12px;
          line-height: 1.7;
          word-break: break-word;
          overflow-wrap: anywhere;
          direction: ltr;
        }
        .print-editor-image-handle {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.95);
          background: rgb(var(--brand-500-rgb));
          box-shadow: 0 2px 10px rgba(15,23,42,0.18);
          padding: 0;
          z-index: 2;
        }
        .print-editor-image-handle.handle-nw {
          left: -6px;
          top: -6px;
          cursor: nwse-resize;
        }
        .print-editor-image-handle.handle-ne {
          right: -6px;
          top: -6px;
          cursor: nesw-resize;
        }
        .print-editor-image-handle.handle-sw {
          left: -6px;
          bottom: -6px;
          cursor: nesw-resize;
        }
        .print-editor-image-handle.handle-se {
          right: -6px;
          bottom: -6px;
          cursor: nwse-resize;
        }
        .print-template-editor-content img.ProseMirror-selectednode {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.55);
          outline-offset: 3px;
          cursor: nwse-resize;
          box-shadow:
            0 0 0 1px rgba(var(--brand-500-rgb), 0.3),
            -6px -6px 0 -2px #fff,
            6px -6px 0 -2px #fff,
            -6px 6px 0 -2px #fff,
            6px 6px 0 -2px #fff;
        }
        .print-template-editor-content table {
          border-collapse: collapse;
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          margin: 10px 0;
          --table-border-color: #d1d5db;
        }
        .print-template-editor-root[data-fixed-height='true'] .print-template-editor-content table {
          margin-top: 0;
          margin-bottom: 0;
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
          z-index: 3;
          cursor: col-resize;
          touch-action: none;
        }
        .print-template-editor-content.resize-cursor {
          cursor: col-resize;
        }
        .print-template-editor-content.column-resize-cursor,
        .print-template-editor-content.column-resize-cursor * {
          cursor: col-resize !important;
        }
        .print-template-editor-content.row-resize-cursor,
        .print-template-editor-content.row-resize-cursor * {
          cursor: row-resize !important;
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
        .table-floating-tools {
          display: inline-flex;
          align-items: flex-start;
          gap: 6px;
          direction: rtl;
          position: relative;
          z-index: 10000;
        }
        .table-menu-trigger {
          border-color: rgba(var(--brand-500-rgb), 0.35);
          color: rgb(var(--brand-500-rgb));
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }
        .dark .table-menu-trigger {
          background: rgba(17, 24, 39, 0.96);
          border-color: rgba(var(--brand-500-rgb), 0.45);
        }
        .table-bubble-menu {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          max-width: min(680px, 88vw);
          padding: 8px;
          position: relative;
          z-index: 10001;
          border: 1px solid rgba(229, 231, 235, 0.9);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
          backdrop-filter: blur(10px);
        }
        .table-size-hint {
          flex: 1 1 100%;
          color: #64748b;
          font-size: 11px;
          line-height: 1.65;
          padding: 0 2px 2px;
        }
        .dark .table-size-hint { color: #cbd5e1; }
        .dark .table-bubble-menu {
          background: rgba(17, 24, 39, 0.96);
          border-color: rgba(71, 85, 105, 0.95);
        }
        [data-tippy-root],
        .tippy-box,
        .tippy-content {
          z-index: 10000 !important;
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


