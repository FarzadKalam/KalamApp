import React, { useCallback, useMemo } from 'react';
import { Tabs } from 'antd';
import EditableTable from '../EditableTable';
import { FieldType } from '../../types';
import ProductStockMovementsPanel from '../products/ProductStockMovementsPanel';
import ShelfInventoryPanel from '../shelves/ShelfInventoryPanel';
import ShelfStockMovementsPanel from '../shelves/ShelfStockMovementsPanel';

interface FieldGroupsTabsProps {
  fieldGroups: any[];
  moduleConfig: any;
  data: any;
  moduleId: string;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  renderSmartField: (field: any) => React.ReactNode;
  checkVisibility: (logic: any) => boolean;
  canViewField?: (fieldKey: string) => boolean;
  canEditModule?: boolean;
  onDataUpdate?: (patch: Record<string, any>) => void;
  stockMovementQuickAddSignal?: number;
}

const FieldGroupsTabs: React.FC<FieldGroupsTabsProps> = ({
  fieldGroups,
  moduleConfig,
  data,
  moduleId,
  recordId,
  relationOptions,
  dynamicOptions,
  renderSmartField,
  checkVisibility,
  canViewField,
  canEditModule = true,
  onDataUpdate,
  stockMovementQuickAddSignal = 0,
}) => {
  const handleStockUpdated = useCallback((stock: number) => {
    onDataUpdate?.({ stock });
  }, [onDataUpdate]);
  const taskShelfId = moduleId === 'tasks'
    ? (data?.production_shelf_id || data?.recurrence_info?.production_shelf_id || null)
    : null;
  const taskShelfLabel = useMemo(() => {
    if (!taskShelfId) return null;
    const shelfOptions = relationOptions?.production_shelf_id || relationOptions?.shelves || [];
    const matched = (Array.isArray(shelfOptions) ? shelfOptions : []).find(
      (item: any) => String(item?.value || '') === String(taskShelfId)
    );
    const directLabel =
      data?.production_shelf_name
      || data?.production_shelf_label
      || data?.production_shelf?.name
      || null;
    return String(matched?.label || directLabel || taskShelfId);
  }, [data?.production_shelf, data?.production_shelf_id, data?.production_shelf_label, data?.production_shelf_name, relationOptions, taskShelfId]);
  const visibleFieldGroups = (fieldGroups || []).filter((block: any) =>
    canViewField ? canViewField(String(block.id)) !== false : true
  );
  if (visibleFieldGroups.length === 0) return null;

  const renderBlockContent = (block: any) => (
    <div className="p-6 md:p-4 sm:p-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 md:gap-4">
        {moduleConfig.fields
          .filter((f: any) => f.blockId === block.id)
          .filter((f: any) => f.type !== FieldType.PROGRESS_STAGES)
          .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
          .map((f: any) => (!f.logic || checkVisibility(f.logic)) && (
            <div key={f.key} className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">{f.labels.fa}</span>
              {renderSmartField(f)}
            </div>
          ))}
      </div>
      {block.tableColumns && (
        <div className="mt-6">
          {(moduleId === 'shelves' && block.id === 'shelf_inventory') ? (
            <ShelfInventoryPanel
              block={block}
              recordId={recordId}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
            />
          ) : (moduleId === 'tasks' && block.id === 'task_shelf_inventory') ? (
            taskShelfId ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-600">
                  قفسه مرحله: <span className="font-semibold text-[#8b5e3c]">{taskShelfLabel || '-'}</span>
                </div>
                <ShelfInventoryPanel
                  block={block}
                  recordId={String(taskShelfId)}
                  relationOptions={relationOptions}
                  dynamicOptions={dynamicOptions}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-4 text-xs text-gray-500">
                برای نمایش موجودی، ابتدا قفسه مرحله تولید را انتخاب کنید.
              </div>
            )
          ) : (
            <EditableTable
              block={block}
              initialData={data?.[block.id] || []}
              mode="db"
              moduleId={moduleId}
              recordId={recordId}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule}
              canViewField={(fieldKey) =>
                (canViewField ? canViewField(`${block.id}.${fieldKey}`) !== false : true) &&
                (canViewField ? canViewField(fieldKey) !== false : true)
              }
              readOnly={moduleId === 'products' && block.id === 'product_inventory'}
            />
          )}
        </div>
      )}
      {moduleId === 'products' && block.id === 'product_inventory' && (() => {
        const stockMovementsBlock = moduleConfig?.blocks?.find((b: any) => b.id === 'product_stock_movements');
        if (!stockMovementsBlock) return null;
        if (stockMovementsBlock.visibleIf && !checkVisibility(stockMovementsBlock.visibleIf)) return null;
        if (canViewField && canViewField('product_stock_movements') === false) return null;
        return (
          <div className="mt-6">
            <ProductStockMovementsPanel
              block={stockMovementsBlock}
              recordId={recordId}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule}
              onProductStockUpdated={handleStockUpdated}
              openQuickAddSignal={stockMovementQuickAddSignal}
            />
          </div>
        );
      })()}
      {((moduleId === 'shelves' && block.id === 'shelf_inventory') || (moduleId === 'tasks' && block.id === 'task_shelf_inventory')) && (() => {
        const stockMovementsBlock = moduleConfig?.blocks?.find((b: any) =>
          b.id === (moduleId === 'tasks' ? 'task_shelf_stock_movements' : 'shelf_stock_movements')
        );
        if (!stockMovementsBlock) return null;
        if (stockMovementsBlock.visibleIf && !checkVisibility(stockMovementsBlock.visibleIf)) return null;
        if (canViewField && canViewField(String(stockMovementsBlock.id)) === false) return null;
        if (moduleId === 'tasks' && !taskShelfId) return null;
        return (
          <div className="mt-6">
            <ShelfStockMovementsPanel
              block={stockMovementsBlock}
              recordId={moduleId === 'tasks' ? String(taskShelfId) : recordId}
              relationOptions={relationOptions}
              dynamicOptions={dynamicOptions}
              canEditModule={canEditModule}
              openQuickAddSignal={stockMovementQuickAddSignal}
            />
          </div>
        );
      })()}
    </div>
  );

  if (moduleId === 'shelves') {
    return (
      <div className="field-groups-tabs bg-white dark:bg-[#1a1a1a] p-1 md:p-1 sm:p-0 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
        {visibleFieldGroups.map((block, index) => (
          <div key={block.id} className={index > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}>
            {renderBlockContent(block)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="field-groups-tabs bg-white dark:bg-[#1a1a1a] p-1 md:p-1 sm:p-0 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
      <Tabs
        tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
        items={visibleFieldGroups.map(block => ({
          key: block.id,
          label: <span className="flex items-center gap-2 py-3">{block.titles.fa}</span>,
          children: renderBlockContent(block),
        }))}
      />
    </div>
  );
};

export default FieldGroupsTabs;
