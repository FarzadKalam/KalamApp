/**
 * Shared physical layout rules for paginated record printouts.
 *
 * The single-pixel guard belongs to the page body only.  Reserving it again
 * for headers, footers and signatures accumulates visible blank bands and does
 * not make a line break any safer.
 */
export const MIN_PRINT_BODY_HEIGHT_PX = 80;
export const PRINT_BODY_BOUNDARY_GUARD_PX = 1;

export const normalizePrintBodyHeightPx = (value: number) =>
  Math.max(MIN_PRINT_BODY_HEIGHT_PX, Math.floor(Math.max(MIN_PRINT_BODY_HEIGHT_PX, value)));

/**
 * Leave exactly one physical pixel at the bottom of a full body region.  Page
 * offsets themselves are still aligned to measured line bottoms, so no text
 * is clipped to create this guard.
 */
export const getTemplatePageBodyStepPx = (pageBodyHeightPx: number) =>
  Math.max(
    MIN_PRINT_BODY_HEIGHT_PX,
    normalizePrintBodyHeightPx(pageBodyHeightPx) - PRINT_BODY_BOUNDARY_GUARD_PX
  );

export const getPrintBodyViewportHeightPx = (
  pageBodyHeightPx: number,
  effectiveBodyStepPx: number
) =>
  Math.min(
    normalizePrintBodyHeightPx(pageBodyHeightPx),
    Math.max(1, Math.floor(effectiveBodyStepPx))
  );

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
