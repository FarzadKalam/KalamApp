export interface PrintTemplate {
  id: string;
  title: string;
  description: string;
}

export const getAvailableTemplates = (moduleId: string): PrintTemplate[] => {
  const templates: PrintTemplate[] = [];

  // قالب مشخصات کالا
  if (moduleId === 'products') {
    templates.push({ 
      id: 'product_label',  
      title: 'مشخصات کالا', 
      description: 'برچسب A6 برای محصول' 
    });
  }

  // قالب فاکتور فروش
  if (moduleId === 'invoices') {
    templates.push({ 
      id: 'invoice_sales', 
      title: 'فاکتور فروش', 
      description: 'فاکتور رسمی برای فروش' 
    });
  }

  // قالب شناسنامه تولید
  if (moduleId === 'production_boms' || moduleId === 'production_orders') {
    templates.push({ 
      id: 'production_passport', 
      title: 'شناسنامه تولید', 
      description: 'برگه شناسنامه تولید' 
    });
  }

  return templates;
};

export { printStyles } from './styles';
