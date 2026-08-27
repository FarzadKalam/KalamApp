// --- ENUMS ---

export enum ModuleNature {
  STANDARD = 'standard',       
  PRODUCT = 'product',         
  INVOICE = 'invoice',         
  MARKETING = 'marketing',     
  PRODUCTION = 'production',   
  WAREHOUSE = 'warehouse',
  CRM = 'crm',
  TASK = 'task',
  FINANCE = 'finance'
}

export enum RowCalculationType {
  SIMPLE_MULTIPLY = 'simple_multiply', // تعداد * قیمت (برای BOM)
  INVOICE_ROW = 'invoice_row',         // (تعداد * قیمت) - تخفیف + مالیات (برای فاکتور)
}

export enum SummaryCalculationType {
  SUM_ALL_ROWS = 'sum_all_rows',       // جمع ساده همه جداول (برای BOM)
  INVOICE_FINANCIALS = 'invoice_financials', // جمع کل، دریافتی، مانده (برای فاکتور)
}

export enum ViewMode {
  LIST = 'list',
  GRID = 'grid',
  MAP = 'map',
  KANBAN = 'kanban',
  TIMELINE = 'timeline',
  CALENDAR = 'calendar',
  GANTT = 'gantt'
}

export enum RelatedDisplayMode {
  CARD = 'card',      
  LIST = 'list',      
  KANBAN = 'kanban',  
  TIMELINE = 'timeline',
  GRID = 'grid'
}

export enum FieldType {
  TEXT = 'text',
  LONG_TEXT = 'long_text',
  SUPER_LONG_TEXT = 'superlongtext',
  NUMBER = 'number',
  PRICE = 'price',     
  PERCENTAGE = 'percentage', 
  CHECKBOX = 'checkbox',
  STOCK = 'stock',     
  IMAGE = 'image',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  CHECKLIST = 'checklist', 
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  LINK = 'link',
  LOCATION = 'location', 
  RELATION = 'relation',
  MULTI_RELATION = 'multi_relation',
  USER = 'user',
  STATUS = 'status',  
  PHONE = 'phone',
  JSON = 'json',
  TAGS = 'tags',
  PROGRESS_STAGES = 'progress_stages',
  PERCENTAGE_OR_AMOUNT = 'percentage_or_amount',
  READONLY_LOOKUP = 'readonly_lookup'
}

export enum FieldNature {
  PREDEFINED = 'predefined', 
  SYSTEM = 'system',         
  STANDARD = 'standard',     
}

export enum FieldLocation {
  HEADER = 'header',       
  BLOCK = 'block',         
  SYSTEM_FOOTER = 'footer' 
}

export enum BlockType {
  DEFAULT = 'default',
  FIELD_GROUP = 'field_group',
  TABLE = 'table',
  GRID_TABLE = 'grid_table',
  STAGES = 'stages'
}

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  WAREHOUSE = 'warehouse',
  PRODUCTION = 'production',
  VIEWER = 'viewer'
}

export enum LogicOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  CONTAINS = 'contains',
  IS_TRUE = 'is_true',
  IS_FALSE = 'is_false',
  IS_NOT_EMPTY = 'not_null',
  IN = 'in',
  NOT_IN = 'not_in',
}

export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  CONTAINS = 'ilike',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in', 
  IS_NULL = 'is',
}

// --- INTERFACES ---

export interface SelectOption {
  label: string;
  value: string | number;
  color?: string; 
  icon?: string;
  disabled?: boolean;
  insertAfter?: string;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string; 
  customMessage?: string;
}

export interface FieldAccess {
  viewRoles: UserRole[]; 
  editRoles: UserRole[]; 
}

export interface FieldLogic {
  defaultValue?: any;
  visibleIf?: {
    field: string;
    operator: LogicOperator;
    value?: any;
  };
  formula?: string; 
}

export interface ModuleField {
  key: string;
  type: FieldType;
  labels: { fa: string; en?: string };
  isActive?: boolean;
  isTableColumn?: boolean;
  hideInCreateForm?: boolean;
  botSettingsOnly?: boolean;
  virtualBotField?: boolean;
  options?: SelectOption[];
  
  // --- ویژگی اضافه شده برای رفع خطا ---
  dynamicOptionsCategory?: string; 
  mode?: 'multiple' | 'tags'; // حالت انتخاب: چندگانه یا با قابلیت افزودن
  
