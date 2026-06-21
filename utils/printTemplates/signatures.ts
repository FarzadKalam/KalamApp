import { FieldType } from '../../types';
import { resolveManagerTitle } from '../companySettings';
import { resolvePrintAssigneeLabel } from './assigneeDisplay';

export type PrintSignatureScope = 'record' | 'list';
export type PrintSignatureSignerModule = 'profiles' | 'employees' | 'customers' | 'suppliers';
export type PrintSignatureKind =
  | 'manual'
  | 'ceo'
  | 'current_user'
  | 'record_assignee'
  | 'record_relation'
  | 'selected_signer';

export interface PrintSignatureConfig {
  id: string;
  kind: PrintSignatureKind;
  automatic: boolean;
  signerModule?: PrintSignatureSignerModule | null;
  signerId?: string | null;
  sourceFieldKey?: string | null;
  sourceFieldLabel?: string | null;
  nameOverride?: string | null;
  subtitleOverride?: string | null;
}

export interface PrintSignatureQuickAddOption {
  key: PrintSignatureKind;
  label: string;
  disabled?: boolean;
}

export interface PrintSignatureDerivedState {
  id: string;
  kind: PrintSignatureKind;
  automatic: boolean;
  signerModule: PrintSignatureSignerModule | null;
  signerId: string | null;
  sourceFieldKey: string | null;
  sourceFieldLabel: string | null;
  derivedName: string;
  derivedSubtitle: string;
  nameValue: string;
  subtitleValue: string;
  signatureImageUrl: string | null;
  stampImageUrl: string | null;
  showCompanyAssets: boolean;
  sourceDescription: string;
  unresolved: boolean;
}

export const PRINT_SIGNATURE_SECTION_HEIGHT_PX = 104;
export const PRINT_SIGNATURE_SECTION_WITH_COMPANY_ASSETS_HEIGHT_PX = 132;

const RELATION_SIGNER_MODULES = new Set<PrintSignatureSignerModule>(['employees', 'customers', 'suppliers']);
const FIELD_RELATION_TYPES = new Set([
  String(FieldType.RELATION).toLowerCase(),
  String(FieldType.USER).toLowerCase(),
]);
const LEGACY_SIGNATURE_FIELD_PATTERN = /system\.(footer_signatures|company_signatory_name|company_signatory_title|company_signature_image|company_stamp_image)/i;

const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeNullableText = (value: unknown) => {
  const text = normalizeText(value);
  return text || null;
};
const hasOwnStringValue = (value: unknown) => typeof value === 'string' || value === '';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const getSignerModuleLabel = (signerModule: PrintSignatureSignerModule | null | undefined) => {
  switch (signerModule) {
    case 'employees':
      return 'کارمند';
    case 'customers':
      return 'مشتری';
    case 'suppliers':
      return 'تامین‌کننده';
    case 'profiles':
      return 'کاربر';
    default:
      return 'امضاکننده';
  }
};

const getDisplayName = (record: any) =>
  normalizeText(
    record?.display_name ||
      record?.full_name ||
      record?.business_name ||
      record?.name ||
      record?.title ||
      record?.label ||
      record?.system_code
  );

const buildSignatureRoleLine = (roleLabel: string) => {
  const resolved = normalizeText(roleLabel) || 'امضاکننده';
  return `امضای ${resolved}`;
};

const buildSignerKey = (signerModule?: string | null, signerId?: string | null) => {
  const normalizedModule = normalizeText(signerModule);
  const normalizedId = normalizeText(signerId);
  if (!normalizedModule || !normalizedId) return '';
  return `${normalizedModule}:${normalizedId}`;
};

const resolveSharedRowValue = (rows: any[], fieldKey: string) => {
  const normalizedFieldKey = normalizeText(fieldKey);
  if (!normalizedFieldKey || !Array.isArray(rows) || rows.length === 0) return null;
  const firstValue = normalizeText(rows[0]?.[normalizedFieldKey]);
  if (!firstValue) return null;
  const allSame = rows.every((row) => normalizeText(row?.[normalizedFieldKey]) === firstValue);
  return allSame ? firstValue : null;
};

const findFieldByKey = (moduleConfig: any, fieldKey: string) =>
  (Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : []).find(
    (field: any) => normalizeText(field?.key) === normalizeText(fieldKey)
  ) || null;

