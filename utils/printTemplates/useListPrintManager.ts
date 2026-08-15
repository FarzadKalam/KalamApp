import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { renderToStaticMarkup } from 'react-dom/server';
import { supabase } from '../../supabaseClient';
import { toPersianNumber, safeJalaliFormat } from '../persianNumberFormatter';
import { readCurrencyConfig } from '../currency';
import {
  buildListCatalogHtml,
  buildListCatalogFullPageHtml,
  buildListSummaryTableHtml,
  buildListTableHtml,
  type ListFieldDefinition,
  type ListPrintSummaryDefinition,
} from '../listPrintExport';
import {
  buildDefaultTemplatesForModule,
  getModuleTitle,
  isPrintTemplateAvailableForModule,
  loadPrintTemplatesStore,
  mergeTemplatesWithDefaults,
  type StoredPrintTemplate,
} from './store';
import type { PrintTemplate } from './index';
import { buildPrintOutputName } from './outputName';
import {
  generatePdfBlob,
  prepareGeneratedPdfWindow,
  printAsPdf,
  shouldUseGeneratedPdfPrint,
  type PdfGenerationProgress,
} from './printAsPdf';
import { normalizeRenderedImages } from './normalizeRenderedImages';
import { printInIframe } from './printInIframe';
import { sanitizeSelectedPrintFieldKeys } from './fieldAccess';
import { hasMeaningfulPrintValue, resolveEffectivePrintFieldKeys } from './printableFields';
import { loadPrintFieldPreference, savePrintFieldPreference } from './fieldPreferences';
import { hasRenderablePrintFooterHtml } from './footerLayout';
import { buildNativeCustomPrintFlowHtml } from './nativePrintFlow';
import { DEFAULT_PRINT_IMAGE_DISPLAY_MODE, sanitizePrintImageDisplayMode, type PrintImageDisplayMode } from './imageDisplay';
import {
  buildPrintLetterheadOverlayHtml,
  buildPrintLetterheadPageCounterHtml,
  getPrintLetterheadEffectiveBodyItem,
  getPrintLetterheadSignaturesItem,
} from './letterheadRender';
import { loadPrintRenderPreference, savePrintRenderPreference } from './renderPreferences';
import { resolvePrintPreferenceIdentity } from './preferenceIdentity';
import { createPrintPreviewFingerprint } from './previewFingerprint';
import { fetchSessionBootstrap } from '../sessionCache';
import { loadScopedCompanySettings } from '../companySettings';
import { SETTINGS_PERMISSION_KEY } from '../permissions';
import { fetchAssigneeDirectory } from '../referenceData';
import { fetchRelationOptionsForField } from '../relationOptions';
import { withPrintIdentityRelationOptions } from './assigneeDisplay';
import {
  buildDefaultPrintSignatureConfigs,
  buildPrintSignatureBandHtml,
  createPrintSignatureRowId,
  getPrintSignatureQuickAddOptions,
  getPrintSignatureSectionHeightPx,
  getSignerModuleLabel,
  materializePrintSignatureStates,
  sanitizePrintSignatureConfigs,
  stripLegacyPrintSignatureTokens,
  type PrintSignatureConfig,
  type PrintSignatureKind,
  type PrintSignatureSignerModule,
} from './signatures';
import { buildPrintLetterheadVariants, getPrintLetterheadById, toPercentStyle } from './letterheads';

const PAGE_MARGINS = { top: 8, right: 8, bottom: 8, left: 8 } as const;

const getPaperMetrics = (
  paperSize: 'A4' | 'A5' | 'A6' = 'A4',
  orientation: 'portrait' | 'landscape' = 'portrait'
) => {
  const base =
    paperSize === 'A6'
      ? { width: 105, height: 148 }
      : paperSize === 'A5'
        ? { width: 148, height: 210 }
        : { width: 210, height: 297 };

  return orientation === 'landscape'
    ? { widthMm: base.height, heightMm: base.width }
    : { widthMm: base.width, heightMm: base.height };
};

interface UseListPrintManagerProps {
  moduleId: string;
  moduleConfig: any;
  rows: any[];
  printableFields: ListFieldDefinition[];
  summary?: ListPrintSummaryDefinition | null;
  relationOptions?: Record<string, any[]>;
  extraSystemValues?: Record<string, any>;
  contextTitle?: string;
  contextValues?: Record<string, any>;
}

