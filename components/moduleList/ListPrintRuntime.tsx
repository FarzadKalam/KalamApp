import React, { useCallback, useEffect, useMemo } from "react";
import PrintSection from "../moduleShow/PrintSection";
import type { ModuleDefinition } from "../../types";
import { buildListPrintableFields } from "../../utils/listPrintExport";
import { useListPrintManager } from "../../utils/printTemplates/useListPrintManager";
import { openPrintTemplateEditor } from "../../utils/printTemplates/openTemplateEditor";

type ListPrintRuntimeProps = {
  open: boolean;
  moduleId: string;
  moduleConfig: ModuleDefinition;
  rows: any[];
  canViewField: (fieldKey: string) => boolean;
  visibleColumns: string[];
  dynamicOptions: Record<string, any[]>;
  relationOptions: Record<string, any[]>;
  onClose: () => void;
};

const ListPrintRuntime: React.FC<ListPrintRuntimeProps> = ({
  open,
  moduleId,
  moduleConfig,
  rows,
  canViewField,
  visibleColumns,
  dynamicOptions,
  relationOptions,
  onClose,
}) => {
  const printableFields = useMemo(
    () => buildListPrintableFields(moduleConfig, canViewField, visibleColumns, dynamicOptions),
    [canViewField, dynamicOptions, moduleConfig, visibleColumns],
  );

  const printManager = useListPrintManager({
    moduleId,
    moduleConfig,
    rows,
    printableFields,
    relationOptions,
  });
  const generateFinalPdfPreview = useCallback(
    (onProgress: (progress: { percent: number; label: string }) => void) =>
      printManager.generateCurrentPdfBlob({ onProgress }),
    [printManager.generateCurrentPdfBlob],
  );

  useEffect(() => {
    if (open) {
      printManager.setIsPrintModalOpen(true);
    }
  }, [open, printManager.setIsPrintModalOpen]);

  return (
    <PrintSection
      isPrintModalOpen={printManager.isPrintModalOpen}
      onClose={() => {
        printManager.setIsPrintModalOpen(false);
        onClose();
      }}
      onPreparePrint={printManager.preparePrint}
      onPrint={printManager.handlePrint}
      onGenerateFinalPdfPreview={generateFinalPdfPreview}
      previewContentVersion={printManager.printPreviewSourceVersion}
      printTemplates={printManager.printTemplates}
      selectedTemplateId={printManager.selectedTemplateId}
      onSelectTemplate={printManager.setSelectedTemplateId}
      canEditPrintTemplates={printManager.canEditPrintTemplates}
      onEditTemplate={(templateId) => openPrintTemplateEditor(moduleId, templateId)}
      renderPrintCard={printManager.renderPrintCard}
      printMode={printManager.printMode}
      printableFields={printManager.printableFieldsForTemplate}
      selectedPrintFields={printManager.selectedPrintFields}
      onTogglePrintField={printManager.handleTogglePrintField}
      onTogglePrintFieldGroup={printManager.handleTogglePrintFieldGroup}
      onMovePrintField={printManager.handleMovePrintField}
      imageDisplayMode={printManager.imageDisplayMode}
      onChangeImageDisplayMode={printManager.handleChangeImageDisplayMode}
      onSavePrintFields={printManager.handleSavePrintFields}
      savingPrintFields={printManager.savingPrintFields}
      printSignatureRows={printManager.printSignatureStates}
      printSignatureQuickAddOptions={printManager.printSignatureQuickAddOptions}
      signatureOptionsByRow={printManager.signatureOptionsByRow}
      onAddPrintSignatureRow={printManager.handleAddPrintSignatureRow}
      onRemovePrintSignatureRow={printManager.handleRemovePrintSignatureRow}
      onMovePrintSignatureRow={printManager.handleMovePrintSignatureRow}
      onTogglePrintSignatureEnabled={printManager.handleTogglePrintSignatureEnabled}
      onTogglePrintSignatureAutomatic={printManager.handleTogglePrintSignatureAutomatic}
      onChangePrintSignatureName={printManager.handleChangePrintSignatureName}
      onChangePrintSignatureSubtitle={printManager.handleChangePrintSignatureSubtitle}
      onChangePrintSignatureSignerModule={printManager.handleChangePrintSignatureSignerModule}
      onChangePrintSignatureSignerId={printManager.handleChangePrintSignatureSignerId}
      onSearchPrintSignatureOptions={printManager.loadSignatureSignerOptions}
      onRefreshPreview={() => { void printManager.refreshTemplates(); }}
      allowFieldSelectionTab={printManager.allowFieldSelectionTab}
      showImageDisplayModeControl={printManager.showImageDisplayModeControl}
      previewMeta={printManager.previewMeta}
    />
  );
};

export default ListPrintRuntime;
