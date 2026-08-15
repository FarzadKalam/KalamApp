export interface NativePrintOptions {
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerHtml: string;
  footerHtml: string;
}

const extractNativePrintNumber = (documentHtml: string, name: string) => {
  const match = documentHtml.match(new RegExp(`\\bdata-kalamapp-${name}="([^"]+)"`, 'i'));
  const value = Number(match?.[1] || '');
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const extractNativePrintTemplate = (documentHtml: string, id: string) => {
  const match = documentHtml.match(
    new RegExp(`<template\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/template>`, 'i')
  );
  return String(match?.[1] || '').trim();
};

export const getNativePrintOptions = (documentHtml: string): NativePrintOptions | null => {
  if (!/\bdata-kalamapp-native-print-flow="true"/i.test(documentHtml)) return null;

  const widthMm = extractNativePrintNumber(documentHtml, 'paper-width-mm');
  const heightMm = extractNativePrintNumber(documentHtml, 'paper-height-mm');
  const marginTopMm = extractNativePrintNumber(documentHtml, 'margin-top-mm');
  const marginRightMm = extractNativePrintNumber(documentHtml, 'margin-right-mm');
  const marginBottomMm = extractNativePrintNumber(documentHtml, 'margin-bottom-mm');
  const marginLeftMm = extractNativePrintNumber(documentHtml, 'margin-left-mm');
  if (
    widthMm == null ||
    heightMm == null ||
    marginTopMm == null ||
    marginRightMm == null ||
    marginBottomMm == null ||
    marginLeftMm == null
  ) {
    return null;
  }

  return {
    widthMm,
    heightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    headerHtml: extractNativePrintTemplate(documentHtml, 'kalamapp-gotenberg-header'),
    footerHtml: extractNativePrintTemplate(documentHtml, 'kalamapp-gotenberg-footer'),
  };
};
