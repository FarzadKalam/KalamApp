import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EditableTable from '../EditableTable.tsx';
import GridTable from '../GridTable';
import SummaryCard from '../SummaryCard';
import ProductionStagesField from '../../components/ProductionStagesField';
import { calculateSummary } from '../../utils/calculations';
import { SummaryCalculationType, FieldType } from '../../types';
import { supabase } from '../../supabaseClient';

// 👇 اینترفیس اصلاح شد: حذف linkedBomData و ...
interface TablesSectionProps {
  module: any; 
  data: any; 
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  checkVisibility: (logic: any) => boolean;
  renderSmartField?: (field: any, isHeader?: boolean) => React.ReactNode;
  canViewField?: (fieldKey: string) => boolean;
  canEditModule?: boolean;
  onDataUpdate?: (patch: Record<string, any>) => void;
}

const shouldShowInvoiceSummary = (summaryConfig: any) =>
  summaryConfig?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS;

const TablesSection: React.FC<TablesSectionProps> = ({
  module,
  data,
  relationOptions,
  dynamicOptions,
  checkVisibility,
  renderSmartField,
  canViewField,
  canEditModule = true,
  onDataUpdate,
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
        .select('invoiceItems,payments,total_invoice_amount,total_received_amount,remaining_balance,updated_at')
        .eq('id', data.id)
        .single();
      if (error) throw error;
      onDataUpdate({
        invoiceItems: latest?.invoiceItems || [],
        payments: latest?.payments || [],
        total_invoice_amount: latest?.total_invoice_amount || 0,
        total_received_amount: latest?.total_received_amount || 0,
        remaining_balance: latest?.remaining_balance || 0,
        updated_at: latest?.updated_at || null,
      });
    } catch (err) {
      console.warn('Summary refresh failed:', err);
    } finally {
      setSummaryRefreshing(false);
    }
  }, [data?.id, module?.id, onDataUpdate]);
  const isProductionOrder = module.id === 'production_orders';
  const productionLocked = isProductionOrder && ['in_progress', 'completed'].includes(data?.status);
  const processStageFieldKeys = useMemo(() => new Set([
    'execution_process_draft',
    'marketing_process_draft',
    'template_stages_preview',
    'run_stages_preview',
  ]), []);
  const isUuid = useCallback((value: any) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ''))
  ), []);
  const syncProcessTemplateStages = useCallback(async (templateId: string, rawStages: any[]) => {
    const nextStages = (Array.isArray(rawStages) ? rawStages : []).map((stage: any, index: number) => ({
      id: isUuid(stage?.id) ? String(stage.id) : null,
      stage_name: String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`),
      sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      wage: Number(stage?.wage || 0),
      metadata: {
        ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
        weight: Number(stage?.weight || stage?.metadata?.weight || 0),
        duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
        duration_unit: String(stage?.duration_unit || stage?.metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: String(stage?.duration_from || stage?.metadata?.duration_from || 'project_start') === 'previous_stage_end' ? 'previous_stage_end' : 'project_start',
      },
      default_assignee_id: isUuid(stage?.default_assignee_id) ? String(stage.default_assignee_id) : null,
      default_assignee_role_id: isUuid(stage?.default_assignee_role_id) ? String(stage.default_assignee_role_id) : null,
    }));

    const { data: existingRows, error: existingError } = await supabase
      .from('process_template_stages')
      .select('id')
      .eq('template_id', templateId);
    if (existingError) throw existingError;

    const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));
    const keptExistingIds = new Set(
      nextStages
        .map((stage) => stage.id)
        .filter((id): id is string => Boolean(id && existingIds.has(id)))
    );
    const removeIds = Array.from(existingIds).filter((id) => !keptExistingIds.has(id));
    if (removeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('process_template_stages')
        .delete()
        .in('id', removeIds);
      if (deleteError) throw deleteError;
    }

    for (const stage of nextStages) {
      if (stage.id && existingIds.has(stage.id)) {
        const { error: updateError } = await supabase
          .from('process_template_stages')
          .update({
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          })
          .eq('id', stage.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('process_template_stages')
          .insert({
            template_id: templateId,
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          });
        if (insertError) throw insertError;
      }
    }

    const { data: refreshedRows, error: refreshError } = await supabase
      .from('process_template_stages')
      .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });
    if (refreshError) throw refreshError;

    return (refreshedRows || []).map((stage: any, index: number) => ({
      ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
      id: stage.id || `${templateId}_${index + 1}`,
      name: stage.stage_name || `مرحله ${index + 1}`,
      sort_order: stage.sort_order || ((index + 1) * 10),
      wage: Number(stage.wage || 0),
      weight: Number(stage?.metadata?.weight || 0),
      duration_value: Number(stage?.metadata?.duration_value || 0),
      duration_unit: stage?.metadata?.duration_unit || 'day',
      duration_from: stage?.metadata?.duration_from || 'project_start',
      default_assignee_id: stage.default_assignee_id || null,
      default_assignee_role_id: stage.default_assignee_role_id || null,
      template_stage_id: stage.id || null,
    }));
  }, [isUuid]);
  const progressFields = (module.fields || [])
    .filter((f: any) => f.type === FieldType.PROGRESS_STAGES || processStageFieldKeys.has(String(f?.key || '')))
    .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
    .filter((f: any) => (!f.logic || checkVisibility(f.logic)));

  return (
    <div className="tables-section space-y-6 md:space-y-8">

      {progressFields.map((field: any) => (
        (() => {
          const fieldKey = String(field?.key || '');
          const isProcessStagesField = processStageFieldKeys.has(fieldKey);
          const isTemplatePreviewField = fieldKey === 'template_stages_preview';
          const isRunPreviewField = fieldKey === 'run_stages_preview';
          const processTemplateField = (module.fields || []).find((candidate: any) => (
            String(candidate?.key || '') === 'process_template_id'
            && String(candidate?.blockId || '') === String(field?.blockId || '')
          ));
          const canShowProcessTemplateField = !!processTemplateField
            && (!canViewField || canViewField(String(processTemplateField.key)) !== false)
            && (!processTemplateField.logic || checkVisibility(processTemplateField.logic));
          const stageDraftValue = isProcessStagesField
            ? (Array.isArray(data?.[fieldKey]) ? data[fieldKey] : [])
            : (data?.production_stages_draft || []);
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
        <div key={field.key} className="bg-white dark:bg-[#1e1e1e] p-4 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm md:text-lg font-bold mb-4 text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>                {field.labels.fa}
            </h3>
            {canShowProcessTemplateField && renderSmartField && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-1">{processTemplateField.labels?.fa || 'الگوی فرآیند اجرا'}</div>
                {renderSmartField(processTemplateField)}
              </div>
            )}
            <ProductionStagesField 
              recordId={data.id} 
              moduleId={module.id}
              readOnly={!canEditModule || productionLocked || isRunPreviewField}
              compact={true}
              onQuantityChange={isProductionOrder ? (qty) => onDataUpdate?.({ quantity: qty }) : undefined}
              draftStages={stageDraftValue}
              onDraftStagesChange={handleDraftStagesChange}
              showWageSummary={module.id === 'production_orders'}
            />
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
              onSaveSuccess={(newData) => onDataUpdate?.({ [block.id]: newData })}
            />
          ) : (
            <EditableTable
              block={block}
              initialData={block.externalDataConfig ? (externalTables[block.id] || []) : (data[block.id] || [])}
              mode={block.externalDataConfig ? 'local' : 'db'}
              moduleId={module.id}
              recordId={data.id}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule && !(productionLocked && String(block.id).startsWith('items_'))}
              canViewField={(fieldKey) =>
                (canViewField ? canViewField(`${block.id}.${fieldKey}`) !== false : true) &&
                (canViewField ? canViewField(fieldKey) !== false : true)
              }
              onSaveSuccess={(newData) => onDataUpdate?.({ [block.id]: newData })}
            />
          )}
        </div>
      ))}

      {summaryData && shouldShowInvoiceSummary(summaryConfig) && (
          <SummaryCard 
            type={summaryConfig.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
            data={summaryData} 
            onRefresh={refreshInvoiceSummary}
            refreshing={summaryRefreshing}
          />
      )}
    </div>
  );
};

export default TablesSection;

