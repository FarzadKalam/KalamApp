export type FileSystemSubfolderDefinition = {
  key: string;
  title: string;
  colorToken?: string;
  iconToken?: string;
};

export type FileSystemModuleDefinition = {
  moduleId: string;
  rootTitle: string;
  rootColorToken: string;
  recordSubfolders?: FileSystemSubfolderDefinition[];
};

const DEFAULT_RECORD_SUBFOLDER: FileSystemSubfolderDefinition = {
  key: 'attachments',
  title: 'پیوست‌ها',
  colorToken: 'manual-neutral',
  iconToken: 'paperclip',
};

export const FILE_SYSTEM_MODULE_DEFINITIONS: Record<string, FileSystemModuleDefinition> = {
  products: {
    moduleId: 'products',
    rootTitle: 'فایل‌های محصولات',
    rootColorToken: 'system-product',
    recordSubfolders: [
      { key: 'images', title: 'تصاویر محصول', colorToken: 'system-image', iconToken: 'image' },
      DEFAULT_RECORD_SUBFOLDER,
    ],
  },
  invoices: {
    moduleId: 'invoices',
    rootTitle: 'فاکتورهای فروش',
    rootColorToken: 'system-sales',
    recordSubfolders: [
      { key: 'invoice_media', title: 'تصاویر فاکتور', colorToken: 'system-image', iconToken: 'image' },
      { key: 'receipts', title: 'دریافت‌ها', colorToken: 'system-finance', iconToken: 'wallet' },
    ],
  },
  purchase_invoices: {
    moduleId: 'purchase_invoices',
    rootTitle: 'فاکتورهای خرید',
    rootColorToken: 'system-purchase',
    recordSubfolders: [
      { key: 'invoice_media', title: 'تصاویر فاکتور', colorToken: 'system-image', iconToken: 'image' },
      { key: 'payments', title: 'پرداخت‌ها', colorToken: 'system-finance', iconToken: 'wallet' },
    ],
  },
  expense_documents: {
    moduleId: 'expense_documents',
    rootTitle: 'هزینه‌ها',
    rootColorToken: 'system-expense',
    recordSubfolders: [
      { key: 'documents', title: 'اسناد', colorToken: 'system-doc', iconToken: 'file' },
      { key: 'payments', title: 'پرداخت‌ها', colorToken: 'system-finance', iconToken: 'wallet' },
    ],
  },
  tasks: {
    moduleId: 'tasks',
    rootTitle: 'وظایف',
    rootColorToken: 'system-task',
    recordSubfolders: [DEFAULT_RECORD_SUBFOLDER],
  },
};

export const getFileSystemModuleDefinition = (moduleId?: string | null): FileSystemModuleDefinition => {
  const normalizedModuleId = String(moduleId || '').trim();
  return FILE_SYSTEM_MODULE_DEFINITIONS[normalizedModuleId] || {
    moduleId: normalizedModuleId,
    rootTitle: normalizedModuleId ? `فایل‌های ${normalizedModuleId}` : 'فایل‌ها',
    rootColorToken: 'system-default',
    recordSubfolders: [DEFAULT_RECORD_SUBFOLDER],
  };
};
