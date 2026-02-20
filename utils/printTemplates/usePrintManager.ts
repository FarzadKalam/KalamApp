import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PrintTemplate } from './index';
import { InvoiceCard } from './templates/invoice-card';
import { ProductLabel } from './templates/product-label';
import { ProductionPassport } from './templates/production-passport';
import { toPersianNumber, formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { supabase } from '../../supabaseClient';

interface UsePrintManagerProps {
  moduleId: string;
  data: any;
  moduleConfig: any;
  printableFields: any[];
  formatPrintValue: (field: any, value: any) => string;
  relationOptions?: Record<string, any[]>;
}

export const usePrintManager = ({
  moduleId,
  data,
  moduleConfig,
  printableFields,
  formatPrintValue,
  relationOptions = {},
}: UsePrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);

  // لیست قالب‌های موجود برای این ماژول
  const printTemplates = useMemo<PrintTemplate[]>(() => {
    let templates: PrintTemplate[] = [];

    // ✅ قالب مشخصات کالا - برای محصولات
    if (moduleId === 'products') {
      templates = [
        { 
          id: 'product_label', 
          title: 'مشخصات کالا', 
          description: 'برچسب A6 برای محصول' 
        }
      ];
    } 
    // ✅ قالب فاکتور فروش - برای فاکتورها
    else if (moduleId === 'invoices') {
      templates = [
        { 
          id: 'invoice_sales_official', 
          title: 'فاکتور فروش (رسمی)', 
          description: 'نمایش کامل مشخصات خریدار و فروشنده' 
        },
        { 
          id: 'invoice_sales_simple', 
          title: 'فاکتور فروش (غیررسمی)', 
          description: 'فقط نام و شماره فروشنده' 
        }
      ];
    }
    // ✅ قالب شناسنامه تولید - برای BOM و سفارشات تولید
    else if (moduleId === 'production_boms' || moduleId === 'production_orders') {
      templates = [
        { 
          id: 'production_passport', 
          title: 'شناسنامه تولید', 
          description: 'برگه شناسنامه تولید' 
        }
      ];
    }

    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }

    return templates;
  }, [moduleId]);

  // انتخاب قالب فعلی
  const activeTemplate = printTemplates.find(t => t.id === selectedTemplateId) || printTemplates[0];

  // URL برای QR Code
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;

  // تابع برای باز کردن modal
  const openPrintModal = useCallback(() => {
    setIsPrintModalOpen(true);
  }, []);

  // تابع برای بستن modal
  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  // تابع برای چاپ
  const handlePrint = useCallback(() => {
    if (!selectedTemplateId) return;
    
    setIsPrintModalOpen(false);
    setPrintMode(true);
    
    setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      
      setTimeout(() => {
        window.print();
        
        setTimeout(() => {
          setPrintMode(false);
        }, 1000);
      }, 300);
    }, 100);
  }, [selectedTemplateId]);

  // مدیریت خروج از حالت پرینت بعد از print
  useEffect(() => {
    if (!printMode) return;
    
    const handleAfterPrint = () => {
      setPrintMode(false);
    };
    
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printMode]);

  // ✅ وقتی قالب یا فیلدهای چاپی تغییر کند، تمام فیلدها به صورت پیش‌فرض انتخاب شوند
  useEffect(() => {
    if (selectedTemplateId && printableFields.length > 0) {
      setSelectedPrintFields(prev => ({
        ...prev,
        [selectedTemplateId]: printableFields.map(field => field.key)
      }));
    }
  }, [selectedTemplateId, printableFields]);

  // تابع تغییر انتخاب فیلدهای چاپ
  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields(prev => {
      const current = prev[templateId] || [];
      if (current.includes(fieldName)) {
        return {
          ...prev,
          [templateId]: current.filter(f => f !== fieldName)
        };
      } else {
        return {
          ...prev,
          [templateId]: [...current, fieldName]
        };
      }
    });
  }, []);

  // تابع render card جهت انتخاب قالب صحیح
  const renderPrintCard = useCallback(() => {
    // فیلدهای انتخاب‌شده رو فیلتر کن
    const fieldsToDisplay = printableFields.filter(field => {
      const selected = selectedPrintFields[selectedTemplateId] || [];
      return selected.length === 0 || selected.includes(field.key);
    });

    switch (selectedTemplateId) {
      case 'invoice_sales_official':
      case 'invoice_sales_simple':
        return React.createElement(InvoiceCard, {
          data,
          formatPersianPrice,
          toPersianNumber,
          safeJalaliFormat,
          relationOptions,
          templateId: selectedTemplateId,
          customer: customerInfo,
          seller: sellerInfo,
        });
      
      case 'product_label':
        return React.createElement(ProductLabel, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
      
      case 'production_passport':
        return React.createElement(ProductionPassport, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
    }
    return null;
  }, [selectedTemplateId, data, printableFields, selectedPrintFields, activeTemplate, moduleConfig, printQrValue, formatPrintValue, sellerInfo, customerInfo, relationOptions]);

  // بارگذاری اطلاعات فروشنده/مشتری برای فاکتور
  useEffect(() => {
    if (moduleId !== 'invoices') return;

    let isMounted = true;

    const load = async () => {
      try {
        const [{ data: companyData, error: companyError }, { data: customerData, error: customerError }] = await Promise.all([
          supabase.from('company_settings').select('*').limit(1).maybeSingle(),
          data?.customer_id
            ? supabase.from('customers').select('*').eq('id', data.customer_id).maybeSingle()
            : Promise.resolve({ data: null, error: null })
        ]);

        if (!isMounted) return;

        if (companyError) {
          console.error('Load company settings failed', companyError.message);
        } else {
          setSellerInfo(companyData || null);
        }

        if (customerError) {
          console.error('Load customer failed', customerError.message);
        } else {
          setCustomerInfo(customerData || null);
        }
      } catch (err) {
        console.error('Load print data failed', err);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [moduleId, data?.customer_id]);

  return {
    // States
    isPrintModalOpen,
    selectedTemplateId,
    printMode,
    selectedPrintFields,
    printTemplates,
    activeTemplate,
    printQrValue,
    
    // Functions
    setIsPrintModalOpen,
    setSelectedTemplateId,
    setPrintMode,
    openPrintModal,
    closePrintModal,
    handlePrint,
    handleTogglePrintField,
    renderPrintCard,
  };
};
