import React from 'react';
import { QRCode } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getPrintLetterheadItemLabel,
  getPrintLetterheadLayoutItem,
  toPercentStyle,
  type PrintLetterheadConfig,
  type PrintLetterheadLayoutItem,
} from './letterheads';
import { toPersianNumber } from '../persianNumberFormatter';

export interface PrintLetterheadRuntimeValues {
  title?: string | null;
  date?: string | null;
  number?: string | null;
  attachment?: string | null;
  qrValue?: string | null;
}

const normalizeText = (value: unknown) => String(value || '').trim();
const LETTERHEAD_SAFE_GUTTER_PERCENT = 0.75;

const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildRuntimeTextBoxHtml = (label: string, value: string, style: React.CSSProperties) =>
  renderToStaticMarkup(
    React.createElement(
      'div',
      {
        style: {
          ...style,
          padding: '4px 6px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '2px',
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 8,
          color: '#0f172a',
          fontSize: 11,
          lineHeight: 1.8,
          overflow: 'hidden',
          direction: 'rtl',
        },
      },
      React.createElement('div', { style: { fontSize: 10, color: '#475569', fontWeight: 700 } }, label),
      React.createElement('div', {
        style: {
          fontWeight: 700,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        },
        dangerouslySetInnerHTML: { __html: escapeHtml(value).replace(/\n/g, '<br />') },
      }),
    ),
  );

const buildQrBoxHtml = (label: string, value: string, style: React.CSSProperties) =>
  renderToStaticMarkup(
    React.createElement(
      'div',
      {
        style: {
          ...style,
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '2px',
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 8,
          color: '#0f172a',
          fontSize: 10,
          direction: 'rtl',
          overflow: 'hidden',
        },
      },
      React.createElement('div', { style: { fontWeight: 700, color: '#475569' } }, label),
      React.createElement(QRCode, { value, type: 'svg', size: 76, bordered: false }),
    ),
  );

export const getPrintLetterheadBodyItem = (letterhead: PrintLetterheadConfig | null | undefined) =>
  letterhead ? getPrintLetterheadLayoutItem(letterhead.layout, 'body') : null;

export const getPrintLetterheadSignaturesItem = (letterhead: PrintLetterheadConfig | null | undefined) =>
  letterhead ? getPrintLetterheadLayoutItem(letterhead.layout, 'signatures') : null;

export const getPrintLetterheadEffectiveBodyItem = (
  letterhead: PrintLetterheadConfig | null | undefined,
  hasSignatureBand: boolean,
): PrintLetterheadLayoutItem | null => {
  const bodyItem = getPrintLetterheadBodyItem(letterhead);
  const signaturesItem = getPrintLetterheadSignaturesItem(letterhead);
  if (!bodyItem) return null;

  const bodyRight = Math.min(100, bodyItem.x + bodyItem.width);
  const overlapsBodyHorizontally = (item: PrintLetterheadLayoutItem) =>
    item.x < bodyRight && item.x + item.width > bodyItem.x;
  const bodyBottom = Math.min(100, bodyItem.y + bodyItem.height);
  const runtimeOverlayBottom = (letterhead?.layout?.items || [])
    .filter((item) => item.visible !== false && item.type !== 'body' && item.type !== 'signatures')
    .filter(overlapsBodyHorizontally)
    .filter((item) => item.y < bodyBottom)
    .reduce((maxBottom, item) => Math.max(maxBottom, Math.min(100, item.y + item.height)), bodyItem.y);
  const safeTop = Math.min(
    bodyBottom,
    runtimeOverlayBottom > bodyItem.y
      ? runtimeOverlayBottom + LETTERHEAD_SAFE_GUTTER_PERCENT
      : bodyItem.y
  );

  // Some legacy letterheads do not define a signature lane. They still need
  // their title/date/QR overlays kept out of the printable body.
  if (!signaturesItem) {
    return {
      ...bodyItem,
      y: safeTop,
      height: Math.max(1, bodyBottom - safeTop),
    };
  }

  // The signature band is an opaque, absolute layer on every generated page.
  // Reserve that rectangle before pagination, otherwise the body can continue
  // beneath it and look as if its final line has been erased.
  if (hasSignatureBand) {
    const signatureTop = Math.max(0, Math.min(100, signaturesItem.y - LETTERHEAD_SAFE_GUTTER_PERCENT));
    const safeBottom = overlapsBodyHorizontally(signaturesItem)
      ? Math.min(bodyBottom, signatureTop)
      : bodyBottom;
    return {
      ...bodyItem,
      y: safeTop,
      height: Math.max(1, safeBottom - safeTop),
    };
  }

  const signatureBottom = Math.min(100, signaturesItem.y + signaturesItem.height);
  if (signatureBottom <= bodyItem.y) return bodyItem;

  return {
    ...bodyItem,
    y: safeTop,
    height: Math.max(bodyBottom - safeTop, signatureBottom - safeTop),
  };
};

export const buildPrintLetterheadOverlayHtml = (
  letterhead: PrintLetterheadConfig | null | undefined,
  values: PrintLetterheadRuntimeValues,
) => {
  if (!letterhead) return '';

  const items: string[] = [];
  const runtimeMap: Array<{ key: keyof PrintLetterheadRuntimeValues; type: 'title' | 'date' | 'number' | 'attachment' }> = [
    { key: 'title', type: 'title' },
    { key: 'date', type: 'date' },
    { key: 'number', type: 'number' },
    { key: 'attachment', type: 'attachment' },
  ];

  runtimeMap.forEach(({ key, type }) => {
    const item = getPrintLetterheadLayoutItem(letterhead.layout, type);
    const value = normalizeText(values[key]);
    if (!item || item.visible === false || !value) return;
    items.push(buildRuntimeTextBoxHtml(getPrintLetterheadItemLabel(type), value, toPercentStyle(item)));
  });

  const qrItem = getPrintLetterheadLayoutItem(letterhead.layout, 'qr');
  const qrValue = normalizeText(values.qrValue);
  if (qrItem && qrItem.visible !== false && qrValue) {
    items.push(buildQrBoxHtml(getPrintLetterheadItemLabel('qr'), qrValue, toPercentStyle(qrItem)));
  }

  return items.join('');
};

export const buildPrintLetterheadPageCounterHtml = (pageIndex: number, pageCount: number) =>
  renderToStaticMarkup(
    React.createElement(
      'div',
      {
        style: {
          position: 'absolute',
          left: 16,
          bottom: 10,
          direction: 'rtl',
          fontSize: 10,
          color: '#475569',
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 999,
          padding: '2px 8px',
          zIndex: 12,
        },
      },
      `صفحه ${toPersianNumber(`${pageIndex + 1} از ${pageCount}`)}`,
    ),
  );