  validation?: FieldValidation;
  location?: FieldLocation | 'header' | 'block'; 
  nature?: FieldNature;
  blockId?: string;
  order?: number;
  icon?: string;
  isKey?: boolean;
  access?: FieldAccess;
  logic?: any; 
  readonly?: boolean;
  /** اجازه ثبت مقدار منفی و نرمال‌سازی علامت منفی در ورودی عددی */
  allowNegative?: boolean;
  isCalculated?: boolean;
  relationConfig?: {
    targetModule: string;
    targetField?: string;
    filter?: Record<string, any>;
    dependsOn?: string;
    disableImportAutoCreate?: boolean;
    chartScopeRootNames?: string[];
    requireLeaf?: boolean;
    requireDetail?: boolean;
    sourceModules?: Array<{
      targetModule: string;
      targetField?: string;
      filter?: Record<string, any>;
      tagLabel?: string;
      tagColor?: string;
      chartScopeRootNames?: string[];
      requireLeaf?: boolean;
      requireDetail?: boolean;
    }>;
    quickCreateFieldKeys?: string[];
    quickCreateDefaults?: Record<string, any>;
    populateFields?: Record<string, string>;
  };
  multiRelationConfig?: {
    targetModule: string;
    targetField?: string;
    filter?: Record<string, any>;
    dependsOn?: string;
    disableImportAutoCreate?: boolean;
    chartScopeRootNames?: string[];
    requireLeaf?: boolean;
    requireDetail?: boolean;
    sourceModules?: Array<{
      targetModule: string;
      targetField?: string;
      filter?: Record<string, any>;
      tagLabel?: string;
      tagColor?: string;
      chartScopeRootNames?: string[];
      requireLeaf?: boolean;
      requireDetail?: boolean;
    }>;
    quickCreateFieldKeys?: string[];
    quickCreateDefaults?: Record<string, any>;
    targetPhoneFields?: string[];
    populateFields?: Record<string, string>;
  };
  defaultValue?: any;
}

export interface BlockDefinition {
  id: string;
  type: BlockType;
  titles: { fa: string; en?: string };
  order: number;
  isActive?: boolean;
  printable?: boolean;
  icon?: string;
  visibleIf?: any;
  hideInCreateForm?: boolean;
  readonly?: boolean;
  gridConfig?: {
    categories: Array<{ value: string; label: string; specBlockId: string }>;
  };
  tableColumns?: {
    key: string;
    title: string;
    type: FieldType;
    width?: number;
    defaultValue?: any;
    showTotal?: boolean; // <--- این خط جدید است: برای نمایش جمع کل در پایین ستون
    options?: SelectOption[];
    readonly?: boolean;
      relationConfig?: {
        targetModule: string;
        targetField: string;
        filter?: Record<string, any>;
        disableImportAutoCreate?: boolean;
        chartScopeRootNames?: string[];
        requireLeaf?: boolean;
        requireDetail?: boolean;
        sourceModules?: Array<{
          targetModule: string;
          targetField?: string;
          filter?: Record<string, any>;
          tagLabel?: string;
          tagColor?: string;
          chartScopeRootNames?: string[];
          requireLeaf?: boolean;
          requireDetail?: boolean;
        }>;
        quickCreateFieldKeys?: string[];
        quickCreateDefaults?: Record<string, any>;
      };
  }[];
  rowCalculationType?: RowCalculationType;
  // ویژگی اتصال به دیتای خارجی
  externalDataConfig?: {
    relationFieldKey: string;
    targetModule: string;
    targetColumn: string;
  };
  /**
   * مقدار جدول در ستون JSON خود رکورد نگه‌داری نمی‌شود و نباید هنگام دریافت
   * رکورد، شناسهٔ بلاک به‌عنوان نام ستون دیتابیس درخواست شود.
   */
  storedInRecord?: boolean;
  populateConfig?: {
    relationFieldKey: string;
    targetModule: string;
    sourceColumn: string;
    columnMapping?: Record<string, string>;
  };

summaryConfig?: {
    calculationType: SummaryCalculationType; // 👈 نام فیلد calculationType است (با c کوچک)
    fieldMapping?: {
      total?: string;
      received?: string;
      remaining?: string;
    };
    labels?: {
      total?: string;
      received?: string;
      remaining?: string;
    };
  };
}

