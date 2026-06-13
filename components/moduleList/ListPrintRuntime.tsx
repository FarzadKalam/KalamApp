import React, { useEffect, useMemo } from "react";
import PrintSection from "../moduleShow/PrintSection";
import type { ModuleDefinition } from "../../types";
import { buildListPrintableFields } from "../../utils/listPrintExport";
import { useListPrintManager } from "../../utils/printTemplates/useListPrintManager";

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
      printTemplates={printManager.printTemplates}
      selectedTemplateId={printManager.selectedTemplateId}
      onSelectTemplate={printManager.setSelectedTemplateId}
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
      onTogglePrintSignatureAutomatic={printManager.handleTogglePrintSignatureAutomatic}
      onChangePrintSignatureName={printManager.handleChangePrintSignatureName}
      onChangePrintSignatureSubtitle={printManager.handleChangePrintSignatureSubtitle}
      onChangePrintSignatureSignerModule={printManager.handleChangePrintSignatureSignerModule}
      onChangePrintSignatureSignerId={printManager.handleChangePrintSignatureSignerId}
      onSearchPrintSignatureOptions={printManager.loadSignatureSignerOptions}
      onRefreshPreview={printManager.refreshTemplates}
      allowFieldSelectionTab={printManager.allowFieldSelectionTab}
      showImageDisplayModeControl={printManager.showImageDisplayModeControl}
      previewMeta={printManager.previewMeta}
    />
  );
};

export default ListPrintRuntime;