const getRelationFieldSignerModule = (field: any): PrintSignatureSignerModule | null => {
  const targetModule = normalizeText(field?.relationConfig?.targetModule);
  if (targetModule === 'profiles') return 'profiles';
  if (targetModule === 'employees') return 'employees';
  if (targetModule === 'customers') return 'customers';
  if (targetModule === 'suppliers') return 'suppliers';
  return null;
};

const isEligibleRelationField = (field: any) => {
  const fieldType = normalizeText(field?.type).toLowerCase();
  if (!FIELD_RELATION_TYPES.has(fieldType)) return false;
  return getRelationFieldSignerModule(field) !== null;
};

const resolveRelationValue = (
  config: PrintSignatureConfig,
  scope: PrintSignatureScope,
  record: any,
  rows: any[],
) => {
  const fieldKey = normalizeText(config.sourceFieldKey);
  if (!fieldKey) return null;
  return scope === 'list'
    ? resolveSharedRowValue(rows, fieldKey)
    : normalizeNullableText(record?.[fieldKey]);
};

const buildUserRoleTitleMap = (assigneeDirectory: any) => {
  const roleMap = new Map<string, string>();
  (assigneeDirectory?.roles || []).forEach((role: any) => {
    const roleId = normalizeText(role?.id);
    const roleTitle = normalizeText(role?.title || role?.name);
    if (roleId && roleTitle) roleMap.set(roleId, roleTitle);
  });
  return roleMap;
};

const resolveUserDisplayInfo = (userId: string | null, assigneeDirectory: any) => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return { name: '', roleTitle: '' };
  }
  const users = Array.isArray(assigneeDirectory?.users) ? assigneeDirectory.users : [];
  const rolesById = buildUserRoleTitleMap(assigneeDirectory);
  const user = users.find((item: any) => normalizeText(item?.id) === normalizedUserId) || null;
  const roleTitle = normalizeText(user?.role_title || rolesById.get(normalizeText(user?.role_id)) || '');
  return {
    name: getDisplayName(user),
    roleTitle,
  };
};

const resolveRelatedSignerLabel = (
  signerModule: PrintSignatureSignerModule | null | undefined,
  signerId: string | null | undefined,
  signerLabelByKey: Record<string, string>,
  relationOptions: Record<string, any[]>,
  fieldKey?: string | null,
) => {
  const key = buildSignerKey(signerModule, signerId);
  if (key && normalizeText(signerLabelByKey?.[key])) {
    return normalizeText(signerLabelByKey[key]);
  }
  if (fieldKey && Array.isArray(relationOptions?.[fieldKey])) {
    const found = relationOptions[fieldKey].find(
      (item: any) => normalizeText(item?.value) === normalizeText(signerId)
    );
    const label = normalizeText(found?.label || found?.name);
    if (label) return label;
  }
  for (const options of Object.values(relationOptions || {})) {
    if (!Array.isArray(options)) continue;
    const found = options.find((item: any) => {
      if (normalizeText(item?.value) !== normalizeText(signerId)) return false;
      const optionModule = normalizeText(item?.module);
      return !optionModule || optionModule === normalizeText(signerModule);
    });
    const label = normalizeText(found?.label || found?.name);
    if (label) return label;
  }
  return '';
};

const applyOverride = (derivedValue: string, overrideValue: string | null | undefined) =>
  hasOwnStringValue(overrideValue) ? String(overrideValue ?? '') : derivedValue;

