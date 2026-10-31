import type { PrintPageMargins } from './nativePrintFlow';

type LayoutBox = { x: number; y: number; width: number; height: number };

/** Keep the configured signature lane on intermediate letterhead pages. */
export const buildLetterheadSignatureFlow = ({
  widthMm, heightMm, body, signatures, signatureHtml,
}: {
  widthMm: number; heightMm: number; body: LayoutBox;
  signatures?: LayoutBox | null; signatureHtml?: string;
}): { pageMargins: PrintPageMargins; signatureHtml: string; artworkHeightMm: number } => {
  // Expanding the flowing area to include signatures must not stretch the
  // organization's existing background or reposition its configured overlays.
  const artworkHeightMm = heightMm * body.height / 100;
  const hasSignatures = Boolean(signatures && signatureHtml);
  const bottom = hasSignatures
    ? Math.max(body.y + body.height, signatures!.y + signatures!.height)
    : body.y + body.height;
  const pageMargins = {
    top: heightMm * body.y / 100,
    right: widthMm * Math.max(0, 100 - body.x - body.width) / 100,
    bottom: heightMm * Math.max(0, 100 - bottom) / 100,
    left: widthMm * body.x / 100,
  };
  if (!hasSignatures) return { pageMargins, signatureHtml: '', artworkHeightMm };
  const bodyWidth = Math.max(1, body.width);
  const width = signatures!.width / bodyWidth * 100;
  const offset = (signatures!.x - body.x) / bodyWidth * 100;
  return {
    pageMargins,
    artworkHeightMm,
    signatureHtml: `<div style="display:flex;direction:ltr;overflow:visible;"><div style="flex:0 0 ${width}%;max-width:none;margin-left:${offset}%;direction:rtl;">${signatureHtml}</div></div>`,
  };
};
