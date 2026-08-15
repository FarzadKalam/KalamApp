/**
 * Shared physical layout rules for paginated record printouts.
 *
 * Keep a real physical safety lane at both edges of every body viewport.
 * Browser PDF engines independently round transforms, line boxes and clip
 * rectangles; a one-pixel overlap can therefore erase a glyph or let content
 * paint over a repeated header/signature band.
 */
export const MIN_PRINT_BODY_HEIGHT_PX = 80;
// 24 CSS px is ~6.35mm. It covers line-glyph ascent/descent and the
// independent rounding Chrome applies to a translated source and its clip.
export const PRINT_BODY_EDGE_GUARD_PX = 24;

export const normalizePrintBodyHeightPx = (value: number) =>
  Math.max(MIN_PRINT_BODY_HEIGHT_PX, Math.floor(Math.max(MIN_PRINT_BODY_HEIGHT_PX, value)));

/**
 * Page ranges use only the safe middle lane. The surrounding space is still
 * part of the rendered body so headers, footers and signatures keep their
 * configured positions.
 */
export const getTemplatePageBodyStepPx = (pageBodyHeightPx: number) =>
  Math.max(1, normalizePrintBodyHeightPx(pageBodyHeightPx) - PRINT_BODY_EDGE_GUARD_PX * 2);

export const getPrintBodyViewportHeightPx = (
  pageBodyHeightPx: number,
  effectiveBodyStepPx: number
) =>
  Math.min(
    normalizePrintBodyHeightPx(pageBodyHeightPx),
    Math.max(1, Math.ceil(effectiveBodyStepPx) + PRINT_BODY_EDGE_GUARD_PX * 2)
  );

/** Translate source content so a range begins after the top safety lane. */
export const getPrintBodySegmentTranslationPx = (pageStartOffset: number) =>
  PRINT_BODY_EDGE_GUARD_PX - Math.max(0, Math.floor(pageStartOffset));

/**
 * The final page with signatures should keep those signatures next to the
 * actual content.  The unused page space remains after the footer instead of
 * becoming an artificial void between the invoice and its signatories.
 */
export const getFinalContentBodyHeightPx = ({
  pageBodyHeightPx,
  pageStartOffset,
  contentHeightPx,
}: {
  pageBodyHeightPx: number;
  pageStartOffset: number;
  contentHeightPx: number | null | undefined;
}) => {
  const fullHeight = normalizePrintBodyHeightPx(pageBodyHeightPx);
  // A zero-sized measurement means that the preview has not been laid out yet
  // (for example immediately after a template switch). Do not collapse the
  // body to a one-pixel strip in that transient state.
  if (!Number.isFinite(contentHeightPx) || Number(contentHeightPx) <= 1) return fullHeight;

  const remainingContentHeight = Math.ceil(Number(contentHeightPx) - Math.max(0, pageStartOffset));
  return Math.min(fullHeight, Math.max(1, remainingContentHeight));
};
