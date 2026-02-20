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
  GRID_TABLE = 'grid_table'
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
  IS_FALSE = 'is_false'
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
  isTableColumn?: boolean;
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
  isCalculated?: boolean;
  relationConfig?: { targetModule: string; targetField?: string; filter?: Record<string, any>; dependsOn?: string; };  
  defaultValue?: any;
}

export interface BlockDefinition {
  id: string;
  type: BlockType;
  titles: { fa: string; en?: string };
  order: number;
  icon?: string;
  visibleIf?: any;
  readonly?: boolean;
  gridConfig?: {
    categories: Array<{ value: string; label: string; specBlockId: string }>;
  };
  tableColumns?: {
    key: string;
    title: string;
    type: FieldType;
    width?: number;
    showTotal?: boolean; // <--- این خط جدید است: برای نمایش جمع کل در پایین ستون
    relationConfig?: { targetModule: string; targetField: string; };
  rowCalculationType?: RowCalculationType;
  }[];
  // ویژگی اتصال به دیتای خارجی
  externalDataConfig?: {
    relationFieldKey: string;
    targetModule: string;
    targetColumn: string;
  };
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
    }
  };
}

export type RelatedTabRelationType = 'fk' | 'jsonb_contains' | 'join_table' | 'customer_products' | 'customer_payments' | 'product_customers';

export interface RelatedTabConfig {
  id: string;
  title: string;
  icon?: string;
  targetModule?: string;
  foreignKey?: string;
  relationType?: RelatedTabRelationType;
  jsonbColumn?: string;
  jsonbMatchKey?: string;
  joinTable?: string;
  joinSourceKey?: string;
  joinTargetKey?: string;
}

export interface ModuleDefinition {
  id: string;
  titles: { fa: string; en?: string };
  nature?: ModuleNature;
  table: string;
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
}

export interface SavedView {
  id: string;
  name: string;
  module_id: string;
  config: ViewConfig;
  is_default: boolean;
  created_at?: string;
}