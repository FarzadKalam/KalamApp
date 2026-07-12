import React from 'react';
import { Divider } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { productionBomModule } from '../../modules/productionConfig';
import { BlockType } from '../../types';
import EditableTable from '../EditableTable';
import { useCurrencyConfig } from '../../utils/currency';

interface BomStructureRendererProps {
  bomData: any;
  relationOptions: any;
  dynamicOptions: any;
  onUpdate: () => void;
    canViewField?: (fieldKey: string) => boolean;
    readOnly?: boolean;
}

const BomStructureRenderer: React.FC<BomStructureRendererProps> = ({ 
  bomData, 
  relationOptions, 
  dynamicOptions, 
    onUpdate,
    canViewField,
    readOnly 
}) => {
  const { label: currencyLabel } = useCurrencyConfig();

  // محاسبه جمع کل شناسنامه تولید
  const calculateGrandTotal = () => {
      let grandTotal = 0;
      if (bomData) {
          const costTables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory', 'items_labor'];
          costTables.forEach(tableName => {
              const rows = bomData[tableName];
              if (Array.isArray(rows)) {
                  rows.forEach(row => {
                      const val = row.total_price || ((parseFloat(row.usage)||0) * (parseFloat(row.buy_price)||0));
                      grandTotal += val;
                  });
              }
          });
      }
      return grandTotal;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
        <Divider orientation="right" className="text-leather-600 border-leather-600 font-bold">
            <span className="whitespace-normal text-wrap leading-relaxed">
                📋 ساختار محصول (برگرفته از: <Link to={`/production_boms/${bomData.id}`} className="text-leather-600 hover:underline">{bomData.name}</Link>)
            </span>
        </Divider>
        
        <div className="overflow-x-auto pb-4">
            <div className="min-w-[600px]">
                {productionBomModule.blocks?.filter(b => b.type === BlockType.TABLE).map(block => (
                    <div key={block.id} className="mb-6">
                        <EditableTable 
                          block={block}
                          initialData={bomData[block.id] || []} 
                          moduleId="production_boms"
                          recordId={bomData.id} 
                          relationOptions={relationOptions} 
                          dynamicOptions={dynamicOptions}
                                                    canViewField={canViewField}
                                                    readOnly={readOnly}
                          onSaveSuccess={onUpdate}
                        />
                    </div>
                ))}
            </div>
        </div>

        {/* کارت محاسبه بهای تمام شده */}
        {(canViewField ? canViewField('grand_total') !== false : true) && (
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 dark:from-leather-900 dark:to-black text-white p-6 rounded-[2rem] shadow-xl mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl shadow-inner">
                    <CalculatorOutlined />
                </div>
                <div>
                    <h3 className="text-white font-bold text-base m-0">بهای تمام شده تولید</h3>
                    <div className="text-xs text-white/60">مجموع مواد اولیه و دستمزد طبق شناسنامه</div>
                </div>
            </div>
            <div className="flex flex-col items-end">
                <div className="text-3xl font-black font-mono tracking-tight text-white drop-shadow-md">
                    {Math.round(calculateGrandTotal()).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} <span className="text-sm font-sans font-normal opacity-70">{currencyLabel}</span>
                </div>
            </div>
        </div>
        )}
    </div>
  );
};

export default BomStructureRenderer;
