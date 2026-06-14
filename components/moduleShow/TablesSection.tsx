import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tooltip } from 'antd';
import EditableTable from '../EditableTable.tsx';
import GridTable from '../GridTable';
import SummaryCard from '../SummaryCard';
import AiSparkleIcon from '../ai/AiSparkleIcon';
import { calculateSummary } from '../../utils/calculations';
import { SummaryCalculationType, FieldType } from '../../types';
import { supabase } from '../../supabaseClient';
import { normalizeProcessTargetModuleIds } from '../../utils/processTargets';
import { syncProcessTemplateStages as syncProcessTemplateStagesShared } from '../../utils/processTemplateStages';
import { AI_CONTEXT_EVENT, AI_OPEN_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import { buildProcessGuideContext } from '../../utils/processGuideContext';
import type { ProcessRuntimeSnapshot } from '../../utils/processRuntimeSnapshot';

const ProductionStagesField = React.lazy(() => import('../../components/ProductionStagesField'));

// 👇 اینترفیس اصلاح شد: حذف linkedBomData و ...
interface TablesSectionProps {
  module: any; 
  data: any; 
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  checkVisibility: (logic: any) => boolean;
  isFieldVisible?: (field: any) => boolean;
  canViewField?: (fieldKey: string) => boolean;
  canEditModule?: boolean;
  onDataUpdate?: (patch: Record<string, any>) => void;
  focusBlockId?: string | null;
  focusRowKey?: string | null;
  processRuntimeSnapshot?: ProcessRuntimeSnapshot | null;
  onProcessRuntimeSnapshot?: (snapshot: ProcessRuntimeSnapshot) => void;
}

const shouldShowInvoiceSummary = (summaryConfig: any) =>
  summaryConfig?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS;

const TablesSection: React.FC<TablesSectionProps> = ({
  module,
  data,
  relationOptions,
  dynamicOptions,
  checkVisibility,
  isFieldVisible,
  canViewField,
  canEditModule = true,
  onDataUpdate,
  focusBlockId,
  focusRowKey,
  processRuntimeSnapshot,
  onProcessRuntimeSnapshot,
}) => {
  if (!module || !data) return null;

  const [externalTables, setExternalTables] = useState<Record<string, any[]>>({});
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);

  const externalBlocks = useMemo(
    () => module.blocks?.filter((b: any) => b.type === 'table' && b.externalDataConfig) || [],
    [module.blocks]
  );

  useEffect(() => {
    const loadExternal = async () => {
      const updates: Record<string, any[]> = {};
      for (const block of externalBlocks) {
        const cfg = block.externalDataConfig;
        if (!cfg?.targetModule || !cfg?.relationFieldKey) continue;
        try {
          const { data: rows } = await (supabase as any)
            .from(cfg.targetModule)
            .select(cfg.targetColumn || '*')
            .eq(cfg.relationFieldKey, data.id)
            .order('created_at', { ascending: true });
          updates[block.id] = rows || [];
        } catch (err) {
          console.warn('External table load failed:', block.id, err);
          updates[block.id] = [];
        }
      }
      if (Object.keys(updates).length > 0) setExternalTables(updates);
    };

    if (externalBlocks.length > 0 && data?.id) {
      loadExternal();
    }
  }, [externalBlocks, data?.id]);

  const getSummaryData = () => {
      const summaryBlock = module.blocks?.find((b: any) => b.summaryConfig);
      if (summaryBlock) {
          return calculateSummary(data, module.blocks || [], summaryBlock.summaryConfig);
      }
          if (module.blocks?.some((b: any) => b.type === 'table')) {
          return calculateSummary(data, module.blocks || [], {});
      }
      return null;
  };

  const summaryData = getSummaryData();
  const summaryConfig = module.blocks?.find((b: any) => b.summaryConfig)?.summaryConfig || {};
  const refreshInvoiceSummary = useCallback(async () => {
    if (!onDataUpdate || !data?.id || !['invoices', 'purchase_invoices'].includes(String(module?.id || ''))) return;
    try {
      setSummaryRefreshing(true);
      const { data: latest, error } = await supabase
        .from(module.id)
        .select('invoiceItems,payments,total_invoice_amount,total_received_amount,remaining_balance,global_discount_type,global_discount_value,updated_at')
        .eq('id', data.id)
        .single();
      if (error) throw error;
      onDataUpdate({
        invoiceItems: latest?.invoiceItems || [],
        payments: latest?.payments || [],
        total_invoice_amount: latest?.total_invoice_amount || 0,
        total_received_amount: latest?.total_received_amount || 0,
        remaining_balance: latest?.remaining_balance || 0,
        global_discount_type: latest?.global_discount_type || 'amount',
        global_discount_value: latest?.global_discount_value || 0,
        updated_at: latest?.updated_at || null,
      });
    } catch (err) {
      console.warn('Summary refresh failed:', err);
    } finally {
      setSummaryRefreshing(false);
    }
  }, [data?.id, module?.id, onDataUpdate]);
  const handleBlockSaveSuccess = useCallback((blockId: string, newData: any[]) => {
    onDataUpdate?.({ [blockId]: newData });
    const isInvoiceModule = ['invoices', 'purchase_invoices'].includes(String(module?.id || ''));
    const isInvoiceFinancialBlock = blockId === 'invoiceItems' || blockId === 'payments';
    if (isInvoiceModule && isInvoiceFinancialBlock) {
      void refreshInvoiceSummary();
    }
  }, [module?.id, onDataUpdate, refreshInvoiceSummary]);
  const isProductionOrder = module.id === 'production_orders';
  const productionLocked = isProductionOrder && ['in_progress', 'completed'].includes(data?.status);
  const processStageFieldKeys = useMemo(() => new Set([
    'execution_process_draft',
    'marketing_process_draft',
    'template_stages_preview',
    'run_stages_preview',
  ]), []);
  const processGuideTasks = (
    processRuntimeSnapshot?.loaded
    && processRuntimeSnapshot.moduleId === String(module?.id || '')
    && processRuntimeSnapshot.recordId === String(data?.id || '')
  ) ? processRuntimeSnapshot.tasks : [];
  const syncProcessTemplateStages = useCallback(
    (templateId: string, rawStages: any[]) =>
      syncProcessTemplateStagesShared(supabase, templateId, rawStages),
    [],
  );
  const progressFields = (module.fields || [])
    .filter((f: any) => f.type === FieldType.PROGRESS_STAGES || processStageFieldKeys.has(String(f?.key || '')))
    .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
    .filter((f: any) => (isFieldVisible ? isFieldVisible(f) : (!f.logic || checkVisibility(f.logic))));

  return (
    <div className="tables-section space-y-6 md:space-y-8">

      {progressFields.map((field: any) => (
        (() => {
          const fieldKey = String(field?.key || '');
          const isProcessStagesField = processStageFieldKeys.has(fieldKey);
          const isTemplatePreviewField = fieldKey === 'template_stages_preview';
          const isRunPreviewField = fieldKey === 'run_stages_preview';
          const processSectionAnchorId = isProcessStagesField
            ? `process-section-${String(module?.id || '')}-${String(data?.id || '')}`
            : undefined;
          const stageDraftValue = isProcessStagesField
            ? (Array.isArray(data?.[fieldKey]) ? data[fieldKey] : [])
            : (data?.production_stages_draft || []);
          const processGuideContext = isProcessStagesField
            ? buildProcessGuideContext({
                moduleId: module?.id,
                recordId: String(data?.id || '').trim() || null,
                fieldKey,
                stages: Array.isArray(stageDraftValue) ? stageDraftValue : [],
                tasks: processGuideTasks,
              })
            : null;
          const availableProcesses = Array.isArray(processGuideContext?.available_processes)
            ? processGuideContext.available_processes
            : [];
          const handleOpenProcessGuide = () => {
            if (typeof window === 'undefined' || !processGuideContext || availableProcesses.length === 0) return;
            const detail: AssistantContext = {
              mode: 'record',
              moduleId: String(module?.id || '').trim() || null,
              recordId: String(data?.id || '').trim() || null,
              route: `${window.location.pathname}${window.location.search || ''}`,
              intent: 'process_guide',
              processFieldKey: fieldKey,
              selectedProcessId: availableProcesses.length === 1 ? availableProcesses[0].id : null,
              selectedProcessGroupId: availableProcesses.length === 1 ? availableProcesses[0].id : null,
              availableProcesses: availableProcesses.map((process) => ({
                id: process.id,
                label: process.label,
                templateId: process.templateId,
                templateName: process.templateName,
                stageCount: process.stageCount,
              })),
              processGuideContext: processGuideContext,
            };
            window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, {
              detail: {
                context: detail,
              },
            }));
            window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail }));
          };
          const handleDraftStagesChange = async (nextStages: any[]) => {
            if (!onDataUpdate) return;
            if (isTemplatePreviewField && module.id === 'process_templates' && data?.id) {
              onDataUpdate({ template_stages_preview: nextStages });
              try {
                const refreshed = await syncProcessTemplateStages(String(data.id), nextStages);
                onDataUpdate({ template_stages_preview: refreshed });
              } catch (err) {
                console.warn('Could not persist process template stages:', err);
              }
              return;
            }
            if (!isProcessStagesField) {
              onDataUpdate({ production_stages_draft: nextStages });
              return;
            }
            onDataUpdate({ [fieldKey]: nextStages });
            if (!data?.id || isRunPreviewField) return;
            try {
              const { error } = await supabase
                .from(module.id)
                .update({ [fieldKey]: nextStages })
                .eq('id', data.id);
              if (error) throw error;
            } catch (err) {
              console.warn('Could not persist process draft stages from table section:', err);
            }
          };

          return (
            <div id={processSectionAnchorId} key={field.key} className="bg-white dark:bg-[#1e1e1e] p-4 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="m-0 text-sm md:text-lg font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
                {field.labels.fa}
              </h3>
              {isProcessStagesField && availableProcesses.length > 0 ? (
                <Tooltip title="راهنمای هوشمند فرآیند">
                  <Button
                    type="text"
                    size="small"
                    onClick={handleOpenProcessGuide}
                    className="inline-flex items-center justify-center !text-[rgb(var(--brand-700-rgb))] dark:!text-[rgb(var(--brand-300-rgb))]"
                    icon={<AiSparkleIcon className="h-4 w-4" />}
                  />
                </Tooltip>
              ) : null}
            </div>
            <React.Suspense fallback={null}>
              <ProductionStagesField
                recordId={data.id}
                moduleId={module.id}
                forceProcessRecordMode={isProcessStagesField && !isTemplatePreviewField && !isRunPreviewField}
                automationContextModuleId={null}
                automationContextModuleIds={
                  module.id === 'process_templates' || module.id === 'process_runs'
                    ? normalizeProcessTargetModuleIds((data as any)?.module_ids, (data as any)?.module_id)
                    : null
                }
                readOnly={!canEditModule || productionLocked || isRunPreviewField}
                compact={true}
                onQuantityChange={isProductionOrder ? (qty) => onDataUpdate?.({ quantity: qty }) : undefined}
                draftStages={stageDraftValue}
                onDraftStagesChange={handleDraftStagesChange}
                showWageSummary={module.id === 'production_orders'}
                onRuntimeSnapshot={onProcessRuntimeSnapshot}
              />
            </React.Suspense>
            </div>
          );
        })()
      ))}

      {module.blocks
        ?.filter((b: any) => b.type === 'table' || b.type === 'grid_table')
        .filter((b: any) => !(module.id === 'products' && b.id === 'product_stock_movements'))
        .filter((b: any) => !(module.id === 'shelves' && b.id === 'shelf_stock_movements'))
        .filter((b: any) => !(module.id === 'tasks' && b.id === 'task_shelf_stock_movements'))
        .filter((b: any) => (canViewField ? canViewField(String(b.id)) !== false : true))
        .filter((b: any) => (b.visibleIf ? checkVisibility(b.visibleIf) : true))
          .map((block: any) => (
        <div key={block.id}>
          {block.type === 'grid_table' ? (
            <GridTable
              block={block}
              initialData={data[block.id] || []}
              mode="db"
              moduleId={module.id}
              recordId={data.id}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule && !(productionLocked && String(block.id).startsWith('items_'))}
              canViewField={(fieldKey) =>
                (canViewField ? canViewField(`${block.id}.${fieldKey}`) !== false : true) &&
                (canViewField ? canViewField(fieldKey) !== false : true)
              }
              orderQuantity={module.id === 'production_orders' ? (data?.quantity || 0) : 0}
              showDeliveredQtyColumn={module.id === 'production_orders' && ['in_progress', 'completed'].includes(String(data?.status || ''))}
              forceProductionOrderMode={module.id === 'products'}
              onSaveSuccess={(newData) => handleBlockSaveSuccess(String(block.id), newData)}
            />
          ) : (
            <EditableTable
              block={block}
              initialData={block.externalDataConfig ? (externalTables[block.id] || []) : (data[block.id] || [])}
              mode={block.externalDataConfig ? 'local' : 'db'}
              moduleId={module.id}
              recordId={data.id}
              parentValues={data}
              invoiceGlobalDiscountType={data?.global_discount_type ?? null}
              invoiceGlobalDiscountValue={data?.global_discount_value ?? null}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule && !(productionLocked && String(block.id).startsWith('items_'))}
              canViewField={(fieldKey) =>
                (canViewField ? canViewField(`${block.id}.${fieldKey}`) !== false : true) &&
                (canViewField ? canViewField(fieldKey) !== false : true)
              }
              onSaveSuccess={(newData) => handleBlockSaveSuccess(String(block.id), newData)}
              focusRowKey={String(focusBlockId || '') === String(block.id || '') ? focusRowKey : null}
            />
          )}
        </div>
      ))}

      {summaryData && shouldShowInvoiceSummary(summaryConfig) && (
          <SummaryCard 
            type={summaryConfig.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
            data={summaryData} 
            labels={summaryConfig?.labels}
            onRefresh={refreshInvoiceSummary}
            refreshing={summaryRefreshing}
          />
      )}
    </div>
  );
};

export default TablesSection;