const buildRelationDefaultConfigs = ({
  moduleConfig,
  scope,
  record,
  rows,
}: {
  moduleConfig: any;
  scope: PrintSignatureScope;
  record: any;
  rows: any[];
}) => {
  const next: PrintSignatureConfig[] = [];
  const seen = new Set<string>();

  (Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : []).forEach((field: any) => {
    if (!isEligibleRelationField(field)) return;
    const signerModule = getRelationFieldSignerModule(field);
    if (!signerModule || !RELATION_SIGNER_MODULES.has(signerModule)) return;
    const fieldKey = normalizeText(field?.key);
    const signerId = scope === 'list'
      ? resolveSharedRowValue(rows, fieldKey)
      : normalizeNullableText(record?.[fieldKey]);
    if (!signerId) return;
    const dedupeKey = `${signerModule}:${fieldKey}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    next.push({
      id: createPrintSignatureRowId(),
      kind: 'record_relation',
      automatic: true,
      signerModule,
      sourceFieldKey: fieldKey,
      sourceFieldLabel: normalizeText(field?.labels?.fa || fieldKey) || getSignerModuleLabel(signerModule),
    });
  });

  return next;
};

export const createPrintSignatureRowId = () =>
  `print_signature_${Math.random().toString(36).slice(2, 11)}`;

export const isLegacySignatureFooterTemplate = (html: string | null | undefined) => {
  const source = String(html || '');
  return source.includes('system.footer_signatures');
};

export const containsLegacyPrintSignatureTokens = (html: string | null | undefined) =>
  LEGACY_SIGNATURE_FIELD_PATTERN.test(String(html || ''));

export const stripLegacyPrintSignatureTokens = (html: string | null | undefined) => {
  if (!html) return '';
  return String(html)
    .replace(/{{\s*system\.footer_signatures\s*}}/gi, '')
    .replace(/{{\s*system\.company_signatory_name\s*}}/gi, '')
    .replace(/{{\s*system\.company_signatory_title\s*}}/gi, '')
    .replace(/{{\s*system\.company_signature_image\s*}}/gi, '')
    .replace(/{{\s*system\.company_stamp_image\s*}}/gi, '');
};

export const sanitizePrintSignatureConfigs = (value: unknown): PrintSignatureConfig[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      const kind = normalizeText(item?.kind) as PrintSignatureKind;
      const signerModule = normalizeNullableText(item?.signerModule) as PrintSignatureSignerModule | null;
      const automatic = item?.automatic !== false;
      if (!kind || !['manual', 'ceo', 'current_user', 'record_assignee', 'record_relation', 'selected_signer'].includes(kind)) {
        return null;
      }
      return {
        id: normalizeText(item?.id) || createPrintSignatureRowId(),
        kind,
        automatic,
        signerModule,
        signerId: normalizeNullableText(item?.signerId),
        sourceFieldKey: normalizeNullableText(item?.sourceFieldKey),
        sourceFieldLabel: normalizeNullableText(item?.sourceFieldLabel),
        nameOverride: hasOwnStringValue(item?.nameOverride) ? String(item?.nameOverride ?? '') : null,
        subtitleOverride: hasOwnStringValue(item?.subtitleOverride) ? String(item?.subtitleOverride ?? '') : null,
      } satisfies PrintSignatureConfig;
    })
    .filter(Boolean) as PrintSignatureConfig[];
};

export const buildDefaultPrintSignatureConfigs = ({
  scope,
  moduleConfig,
  record = null,
  rows = [],
  currentUserId = null,
  companyInfo = null,
  canUseCeoSignature = false,
}: {
  scope: PrintSignatureScope;
  moduleConfig: any;
  record?: any;
  rows?: any[];
  currentUserId?: string | null;
  companyInfo?: any;
  canUseCeoSignature?: boolean;
}) => {
  const next: PrintSignatureConfig[] = [];
  const hasCeoName = Boolean(normalizeText(companyInfo?.ceo_name));
  const hasAssigneeField = Boolean(findFieldByKey(moduleConfig, 'assignee_id'));
  const assigneeValue = scope === 'list'
    ? resolveSharedRowValue(rows, 'assignee_id')
    : normalizeNullableText(record?.assignee_id);

  if (canUseCeoSignature && hasCeoName) {
    next.push({
      id: createPrintSignatureRowId(),
      kind: 'ceo',
      automatic: true,
    });
  }

  if (normalizeText(currentUserId)) {
    next.push({
      id: createPrintSignatureRowId(),
      kind: 'current_user',
      automatic: true,
      signerModule: 'profiles',
      signerId: normalizeText(currentUserId),
    });
  }

  if (hasAssigneeField && assigneeValue) {
    next.push({
      id: createPrintSignatureRowId(),
      kind: 'record_assignee',
      automatic: true,
      signerModule: 'profiles',
      sourceFieldKey: 'assignee_id',
      sourceFieldLabel:
        normalizeText(findFieldByKey(moduleConfig, 'assignee_id')?.labels?.fa) ||
        normalizeText(findFieldByKey(moduleConfig, 'responsible_id')?.labels?.fa) ||
        'مسئول',
    });
  }

  next.push(
    ...buildRelationDefaultConfigs({
      moduleConfig,
      scope,
      record,
      rows,
    })
  );

  return next;
};

export const materializePrintSignatureStates = ({
  configs,
  scope,
  moduleConfig,
  record = null,
  rows = [],
  relationOptions = {},
  signerLabelByKey = {},
  companyInfo = null,
  currentUser = null,
  currentUserRoleTitle = '',
  assigneeDirectory = null,
  canUseCeoSignature = false,
}: {
  configs: PrintSignatureConfig[];
  scope: PrintSignatureScope;
  moduleConfig: any;
  record?: any;
  rows?: any[];
  relationOptions?: Record<string, any[]>;
  signerLabelByKey?: Record<string, string>;
  companyInfo?: any;
  currentUser?: any;
  currentUserRoleTitle?: string;
  assigneeDirectory?: any;
  canUseCeoSignature?: boolean;
}) => {
  const assigneeField = findFieldByKey(moduleConfig, 'assignee_id');
  return sanitizePrintSignatureConfigs(configs).map((config) => {
    let derivedName = '';
    let derivedSubtitle = '';
    let resolvedSignerId = normalizeNullableText(config.signerId);
    let sourceDescription = '';
    const canRenderCeoSignature = config.kind !== 'ceo' || canUseCeoSignature;

    if (config.automatic && canRenderCeoSignature) {
      switch (config.kind) {
        case 'ceo': {
          const managerTitle = resolveManagerTitle(companyInfo);
          derivedName = normalizeText(companyInfo?.ceo_name);
          derivedSubtitle = buildSignatureRoleLine(managerTitle);
          sourceDescription = `${managerTitle} سازمان`;
          break;
        }
        case 'current_user': {
          const currentUserInfo = resolveUserDisplayInfo(
            normalizeText(currentUser?.id),
            assigneeDirectory
          );
          derivedName = currentUserInfo.name || normalizeText(currentUser?.full_name || currentUser?.display_name);
          derivedSubtitle = buildSignatureRoleLine(currentUserInfo.roleTitle || normalizeText(currentUserRoleTitle) || 'کاربر');
          sourceDescription = 'کاربر جاری';
          break;
        }
        case 'record_assignee': {
          const assigneeId = scope === 'list'
            ? resolveSharedRowValue(rows, 'assignee_id')
            : normalizeNullableText(record?.assignee_id);
          resolvedSignerId = assigneeId;
          const assigneeInfo = resolveUserDisplayInfo(assigneeId, assigneeDirectory);
          derivedName =
            assigneeInfo.name ||
            normalizeText(resolvePrintAssigneeLabel(record, relationOptions)) ||
            normalizeText(resolvePrintAssigneeLabel(rows[0], relationOptions));
          const baseRoleLabel =
            assigneeInfo.roleTitle ||
            normalizeText(config.sourceFieldLabel) ||
            normalizeText(assigneeField?.labels?.fa) ||
            'مسئول';
          derivedSubtitle = buildSignatureRoleLine(baseRoleLabel);
          sourceDescription = 'مسئول همین چاپ';
          break;
        }
        case 'record_relation': {
          resolvedSignerId = resolveRelationValue(config, scope, record, rows);
          const roleLabel = normalizeText(config.sourceFieldLabel) || getSignerModuleLabel(config.signerModule);
          derivedName = resolveRelatedSignerLabel(
            config.signerModule,
            resolvedSignerId,
            signerLabelByKey,
            relationOptions,
            config.sourceFieldKey
          );
          derivedSubtitle = buildSignatureRoleLine(roleLabel);
          sourceDescription = `رابطه رکورد: ${roleLabel}`;
          break;
        }
        case 'selected_signer': {
          derivedName = resolveRelatedSignerLabel(
            config.signerModule,
            resolvedSignerId,
            signerLabelByKey,
            relationOptions,
            null
          );
          derivedSubtitle = buildSignatureRoleLine(
            normalizeText(config.sourceFieldLabel) || getSignerModuleLabel(config.signerModule)
          );
          sourceDescription = `انتخاب مستقیم ${getSignerModuleLabel(config.signerModule)}`;
          break;
        }
        default:
          break;
      }
    }

    const signatureImageUrl = canRenderCeoSignature && config.kind === 'ceo'
      ? normalizeNullableText(companyInfo?.signature_image_url)
      : null;
    const stampImageUrl = canRenderCeoSignature && config.kind === 'ceo'
      ? normalizeNullableText(companyInfo?.stamp_image_url)
      : null;
    const showCompanyAssets = Boolean(signatureImageUrl || stampImageUrl);

    const nameValue = !canRenderCeoSignature && config.kind === 'ceo'
      ? ''
      : config.automatic
        ? applyOverride(derivedName, config.nameOverride)
        : String(config.nameOverride ?? '');
    const subtitleValue = !canRenderCeoSignature && config.kind === 'ceo'
      ? ''
      : config.automatic
        ? applyOverride(derivedSubtitle, config.subtitleOverride)
        : String(config.subtitleOverride ?? '');

    return {
      id: config.id,
      kind: config.kind,
      automatic: config.automatic,
      signerModule: config.signerModule || null,
      signerId: resolvedSignerId,
      sourceFieldKey: config.sourceFieldKey || null,
      sourceFieldLabel: config.sourceFieldLabel || null,
      derivedName,
      derivedSubtitle,
      nameValue,
      subtitleValue,
      signatureImageUrl,
      stampImageUrl,
      showCompanyAssets,
      sourceDescription,
      unresolved:
        (config.automatic && !normalizeText(derivedName) && !normalizeText(config.nameOverride)) ||
        !canRenderCeoSignature,
    } satisfies PrintSignatureDerivedState;
  });
};

export const getPrintSignatureSectionHeightPx = (rows: PrintSignatureDerivedState[]) => {
  const resolvedRows = (rows || []).filter(
    (row) => normalizeText(row?.nameValue) || normalizeText(row?.subtitleValue)
  );
  if (resolvedRows.some((row) => row.showCompanyAssets)) {
    return PRINT_SIGNATURE_SECTION_WITH_COMPANY_ASSETS_HEIGHT_PX;
  }
  return PRINT_SIGNATURE_SECTION_HEIGHT_PX;
};

export const buildPrintSignatureBandHtml = (rows: PrintSignatureDerivedState[]) => {
  const resolvedRows = (rows || []).filter(
    (row) => normalizeText(row?.nameValue) || normalizeText(row?.subtitleValue)
  );
  if (resolvedRows.length === 0) return '';
  const widthPercent = Math.max(22, Math.floor(100 / Math.max(1, resolvedRows.length)));
  return `
<div data-print-signature-band="true" style="width:100%; direction:rtl; display:flex; align-items:flex-start; justify-content:center; gap:10px; padding-top:4px;">
  ${resolvedRows
    .map(
      (row) => {
        const hasCompanyAssets = row.showCompanyAssets && (row.signatureImageUrl || row.stampImageUrl);
        return `
    <div style="flex:1 1 0; max-width:${widthPercent}%; min-width:130px; text-align:center; color:#111827;">
      <div style="min-height:${hasCompanyAssets ? 78 : 52}px; display:flex; align-items:flex-end; justify-content:center; margin-bottom:6px;">
        ${
          hasCompanyAssets
            ? `<div style="display:flex; align-items:flex-end; justify-content:center; gap:8px; min-height:72px;">
                ${row.stampImageUrl ? `<img src="${escapeHtml(row.stampImageUrl)}" alt="مهر سازمان" style="display:block; max-width:68px; max-height:68px; object-fit:contain; opacity:0.9;" />` : ''}
                ${row.signatureImageUrl ? `<img src="${escapeHtml(row.signatureImageUrl)}" alt="امضای سازمان" style="display:block; max-width:96px; max-height:54px; object-fit:contain;" />` : ''}
              </div>`
            : `<div style="width:76%; border-bottom:1px dashed rgba(100,116,139,0.72);"></div>`
        }
      </div>
      <div style="font-size:10.5px; font-weight:700; line-height:1.9; color:#334155; overflow-wrap:anywhere;">${escapeHtml(row.subtitleValue || ' ')}</div>
      <div style="font-size:12px; font-weight:900; line-height:1.9; color:#111827; overflow-wrap:anywhere;">${escapeHtml(row.nameValue || ' ')}</div>
    </div>`.trim();
      }
    )
    .join('')}
</div>`.trim();
};

export const getPrintSignatureQuickAddOptions = ({
  canUseCeoSignature,
  companyInfo = null,
}: {
  canUseCeoSignature: boolean;
  companyInfo?: any;
}): PrintSignatureQuickAddOption[] => [
  { key: 'current_user', label: 'امضای من' },
  { key: 'ceo', label: `امضای ${resolveManagerTitle(companyInfo)}`, disabled: !canUseCeoSignature },
  { key: 'record_assignee', label: 'امضای مسئول' },
  { key: 'selected_signer', label: 'امضای انتخابی' },
  { key: 'manual', label: 'امضای دستی' },
];