export type RelatedTabRelationType =
  | 'fk'
  | 'fk_from_field'
  | 'record_context'
  | 'phone_directory'
  | 'jsonb_contains'
  | 'join_table'
  | 'customer_products'
  | 'customer_payments'
  | 'customer_payments_from_field'
  | 'operational_financial_overview'
  | 'product_customers'
  | 'supplier_payments'
  | 'supplier_products';

export interface RelatedTabFilterConfig {
  field: string;
  value: any;
  operator?: 'eq' | 'neq' | 'in' | 'is';
}

export interface RelatedTabConfig {
  id: string;
  title: string;
  icon?: string;
  targetModule?: string;
  foreignKey?: string;
  sourceField?: string;
  relationType?: RelatedTabRelationType;
  jsonbColumn?: string;
  jsonbMatchKey?: string;
  joinTable?: string;
  joinSourceKey?: string;
  joinTargetKey?: string;
  filters?: RelatedTabFilterConfig[];
  disableCreate?: boolean;
}

export interface ModuleFormAdapterContext {
  mode: 'create' | 'update';
  recordId?: string;
  values: Record<string, any>;
  currentValues?: Record<string, any> | null;
  meta?: Record<string, any> | null;
}

export interface ModuleFormAdapterResult {
  id?: string | number | null;
}

export interface ModuleFormAdapter {
  save: (context: ModuleFormAdapterContext) => Promise<ModuleFormAdapterResult | void>;
}

export interface ModuleRecordAction {
  id: string;
  label: string;
  placement?: 'header';
  variant?: 'primary' | 'default';
  danger?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  visible?: (record: Record<string, any> | null | undefined) => boolean;
  /** اگر تعریف شود، به جای RPC مستقیم به این مسیر navigate می‌کند */
  navigateTo?: (record: Record<string, any>) => string;
}

export interface ModuleDefinition {
  id: string;
  titles: { fa: string; en?: string; faSingular?: string };
  nature?: ModuleNature;
  table: string;
  resource?: string;
  systemManaged?: boolean;
  /** کنترل نمایش entityهای پشتیبان در سطوح مرکزی؛ مقدار پیش‌فرض هر سطح true است. */
  registryVisibility?: {
    globalSearch?: boolean;
    moduleSettings?: boolean;
    reports?: boolean;
    workflows?: boolean;
  };
  disableCreate?: boolean;
  disableDetailView?: boolean;
  disableInlineFieldEditing?: boolean;
  hideFullRecordAction?: boolean;
  listPreviewMode?: 'modal';
  listDetailSurface?: 'saas_user_drawer';
  quickPreview?: {
    fieldKeys?: string[];
    editableFields?: string[];
    relatedModuleOptions?: string[];
    audioField?: string;
  };
  defaultSorters?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;
  dashboard?: {
    quickCreateLabel?: string;
    recentListFields?: string[];
    summaryCard?: {
      preset:
        | 'tasks_pending_mine'
        | 'invoices_total_amount_mine'
        | 'customers_new_mine'
        | 'projects_in_progress'
        | 'billboards_opening'
        | 'products_total';
      title?: string;
    };
  };
  /** تنظیمات خلاصه‌نمایی رکورد در تقویم ماژول و داشبورد */
  calendar?: {
    /** فیلدهایی که زیر عنوان هر رکورد، به ترتیب، نمایش داده می‌شوند. */
    summaryFieldKeys?: string[];
  };
  relationDisplay?: {
    labelTemplate?: string;
    searchFields?: string[];
  };
  fields: ModuleField[];
  blocks: BlockDefinition[];
  supportedViewModes?: ViewMode[];
  defaultViewMode?: ViewMode;
  relatedTabs?: RelatedTabConfig[];
  actionButtons?: {
    id: string;
    label: string;
    placement: 'form' | 'header';
    variant?: 'primary' | 'default';
  }[];
  formAdapter?: ModuleFormAdapter;
  recordActions?: ModuleRecordAction[];
  permanentFilters?: Array<{ field: string; operator: string; value: any }>;
}

// --- VIEW & FILTER INTERFACES ---

export interface FilterItem {
  id: string;
  field: string;
  operator: string;
  value: any;
}

export interface ViewConfig {
  columns: string[];
  filters: FilterItem[];
  sort?: { field: string; order: 'asc' | 'desc' }[];
  access?: {
    type: 'all' | 'specific';
    userIds?: string[];
    roleIds?: string[];
  };
}

export interface SavedView {
  id: string;
  name: string;
  module_id: string;
  config: ViewConfig;
  is_default: boolean;
  created_at?: string;
}
