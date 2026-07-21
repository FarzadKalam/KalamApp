import { MODULES } from '../moduleRegistry';

export type FileSystemModuleDefinition = {
  moduleId: string;
  rootTitle: string;
  rootColorToken: string;
  relatedAttachmentSources?: Array<{
    moduleId: string;
    foreignKey: string;
    attachmentFieldKeys: string[];
  }>;
};

const DEFAULT_ROOT_COLOR_TOKEN = 'system-default';

const MODULE_ROOT_COLOR_TOKENS: Record<string, string> = {
  products: 'system-product',
  invoices: 'system-sales',
  purchase_invoices: 'system-purchase',
  expense_documents: 'system-expense',
  assets: 'system-finance',
  employee_advances: 'system-finance',
  payroll_slips: 'system-finance',
  tasks: 'system-task',
  customers: 'system-customer',
  suppliers: 'system-supplier',
  projects: 'system-project',
  cheques: 'system-finance',
};

export const FILE_SYSTEM_MODULE_DEFINITIONS: Record<string, FileSystemModuleDefinition> = {
  products: {
    moduleId: 'products',
    rootTitle: 'محصولات',
    rootColorToken: 'system-product',
  },
  invoices: {
    moduleId: 'invoices',
    rootTitle: 'فاکتورهای فروش',
    rootColorToken: 'system-sales',
    relatedAttachmentSources: [
      {
        moduleId: 'cash_bank_operations',
        foreignKey: 'sales_invoice_id',
        attachmentFieldKeys: ['attachment_url'],
      },
      {
        moduleId: 'barters',
        foreignKey: 'source_invoice_id',
        attachmentFieldKeys: ['attachment_url'],
      },
    ],
  },
  purchase_invoices: {
    moduleId: 'purchase_invoices',
    rootTitle: 'فاکتورهای خرید',
    rootColorToken: 'system-purchase',
    relatedAttachmentSources: [
      {
        moduleId: 'cash_bank_operations',
        foreignKey: 'purchase_invoice_id',
        attachmentFieldKeys: ['attachment_url'],
      },
      {
        moduleId: 'barters',
        foreignKey: 'source_purchase_invoice_id',
        attachmentFieldKeys: ['attachment_url'],
      },
    ],
  },
  expense_documents: {
    moduleId: 'expense_documents',
    rootTitle: 'هزینه‌ها',
    rootColorToken: 'system-expense',
    relatedAttachmentSources: [
      {
        moduleId: 'cash_bank_operations',
        foreignKey: 'expense_document_id',
        attachmentFieldKeys: ['attachment_url'],
      },
    ],
  },
  assets: {
    moduleId: 'assets',
    rootTitle: 'اموال',
    rootColorToken: 'system-finance',
  },
  employee_advances: {
    moduleId: 'employee_advances',
    rootTitle: 'مساعده‌ها',
    rootColorToken: 'system-finance',
    relatedAttachmentSources: [
      {
        moduleId: 'cash_bank_operations',
        foreignKey: 'employee_advance_id',
        attachmentFieldKeys: ['attachment_url'],
      },
    ],
  },
  payroll_slips: {
    moduleId: 'payroll_slips',
    rootTitle: 'فیش‌های حقوقی',
    rootColorToken: 'system-finance',
    relatedAttachmentSources: [
      {
        moduleId: 'cash_bank_operations',
        foreignKey: 'payroll_slip_id',
        attachmentFieldKeys: ['attachment_url'],
      },
    ],
  },
  tasks: {
    moduleId: 'tasks',
    rootTitle: 'وظایف',
    rootColorToken: 'system-task',
  },
  org_knowledge: {
    moduleId: 'org_knowledge',
    rootTitle: 'دانش سازمان',
    rootColorToken: DEFAULT_ROOT_COLOR_TOKEN,
  },
};

export const getFileSystemModuleDefinition = (moduleId?: string | null): FileSystemModuleDefinition => {
  const normalizedModuleId = String(moduleId || '').trim();
  const existing = FILE_SYSTEM_MODULE_DEFINITIONS[normalizedModuleId];
  if (existing) {
    return {
      ...existing,
      rootTitle: existing.rootTitle || MODULES[normalizedModuleId]?.titles?.fa || normalizedModuleId || 'فایل‌ها',
    };
  }
  return {
    moduleId: normalizedModuleId,
    rootTitle: MODULES[normalizedModuleId]?.titles?.fa || normalizedModuleId || 'فایل‌ها',
    rootColorToken: MODULE_ROOT_COLOR_TOKENS[normalizedModuleId] || DEFAULT_ROOT_COLOR_TOKEN,
  };
};
