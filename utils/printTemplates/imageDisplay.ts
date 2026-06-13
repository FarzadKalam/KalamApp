export type PrintImageDisplayMode = 'fit' | 'actual';

export const DEFAULT_PRINT_IMAGE_DISPLAY_MODE: PrintImageDisplayMode = 'fit';

export const sanitizePrintImageDisplayMode = (value: unknown): PrintImageDisplayMode =>
  String(value || '').trim().toLowerCase() === 'actual' ? 'actual' : DEFAULT_PRINT_IMAGE_DISPLAY_MODE;

export const getPrintFramedImageStyle = (mode: PrintImageDisplayMode): string =>
  mode === 'actual'
    ? 'display:block;width:auto;height:auto;max-width:none;max-height:none;object-fit:none;object-position:center center;'
    : 'display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center center;';

export const getPrintFullAreaImageStyle = (mode: PrintImageDisplayMode): string =>
  mode === 'actual'
    ? 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:auto;height:auto;max-width:none;max-height:none;object-fit:none;object-position:center center;display:block;'
    : 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center center;display:block;';
