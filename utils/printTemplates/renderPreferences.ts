import { DEFAULT_PRINT_IMAGE_DISPLAY_MODE, sanitizePrintImageDisplayMode, type PrintImageDisplayMode } from './imageDisplay';
import { sanitizePrintSignatureConfigs, type PrintSignatureConfig } from './signatures';

const PRINT_RENDER_PREFERENCES_KEY = 'kalamapp.print_render_preferences.v2';

type PrintFieldScope = 'record' | 'list';

type PrintRenderPreferenceStore = Record<string, {
  imageDisplayMode?: PrintImageDisplayMode;
  signatureConfigs?: PrintSignatureConfig[];
}>;

const readStore = (): PrintRenderPreferenceStore => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PRINT_RENDER_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as PrintRenderPreferenceStore : {};
  } catch {
    return {};
  }
};

const writeStore = (store: PrintRenderPreferenceStore) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRINT_RENDER_PREFERENCES_KEY, JSON.stringify(store));
};

const buildPreferenceKey = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}) => [
  String(orgId || '').trim(),
  String(userId || 'anonymous').trim() || 'anonymous',
  String(moduleId || '').trim(),
  String(templateId || '').trim(),
  String(scope || 'record').trim(),
].join('::');

export const loadPrintRenderPreference = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}): { imageDisplayMode: PrintImageDisplayMode; signatureConfigs: PrintSignatureConfig[] } => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) {
    return {
      imageDisplayMode: DEFAULT_PRINT_IMAGE_DISPLAY_MODE,
      signatureConfigs: [],
    };
  }
  const key = buildPreferenceKey({ orgId: normalizedOrgId, userId, moduleId, templateId, scope });
  const store = readStore();
  const value = store[key];
  return {
    imageDisplayMode: sanitizePrintImageDisplayMode(value?.imageDisplayMode || DEFAULT_PRINT_IMAGE_DISPLAY_MODE),
    signatureConfigs: sanitizePrintSignatureConfigs(value?.signatureConfigs || []),
  };
};

export const savePrintRenderPreference = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
  imageDisplayMode,
  signatureConfigs,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
  imageDisplayMode: PrintImageDisplayMode;
  signatureConfigs?: PrintSignatureConfig[];
}) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return false;
  const key = buildPreferenceKey({ orgId: normalizedOrgId, userId, moduleId, templateId, scope });
  const store = readStore();
  store[key] = {
    imageDisplayMode: sanitizePrintImageDisplayMode(imageDisplayMode),
    signatureConfigs: sanitizePrintSignatureConfigs(signatureConfigs || []),
  };
  writeStore(store);
  return true;
};