export const useListPrintManager = ({
  moduleId,
  moduleConfig,
  rows,
  printableFields,
  summary = null,
  relationOptions = {},
  extraSystemValues = {},
  contextTitle = '',
  contextValues = {},
}: UseListPrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [imageDisplayModes, setImageDisplayModes] = useState<Record<string, PrintImageDisplayMode>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [currentUserRoleTitle, setCurrentUserRoleTitle] = useState('');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<Record<string, any> | null>(null);
  const [userPreferencesReady, setUserPreferencesReady] = useState(false);
  const [assigneeDirectory, setAssigneeDirectory] = useState<any>(null);
  const [printSignatureConfigs, setPrintSignatureConfigs] = useState<Record<string, PrintSignatureConfig[]>>({});
  const [signatureOptionsByRow, setSignatureOptionsByRow] = useState<Record<string, any[]>>({});
  const [signatureLabelByKey, setSignatureLabelByKey] = useState<Record<string, string>>({});
  const [storedTemplates, setStoredTemplates] = useState<StoredPrintTemplate[]>([]);
  const [templatesByModuleStore, setTemplatesByModuleStore] = useState<Record<string, StoredPrintTemplate[]>>({});
  const [, setTemplatesStoreMeta] = useState<{ rowId: string | null; provider: string }>({
    rowId: null,
    provider: 'tiptap',
  });
  const [savingPrintFields, setSavingPrintFields] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const templatesLoadedRef = useRef(false);
  const companyLoadedRef = useRef(false);
  const renderPrintCardRef = useRef<() => React.ReactNode>(() => null);
  const buildNativeListPrintFlowRef = useRef<() => string | null>(() => null);
  const reservedPrintWindowRef = useRef<Window | null>(null);
  const currencyLabel = readCurrencyConfig().label || '';
  const printRelationOptions = useMemo(
    () => withPrintIdentityRelationOptions(relationOptions, assigneeDirectory),
    [assigneeDirectory, relationOptions],
  );

  useEffect(() => {
    let mounted = true;
    fetchSessionBootstrap(supabase)
      .then((snapshot) => {
        if (!mounted) return;
        setCurrentUserId(String(snapshot?.user?.id || '').trim() || null);
        setCurrentOrgId(String(snapshot?.orgId || '').trim() || null);
        setCurrentUserProfile(snapshot?.profile || null);
        setCurrentUserPermissions((snapshot?.permissions || null) as Record<string, any> | null);
        setUserPreferencesReady(true);
        const roleId = String(snapshot?.profile?.role_id || '').trim();
        if (roleId) {
          fetchAssigneeDirectory(supabase)
            .then((directory) => {
              if (!mounted) return;
              setAssigneeDirectory(directory || null);
              const matchedRole = (directory?.roles || []).find((role: any) => String(role?.id || '').trim() === roleId);
              setCurrentUserRoleTitle(String(matchedRole?.title || '').trim());
            })
            .catch(() => {
              if (!mounted) return;
              setCurrentUserRoleTitle('');
            });
        } else {
          setCurrentUserRoleTitle('');
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUserId(null);
        setCurrentOrgId(null);
        setCurrentUserProfile(null);
        setCurrentUserPermissions(null);
        setUserPreferencesReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadTemplates = useCallback(async (mounted = true) => {
    try {
      const loaded = await loadPrintTemplatesStore();
      if (!mounted) return;
      setTemplatesStoreMeta({
        rowId: loaded.rowId || null,
        provider: loaded.provider || 'tiptap',
      });
      setTemplatesByModuleStore(loaded.templatesByModule || {});
      setStoredTemplates((loaded.templatesByModule[moduleId] || []).filter((tpl) => tpl.isActive !== false));
      return true;
    } catch (error) {
      console.error('Load list print templates failed', error);
      if (mounted) {
        setTemplatesByModuleStore({});
        setStoredTemplates([]);
      }
      return false;
    }
  }, [moduleId]);

  useEffect(() => {
    if (!isPrintModalOpen && !printMode) return;
    if (templatesLoadedRef.current) return;
    let mounted = true;
    loadTemplates(mounted).then((loaded) => {
      if (mounted && loaded) templatesLoadedRef.current = true;
    });
    return () => {
      mounted = false;
    };
  }, [isPrintModalOpen, loadTemplates, printMode]);

  useEffect(() => {
    if (!isPrintModalOpen && !printMode) return;
    if (companyLoadedRef.current) return;
    let mounted = true;
    const loadCompany = async () => {
      try {
        const [{ data }, directory] = await Promise.all([
          loadScopedCompanySettings(supabase),
          fetchAssigneeDirectory(supabase).catch(() => null),
        ]);
        if (mounted) {
          setCompanyInfo(data || null);
          if (directory) setAssigneeDirectory(directory);
          companyLoadedRef.current = true;
        }
      } catch (error) {
        console.error('Load company settings for list print failed', error);
      }
    };
    loadCompany();
    return () => {
      mounted = false;
    };
  }, [isPrintModalOpen, printMode]);

  const availableTemplates = useMemo(() => {
    const merged = mergeTemplatesWithDefaults(moduleId, templatesByModuleStore[moduleId] || storedTemplates);
    const scopedTemplates = merged.filter((tpl) =>
      (tpl.scope || 'record') === 'list' &&
      tpl.isActive !== false &&
      isPrintTemplateAvailableForModule(moduleId, tpl)
    );
    const baseTemplates =
      scopedTemplates.length > 0
        ? scopedTemplates
        : buildDefaultTemplatesForModule(moduleId, 'list').filter((tpl) => tpl.isActive !== false);
    return buildPrintLetterheadVariants(baseTemplates, companyInfo?.print_letterheads || []);
  }, [companyInfo?.print_letterheads, moduleId, storedTemplates, templatesByModuleStore]);

  const printTemplates = useMemo<PrintTemplate[]>(
    () =>
      availableTemplates.map((tpl) => ({
        id: `custom:${tpl.id}`,
        title: tpl.title,
        description: tpl.description || 'قالب چاپ جدولی',
        isSystem: tpl.isSystem === true,
      })),
    [availableTemplates]
  );

  useEffect(() => {
    if (!printTemplates.length) {
      setSelectedTemplateId('');
      return;
    }
    if (printTemplates.some((item) => item.id === selectedTemplateId)) return;
    setSelectedTemplateId(printTemplates[0].id);
  }, [printTemplates, selectedTemplateId]);

  const selectedStoredTemplate = useMemo(() => {
    if (!selectedTemplateId.startsWith('custom:')) return null;
    const id = selectedTemplateId.replace('custom:', '');
    return availableTemplates.find((tpl) => tpl.id === id) || null;
  }, [availableTemplates, selectedTemplateId]);
  const selectedOrgLetterhead = useMemo(
    () => getPrintLetterheadById(companyInfo?.print_letterheads || [], selectedStoredTemplate?.letterheadId),
    [companyInfo?.print_letterheads, selectedStoredTemplate?.letterheadId],
  );

  const printableFieldsForTemplate = useMemo(
    () =>
      (printableFields || []).map((field) => ({
        ...field,
        hasValue: (rows || []).some((row: any) => hasMeaningfulPrintValue(row?.[field.key], field.key)),
      })),
    [printableFields, rows]
  );
  const isCatalogTemplate = useMemo(
    () => String(selectedStoredTemplate?.id || '').includes('_catalog_a4_portrait'),
    [selectedStoredTemplate?.id]
  );
  const showImageDisplayModeControl = useMemo(() => {
    const templateId = String(selectedStoredTemplate?.id || '').trim();
    const contentHtml = String(selectedStoredTemplate?.contentHtml || '');
    const hasImageField = printableFieldsForTemplate.some((field) => String(field?.type || '').toLowerCase() === 'image');
    return hasImageField || templateId.includes('_catalog_') || contentHtml.includes('system.list_catalog_');
  }, [printableFieldsForTemplate, selectedStoredTemplate?.contentHtml, selectedStoredTemplate?.id]);

  useEffect(() => {
    if (!selectedTemplateId || !userPreferencesReady) return;
    if (!printableFieldsForTemplate.length) return;
    const preferenceKeys = loadPrintFieldPreference({
      orgId: currentOrgId,
      userId: currentUserId,
      moduleId,
      templateId: selectedStoredTemplate?.id || selectedTemplateId,
      scope: 'list',
      // System templates deliberately discard the old unscoped browser state:
      // historic empty selections could hide every list column on first load.
      allowLegacy: !selectedStoredTemplate?.isSystem,
    });
    const persistedKeys = Array.isArray(preferenceKeys)
      ? preferenceKeys
      : !selectedStoredTemplate?.isSystem && Array.isArray(selectedStoredTemplate?.selectedFieldKeys)
        ? selectedStoredTemplate.selectedFieldKeys
        : null;
    const rawDefaultKeys = resolveEffectivePrintFieldKeys({
      fields: printableFieldsForTemplate,
      selectedKeys: persistedKeys || [],
      hasExplicitSelection: Array.isArray(persistedKeys),
    });

    const defaultKeys = isCatalogTemplate
      ? (() => {
          const sanitizedKeys = rawDefaultKeys;
          const imageKeys = printableFieldsForTemplate
            .filter((field) => String(field?.type || '').toLowerCase() === 'image' && sanitizedKeys.includes(field.key))
            .map((field) => field.key)
            .slice(0, 1);
          const contentKeys = printableFieldsForTemplate
            .filter((field) => String(field?.type || '').toLowerCase() !== 'image' && sanitizedKeys.includes(field.key))
            .map((field) => field.key)
            .slice(0, 5);
          return [...imageKeys, ...contentKeys];
        })()
      : rawDefaultKeys;

    setSelectedPrintFields((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      return {
        ...prev,
        [selectedTemplateId]: defaultKeys,
      };
    });
  }, [
    currentOrgId,
    currentUserId,
    isCatalogTemplate,
    moduleId,
    printableFieldsForTemplate,
    selectedStoredTemplate?.id,
    selectedStoredTemplate?.selectedFieldKeys,
    selectedTemplateId,
    userPreferencesReady,
  ]);

  const canUseCeoSignature = useMemo(
    () => currentUserPermissions?.[SETTINGS_PERMISSION_KEY]?.fields?.ceo_signature === true,
    [currentUserPermissions]
  );

  useEffect(() => {
    if (!selectedTemplateId || !userPreferencesReady) return;
    const preference = loadPrintRenderPreference({
      orgId: currentOrgId,
      userId: currentUserId,
      moduleId,
      templateId: selectedStoredTemplate?.id || selectedTemplateId,
      scope: 'list',
    });
    setImageDisplayModes((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      return {
        ...prev,
        [selectedTemplateId]: sanitizePrintImageDisplayMode(preference.imageDisplayMode),
      };
    });
    const defaultSignatureConfigs = buildDefaultPrintSignatureConfigs({
      scope: 'list',
      moduleConfig,
      rows,
      currentUserId,
      companyInfo,
      canUseCeoSignature,
    });
    setPrintSignatureConfigs((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      const nextConfigs = sanitizePrintSignatureConfigs(preference.signatureConfigs || []);
      return {
        ...prev,
        [selectedTemplateId]: nextConfigs.length > 0 ? nextConfigs : defaultSignatureConfigs,
      };
    });
  }, [
    canUseCeoSignature,
    companyInfo,
    currentUserId,
    moduleConfig,
    moduleId,
    relationOptions,
    rows,
    selectedStoredTemplate?.id,
    selectedTemplateId,
    userPreferencesReady,
  ]);

  const imageDisplayMode = sanitizePrintImageDisplayMode(
    imageDisplayModes[selectedTemplateId] || DEFAULT_PRINT_IMAGE_DISPLAY_MODE
  );
  const selectedPrintSignatureConfigs = useMemo(
    () => sanitizePrintSignatureConfigs(printSignatureConfigs[selectedTemplateId] || []),
    [printSignatureConfigs, selectedTemplateId]
  );
  const printSignatureStates = useMemo(
    () =>
      materializePrintSignatureStates({
        configs: selectedPrintSignatureConfigs,
        scope: 'list',
        moduleConfig,
        rows,
        relationOptions: printRelationOptions,
        signerLabelByKey: signatureLabelByKey,
        companyInfo,
        currentUser: currentUserProfile,
        currentUserRoleTitle,
        assigneeDirectory,
        canUseCeoSignature,
      }),
    [
      assigneeDirectory,
      canUseCeoSignature,
      companyInfo,
      currentUserProfile,
      currentUserRoleTitle,
      moduleConfig,
      printRelationOptions,
      rows,
      selectedPrintSignatureConfigs,
      signatureLabelByKey,
    ]
  );
  const printSignatureBandHtml = useMemo(
    () => buildPrintSignatureBandHtml(printSignatureStates),
    [printSignatureStates]
  );

  useEffect(() => {
    if (currentUserRoleTitle) return;
    const roleId = String(currentUserProfile?.role_id || '').trim();
    if (!roleId) return;
    const matchedRole = (assigneeDirectory?.roles || []).find((role: any) => String(role?.id || '').trim() === roleId);
    const nextTitle = String(matchedRole?.title || '').trim();
    if (nextTitle) setCurrentUserRoleTitle(nextTitle);
  }, [assigneeDirectory, currentUserProfile?.role_id, currentUserRoleTitle]);

  const loadSignatureSignerOptions = useCallback(
    async (
      rowId: string,
      signerModule: PrintSignatureSignerModule,
      search = '',
      exactId?: string | null
    ) => {
      const normalizedModule = String(signerModule || '').trim() as PrintSignatureSignerModule;
      if (!normalizedModule) return;
      const options = await fetchRelationOptionsForField(
        supabase,
        { relationConfig: { targetModule: normalizedModule } },
        { search, exactId: exactId || null, limit: search ? 50 : 30 }
      ).catch(() => []);

      if (Array.isArray(options) && options.length > 0) {
        setSignatureOptionsByRow((prev) => ({ ...prev, [rowId]: options }));
        setSignatureLabelByKey((prev) => {
          const next = { ...prev };
          options.forEach((option: any) => {
            const optionKey = `${normalizedModule}:${String(option?.value || '').trim()}`;
            const label = String(option?.label || option?.name || '').trim();
            if (optionKey && label) next[optionKey] = label;
          });
          return next;
        });
      }
    },
    []
  );

  useEffect(() => {
    printSignatureStates.forEach((row) => {
      const signerModule = row.signerModule as PrintSignatureSignerModule | null;
      const signerId = String(row.signerId || '').trim();
      if (!signerModule || !signerId) return;
      const signerKey = `${signerModule}:${signerId}`;
      if (signatureLabelByKey[signerKey]) return;
      void loadSignatureSignerOptions(row.id, signerModule, '', signerId);
    });
  }, [loadSignatureSignerOptions, printSignatureStates, signatureLabelByKey]);

  const updatePrintSignatureConfig = useCallback((rowId: string, updater: (row: PrintSignatureConfig) => PrintSignatureConfig) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      return {
        ...prev,
        [selectedTemplateId]: current.map((row) => (row.id === rowId ? updater(row) : row)),
      };
    });
  }, [selectedTemplateId]);

  const handleAddPrintSignatureRow = useCallback((kind: PrintSignatureKind) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      const nextRow: PrintSignatureConfig =
        kind === 'manual'
          ? { id: createPrintSignatureRowId(), kind: 'manual', enabled: true, automatic: false, nameOverride: '', subtitleOverride: '' }
          : kind === 'selected_signer'
            ? {
                id: createPrintSignatureRowId(),
                kind: 'selected_signer',
                enabled: true,
                automatic: true,
                signerModule: 'customers',
                signerId: null,
                sourceFieldLabel: 'مشتری',
              }
            : { id: createPrintSignatureRowId(), kind, enabled: true, automatic: true };
      return {
        ...prev,
        [selectedTemplateId]: [...current, nextRow],
      };
    });
  }, [selectedTemplateId]);

  const handleRemovePrintSignatureRow = useCallback((rowId: string) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      return {
        ...prev,
        [selectedTemplateId]: current.filter((row) => row.id !== rowId),
      };
    });
  }, [selectedTemplateId]);

  const handleMovePrintSignatureRow = useCallback((rowId: string, direction: 'up' | 'down') => {
    setPrintSignatureConfigs((prev) => {
      const current = [...sanitizePrintSignatureConfigs(prev[selectedTemplateId] || [])];
      const index = current.findIndex((row) => row.id === rowId);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
      return {
        ...prev,
        [selectedTemplateId]: current,
      };
    });
  }, [selectedTemplateId]);

  const handleTogglePrintSignatureAutomatic = useCallback((rowId: string, automatic: boolean) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, automatic }));
  }, [updatePrintSignatureConfig]);

  const handleTogglePrintSignatureEnabled = useCallback((rowId: string, enabled: boolean) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, enabled }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureName = useCallback((rowId: string, value: string) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, nameOverride: value }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureSubtitle = useCallback((rowId: string, value: string) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, subtitleOverride: value }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureSignerModule = useCallback((rowId: string, signerModule: PrintSignatureSignerModule) => {
    updatePrintSignatureConfig(rowId, (row) => ({
      ...row,
      kind: 'selected_signer',
      automatic: true,
      signerModule,
      signerId: null,
      sourceFieldLabel: getSignerModuleLabel(signerModule),
    }));
    void loadSignatureSignerOptions(rowId, signerModule);
  }, [loadSignatureSignerOptions, updatePrintSignatureConfig]);

  const handleChangePrintSignatureSignerId = useCallback((rowId: string, signerId: string | null) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, signerId }));
  }, [updatePrintSignatureConfig]);

  const selectedFields = useMemo(() => {
    const hasSelectionState = Object.prototype.hasOwnProperty.call(selectedPrintFields, selectedTemplateId);
    const fieldMap = new Map(
      printableFieldsForTemplate.map((field) => [String(field?.key || '').trim(), field])
    );
    return resolveEffectivePrintFieldKeys({
      fields: printableFieldsForTemplate,
      selectedKeys: selectedPrintFields[selectedTemplateId] || [],
      hasExplicitSelection: hasSelectionState,
    })
      .map((key) => fieldMap.get(String(key || '').trim()))
      .filter(Boolean) as ListFieldDefinition[];
  }, [printableFieldsForTemplate, selectedPrintFields, selectedTemplateId]);

  const selectedContextFields = useMemo(
    () => selectedFields.filter((field) => field.printSection === 'context'),
    [selectedFields],
  );

  const selectedColumns = useMemo(() => {
    const resolved = selectedFields.filter((field) => field.printSection !== 'context');
    if (!isCatalogTemplate) return resolved;

    const imageFields = resolved.filter((field) => String(field?.type || '').toLowerCase() === 'image').slice(0, 1);
    const contentFields = resolved.filter((field) => String(field?.type || '').toLowerCase() !== 'image').slice(0, 5);
    return [...imageFields, ...contentFields];
  }, [isCatalogTemplate, selectedFields]);

  const rowsPerPage = useMemo(() => {
    if (String(selectedStoredTemplate?.id || '').includes('_catalog_a4_portrait')) {
      return 6;
    }
    const orientation = selectedStoredTemplate?.orientation || 'portrait';
    const columnCount = Math.max(1, selectedColumns.length);
    let base = orientation === 'landscape' ? 22 : 16;
    if (columnCount >= 8) base -= 3;
    if (columnCount >= 11) base -= 3;
    return Math.max(6, base);
  }, [selectedColumns.length, selectedStoredTemplate?.orientation]);

  const pagedRows = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) return [[]];
    const chunks: any[][] = [];
    for (let index = 0; index < rows.length; index += rowsPerPage) {
      chunks.push(rows.slice(index, index + rowsPerPage));
    }
    return chunks;
  }, [rows, rowsPerPage]);

  const renderedSummaryTable = useMemo(
    () => buildListSummaryTableHtml(summary, printRelationOptions, currencyLabel, imageDisplayMode),
    [currencyLabel, imageDisplayMode, printRelationOptions, summary]
  );

  const renderedContextTable = useMemo(
    () => buildListSummaryTableHtml(
      selectedContextFields.length > 0
        ? { title: contextTitle, fields: selectedContextFields, values: contextValues }
        : null,
      printRelationOptions,
      currencyLabel,
      imageDisplayMode,
    ),
    [contextTitle, contextValues, currencyLabel, imageDisplayMode, printRelationOptions, selectedContextFields],
  );

  const resolveValue = useCallback((path: string, pageIndex: number, pageCount: number, pageRows: any[], rowOffset: number) => {
    if (path === 'system.list_title') return moduleConfig?.titles?.fa || moduleId;
    if (path === 'system.selected_count') return toPersianNumber(rows.length);
    if (path === 'system.print_date') return toPersianNumber(safeJalaliFormat(new Date().toISOString(), 'YYYY/MM/DD HH:mm'));
    if (path === 'system.page_index') return toPersianNumber(pageIndex + 1);
    if (path === 'system.page_count') return toPersianNumber(pageCount);
    if (path === 'system.list_table') {
      return buildListTableHtml(selectedColumns, pageRows, printRelationOptions, currencyLabel, rowOffset, imageDisplayMode);
    }
    if (path === 'system.list_catalog_a4') {
      return buildListCatalogHtml(selectedColumns, pageRows, printRelationOptions, currencyLabel, imageDisplayMode);
    }
    if (path === 'system.list_catalog_fullpage') {
      return buildListCatalogFullPageHtml(
        selectedColumns, pageRows, printRelationOptions, currencyLabel, companyInfo,
        getModuleTitle(moduleId) || 'فهرست',
        imageDisplayMode,
      );
    }
    if (path === 'system.list_summary_table') {
      return renderedSummaryTable;
    }
    if (path === 'system.list_context_table') {
      return renderedContextTable;
    }
    if (path.startsWith('system.summary.')) {
      const summaryKey = path.replace(/^system\.summary\./, '');
      return String(summary?.values?.[summaryKey] ?? '');
    }
    if (path.startsWith('summary.')) {
      const summaryKey = path.replace(/^summary\./, '');
      return String(summary?.values?.[summaryKey] ?? '');
    }
    if (path.startsWith('system.extra.')) {
      const extraKey = path.replace(/^system\.extra\./, '');
      if (extraKey === 'summary_html' && !Object.prototype.hasOwnProperty.call(extraSystemValues, extraKey)) {
        return renderedSummaryTable;
      }
      return String(extraSystemValues?.[extraKey] ?? '');
    }
    if (path.startsWith('company.')) {
      const key = path.replace(/^company\./, '');
      if (key === 'company_name_en') {
        return String(companyInfo?.company_name_en || companyInfo?.trade_name || companyInfo?.company_full_name || '');
      }
      return String(companyInfo?.[key] || '');
    }
    return '';
  }, [companyInfo, currencyLabel, extraSystemValues, imageDisplayMode, moduleConfig?.titles?.fa, moduleId, printRelationOptions, renderedContextTable, renderedSummaryTable, rows.length, selectedColumns, summary?.values]);

  const renderTemplateSection = useCallback((html: string | undefined, pageIndex: number, pageCount: number, pageRows: any[], rowOffset: number) => {
    const rawHtml = stripLegacyPrintSignatureTokens(String(html || ''));
    const htmlWithContext = renderedContextTable && !rawHtml.includes('system.list_context_table')
      ? rawHtml.replace(
          /({{\s*system\.list_(?:table|catalog_a4|catalog_fullpage)\s*}})/,
          '{{system.list_context_table}}$1',
        )
      : rawHtml;
    const filled = htmlWithContext.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, key: string) => {
      return resolveValue(key, pageIndex, pageCount, pageRows, rowOffset);
    });
    return normalizeRenderedImages(DOMPurify.sanitize(filled, {
      ADD_TAGS: ['colgroup', 'col'],
      ADD_ATTR: ['style', 'width', 'height', 'colspan', 'rowspan', 'src', 'alt'],
    }));
  }, [renderedContextTable, resolveValue]);

  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields((prev) => {
      const current = Object.prototype.hasOwnProperty.call(prev, templateId)
        ? prev[templateId] || []
        : resolveEffectivePrintFieldKeys({
            fields: printableFieldsForTemplate,
            selectedKeys: [],
            hasExplicitSelection: false,
          });
      if (current.includes(fieldName)) {
        return { ...prev, [templateId]: current.filter((item) => item !== fieldName) };
      }
      if (String(templateId).includes('_catalog_a4_portrait')) {
        if (current.length >= 6) return prev;
        const targetField = printableFieldsForTemplate.find((field) => field.key === fieldName);
        const isImageField = String(targetField?.type || '').toLowerCase() === 'image';
        if (isImageField) {
          const hasImageAlready = current.some((key) => {
            const field = printableFieldsForTemplate.find((item) => item.key === key);
            return String(field?.type || '').toLowerCase() === 'image';
          });
          if (hasImageAlready) return prev;
        }
      }
      return { ...prev, [templateId]: [...current, fieldName] };
    });
  }, [printableFieldsForTemplate]);

  const handleTogglePrintFieldGroup = useCallback((templateId: string, groupName: string) => {
    setSelectedPrintFields((prev) => {
      const current = Object.prototype.hasOwnProperty.call(prev, templateId)
        ? prev[templateId] || []
        : resolveEffectivePrintFieldKeys({
            fields: printableFieldsForTemplate,
            selectedKeys: [],
            hasExplicitSelection: false,
          });
      const currentSet = new Set(current);
      const groupFields = (printableFieldsForTemplate || []).filter(
        (field) => String(field?.group || '').trim() === String(groupName || '').trim()
      );
      if (!groupFields.length) return prev;

      const groupKeys = groupFields
        .map((field) => String(field?.key || '').trim())
        .filter(Boolean);
      const allSelected = groupKeys.every((key) => currentSet.has(key));

      if (allSelected) {
        return {
          ...prev,
          [templateId]: current.filter((key) => !groupKeys.includes(String(key || '').trim())),
        };
      }

      let next = [...current];
      for (const field of groupFields) {
        const fieldKey = String(field?.key || '').trim();
        if (!fieldKey || next.includes(fieldKey)) continue;
        if (String(templateId).includes('_catalog_a4_portrait')) {
          if (next.length >= 6) break;
          const isImageField = String(field?.type || '').toLowerCase() === 'image';
          if (isImageField) {
            const hasImageAlready = next.some((key) => {
              const matchedField = printableFieldsForTemplate.find((item) => item.key === key);
              return String(matchedField?.type || '').toLowerCase() === 'image';
            });
            if (hasImageAlready) continue;
          }
        }
        next.push(fieldKey);
      }
      return { ...prev, [templateId]: next };
    });
  }, [printableFieldsForTemplate]);

  const handleMovePrintField = useCallback((templateId: string, fieldName: string, direction: 'up' | 'down') => {
    setSelectedPrintFields((prev) => {
      const current = [
        ...(Object.prototype.hasOwnProperty.call(prev, templateId)
          ? prev[templateId] || []
          : resolveEffectivePrintFieldKeys({
              fields: printableFieldsForTemplate,
              selectedKeys: [],
              hasExplicitSelection: false,
            })),
      ];
      const index = current.indexOf(fieldName);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
      return { ...prev, [templateId]: current };
    });
  }, [printableFieldsForTemplate]);

  const handleChangeImageDisplayMode = useCallback((templateId: string, mode: PrintImageDisplayMode) => {
    setImageDisplayModes((prev) => ({
      ...prev,
      [templateId]: sanitizePrintImageDisplayMode(mode),
    }));
  }, []);

  const handleSavePrintFields = useCallback(async () => {
    setSavingPrintFields(true);
    try {
      const preferenceIdentity = await resolvePrintPreferenceIdentity({
        currentOrgId,
        currentUserId,
        loadSession: () => fetchSessionBootstrap(supabase),
      });
      if (!preferenceIdentity) return false;
      if (preferenceIdentity.orgId !== currentOrgId) setCurrentOrgId(preferenceIdentity.orgId);
      if (preferenceIdentity.userId && preferenceIdentity.userId !== currentUserId) {
        setCurrentUserId(preferenceIdentity.userId);
      }
      const allowedKeySet = new Set(
        printableFieldsForTemplate
          .map((field) => String(field?.key || '').trim())
          .filter(Boolean)
      );
      const selectedKeys = sanitizeSelectedPrintFieldKeys(
        resolveEffectivePrintFieldKeys({
          fields: printableFieldsForTemplate,
          selectedKeys: selectedPrintFields[selectedTemplateId] || [],
          hasExplicitSelection: Object.prototype.hasOwnProperty.call(selectedPrintFields, selectedTemplateId),
        }),
        allowedKeySet
      );
      savePrintFieldPreference({
        orgId: preferenceIdentity.orgId,
        userId: preferenceIdentity.userId,
        moduleId,
        templateId: selectedStoredTemplate?.id || selectedTemplateId,
        scope: 'list',
        selectedFieldKeys: selectedKeys,
      });
      return savePrintRenderPreference({
        orgId: preferenceIdentity.orgId,
        userId: preferenceIdentity.userId,
        moduleId,
        templateId: selectedStoredTemplate?.id || selectedTemplateId,
        scope: 'list',
        imageDisplayMode,
        signatureConfigs: selectedPrintSignatureConfigs,
      });
    } catch (error) {
      console.error('Save list print fields failed', error);
      return false;
    } finally {
      setSavingPrintFields(false);
    }
  }, [currentOrgId, currentUserId, imageDisplayMode, moduleId, printableFieldsForTemplate, selectedPrintFields, selectedPrintSignatureConfigs, selectedStoredTemplate?.id, selectedTemplateId]);

  const getPrintOutputName = useCallback(
    () =>
      buildPrintOutputName({
        fallbackLabel: `لیست ${moduleConfig?.titles?.fa || moduleId}`,
      }),
    [moduleConfig, moduleId]
  );

  const preparePrint = useCallback(() => {
    const shouldUseNativePdfFlow = Boolean(buildNativeListPrintFlowRef.current());
    if (!shouldUseGeneratedPdfPrint() && !shouldUseNativePdfFlow) return;
    const printTitle = getPrintOutputName();
    reservedPrintWindowRef.current = prepareGeneratedPdfWindow(printTitle, { force: shouldUseNativePdfFlow });
  }, [getPrintOutputName]);

  const handlePrint = useCallback(async () => {
    if (!selectedTemplateId) return;
    const latestAssigneeDirectory = await fetchAssigneeDirectory(supabase).catch(() => null);
    if (latestAssigneeDirectory) {
      setAssigneeDirectory(latestAssigneeDirectory);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
    }
    const printTitle = getPrintOutputName();
    const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${
      selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'
    }`;
    const nativePrintFlowHtml = buildNativeListPrintFlowRef.current();
    const staticPrintHtml = nativePrintFlowHtml || renderToStaticMarkup(React.createElement(React.Fragment, null, renderPrintCardRef.current()));

    if (nativePrintFlowHtml || shouldUseGeneratedPdfPrint()) {
      const targetWindow = reservedPrintWindowRef.current;
      reservedPrintWindowRef.current = null;

      void printAsPdf({
        pageSize,
        sourceHtml: staticPrintHtml,
        title: printTitle,
        filename: printTitle,
        targetWindow,
        openInPdfViewer: Boolean(nativePrintFlowHtml),
      }).catch((error) => {
        console.error('Generated PDF print failed', error);
      });
      return;
    }

    void printInIframe({
      pageSize,
      sourceHtml: staticPrintHtml,
      title: printTitle,
    }).catch((error) => {
      console.error('Print dialog failed to open', error);
    });
  }, [getPrintOutputName, selectedStoredTemplate, selectedTemplateId]);

  const generateCurrentPdfBlob = useCallback(async (options?: {
    onProgress?: (progress: PdfGenerationProgress) => void;
  }) => {
    if (!selectedTemplateId) {
      throw new Error('print_template_missing');
    }

    const latestAssigneeDirectory = await fetchAssigneeDirectory(supabase).catch(() => null);
    if (latestAssigneeDirectory) {
      setAssigneeDirectory(latestAssigneeDirectory);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
    }

    const printTitle = getPrintOutputName();
    const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${
      selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'
    }`;
    const nativePrintFlowHtml = buildNativeListPrintFlowRef.current();
    const sourceHtml = nativePrintFlowHtml || renderToStaticMarkup(
      React.createElement(React.Fragment, null, renderPrintCardRef.current())
    );

    return {
      blob: await generatePdfBlob({
        pageSize,
        sourceHtml,
        title: printTitle,
        filename: printTitle,
        onProgress: options?.onProgress,
      }),
      filename: `${printTitle}.pdf`,
      title: printTitle,
    };
  }, [getPrintOutputName, selectedStoredTemplate, selectedTemplateId]);

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => setPrintMode(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [printMode]);

  const renderPrintCard = useCallback(() => {
    if (!selectedStoredTemplate) return null;

    const metrics = getPaperMetrics(selectedStoredTemplate.paperSize, selectedStoredTemplate.orientation || 'portrait');
    const pageMargins = {
      top: Number(selectedStoredTemplate.pageMarginTop ?? PAGE_MARGINS.top),
      right: Number(selectedStoredTemplate.pageMarginRight ?? PAGE_MARGINS.right),
      bottom: Number(selectedStoredTemplate.pageMarginBottom ?? PAGE_MARGINS.bottom),
      left: Number(selectedStoredTemplate.pageMarginLeft ?? PAGE_MARGINS.left),
    };
    const backgroundImageUrl = String(selectedStoredTemplate.backgroundImageUrl || '').trim();
    const isOrgLetterheadTemplate =
      selectedStoredTemplate.renderMode === 'org_letterhead' && Boolean(selectedOrgLetterhead?.imageUrl);

    if (isOrgLetterheadTemplate && selectedOrgLetterhead) {
      const bodyItem = getPrintLetterheadEffectiveBodyItem(selectedOrgLetterhead, Boolean(printSignatureBandHtml));
      const signaturesItem = getPrintLetterheadSignaturesItem(selectedOrgLetterhead);
      if (!bodyItem) return null;
      const overlayHtml = buildPrintLetterheadOverlayHtml(selectedOrgLetterhead, {
        title: moduleConfig?.titles?.fa || getModuleTitle(moduleId) || selectedStoredTemplate.title,
        date: `تاریخ چاپ: ${toPersianNumber(safeJalaliFormat(new Date().toISOString(), 'YYYY/MM/DD HH:mm'))}`,
        number: '',
        attachment: '',
        qrValue: '',
      });

      return React.createElement(
        'div',
        {
          className: 'list-print-shell',
          key: `list-letterhead-preview-${previewRevision}`,
          style: {
            width: `${metrics.widthMm}mm`,
            minHeight: `${metrics.heightMm}mm`,
            background: '#fff',
            color: '#111827',
          },
        },
        ...pagedRows.map((pageRows, pageIndex) => {
          const rowOffset = pageIndex * rowsPerPage;
          const contentHtml = renderTemplateSection(selectedStoredTemplate.contentHtml, pageIndex, pagedRows.length, pageRows, rowOffset);
          return React.createElement(
            'div',
            {
              key: `list-print-letterhead-page-${pageIndex + 1}`,
              className: 'list-print-page',
              style: {
                position: 'relative',
                width: `${metrics.widthMm}mm`,
                minHeight: `${metrics.heightMm}mm`,
                height: `${metrics.heightMm}mm`,
                background: '#fff',
                boxSizing: 'border-box',
                overflow: 'hidden',
                pageBreakAfter: pageIndex < pagedRows.length - 1 ? 'always' : 'auto',
                breakAfter: pageIndex < pagedRows.length - 1 ? 'page' : 'auto',
              },
            },
            React.createElement('img', {
              src: selectedOrgLetterhead.imageUrl || '',
              alt: selectedOrgLetterhead.title,
              style: {
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                zIndex: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            }),
            overlayHtml
              ? React.createElement('div', {
                  style: { position: 'absolute', inset: 0, zIndex: 2 },
                  dangerouslySetInnerHTML: { __html: overlayHtml },
                })
              : null,
            React.createElement('div', {
              style: {
                ...toPercentStyle(bodyItem),
                zIndex: 4,
                overflow: 'hidden',
                boxSizing: 'border-box',
                direction: 'rtl',
              },
              dangerouslySetInnerHTML: { __html: contentHtml },
            }),
            signaturesItem && printSignatureBandHtml
              ? React.createElement('div', {
                  style: {
                    ...toPercentStyle(signaturesItem),
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  },
                  dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
                })
              : null,
            React.createElement('div', {
              style: { position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' },
              dangerouslySetInnerHTML: { __html: buildPrintLetterheadPageCounterHtml(pageIndex, pagedRows.length) },
            }),
          );
        }),
      );
    }

    return React.createElement(
      'div',
      {
        className: 'list-print-shell',
        key: `list-preview-${previewRevision}`,
        style: {
          width: `${metrics.widthMm}mm`,
          minHeight: `${metrics.heightMm}mm`,
          background: '#fff',
          color: '#111827',
        },
      },
      ...pagedRows.map((pageRows, pageIndex) => {
        const rowOffset = pageIndex * rowsPerPage;
        const headerHtml = renderTemplateSection(selectedStoredTemplate.headerHtml, pageIndex, pagedRows.length, pageRows, rowOffset);
        const contentHtml = renderTemplateSection(selectedStoredTemplate.contentHtml, pageIndex, pagedRows.length, pageRows, rowOffset);
        const footerHtml = renderTemplateSection(selectedStoredTemplate.footerHtml, pageIndex, pagedRows.length, pageRows, rowOffset);
        const showFooter =
          selectedStoredTemplate.showFooter !== false &&
          hasRenderablePrintFooterHtml(footerHtml);

        return React.createElement(
          'div',
          {
            key: `list-print-page-${pageIndex + 1}`,
            className: 'list-print-page',
            style: {
              width: `${metrics.widthMm}mm`,
              minHeight: `${metrics.heightMm}mm`,
              boxSizing: 'border-box',
              padding: `${pageMargins.top}mm ${pageMargins.right}mm ${pageMargins.bottom}mm ${pageMargins.left}mm`,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: '#fff',
              backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: backgroundImageUrl ? 'contain' : undefined,
              pageBreakAfter: pageIndex < pagedRows.length - 1 ? 'always' : 'auto',
              breakAfter: pageIndex < pagedRows.length - 1 ? 'page' : 'auto',
            },
          },
          selectedStoredTemplate.showHeader === false
            ? null
            : React.createElement('div', {
                dangerouslySetInnerHTML: { __html: headerHtml },
              }),
          React.createElement('div', {
            style: { flex: '1 1 auto' },
            dangerouslySetInnerHTML: { __html: contentHtml },
          }),
          printSignatureBandHtml
            ? React.createElement('div', {
                dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
              })
            : null,
          !showFooter
            ? null
            : React.createElement('div', {
                dangerouslySetInnerHTML: { __html: footerHtml },
              }),
        );
      }),
    );
  }, [companyInfo?.print_letterheads, moduleConfig?.titles?.fa, moduleId, pagedRows, previewRevision, printSignatureBandHtml, renderTemplateSection, rowsPerPage, selectedOrgLetterhead, selectedStoredTemplate]);
  renderPrintCardRef.current = renderPrintCard;

  const buildNativeListPrintFlow = useCallback(() => {
    if (!selectedStoredTemplate) return null;
    const isOrgLetterheadTemplate =
      selectedStoredTemplate.renderMode === 'org_letterhead' && Boolean(selectedOrgLetterhead?.imageUrl);
    if (isOrgLetterheadTemplate && selectedOrgLetterhead) {
      const bodyItem = getPrintLetterheadEffectiveBodyItem(selectedOrgLetterhead, Boolean(printSignatureBandHtml));
      const signaturesItem = getPrintLetterheadSignaturesItem(selectedOrgLetterhead);
      if (!bodyItem) return null;

      const metrics = getPaperMetrics(selectedStoredTemplate.paperSize, selectedStoredTemplate.orientation || 'portrait');
      const allRows = Array.isArray(rows) ? rows : [];
      const overlayHtml = buildPrintLetterheadOverlayHtml(selectedOrgLetterhead, {
        title: moduleConfig?.titles?.fa || getModuleTitle(moduleId) || selectedStoredTemplate.title,
        date: `تاریخ چاپ: ${toPersianNumber(safeJalaliFormat(new Date().toISOString(), 'YYYY/MM/DD HH:mm'))}`,
        number: '',
        attachment: '',
        qrValue: '',
      });
      const signatureOverlay = signaturesItem && printSignatureBandHtml
        ? `<div style="position:absolute;left:${signaturesItem.x}%;top:${signaturesItem.y}%;width:${signaturesItem.width}%;height:${signaturesItem.height}%;z-index:${signaturesItem.zIndex};display:flex;align-items:flex-end;justify-content:center;overflow:hidden;">${printSignatureBandHtml}</div>`
        : '';

      return buildNativeCustomPrintFlowHtml({
        widthMm: metrics.widthMm,
        heightMm: metrics.heightMm,
        pageMargins: {
          top: (metrics.heightMm * bodyItem.y) / 100,
          right: (metrics.widthMm * Math.max(0, 100 - bodyItem.x - bodyItem.width)) / 100,
          bottom: (metrics.heightMm * Math.max(0, 100 - bodyItem.y - bodyItem.height)) / 100,
          left: (metrics.widthMm * bodyItem.x) / 100,
        },
        sectionPadding: '0',
        contentHtml: renderTemplateSection(selectedStoredTemplate.contentHtml, 0, 1, allRows, 0),
        backgroundImageUrl: selectedOrgLetterhead.imageUrl,
        fixedOverlayHtml: `${overlayHtml}${signatureOverlay}`,
      });
    }
    const metrics = getPaperMetrics(selectedStoredTemplate.paperSize, selectedStoredTemplate.orientation || 'portrait');
    const pageMargins = {
      top: Number(selectedStoredTemplate.pageMarginTop ?? PAGE_MARGINS.top),
      right: Number(selectedStoredTemplate.pageMarginRight ?? PAGE_MARGINS.right),
      bottom: Number(selectedStoredTemplate.pageMarginBottom ?? PAGE_MARGINS.bottom),
      left: Number(selectedStoredTemplate.pageMarginLeft ?? PAGE_MARGINS.left),
    };
    const allRows = Array.isArray(rows) ? rows : [];
    const headerHtml = renderTemplateSection(selectedStoredTemplate.headerHtml, 0, 1, allRows, 0);
    const contentHtml = renderTemplateSection(selectedStoredTemplate.contentHtml, 0, 1, allRows, 0);
    const footerHtml = renderTemplateSection(selectedStoredTemplate.footerHtml, 0, 1, allRows, 0);
    const showHeader = selectedStoredTemplate.showHeader !== false;
    const showFooter = selectedStoredTemplate.showFooter !== false && (
      hasRenderablePrintFooterHtml(footerHtml) || Boolean(printSignatureBandHtml)
    );
    const signatureHeightPx = printSignatureBandHtml
      ? getPrintSignatureSectionHeightPx(printSignatureStates)
      : 0;
    const footerWithPageCounter = showFooter
      ? `${printSignatureBandHtml || ''}${footerHtml}<div class="print-template-page-counter" style="margin-top:4px;font-size:10px;color:#64748b;direction:rtl;text-align:left;">صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></div>`
      : '';

    return buildNativeCustomPrintFlowHtml({
      widthMm: metrics.widthMm,
      heightMm: metrics.heightMm,
      pageMargins,
      sectionPadding: '0',
      contentHtml,
      headerHtml,
      footerHtml: footerWithPageCounter,
      headerHeightPx: showHeader ? Number(selectedStoredTemplate.headerHeight || 84) : 0,
      footerHeightPx: showFooter ? Number(selectedStoredTemplate.footerHeight || 62) + signatureHeightPx + 18 : 0,
      showHeader,
      showFooter,
      backgroundImageUrl: selectedStoredTemplate.backgroundImageUrl,
    });
  }, [moduleConfig?.titles?.fa, moduleId, printSignatureBandHtml, printSignatureStates, renderTemplateSection, rows, selectedOrgLetterhead, selectedStoredTemplate]);
  buildNativeListPrintFlowRef.current = buildNativeListPrintFlow;

  const refreshTemplates = useCallback(async () => {
    const loaded = await loadTemplates(true);
    if (!loaded) return false;
    setPreviewRevision((value) => value + 1);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    }));
    return true;
  }, [loadTemplates]);

  const previewMeta = useMemo(
    () => ({
      orientation: selectedStoredTemplate?.orientation || 'portrait',
      paperSize: selectedStoredTemplate?.paperSize || 'A4',
    }),
    [selectedStoredTemplate?.orientation, selectedStoredTemplate?.paperSize]
  );
  const printSignatureQuickAddOptions = useMemo(
    () => getPrintSignatureQuickAddOptions({ canUseCeoSignature, companyInfo }),
    [canUseCeoSignature, companyInfo?.manager_title]
  );
  const printPreviewSourceVersion = useMemo(
    () => createPrintPreviewFingerprint({
      template: selectedStoredTemplate || null,
      rows,
      selectedColumns,
      summary,
      context: { title: contextTitle, values: contextValues },
      extraSystemValues,
      relations: printRelationOptions,
      company: companyInfo || null,
      letterhead: selectedOrgLetterhead || null,
      revision: previewRevision,
    }),
    [
      companyInfo,
      contextTitle,
      contextValues,
      extraSystemValues,
      previewRevision,
      printRelationOptions,
      rows,
      selectedColumns,
      selectedOrgLetterhead,
      selectedStoredTemplate,
      summary,
    ],
  );

  return {
    isPrintModalOpen,
    selectedTemplateId,
    setSelectedTemplateId,
    setIsPrintModalOpen,
    printMode,
    selectedPrintFields,
    imageDisplayMode,
    printTemplates,
    printableFieldsForTemplate,
    handleTogglePrintField,
    handleTogglePrintFieldGroup,
    handleMovePrintField,
    handleChangeImageDisplayMode,
    handleSavePrintFields,
    printSignatureStates,
    printSignatureQuickAddOptions,
    signatureOptionsByRow,
    handleAddPrintSignatureRow,
    handleRemovePrintSignatureRow,
    handleMovePrintSignatureRow,
    handleTogglePrintSignatureEnabled,
    handleTogglePrintSignatureAutomatic,
    handleChangePrintSignatureName,
    handleChangePrintSignatureSubtitle,
    handleChangePrintSignatureSignerModule,
    handleChangePrintSignatureSignerId,
    loadSignatureSignerOptions,
    savingPrintFields,
    handlePrint,
    generateCurrentPdfBlob,
    preparePrint,
    refreshTemplates,
    renderPrintCard,
    previewMeta,
    printPreviewSourceVersion,
    allowFieldSelectionTab: true,
    showImageDisplayModeControl,
  };
};
