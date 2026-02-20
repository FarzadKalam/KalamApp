import React, { useEffect, useMemo, useState } from 'react';
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
  canViewField,
  canEditModule = true,
  onDataUpdate,
}) => {
  if (!module || !data) return null;

  const [externalTables, setExternalTables] = useState<Record<string, any[]>>({});

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
  const isProductionOrder = module.id === 'production_orders';
  const productionLocked = isProductionOrder && ['in_progress', 'completed'].includes(data?.status);
  const progressFields = (module.fields || [])
    .filter((f: any) => f.type === FieldType.PROGRESS_STAGES)
    .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
    .filter((f: any) => (!f.logic || checkVisibility(f.logic)));

  return (
    <div className="tables-section space-y-6 md:space-y-8">

      {progressFields.map((field: any) => (
        <div key={field.key} className="bg-white dark:bg-[#1e1e1e] p-4 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm md:text-lg font-bold mb-4 text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>                {field.labels.fa}
            </h3>
            <ProductionStagesField 
              recordId={data.id} 
              moduleId={module.id}
              readOnly={!canEditModule || productionLocked}
              compact={true}
              onQuantityChange={(qty) => onDataUpdate?.({ quantity: qty })}
              draftStages={data?.production_stages_draft || []}
              showWageSummary={module.id === 'production_orders'}
            />
        </div>
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
            />
          )}
        </div>
      ))}

      {summaryData && shouldShowInvoiceSummary(summaryConfig) && (
          <SummaryCard 
            type={summaryConfig.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
            data={summaryData} 
          />
      )}
    </div>
  );
};

export default TablesSection;
