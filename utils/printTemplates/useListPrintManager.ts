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
import { prepareGeneratedPdfWindow, printAsPdf, shouldUseGeneratedPdfPrint } from './printAsPdf';
import { normalizeRenderedImages } from './normalizeRenderedImages';
import { printInIframe } from './printInIframe';
import { sanitizeSelectedPrintFieldKeys } from './fieldAccess';
import { loadPrintFieldPreference, savePrintFieldPreference } from './fieldPreferences';
import { getCachedAuthUser } from '../sessionCache';
import { loadScopedCompanySettings } from '../companySettings';

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
}

export const useListPrintManager = ({
  moduleId,
  moduleConfig,
  rows,
  printableFields,
  summary = null,
  relationOptions = {},
  extraSystemValues = {},
}: UseListPrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userPreferencesReady, setUserPreferencesReady] = useState(false);
  const [storedTemplates, setStoredTemplates] = useState<StoredPrintTemplate[]>([]);
  const [templatesByModuleStore, setTemplatesByModuleStore] = useState<Record<string, StoredPrintTemplate[]>>({});
  const [, setTemplatesStoreMeta] = useState<{ rowId: string | null; provider: string }>({
    rowId: null,
    provider: 'tiptap',
  });
  const [savingPrintFields, setSavingPrintFields] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const templatesLoadedRef = useRef(false);
  const companyLoadedRef = useRef(false);
  const renderPrintCardRef = useRef<() => React.ReactNode>(() => null);
  const reservedPrintWindowRef = useRef<Window | null>(null);
  const currencyLabel = readCurrencyConfig().label || '';

  useEffect(() => {
    let mounted = true;
    getCachedAuthUser(supabase)
      .then((user) => {
        if (!mounted) return;
        setCurrentUserId(String(user?.id || '').trim() || null);
        setUserPreferencesReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUserId(null);
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
        const { data } = await loadScopedCompanySettings(supabase);
        if (mounted) {
          setCompanyInfo(data || null);
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
    if (scopedTemplates.length > 0) return scopedTemplates;
    return buildDefaultTemplatesForModule(moduleId, 'list').filter((tpl) => tpl.isActive !== false);
  }, [moduleId, storedTemplates, templatesByModuleStore]);

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

  const printableFieldsForTemplate = useMemo(() => printableFields || [], [printableFields]);
  const isCatalogTemplate = useMemo(
    () => String(selectedStoredTemplate?.id || '').includes('_catalog_a4_portrait'),
    [selectedStoredTemplate?.id]
  );

  useEffect(() => {
    if (!selectedTemplateId || !userPreferencesReady) return;
    const allowedKeySet = new Set(
      printableFieldsForTemplate
        .map((field) => String(field?.key || '').trim())
        .filter(Boolean)
    );
    const preferenceKeys = loadPrintFieldPreference({
      userId: currentUserId,
      moduleId,
      templateId: selectedStoredTemplate?.id || selectedTemplateId,
      scope: 'list',
    });
    const rawDefaultKeys =
      (Array.isArray(preferenceKeys) && preferenceKeys.length > 0
        ? preferenceKeys
        : Array.isArray(selectedStoredTemplate?.selectedFieldKeys) && selectedStoredTemplate.selectedFieldKeys.length > 0
          ? selectedStoredTemplate.selectedFieldKeys
        : printableFieldsForTemplate
            .filter((field) => field?.defaultSelected !== false)
            .map((field) => field.key)) || [];

    const defaultKeys = isCatalogTemplate
      ? (() => {
          const sanitizedKeys = sanitizeSelectedPrintFieldKeys(rawDefaultKeys, allowedKeySet);
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
      : sanitizeSelectedPrintFieldKeys(rawDefaultKeys, allowedKeySet);

    if (!defaultKeys.length) return;

    setSelectedPrintFields((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      return {
        ...prev,
        [selectedTemplateId]: defaultKeys,
      };
    });
  }, [
    currentUserId,
    isCatalogTemplate,
    moduleId,
    printableFieldsForTemplate,
    selectedStoredTemplate?.id,
    selectedStoredTemplate?.selectedFieldKeys,
    selectedTemplateId,
    userPreferencesReady,
  ]);

  const selectedColumns = useMemo(() => {
    const selected = selectedPrintFields[selectedTemplateId] || [];
    if (selected.length === 0) return printableFieldsForTemplate;
    const fieldMap = new Map(
      printableFieldsForTemplate.map((field) => [String(field?.key || '').trim(), field])
    );
    const filtered = selected
      .map((key) => fieldMap.get(String(key || '').trim()))
      .filter(Boolean) as ListFieldDefinition[];
    const resolved = filtered.length > 0 ? filtered : printableFieldsForTemplate;
    if (!isCatalogTemplate) return resolved;

    const imageFields = resolved.filter((field) => String(field?.type || '').toLowerCase() === 'image').slice(0, 1);
    const contentFields = resolved.filter((field) => String(field?.type || '').toLowerCase() !== 'image').slice(0, 5);
    return [...imageFields, ...contentFields];
  }, [isCatalogTemplate, printableFieldsForTemplate, selectedPrintFields, selectedTemplateId]);

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
    () => buildListSummaryTableHtml(summary, relationOptions, currencyLabel),
    [currencyLabel, relationOptions, summary]
  );

  const resolveValue = useCallback((path: string, pageIndex: number, pageCount: number, pageRows: any[], rowOffset: number) => {
    if (path === 'system.list_title') return moduleConfig?.titles?.fa || moduleId;
    if (path === 'system.selected_count') return toPersianNumber(rows.length);
    if (path === 'system.print_date') return toPersianNumber(safeJalaliFormat(new Date().toISOString(), 'YYYY/MM/DD HH:mm'));
    if (path === 'system.page_index') return toPersianNumber(pageIndex + 1);
    if (path === 'system.page_count') return toPersianNumber(pageCount);
    if (path === 'system.list_table') {
      return buildListTableHtml(selectedColumns, pageRows, relationOptions, currencyLabel, rowOffset);
    }
    if (path === 'system.list_catalog_a4') {
      return buildListCatalogHtml(selectedColumns, pageRows, relationOptions, currencyLabel);
    }
    if (path === 'system.list_catalog_fullpage') {
      return buildListCatalogFullPageHtml(
        selectedColumns, pageRows, relationOptions, currencyLabel, companyInfo,
        getModuleTitle(moduleId) || 'فهرست',
      );
    }
    if (path === 'system.list_summary_table') {
      return renderedSummaryTable;
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
  }, [companyInfo, currencyLabel, extraSystemValues, moduleConfig?.titles?.fa, moduleId, relationOptions, renderedSummaryTable, rows.length, selectedColumns, summary?.values]);

  const renderTemplateSection = useCallback((html: string | undefined, pageIndex: number, pageCount: number, pageRows: any[], rowOffset: number) => {
    const filled = String(html || '').replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, key: string) => {
      return resolveValue(key, pageIndex, pageCount, pageRows, rowOffset);
    });
    return normalizeRenderedImages(DOMPurify.sanitize(filled, {
      ADD_TAGS: ['colgroup', 'col'],
      ADD_ATTR: ['style', 'width', 'height', 'colspan', 'rowspan', 'src', 'alt'],
    }));
  }, [resolveValue]);

  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields((prev) => {
      const current = prev[templateId] || [];
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
      const current = prev[templateId] || [];
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
      const current = [...(prev[templateId] || [])];
      const index = current.indexOf(fieldName);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
      return { ...prev, [templateId]: current };
    });
  }, []);

  const handleSavePrintFields = useCallback(async () => {
    setSavingPrintFields(true);
    try {
      const allowedKeySet = new Set(
        printableFieldsForTemplate
          .map((field) => String(field?.key || '').trim())
          .filter(Boolean)
      );
      const selectedKeys = sanitizeSelectedPrintFieldKeys(
        selectedPrintFields[selectedTemplateId] || [],
        allowedKeySet
      );
      savePrintFieldPreference({
        userId: currentUserId,
        moduleId,
        templateId: selectedStoredTemplate?.id || selectedTemplateId,
        scope: 'list',
        selectedFieldKeys: selectedKeys,
      });
      return true;
    } catch (error) {
      console.error('Save list print fields failed', error);
      return false;
    } finally {
      setSavingPrintFields(false);
    }
  }, [currentUserId, moduleId, printableFieldsForTemplate, selectedPrintFields, selectedStoredTemplate?.id, selectedTemplateId]);

  const getPrintOutputName = useCallback(
    () =>
      buildPrintOutputName({
        fallbackLabel: `لیست ${moduleConfig?.titles?.fa || moduleId}`,
      }),
    [moduleConfig, moduleId]
  );

  const preparePrint = useCallback(() => {
    if (!shouldUseGeneratedPdfPrint()) return;
    const printTitle = getPrintOutputName();
    reservedPrintWindowRef.current = prepareGeneratedPdfWindow(printTitle);
  }, [getPrintOutputName]);

  const handlePrint = useCallback(() => {
    if (!selectedTemplateId) return;
    const printTitle = getPrintOutputName();
    const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${
      selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'
    }`;
    const staticPrintHtml = renderToStaticMarkup(React.createElement(React.Fragment, null, renderPrintCardRef.current()));

    if (shouldUseGeneratedPdfPrint()) {
      const targetWindow = reservedPrintWindowRef.current;
      reservedPrintWindowRef.current = null;

      void printAsPdf({
        pageSize,
        sourceHtml: staticPrintHtml,
        title: printTitle,
        filename: printTitle,
        targetWindow,
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

    return React.createElement(
      'div',
      {
        className: 'list-print-shell',
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
          selectedStoredTemplate.showFooter === false
            ? null
            : React.createElement('div', {
                dangerouslySetInnerHTML: { __html: footerHtml },
              }),
        );
      }),
    );
  }, [pagedRows, renderTemplateSection, rowsPerPage, selectedStoredTemplate]);
  renderPrintCardRef.current = renderPrintCard;

  const refreshTemplates = useCallback(async () => {
    await loadTemplates(true);
  }, [loadTemplates]);

  const previewMeta = useMemo(
    () => ({
      orientation: selectedStoredTemplate?.orientation || 'portrait',
      paperSize: selectedStoredTemplate?.paperSize || 'A4',
    }),
    [selectedStoredTemplate?.orientation, selectedStoredTemplate?.paperSize]
  );

  return {
    isPrintModalOpen,
    selectedTemplateId,
    setSelectedTemplateId,
    setIsPrintModalOpen,
    printMode,
    selectedPrintFields,
    printTemplates,
    printableFieldsForTemplate,
    handleTogglePrintField,
    handleTogglePrintFieldGroup,
    handleMovePrintField,
    handleSavePrintFields,
    savingPrintFields,
    handlePrint,
    preparePrint,
    refreshTemplates,
    renderPrintCard,
    previewMeta,
    allowFieldSelectionTab: true,
  };
};
