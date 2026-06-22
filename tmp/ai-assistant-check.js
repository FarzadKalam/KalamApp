// supabase/functions/ai-assistant/index.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var FUNCTION_BUILD = "ai-assistant-2026-06-18-04";
var DEFAULT_AI_BASE_URL = "https://api.avalai.ir/v1";
var DEFAULT_AI_FALLBACK_BASE_URL = "https://api.avalapis.ir/v1";
var DEFAULT_AI_MODEL = "";
var DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
var PROVIDER_REQUEST_TIMEOUT_MS = 45e3;
var IMAGE_PROVIDER_TIMEOUT_MS = 35e3;
var LONG_MEDIA_PROVIDER_TIMEOUT_MS = 45e3;
var IMAGE_STATUS_STALE_MS = 18e4;
var IMAGE_PROMPT_MAX_CHARS = 4e3;
var DEFAULT_AI_MARGIN_PERCENT = 30;
var DEFAULT_AI_EXCHANGE_RATE_IRT = 115e3;
var AI_AUTHOR_NAME = "\u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634\u0645\u0646\u062F";
var MAX_PAGE_CONTEXT_RECORDS = 10;
var MAX_RETRIEVED_CONTEXTS = 4;
var KNOWLEDGE_MATCH_THRESHOLD = 0.52;
var AI_CAPABILITY_FEATURE_KEYS = {
  dashboard_chat: "ai_chat",
  record_chat: "ai_chat",
  customer_reply_suggestion: "ai_chat",
  document_analysis: "ai_document_analysis",
  workflow_ai_prompt: "ai_chat",
  deep_reasoning: "ai_deep_reasoning",
  legal_assistant: "ai_legal_assistant",
  web_search: "ai_web_search",
  embedding: "ai_document_analysis",
  voice_input: "ai_voice_input",
  image_generation: "ai_image_generation",
  voice_output: "ai_voice_output",
  video_generation: "ai_video_generation",
  document_generation: "ai_document_analysis",
  voip_auto_reply: "ai_voip_auto_reply"
};
var TENANT_READY_AI_CAPABILITIES = /* @__PURE__ */ new Set([
  "dashboard_chat",
  "record_chat",
  "customer_reply_suggestion",
  "document_analysis",
  "workflow_ai_prompt",
  "deep_reasoning",
  "legal_assistant",
  "web_search",
  "embedding",
  "voice_input",
  "voice_output",
  "image_generation",
  "video_generation",
  "document_generation"
]);
var ALLOWED_MODULES = /* @__PURE__ */ new Set([
  "productBundles",
  "purchaseInvoices",
  "priceLists",
  "marketingLeads",
  "deliveryForms",
  "salesCatalog",
  "stockTransfers",
  "productionBOM",
  "productionOrders",
  "productionGroupOrders",
  "fiscalYears",
  "chartOfAccounts",
  "journalEntries",
  "accountingEventRules",
  "costCenters",
  "cashBoxes",
  "bankAccounts",
  "pettyFunds",
  "cashBankOperations",
  "expenseDocuments",
  "attendanceLogs",
  "workSchedules",
  "leaveRequests",
  "overtimeRequests",
  "missionRequests",
  "employeeAdvances",
  "employeeBonusRequests",
  "employeePenaltyRequests",
  "employeeContracts",
  "payrollSlips",
  "recruitmentApplicants",
  "processTemplates",
  "processRuns",
  "webForms",
  "secretariatDocuments",
  "products",
  "billboards",
  "product_bundles",
  "warehouses",
  "shelves",
  "stock_transfers",
  "production_boms",
  "production_orders",
  "production_group_orders",
  "customers",
  "suppliers",
  "invoices",
  "purchase_invoices",
  "projects",
  "marketing_leads",
  "process_templates",
  "process_runs",
  "tasks",
  "calculation_formulas",
  "fiscal_years",
  "chart_of_accounts",
  "journal_entries",
  "accounting_event_rules",
  "cost_centers",
  "cash_boxes",
  "bank_accounts",
  "petty_funds",
  "cheques",
  "barters",
  "cash_bank_operations",
  "employees",
  "attendance_logs",
  "work_schedules",
  "leave_requests",
  "overtime_requests",
  "mission_requests",
  "price_lists",
  "web_forms",
  "warehouses",
  "shelves",
  "stock_transfers",
  "cost_centers",
  "cash_boxes",
  "bank_accounts",
  "fiscal_years",
  "expense_documents",
  "employee_advances"
]);
var MODULE_TABLE_MAP = {
  productBundles: "product_bundles",
  purchaseInvoices: "purchase_invoices",
  priceLists: "price_lists",
  marketingLeads: "marketing_leads",
  deliveryForms: "delivery_forms",
  salesCatalog: "sales_catalog",
  stockTransfers: "stock_transfers",
  productionBOM: "production_bom",
  productionOrders: "production_orders",
  productionGroupOrders: "production_group_orders",
  fiscalYears: "fiscal_years",
  chartOfAccounts: "chart_of_accounts",
  journalEntries: "journal_entries",
  accountingEventRules: "accounting_event_rules",
  costCenters: "cost_centers",
  cashBoxes: "cash_boxes",
  bankAccounts: "bank_accounts",
  pettyFunds: "petty_funds",
  cashBankOperations: "cash_bank_operations",
  expenseDocuments: "expense_documents",
  attendanceLogs: "attendance_logs",
  workSchedules: "work_schedules",
  leaveRequests: "leave_requests",
  overtimeRequests: "overtime_requests",
  missionRequests: "mission_requests",
  employeeAdvances: "employee_advances",
  employeeBonusRequests: "employee_bonus_requests",
  employeePenaltyRequests: "employee_penalty_requests",
  employeeContracts: "employee_contracts",
  payrollSlips: "payroll_slips",
  recruitmentApplicants: "recruitment_applicants",
  processTemplates: "process_templates",
  processRuns: "process_runs",
  webForms: "web_forms",
  secretariatDocuments: "secretariat_documents",
  product_bundles: "product_bundles",
  purchase_invoices: "purchase_invoices",
  marketing_leads: "marketing_leads",
  cash_bank_operations: "cash_bank_operations",
  expense_documents: "expense_documents",
  employee_advances: "employee_advances",
  leave_requests: "leave_requests",
  overtime_requests: "overtime_requests",
  mission_requests: "mission_requests",
  process_runs: "process_runs"
};
var getModuleTable = (moduleId) => MODULE_TABLE_MAP[String(moduleId || "").trim()] || String(moduleId || "").trim();
var MODULE_ALIASES = {
  customers: ["\u0645\u0634\u062A\u0631\u06CC", "\u0645\u0634\u062A\u0631\u06CC\u0627\u0646", "customer", "customers", "\u062E\u0631\u06CC\u062F\u0627\u0631", "\u06A9\u0627\u0631\u0641\u0631\u0645\u0627", "\u0645\u0634\u062A\u0631\u06CC\u0645", "\u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646", "\u0637\u0631\u0641 \u062D\u0633\u0627\u0628"],
  suppliers: ["\u062A\u0627\u0645\u06CC\u0646 \u06A9\u0646\u0646\u062F\u0647", "\u062A\u0627\u0645\u06CC\u0646\u200C\u06A9\u0646\u0646\u062F\u0647", "\u062A\u0627\u0645\u06CC\u0646 \u06A9\u0646\u0646\u062F\u06AF\u0627\u0646", "supplier", "suppliers", "\u0641\u0631\u0648\u0634\u0646\u062F\u0647", "\u062A\u0623\u0645\u06CC\u0646", "\u067E\u06CC\u0645\u0627\u0646\u06A9\u0627\u0631"],
  invoices: [
    "\u0641\u0627\u06A9\u062A\u0648\u0631 \u0641\u0631\u0648\u0634",
    "\u0641\u0627\u06A9\u062A\u0648\u0631",
    "\u0635\u0648\u0631\u062A\u062D\u0633\u0627\u0628",
    "invoice",
    "invoices",
    "\u0641\u0631\u0648\u0634",
    "\u0641\u0631\u0648\u0634\u0645",
    "\u0641\u0631\u0648\u0634\u200C\u0647\u0627",
    "\u062F\u0631\u0622\u0645\u062F",
    "\u062F\u0631\u0622\u0645\u062F\u0645",
    "revenue",
    "sales",
    "\u0641\u0631\u0648\u062E\u062A\u0647",
    "\u0641\u0631\u0648\u062E\u062A\u06CC\u0645",
    "\u062B\u0628\u062A \u0641\u0631\u0648\u0634"
  ],
  purchase_invoices: [
    "\u0641\u0627\u06A9\u062A\u0648\u0631 \u062E\u0631\u06CC\u062F",
    "\u062E\u0631\u06CC\u062F",
    "purchase invoice",
    "purchase",
    "\u0647\u0632\u06CC\u0646\u0647 \u062E\u0631\u06CC\u062F",
    "\u062E\u0631\u06CC\u062F\u0647\u0627",
    "\u062E\u0631\u06CC\u062F\u0645",
    "\u0645\u062E\u0627\u0631\u062C",
    "cost of purchase"
  ],
  price_lists: ["\u0644\u06CC\u0633\u062A \u0642\u06CC\u0645\u062A", "\u0644\u06CC\u0633\u062A \u0642\u06CC\u0645\u062A\u200C\u0647\u0627", "\u0642\u06CC\u0645\u062A", "price list", "price lists", "pricing", "\u0646\u0631\u062E"],
  product_bundles: ["\u067E\u06A9\u06CC\u062C", "\u067E\u06A9\u06CC\u062C\u200C\u0647\u0627", "\u0628\u0627\u0646\u062F\u0644", "bundle", "bundles", "package", "packages"],
  cash_bank_operations: [
    "\u067E\u0631\u062F\u0627\u062E\u062A",
    "\u067E\u0631\u062F\u0627\u062E\u062A\u06CC",
    "\u062F\u0631\u06CC\u0627\u0641\u062A",
    "\u062F\u0631\u06CC\u0627\u0641\u062A\u06CC",
    "\u0646\u0642\u062F",
    "\u0628\u0627\u0646\u06A9",
    "cash",
    "bank",
    "payment",
    "receipt",
    "\u0645\u0648\u062C\u0648\u062F\u06CC",
    "\u062D\u0633\u0627\u0628 \u0628\u0627\u0646\u06A9\u06CC",
    "\u062A\u0631\u0627\u06A9\u0646\u0634",
    "\u0648\u0627\u0631\u06CC\u0632",
    "\u0628\u0631\u062F\u0627\u0634\u062A"
  ],
  petty_funds: ["\u062A\u0646\u062E\u0648\u0627\u0647", "\u062A\u0646\u062E\u0648\u0627\u0647 \u06AF\u0631\u062F\u0627\u0646", "petty", "petty fund"],
  products: ["\u0645\u062D\u0635\u0648\u0644", "\u0645\u062D\u0635\u0648\u0644\u0627\u062A", "\u06A9\u0627\u0644\u0627", "product", "products", "\u0627\u0642\u0644\u0627\u0645", "\u06A9\u0627\u0644\u0627\u0647\u0627", "\u062C\u0646\u0633", "\u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u0627\u0644\u0627"],
  projects: ["\u067E\u0631\u0648\u0698\u0647", "\u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627", "project", "projects", "\u067E\u0631\u0648\u0698\u0647\u200C\u0627\u0645", "\u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627\u0645"],
  tasks: ["\u0641\u0639\u0627\u0644\u06CC\u062A", "\u06A9\u0627\u0631", "\u0648\u0638\u06CC\u0641\u0647", "task", "tasks", "\u06CC\u0627\u062F\u0622\u0648\u0631\u06CC", "\u06A9\u0627\u0631\u0647\u0627", "\u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627", "\u062A\u0633\u06A9"],
  process_runs: ["\u0641\u0631\u0622\u06CC\u0646\u062F", "\u0641\u0631\u0627\u06CC\u0646\u062F", "\u0645\u0631\u0627\u062D\u0644", "\u0645\u0631\u062D\u0644\u0647", "process", "workflow", "\u06AF\u0631\u062F\u0634 \u06A9\u0627\u0631"],
  marketing_leads: ["\u0633\u0631\u0646\u062E", "\u0644\u06CC\u062F", "lead", "leads", "\u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC", "\u0641\u0631\u0635\u062A \u0641\u0631\u0648\u0634", "\u0645\u0634\u062A\u0631\u06CC \u0628\u0627\u0644\u0642\u0648\u0647"],
  cheques: ["\u0686\u06A9", "cheque", "check", "\u0686\u06A9\u200C\u0647\u0627", "\u0627\u0633\u0646\u0627\u062F"],
  barters: ["\u062A\u0647\u0627\u062A\u0631", "barter"],
  employees: ["\u06A9\u0627\u0631\u0645\u0646\u062F", "\u06A9\u0627\u0631\u06A9\u0646\u0627\u0646", "\u0645\u0646\u0627\u0628\u0639 \u0627\u0646\u0633\u0627\u0646\u06CC", "employee", "employees", "\u067E\u0631\u0633\u0646\u0644", "\u0646\u06CC\u0631\u0648\u06CC \u0627\u0646\u0633\u0627\u0646\u06CC", "\u0646\u06CC\u0631\u0648", "\u06A9\u0627\u0631\u0645\u0646\u062F\u0645"],
  journal_entries: ["\u0633\u0646\u062F \u062D\u0633\u0627\u0628\u062F\u0627\u0631\u06CC", "journal", "journal entry", "\u0627\u0633\u0646\u0627\u062F \u062D\u0633\u0627\u0628\u062F\u0627\u0631\u06CC", "\u0633\u0646\u062F \u0645\u0627\u0644\u06CC"],
  // Warehouse / inventory
  warehouses: ["\u0627\u0646\u0628\u0627\u0631", "\u0627\u0646\u0628\u0627\u0631\u0647\u0627", "warehouse", "warehouses", "\u0645\u0648\u062C\u0648\u062F\u06CC \u0627\u0646\u0628\u0627\u0631", "\u0627\u0646\u0628\u0627\u0631\u0645"],
  stock_transfers: ["\u0627\u0646\u062A\u0642\u0627\u0644 \u0627\u0646\u0628\u0627\u0631", "\u062D\u0648\u0627\u0644\u0647 \u0627\u0646\u0628\u0627\u0631", "\u0627\u0646\u062A\u0642\u0627\u0644 \u06A9\u0627\u0644\u0627", "stock transfer", "\u062D\u0648\u0627\u0644\u0647"],
  // Accounting
  cost_centers: ["\u0645\u0631\u06A9\u0632 \u0647\u0632\u06CC\u0646\u0647", "\u0645\u0631\u0627\u06A9\u0632 \u0647\u0632\u06CC\u0646\u0647", "cost center", "\u0633\u0631\u0641\u0635\u0644 \u0647\u0632\u06CC\u0646\u0647"],
  cash_boxes: ["\u0635\u0646\u062F\u0648\u0642", "\u0635\u0646\u062F\u0648\u0642 \u0646\u0642\u062F", "cash box", "cashbox"],
  bank_accounts: ["\u062D\u0633\u0627\u0628 \u0628\u0627\u0646\u06A9\u06CC", "\u062D\u0633\u0627\u0628\u200C\u0647\u0627\u06CC \u0628\u0627\u0646\u06A9\u06CC", "bank account", "\u0628\u0627\u0646\u06A9\u200C\u0647\u0627", "\u0634\u0645\u0627\u0631\u0647 \u062D\u0633\u0627\u0628"],
  fiscal_years: ["\u0633\u0627\u0644 \u0645\u0627\u0644\u06CC", "\u0633\u0627\u0644\u200C\u0647\u0627\u06CC \u0645\u0627\u0644\u06CC", "fiscal year", "\u062F\u0648\u0631\u0647 \u0645\u0627\u0644\u06CC"],
  // HR
  attendance_logs: ["\u062D\u0636\u0648\u0631 \u063A\u06CC\u0627\u0628", "\u06A9\u0627\u0631\u06A9\u0631\u062F", "\u0648\u0631\u0648\u062F \u062E\u0631\u0648\u062C", "\u062D\u0636\u0648\u0631", "\u063A\u06CC\u0627\u0628", "attendance"],
  leave_requests: ["\u0645\u0631\u062E\u0635\u06CC", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0631\u062E\u0635\u06CC", "leave", "\u0645\u0631\u062E\u0635\u06CC\u200C\u0647\u0627"],
  work_schedules: ["\u0634\u06CC\u0641\u062A \u06A9\u0627\u0631\u06CC", "\u0628\u0631\u0646\u0627\u0645\u0647 \u06A9\u0627\u0631\u06CC", "\u0633\u0627\u0639\u062A \u06A9\u0627\u0631\u06CC", "work schedule", "\u0634\u06CC\u0641\u062A"],
  overtime_requests: ["\u0627\u0636\u0627\u0641\u0647\u200C\u06A9\u0627\u0631\u06CC", "\u0627\u0636\u0627\u0641\u0647 \u06A9\u0627\u0631\u06CC", "overtime", "\u0627\u0636\u0627\u0641\u0647 \u0648\u0642\u062A"],
  mission_requests: ["\u0645\u0623\u0645\u0648\u0631\u06CC\u062A", "\u0645\u0627\u0645\u0648\u0631\u06CC\u062A", "mission", "\u0645\u0623\u0645\u0648\u0631\u06CC\u062A\u200C\u0647\u0627"],
  // Recruitment
  recruitmentApplicants: ["\u0645\u062A\u0642\u0627\u0636\u06CC", "\u0627\u0633\u062A\u062E\u062F\u0627\u0645", "recruit", "applicant", "\u062C\u0630\u0628 \u0646\u06CC\u0631\u0648", "\u06A9\u0627\u0631\u06CC\u0627\u0628\u06CC"]
};
var MODULE_SEARCH_FIELDS = {
  customers: ["full_name", "business_name", "name", "mobile_1", "mobile", "phone", "system_code"],
  suppliers: ["full_name", "business_name", "name", "mobile_1", "mobile", "phone", "system_code"],
  invoices: ["name", "system_code", "invoice_number", "description"],
  purchase_invoices: ["name", "system_code", "invoice_number", "description"],
  products: ["name", "title", "sku", "system_code", "description"],
  projects: ["name", "title", "system_code", "description"],
  tasks: ["name", "title", "description", "system_code"],
  process_runs: ["name", "title", "system_code", "description"],
  marketing_leads: ["full_name", "business_name", "name", "mobile_1", "mobile", "phone", "system_code"],
  cash_bank_operations: ["name", "description", "system_code", "tracking_code"],
  cheques: ["name", "description", "system_code", "cheque_number"],
  barters: ["name", "description", "system_code"],
  employees: ["full_name", "name", "mobile_1", "mobile", "employee_code"],
  price_lists: ["name", "title", "description", "system_code"],
  product_bundles: ["name", "title", "description", "system_code"],
  warehouses: ["name", "title", "system_code", "description"],
  shelves: ["name", "title", "system_code"],
  stock_transfers: ["name", "system_code", "description"],
  cost_centers: ["name", "title", "system_code", "description"],
  cash_boxes: ["name", "title", "system_code"],
  bank_accounts: ["name", "title", "account_number", "system_code"],
  fiscal_years: ["name", "title", "system_code"],
  leave_requests: ["name", "system_code", "description"],
  work_schedules: ["name", "title", "system_code"],
  overtime_requests: ["name", "system_code", "description"],
  mission_requests: ["name", "system_code", "description"]
};
var QUERY_STOP_WORDS = /* @__PURE__ */ new Set([
  // Persian question / filler words
  "\u0627\u06CC\u0646",
  "\u0627\u0648\u0646",
  "\u0627\u06CC\u0646\u0627",
  "\u0627\u0648\u0646\u0627",
  "\u0628\u0631\u0627\u06CC",
  "\u062F\u0631\u0628\u0627\u0631\u0647",
  "\u0631\u0627\u062C\u0639",
  "\u0631\u0627\u062C\u0628",
  "\u0686\u06CC",
  "\u0686\u06CC\u0647",
  "\u0686\u0637\u0648\u0631",
  "\u0686\u06AF\u0648\u0646\u0647",
  "\u0686\u0631\u0627",
  "\u0686\u0647",
  "\u0686\u0646\u062F",
  "\u0686\u0642\u062F\u0631",
  "\u06A9\u062F\u0627\u0645",
  "\u06A9\u062F\u0648\u0645",
  "\u0645\u0648\u0631\u062F",
  "\u0647\u0627\u06CC",
  "\u0647\u0627",
  "\u0645\u0646",
  "\u062A\u0648",
  "\u0634\u0645\u0627",
  "\u0645\u0627",
  "\u0647\u0633\u062A",
  "\u0627\u0633\u062A",
  "\u0628\u0648\u062F",
  "\u0628\u0648\u062F\u0647",
  "\u0628\u0648\u062F\u06CC\u0645",
  "\u0634\u062F\u0647",
  "\u0634\u062F",
  "\u0647\u0633\u062A\u0646\u062F",
  "\u062F\u0627\u0631\u06CC",
  "\u062F\u0627\u0631\u0645",
  "\u062F\u0627\u0631\u06CC\u0645",
  "\u062F\u0627\u0631\u0647",
  "\u062F\u0627\u0631\u0646\u062F",
  "\u06A9\u0646",
  "\u06A9\u0631\u062F",
  "\u06A9\u0631\u062F\u06CC\u0645",
  "\u06A9\u0646\u06CC\u062F",
  "\u06A9\u0646\u0645",
  "\u0628\u062F\u0647",
  "\u0628\u06AF\u0648",
  "\u0646\u0634\u0648\u0646",
  "\u0628\u06CC\u0627\u0631",
  "\u0628\u0631\u06CC\u0645",
  // Time words (common in analytical questions)
  "\u0645\u0627\u0647",
  "\u0647\u0641\u062A\u0647",
  "\u0631\u0648\u0632",
  "\u0633\u0627\u0644",
  "\u0627\u0645\u0631\u0648\u0632",
  "\u062F\u06CC\u0631\u0648\u0632",
  "\u0627\u0645\u0633\u0627\u0644",
  "\u067E\u0627\u0631\u0633\u0627\u0644",
  "\u062C\u0627\u0631\u06CC",
  "\u06AF\u0630\u0634\u062A\u0647",
  "\u0641\u0639\u0644\u06CC",
  "\u0627\u062E\u06CC\u0631",
  "\u0622\u062E\u0631\u06CC\u0646",
  "\u0627\u062E\u06CC\u0631\u0627\u064B",
  "\u0627\u0648\u0644",
  "\u0622\u062E\u0631",
  "\u0634\u0631\u0648\u0639",
  "\u067E\u0627\u06CC\u0627\u0646",
  // English fillers
  "the",
  "and",
  "with",
  "about",
  "what",
  "who",
  "how",
  "when",
  "where",
  "is",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  // Module names (already covered by alias filter, belt-and-suspenders)
  "customer",
  "customers",
  "invoice",
  "invoices",
  "product",
  "products",
  "project",
  "projects",
  "\u0645\u0634\u062A\u0631\u06CC",
  "\u0645\u0634\u062A\u0631\u06CC\u0627\u0646",
  "\u0641\u0627\u06A9\u062A\u0648\u0631",
  "\u0645\u062D\u0635\u0648\u0644",
  "\u0645\u062D\u0635\u0648\u0644\u0627\u062A",
  "\u067E\u0631\u0648\u0698\u0647",
  "\u067E\u0631\u062F\u0627\u062E\u062A",
  "\u062F\u0631\u06CC\u0627\u0641\u062A"
]);
var MANAGEMENT_DIRECTORY_KEYWORDS = [
  "\u0645\u062F\u06CC\u0631",
  "\u0633\u0631\u067E\u0631\u0633\u062A",
  "\u0631\u0626\u06CC\u0633",
  "\u0645\u0633\u0626\u0648\u0644",
  "lead",
  "manager",
  "supervisor",
  "head",
  "director",
  "chief",
  "owner",
  "ceo"
];
var SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /passcode/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /private[_-]?key/i,
  /refresh[_-]?token/i
];
var json = (status, payload) => new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
    "X-Kalam-Function-Build": FUNCTION_BUILD
  }
});
var readJsonBody = async (req) => {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A JSON \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
};
var parseJsonSafe = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
};
var normalizeBaseUrl = (value) => {
  const raw = String(value || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_AI_BASE_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};
var normalizeBaseUrlList = (value, fallback = "") => String(value || fallback || "").split(",").map((item) => item.trim()).filter(Boolean).map(normalizeBaseUrl);
var uniqueBaseUrls = (...groups) => {
  const seen = /* @__PURE__ */ new Set();
  const urls = [];
  groups.flat().forEach((url) => {
    const normalized = normalizeBaseUrl(url);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    urls.push(normalized);
  });
  return urls;
};
var getEnvProviderConfig = () => ({
  provider: String(Deno.env.get("AI_PROVIDER") || Deno.env.get("AVALAI_PROVIDER") || "avalai").trim() || "avalai",
  baseUrl: normalizeBaseUrl(Deno.env.get("AI_BASE_URL") || Deno.env.get("AVALAI_BASE_URL") || DEFAULT_AI_BASE_URL),
  fallbackBaseUrls: normalizeBaseUrlList(
    Deno.env.get("AI_FALLBACK_BASE_URLS") || Deno.env.get("AVALAI_FALLBACK_BASE_URLS") || Deno.env.get("AVALAI_FALLBACK_BASE_URL"),
    DEFAULT_AI_FALLBACK_BASE_URL
  ),
  model: String(Deno.env.get("AI_MODEL") || Deno.env.get("AVALAI_MODEL") || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
  apiKey: String(Deno.env.get("AI_API_KEY") || Deno.env.get("AVALAI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "").trim(),
  isActive: true,
  source: "env"
});
var isRetryableProviderStatus = (status) => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
var isProviderTimeoutError = (error) => {
  const text = `${String(error?.name || "")} ${String(error?.message || error || "")}`;
  return /abort|timeout|timed out|upstream server is timing out|request has been cancelled/i.test(text);
};
var requestAvalaiWithFallback = async (providerConfig, path, init, options) => {
  const baseUrls = options?.disableFallback ? [providerConfig?.baseUrl || DEFAULT_AI_BASE_URL] : uniqueBaseUrls(
    [providerConfig?.baseUrl || DEFAULT_AI_BASE_URL],
    Array.isArray(providerConfig?.fallbackBaseUrls) ? providerConfig.fallbackBaseUrls : []
  );
  let lastError = null;
  for (const baseUrl of baseUrls) {
    const base = options?.stripVersionForPath ? normalizeBaseUrl(baseUrl).replace(/\/v\d+$/i, "") : normalizeBaseUrl(baseUrl);
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    try {
      const response = await fetch(url, init);
      if (response.ok || !isRetryableProviderStatus(response.status) || baseUrl === baseUrls[baseUrls.length - 1]) {
        return { response, baseUrl };
      }
      lastError = new Error(`AvalAI retryable status ${response.status} from ${baseUrl}`);
    } catch (error) {
      lastError = error;
      if (isProviderTimeoutError(error)) {
        throw new Error("\u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u0632\u0645\u0627\u0646 \u0645\u0646\u0627\u0633\u0628 \u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F. \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u062A\u0648\u0642\u0641 \u0634\u062F \u062A\u0627 \u0633\u0631\u0648\u0631 \u062F\u0686\u0627\u0631 timeout \u0646\u0634\u0648\u062F\u061B \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0645\u062F\u0644 \u0633\u0631\u06CC\u0639\u200C\u062A\u0631\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
      }
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }
  throw lastError || new Error("\u0627\u062A\u0635\u0627\u0644 \u0628\u0647 AvalAI \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F.");
};
var getServiceHeaders = (serviceRoleKey, preferRepresentation = false) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  ...preferRepresentation ? { Prefer: "return=representation" } : {}
});
var restUrl = (supabaseUrl, table, params) => {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== void 0) url.searchParams.set(key, String(value));
  });
  return url.toString();
};
var restSelect = async (supabaseUrl, serviceRoleKey, table, params) => {
  const response = await fetch(restUrl(supabaseUrl, table, params), {
    method: "GET",
    headers: getServiceHeaders(serviceRoleKey)
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};
var safeRestSelect = async (supabaseUrl, serviceRoleKey, table, params) => {
  try {
    return await restSelect(supabaseUrl, serviceRoleKey, table, params);
  } catch {
    return [];
  }
};
var restInsert = async (supabaseUrl, serviceRoleKey, table, rows) => {
  const response = await fetch(restUrl(supabaseUrl, table, { select: "*" }), {
    method: "POST",
    headers: getServiceHeaders(serviceRoleKey, true),
    body: JSON.stringify(rows)
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};
var restUpsert = async (supabaseUrl, serviceRoleKey, table, rows, onConflict) => {
  const response = await fetch(restUrl(supabaseUrl, table, { select: "*", on_conflict: onConflict }), {
    method: "POST",
    headers: {
      ...getServiceHeaders(serviceRoleKey, true),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};
var restPatch = async (supabaseUrl, serviceRoleKey, table, filters, payload) => {
  const response = await fetch(restUrl(supabaseUrl, table, { ...filters, select: "*" }), {
    method: "PATCH",
    headers: getServiceHeaders(serviceRoleKey, true),
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed || {}));
  }
  return Array.isArray(parsed) ? parsed : [];
};
var restRpc = async (supabaseUrl, serviceRoleKey, fnName, payload) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: getServiceHeaders(serviceRoleKey),
    body: JSON.stringify(payload || {})
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed || {}));
  }
  return parsed;
};
var verifyUserToken = async (supabaseUrl, serviceRoleKey, userToken) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`
    }
  });
  if (!response.ok) {
    throw new Error("\u0646\u0634\u0633\u062A \u0634\u0645\u0627 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0634\u0648\u06CC\u062F.");
  }
  const user = await response.json();
  if (!user?.id) throw new Error("\u0646\u0634\u0633\u062A \u0634\u0645\u0627 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0634\u0648\u06CC\u062F.");
  return user;
};
var normalizeId = (value) => String(value || "").trim();
var isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
var getResolvedAssigneeId = (source) => {
  if (!source || typeof source !== "object") return "";
  const normalizedType = String(source?.assignee_type || "").trim().toLowerCase();
  const prefersRoleAssignee = normalizedType === "role" || !normalizedType && source?.assignee_role_id;
  const rawValue = prefersRoleAssignee ? source?.assignee_role_id ?? source?.assignee_id : source?.assignee_id;
  return normalizeId(rawValue);
};
var computeDescendantRoleIds = (roleId, roles) => {
  const rootId = normalizeId(roleId);
  if (!rootId) return /* @__PURE__ */ new Set();
  const childrenByParent = /* @__PURE__ */ new Map();
  (roles || []).forEach((role) => {
    const id = normalizeId(role?.id);
    const parentId = normalizeId(role?.parent_id);
    if (!id || !parentId) return;
    const next = childrenByParent.get(parentId) || [];
    next.push(id);
    childrenByParent.set(parentId, next);
  });
  const result = /* @__PURE__ */ new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    (childrenByParent.get(current) || []).forEach((childId) => {
      if (result.has(childId)) return;
      result.add(childId);
      stack.push(childId);
    });
  }
  return result;
};
var buildRolePath = (roleId, roles) => {
  const byId = new Map((roles || []).map((role) => [String(role?.id || ""), role]));
  const path = [];
  const seen = /* @__PURE__ */ new Set();
  let cursor = normalizeId(roleId);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const role = byId.get(cursor);
    if (!role) break;
    path.push({ id: role.id, title: role.title || role.name || role.id, parent_id: role.parent_id || null });
    cursor = normalizeId(role.parent_id);
  }
  return path.reverse();
};
var loadUserContext = async (supabaseUrl, serviceRoleKey, user) => {
  const profiles = await restSelect(supabaseUrl, serviceRoleKey, "profiles", {
    id: `eq.${user.id}`,
    select: "id,org_id,role_id,full_name,email,mobile_1,mobile,job_title,position,team",
    limit: 1
  });
  const profile = profiles[0];
  if (!profile?.id) throw new Error("\u067E\u0631\u0648\u0641\u0627\u06CC\u0644 \u06A9\u0627\u0631\u0628\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  let allowedRoleIds = /* @__PURE__ */ new Set();
  let allowedUserIds = /* @__PURE__ */ new Set();
  const orgId = normalizeId(profile.org_id);
  const allRoles = orgId ? await safeRestSelect(supabaseUrl, serviceRoleKey, "org_roles", {
    org_id: `eq.${orgId}`,
    select: "id,org_id,title,permissions,parent_id",
    limit: 1e3
  }) : [];
  const role = allRoles.find((item) => normalizeId(item?.id) === normalizeId(profile.role_id)) || null;
  if (orgId && profile.role_id) {
    allowedRoleIds = computeDescendantRoleIds(profile.role_id, allRoles);
    const roleIdList = Array.from(allowedRoleIds).filter(isUuid);
    if (roleIdList.length > 0) {
      const users = await safeRestSelect(supabaseUrl, serviceRoleKey, "profiles", {
        org_id: `eq.${orgId}`,
        role_id: `in.(${roleIdList.join(",")})`,
        select: "id,role_id,full_name",
        limit: 2e3
      });
      users.forEach((row) => {
        if (row?.id) allowedUserIds.add(String(row.id));
      });
    }
  }
  if (profile.id) allowedUserIds.add(String(profile.id));
  const rolePath = buildRolePath(profile.role_id, allRoles);
  const roleById = new Map((allRoles || []).map((item) => [String(item?.id || ""), item]));
  const subordinateRoles = Array.from(allowedRoleIds).filter((id) => id !== normalizeId(profile.role_id)).map((id) => ({ id, title: roleById.get(id)?.title || id }));
  return {
    user,
    profile,
    role,
    orgId: orgId || null,
    userId: String(profile.id),
    roleId: profile.role_id ? String(profile.role_id) : null,
    permissions: role?.permissions && typeof role.permissions === "object" ? role.permissions : null,
    allowedRoleIds,
    allowedUserIds,
    rolePath,
    subordinateRoles
  };
};
var isMissingRelationError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("could not find the table") || message.includes("relation") && message.includes("does not exist") || message.includes("pgrst205") || message.includes("pgrst204") || message.includes("42703") || message.includes("42p01");
};
var canManageAiSettings = (authContext) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== "object") return true;
  const settingsPerm = permissions?.__settings_tabs || {};
  const fields = settingsPerm?.fields || {};
  return settingsPerm?.view !== false && settingsPerm?.edit !== false && fields?.ai !== false && fields?.ai_settings !== false;
};
var canViewSaasAdmin = (authContext) => {
  const permissions = authContext?.permissions;
  if (!permissions || typeof permissions !== "object") return false;
  const perm = permissions?.__saas_admin || {};
  return perm?.view === true || perm?.edit === true || perm?.demo_override === true;
};
var truthyPlanFeature = (value) => {
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "enabled" || normalized === "full" || normalized === "limited";
  }
  if (value && typeof value === "object") return value.enabled === true || value.available === true;
  return false;
};
var loadTenantAiPlanContext = async (supabaseUrl, serviceRoleKey, authContext) => {
  if (!authContext?.orgId) {
    return { available: false, planCode: null, features: {}, reason: "missing_org" };
  }
  const orgRows = await safeRestSelect(supabaseUrl, serviceRoleKey, "saas_org_settings", {
    org_id: `eq.${authContext.orgId}`,
    select: "org_id,plan_code,feature_overrides,status,is_readonly",
    limit: 1
  });
  const orgSettings = orgRows[0] || null;
  if (!orgSettings) {
    return {
      available: canViewSaasAdmin(authContext),
      planCode: null,
      features: canViewSaasAdmin(authContext) ? Object.fromEntries(Object.values(AI_CAPABILITY_FEATURE_KEYS).map((key) => [key, true])) : {},
      reason: canViewSaasAdmin(authContext) ? "saas_admin_internal" : "missing_saas_org_settings"
    };
  }
  const planCode = String(orgSettings?.plan_code || "").trim();
  const planRows = planCode ? await safeRestSelect(supabaseUrl, serviceRoleKey, "saas_plans", {
    code: `eq.${planCode}`,
    select: "code,enabled_features,is_active",
    limit: 1
  }) : [];
  const plan = planRows[0] || null;
  const merged = {
    ...plan?.enabled_features && typeof plan.enabled_features === "object" ? plan.enabled_features : {},
    ...orgSettings?.feature_overrides && typeof orgSettings.feature_overrides === "object" ? orgSettings.feature_overrides : {}
  };
  return {
    available: Boolean(plan?.is_active !== false),
    planCode,
    features: merged,
    status: orgSettings?.status || null,
    isReadonly: orgSettings?.is_readonly === true,
    reason: plan ? null : "missing_plan"
  };
};
var isAiCapabilityPlanAvailable = (planContext, capability) => {
  const normalized = String(capability || "").trim();
  const featureKey = AI_CAPABILITY_FEATURE_KEYS[normalized];
  if (!featureKey) return true;
  if (!planContext?.available) return false;
  if (normalized === "dashboard_chat" || normalized === "record_chat" || normalized === "workflow_ai_prompt" || normalized === "customer_reply_suggestion") {
    return truthyPlanFeature(planContext?.features?.[featureKey]) || truthyPlanFeature(planContext?.features?.ai_knowledge);
  }
  if (normalized === "document_analysis" || normalized === "embedding") {
    return truthyPlanFeature(planContext?.features?.[featureKey]) || truthyPlanFeature(planContext?.features?.ai_knowledge);
  }
  return truthyPlanFeature(planContext?.features?.[featureKey]);
};
var buildAiCapabilityAvailability = (planContext, settings, catalogRows = []) => {
  const selected = settings?.feature_flags && typeof settings.feature_flags === "object" ? settings.feature_flags : {};
  const catalogByCapability = /* @__PURE__ */ new Map();
  (catalogRows || []).forEach((model) => {
    const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
    tags.forEach((tag) => {
      const next = catalogByCapability.get(tag) || [];
      next.push(model);
      catalogByCapability.set(tag, next);
    });
  });
  const result = {};
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    const planAvailable = isAiCapabilityPlanAvailable(planContext, capability);
    const hasReadyModel = capability === "embedding" || (catalogByCapability.get(capability) || []).some((model) => model?.is_active !== false && model?.is_coming_soon !== true);
    const tenantReady = TENANT_READY_AI_CAPABILITIES.has(capability);
    const orgEnabled = selected?.[capability] !== false;
    result[capability] = {
      planAvailable,
      tenantReady,
      hasReadyModel,
      enabled: planAvailable && tenantReady && hasReadyModel && orgEnabled,
      featureKey: AI_CAPABILITY_FEATURE_KEYS[capability]
    };
  });
  return result;
};
var assertAiCapabilityEnabled = async (supabaseUrl, serviceRoleKey, authContext, settings, capability) => {
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const flags = settings?.feature_flags && typeof settings.feature_flags === "object" ? settings.feature_flags : {};
  const normalized = String(capability || "").trim();
  if (!TENANT_READY_AI_CAPABILITIES.has(normalized)) {
    throw new Error("\u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0647\u0646\u0648\u0632 \u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0622\u0645\u0627\u062F\u0647 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  if (!isAiCapabilityPlanAvailable(planContext, normalized)) {
    throw new Error("\u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u062F\u0631 \u067E\u0644\u0646 \u0641\u0639\u0644\u06CC \u0633\u0627\u0632\u0645\u0627\u0646 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.");
  }
  if (flags?.[normalized] === false) {
    throw new Error("\u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0633\u0627\u0632\u0645\u0627\u0646 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A.");
  }
  return planContext;
};
var filterSelectableAiModels = (models, capability) => (models || []).filter((model) => {
  const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
  return model?.is_active !== false && model?.is_coming_soon !== true && tags.includes(capability);
});
var sanitizeTenantSelectedModels = (models, selectedModels) => {
  const next = {};
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    if (capability === "embedding") return;
    const requested = String(selectedModels?.[capability] || "").trim();
    const allowed = filterSelectableAiModels(models, capability);
    const allowedIds = new Set(allowed.map((model) => String(model?.id || "").trim()).filter(Boolean));
    const resolved = allowedIds.has(requested) ? requested : String(allowed[0]?.id || requested || "").trim();
    if (resolved) next[capability] = resolved;
  });
  return next;
};
var sanitizeTenantFeatureFlags = (availability, incoming) => {
  const result = {};
  Object.keys(availability || {}).forEach((capability) => {
    const requested = incoming?.[capability] === true;
    result[capability] = requested && availability[capability]?.planAvailable === true && availability[capability]?.tenantReady === true && availability[capability]?.hasReadyModel !== false;
  });
  return result;
};
var loadOrgAiSettings = async (supabaseUrl, serviceRoleKey, authContext) => {
  if (!authContext?.orgId) return null;
  try {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, "org_ai_settings", {
      org_id: `eq.${authContext.orgId}`,
      select: "*",
      limit: 1
    });
    return rows[0] || null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
};
var listActiveAiModels = async (supabaseUrl, serviceRoleKey) => safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
  is_active: "eq.true",
  select: "id,capability_tags,is_coming_soon",
  order: "id.asc",
  limit: 500
}).catch(() => []);
var pickCapabilityModelFromCatalog = (settings, capability, catalogRows, requestedOverride) => {
  const selected = settings?.selected_models && typeof settings.selected_models === "object" ? settings.selected_models : {};
  const requested = String(requestedOverride || selected?.[capability] || "").trim();
  const allowed = filterSelectableAiModels(catalogRows, capability);
  const allowedIds = new Set(allowed.map((model) => String(model?.id || "").trim()).filter(Boolean));
  if (requested && allowedIds.has(requested)) return requested;
  return String(allowed[0]?.id || "").trim();
};
var resolveOrgCapabilityModel = async (supabaseUrl, serviceRoleKey, settings, capability, requestedOverride) => {
  const catalogRows = await listActiveAiModels(supabaseUrl, serviceRoleKey);
  const model = pickCapabilityModelFromCatalog(settings, capability, catalogRows, requestedOverride);
  if (model) return model;
  throw new Error("\u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u0648 \u0642\u0627\u0628\u0644 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
};
var getCentralProviderConfig = () => {
  const envConfig = getEnvProviderConfig();
  return {
    provider: String(envConfig.provider || "avalai").trim() || "avalai",
    baseUrl: normalizeBaseUrl(envConfig.baseUrl || DEFAULT_AI_BASE_URL),
    fallbackBaseUrls: Array.isArray(envConfig.fallbackBaseUrls) ? envConfig.fallbackBaseUrls : [DEFAULT_AI_FALLBACK_BASE_URL],
    model: String(envConfig.model || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL,
    apiKey: String(envConfig.apiKey || "").trim(),
    isActive: true,
    source: "central"
  };
};
var resolveProviderConfig = async (supabaseUrl, serviceRoleKey, authContext, capability = "dashboard_chat", options = {}) => {
  const centralConfig = getCentralProviderConfig();
  const settings = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  const model = await resolveOrgCapabilityModel(
    supabaseUrl,
    serviceRoleKey,
    settings,
    capability,
    options?.modelOverride
  );
  return {
    ...centralConfig,
    model,
    capability,
    orgAiSettings: settings
  };
};
var getModulePermission = (permissions, moduleId) => {
  if (!permissions || typeof permissions !== "object") return {};
  const perm = permissions?.[moduleId];
  return perm && typeof perm === "object" ? perm : {};
};
var getRecordScope = (perm) => {
  const value = String(perm?.record_scope || "").trim();
  if (value === "own" || value === "team" || value === "subtree" || value === "all") return value;
  return perm?.view === false ? "own" : "all";
};
var canAccessAssignedRecord = (record, authContext, recordScope = "all") => {
  if (!record) return false;
  const currentOrgId = normalizeId(authContext?.orgId);
  const recordOrgId = normalizeId(record?.org_id);
  if (currentOrgId && !recordOrgId) return false;
  if (currentOrgId && recordOrgId && currentOrgId !== recordOrgId) return false;
  if (recordScope === "all") return true;
  const resolvedAssigneeId = getResolvedAssigneeId(record);
  if (!resolvedAssigneeId) return false;
  if (recordScope === "team") {
    return !!authContext.roleId && record?.assignee_type === "role" && resolvedAssigneeId === authContext.roleId;
  }
  if (recordScope === "subtree") {
    const allowedRoleIds = authContext.allowedRoleIds || /* @__PURE__ */ new Set();
    const allowedUserIds = authContext.allowedUserIds || /* @__PURE__ */ new Set();
    if (record?.assignee_type === "role") return allowedRoleIds.has(resolvedAssigneeId);
    if (record?.assignee_type === "user") return allowedUserIds.has(resolvedAssigneeId);
    return false;
  }
  return !!authContext.userId && record?.assignee_type === "user" && resolvedAssigneeId === authContext.userId;
};
var canViewModule = (perm) => perm?.view !== false;
var canCreateModule = (perm) => perm?.create !== false && perm?.edit !== false && perm?.view !== false;
var canViewReports = (authContext) => {
  const perm = authContext?.permissions?.__reports || {};
  const fields = perm?.fields || {};
  return perm?.view !== false && fields?.hub_page !== false;
};
var isSensitiveField = (key) => {
  const normalized = String(key || "").trim();
  if (!normalized || normalized.startsWith("__")) return true;
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(normalized));
};
var serializeFieldValue = (value) => {
  if (value === null || value === void 0) return value;
  if (typeof value === "string") return value.length > 1400 ? `${value.slice(0, 1400)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 1400 ? `${serialized.slice(0, 1400)}...` : value;
  } catch {
    return String(value);
  }
};
var sanitizeRecord = (record, perm) => {
  const fields = perm?.fields && typeof perm.fields === "object" ? perm.fields : {};
  const result = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    if (isSensitiveField(key)) return;
    if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] === false) return;
    result[key] = serializeFieldValue(value);
  });
  return result;
};
var normalizeContext = (context) => ({
  route: String(context?.route || "").trim(),
  mode: String(context?.mode || "").trim() || "page",
  moduleId: context?.moduleId ? String(context.moduleId).trim() : null,
  recordId: context?.recordId ? String(context.recordId).trim() : null,
  visibleRecordIds: Array.isArray(context?.visibleRecordIds) ? context.visibleRecordIds.map(String) : [],
  selectedRecordIds: Array.isArray(context?.selectedRecordIds) ? context.selectedRecordIds.map(String) : [],
  intent: String(context?.intent || "").trim() || void 0,
  processFieldKey: context?.processFieldKey ? String(context.processFieldKey).trim() : null,
  selectedProcessId: context?.selectedProcessId ? String(context.selectedProcessId).trim() : null,
  selectedProcessGroupId: context?.selectedProcessGroupId ? String(context.selectedProcessGroupId).trim() : null,
  processGuideContext: context?.processGuideContext && typeof context.processGuideContext === "object" ? context.processGuideContext : null,
  availableProcesses: Array.isArray(context?.availableProcesses) ? context.availableProcesses.map((item) => ({
    id: String(item?.id || "").trim(),
    label: String(item?.label || "").trim(),
    templateId: item?.templateId ? String(item.templateId).trim() : null,
    templateName: item?.templateName ? String(item.templateName).trim() : null,
    stageCount: Number(item?.stageCount || 0) || 0
  })).filter((item) => item.id && item.label) : []
});
var normalizeIds = (ids) => Array.from(
  new Set((ids || []).map((id) => normalizeId(id)).filter(isUuid))
);
var buildContextKey = (rawContext) => {
  const context = normalizeContext(rawContext);
  if (context.mode === "record" && context.moduleId && context.recordId) return `record:${context.moduleId}:${context.recordId}`;
  if (context.intent === "process_guide" && context.moduleId) {
    const processId = context.selectedProcessId || context.selectedProcessGroupId || "unknown";
    const recordId = context.recordId || "page";
    return `process_guide:${context.moduleId}:${recordId}:${processId}`;
  }
  const route = String(context.route || "").split("#")[0].trim();
  if (route) return `route:${route}`;
  if (context.moduleId) return `${context.mode || "page"}:${context.moduleId}`;
  return "page:unknown";
};
var getContextKind = (context) => {
  const normalized = normalizeContext(context || {});
  if (normalized.intent === "process_guide") return "process_guide";
  if (normalized.mode === "record" && normalized.moduleId && normalized.recordId) return "record";
  if (normalized.moduleId) return normalized.mode === "list" ? "module_page" : "module";
  if (normalized.route) return "page";
  return "general";
};
var buildThreadContextLabel = (pageContext) => {
  const context = normalizeContext(pageContext?.context || {});
  if (context.intent === "process_guide") {
    const processLabel = (context.availableProcesses || []).find((item) => String(item?.id || "") === String(context.selectedProcessId || context.selectedProcessGroupId || ""))?.label;
    return `\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F${processLabel ? `: ${processLabel}` : ""}`;
  }
  if (context.mode === "record" && pageContext?.moduleId && pageContext?.recordId) {
    return `\u0631\u06A9\u0648\u0631\u062F ${pageContext.moduleId}`;
  }
  if (pageContext?.moduleId) {
    return context.mode === "list" ? `\u0635\u0641\u062D\u0647 \u0644\u06CC\u0633\u062A ${pageContext.moduleId}` : `\u0645\u0627\u0698\u0648\u0644 ${pageContext.moduleId}`;
  }
  if (context.route) return `\u0635\u0641\u062D\u0647 ${context.route}`;
  return "\u06AF\u0641\u062A\u06AF\u0648\u06CC \u0639\u0645\u0648\u0645\u06CC";
};
var buildThreadTitle = (title, pageContext) => {
  const base = String(title || "").trim();
  const label = buildThreadContextLabel(pageContext);
  if (!base) return label.slice(0, 120);
  if (base.includes(label)) return base.slice(0, 120);
  return `${base} \xB7 ${label}`.slice(0, 120);
};
var fetchRowsWithFallback = async (supabaseUrl, serviceRoleKey, moduleId, params) => {
  try {
    return await restSelect(supabaseUrl, serviceRoleKey, moduleId, params);
  } catch (firstError) {
    if (String(params?.order || "").startsWith("updated_at")) {
      return await restSelect(supabaseUrl, serviceRoleKey, moduleId, { ...params, order: "created_at.desc" });
    }
    if (String(params?.order || "").startsWith("created_at")) {
      const next = { ...params };
      delete next.order;
      return await restSelect(supabaseUrl, serviceRoleKey, moduleId, next);
    }
    throw firstError;
  }
};
var fetchPermittedRows = async (supabaseUrl, serviceRoleKey, authContext, moduleId, params, limit = 8) => {
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) return [];
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return [];
  const recordScope = getRecordScope(perm);
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    select: "*",
    limit,
    ...params
  });
  return (rows || []).filter((row) => canAccessAssignedRecord(row, authContext, recordScope)).slice(0, limit).map((row) => sanitizeRecord(row, perm));
};
var buildRelatedContexts = async (supabaseUrl, serviceRoleKey, authContext, moduleId, recordId, record) => {
  const related = [];
  const push = async (targetModuleId, params, summary) => {
    const records = await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, targetModuleId, params, 8);
    if (records.length) related.push({ moduleId: targetModuleId, summary, records });
  };
  if (moduleId === "customers" && recordId) {
    await push("invoices", { customer_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0627\u06A9\u062A\u0648\u0631\u0647\u0627\u06CC \u0645\u0631\u062A\u0628\u0637 \u0645\u0634\u062A\u0631\u06CC");
    await push("cash_bank_operations", { customer_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u067E\u0631\u062F\u0627\u062E\u062A\u200C\u0647\u0627 \u0648 \u062F\u0631\u06CC\u0627\u0641\u062A\u200C\u0647\u0627\u06CC \u0645\u0633\u062A\u0642\u06CC\u0645 \u0645\u0634\u062A\u0631\u06CC");
    await push("tasks", { related_customer: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u0645\u0631\u062A\u0628\u0637 \u0645\u0634\u062A\u0631\u06CC");
    await push("projects", { customer_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627\u06CC \u0645\u0631\u062A\u0628\u0637 \u0645\u0634\u062A\u0631\u06CC");
  }
  if (moduleId === "invoices" && recordId) {
    const customerId = normalizeId(record?.customer_id);
    const projectId = normalizeId(record?.project_id);
    if (customerId) await push("customers", { id: `eq.${customerId}` }, "\u0645\u0634\u062A\u0631\u06CC \u0641\u0627\u06A9\u062A\u0648\u0631");
    if (projectId) await push("projects", { id: `eq.${projectId}` }, "\u067E\u0631\u0648\u0698\u0647 \u0641\u0627\u06A9\u062A\u0648\u0631");
    await push("tasks", { related_invoice: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u0645\u0631\u062A\u0628\u0637 \u0641\u0627\u06A9\u062A\u0648\u0631");
  }
  if (moduleId === "projects" && recordId) {
    await push("tasks", { project_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u067E\u0631\u0648\u0698\u0647");
    await push("process_runs", { project_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0631\u0622\u06CC\u0646\u062F\u0647\u0627 \u0648 \u0645\u0631\u0627\u062D\u0644 \u067E\u0631\u0648\u0698\u0647");
    await push("invoices", { project_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0627\u06A9\u062A\u0648\u0631\u0647\u0627\u06CC \u0641\u0631\u0648\u0634 \u067E\u0631\u0648\u0698\u0647");
    await push("purchase_invoices", { project_id: `eq.${recordId}`, order: "updated_at.desc" }, "\u0641\u0627\u06A9\u062A\u0648\u0631\u0647\u0627\u06CC \u062E\u0631\u06CC\u062F \u067E\u0631\u0648\u0698\u0647");
  }
  if (moduleId === "tasks") {
    const customerId = normalizeId(record?.related_customer);
    const projectId = normalizeId(record?.project_id);
    const invoiceId = normalizeId(record?.related_invoice);
    if (customerId) await push("customers", { id: `eq.${customerId}` }, "\u0645\u0634\u062A\u0631\u06CC \u0645\u0631\u062A\u0628\u0637 \u0641\u0639\u0627\u0644\u06CC\u062A");
    if (projectId) await push("projects", { id: `eq.${projectId}` }, "\u067E\u0631\u0648\u0698\u0647 \u0645\u0631\u062A\u0628\u0637 \u0641\u0639\u0627\u0644\u06CC\u062A");
    if (invoiceId) await push("invoices", { id: `eq.${invoiceId}` }, "\u0641\u0627\u06A9\u062A\u0648\u0631 \u0645\u0631\u062A\u0628\u0637 \u0641\u0639\u0627\u0644\u06CC\u062A");
  }
  return related.slice(0, 6);
};
var buildReportContext = async (supabaseUrl, serviceRoleKey, authContext, context) => {
  const route = String(context?.route || "").split("?")[0];
  const match = route.match(/^\/reports\/([^/]+)/i);
  if (!match || match[1] === "create" || match[1] === "edit") return null;
  if (!canViewReports(authContext)) {
    return {
      context,
      permitted: false,
      summary: "\u06A9\u0627\u0631\u0628\u0631 \u0628\u0647 \u06AF\u0632\u0627\u0631\u0634\u200C\u0647\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u0646\u062F\u0627\u0631\u062F.",
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: []
    };
  }
  const reportId = normalizeId(match[1]);
  if (!isUuid(reportId)) return null;
  const reports = await safeRestSelect(supabaseUrl, serviceRoleKey, "report_definitions", {
    id: `eq.${reportId}`,
    org_id: `eq.${authContext.orgId}`,
    select: "id,name,description,module_id,report_type,config,is_active,updated_at",
    limit: 1
  });
  const report = reports[0] || null;
  if (!report) {
    return {
      context,
      permitted: false,
      summary: "\u06AF\u0632\u0627\u0631\u0634 \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u0628\u0647 \u0633\u0627\u0632\u0645\u0627\u0646 \u0641\u0639\u0644\u06CC \u062A\u0639\u0644\u0642 \u0646\u062F\u0627\u0631\u062F.",
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: []
    };
  }
  const reportModuleId = normalizeId(report.module_id);
  const moduleRows = reportModuleId ? await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, reportModuleId, {
    order: "updated_at.desc",
    limit: 10
  }, 10) : [];
  return {
    context,
    permitted: true,
    summary: `\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632: \u06AF\u0632\u0627\u0631\u0634 ${report.name || report.id} \u0628\u0631 \u0627\u0633\u0627\u0633 \u0645\u0627\u0698\u0648\u0644 ${reportModuleId || "\u0646\u0627\u0645\u0634\u062E\u0635"}.`,
    records: [{
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        module_id: report.module_id,
        report_type: report.report_type,
        config: report.config,
        is_active: report.is_active
      },
      sample_rows: moduleRows
    }],
    moduleId: "reports",
    recordId: report.id,
    relatedContexts: []
  };
};
var buildPermittedPageContext = async (supabaseUrl, serviceRoleKey, authContext, rawContext) => {
  const context = normalizeContext(rawContext);
  const reportContext = await buildReportContext(supabaseUrl, serviceRoleKey, authContext, context);
  if (reportContext) return reportContext;
  const moduleId = String(context.moduleId || "").trim();
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) {
    return {
      context,
      permitted: false,
      summary: "\u0627\u06CC\u0646 \u0635\u0641\u062D\u0647 \u0628\u0647 \u0645\u0627\u0698\u0648\u0644 \u062F\u06CC\u062A\u0627\u06CC\u06CC \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0628\u0631\u0627\u06CC \u062F\u0633\u062A\u06CC\u0627\u0631 \u0648\u0635\u0644 \u0646\u06CC\u0633\u062A.",
      records: [],
      moduleId: null,
      recordId: null,
      relatedContexts: []
    };
  }
  const perm = getModulePermission(authContext.permissions, moduleId);
  const recordScope = getRecordScope(perm);
  if (!canViewModule(perm)) {
    return {
      context,
      permitted: false,
      summary: "\u06A9\u0627\u0631\u0628\u0631 \u0628\u0647 \u0627\u06CC\u0646 \u0645\u0627\u0698\u0648\u0644 \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u0646\u062F\u0627\u0631\u062F.",
      records: [],
      moduleId,
      recordId: context.recordId || null,
      relatedContexts: []
    };
  }
  if (context.mode === "record" && context.recordId) {
    const rows2 = await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
      id: `eq.${context.recordId}`,
      select: "*",
      limit: 1
    });
    const record = rows2[0] || null;
    if (!record || !canAccessAssignedRecord(record, authContext, recordScope)) {
      return {
        context,
        permitted: false,
        summary: "\u0631\u06A9\u0648\u0631\u062F \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u06A9\u0627\u0631\u0628\u0631 \u0628\u0647 \u0622\u0646 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u062F\u0627\u0631\u062F.",
        records: [],
        moduleId,
        recordId: context.recordId,
        relatedContexts: []
      };
    }
    const relatedContexts = await buildRelatedContexts(supabaseUrl, serviceRoleKey, authContext, moduleId, context.recordId, record);
    return {
      context,
      permitted: true,
      summary: `\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632: \u0631\u06A9\u0648\u0631\u062F ${context.recordId} \u0627\u0632 \u0645\u0627\u0698\u0648\u0644 ${moduleId}.`,
      records: [sanitizeRecord(record, perm)],
      moduleId,
      recordId: context.recordId,
      recordScope,
      relatedContexts,
      processGuideContext: context.processGuideContext || null,
      intent: context.intent || null,
      processFieldKey: context.processFieldKey || null,
      selectedProcessId: context.selectedProcessId || context.selectedProcessGroupId || null,
      availableProcesses: context.availableProcesses || []
    };
  }
  const selectedIds = normalizeIds(context.selectedRecordIds || []).slice(0, MAX_PAGE_CONTEXT_RECORDS);
  const visibleIds = selectedIds.length ? selectedIds : normalizeIds(context.visibleRecordIds || []).slice(0, MAX_PAGE_CONTEXT_RECORDS);
  const rows = visibleIds.length ? await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
    id: `in.(${visibleIds.join(",")})`,
    select: "*",
    limit: MAX_PAGE_CONTEXT_RECORDS
  }) : await fetchRowsWithFallback(supabaseUrl, serviceRoleKey, moduleId, {
    select: "*",
    order: "updated_at.desc",
    limit: MAX_PAGE_CONTEXT_RECORDS
  });
  const permittedRows = (rows || []).filter((row) => canAccessAssignedRecord(row, authContext, recordScope)).slice(0, MAX_PAGE_CONTEXT_RECORDS).map((row) => sanitizeRecord(row, perm));
  return {
    context,
    permitted: true,
    summary: selectedIds.length ? `\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632: ${permittedRows.length} \u0631\u06A9\u0648\u0631\u062F \u0627\u0646\u062A\u062E\u0627\u0628\u200C\u0634\u062F\u0647 \u0627\u0632 \u0645\u0627\u0698\u0648\u0644 ${moduleId}.` : visibleIds.length ? `\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632: ${permittedRows.length} \u0631\u06A9\u0648\u0631\u062F \u0627\u0632 \u0635\u0641\u062D\u0647 \u0641\u0639\u0644\u06CC \u0644\u06CC\u0633\u062A ${moduleId}.` : `\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632: \u0622\u062E\u0631\u06CC\u0646 ${permittedRows.length} \u0631\u06A9\u0648\u0631\u062F \u0642\u0627\u0628\u0644 \u0645\u0634\u0627\u0647\u062F\u0647 \u0627\u0632 \u0645\u0627\u0698\u0648\u0644 ${moduleId}.`,
    records: permittedRows,
    moduleId,
    recordId: null,
    recordScope,
    relatedContexts: [],
    processGuideContext: context.processGuideContext || null,
    intent: context.intent || null,
    processFieldKey: context.processFieldKey || null,
    selectedProcessId: context.selectedProcessId || context.selectedProcessGroupId || null,
    availableProcesses: context.availableProcesses || []
  };
};
var tokenize = (value) => Array.from(
  new Set(
    String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]+/gu, " ").split(/\s+/).map((item) => item.trim()).filter((item) => item.length >= 2)
  )
).slice(0, 16);
var getSearchTerms = (message) => tokenize(message).filter((token) => !QUERY_STOP_WORDS.has(token)).filter((token) => !Object.values(MODULE_ALIASES).flat().some((alias) => alias.toLowerCase() === token)).slice(0, 5);
var detectRelevantModuleIds = (message, pageContext) => {
  const text = String(message || "").toLowerCase();
  const result = /* @__PURE__ */ new Set();
  Object.entries(MODULE_ALIASES).forEach(([moduleId, aliases]) => {
    if (aliases.some((alias) => text.includes(alias.toLowerCase()))) {
      result.add(moduleId);
    }
  });
  if (pageContext?.moduleId && ALLOWED_MODULES.has(pageContext.moduleId)) result.add(pageContext.moduleId);
  return Array.from(result).slice(0, MAX_RETRIEVED_CONTEXTS + 1);
};
var rowMatchesTerms = (row, terms) => {
  if (!terms.length) return true;
  const haystack = JSON.stringify(row || {}).toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
};
var fetchModuleRowsForQuery = async (supabaseUrl, serviceRoleKey, authContext, moduleId, message) => {
  if (!moduleId || !ALLOWED_MODULES.has(moduleId)) return [];
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return [];
  const recordScope = getRecordScope(perm);
  const terms = getSearchTerms(message);
  const searchFields = MODULE_SEARCH_FIELDS[moduleId] || ["name", "title", "system_code", "description"];
  for (const term of terms) {
    const safeTerm = term.replace(/[(),*]/g, " ").trim();
    if (!safeTerm) continue;
    try {
      const orExpr = searchFields.map((field) => `${field}.ilike.*${safeTerm}*`).join(",");
      const rows2 = await restSelect(supabaseUrl, serviceRoleKey, moduleId, {
        select: "*",
        or: `(${orExpr})`,
        order: "updated_at.desc",
        limit: 20
      });
      const permittedRows = (rows2 || []).filter((row) => canAccessAssignedRecord(row, authContext, recordScope)).slice(0, 8).map((row) => sanitizeRecord(row, perm));
      if (permittedRows.length) return permittedRows;
    } catch {
    }
  }
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    select: "*",
    order: "updated_at.desc",
    limit: 40
  });
  return (rows || []).filter((row) => canAccessAssignedRecord(row, authContext, recordScope)).filter((row) => rowMatchesTerms(row, terms)).slice(0, 8).map((row) => sanitizeRecord(row, perm));
};
var fetchRelevantModuleContexts = async (supabaseUrl, serviceRoleKey, authContext, message, pageContext) => {
  const modules = detectRelevantModuleIds(message, pageContext).filter((moduleId) => moduleId && moduleId !== pageContext?.moduleId).slice(0, MAX_RETRIEVED_CONTEXTS);
  const contexts = [];
  for (const moduleId of modules) {
    const records = await fetchModuleRowsForQuery(supabaseUrl, serviceRoleKey, authContext, moduleId, message);
    if (records.length) {
      contexts.push({
        moduleId,
        summary: `\u0631\u06A9\u0648\u0631\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0645\u0631\u062A\u0628\u0637 \u0627\u0632 \u0645\u0627\u0698\u0648\u0644 ${moduleId}`,
        records
      });
    }
  }
  return contexts;
};
var normalizeFaDigits = (value) => String(value || "").replace(/[۰-۹]/g, (digit) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(digit)));
var dateOnlyFromUtc = (value) => value.toISOString().slice(0, 10);
var getTehranToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
};
var parseDateOnlyUtc = (value) => /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
var PERSIAN_MONTH_COUNTS = {
  \u06CC\u06A9: 1,
  \u062F\u0648: 2,
  \u0633\u0647: 3,
  \u0686\u0647\u0627\u0631: 4,
  \u067E\u0646\u062C: 5,
  \u0634\u0634: 6,
  \u0647\u0641\u062A: 7,
  \u0647\u0634\u062A: 8,
  \u0646\u0647: 9,
  \u062F\u0647: 10,
  \u06CC\u0627\u0632\u062F\u0647: 11,
  \u062F\u0648\u0627\u0632\u062F\u0647: 12
};
var extractRequestedMonthCount = (message) => {
  const normalized = normalizeFaDigits(message).toLowerCase();
  const numeric = normalized.match(/(\d{1,2})\s*ماه/);
  if (numeric) return Math.max(1, Math.min(24, Number(numeric[1]) || 1));
  for (const [word, count] of Object.entries(PERSIAN_MONTH_COUNTS)) {
    if (normalized.includes(`${word} \u0645\u0627\u0647`)) return count;
  }
  return 1;
};
var resolveFinancialPeriod = (message) => {
  const normalized = normalizeFaDigits(message).toLowerCase();
  const todayIso = getTehranToday();
  const today = parseDateOnlyUtc(todayIso);
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const requestedMonthCount = extractRequestedMonthCount(normalized);
  if (/(سال گذشته|سال قبل|previous year|last year)/i.test(normalized)) {
    const year = today.getUTCFullYear() - 1;
    return {
      label: "\u0633\u0627\u0644 \u06AF\u0630\u0634\u062A\u0647",
      dateFrom: dateOnlyFromUtc(new Date(Date.UTC(year, 0, 1))),
      dateTo: dateOnlyFromUtc(new Date(Date.UTC(year, 11, 31)))
    };
  }
  if (/(امسال|سال جاری|this year|current year)/i.test(normalized)) {
    return {
      label: "\u0633\u0627\u0644 \u062C\u0627\u0631\u06CC \u062A\u0627 \u0627\u0645\u0631\u0648\u0632",
      dateFrom: dateOnlyFromUtc(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
      dateTo: todayIso
    };
  }
  if (/(هفته گذشته|هفته قبل|previous week|last week)/i.test(normalized)) {
    const currentWeekStart = new Date(today);
    const daysSinceSaturday = (today.getUTCDay() + 1) % 7;
    currentWeekStart.setUTCDate(today.getUTCDate() - daysSinceSaturday);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    const previousWeekEnd = new Date(currentWeekStart);
    previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() - 1);
    return {
      label: "\u0647\u0641\u062A\u0647 \u06AF\u0630\u0634\u062A\u0647",
      dateFrom: dateOnlyFromUtc(previousWeekStart),
      dateTo: dateOnlyFromUtc(previousWeekEnd)
    };
  }
  if (requestedMonthCount > 1 && /(گذشته|اخیر|قبل|recent|last)/i.test(normalized)) {
    const start = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - (requestedMonthCount - 1),
      1
    ));
    return {
      label: `${requestedMonthCount} \u0645\u0627\u0647 \u0627\u062E\u06CC\u0631 \u062A\u0627 \u0627\u0645\u0631\u0648\u0632`,
      dateFrom: dateOnlyFromUtc(start),
      dateTo: todayIso
    };
  }
  if (/(ماه گذشته|ماه قبل|previous month|last month)/i.test(normalized)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return {
      label: "\u0645\u0627\u0647 \u06AF\u0630\u0634\u062A\u0647",
      dateFrom: dateOnlyFromUtc(start),
      dateTo: dateOnlyFromUtc(end)
    };
  }
  return {
    label: "\u0645\u0627\u0647 \u062C\u0627\u0631\u06CC \u062A\u0627 \u0627\u0645\u0631\u0648\u0632",
    dateFrom: dateOnlyFromUtc(currentMonthStart),
    dateTo: todayIso
  };
};
var detectFinancialAnalyticsIntent = (message) => {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return null;
  if (/(سود\s*و\s*زیان|سود|زیان|حاشیه سود|profit|loss|margin)/i.test(text)) return "profit_loss";
  if (/(وضعیت مالی|عملکرد مالی|گزارش مالی|financial performance|financial status)/i.test(text)) return "financial_overview";
  if (/(فروش|درآمد|revenue|sales)/i.test(text)) return "sales_overview";
  if (/(هزینه|مخارج|خرید|expense|cost|purchase)/i.test(text)) return "cost_overview";
  return null;
};
var canReadAggregateFields = (perm, requiredFields) => {
  if (!canViewModule(perm) || getRecordScope(perm) !== "all") return false;
  const fields = perm?.fields && typeof perm.fields === "object" ? perm.fields : {};
  return requiredFields.every((field) => fields?.[field] !== false);
};
var fetchFinancialAnalyticsContext = async (supabaseUrl, serviceRoleKey, authContext, message) => {
  const intent = detectFinancialAnalyticsIntent(message);
  if (!intent || !authContext?.orgId) return null;
  const period = resolveFinancialPeriod(message);
  const permissions = authContext?.permissions && typeof authContext.permissions === "object" ? authContext.permissions : {};
  const accountingPerm = permissions?.__accounting || {};
  const accountingFields = accountingPerm?.fields && typeof accountingPerm.fields === "object" ? accountingPerm.fields : {};
  const includeAccounting = accountingPerm?.view !== false && accountingFields?.dashboard_page !== false && accountingFields?.reports_hub !== false && accountingFields?.journal_entry_lines_view !== false && canViewModule(getModulePermission(permissions, "journal_entries")) && canViewModule(getModulePermission(permissions, "chart_of_accounts"));
  const includeSales = canReadAggregateFields(
    getModulePermission(permissions, "invoices"),
    ["invoice_date", "status", "total_invoice_amount"]
  );
  const includePurchases = canReadAggregateFields(
    getModulePermission(permissions, "purchase_invoices"),
    ["invoice_date", "status", "total_invoice_amount"]
  );
  const includeExpenses = canReadAggregateFields(
    getModulePermission(permissions, "expense_documents"),
    ["expense_date", "status", "total_amount"]
  );
  const permissionScope = {
    accounting: includeAccounting,
    sales: includeSales,
    purchases: includePurchases,
    expenses: includeExpenses
  };
  if (!Object.values(permissionScope).some(Boolean)) {
    return {
      kind: "financial_snapshot",
      intent,
      period,
      available: false,
      reason: "permission_denied",
      permission_scope: permissionScope
    };
  }
  try {
    const snapshot = await restRpc(supabaseUrl, serviceRoleKey, "get_ai_financial_snapshot", {
      p_org_id: authContext.orgId,
      p_date_from: period.dateFrom,
      p_date_to: period.dateTo,
      p_include_accounting: includeAccounting,
      p_include_sales: includeSales,
      p_include_purchases: includePurchases,
      p_include_expenses: includeExpenses
    });
    const accountingAvailable = snapshot?.accounting?.available === true;
    const unpostedCount = Number(snapshot?.accounting?.unposted_entry_count || 0);
    return {
      ...snapshot,
      intent,
      period,
      available: true,
      permission_scope: permissionScope,
      data_quality: accountingAvailable ? unpostedCount > 0 ? "posted_ledger_with_unposted_entries" : "posted_ledger" : "operational_only"
    };
  } catch (error) {
    console.warn("Financial analytics context unavailable", error);
    return {
      kind: "financial_snapshot",
      intent,
      period,
      available: false,
      reason: "financial_snapshot_unavailable",
      permission_scope: permissionScope
    };
  }
};
var fetchKnowledgeChunks = async (supabaseUrl, serviceRoleKey, authContext, query) => {
  if (!authContext.orgId) return [];
  const instructionRowsFor = (rows2) => rows2.filter(
    (row) => String(row?.metadata?.system_key || "").trim() === "ai_instructions" || String(row?.metadata?.document_type || "").trim() === "ai_instructions"
  );
  const rows = await restSelect(supabaseUrl, serviceRoleKey, "document_chunks", {
    org_id: `eq.${authContext.orgId}`,
    status: "eq.active",
    select: "id,document_id,chunk_index,content,metadata,updated_at,allowed_user_ids,allowed_role_ids",
    order: "updated_at.desc",
    limit: 80
  });
  const visibleRows = rows.filter((row) => {
    const allowedUserIds = Array.isArray(row?.allowed_user_ids) ? row.allowed_user_ids.map(normalizeId).filter(isUuid) : [];
    const allowedRoleIds = Array.isArray(row?.allowed_role_ids) ? row.allowed_role_ids.map(normalizeId).filter(isUuid) : [];
    if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) return true;
    const userId = normalizeId(authContext?.userId);
    const roleId = normalizeId(authContext?.roleId);
    return !!userId && allowedUserIds.includes(userId) || !!roleId && allowedRoleIds.includes(roleId);
  });
  const instructionRows = instructionRowsFor(visibleRows);
  const queryText = String(query || "").trim();
  if (queryText) {
    try {
      const providerConfig = getCentralProviderConfig();
      if (providerConfig.apiKey) {
        const embeddingResult = await callEmbeddings(providerConfig, queryText.slice(0, 8e3), DEFAULT_EMBEDDING_MODEL);
        let vectorRows = [];
        try {
          vectorRows = await restRpc(supabaseUrl, serviceRoleKey, "match_ai_document_chunks_hybrid", {
            p_org_id: authContext.orgId,
            p_user_id: authContext.userId || null,
            p_role_id: authContext.roleId || null,
            p_query_text: queryText.slice(0, 2e3),
            p_query_embedding: `[${embeddingResult.embedding.join(",")}]`,
            p_match_count: 6,
            p_match_threshold: KNOWLEDGE_MATCH_THRESHOLD,
            p_full_text_weight: 1.15,
            p_semantic_weight: 1,
            p_rrf_k: 50
          });
        } catch {
          vectorRows = await restRpc(supabaseUrl, serviceRoleKey, "match_ai_document_chunks", {
            p_org_id: authContext.orgId,
            p_user_id: authContext.userId || null,
            p_role_id: authContext.roleId || null,
            p_query_embedding: `[${embeddingResult.embedding.join(",")}]`,
            p_match_count: 6
          });
        }
        const filteredVectorRows = (vectorRows || []).filter((row) => Number(row?.similarity || 0) >= KNOWLEDGE_MATCH_THRESHOLD).filter((row) => !instructionRows.some((item) => String(item.id) === String(row.id))).slice(0, Math.max(0, 6 - instructionRows.slice(0, 2).length));
        if (filteredVectorRows.length > 0) {
          await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
            capability: "embedding",
            provider: providerConfig.provider,
            model: DEFAULT_EMBEDDING_MODEL,
            requestId: embeddingResult.requestId,
            usageMetadata: embeddingResult.usageMetadata,
            status: "finalized",
            metadata: { source: "knowledge_retrieval" }
          });
          return [...instructionRows.slice(0, 2), ...filteredVectorRows];
        }
      }
    } catch (error) {
      console.warn("Embedding retrieval fallback used", error);
    }
  }
  const otherRows = visibleRows.filter((row) => !instructionRows.includes(row));
  const tokens = tokenize(query);
  if (!tokens.length) return [...instructionRows.slice(0, 2), ...otherRows.slice(0, Math.max(0, 4 - instructionRows.slice(0, 2).length))];
  const scoredRows = otherRows.map((row) => {
    const haystack = `${row?.content || ""} ${JSON.stringify(row?.metadata || {})}`.toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
    return { ...row, score };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(0, 6 - instructionRows.slice(0, 2).length));
  return [...instructionRows.slice(0, 2), ...scoredRows];
};
var loadCompanyContext = async (supabaseUrl, serviceRoleKey, authContext) => {
  const [companyRows, orgRows] = await Promise.all([
    authContext.orgId ? safeRestSelect(supabaseUrl, serviceRoleKey, "company_settings", {
      org_id: `eq.${authContext.orgId}`,
      select: "id,org_id,company_name,company_full_name,trade_name,company_name_en,currency_code,currency_label,ceo_name,mobile,phone,address,website,email,updated_at",
      limit: 1
    }) : Promise.resolve([]),
    authContext.orgId ? safeRestSelect(supabaseUrl, serviceRoleKey, "organizations", {
      id: `eq.${authContext.orgId}`,
      select: "id,name,slug,is_active",
      limit: 1
    }) : Promise.resolve([])
  ]);
  const company = companyRows[0] || {};
  const organization = orgRows[0] || {};
  return {
    org_id: authContext.orgId,
    organization_name: organization?.name || null,
    organization_slug: organization?.slug || null,
    company_name: company?.company_name || organization?.name || null,
    company_full_name: company?.company_full_name || null,
    trade_name: company?.trade_name || null,
    company_name_en: company?.company_name_en || null,
    currency_code: company?.currency_code || "IRT",
    currency_label: company?.currency_label || "\u062A\u0648\u0645\u0627\u0646",
    ceo_name: company?.ceo_name || null,
    phone: company?.phone || company?.mobile || null,
    email: company?.email || null,
    website: company?.website || null,
    address: company?.address || null
  };
};
var buildUserPromptContext = (authContext) => ({
  id: authContext?.profile?.id || null,
  full_name: authContext?.profile?.full_name || authContext?.user?.email || null,
  email: authContext?.profile?.email || authContext?.user?.email || null,
  mobile: authContext?.profile?.mobile_1 || authContext?.profile?.mobile || null,
  job_title: authContext?.profile?.job_title || null,
  position: authContext?.profile?.position || null,
  team: authContext?.profile?.team || null,
  role_id: authContext?.roleId || null,
  role_title: authContext?.role?.title || null,
  role_path: authContext?.rolePath || [],
  subordinate_roles: (authContext?.subordinateRoles || []).slice(0, 20)
});
var matchesDirectoryKeywords = (values, keywords) => {
  const haystack = values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join(" ");
  if (!haystack) return false;
  return keywords.some((keyword) => haystack.includes(String(keyword || "").trim().toLowerCase()));
};
var loadOrgPeopleContext = async (supabaseUrl, serviceRoleKey, authContext, message) => {
  if (!authContext?.orgId) {
    return {
      summary: "\u0633\u0627\u0632\u0645\u0627\u0646 \u06A9\u0627\u0631\u0628\u0631 \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.",
      total_roles: 0,
      total_users: 0,
      roles: [],
      relevant_users: [],
      leadership: []
    };
  }
  const [roleRows, userRows] = await Promise.all([
    safeRestSelect(supabaseUrl, serviceRoleKey, "org_roles", {
      org_id: `eq.${authContext.orgId}`,
      select: "id,title,parent_id",
      limit: 1e3
    }),
    safeRestSelect(supabaseUrl, serviceRoleKey, "profiles", {
      org_id: `eq.${authContext.orgId}`,
      select: "id,full_name,role_id,job_title,position,team,updated_at",
      order: "updated_at.desc",
      limit: 400
    })
  ]);
  const roles = (roleRows || []).map((row) => ({
    id: normalizeId(row?.id),
    title: String(row?.title || "").trim() || null,
    parent_id: normalizeId(row?.parent_id)
  })).filter((row) => row.id);
  const roleById = new Map(roles.map((row) => [String(row.id), row]));
  const roleUserCounts = /* @__PURE__ */ new Map();
  const roleChildCounts = /* @__PURE__ */ new Map();
  roles.forEach((role) => {
    if (role.parent_id) {
      roleChildCounts.set(role.parent_id, (roleChildCounts.get(role.parent_id) || 0) + 1);
    }
  });
  const users = (userRows || []).map((row) => {
    const roleId = normalizeId(row?.role_id);
    const roleTitle = roleId ? roleById.get(roleId)?.title || null : null;
    if (roleId) {
      roleUserCounts.set(roleId, (roleUserCounts.get(roleId) || 0) + 1);
    }
    const rolePathTitles = roleId ? buildRolePath(roleId, roles).map((role) => String(role?.title || "").trim()).filter(Boolean) : [];
    const isLeader = Boolean(
      roleId && (roleChildCounts.get(roleId) || 0) > 0 || matchesDirectoryKeywords(
        [roleTitle, row?.job_title, row?.position, row?.team],
        MANAGEMENT_DIRECTORY_KEYWORDS
      )
    );
    return {
      id: normalizeId(row?.id),
      full_name: String(row?.full_name || "").trim() || null,
      role_id: roleId || null,
      role_title: roleTitle,
      role_path_titles: rolePathTitles,
      job_title: String(row?.job_title || "").trim() || null,
      position: String(row?.position || "").trim() || null,
      team: String(row?.team || "").trim() || null,
      is_leadership: isLeader
    };
  }).filter((row) => row.id && row.full_name);
  const queryTerms = getSearchTerms(message);
  const matchingUsers = queryTerms.length > 0 ? users.filter((row) => matchesDirectoryKeywords(
    [row.full_name, row.role_title, row.job_title, row.position, row.team, ...row.role_path_titles || []],
    queryTerms
  )) : [];
  const leadership = users.filter((row) => row.is_leadership).slice(0, 20);
  const relevantUsers = Array.from(new Map(
    [...matchingUsers.slice(0, 20), ...leadership].map((row) => [String(row.id), row])
  ).values()).slice(0, 40);
  const summarizedRoles = roles.map((role) => ({
    id: role.id,
    title: role.title,
    parent_title: role.parent_id ? roleById.get(role.parent_id)?.title || null : null,
    child_role_count: roleChildCounts.get(role.id) || 0,
    assigned_user_count: roleUserCounts.get(role.id) || 0
  }));
  return {
    summary: "\u062F\u0627\u06CC\u0631\u06A9\u062A\u0648\u0631\u06CC \u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0648 \u0646\u0642\u0634\u200C\u0647\u0627\u06CC \u0647\u0645\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646. \u062E\u0627\u0631\u062C \u0627\u0632 \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u0647\u06CC\u0686 \u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627 \u0646\u0642\u0634\u06CC \u062F\u0631 \u0627\u06CC\u0646 context \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F.",
    total_roles: roles.length,
    total_users: users.length,
    roles: summarizedRoles.slice(0, 120),
    relevant_users: relevantUsers,
    leadership: leadership.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      role_title: row.role_title,
      role_path_titles: row.role_path_titles,
      job_title: row.job_title,
      position: row.position,
      team: row.team
    }))
  };
};
var buildPromptMessages = (message, pageContext, knowledgeChunks, companyContext, orgPeopleContext, authContext, retrievedContexts, historyRows = [], webSearchResults = [], options = {}) => {
  const knowledge = knowledgeChunks.map((chunk, index) => ({
    index: index + 1,
    id: chunk.id,
    document_id: chunk.document_id,
    title: chunk?.metadata?.document_title || null,
    content: String(chunk?.content || "").slice(0, 1200)
  }));
  const aiInstructionIds = new Set(
    knowledgeChunks.filter(
      (chunk) => String(chunk?.metadata?.system_key || "").trim() === "ai_instructions" || String(chunk?.metadata?.document_type || "").trim() === "ai_instructions"
    ).map((chunk) => String(chunk?.id || ""))
  );
  const aiInstructions = knowledge.filter((chunk) => aiInstructionIds.has(String(chunk.id || "")));
  const otherKnowledge = knowledge.filter((chunk) => !aiInstructionIds.has(String(chunk.id || "")));
  const contextPayload = {
    company: companyContext,
    current_user: buildUserPromptContext(authContext),
    organization_directory: orgPeopleContext,
    current_page: {
      summary: pageContext.summary,
      moduleId: pageContext.moduleId,
      recordId: pageContext.recordId,
      records: pageContext.records,
      related_contexts: pageContext.relatedContexts || []
    },
    process_guide: pageContext.intent === "process_guide" ? {
      intent: pageContext.intent,
      process_field_key: pageContext.processFieldKey || null,
      selected_process_id: pageContext.selectedProcessId || null,
      available_processes: pageContext.availableProcesses || [],
      process_guide_context: pageContext.processGuideContext || null
    } : null,
    retrieved_permitted_contexts: retrievedContexts,
    business_analytics: options.businessAnalytics || null,
    web_search_results: webSearchResults.length ? webSearchResults : void 0,
    selected_ai_capabilities: options.selectedCapabilities || [],
    ai_instructions: aiInstructions,
    organization_knowledge: otherKnowledge,
    user_question: message
  };
  const legalInstruction = options.legalMode ? " \u062D\u0627\u0644\u062A \u062F\u0633\u062A\u06CC\u0627\u0631 \u062D\u0642\u0648\u0642\u06CC \u0641\u0639\u0627\u0644 \u0627\u0633\u062A: \u067E\u0627\u0633\u062E \u062D\u0642\u0648\u0642\u06CC \u0628\u0627\u06CC\u062F \u0628\u0627 \u0627\u062D\u062A\u06CC\u0627\u0637\u060C \u0641\u0627\u0631\u0633\u06CC\u060C \u0645\u0628\u062A\u0646\u06CC \u0628\u0631 \u0645\u0646\u0627\u0628\u0639 \u0645\u0648\u062C\u0648\u062F \u062F\u0631 organization_knowledge \u0648 web_search_results \u0628\u0627\u0634\u062F. \u0627\u06AF\u0631 \u0645\u0646\u0628\u0639 \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0642\u0627\u0646\u0648\u0646 \u06CC\u0627 \u0631\u0648\u06CC\u0647 \u0627\u06CC\u0631\u0627\u0646 \u0646\u062F\u0627\u0631\u06CC\u062F\u060C \u0635\u0631\u06CC\u062D \u0628\u06AF\u0648\u06CC\u06CC\u062F \u0645\u0646\u0628\u0639 \u06A9\u0627\u0641\u06CC \u0646\u062F\u0627\u0631\u0645. \u0646\u062A\u06CC\u062C\u0647 \u0631\u0627 \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0645\u0634\u0627\u0648\u0631\u0647 \u0648\u06A9\u06CC\u0644 \u06CC\u0627 \u0645\u0634\u0627\u0648\u0631 \u062D\u0642\u0648\u0642\u06CC \u0642\u0637\u0639\u06CC \u0645\u0639\u0631\u0641\u06CC \u0646\u06A9\u0646\u06CC\u062F. \u0645\u0648\u0627\u062F \u0642\u0627\u0646\u0648\u0646\u06CC\u060C \u062A\u0627\u0631\u06CC\u062E/\u0645\u0646\u0628\u0639 \u0648 \u0639\u062F\u0645 \u0642\u0637\u0639\u06CC\u062A\u200C\u0647\u0627 \u0631\u0627 \u0630\u06A9\u0631 \u06A9\u0646\u06CC\u062F." : "";
  const hasPriorTurns = (historyRows || []).some((item) => String(item?.role || "") === "assistant");
  const reasoningInstruction = options.deepReasoning ? hasPriorTurns ? " \u062D\u0627\u0644\u062A \u062A\u0641\u06A9\u0631 \u0639\u0645\u06CC\u0642 \u0641\u0639\u0627\u0644 \u0627\u0633\u062A \u0648 \u06A9\u0627\u0631\u0628\u0631 \u0642\u0628\u0644\u0627\u064B \u0632\u0645\u06CC\u0646\u0647 \u0631\u0627 \u062F\u0627\u062F\u0647/\u062A\u0627\u06CC\u06CC\u062F \u06A9\u0631\u062F\u0647 \u0627\u0633\u062A: \u062D\u0627\u0644\u0627 \u0645\u0633\u0626\u0644\u0647 \u0631\u0627 \u0639\u0645\u06CC\u0642 \u0648 \u0645\u0631\u062D\u0644\u0647\u200C\u0627\u06CC \u062A\u062D\u0644\u06CC\u0644 \u06A9\u0646\u060C \u0627\u0645\u0627 \u0641\u0642\u0637 \u062C\u0645\u0639\u200C\u0628\u0646\u062F\u06CC \u0646\u0647\u0627\u06CC\u06CC\u060C \u0641\u0631\u0636\u200C\u0647\u0627\u060C \u0631\u06CC\u0633\u06A9\u200C\u0647\u0627 \u0648 \u0627\u0642\u062F\u0627\u0645 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0631\u0627 \u0646\u0634\u0627\u0646 \u0628\u062F\u0647." : " \u062D\u0627\u0644\u062A \u062A\u0641\u06A9\u0631 \u0639\u0645\u06CC\u0642 \u0641\u0639\u0627\u0644 \u0627\u0633\u062A \u0648 \u0627\u06CC\u0646 \u0627\u0648\u0644\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0627\u0633\u062A: \u0647\u0646\u0648\u0632 \u062A\u062D\u0644\u06CC\u0644 \u06A9\u0627\u0645\u0644 \u0631\u0627 \u0634\u0631\u0648\u0639 \u0646\u06A9\u0646. \u0627\u0628\u062A\u062F\u0627 (\u06F1) \u0628\u0631\u062F\u0627\u0634\u062A \u06A9\u0648\u062A\u0627\u0647\u062A \u0627\u0632 \u062E\u0648\u0627\u0633\u062A\u0647 \u0631\u0627 \u0628\u06AF\u0648\u060C (\u06F2) \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F3 \u062A\u0627 \u06F5 \u0633\u0648\u0627\u0644 \u062F\u0642\u06CC\u0642 \u0628\u0631\u0627\u06CC \u0631\u0641\u0639 \u0627\u0628\u0647\u0627\u0645 \u0628\u067E\u0631\u0633\u060C (\u06F3) \u06CC\u06A9 \u0637\u0631\u062D \u06A9\u0648\u062A\u0627\u0647 \u0627\u0632 \u0645\u0631\u0627\u062D\u0644 \u06A9\u0627\u0631\u06CC \u06A9\u0647 \u0627\u0646\u062C\u0627\u0645 \u062E\u0648\u0627\u0647\u06CC \u062F\u0627\u062F \u0627\u0631\u0627\u0626\u0647 \u0628\u062F\u0647\u060C \u0648 \u062F\u0631 \u067E\u0627\u06CC\u0627\u0646 \u0635\u0631\u06CC\u062D \u0627\u0632 \u06A9\u0627\u0631\u0628\u0631 \u0628\u062E\u0648\u0627\u0647 \u06A9\u0647 \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0646\u062F \u06CC\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0628\u062F\u0647\u062F \u062A\u0627 \u062A\u0641\u06A9\u0631 \u0639\u0645\u06CC\u0642 \u0631\u0627 \u0634\u0631\u0648\u0639 \u06A9\u0646\u06CC. \u062A\u0627 \u062A\u0627\u06CC\u06CC\u062F \u0646\u06AF\u0631\u0641\u062A\u0647\u200C\u0627\u06CC \u0648\u0627\u0631\u062F \u062A\u062D\u0644\u06CC\u0644 \u0639\u0645\u06CC\u0642 \u0646\u0634\u0648." : "";
  const systemContent = pageContext.intent === "process_guide" ? "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC KalamApp \u0647\u0633\u062A\u06CC\u062F. \u06A9\u0627\u0631\u0628\u0631 \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u06CC\u06A9 \u0641\u0631\u0622\u06CC\u0646\u062F \u0631\u0627 \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u062F. \u0627\u0648\u0644 \u0641\u0642\u0637 \u0627\u0632 process_guide.process_guide_context \u0648 \u0633\u067E\u0633 \u0627\u0632 ai_instructions\u060C \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0634\u0631\u06A9\u062A\u060C context \u0635\u0641\u062D\u0647 \u0648 \u062F\u0627\u0646\u0634 \u0633\u0627\u0632\u0645\u0627\u0646 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F. \u067E\u0627\u0633\u062E \u0628\u0627\u06CC\u062F \u0641\u0627\u0631\u0633\u06CC\u060C \u062F\u0642\u06CC\u0642\u060C \u0622\u0645\u0648\u0632\u0634\u06CC \u0648 \u0627\u062C\u0631\u0627\u06CC\u06CC \u0628\u0627\u0634\u062F. \u062A\u0631\u062A\u06CC\u0628 \u067E\u0627\u0633\u062E: 1) \u0646\u0645\u0627\u06CC \u06A9\u0644\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0641\u0631\u0622\u06CC\u0646\u062F 2) \u062A\u0648\u0636\u06CC\u062D \u0645\u0631\u062D\u0644\u0647\u200C\u0628\u0647\u200C\u0645\u0631\u062D\u0644\u0647 3) \u0628\u0631\u0627\u06CC \u0647\u0631 \u0645\u0631\u062D\u0644\u0647 \u0635\u0631\u06CC\u062D \u0628\u06AF\u0648\u06CC\u06CC\u062F \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633/\u0627\u0631\u062C\u0627\u0639\u200C\u0646\u0634\u062F\u0647 \u0627\u0633\u062A \u06CC\u0627 \u0641\u0639\u0627\u0644\u06CC\u062A \u0648\u0627\u0642\u0639\u06CC \u062F\u0627\u0631\u062F\u061B \u0627\u06AF\u0631 \u0641\u0639\u0627\u0644\u06CC\u062A \u0648\u0627\u0642\u0639\u06CC \u062F\u0627\u0631\u062F status/status_label \u0648 \u0627\u06CC\u0646\u06A9\u0647 \u0628\u0647 \u0634\u062E\u0635 \u06CC\u0627 \u0646\u0642\u0634/\u062A\u06CC\u0645 \u0627\u0631\u062C\u0627\u0639 \u0634\u062F\u0647 \u0631\u0627 \u0630\u06A9\u0631 \u06A9\u0646\u06CC\u062F 4) \u0628\u0631\u0627\u06CC \u0647\u0631 \u0645\u0631\u062D\u0644\u0647 \u0628\u06AF\u0648\u06CC\u06CC\u062F \u0627\u06AF\u0631 \u0627\u0646\u062C\u0627\u0645 \u0634\u0648\u062F \u0686\u0647 \u067E\u06CC\u0627\u0645\u060C \u0627\u0639\u0644\u0627\u0646 \u06CC\u0627 \u0627\u0642\u062F\u0627\u0645 \u062E\u0648\u062F\u06A9\u0627\u0631\u06CC \u0631\u062E \u0645\u06CC\u200C\u062F\u0647\u062F \u0648 \u0645\u062E\u0627\u0637\u0628 \u0622\u0646 \u06A9\u06CC\u0633\u062A 5) \u0634\u0631\u0637\u200C\u0647\u0627\u060C \u0641\u06CC\u0644\u062F\u0647\u0627 \u0648 \u0627\u06A9\u0634\u0646\u200C\u0647\u0627 \u0631\u0627 \u0628\u0627 label \u0641\u0627\u0631\u0633\u06CC \u0645\u0648\u062C\u0648\u062F \u062F\u0631 context \u062A\u0648\u0636\u06CC\u062D \u062F\u0647\u06CC\u062F 6) \u0647\u0631 \u0627\u0628\u0647\u0627\u0645 \u06CC\u0627 \u062F\u0627\u062F\u0647 \u0646\u0627\u0642\u0635 \u0631\u0627 \u0635\u0631\u06CC\u062D \u0627\u0639\u0644\u0627\u0645 \u06A9\u0646\u06CC\u062F. \u0627\u06AF\u0631 \u0627\u062A\u0648\u0645\u0627\u0633\u06CC\u0648\u0646\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F\u060C \u0634\u0641\u0627\u0641 \u0628\u06AF\u0648\u06CC\u06CC\u062F \u06A9\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u0648 \u0686\u06CC\u0632\u06CC \u062D\u062F\u0633 \u0646\u0632\u0646\u06CC\u062F." : `\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC KalamApp \u0647\u0633\u062A\u06CC\u062F. \u0647\u0648\u06CC\u062A \u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634\u0645\u0646\u062F \u0647\u0645\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u062F\u0627\u062E\u0644 KalamApp \u0627\u0633\u062A\u060C \u0646\u0647 \u06CC\u06A9 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0639\u0645\u0648\u0645\u06CC. \u0627\u0648\u0644 \u0627\u0632 ai_instructions \u0648 \u0628\u0639\u062F \u0627\u0632 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0634\u0631\u06A9\u062A\u060C \u0648\u0627\u062D\u062F \u067E\u0648\u0644\u060C \u0646\u0642\u0634 \u0648 \u062C\u0627\u06CC\u06AF\u0627\u0647 \u06A9\u0627\u0631\u0628\u0631\u060C organization_directory \u0647\u0645\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646\u060C Context \u0645\u062C\u0627\u0632 \u0635\u0641\u062D\u0647\u060C Context\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC\u200C\u0634\u062F\u0647 \u0648 \u062F\u0627\u0646\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.${webSearchResults.length ? " \u0627\u06AF\u0631 web_search_results \u062F\u0627\u062F\u0647 \u0634\u062F\u0647\u060C \u0627\u0632 \u0622\u0646 \u0628\u0631\u0627\u06CC \u0633\u0648\u0627\u0644\u0627\u062A \u0645\u0631\u0628\u0648\u0637 \u0628\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062C\u0627\u0631\u06CC \u0648 \u062E\u0627\u0631\u062C \u0627\u0632 \u0633\u0627\u0632\u0645\u0627\u0646 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646 \u0648 \u0645\u0646\u0628\u0639 \u0631\u0627 \u0630\u06A9\u0631 \u06A9\u0646." : ""}${legalInstruction}${reasoningInstruction} \u0627\u06AF\u0631 business_analytics \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A\u060C \u0628\u0631\u0627\u06CC \u0633\u0648\u0627\u0644\u200C\u0647\u0627\u06CC \u0645\u0627\u0644\u06CC \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0622\u0646 \u0631\u0627 \u0645\u0646\u0628\u0639 \u0627\u0635\u0644\u06CC \u0627\u0639\u062F\u0627\u062F \u0628\u062F\u0627\u0646. \u0628\u0627\u0632\u0647 \u062F\u0642\u06CC\u0642 period \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0630\u06A9\u0631 \u06A9\u0646. accounting \u0641\u0642\u0637 \u0627\u0632 \u0627\u0633\u0646\u0627\u062F \u062D\u0633\u0627\u0628\u062F\u0627\u0631\u06CC posted \u0633\u0627\u062E\u062A\u0647 \u0634\u062F\u0647 \u0648 \u0645\u0646\u0628\u0639 \u0645\u0639\u062A\u0628\u0631 \u0633\u0648\u062F \u0648 \u0632\u06CC\u0627\u0646 \u0627\u0633\u062A. operational \u062A\u0642\u0631\u06CC\u0628\u06CC \u0648 \u0645\u06A9\u0645\u0644 \u0627\u0633\u062A\u061B \u0641\u0631\u0648\u0634\u060C \u062E\u0631\u06CC\u062F \u0648 \u0647\u0632\u06CC\u0646\u0647 \u0639\u0645\u0644\u06CC\u0627\u062A\u06CC \u0631\u0627 \u0628\u0627 \u0633\u0648\u062F \u062E\u0627\u0644\u0635 \u062D\u0633\u0627\u0628\u062F\u0627\u0631\u06CC \u06CC\u06A9\u06CC \u0646\u06A9\u0646. \u0627\u06AF\u0631 accounting.available=false \u06CC\u0627 data_quality=operational_only \u0627\u0633\u062A\u060C \u0635\u0631\u06CC\u062D \u0628\u06AF\u0648 \u0633\u0648\u062F \u0648 \u0632\u06CC\u0627\u0646 \u0642\u0637\u0639\u06CC \u0628\u0647\u200C\u062F\u0644\u06CC\u0644 \u0646\u0628\u0648\u062F \u062F\u0627\u062F\u0647 posted \u06A9\u0627\u0641\u06CC \u0642\u0627\u0628\u0644 \u0645\u062D\u0627\u0633\u0628\u0647 \u0646\u06CC\u0633\u062A \u0648 \u0641\u0642\u0637 \u0634\u0627\u062E\u0635\u200C\u0647\u0627\u06CC \u0639\u0645\u0644\u06CC\u0627\u062A\u06CC \u0631\u0627 \u06AF\u0632\u0627\u0631\u0634 \u06A9\u0646. \u0627\u06AF\u0631 unposted_entry_count \u0628\u06CC\u0634\u062A\u0631 \u0627\u0632 \u0635\u0641\u0631 \u0627\u0633\u062A\u060C \u062F\u0631\u0628\u0627\u0631\u0647 \u0646\u0627\u0642\u0635\u200C\u0628\u0648\u062F\u0646 \u0627\u062D\u062A\u0645\u0627\u0644\u06CC \u062F\u0648\u0631\u0647 \u0647\u0634\u062F\u0627\u0631 \u0628\u062F\u0647. \u0627\u06AF\u0631 business_analytics.reason=permission_denied \u0627\u0633\u062A \u0641\u0642\u0637 \u062F\u0631 \u0647\u0645\u0627\u0646 \u062D\u0627\u0644\u062A \u0628\u06AF\u0648 \u0645\u062C\u0648\u0632 \u0644\u0627\u0632\u0645 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F\u061B \u062F\u0631 \u0633\u0627\u06CC\u0631 \u062E\u0637\u0627\u0647\u0627\u06CC retrieval \u0627\u062F\u0639\u0627\u06CC \u0646\u062F\u0627\u0634\u062A\u0646 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u06A9\u0646. \u0627\u06AF\u0631 \u06A9\u0627\u0631\u0628\u0631 \u062F\u0631\u0628\u0627\u0631\u0647 \u0627\u06CC\u0646\u06A9\u0647 \u0686\u0647 \u06A9\u0633\u06CC \u0686\u0647 \u0646\u0642\u0634\u06CC \u062F\u0627\u0631\u062F\u060C \u0645\u062F\u06CC\u0631\u0627\u0646 \u0686\u0647 \u06A9\u0633\u0627\u0646\u06CC \u0647\u0633\u062A\u0646\u062F\u060C \u06CC\u0627 \u0686\u0647 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0639\u0636\u0648 \u0686\u0647 \u062A\u06CC\u0645\u06CC \u0627\u0633\u062A \u067E\u0631\u0633\u06CC\u062F\u060C \u0641\u0642\u0637 \u0627\u0632 organization_directory \u067E\u0627\u0633\u062E \u0628\u062F\u0647. \u0627\u06AF\u0631 \u0641\u0631\u062F \u06CC\u0627 \u0646\u0642\u0634 \u062F\u0631 organization_directory \u0646\u06CC\u0633\u062A\u060C \u0635\u0631\u06CC\u062D \u0628\u06AF\u0648 \u062F\u0631 \u062F\u0627\u06CC\u0631\u06A9\u062A\u0648\u0631\u06CC \u0645\u062C\u0627\u0632 \u0647\u0645\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F. \u0648\u0627\u062D\u062F \u067E\u0648\u0644 \u0631\u0627 \u0641\u0642\u0637 \u0627\u0632 company.currency_label/company.currency_code \u0628\u06AF\u0648\u06CC\u06CC\u062F \u0648 \u0627\u06AF\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0628\u0648\u062F \u0639\u062F\u0645 \u0642\u0637\u0639\u06CC\u062A \u0631\u0627 \u0627\u0639\u0644\u0627\u0645 \u06A9\u0646\u06CC\u062F. \u062F\u0633\u062A\u0631\u0633\u06CC \u0631\u0627 \u0628\u0631 \u0627\u0633\u0627\u0633 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0645\u0648\u062C\u0648\u062F \u062F\u0631 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0631\u0639\u0627\u06CC\u062A \u06A9\u0646\u06CC\u062F\u061B \u0627\u06AF\u0631 \u062F\u0627\u062F\u0647\u200C\u0627\u06CC \u062F\u0631 Context\u0647\u0627 \u0646\u06CC\u0633\u062A\u060C \u0646\u06AF\u0648\u06CC\u06CC\u062F \u0642\u0637\u0639\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u062F\u0627\u0631\u062F\u060C \u0628\u06AF\u0648\u06CC\u06CC\u062F \u062F\u0631 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC\u200C\u0634\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u0634\u0646\u0627\u0633\u0647/\u0646\u0627\u0645 \u062F\u0642\u06CC\u0642\u200C\u062A\u0631\u06CC \u0644\u0627\u0632\u0645 \u0627\u0633\u062A. \u0647\u0631\u06AF\u0632 \u062F\u0627\u062F\u0647\u200C\u0627\u06CC \u0627\u0632 \u0633\u0627\u0632\u0645\u0627\u0646 \u062F\u06CC\u06AF\u0631 \u0641\u0631\u0636 \u0646\u06A9\u0646. \u067E\u0627\u0633\u062E\u200C\u0647\u0627 \u0641\u0627\u0631\u0633\u06CC\u060C \u062F\u0642\u06CC\u0642\u060C \u06A9\u0648\u062A\u0627\u0647 \u0648 \u0627\u062C\u0631\u0627\u06CC\u06CC \u0628\u0627\u0634\u0646\u062F. \u0647\u06CC\u0686 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0627\u062F\u0647\u060C \u062B\u0628\u062A \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u06CC\u0627 \u0627\u0642\u062F\u0627\u0645 \u0639\u0645\u0644\u06CC\u0627\u062A\u06CC \u0627\u0646\u062C\u0627\u0645 \u0646\u062F\u0647\u06CC\u062F. \u0627\u06AF\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0627\u0631\u0628\u0631 \u0645\u0628\u0647\u0645 \u0627\u0633\u062A \u06CC\u0627 \u0628\u0631\u0627\u06CC \u067E\u0627\u0633\u062E \u062F\u0631\u0633\u062A \u0628\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0628\u06CC\u0634\u062A\u0631\u06CC \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u06CC\u060C \u0628\u0647\u200C\u062C\u0627\u06CC \u062D\u062F\u0633\u200C\u0632\u062F\u0646\u060C \u0627\u0648\u0644 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F2 \u062A\u0627 \u06F3 \u0633\u0648\u0627\u0644 \u06A9\u0648\u062A\u0627\u0647 \u0648 \u062F\u0642\u06CC\u0642 \u0628\u067E\u0631\u0633. \u0648\u0642\u062A\u06CC \u062E\u0631\u0648\u062C\u06CC \u0628\u0647\u200C\u0635\u0648\u0631\u062A \u0641\u0627\u06CC\u0644 \u0642\u0627\u0628\u0644\u200C\u062F\u0627\u0646\u0644\u0648\u062F (Word\u060C Excel\u060C PDF) \u0628\u0631\u0627\u06CC \u06A9\u0627\u0631\u0628\u0631 \u0645\u0641\u06CC\u062F\u062A\u0631 \u0627\u0633\u062A (\u0645\u062B\u0644 \u06AF\u0632\u0627\u0631\u0634\u060C \u062C\u062F\u0648\u0644 \u062F\u0627\u062F\u0647\u060C \u0642\u0631\u0627\u0631\u062F\u0627\u062F\u060C \u0635\u0648\u0631\u062A\u200C\u062D\u0633\u0627\u0628 \u06CC\u0627 \u0641\u0647\u0631\u0633\u062A \u0628\u0644\u0646\u062F)\u060C \u062F\u0631 \u067E\u0627\u06CC\u0627\u0646 \u067E\u0627\u0633\u062E \u0628\u0647\u200C\u0635\u0648\u0631\u062A \u06A9\u0648\u062A\u0627\u0647 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0628\u062F\u0647 \u06A9\u0647 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC \u0647\u0645\u0627\u0646 \u0631\u0627 \u0628\u0647\u200C\u0635\u0648\u0631\u062A \u0641\u0627\u06CC\u0644 \u0628\u0633\u0627\u0632\u06CC \u0648 \u0627\u0632 \u06A9\u0627\u0631\u0628\u0631 \u0628\u062E\u0648\u0627\u0647 \u0639\u0645\u0644\u06AF\u0631 \xAB\u0633\u0627\u062E\u062A \u0641\u0627\u06CC\u0644\xBB \u0631\u0627 \u0641\u0639\u0627\u0644 \u06A9\u0646\u062F.`;
  const historyMessages = (historyRows || []).filter((item) => ["user", "assistant"].includes(String(item?.role || ""))).slice(-12).map((item) => ({
    role: String(item.role),
    content: String(item.content || "").slice(0, 3e3)
  }));
  return [
    {
      role: "system",
      content: systemContent
    },
    ...historyMessages,
    {
      role: "user",
      content: `Context \u0645\u062C\u0627\u0632 \u0648 \u0633\u0648\u0627\u0644 \u06A9\u0627\u0631\u0628\u0631:
${JSON.stringify(contextPayload, null, 2)}`
    }
  ];
};
var extractUsageMetadata = (parsed, providerConfig) => {
  const usage = parsed?.usage || parsed?.choices?.[0]?.usage || parsed?.usage_info || null;
  const billing = parsed?.estimated_cost || parsed?.billing || parsed?.cost || parsed?.usage_cost || parsed?.charge || parsed?.choices?.[0]?.billing || null;
  const cost = {};
  if (billing && typeof billing === "object") Object.assign(cost, billing);
  if (typeof billing === "number") cost.amount = billing;
  ["cost", "cost_usd", "usd", "amount", "amount_usd", "rial", "rials", "toman", "tomans", "amount_rial", "amount_toman", "currency"].forEach((key) => {
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, key)) cost[key] = parsed[key];
  });
  return {
    provider: providerConfig.provider,
    model: providerConfig.model,
    capability: providerConfig.capability || null,
    usage,
    cost: Object.keys(cost).length ? cost : null
  };
};
var loadModelPricing = async (supabaseUrl, serviceRoleKey, model) => {
  const modelId = String(model || "").trim();
  if (!modelId) return null;
  try {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
      id: `eq.${modelId}`,
      select: "*",
      limit: 1
    });
    return rows[0] || null;
  } catch {
    return null;
  }
};
var numberFrom = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
var estimateAiCharge = (usageMetadata, pricing, fallbackMargin = DEFAULT_AI_MARGIN_PERCENT) => {
  const usage = usageMetadata?.usage || {};
  const cost = usageMetadata?.cost || {};
  const promptTokens = numberFrom(usage.prompt_tokens ?? usage.prompt ?? usage.input_tokens ?? usage.input, 0);
  const completionTokens = numberFrom(usage.completion_tokens ?? usage.completion ?? usage.output_tokens ?? usage.output, 0);
  const rawUnitFromProvider = numberFrom(cost.unit ?? cost.usd ?? cost.cost_usd ?? cost.amount_usd, NaN);
  const rawIrtFromProvider = numberFrom(cost.irt ?? cost.rial ?? cost.rials ?? cost.amount_rial, NaN);
  const exchangeRate = numberFrom(cost.exchange_rate ?? pricing?.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT);
  const marginPercent = numberFrom(pricing?.margin_percent, fallbackMargin);
  const inputRate = numberFrom(pricing?.input_usd_per_1m, 0);
  const outputRate = numberFrom(pricing?.output_usd_per_1m, 0);
  const estimatedUnit = Number.isFinite(rawUnitFromProvider) ? rawUnitFromProvider : (promptTokens * inputRate + completionTokens * outputRate) / 1e6;
  const rawCostIrt = Number.isFinite(rawIrtFromProvider) ? rawIrtFromProvider : estimatedUnit * exchangeRate;
  const billedAmountIrt = Math.ceil(Math.max(0, rawCostIrt) * (1 + Math.max(0, marginPercent) / 100));
  return {
    rawCostUnit: Number(estimatedUnit.toFixed(10)),
    rawCostIrt: Math.ceil(rawCostIrt),
    billedAmountIrt,
    marginPercent,
    exchangeRate
  };
};
var recordAiUsageLedger = async (supabaseUrl, serviceRoleKey, authContext, args) => {
  if (!authContext?.orgId) return null;
  try {
    const settings = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
    const pricing = await loadModelPricing(supabaseUrl, serviceRoleKey, args.model);
    const charge = estimateAiCharge(args.usageMetadata, pricing, numberFrom(settings?.default_margin_percent, DEFAULT_AI_MARGIN_PERCENT));
    const rows = await restInsert(supabaseUrl, serviceRoleKey, "org_ai_usage_ledger", [{
      org_id: authContext.orgId,
      user_id: authContext.userId || null,
      thread_id: args.threadId || null,
      message_id: args.messageId || null,
      avalai_request_id: args.requestId || null,
      capability: args.capability || "dashboard_chat",
      provider: args.provider || "avalai",
      model: args.model || "",
      status: args.status || "finalized",
      raw_cost_unit: charge.rawCostUnit,
      raw_cost_irt: charge.rawCostIrt,
      billed_amount_irt: charge.billedAmountIrt,
      margin_percent: charge.marginPercent,
      exchange_rate_irt: charge.exchangeRate,
      usage: args.usageMetadata || {},
      metadata: args.metadata || {},
      finalized_at: (/* @__PURE__ */ new Date()).toISOString()
    }]);
    return rows[0] || null;
  } catch (error) {
    console.warn("AI usage ledger insert skipped", error);
    return null;
  }
};
var withCustomerBilling = (usageMetadata, ledger) => {
  if (!usageMetadata || !ledger) return usageMetadata;
  return {
    ...usageMetadata,
    customer_billing: {
      amount_irt: numberFrom(ledger?.billed_amount_irt, 0),
      margin_percent: numberFrom(ledger?.margin_percent, 0),
      exchange_rate_irt: numberFrom(ledger?.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT),
      ledger_id: ledger?.id || null
    }
  };
};
var patchAiMessageCustomerBilling = async (supabaseUrl, serviceRoleKey, authContext, message, usageMetadata, ledger) => {
  if (!message?.id || !ledger) return;
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_messages", {
    id: `eq.${message.id}`,
    org_id: `eq.${authContext.orgId}`,
    select: "id,metadata",
    limit: 1
  }).catch(() => []);
  const rowMetadata = rows?.[0]?.metadata && typeof rows[0].metadata === "object" ? rows[0].metadata : null;
  const currentMetadata = rowMetadata || (message?.metadata && typeof message.metadata === "object" ? message.metadata : {});
  await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", {
    id: `eq.${message.id}`,
    org_id: `eq.${authContext.orgId}`
  }, {
    metadata: {
      ...currentMetadata,
      usage: withCustomerBilling(usageMetadata, ledger)
    }
  }).catch((error) => console.warn("AI message billing patch skipped", error));
};
var REASONING_MODEL_PATTERNS = [
  /^o\d/i,
  // OpenAI: o1, o3, o4
  /\bo[34][-_]/i,
  // OpenAI: o3-mini, o4-mini
  /^gpt-5/i,
  // OpenAI: gpt-5, gpt-5-mini, gpt-5.4 family
  /deepseek-r\d/i,
  // DeepSeek: deepseek-r1, deepseek-r2
  /\breasonin/i,
  // any model with "reasoning" in name
  /\bqwq\b/i,
  // Alibaba QwQ
  /kimi.thinking/i,
  // Moonshot Kimi Thinking
  /grok.*\breason/i
  // Grok reasoning variants
];
var isReasoningModel = (model) => REASONING_MODEL_PATTERNS.some((p) => p.test(String(model || "").trim()));
var shortenProviderError = (raw) => {
  const text = String(raw || "").trim();
  if (/credit has been exhausted|don't have enough credit|not enough credit|top up your account|ava\.al\/billing/i.test(text)) {
    return "\u0627\u0639\u062A\u0628\u0627\u0631 \u062D\u0633\u0627\u0628 Avalai \u062A\u0645\u0627\u0645 \u0634\u062F\u0647 \u06CC\u0627 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A. \u0627\u0639\u062A\u0628\u0627\u0631 \u067E\u0646\u0644 Avalai \u0631\u0627 \u0634\u0627\u0631\u0698 \u06A9\u0646\u06CC\u062F \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.";
  }
  if (/upstream server is timing out|workerrequestcancelled|request has been cancelled|gateway.*time-?out|timed out|timeout/i.test(text)) {
    return "\u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u0632\u0645\u0627\u0646 \u0645\u0646\u0627\u0633\u0628 \u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F. \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u062F\u0644 \u0633\u0631\u06CC\u0639\u200C\u062A\u0631\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.";
  }
  const isHtml = /<html|<!doctype/i.test(text);
  if (isHtml && /gateway timeout|error\s*504|خطای ۵۰۴|\b504\b/i.test(text)) {
    return "\u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0645\u0648\u0642\u062A\u0627\u064B \u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F (Gateway Timeout). \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.";
  }
  if (isHtml) {
    const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.slice(0, 200) || "\u062E\u0637\u0627\u06CC \u0645\u0648\u0642\u062A \u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC.";
  }
  return text.length > 400 ? `${text.slice(0, 400)}\u2026` : text;
};
var CHAT_COMPLETIONS_TIMEOUT_MS = PROVIDER_REQUEST_TIMEOUT_MS;
var callChatCompletions = async (providerConfig, messages, options) => {
  if (providerConfig?.isActive === false) {
    throw new Error("\u0627\u062A\u0635\u0627\u0644 AI \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A.");
  }
  if (!providerConfig.apiKey) {
    throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u0642\u062F\u0627\u0631 AI_API_KEY \u06CC\u0627 AVALAI_API_KEY \u0631\u0627 \u062F\u0631 Edge Function secrets \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F.");
  }
  const primaryModel = String(providerConfig.model || "").trim();
  if (!primaryModel) throw new Error("\u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0642\u0627\u0628\u0644\u06CC\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const modelsToTry = [primaryModel];
  let lastErrorMessage = "";
  for (let attempt = 0; attempt < modelsToTry.length; attempt += 1) {
    const model = modelsToTry[attempt];
    const reasoning = isReasoningModel(model);
    const requestBody = {
      model,
      messages,
      safety_identifier: options?.safetyIdentifier || void 0
    };
    if (reasoning) {
      requestBody.max_completion_tokens = options?.maxCompletionTokens ?? options?.maxTokens ?? 2500;
    } else {
      requestBody.temperature = options?.temperature ?? 0.2;
      requestBody.max_tokens = options?.maxTokens ?? 2e3;
    }
    let response;
    let baseUrl;
    try {
      const result = await requestAvalaiWithFallback(providerConfig, "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options?.timeoutMs ?? CHAT_COMPLETIONS_TIMEOUT_MS)
      }, { disableFallback: true });
      response = result.response;
      baseUrl = result.baseUrl;
    } catch (error) {
      lastErrorMessage = String(error?.message || "\u0627\u062A\u0635\u0627\u0644 \u0628\u0647 \u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F.");
      continue;
    }
    const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      const message = typeof parsed === "string" ? parsed : parsed?.error?.message || (raw && raw.length < 600 ? raw : `status ${response.status}`);
      lastErrorMessage = String(message);
      throw new Error(`\u062E\u0637\u0627\u06CC provider \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC: ${shortenProviderError(message)}`);
    }
    const content = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || "";
    return {
      content: String(content || "").trim(),
      provider: providerConfig.provider,
      model,
      requestId,
      baseUrl,
      raw: parsed,
      usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model })
    };
  }
  throw new Error(`\u062E\u0637\u0627\u06CC provider \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC: ${shortenProviderError(lastErrorMessage || "\u0633\u0631\u0648\u06CC\u0633 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.")}`);
};
var normalizeBase64Payload = (value, mimeType) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:[^;]+;base64,/i.test(raw)) return raw;
  const mime = String(mimeType || "").trim();
  return mime ? `data:${mime};base64,${raw.replace(/^data:[^;]+;base64,/i, "")}` : raw.replace(/^data:[^;]+;base64,/i, "");
};
var getPublicSupabaseUrl = (supabaseUrl) => {
  const explicit = [
    Deno.env.get("SUPABASE_PUBLIC_URL"),
    Deno.env.get("PUBLIC_SUPABASE_URL"),
    Deno.env.get("EXTERNAL_SUPABASE_URL"),
    Deno.env.get("VITE_SUPABASE_URL")
  ].map((item) => String(item || "").trim()).find(Boolean);
  const raw = explicit || supabaseUrl;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "kong" || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".internal")) {
      return "https://api.tazesystem.ir";
    }
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "https://api.tazesystem.ir";
  }
};
var buildOpenAiFileContentPart = (file) => {
  const base64 = normalizeBase64Payload(
    file?.data || file?.base64 || file?.file_data || file?.fileData,
    file?.mimeType || file?.mime_type || file?.type || null
  );
  if (!base64) return null;
  const filename = String(file?.filename || file?.fileName || file?.name || "uploaded-file").trim() || "uploaded-file";
  return {
    type: "file",
    file: {
      filename,
      file_data: base64
    }
  };
};
var buildOpenAiInputContentParts = (text, file) => {
  const parts = [{ type: "text", text }];
  const mimeType = String(file?.mimeType || file?.mime_type || file?.type || "").trim().toLowerCase();
  const data = normalizeBase64Payload(
    file?.data || file?.base64 || file?.file_data || file?.fileData,
    mimeType || null
  );
  if (data && mimeType.startsWith("image/")) {
    parts.push({ type: "image_url", image_url: { url: data } });
    return parts;
  }
  const filePart = buildOpenAiFileContentPart(file || {});
  if (filePart) parts.push(filePart);
  return parts;
};
var extractJsonObjectFromText = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withoutFence = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const candidates = [withoutFence];
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(withoutFence.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
    }
  }
  return null;
};
var normalizeAiRecordValue = (value, field) => {
  if (value === void 0 || value === "") return null;
  if (value === null) return null;
  const type = String(field?.type || "").trim();
  if (["number", "price", "percentage", "stock", "percentage_or_amount"].includes(type)) {
    const normalized = Number(String(value).replace(/[,\s]/g, ""));
    return Number.isFinite(normalized) ? normalized : null;
  }
  if (type === "checkbox") return value === true || String(value).trim().toLowerCase() === "true" || String(value).trim() === "1" || String(value).trim() === "\u0628\u0644\u0647";
  if (type === "multi_select" || type === "multi_relation") {
    return Array.isArray(value) ? value : [value].filter((item) => item !== null && item !== void 0 && item !== "");
  }
  if (type === "select" || type === "status") {
    const allowed = Array.isArray(field?.options) ? field.options.map((option) => String(option?.value ?? "").trim()).filter(Boolean) : [];
    const normalized = String(value || "").trim();
    if (!allowed.length || allowed.includes(normalized)) return normalized || null;
    const byLabel = (field.options || []).find((option) => String(option?.label || "").trim() === normalized);
    return byLabel ? byLabel.value : null;
  }
  return value;
};
var sanitizeAiRecordPayload = (rawPayload, schema) => {
  const blockedKeys = /* @__PURE__ */ new Set([
    "id",
    "org_id",
    "system_code",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at"
  ]);
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const allowed = new Map(
    fields.map((field) => [String(field?.key || "").trim(), field]).filter(([key]) => key && !blockedKeys.has(key))
  );
  const rawFields = rawPayload?.fields && typeof rawPayload.fields === "object" ? rawPayload.fields : rawPayload;
  const payload = {};
  Object.entries(rawFields || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    const field = allowed.get(normalizedKey);
    if (!field) return;
    payload[normalizedKey] = normalizeAiRecordValue(value, field);
  });
  return payload;
};
var buildAiRecordTitle = (record, fallback) => {
  const candidates = [
    record?.system_code,
    record?.name,
    record?.title,
    record?.full_name,
    record?.business_name,
    record?.invoice_number,
    record?.description
  ];
  const value = candidates.map((item) => String(item || "").trim()).find(Boolean);
  return value || fallback || "\u0631\u06A9\u0648\u0631\u062F \u062C\u062F\u06CC\u062F";
};
var normalizeAiClarificationQuestions = (value) => (Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
var buildAiClarificationReply = (reply, questions) => {
  const base = reply.trim() || "\u0628\u0631\u0627\u06CC \u0627\u0646\u062C\u0627\u0645 \u062F\u0642\u06CC\u0642 \u0627\u06CC\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u0647 \u0686\u0646\u062F \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062A\u06A9\u0645\u06CC\u0644\u06CC \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u0645.";
  if (!questions.length) return base;
  return [
    base,
    "",
    ...questions.map((question, index) => `${index + 1}. ${question}`)
  ].join("\n");
};
var callEmbeddings = async (providerConfig, input, model = DEFAULT_EMBEDDING_MODEL) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input,
      encoding_format: "float"
    })
  });
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || JSON.stringify(parsed || {});
    throw new Error(`\u062E\u0637\u0627\u06CC embedding \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC: ${message}`);
  }
  const embedding = parsed?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("\u067E\u0627\u0633\u062E embedding \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  return {
    embedding,
    requestId,
    baseUrl,
    usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: "embedding" })
  };
};
var WEB_SEARCH_TRIGGER_PATTERNS = [
  /امروز|دیروز|این هفته|این ماه|الان|فعلی|اخیر/,
  /آخرین|جدیدترین|تازه‌ترین|جدید/,
  /اخبار|خبر|رویداد/,
  /قیمت.*(دلار|ارز|طلا|بیتکوین|سهام)/,
  /نرخ.*(ارز|دلار|یورو)/,
  /today|latest|current|news|price/i
];
var shouldTriggerWebSearch = (message) => WEB_SEARCH_TRIGGER_PATTERNS.some((p) => p.test(message));
var callWebSearch = async (providerConfig, query, model = "", numResults = 5, required = false) => {
  if (!providerConfig.apiKey) {
    if (required) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AvalAI \u0628\u0631\u0627\u06CC \u062C\u0633\u062A\u062C\u0648\u06CC \u0648\u0628 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
    return { results: [], requestId: null };
  }
  const base = normalizeBaseUrl(providerConfig.baseUrl || DEFAULT_AI_BASE_URL).replace(/\/v\d+$/i, "");
  const url = `${base}/v1/search`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, query, num_results: numResults }),
      signal: AbortSignal.timeout(12e3)
    });
    const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      if (required) {
        const message = typeof parsed === "string" ? parsed : parsed?.error?.message || parsed?.message || raw || "\u062C\u0633\u062A\u062C\u0648\u06CC \u0648\u0628 \u062F\u0631 AvalAI \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.";
        throw new Error(`\u062E\u0637\u0627\u06CC \u062C\u0633\u062A\u062C\u0648\u06CC \u0648\u0628 AvalAI: ${message}`);
      }
      return { results: [], requestId };
    }
    const rawResults = Array.isArray(parsed?.results) ? parsed.results : Array.isArray(parsed?.organic) ? parsed.organic : Array.isArray(parsed) ? parsed : [];
    const results = rawResults.slice(0, numResults).map((item) => ({
      title: String(item?.title || item?.name || "").trim(),
      url: String(item?.url || item?.link || "").trim(),
      snippet: String(item?.snippet || item?.description || item?.content || "").slice(0, 400).trim()
    })).filter((item) => item.title || item.snippet);
    return { results, requestId };
  } catch (error) {
    if (required) throw error;
    return { results: [], requestId: null };
  }
};
var isGeminiImageModel = (model) => /^gemini[-.\d]*.*image/i.test(String(model || "").trim());
var buildImagePromptWithSettings = (prompt, settings = {}) => {
  const instructions = [];
  if (settings?.persianText === true) {
    instructions.push("\u0627\u06AF\u0631 \u062A\u0635\u0648\u06CC\u0631 \u0634\u0627\u0645\u0644 \u0646\u0648\u0634\u062A\u0647\u060C \u062A\u06CC\u062A\u0631\u060C \u062A\u0627\u0628\u0644\u0648\u060C \u067E\u0648\u0633\u062A\u0631 \u06CC\u0627 \u0639\u062F\u062F \u0627\u0633\u062A\u060C \u0645\u062A\u0646\u200C\u0647\u0627 \u0631\u0627 \u0641\u0627\u0631\u0633\u06CC \u0648 \u0637\u0628\u06CC\u0639\u06CC \u0628\u0646\u0648\u06CC\u0633.");
  }
  if (settings?.persianDigits === true) {
    instructions.push("\u0647\u0645\u0647 \u0639\u062F\u062F\u0647\u0627\u06CC \u0642\u0627\u0628\u0644 \u0645\u0634\u0627\u0647\u062F\u0647 \u062F\u0627\u062E\u0644 \u062A\u0635\u0648\u06CC\u0631 \u0631\u0627 \u0628\u0627 \u0627\u0631\u0642\u0627\u0645 \u0641\u0627\u0631\u0633\u06CC \u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9 \u0646\u0645\u0627\u06CC\u0634 \u0628\u062F\u0647.");
  }
  if (settings?.rtlText === true) {
    instructions.push("\u0686\u06CC\u062F\u0645\u0627\u0646 \u0646\u0648\u0634\u062A\u0647\u200C\u0647\u0627 \u0628\u0627\u06CC\u062F \u0631\u0627\u0633\u062A\u200C\u0628\u0647\u200C\u0686\u067E\u060C \u0631\u0627\u0633\u062A\u200C\u0686\u06CC\u0646 \u0648 \u0645\u0646\u0627\u0633\u0628 \u0632\u0628\u0627\u0646 \u0641\u0627\u0631\u0633\u06CC \u0628\u0627\u0634\u062F.");
  }
  if (settings?.orientationHorizontal === true) {
    instructions.push("\u06A9\u0627\u062F\u0631 \u0646\u0647\u0627\u06CC\u06CC \u0627\u0641\u0642\u06CC \u0628\u0627\u0634\u062F.");
  } else if (settings?.orientationVertical === true) {
    instructions.push("\u06A9\u0627\u062F\u0631 \u0646\u0647\u0627\u06CC\u06CC \u0639\u0645\u0648\u062F\u06CC \u0628\u0627\u0634\u062F.");
  }
  if (!instructions.length) return prompt;
  return `${prompt}

\u0627\u0644\u0632\u0627\u0645\u0627\u062A \u062E\u0631\u0648\u062C\u06CC \u062A\u0635\u0648\u06CC\u0631:
${instructions.map((item) => `- ${item}`).join("\n")}`;
};
var clampImagePrompt = (value) => {
  const text = String(value || "").trim();
  if (text.length <= IMAGE_PROMPT_MAX_CHARS) return text;
  return text.slice(0, IMAGE_PROMPT_MAX_CHARS).trim();
};
var appendImageContextToPrompt = (prompt, args) => {
  const contextLines = [];
  const company = args.companyContext || {};
  const companyName = String(company.trade_name || company.company_name || company.organization_name || "").trim();
  if (companyName) contextLines.push(`\u0646\u0627\u0645 \u0633\u0627\u0632\u0645\u0627\u0646/\u0628\u0631\u0646\u062F: ${companyName}`);
  if (company.company_name_en) contextLines.push(`\u0646\u0627\u0645 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u0628\u0631\u0646\u062F: ${company.company_name_en}`);
  if (company.website) contextLines.push(`\u0648\u0628\u200C\u0633\u0627\u06CC\u062A: ${company.website}`);
  if (args.pageSummary) contextLines.push(`\u0632\u0645\u06CC\u0646\u0647 \u0635\u0641\u062D\u0647: ${String(args.pageSummary).slice(0, 300)}`);
  const knowledge = (args.knowledgeChunks || []).map((item) => String(item?.content || item?.text || "").trim()).filter(Boolean).slice(0, 2);
  if (knowledge.length) {
    contextLines.push(`\u062F\u0627\u0646\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0645\u0631\u062A\u0628\u0637:
${knowledge.map((item) => `- ${item.replace(/\s+/g, " ").slice(0, 240)}`).join("\n")}`);
  }
  if (!contextLines.length) return prompt;
  return clampImagePrompt(`${prompt}

\u0632\u0645\u06CC\u0646\u0647 \u0645\u062C\u0627\u0632 \u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u062F\u0631 \u062A\u0635\u0648\u06CC\u0631:
${contextLines.join("\n")}`);
};
var callGeminiImageGenerate = async (providerConfig, prompt, options = {}) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const model = String(providerConfig.model || "").trim();
  if (!model) throw new Error("\u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const parts = [{ text: prompt }];
  for (const src of options.sourceImages || []) {
    const data = String(src?.data || "").replace(/^data:[^;]+;base64,/, "").trim();
    if (data) parts.push({ inline_data: { mime_type: src?.mimeType || "image/png", data } });
  }
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...options.extraConfig && typeof options.extraConfig === "object" ? options.extraConfig : {}
    }
  };
  const { response, baseUrl } = await requestAvalaiWithFallback(
    providerConfig,
    `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS)
    },
    { stripVersionForPath: true, disableFallback: true }
  );
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || JSON.stringify(parsed || {});
    throw new Error(`\u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${shortenProviderError(message)}`);
  }
  const responseParts = parsed?.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find((part) => part?.inline_data?.data || part?.inlineData?.data);
  const b64 = String(imagePart?.inline_data?.data || imagePart?.inlineData?.data || "").trim();
  if (!b64) throw new Error("\u062E\u0631\u0648\u062C\u06CC \u062A\u0635\u0648\u06CC\u0631 \u0627\u0632 \u0645\u062F\u0644 \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F.");
  return {
    imageBase64: b64,
    imageUrl: "",
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl,
    raw: parsed,
    usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: "image_generation" })
  };
};
var uint8ToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};
var base64ToUint8Array = (value) => {
  const normalized = String(value || "").replace(/^data:[^;]+;base64,/, "").trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
var callAudioTranscription = async (providerConfig, audioBase64, mimeType = "audio/webm", filename = "voice.webm") => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const bytes = base64ToUint8Array(audioBase64);
  if (!bytes.length) throw new Error("\u0641\u0627\u06CC\u0644 \u0635\u0648\u062A\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const candidateModels = Array.from(new Set([String(providerConfig.model || "").trim()].filter(Boolean)));
  if (candidateModels.length === 0) throw new Error("\u0628\u0631\u0627\u06CC \u062A\u0628\u062F\u06CC\u0644 \u0635\u0648\u062A \u0628\u0647 \u0645\u062A\u0646\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  let lastMessage = "";
  for (const model of candidateModels) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("file", new Blob([bytes], { type: mimeType || "audio/webm" }), filename || "voice.webm");
    const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS)
    }, { disableFallback: true });
    const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
    const parsed = parseJsonSafe(await response.text());
    if (response.ok) {
      const transcript = String(parsed?.text || parsed?.transcript || parsed?.data?.text || "").trim();
      if (!transcript) throw new Error("\u0645\u062A\u0646\u06CC \u0627\u0632 \u0648\u06CC\u0633 \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F.");
      return {
        transcript,
        provider: providerConfig.provider,
        model,
        requestId,
        baseUrl,
        raw: parsed,
        usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: "voice_input" })
      };
    }
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || parsed?.message || JSON.stringify(parsed || {});
    lastMessage = `${model}: ${message}`;
    if (response.status === 401 || response.status === 403) {
      throw new Error(`\u062A\u0628\u062F\u06CC\u0644 \u0635\u0648\u062A \u0628\u0647 \u0645\u062A\u0646 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${message}`);
    }
  }
  throw new Error(`\u062A\u0628\u062F\u06CC\u0644 \u0635\u0648\u062A \u0628\u0647 \u0645\u062A\u0646 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${lastMessage || "\u0645\u062F\u0644 \u0645\u0646\u0627\u0633\u0628 \u0628\u0631\u0627\u06CC \u062A\u0628\u062F\u06CC\u0644 \u0635\u0648\u062A \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F."}`);
};
var AUDIO_SPEECH_VOICES = /* @__PURE__ */ new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse"
]);
var AUDIO_SPEECH_FORMATS = /* @__PURE__ */ new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
var callAudioSpeech = async (providerConfig, text, options = {}) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const model = String(providerConfig.model || "").trim();
  if (!model) throw new Error("\u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const requestedVoice = String(options.voice || "").trim().toLowerCase();
  const voice = AUDIO_SPEECH_VOICES.has(requestedVoice) ? requestedVoice : "alloy";
  const requestedFormat = String(options.responseFormat || "").trim().toLowerCase();
  const responseFormat = AUDIO_SPEECH_FORMATS.has(requestedFormat) ? requestedFormat : "mp3";
  const speed = Number.isFinite(Number(options.speed)) ? Math.min(4, Math.max(0.25, Number(options.speed))) : void 0;
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: responseFormat,
      ...speed !== void 0 ? { speed } : {}
    }),
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS)
  }, { disableFallback: true });
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  if (!response.ok) {
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || parsed?.message || raw || "\u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.";
    throw new Error(`\u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${shortenProviderError(message)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("\u062E\u0631\u0648\u062C\u06CC \u0635\u0648\u062A\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  return {
    bytes,
    contentType,
    format: responseFormat,
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl,
    usageMetadata: {
      provider: providerConfig.provider,
      model,
      capability: "voice_output",
      input_characters: text.length
    }
  };
};
var callImageGeneration = async (providerConfig, prompt, options = {}) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const model = String(providerConfig.model || "").trim();
  if (!model) throw new Error("\u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages.filter((src) => String(src?.data || "").trim()) : [];
  if (isGeminiImageModel(model)) {
    return await callGeminiImageGenerate({ ...providerConfig, model }, prompt, {
      sourceImages,
      extraConfig: options.extraBody
    });
  }
  const allowedSizes = /* @__PURE__ */ new Set(["1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024", "auto"]);
  const size = allowedSizes.has(String(options.size || "").trim()) ? String(options.size).trim() : "1024x1024";
  const n = Math.min(4, Math.max(1, Number(options.n) || 1));
  if (sourceImages.length > 0) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);
    formData.append("n", String(n));
    formData.append("size", size);
    sourceImages.forEach((src, index) => {
      const bytes = base64ToUint8Array(src.data);
      const mime = src.mimeType || "image/png";
      const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
      formData.append("image", new Blob([bytes], { type: mime }), src.filename || `source_${index}.${ext}`);
    });
    if (options.extraBody && typeof options.extraBody === "object") {
      Object.entries(options.extraBody).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
    }
    const { response: response2, baseUrl: baseUrl2 } = await requestAvalaiWithFallback(providerConfig, "/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS)
    }, { disableFallback: true });
    const requestId2 = response2.headers.get("x-request-id") || response2.headers.get("x-avalai-request-id") || null;
    const parsed2 = parseJsonSafe(await response2.text());
    if (!response2.ok) {
      const message = typeof parsed2 === "string" ? parsed2 : parsed2?.error?.message || JSON.stringify(parsed2 || {});
      throw new Error(`\u0648\u06CC\u0631\u0627\u06CC\u0634 \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${shortenProviderError(message)}`);
    }
    const item2 = Array.isArray(parsed2?.data) ? parsed2.data[0] : parsed2?.image || parsed2;
    return {
      imageBase64: String(item2?.b64_json || item2?.base64 || item2?.image_base64 || "").trim(),
      imageUrl: String(item2?.url || item2?.image_url || "").trim(),
      provider: providerConfig.provider,
      model,
      requestId: requestId2,
      baseUrl: baseUrl2,
      raw: parsed2,
      usageMetadata: extractUsageMetadata(parsed2, { ...providerConfig, model, capability: "image_generation" })
    };
  }
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(IMAGE_PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      prompt,
      ...options.quality && String(options.quality) !== "auto" ? { quality: options.quality } : {},
      ...options.extraBody && typeof options.extraBody === "object" ? { extra_body: options.extraBody } : {},
      n,
      size,
      // gpt-image-* always return b64_json and REJECT the response_format param.
      .../^gpt-image/i.test(model) ? {} : { response_format: "b64_json" }
    })
  }, { disableFallback: true });
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || JSON.stringify(parsed || {});
    throw new Error(`\u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${shortenProviderError(message)}`);
  }
  const item = Array.isArray(parsed?.data) ? parsed.data[0] : parsed?.image || parsed;
  const b64 = String(item?.b64_json || item?.base64 || item?.image_base64 || "").trim();
  const url = String(item?.url || item?.image_url || "").trim();
  return {
    imageBase64: b64,
    imageUrl: url,
    provider: providerConfig.provider,
    model,
    requestId,
    baseUrl,
    raw: parsed,
    usageMetadata: extractUsageMetadata(parsed, { ...providerConfig, model, capability: "image_generation" })
  };
};
var callVideoCreate = async (providerConfig, prompt, options = {}) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const model = String(providerConfig.model || "").trim();
  if (!model) throw new Error("\u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u0648\u06CC\u062F\u06CC\u0648\u060C \u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0627\u0632\u0645\u0627\u0646 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const seconds = String(Math.min(20, Math.max(1, Number(options.seconds) || 4)));
  const size = String(options.size || "720x1280").trim();
  const safetyIdentifier = `org_${providerConfig.orgId || ""}_video`.slice(0, 256);
  let init;
  if (options.inputReference?.data) {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt.slice(0, 1e3));
    formData.append("seconds", seconds);
    formData.append("size", size);
    formData.append("safety_identifier", safetyIdentifier);
    const mime = options.inputReference.mimeType || "image/png";
    const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
    formData.append("input_reference", new Blob([base64ToUint8Array(options.inputReference.data)], { type: mime }), `reference.${ext}`);
    init = { method: "POST", headers: { Authorization: `Bearer ${providerConfig.apiKey}` }, body: formData, signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS) };
  } else {
    init = {
      method: "POST",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 1e3), seconds, size, safety_identifier: safetyIdentifier }),
      signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS)
    };
  }
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/videos", init, { disableFallback: true });
  const requestId = response.headers.get("x-request-id") || response.headers.get("x-avalai-request-id") || null;
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || JSON.stringify(parsed || {});
    throw new Error(`\u0633\u0627\u062E\u062A \u0648\u06CC\u062F\u06CC\u0648 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${shortenProviderError(message)}`);
  }
  return {
    videoId: String(parsed?.id || "").trim(),
    status: String(parsed?.status || "queued").trim(),
    progress: numberFrom(parsed?.progress, 0),
    model,
    seconds: Number(seconds),
    provider: providerConfig.provider,
    requestId,
    baseUrl,
    raw: parsed
  };
};
var callVideoStatus = async (providerConfig, videoId) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const { response } = await requestAvalaiWithFallback(providerConfig, `/videos/${encodeURIComponent(videoId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
    signal: AbortSignal.timeout(3e4)
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.error?.message || JSON.stringify(parsed || {});
    throw new Error(`\u062F\u0631\u06CC\u0627\u0641\u062A \u0648\u0636\u0639\u06CC\u062A \u0648\u06CC\u062F\u06CC\u0648 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${message}`);
  }
  return {
    status: String(parsed?.status || "processing").trim(),
    progress: numberFrom(parsed?.progress, 0),
    seconds: numberFrom(parsed?.seconds, 0),
    raw: parsed
  };
};
var callVideoContent = async (providerConfig, videoId) => {
  if (!providerConfig.apiKey) throw new Error("\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const { response } = await requestAvalaiWithFallback(providerConfig, `/videos/${encodeURIComponent(videoId)}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS)
  }, { disableFallback: true });
  if (!response.ok) {
    const message = parseJsonSafe(await response.text());
    throw new Error(`\u062F\u0627\u0646\u0644\u0648\u062F \u0648\u06CC\u062F\u06CC\u0648 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${typeof message === "string" ? message : JSON.stringify(message || {})}`);
  }
  const contentType = response.headers.get("content-type") || "video/mp4";
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("\u062E\u0631\u0648\u062C\u06CC \u0648\u06CC\u062F\u06CC\u0648 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  return { bytes, contentType };
};
var uploadGeneratedImage = async (supabaseUrl, serviceRoleKey, authContext, imageResult) => {
  const orgId = normalizeId(authContext?.orgId);
  if (!orgId) throw new Error("\u0633\u0627\u0632\u0645\u0627\u0646 \u06A9\u0627\u0631\u0628\u0631 \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
  let bytes = null;
  let contentType = "image/png";
  if (imageResult?.imageBase64) {
    bytes = base64ToUint8Array(imageResult.imageBase64);
  } else if (imageResult?.imageUrl) {
    const imageResponse = await fetch(imageResult.imageUrl);
    if (!imageResponse.ok) throw new Error("\u062F\u0631\u06CC\u0627\u0641\u062A \u062A\u0635\u0648\u06CC\u0631 \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
    contentType = imageResponse.headers.get("content-type") || contentType;
    bytes = new Uint8Array(await imageResponse.arrayBuffer());
  }
  if (!bytes?.length) throw new Error("\u062E\u0631\u0648\u062C\u06CC \u062A\u0635\u0648\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const objectPath = `ai_generated/${orgId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/images/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body: bytes
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : parsed?.message || "\u0630\u062E\u06CC\u0631\u0647 \u062A\u0635\u0648\u06CC\u0631 \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
  }
  const publicSupabaseUrl = getPublicSupabaseUrl(supabaseUrl);
  return {
    bucket: "images",
    path: objectPath,
    url: `${publicSupabaseUrl}/storage/v1/object/public/images/${objectPath}`,
    mimeType: contentType
  };
};
var uploadGeneratedBinaryAsset = async (supabaseUrl, serviceRoleKey, authContext, bytes, contentType, input) => {
  const orgId = normalizeId(authContext?.orgId);
  if (!orgId) throw new Error("\u0633\u0627\u0632\u0645\u0627\u0646 \u06A9\u0627\u0631\u0628\u0631 \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
  if (!bytes?.length) throw new Error("\u0641\u0627\u06CC\u0644 \u062E\u0631\u0648\u062C\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const extension = String(input.extension || "bin").replace(/^\./, "").trim() || "bin";
  const safePrefix = String(input.prefix || "ai_generated").trim() || "ai_generated";
  const objectPath = `ai_generated/${orgId}/${safePrefix}_${Date.now()}_${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/images/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true"
    },
    body: bytes
  });
  const parsed = parseJsonSafe(await response.text());
  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : parsed?.message || "\u0630\u062E\u06CC\u0631\u0647 \u0641\u0627\u06CC\u0644 \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
  }
  const publicSupabaseUrl = getPublicSupabaseUrl(supabaseUrl);
  return {
    bucket: "images",
    path: objectPath,
    url: `${publicSupabaseUrl}/storage/v1/object/public/images/${objectPath}`,
    mimeType: contentType || "application/octet-stream"
  };
};
var detectTableExists = async (supabaseUrl, serviceRoleKey, table) => {
  try {
    await restSelect(supabaseUrl, serviceRoleKey, table, { select: "id", limit: 1 });
    return true;
  } catch {
    return false;
  }
};
var slugifyFileFolder = (value) => String(value || "").trim().toLowerCase().replace(/[^\w\u0600-\u06FF\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "ai-files";
var ensureFileFolder = async (supabaseUrl, serviceRoleKey, authContext, input) => {
  const existing = await safeRestSelect(supabaseUrl, serviceRoleKey, "file_folders", {
    org_id: `eq.${authContext.orgId}`,
    source_scope: `eq.${input.sourceScope}`,
    source_key: `eq.${input.sourceKey}`,
    select: "*",
    limit: 1
  });
  if (existing[0]) return existing[0];
  const rows = await restInsert(supabaseUrl, serviceRoleKey, "file_folders", [{
    org_id: authContext.orgId,
    parent_id: input.parentId || null,
    name: input.name,
    slug: slugifyFileFolder(input.name),
    folder_type: input.folderType || "manual",
    module_id: input.moduleId || null,
    record_id: input.recordId || null,
    source_scope: input.sourceScope,
    source_key: input.sourceKey,
    visibility: "private",
    is_system: true,
    color_token: "violet",
    icon_token: "robot",
    metadata: input.metadata || {},
    sort_order: Number(input.sortOrder || 0),
    created_by: authContext.userId || null
  }]);
  return rows[0] || null;
};
var ensureAiFileManagerFolder = async (supabaseUrl, serviceRoleKey, authContext, pageContext) => {
  const hasFileManager = await detectTableExists(supabaseUrl, serviceRoleKey, "file_folders");
  if (!hasFileManager) return null;
  const moduleId = String(pageContext?.moduleId || "").trim();
  const recordId = String(pageContext?.recordId || "").trim();
  if (moduleId && recordId) {
    const recordFolderRows = await safeRestSelect(supabaseUrl, serviceRoleKey, "file_folders", {
      org_id: `eq.${authContext.orgId}`,
      source_scope: "eq.record_root",
      source_key: `eq.record_root:${moduleId}:${recordId}`,
      select: "*",
      limit: 1
    });
    const parent = recordFolderRows[0] || await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
      name: "\u0631\u06A9\u0648\u0631\u062F",
      folderType: "system_record",
      moduleId,
      recordId,
      sourceScope: "record_root",
      sourceKey: `record_root:${moduleId}:${recordId}`,
      metadata: { auto_created: true, module_id: moduleId, record_id: recordId, source: "ai_assistant" }
    });
    return await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
      name: "\u0641\u0627\u06CC\u0644\u200C\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
      parentId: parent?.id || null,
      folderType: "manual",
      moduleId,
      recordId,
      sourceScope: "ai_record_files",
      sourceKey: `ai_record_files:${moduleId}:${recordId}`,
      metadata: { auto_created: true, source: "ai_assistant", module_id: moduleId, record_id: recordId },
      sortOrder: 900
    });
  }
  return await ensureFileFolder(supabaseUrl, serviceRoleKey, authContext, {
    name: "\u0641\u0627\u06CC\u0644\u200C\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
    folderType: "manual",
    moduleId: null,
    recordId: null,
    sourceScope: "ai_workspace_files",
    sourceKey: `ai_workspace_files:${authContext.orgId}`,
    metadata: { auto_created: true, source: "ai_assistant", scope: "workspace" },
    sortOrder: 900
  });
};
var registerAiGeneratedFileInFileManager = async (supabaseUrl, serviceRoleKey, authContext, pageContext, file, input) => {
  const hasFileManager = await detectTableExists(supabaseUrl, serviceRoleKey, "file_assets");
  if (!hasFileManager) return null;
  const folder = await ensureAiFileManagerFolder(supabaseUrl, serviceRoleKey, authContext, pageContext);
  const moduleId = String(pageContext?.moduleId || "").trim() || null;
  const recordId = String(pageContext?.recordId || "").trim() || null;
  const displayName = String(input.displayName || file.path.split("/").pop() || "AI file").trim();
  const ext = displayName.includes(".") ? String(displayName.split(".").pop() || "").trim().toLowerCase() : null;
  const recordFileType = input.fileType === "image" || input.fileType === "video" ? input.fileType : "file";
  const assetRows = await restUpsert(supabaseUrl, serviceRoleKey, "file_assets", [{
    org_id: authContext.orgId,
    storage_bucket: file.bucket,
    storage_path: file.path,
    target_url: file.url,
    display_name: displayName,
    canonical_name: displayName.toLowerCase(),
    file_ext: ext,
    mime_type: file.mimeType || null,
    file_type: input.fileType || "file",
    visibility: "private",
    is_public: false,
    uploaded_by: authContext.userId || null,
    origin_module_id: moduleId,
    origin_record_id: recordId,
    origin_folder_id: folder?.id || null,
    metadata: {
      source: "ai_generated",
      thread_id: input.threadId || null,
      message_id: input.messageId || null,
      prompt: input.prompt || null
    }
  }], "storage_bucket,storage_path");
  const asset = assetRows[0] || null;
  if (!asset?.id) return null;
  const entryRows = await restInsert(supabaseUrl, serviceRoleKey, "file_entries", [{
    org_id: authContext.orgId,
    asset_id: asset.id,
    folder_id: folder?.id || null,
    entry_type: "origin",
    entry_name: displayName,
    module_id: moduleId,
    record_id: recordId,
    source_table: "ai_messages",
    source_row_id: input.messageId || null,
    sort_order: 0,
    metadata: {
      source: "ai_generated",
      thread_id: input.threadId || null,
      prompt: input.prompt || null
    },
    created_by: authContext.userId || null
  }]).catch(() => []);
  const entry = entryRows[0] || null;
  const hasRecordFiles = moduleId && recordId && await detectTableExists(supabaseUrl, serviceRoleKey, "record_files");
  if (hasRecordFiles) {
    await restInsert(supabaseUrl, serviceRoleKey, "record_files", [{
      org_id: authContext.orgId,
      module_id: moduleId,
      record_id: recordId,
      file_url: file.url,
      file_type: recordFileType,
      file_name: displayName,
      mime_type: file.mimeType || null,
      sort_order: 0,
      folder_id: folder?.id || null,
      asset_id: asset.id,
      file_entry_id: entry?.id || null,
      entry_type: "origin",
      is_shortcut: false,
      source_module_id: moduleId,
      source_record_id: recordId,
      metadata: {
        source: "ai_generated",
        thread_id: input.threadId || null,
        message_id: input.messageId || null
      }
    }]).catch(() => []);
  }
  return { asset, entry, folder };
};
var fetchThreadMessages = async (supabaseUrl, serviceRoleKey, authContext, threadId, limit = 120) => {
  if (!isUuid(threadId)) return [];
  return await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_messages", {
    thread_id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    select: "id,thread_id,role,content,provider,model,metadata,created_at",
    order: "created_at.asc",
    limit
  });
};
var findThreadByContextKey = async (supabaseUrl, serviceRoleKey, authContext, contextKey) => {
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_threads", {
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: "eq.active",
    context_key: `eq.${contextKey}`,
    select: "*",
    order: "updated_at.desc",
    limit: 1
  });
  return rows[0] || null;
};
var canAccessThreadRow = (thread, authContext) => {
  if (!thread) return false;
  if (normalizeId(thread?.org_id) !== normalizeId(authContext?.orgId)) return false;
  if (normalizeId(thread?.user_id) === normalizeId(authContext?.userId)) return true;
  if (normalizeId(thread?.created_by) === normalizeId(authContext?.userId)) return true;
  const sharedUserIds = Array.isArray(thread?.shared_user_ids) ? thread.shared_user_ids.map(normalizeId) : [];
  const sharedRoleIds = Array.isArray(thread?.shared_role_ids) ? thread.shared_role_ids.map(normalizeId) : [];
  return sharedUserIds.includes(normalizeId(authContext?.userId)) || sharedRoleIds.includes(normalizeId(authContext?.roleId));
};
var fetchThreadForRead = async (supabaseUrl, serviceRoleKey, authContext, threadId) => {
  if (!isUuid(threadId)) return null;
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    status: "eq.active",
    select: "*",
    limit: 1
  });
  const thread = rows[0] || null;
  return canAccessThreadRow(thread, authContext) ? thread : null;
};
var ensureThread = async (supabaseUrl, serviceRoleKey, authContext, payload) => {
  const requestedThreadId = normalizeId(payload.threadId);
  if (requestedThreadId && isUuid(requestedThreadId)) {
    const rows = await restSelect(supabaseUrl, serviceRoleKey, "ai_threads", {
      id: `eq.${requestedThreadId}`,
      org_id: `eq.${authContext.orgId}`,
      user_id: `eq.${authContext.userId}`,
      status: "eq.active",
      select: "*",
      limit: 1
    });
    if (rows[0]) return rows[0];
  }
  const contextKey = payload.contextKey || buildContextKey(payload.pageContext?.context || {});
  if (!payload.forceNew && payload.continueByContext === true) {
    const existing = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
    if (existing) return existing;
  }
  const inserted = await restInsert(supabaseUrl, serviceRoleKey, "ai_threads", [{
    org_id: authContext.orgId,
    user_id: authContext.userId,
    status: "active",
    title: buildThreadTitle(payload.title || "", payload.pageContext),
    context_type: getContextKind(payload.pageContext?.context || {}),
    context_key: contextKey,
    module_id: payload.pageContext?.moduleId || null,
    record_id: payload.pageContext?.recordId || null,
    provider: payload.provider || getEnvProviderConfig().provider,
    model: payload.model || getEnvProviderConfig().model,
    metadata: {
      route: payload.pageContext?.context?.route || null,
      summary: payload.pageContext?.summary || null,
      context_kind: getContextKind(payload.pageContext?.context || {}),
      context_label: buildThreadContextLabel(payload.pageContext),
      context: payload.pageContext?.context || null,
      module_id: payload.pageContext?.moduleId || null,
      record_id: payload.pageContext?.recordId || null,
      intent: payload.pageContext?.intent || payload.pageContext?.context?.intent || null,
      process_field_key: payload.pageContext?.processFieldKey || payload.pageContext?.context?.processFieldKey || null,
      selected_process_id: payload.pageContext?.selectedProcessId || payload.pageContext?.context?.selectedProcessId || payload.pageContext?.context?.selectedProcessGroupId || null,
      last_activity_kind: "created"
    }
  }]);
  return inserted[0];
};
var insertAiMessage = async (supabaseUrl, serviceRoleKey, authContext, payload) => {
  const rows = await restInsert(supabaseUrl, serviceRoleKey, "ai_messages", [{
    org_id: authContext.orgId,
    ...payload
  }]);
  return rows[0] || null;
};
var runBackgroundTask = (task) => {
  const guarded = task.catch((error) => console.error("ai-assistant background task failed", error));
  const runtime = globalThis?.EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") {
    runtime.waitUntil(guarded);
  } else {
    void guarded;
  }
};
var ensureOrgAiSettings = async (supabaseUrl, serviceRoleKey, authContext) => {
  const existing = await loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  if (existing) return existing;
  const catalogRows = await listActiveAiModels(supabaseUrl, serviceRoleKey);
  const selectedModels = sanitizeTenantSelectedModels(catalogRows, {});
  const rows = await restInsert(supabaseUrl, serviceRoleKey, "org_ai_settings", [{
    org_id: authContext.orgId,
    selected_models: selectedModels,
    feature_flags: {
      dashboard_chat: true,
      record_chat: true,
      customer_reply_suggestion: true,
      document_analysis: true,
      workflow_ai_prompt: true,
      web_search: false,
      // off by default — admin enables when API key is set
      voice_input: false,
      voice_output: false,
      image_generation: false,
      video_generation: false,
      voip_auto_reply: false
    },
    require_human_approval: true,
    default_margin_percent: DEFAULT_AI_MARGIN_PERCENT,
    created_by: authContext.userId,
    updated_by: authContext.userId
  }]);
  return rows[0] || null;
};
var fetchAvalaiCredit = async (providerConfig) => {
  if (!providerConfig.apiKey) return { available: false, message: "\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AvalAI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." };
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/user/v1/credit", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json"
    }
  }, { stripVersionForPath: true });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    return { available: false, status: response.status, message: typeof parsed === "string" ? parsed : parsed?.message || "\u0627\u0639\u062A\u0628\u0627\u0631 AvalAI \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F.", raw: parsed };
  }
  return { available: true, credit: parsed, baseUrl };
};
var handleGetAiSettings = async (supabaseUrl, serviceRoleKey, authContext) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  return json(200, { success: true, settings });
};
var handleSaveAiSettings = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  if (!authContext.orgId) return json(400, { success: false, message: "\u0633\u0627\u0632\u0645\u0627\u0646 \u06A9\u0627\u0631\u0628\u0631 \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A." });
  const incoming = body?.settings || {};
  const existing = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  const catalogRows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
    is_active: "eq.true",
    select: "*",
    order: "id.asc",
    limit: 300
  });
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const baseAvailability = buildAiCapabilityAvailability(planContext, existing, catalogRows);
  const selectedModels = incoming.selected_models && typeof incoming.selected_models === "object" ? incoming.selected_models : incoming.selectedModels && typeof incoming.selectedModels === "object" ? incoming.selectedModels : existing?.selected_models || {};
  const featureFlags = incoming.feature_flags && typeof incoming.feature_flags === "object" ? incoming.feature_flags : incoming.featureFlags && typeof incoming.featureFlags === "object" ? incoming.featureFlags : existing?.feature_flags || {};
  const sanitizedModels = sanitizeTenantSelectedModels(catalogRows, selectedModels);
  const sanitizedFlags = sanitizeTenantFeatureFlags(baseAvailability, featureFlags);
  const rows = await restUpsert(supabaseUrl, serviceRoleKey, "org_ai_settings", [{
    org_id: authContext.orgId,
    selected_models: sanitizedModels,
    feature_flags: sanitizedFlags,
    daily_limit_irt: incoming.daily_limit_irt ?? incoming.dailyLimitIrt ?? existing?.daily_limit_irt ?? null,
    monthly_limit_irt: incoming.monthly_limit_irt ?? incoming.monthlyLimitIrt ?? existing?.monthly_limit_irt ?? null,
    require_human_approval: incoming.require_human_approval !== false && incoming.requireHumanApproval !== false,
    default_margin_percent: numberFrom(incoming.default_margin_percent ?? incoming.defaultMarginPercent, numberFrom(existing?.default_margin_percent, DEFAULT_AI_MARGIN_PERCENT)),
    metadata: { ...existing?.metadata || {}, last_saved_via: "ai_settings_tab" },
    created_by: existing?.created_by || authContext.userId,
    updated_by: authContext.userId
  }], "org_id");
  return json(200, { success: true, settings: rows[0] || existing });
};
var handleGetAiOverview = async (supabaseUrl, serviceRoleKey, authContext) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const [settings, rawModels, wallets, ledgerRows] = await Promise.all([
    ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext),
    safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
      is_active: "eq.true",
      select: "*",
      order: "id.asc",
      limit: 200
    }),
    authContext.orgId ? safeRestSelect(supabaseUrl, serviceRoleKey, "org_ai_wallets", {
      org_id: `eq.${authContext.orgId}`,
      select: "*",
      limit: 1
    }) : Promise.resolve([]),
    authContext.orgId ? safeRestSelect(supabaseUrl, serviceRoleKey, "org_ai_usage_ledger", {
      org_id: `eq.${authContext.orgId}`,
      select: "id,capability,model,status,raw_cost_irt,billed_amount_irt,usage,created_at",
      order: "created_at.desc",
      limit: 200
    }) : Promise.resolve([])
  ]);
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const availability = buildAiCapabilityAvailability(planContext, settings, rawModels);
  const models = (rawModels || []).filter((model) => model?.is_coming_soon !== true);
  const totals = (ledgerRows || []).reduce((acc, row) => {
    if (String(row?.status || "") !== "finalized") return acc;
    acc.billed_amount_irt += numberFrom(row?.billed_amount_irt, 0);
    acc.raw_cost_irt += numberFrom(row?.raw_cost_irt, 0);
    acc.requests += 1;
    const model = String(row?.model || "unknown");
    acc.by_model[model] = (acc.by_model[model] || 0) + numberFrom(row?.billed_amount_irt, 0);
    const capability = String(row?.capability || "unknown");
    acc.by_capability[capability] = (acc.by_capability[capability] || 0) + numberFrom(row?.billed_amount_irt, 0);
    return acc;
  }, { billed_amount_irt: 0, raw_cost_irt: 0, requests: 0, by_model: {}, by_capability: {} });
  const [providerCredit, companyContext] = await Promise.all([
    fetchAvalaiCredit(getCentralProviderConfig()).catch((error) => ({
      available: false,
      message: String(error?.message || error || "\u0627\u0639\u062A\u0628\u0627\u0631 AvalAI \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F.")
    })),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext)
  ]);
  return json(200, {
    success: true,
    settings,
    models,
    plan: {
      code: planContext?.planCode || null,
      reason: planContext?.reason || null
    },
    capabilityAvailability: availability,
    wallet: wallets[0] || null,
    usage: {
      totals,
      recent: ledgerRows || []
    },
    providerCredit,
    company: companyContext
  });
};
var handleGetComposeModels = async (supabaseUrl, serviceRoleKey, authContext) => {
  const [settings, rawModels] = await Promise.all([
    loadOrgAiSettings(supabaseUrl, serviceRoleKey, authContext),
    safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
      is_active: "eq.true",
      select: "id,display_name_fa,capability_tags,is_coming_soon",
      order: "id.asc",
      limit: 200
    })
  ]);
  const planContext = await loadTenantAiPlanContext(supabaseUrl, serviceRoleKey, authContext);
  const availability = buildAiCapabilityAvailability(planContext, settings, rawModels);
  const models = (rawModels || []).filter((m) => m?.is_coming_soon !== true);
  const labelOf = (id) => {
    const row = models.find((m) => String(m?.id || "") === id);
    return String(row?.display_name_fa || id || "").trim() || id;
  };
  const capabilities = {};
  Object.keys(AI_CAPABILITY_FEATURE_KEYS).forEach((capability) => {
    if (capability === "embedding") return;
    const selectable = models.filter((m) => {
      const tags = Array.isArray(m?.capability_tags) ? m.capability_tags : [];
      return tags.includes(capability);
    }).map((m) => ({ value: String(m?.id || ""), label: labelOf(String(m?.id || "")) })).filter((opt) => opt.value);
    const resolved = pickCapabilityModelFromCatalog(settings, capability, models);
    capabilities[capability] = {
      model: resolved,
      modelLabel: resolved ? labelOf(resolved) : "\u0645\u062F\u0644 \u0641\u0639\u0627\u0644 \u0646\u062F\u0627\u0631\u062F",
      selectable,
      available: availability?.[capability] ? availability[capability].planAvailable !== false && availability[capability].tenantReady !== false && availability[capability].hasReadyModel !== false : true
    };
  });
  return json(200, { success: true, capabilities });
};
var handleGetThread = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const requestedThreadId = normalizeId(body?.threadId);
  if (requestedThreadId && isUuid(requestedThreadId)) {
    const thread2 = await fetchThreadForRead(supabaseUrl, serviceRoleKey, authContext, requestedThreadId);
    const messages2 = thread2 ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread2.id, 200) : [];
    return json(200, {
      success: true,
      thread: thread2,
      threadId: thread2?.id || null,
      messages: messages2
    });
  }
  const context = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(context);
  const thread = await findThreadByContextKey(supabaseUrl, serviceRoleKey, authContext, contextKey);
  const messages = thread ? await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 200) : [];
  return json(200, {
    success: true,
    thread: thread ? {
      id: thread.id,
      title: thread.title,
      contextKey: thread.context_key,
      moduleId: thread.module_id,
      recordId: thread.record_id,
      provider: thread.provider,
      model: thread.model,
      updatedAt: thread.updated_at
    } : null,
    threadId: thread?.id || null,
    messages
  });
};
var handleListThreads = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const search = String(body?.search || "").trim();
  const baseSelect = "id,org_id,title,context_type,context_key,module_id,record_id,provider,model,metadata,created_at,updated_at,pinned_at,is_shared,shared_user_ids,shared_role_ids,user_id";
  const limit = Math.max(10, Math.min(100, Number(body?.limit || 50)));
  const ownParams = {
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: "eq.active",
    select: baseSelect,
    order: "updated_at.desc",
    limit
  };
  if (search) ownParams.title = `ilike.*${search}*`;
  const sharedUserParams = {
    org_id: `eq.${authContext.orgId}`,
    status: "eq.active",
    shared_user_ids: `cs.{${authContext.userId}}`,
    select: baseSelect,
    order: "updated_at.desc",
    limit
  };
  const sharedRoleParams = authContext.roleId ? {
    org_id: `eq.${authContext.orgId}`,
    status: "eq.active",
    shared_role_ids: `cs.{${authContext.roleId}}`,
    select: baseSelect,
    order: "updated_at.desc",
    limit
  } : {};
  if (search) {
    sharedUserParams.title = `ilike.*${search}*`;
    if (authContext.roleId) sharedRoleParams.title = `ilike.*${search}*`;
  }
  const [ownRows, sharedUserRows, sharedRoleRows] = await Promise.all([
    safeRestSelect(supabaseUrl, serviceRoleKey, "ai_threads", ownParams),
    safeRestSelect(supabaseUrl, serviceRoleKey, "ai_threads", sharedUserParams),
    authContext.roleId ? safeRestSelect(supabaseUrl, serviceRoleKey, "ai_threads", sharedRoleParams) : Promise.resolve([])
  ]);
  const rows = Array.from(new Map([...ownRows, ...sharedUserRows, ...sharedRoleRows].filter((row) => canAccessThreadRow(row, authContext)).map((row) => [String(row.id), {
    ...row,
    is_owner: normalizeId(row.user_id) === normalizeId(authContext.userId)
  }])).values()).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, limit);
  return json(200, { success: true, threads: rows });
};
var handleRenameThread = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const threadId = normalizeId(body?.threadId);
  const title = String(body?.title || "").trim().slice(0, 120);
  if (!isUuid(threadId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u06AF\u0641\u062A\u06AF\u0648 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  if (!title) return json(400, { success: false, message: "\u0639\u0646\u0648\u0627\u0646 \u06AF\u0641\u062A\u06AF\u0648 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`
  }, {
    title,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return json(200, { success: true, thread: rows[0] || null });
};
var handleArchiveThread = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u06AF\u0641\u062A\u06AF\u0648 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`
  }, {
    status: "archived",
    archived_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return json(200, { success: true, archived: rows.length > 0 });
};
var normalizeUuidArray = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((item) => normalizeId(item)).filter(isUuid)));
var handleShareThread = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u06AF\u0641\u062A\u06AF\u0648 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  const rows = await restSelect(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`,
    status: "eq.active",
    select: "*",
    limit: 1
  });
  const thread = rows[0] || null;
  if (!thread) return json(404, { success: false, message: "\u06AF\u0641\u062A\u06AF\u0648 \u0628\u0631\u0627\u06CC \u0627\u0634\u062A\u0631\u0627\u06A9\u200C\u06AF\u0630\u0627\u0631\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u0645\u0627\u0644\u06A9 \u0622\u0646 \u0646\u06CC\u0633\u062A\u06CC\u062F." });
  const requestedUserIds = normalizeUuidArray(body?.sharedUserIds || body?.shared_user_ids);
  const requestedRoleIds = normalizeUuidArray(body?.sharedRoleIds || body?.shared_role_ids);
  const [validUsers, validRoles] = await Promise.all([
    requestedUserIds.length ? safeRestSelect(supabaseUrl, serviceRoleKey, "profiles", {
      org_id: `eq.${authContext.orgId}`,
      id: `in.(${requestedUserIds.join(",")})`,
      select: "id",
      limit: 500
    }) : Promise.resolve([]),
    requestedRoleIds.length ? safeRestSelect(supabaseUrl, serviceRoleKey, "org_roles", {
      org_id: `eq.${authContext.orgId}`,
      id: `in.(${requestedRoleIds.join(",")})`,
      select: "id",
      limit: 300
    }) : Promise.resolve([])
  ]);
  const sharedUserIds = validUsers.map((row) => normalizeId(row?.id)).filter(isUuid);
  const sharedRoleIds = validRoles.map((row) => normalizeId(row?.id)).filter(isUuid);
  const patched = await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`
  }, {
    shared_user_ids: sharedUserIds,
    shared_role_ids: sharedRoleIds,
    is_shared: sharedUserIds.length > 0 || sharedRoleIds.length > 0,
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: {
      ...thread?.metadata || {},
      shared_at: (/* @__PURE__ */ new Date()).toISOString(),
      shared_by: authContext.userId
    }
  });
  return json(200, { success: true, thread: patched[0] || null });
};
var handleDeleteThread = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const threadId = normalizeId(body?.threadId);
  if (!isUuid(threadId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0686\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  const rows = await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", {
    id: `eq.${threadId}`,
    org_id: `eq.${authContext.orgId}`,
    user_id: `eq.${authContext.userId}`
  }, {
    status: "archived",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return json(200, { success: true, archived: rows.length > 0 });
};
var handleChat = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const message = String(body?.message || "").trim();
  if (!message) return json(400, { success: false, message: "\u0645\u062A\u0646 \u0633\u0648\u0627\u0644 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const rawContext = normalizeContext(body?.context || {});
  const requestedCapability = String(body?.capability || "").trim();
  const selectedCapabilities = Array.isArray(body?.capabilities) ? body.capabilities.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const selectedCapabilitySet = new Set(selectedCapabilities);
  const capability = requestedCapability || (selectedCapabilitySet.has("legal_assistant") ? "legal_assistant" : "") || (selectedCapabilitySet.has("deep_reasoning") ? "deep_reasoning" : "") || (rawContext.mode === "record" ? "record_chat" : "dashboard_chat");
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  for (const selectedCapability of selectedCapabilities) {
    if (AI_CAPABILITY_FEATURE_KEYS[selectedCapability]) {
      await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, selectedCapability);
    }
  }
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, "document_analysis");
  const [knowledgeChunks, companyContext, orgPeopleContext] = await Promise.all([
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, message) : Promise.resolve([]),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, message)
  ]);
  const [retrievedContexts, businessAnalytics] = await Promise.all([
    fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, message, pageContext),
    fetchFinancialAnalyticsContext(supabaseUrl, serviceRoleKey, authContext, message)
  ]);
  const orgAiSettings = providerConfig.orgAiSettings;
  const webSearchEnabled = orgAiSettings?.feature_flags?.web_search === true && isAiCapabilityPlanAvailable(planContext, "web_search");
  const forceWebSearch = selectedCapabilitySet.has("web_search") || selectedCapabilitySet.has("legal_assistant");
  const shouldSearchWeb = webSearchEnabled && (forceWebSearch || shouldTriggerWebSearch(message));
  const webSearchModel = shouldSearchWeb ? await resolveOrgCapabilityModel(supabaseUrl, serviceRoleKey, orgAiSettings, "web_search") : "";
  const webSearchResults = shouldSearchWeb ? await callWebSearch(providerConfig, message, webSearchModel, 5, forceWebSearch).then((r) => r.results) : [];
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: message.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const previousMessages = await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 30);
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: message,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: String(body?.inputKind || body?.input_kind || "text").trim() || "text",
      capabilities: selectedCapabilities,
      file: body?.file ? {
        filename: body.file?.filename || body.file?.fileName || body.file?.name || null,
        mime_type: body.file?.mimeType || body.file?.mime_type || null,
        size: body.file?.size || null,
        url: body.file?.url || body.file?.file_url || null,
        bucket: body.file?.bucket || null,
        path: body.file?.path || null,
        asset_id: body.file?.assetId || body.file?.asset_id || null,
        entry_id: body.file?.entryId || body.file?.entry_id || null
      } : null
    }
  });
  const promptMessages = buildPromptMessages(
    message,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    webSearchResults,
    {
      legalMode: selectedCapabilitySet.has("legal_assistant"),
      deepReasoning: selectedCapabilitySet.has("deep_reasoning") || capability === "deep_reasoning",
      selectedCapabilities,
      businessAnalytics
    }
  );
  let aiResult;
  try {
    aiResult = await callChatCompletions(providerConfig, promptMessages, {
      safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}`
    });
  } catch (error) {
    const providerFailure = shortenProviderError(String(error?.message || error || "chat_failed"));
    const failedContent = providerFailure.startsWith("\u062E\u0637\u0627\u06CC provider") ? providerFailure : `\u067E\u0627\u0633\u062E \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${providerFailure}`;
    const assistantMessage2 = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: "assistant",
      content: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      metadata: {
        context_summary: pageContext.summary,
        context_key: contextKey,
        company_currency_label: companyContext?.currency_label || null,
        knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
        retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
        web_search_used: webSearchResults.length > 0,
        capabilities: selectedCapabilities,
        capability,
        business_analytics: businessAnalytics ? {
          intent: businessAnalytics.intent || null,
          period: businessAnalytics.period || null,
          available: businessAnalytics.available === true,
          data_quality: businessAnalytics.data_quality || null,
          reason: businessAnalytics.reason || null
        } : null,
        failed: true,
        status: "failed",
        error: providerFailure
      }
    });
    const inputKind = String(body?.inputKind || body?.input_kind || "text").trim() || "text";
    await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: providerConfig.provider,
      model: providerConfig.model,
      context_type: getContextKind(pageContext.context || {}),
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      metadata: {
        ...thread?.metadata || {},
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        intent: pageContext.intent || pageContext.context?.intent || null,
        selected_process_id: pageContext.selectedProcessId || pageContext.context?.selectedProcessId || pageContext.context?.selectedProcessGroupId || null,
        last_activity_kind: `${inputKind}_failed`,
        last_message_preview: failedContent.slice(0, 300)
      }
    }).catch(() => []);
    return json(200, {
      success: false,
      thread,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage2?.id || null,
      message: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      messages: [userMessage, assistantMessage2].filter(Boolean),
      contextSummary: pageContext.summary,
      retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
      businessAnalytics,
      knowledgeSources: knowledgeChunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.document_id,
        title: chunk?.metadata?.document_title || null,
        chunkIndex: chunk.chunk_index
      }))
    });
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_summary: pageContext.summary,
      context_key: contextKey,
      company_currency_label: companyContext?.currency_label || null,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
      web_search_used: webSearchResults.length > 0,
      capabilities: selectedCapabilities,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      business_analytics: businessAnalytics ? {
        intent: businessAnalytics.intent || null,
        period: businessAnalytics.period || null,
        available: businessAnalytics.available === true,
        data_quality: businessAnalytics.data_quality || null,
        reason: businessAnalytics.reason || null
      } : null
    }
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: "chat",
      context_key: contextKey,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      capabilities: selectedCapabilities,
      web_search_forced: forceWebSearch
    }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      intent: pageContext.intent || pageContext.context?.intent || null,
      selected_process_id: pageContext.selectedProcessId || pageContext.context?.selectedProcessId || pageContext.context?.selectedProcessGroupId || null,
      last_activity_kind: String(body?.inputKind || body?.input_kind || "text").trim() || "text",
      last_message_preview: message.slice(0, 300)
    }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    contextSummary: pageContext.summary,
    retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
    businessAnalytics,
    knowledgeSources: knowledgeChunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document_id,
      title: chunk?.metadata?.document_title || null,
      chunkIndex: chunk.chunk_index
    }))
  });
};
var handleChatWithFile = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const file = body?.file || body?.attachment || {};
  const prompt = String(body?.message || body?.prompt || "\u0627\u06CC\u0646 \u0641\u0627\u06CC\u0644 \u0631\u0627 \u062A\u062D\u0644\u06CC\u0644 \u06A9\u0646.").trim() || "\u0627\u06CC\u0646 \u0641\u0627\u06CC\u0644 \u0631\u0627 \u062A\u062D\u0644\u06CC\u0644 \u06A9\u0646.";
  const extractedText = String(file?.text || file?.extractedText || body?.extractedText || body?.extracted_text || "").trim();
  const filename = String(file?.filename || file?.fileName || file?.name || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A").trim() || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A";
  const mimeType = String(file?.mimeType || file?.mime_type || file?.type || "").trim() || null;
  const selectedCapabilities = Array.isArray(body?.capabilities) ? body.capabilities.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const selectedCapabilitySet = new Set(selectedCapabilities);
  if (extractedText) {
    const textMessage = [
      prompt,
      "",
      `\u0646\u0627\u0645 \u0641\u0627\u06CC\u0644: ${filename}`,
      mimeType ? `\u0646\u0648\u0639 \u0641\u0627\u06CC\u0644: ${mimeType}` : "",
      "",
      "\u0645\u062D\u062A\u0648\u0627\u06CC \u0641\u0627\u06CC\u0644:",
      extractedText
    ].filter(Boolean).join("\n");
    return await handleChat(supabaseUrl, serviceRoleKey, authContext, {
      ...body,
      action: "chat",
      capability: selectedCapabilitySet.has("legal_assistant") ? "legal_assistant" : selectedCapabilitySet.has("deep_reasoning") ? "deep_reasoning" : "document_analysis",
      message: textMessage,
      inputKind: "file"
    });
  }
  const fileParts = buildOpenAiInputContentParts(prompt, file).slice(1);
  if (!fileParts.length) {
    return json(400, { success: false, message: "\u0641\u0627\u06CC\u0644 \u06CC\u0627 \u0645\u062D\u062A\u0648\u0627\u06CC \u0642\u0627\u0628\u0644 \u062A\u062D\u0644\u06CC\u0644 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  const rawContext = normalizeContext(body?.context || {});
  const capability = "document_analysis";
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const canUseKnowledge = isAiCapabilityPlanAvailable(planContext, "document_analysis");
  const [knowledgeChunks, companyContext, orgPeopleContext] = await Promise.all([
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt) : Promise.resolve([]),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, prompt)
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(supabaseUrl, serviceRoleKey, authContext, prompt, pageContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `${filename} - ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const previousMessages = await fetchThreadMessages(supabaseUrl, serviceRoleKey, authContext, thread.id, 30);
  const userContentForDb = [
    prompt,
    "",
    `\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A: ${filename}`,
    mimeType ? `\u0646\u0648\u0639 \u0641\u0627\u06CC\u0644: ${mimeType}` : ""
  ].filter(Boolean).join("\n");
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: userContentForDb,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: "file",
      file: {
        filename,
        mime_type: mimeType,
        size: numberFrom(file?.size || file?.fileSize || 0, 0) || null,
        url: file?.url || file?.file_url || null,
        bucket: file?.bucket || null,
        path: file?.path || null,
        asset_id: file?.assetId || file?.asset_id || null,
        entry_id: file?.entryId || file?.entry_id || null
      }
    }
  });
  const promptMessages = buildPromptMessages(
    prompt,
    pageContext,
    knowledgeChunks,
    companyContext,
    orgPeopleContext,
    authContext,
    retrievedContexts,
    previousMessages,
    [],
    {
      legalMode: selectedCapabilitySet.has("legal_assistant"),
      deepReasoning: selectedCapabilitySet.has("deep_reasoning"),
      selectedCapabilities
    }
  );
  const lastUserIndex = promptMessages.map((item) => item.role).lastIndexOf("user");
  if (lastUserIndex >= 0) {
    promptMessages[lastUserIndex] = {
      role: "user",
      content: buildOpenAiInputContentParts(String(promptMessages[lastUserIndex].content || ""), file)
    };
  }
  let aiResult;
  try {
    aiResult = await callChatCompletions(providerConfig, promptMessages, {
      safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}`
    });
  } catch (error) {
    const providerFailure = shortenProviderError(String(error?.message || error || "file_chat_failed"));
    const failedContent = providerFailure.startsWith("\u062E\u0637\u0627\u06CC provider") ? providerFailure : `\u062A\u062D\u0644\u06CC\u0644 \u0641\u0627\u06CC\u0644 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${providerFailure}`;
    const assistantMessage2 = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: "assistant",
      content: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      metadata: {
        context_summary: pageContext.summary,
        context_key: contextKey,
        company_currency_label: companyContext?.currency_label || null,
        knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
        retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
        capability,
        failed: true,
        status: "failed",
        error: providerFailure,
        file: {
          filename,
          mime_type: mimeType
        }
      }
    });
    await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: providerConfig.provider,
      model: providerConfig.model,
      context_type: getContextKind(pageContext.context || {}),
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      metadata: {
        ...thread?.metadata || {},
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: "file_failed",
        last_message_preview: failedContent.slice(0, 300)
      }
    }).catch(() => []);
    return json(200, {
      success: false,
      thread,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage2?.id || null,
      message: failedContent,
      provider: providerConfig.provider,
      model: providerConfig.model,
      messages: [userMessage, assistantMessage2].filter(Boolean),
      contextSummary: pageContext.summary,
      retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId)
    });
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_summary: pageContext.summary,
      context_key: contextKey,
      company_currency_label: companyContext?.currency_label || null,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id),
      retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId),
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      file: {
        filename,
        mime_type: mimeType
      }
    }
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: "chat_with_file",
      context_key: contextKey,
      filename
    }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: "file",
      last_file_name: filename,
      last_message_preview: prompt.slice(0, 300)
    }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: aiResult.content,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    contextSummary: pageContext.summary,
    retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
    knowledgeSources: knowledgeChunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document_id,
      title: chunk?.metadata?.document_title || null,
      chunkIndex: chunk.chunk_index
    }))
  });
};
var handleRecordMutationFromPrompt = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const isUpdate = String(body?.action || "").trim() === "update_record_from_prompt" || String(body?.outputMode || body?.output_mode || "").trim() === "update_record";
  const mutationAction = isUpdate ? "update_record_from_prompt" : "create_record_from_prompt";
  const mutationVerb = isUpdate ? "\u0648\u06CC\u0631\u0627\u06CC\u0634" : "\u0633\u0627\u062E\u062A";
  const prompt = String(body?.message || body?.prompt || "").trim();
  if (!prompt) return json(400, { success: false, message: `\u0645\u062A\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A ${mutationVerb} \u0631\u06A9\u0648\u0631\u062F \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.` });
  const schema = body?.recordCreation || body?.record_creation || {};
  const targetModuleId = String(schema?.moduleId || body?.targetModuleId || body?.target_module_id || "").trim();
  if (!targetModuleId || !ALLOWED_MODULES.has(targetModuleId)) {
    return json(400, { success: false, message: `\u0645\u0627\u0698\u0648\u0644 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC ${mutationVerb} \u0631\u06A9\u0648\u0631\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.` });
  }
  const requestedFields = Array.isArray(schema?.fields) ? schema.fields : [];
  const targetTable = getModuleTable(targetModuleId);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetTable)) {
    return json(400, { success: false, message: "\u062C\u062F\u0648\u0644 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  }
  const targetPerm = getModulePermission(authContext.permissions, targetModuleId);
  if (isUpdate ? targetPerm?.edit === false || targetPerm?.view === false : !canCreateModule(targetPerm)) {
    return json(403, { success: false, message: `\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC ${mutationVerb} \u0631\u06A9\u0648\u0631\u062F \u062F\u0631 \u0627\u06CC\u0646 \u0645\u0627\u0698\u0648\u0644 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.` });
  }
  const permissionFields = targetPerm?.fields && typeof targetPerm.fields === "object" ? targetPerm.fields : {};
  const fields = requestedFields.filter((field) => {
    const fieldKey = String(field?.key || "").trim();
    return fieldKey && permissionFields[fieldKey] !== false;
  });
  if (fields.length === 0) return json(400, { success: false, message: `\u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0628\u0631\u0627\u06CC ${mutationVerb} \u0631\u06A9\u0648\u0631\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.` });
  const effectiveSchema = { ...schema, fields };
  const rawContext = normalizeContext(body?.context || {});
  const capability = String(body?.capability || "workflow_ai_prompt").trim() || "workflow_ai_prompt";
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  if (isUpdate && (!pageContext?.recordId || pageContext?.moduleId !== targetModuleId)) {
    return json(400, { success: false, message: "\u0628\u0631\u0627\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0627\u06CC\u062F \u0631\u06A9\u0648\u0631\u062F \u062C\u0627\u0631\u06CC \u0647\u0645\u0627\u0646 \u0645\u0627\u0698\u0648\u0644 \u0645\u0634\u062E\u0635 \u0628\u0627\u0634\u062F." });
  }
  const companyContext = await loadCompanyContext(supabaseUrl, serviceRoleKey, authContext);
  const file = body?.file || body?.attachment || null;
  const filePrompt = file ? [
    prompt,
    "",
    `\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A: ${String(file?.filename || file?.fileName || file?.name || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A").trim() || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A"}`,
    String(file?.text || "").trim() ? `\u0645\u062D\u062A\u0648\u0627\u06CC \u0641\u0627\u06CC\u0644:
${String(file.text).trim()}` : ""
  ].filter(Boolean).join("\n") : prompt;
  const moduleLabel = String(schema?.moduleLabel || schema?.module_label || targetModuleId).trim() || targetModuleId;
  const fieldLines = fields.map((field) => {
    const options = Array.isArray(field?.options) && field.options.length ? ` \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0645\u062C\u0627\u0632: ${field.options.slice(0, 40).map((option) => `${option?.label || option?.value}=${option?.value}`).join("\u060C ")}` : "";
    return `- ${field.key}: ${field.label || field.key} (${field.type || "text"}${field.required ? "\u060C \u0636\u0631\u0648\u0631\u06CC" : ""})${options}`;
  }).join("\n");
  const systemPrompt = [
    `\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 ${mutationVerb} \u0631\u06A9\u0648\u0631\u062F \u062F\u0631 \u06CC\u06A9 \u0646\u0631\u0645\u200C\u0627\u0641\u0632\u0627\u0631 SaaS \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0647\u0633\u062A\u06CC\u062F.`,
    "\u0641\u0642\u0637 \u0627\u0632 \u0627\u0637\u0644\u0627\u0639\u0627\u062A\u06CC \u06A9\u0647 \u06A9\u0627\u0631\u0628\u0631 \u062F\u0627\u062F\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646.",
    `\u0627\u06AF\u0631 \u0628\u0631\u0627\u06CC ${mutationVerb} \u0642\u0627\u0628\u0644 \u0627\u062A\u06A9\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A\u060C \u06CC\u0627 \u0628\u0631\u0627\u06CC \u062E\u0648\u0627\u0633\u062A\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0627\u0628\u0647\u0627\u0645 \u0645\u0647\u0645\u06CC \u0648\u062C\u0648\u062F \u062F\u0627\u0631\u062F\u060C \u062A\u063A\u06CC\u06CC\u0631\u06CC \u0627\u06CC\u062C\u0627\u062F \u0646\u06A9\u0646 \u0648 needs_clarification=true \u0628\u062F\u0647.`,
    "\u0633\u0648\u0627\u0644\u200C\u0647\u0627 \u0631\u0627 \u0641\u0642\u0637 \u0628\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0644\u0627\u0632\u0645 \u0628\u0631\u0627\u06CC \u062A\u06A9\u0645\u06CC\u0644 \u0647\u0645\u0627\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u062D\u062F\u0648\u062F \u06A9\u0646\u061B \u0641\u0642\u0637 \u0628\u0647 \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0627\u062C\u0628\u0627\u0631\u06CC \u0627\u06A9\u062A\u0641\u0627 \u0646\u06A9\u0646 \u0648 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0645\u0647\u0645 \u06A9\u0633\u0628\u200C\u0648\u06A9\u0627\u0631\u06CC \u0631\u0627 \u0647\u0645 \u0628\u0633\u0646\u062C.",
    "\u062E\u0631\u0648\u062C\u06CC \u0628\u0627\u06CC\u062F \u0641\u0642\u0637 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0627\u0634\u062F\u061B \u0647\u06CC\u0686 \u0645\u062A\u0646 \u0627\u0636\u0627\u0641\u06CC \u0642\u0628\u0644 \u06CC\u0627 \u0628\u0639\u062F JSON \u0646\u0646\u0648\u06CC\u0633.",
    "\u06A9\u0644\u06CC\u062F\u0647\u0627\u06CC fields \u0641\u0642\u0637 \u0628\u0627\u06CC\u062F \u0627\u0632 \u0641\u0647\u0631\u0633\u062A \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0628\u0627\u0634\u0646\u062F. \u0633\u062A\u0648\u0646 org_id\u060C id\u060C system_code\u060C created_at\u060C updated_at\u060C created_by \u0648 updated_by \u0631\u0627 \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646.",
    "",
    `\u0645\u0627\u0698\u0648\u0644 \u0645\u0642\u0635\u062F: ${moduleLabel}`,
    "\u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632:",
    fieldLines,
    "",
    "\u0642\u0627\u0644\u0628 \u062E\u0631\u0648\u062C\u06CC:",
    '{"reply":"\u067E\u06CC\u0627\u0645 \u06A9\u0648\u062A\u0627\u0647 \u0641\u0627\u0631\u0633\u06CC \u0628\u0631\u0627\u06CC \u06A9\u0627\u0631\u0628\u0631","needs_clarification":false,"questions":[],"record":{"fields":{}}}'
  ].join("\n");
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `${mutationVerb} ${moduleLabel}: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: filePrompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      input_kind: String(body?.inputKind || body?.input_kind || (file ? "file" : "text")).trim() || "text",
      action: mutationAction,
      target_module_id: targetModuleId
    }
  });
  const aiResult = await callChatCompletions(providerConfig, [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: file && !String(file?.text || "").trim() ? buildOpenAiInputContentParts(filePrompt, file) : filePrompt
    }
  ], {
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}_${isUpdate ? "update" : "create"}_record`
  });
  const parsed = extractJsonObjectFromText(aiResult.content) || {};
  const clarificationQuestions = normalizeAiClarificationQuestions(parsed?.questions);
  const needsClarification = parsed?.needs_clarification === true || parsed?.needsClarification === true || clarificationQuestions.length > 0;
  const recordDraft = parsed?.record || (Array.isArray(parsed?.records) ? parsed.records[0] : null) || parsed;
  const payload = sanitizeAiRecordPayload(recordDraft, effectiveSchema);
  const relationFieldKey = String(schema?.relationFieldKey || schema?.relation_field_key || body?.relationFieldKey || body?.relation_field_key || "").trim();
  if (relationFieldKey && pageContext?.recordId) payload[relationFieldKey] = pageContext.recordId;
  const generatedReply = String(parsed?.reply || "").trim();
  const previewOnly = !isUpdate && (body?.previewOnly === true || body?.preview_only === true || body?.autoExecute === false || body?.auto_execute === false);
  if (previewOnly || needsClarification) {
    const hasPayload = !needsClarification && Object.keys(payload).length > 0;
    const reply2 = generatedReply ? needsClarification ? buildAiClarificationReply(generatedReply, clarificationQuestions) : generatedReply : hasPayload ? `\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 ${moduleLabel} \u0622\u0645\u0627\u062F\u0647 \u0634\u062F \u0648 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0646\u06CC\u0627\u0632 \u0628\u0647 \u062A\u0627\u06CC\u06CC\u062F \u0634\u0645\u0627 \u062F\u0627\u0631\u062F.` : buildAiClarificationReply("\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u062F\u0642\u06CC\u0642 \u0627\u06CC\u0646 \u0631\u06A9\u0648\u0631\u062F \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0646\u062F\u0627\u0631\u0645.", clarificationQuestions);
    const assistantMessage2 = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: "assistant",
      content: hasPayload ? `${reply2}

\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F\u060C \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0628\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.` : reply2,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        capability,
        action: "create_record_from_prompt",
        target_module_id: targetModuleId,
        proposed_record: hasPayload ? payload : null,
        raw_ai_json: parsed,
        requires_confirmation: hasPayload
      }
    });
    const actionRows = hasPayload ? await restInsert(supabaseUrl, serviceRoleKey, "ai_action_logs", [{
      org_id: authContext.orgId,
      thread_id: thread.id,
      message_id: assistantMessage2?.id || null,
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || null,
      action_type: "create_record_from_prompt",
      status: "proposed",
      proposed_payload: {
        prompt,
        reply: reply2,
        target_module_id: targetModuleId,
        target_table: targetTable,
        module_label: moduleLabel,
        record_creation_schema: effectiveSchema,
        payload,
        relation_field_key: relationFieldKey || null,
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null
      },
      result_payload: { model: aiResult.model, preview_only: true },
      avalai_request_id: aiResult.requestId || null,
      created_by: authContext.userId || null
    }]) : [];
    const proposedAction = actionRows[0] || null;
    const ledger2 = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage2?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: {
        source: "create_record_preview",
        context_key: contextKey,
        target_module_id: targetModuleId,
        proposed: hasPayload
      }
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage2, aiResult.usageMetadata, ledger2);
    await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      context_type: getContextKind(pageContext.context || {}),
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || null,
      metadata: {
        ...thread?.metadata || {},
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || targetModuleId,
        record_id: pageContext.recordId || null,
        last_activity_kind: hasPayload ? "create_record_preview" : "create_record_skipped",
        last_message_preview: prompt.slice(0, 300),
        last_action_log_id: proposedAction?.id || null
      }
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage2?.id || null,
      answer: hasPayload ? `${reply2}

\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F\u060C \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0628\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.` : reply2,
      proposedAction: proposedAction ? {
        id: proposedAction.id,
        actionType: "create_record_from_prompt",
        moduleId: pageContext.moduleId || targetModuleId,
        recordId: pageContext.recordId || null,
        targetModuleId,
        title: moduleLabel,
        status: "proposed"
      } : null,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger2),
      ledger: ledger2
    });
  }
  const createdRecords = [];
  const updatedRecords = [];
  if (Object.keys(payload).length > 0) {
    if (isUpdate) {
      await restPatch(supabaseUrl, serviceRoleKey, targetTable, {
        id: `eq.${pageContext.recordId}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        ...payload,
        updated_by: authContext.userId || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      const currentRecord = pageContext.records?.[0] || {};
      updatedRecords.push({
        module_id: targetModuleId,
        table: targetTable,
        id: pageContext.recordId,
        title: buildAiRecordTitle({ ...currentRecord, ...payload }, moduleLabel)
      });
    } else {
      const rows = await restInsert(supabaseUrl, serviceRoleKey, targetTable, [{
        org_id: authContext.orgId,
        ...payload
      }]);
      const created = rows[0] || null;
      if (created) {
        createdRecords.push({
          module_id: targetModuleId,
          table: targetTable,
          id: created.id || null,
          title: buildAiRecordTitle(created, moduleLabel)
        });
      }
    }
  }
  const reply = generatedReply || (isUpdate ? updatedRecords.length > 0 ? `${moduleLabel} \u0628\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u0633\u062A\u062E\u0631\u0627\u062C\u200C\u0634\u062F\u0647 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F.` : "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." : createdRecords.length > 0 ? `${moduleLabel} \u0628\u0627 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0627\u0633\u062A\u062E\u0631\u0627\u062C\u200C\u0634\u062F\u0647 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.` : "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: reply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      context_key: contextKey,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      capability,
      action: mutationAction,
      target_module_id: targetModuleId,
      created_records: createdRecords,
      updated_records: updatedRecords,
      raw_ai_json: parsed
    }
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: {
      source: mutationAction,
      context_key: contextKey,
      target_module_id: targetModuleId,
      created_count: createdRecords.length,
      updated_count: updatedRecords.length
    }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restInsert(supabaseUrl, serviceRoleKey, "ai_action_logs", [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    message_id: assistantMessage?.id || null,
    module_id: pageContext.moduleId || targetModuleId,
    record_id: pageContext.recordId || createdRecords[0]?.id || null,
    action_type: mutationAction,
    status: createdRecords.length > 0 || updatedRecords.length > 0 ? "executed" : "skipped",
    proposed_payload: {
      prompt,
      target_module_id: targetModuleId,
      schema_fields: fields.map((field) => field.key)
    },
    result_payload: {
      reply,
      created_records: createdRecords,
      updated_records: updatedRecords,
      model: aiResult.model
    },
    avalai_request_id: aiResult.requestId || null,
    created_by: authContext.userId || null,
    executed_at: (/* @__PURE__ */ new Date()).toISOString()
  }]).catch((error) => console.warn("AI record mutation action log skipped", error));
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || targetModuleId,
    record_id: pageContext.recordId || createdRecords[0]?.id || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || targetModuleId,
      record_id: pageContext.recordId || createdRecords[0]?.id || null,
      last_activity_kind: isUpdate ? "update_record" : "create_record",
      last_message_preview: prompt.slice(0, 300),
      last_created_records: createdRecords,
      last_updated_records: updatedRecords
    }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: reply,
    createdRecords,
    updatedRecords,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger
  });
};
var PROCESS_TASK_CUSTOM_FIELDS_KEY = "process_task_custom_fields";
var PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY = "process_task_custom_field_values";
var PROCESS_TASK_STATUS_OPTIONS_KEY = "process_task_status_options";
var normalizeAiProcessStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["todo", "planned", "in_progress", "review", "done", "completed", "blocked", "canceled"].includes(normalized)) {
    if (normalized === "completed") return "done";
    return normalized;
  }
  return "todo";
};
var normalizeAiProcessStageStatus = (value) => {
  const normalized = normalizeAiProcessStatus(value);
  return normalized === "planned" || normalized === "review" ? "todo" : normalized;
};
var normalizeAiProcessAssignee = (value, orgPeopleContext) => {
  if (!value || typeof value !== "object") return { assignee_id: null, assignee_role_id: null, assignee_type: null };
  const type = String(value?.type || value?.assignee_type || "").trim().toLowerCase();
  const id = normalizeId(value?.id || value?.user_id || value?.role_id);
  if (!id || !isUuid(id)) return { assignee_id: null, assignee_role_id: null, assignee_type: null };
  const roleIds = new Set((orgPeopleContext?.roles || []).map((row) => normalizeId(row?.id)).filter(Boolean));
  const userIds = new Set((orgPeopleContext?.users || []).map((row) => normalizeId(row?.id)).filter(Boolean));
  if (type === "role" && roleIds.has(id)) return { assignee_id: null, assignee_role_id: id, assignee_type: "role" };
  if (type === "user" && userIds.has(id)) return { assignee_id: id, assignee_role_id: null, assignee_type: "user" };
  if (roleIds.has(id)) return { assignee_id: null, assignee_role_id: id, assignee_type: "role" };
  if (userIds.has(id)) return { assignee_id: id, assignee_role_id: null, assignee_type: "user" };
  return { assignee_id: null, assignee_role_id: null, assignee_type: null };
};
var addDaysIso = (days) => {
  const amount = Number(days);
  if (!Number.isFinite(amount)) return null;
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + Math.max(0, Math.min(365, Math.round(amount))));
  return date.toISOString();
};
var buildProcessTaskPayload = ({
  authContext,
  moduleId,
  recordId,
  processRun,
  stage,
  processRunStage,
  orgPeopleContext,
  sourceTemplateId = null
}) => {
  const assignee = normalizeAiProcessAssignee(stage?.assignee || {
    id: stage?.assignee_user_id || stage?.default_assignee_id || stage?.assignee_role_id || stage?.default_assignee_role_id,
    type: stage?.assignee_role_id || stage?.default_assignee_role_id ? "role" : "user"
  }, orgPeopleContext);
  const customFields = Array.isArray(stage?.custom_fields) ? stage.custom_fields : Array.isArray(stage?.process_task_custom_fields) ? stage.process_task_custom_fields : Array.isArray(stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]) ? stage.metadata[PROCESS_TASK_CUSTOM_FIELDS_KEY] : [];
  const customValues = stage?.custom_values && typeof stage.custom_values === "object" ? stage.custom_values : stage?.metadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof stage.metadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === "object" ? stage.metadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {};
  const statusOptions = Array.isArray(stage?.status_options) ? stage.status_options : Array.isArray(stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]) ? stage.metadata[PROCESS_TASK_STATUS_OPTIONS_KEY] : [];
  const processGroup = {
    id: normalizeId(processRun?.process_group_id || processRun?.id) || null,
    name: String(processRun?.process_name || "").trim() || null,
    template_id: normalizeId(processRun?.template_id || sourceTemplateId) || null,
    template_name: String(processRun?.template_name || "").trim() || null
  };
  const processNodeKey = String(
    processRunStage?.process_node_key || processRunStage?.metadata?.process_node_key || stage?.process_node_key || stage?.metadata?.process_node_key || ""
  ).trim() || null;
  const processLaneKey = String(
    processRunStage?.process_lane_key || processRunStage?.metadata?.process_lane_key || stage?.process_lane_key || stage?.metadata?.process_lane_key || "lane_1"
  ).trim() || "lane_1";
  const processGraph = processRunStage?.metadata?.process_graph || stage?.process_graph || stage?.metadata?.process_graph || null;
  return {
    org_id: authContext.orgId,
    name: String(stage?.name || stage?.stage_name || stage?.title || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0641\u0631\u0622\u06CC\u0646\u062F").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0641\u0631\u0622\u06CC\u0646\u062F",
    status: normalizeAiProcessStatus(stage?.task_status || stage?.status),
    priority: String(stage?.priority || "medium").trim() || "medium",
    description: String(stage?.description || stage?.metadata?.description || "").trim() || null,
    task_type: String(stage?.task_type || stage?.metadata?.task_type || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC",
    due_date: stage?.due_date || stage?.due_at || addDaysIso(stage?.due_days),
    wage: numberFrom(stage?.wage, 0),
    weight: numberFrom(stage?.weight, 0),
    sort_order: Number(stage?.sort_order || 10),
    source_template_id: normalizeId(sourceTemplateId || processRun?.template_id || stage?.source_template_id) || null,
    source_stage_sort_order: Number(stage?.sort_order || processRunStage?.sort_order || 10),
    process_group_id: normalizeId(processRun?.process_group_id || processRun?.id) || null,
    process_run_id: normalizeId(processRun?.id) || null,
    process_run_stage_id: normalizeId(processRunStage?.id || stage?.process_run_stage_id) || null,
    process_node_key: processNodeKey,
    process_lane_key: processLaneKey,
    related_to_module: moduleId,
    source_module_id: moduleId,
    source_record_id: recordId,
    ...assignee,
    created_by: authContext.userId || null,
    updated_by: authContext.userId || null,
    recurrence_info: {
      ...stage?.recurrence_info && typeof stage.recurrence_info === "object" ? stage.recurrence_info : {},
      task_type: String(stage?.task_type || stage?.metadata?.task_type || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC",
      process_automation_rules: Array.isArray(stage?.automation_rules) ? stage.automation_rules : Array.isArray(stage?.metadata?.automation_rules) ? stage.metadata.automation_rules : [],
      process_target_module_ids: Array.isArray(stage?.process_target_module_ids) ? stage.process_target_module_ids : [moduleId],
      process_links: { [moduleId]: recordId },
      process_run_id: normalizeId(processRun?.id) || null,
      process_run_stage_id: normalizeId(processRunStage?.id || stage?.process_run_stage_id) || null,
      process_node_key: processNodeKey,
      process_lane_key: processLaneKey,
      process_graph: processGraph,
      process_group: processGroup,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
      [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customValues
    }
  };
};
var loadAiProcessContext = async (supabaseUrl, serviceRoleKey, authContext, pageContext) => {
  const moduleId = String(pageContext?.moduleId || "").trim();
  const recordId = normalizeId(pageContext?.recordId);
  const templateRows = await safeRestSelect(supabaseUrl, serviceRoleKey, "process_templates", {
    org_id: `eq.${authContext.orgId}`,
    is_active: "eq.true",
    select: "id,module_id,name,description,process_kind,auto_copy_mode,created_at",
    order: "updated_at.desc",
    limit: 80
  });
  const relevantTemplates = (templateRows || []).filter((template) => {
    const templateModule = String(template?.module_id || "").trim();
    return !moduleId || templateModule === moduleId || templateModule === "tasks" || templateModule === "process_runs";
  }).slice(0, 30);
  const templateIds = relevantTemplates.map((template) => normalizeId(template?.id)).filter(isUuid);
  const templateStages = templateIds.length ? await safeRestSelect(supabaseUrl, serviceRoleKey, "process_template_stages", {
    template_id: `in.(${templateIds.join(",")})`,
    select: "id,template_id,stage_name,sort_order,default_status,default_assignee_id,default_assignee_role_id,auto_create_task,wage,metadata",
    order: "sort_order.asc",
    limit: 300
  }) : [];
  const runs = moduleId && isUuid(recordId) ? await safeRestSelect(supabaseUrl, serviceRoleKey, "process_runs", {
    org_id: `eq.${authContext.orgId}`,
    module_id: `eq.${moduleId}`,
    record_id: `eq.${recordId}`,
    select: "id,template_id,module_id,record_id,process_name,status,copied_mode,started_at,process_group_id,created_at",
    order: "created_at.desc",
    limit: 20
  }) : [];
  const runIds = runs.map((run) => normalizeId(run?.id)).filter(isUuid);
  const runStages = runIds.length ? await safeRestSelect(supabaseUrl, serviceRoleKey, "process_run_stages", {
    process_run_id: `in.(${runIds.join(",")})`,
    select: "id,process_run_id,template_stage_id,stage_name,sort_order,status,task_id,assignee_user_id,assignee_role_id,wage,metadata,planned_due_at,started_at,completed_at",
    order: "sort_order.asc",
    limit: 400
  }) : [];
  const taskFilters = [];
  if (moduleId && isUuid(recordId)) {
    taskFilters.push(safeRestSelect(supabaseUrl, serviceRoleKey, "tasks", {
      org_id: `eq.${authContext.orgId}`,
      source_module_id: `eq.${moduleId}`,
      source_record_id: `eq.${recordId}`,
      select: "id,name,status,task_type,priority,assignee_id,assignee_role_id,assignee_type,due_date,sort_order,process_group_id,process_run_id,process_run_stage_id,source_template_id,source_stage_sort_order,recurrence_info",
      order: "sort_order.asc",
      limit: 300
    }));
  }
  if (runIds.length) {
    taskFilters.push(safeRestSelect(supabaseUrl, serviceRoleKey, "tasks", {
      org_id: `eq.${authContext.orgId}`,
      process_run_id: `in.(${runIds.join(",")})`,
      select: "id,name,status,task_type,priority,assignee_id,assignee_role_id,assignee_type,due_date,sort_order,process_group_id,process_run_id,process_run_stage_id,source_template_id,source_stage_sort_order,recurrence_info",
      order: "sort_order.asc",
      limit: 300
    }));
  }
  const taskRows = (await Promise.all(taskFilters)).flat();
  const tasks = Array.from(new Map(taskRows.map((task) => [normalizeId(task?.id), task])).values()).filter((task) => task?.id);
  const stagesByTemplateId = /* @__PURE__ */ new Map();
  templateStages.forEach((stage) => {
    const key = normalizeId(stage?.template_id);
    stagesByTemplateId.set(key, [...stagesByTemplateId.get(key) || [], stage]);
  });
  const stagesByRunId = /* @__PURE__ */ new Map();
  runStages.forEach((stage) => {
    const key = normalizeId(stage?.process_run_id);
    stagesByRunId.set(key, [...stagesByRunId.get(key) || [], stage]);
  });
  return {
    templates: relevantTemplates.map((template) => ({
      ...template,
      stages: (stagesByTemplateId.get(normalizeId(template?.id)) || []).slice(0, 30)
    })),
    runs: runs.map((run) => ({
      ...run,
      stages: (stagesByRunId.get(normalizeId(run?.id)) || []).slice(0, 40)
    })),
    tasks
  };
};
var buildAiProcessOperationPrompt = (input) => [
  "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0627\u062C\u0631\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0647\u0633\u062A\u06CC\u062F. \u0641\u0642\u0637 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646 \u0648 \u0647\u06CC\u0686 \u062A\u0648\u0636\u06CC\u062D \u062E\u0627\u0631\u062C \u0627\u0632 JSON \u0646\u0646\u0648\u06CC\u0633.",
  "\u0641\u0642\u0637 \u0627\u0632 operation\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646 \u0648 \u0647\u06CC\u0686 UUID \u062A\u0627\u0632\u0647 \u06CC\u0627 \u0633\u0627\u062E\u062A\u06AF\u06CC \u0646\u0633\u0627\u0632.",
  "\u0627\u06AF\u0631 \u0628\u0627\u06CC\u062F \u0627\u0632 \u0627\u0644\u06AF\u0648\u06CC \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u0648\u062F\u060C template_id \u0628\u0627\u06CC\u062F \u062F\u0642\u06CC\u0642\u0627\u064B \u06CC\u06A9\u06CC \u0627\u0632 template\u0647\u0627\u06CC context \u0628\u0627\u0634\u062F.",
  "\u0627\u06AF\u0631 \u0628\u0627\u06CC\u062F \u0631\u0648\u06CC \u0627\u062C\u0631\u0627\u06CC \u0645\u0648\u062C\u0648\u062F \u06A9\u0627\u0631 \u0634\u0648\u062F\u060C process_run_id \u0648 stage_id \u0628\u0627\u06CC\u062F \u062F\u0642\u06CC\u0642\u0627\u064B \u0627\u0632 context \u0628\u0627\u0634\u062F.",
  "\u0627\u06AF\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u0627\u0631\u0628\u0631 \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u062F\u0642\u06CC\u0642 \u0641\u0631\u0622\u06CC\u0646\u062F \u06CC\u0627 \u0633\u0627\u062E\u062A \u0641\u0639\u0627\u0644\u06CC\u062A \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A\u060C \u0639\u0645\u0644\u06CC\u0627\u062A \u0646\u0633\u0627\u0632\u061B needs_clarification=true \u0648 questions \u0628\u062F\u0647.",
  "\u0633\u0648\u0627\u0644\u200C\u0647\u0627 \u0628\u0627\u06CC\u062F \u0628\u0631 \u0627\u0633\u0627\u0633 \u0647\u062F\u0641 \u06A9\u0627\u0631\u0628\u0631 \u0648 \u0645\u0633\u06CC\u0631 \u0648\u0627\u0642\u0639\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0628\u0627\u0634\u062F\u060C \u0646\u0647 \u0641\u0642\u0637 \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0627\u062C\u0628\u0627\u0631\u06CC.",
  "\u062D\u0630\u0641 \u0645\u0631\u062D\u0644\u0647 \u0648\u0627\u0642\u0639\u06CC \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A\u061B \u0628\u0631\u0627\u06CC \u062D\u0630\u0641/\u06A9\u0645 \u06A9\u0631\u062F\u0646 \u0645\u0631\u062D\u0644\u0647 \u0648\u0627\u0642\u0639\u06CC \u0627\u0632 cancel_stage_task \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646.",
  "\u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0641\u0631\u0622\u06CC\u0646\u062F \u062E\u0627\u0645\u060C stages \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648 \u0645\u0631\u062A\u0628 \u0628\u062F\u0647. \u0648\u0636\u0639\u06CC\u062A \u0641\u0639\u0627\u0644\u06CC\u062A \u0628\u0627\u06CC\u062F \u06CC\u06A9\u06CC \u0627\u0632 todo/planned/in_progress/review/done/canceled \u0628\u0627\u0634\u062F.",
  "\u0628\u0631\u0627\u06CC \u0648\u0636\u0639\u06CC\u062A\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0627\u062E\u062A\u0635\u0627\u0635\u06CC \u0647\u0631 \u0641\u0639\u0627\u0644\u06CC\u062A\u060C \u0627\u0632 status_options \u0648 custom_fields/custom_values \u062F\u0627\u062E\u0644 stage \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646.",
  "",
  "operation\u0647\u0627\u06CC \u0645\u062C\u0627\u0632:",
  "- materialize_template_to_tasks: \u06A9\u067E\u06CC \u0627\u0644\u06AF\u0648\u06CC \u0645\u0648\u062C\u0648\u062F \u0648 \u0633\u0627\u062E\u062A task \u0648\u0627\u0642\u0639\u06CC \u0628\u0631\u0627\u06CC \u0645\u0631\u062D\u0644\u0647\u200C\u0647\u0627",
  "- create_raw_process_with_tasks: \u0633\u0627\u062E\u062A \u0641\u0631\u0622\u06CC\u0646\u062F \u062E\u0627\u0645 \u0648 task \u0648\u0627\u0642\u0639\u06CC \u0628\u0631 \u0627\u0633\u0627\u0633 \u067E\u0631\u0627\u0645\u067E\u062A",
  "- add_stage_task: \u0627\u0641\u0632\u0648\u062F\u0646 \u0645\u0631\u062D\u0644\u0647/task \u0628\u0647 \u0627\u062C\u0631\u0627\u06CC \u0645\u0648\u062C\u0648\u062F \u06CC\u0627 \u0631\u06A9\u0648\u0631\u062F \u062C\u0627\u0631\u06CC",
  "- update_stage_task: \u0648\u06CC\u0631\u0627\u06CC\u0634 task/stage \u0645\u0648\u062C\u0648\u062F",
  "- cancel_stage_task: \u0644\u063A\u0648 \u0645\u0631\u062D\u0644\u0647/task \u0645\u0648\u062C\u0648\u062F",
  "",
  "\u0642\u0627\u0644\u0628 \u062E\u0631\u0648\u062C\u06CC:",
  '{"reply":"\u067E\u06CC\u0627\u0645 \u06A9\u0648\u062A\u0627\u0647 \u0641\u0627\u0631\u0633\u06CC","needs_clarification":false,"questions":[],"operations":[{"type":"create_raw_process_with_tasks","process_name":"...","stages":[{"name":"...","sort_order":10,"task_type":"\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC","status":"todo","due_days":2,"assignee":{"type":"role","id":"..."}, "custom_fields":[], "custom_values":{}, "status_options":[], "automation_rules":[]}]}]}',
  "",
  JSON.stringify(input)
].join("\n");
var executeAiProcessOperation = async (supabaseUrl, serviceRoleKey, authContext, pageContext, operation, processContext, orgPeopleContext) => {
  const type = String(operation?.type || "").trim();
  const moduleId = String(operation?.module_id || pageContext?.moduleId || "").trim();
  const recordId = normalizeId(operation?.record_id || pageContext?.recordId);
  if (!moduleId || !isUuid(recordId)) throw new Error("\u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A.");
  const modulePerm = getModulePermission(authContext.permissions, moduleId);
  const taskPerm = getModulePermission(authContext.permissions, "tasks");
  if (!canViewModule(modulePerm) || !canCreateModule(taskPerm)) {
    throw new Error("\u062F\u0633\u062A\u0631\u0633\u06CC \u0627\u06CC\u062C\u0627\u062F \u06CC\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.");
  }
  if (type === "materialize_template_to_tasks") {
    const templateId = normalizeId(operation?.template_id);
    const template = (processContext.templates || []).find((item) => normalizeId(item?.id) === templateId);
    if (!template) throw new Error("\u0627\u0644\u06AF\u0648\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u062C\u0627\u0632 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const processName = String(operation?.process_name || template.name || "").trim() || "\u0641\u0631\u0622\u06CC\u0646\u062F";
    const runIdResult = await restRpc(supabaseUrl, serviceRoleKey, "create_process_run_from_template", {
      p_org_id: authContext.orgId,
      p_template_id: templateId,
      p_module_id: moduleId,
      p_record_id: recordId,
      p_process_name: processName,
      p_copied_mode: "auto"
    });
    const processRunId = Array.isArray(runIdResult) ? normalizeId(runIdResult[0]) : normalizeId(runIdResult);
    if (!isUuid(processRunId)) throw new Error("\u0627\u062C\u0631\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F.");
    const runRows = await restSelect(supabaseUrl, serviceRoleKey, "process_runs", {
      id: `eq.${processRunId}`,
      org_id: `eq.${authContext.orgId}`,
      select: "id,template_id,module_id,record_id,process_name,status,process_group_id",
      limit: 1
    });
    const processRun = runRows[0] || { id: processRunId, template_id: templateId, process_name: processName };
    const stageRows = await restSelect(supabaseUrl, serviceRoleKey, "process_run_stages", {
      process_run_id: `eq.${processRunId}`,
      select: "id,process_run_id,template_stage_id,stage_name,sort_order,status,assignee_user_id,assignee_role_id,wage,metadata",
      order: "sort_order.asc",
      limit: 200
    });
    const createdTasks = [];
    for (const runStage of stageRows) {
      if (runStage?.task_id) continue;
      const templateStage = (template.stages || []).find((stage) => normalizeId(stage?.id) === normalizeId(runStage?.template_stage_id)) || {};
      if (templateStage?.auto_create_task === false && operation?.force !== true) continue;
      const payload = buildProcessTaskPayload({
        authContext,
        moduleId,
        recordId,
        processRun,
        processRunStage: runStage,
        stage: { ...templateStage, ...runStage, name: runStage.stage_name },
        orgPeopleContext,
        sourceTemplateId: templateId
      });
      const taskRows = await restInsert(supabaseUrl, serviceRoleKey, "tasks", [payload]);
      const task = taskRows[0] || null;
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, payload.name), stage_id: runStage.id });
        await restPatch(supabaseUrl, serviceRoleKey, "process_run_stages", { id: `eq.${runStage.id}` }, {
          task_id: task.id,
          status: normalizeAiProcessStageStatus(task.status),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).catch(() => []);
      }
    }
    return { type, process_run_id: processRunId, created_tasks: createdTasks, title: processName };
  }
  if (type === "create_raw_process_with_tasks") {
    const processName = String(operation?.process_name || "\u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC").trim() || "\u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC";
    const processGroupId = `ai_process_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const processRows = await restInsert(supabaseUrl, serviceRoleKey, "process_runs", [{
      org_id: authContext.orgId,
      template_id: null,
      module_id: moduleId,
      record_id: recordId,
      process_name: processName,
      status: "active",
      copied_mode: "auto",
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      process_group_id: processGroupId,
      created_by: authContext.userId || null,
      updated_by: authContext.userId || null
    }]);
    const processRun = processRows[0];
    if (!processRun?.id) throw new Error("\u0627\u062C\u0631\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F \u062E\u0627\u0645 \u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F.");
    const inputStages = Array.isArray(operation?.stages) ? operation.stages : [];
    const createdTasks = [];
    for (const [index, inputStage] of inputStages.entries()) {
      const stageName = String(inputStage?.name || inputStage?.stage_name || `\u0645\u0631\u062D\u0644\u0647 ${index + 1}`).trim() || `\u0645\u0631\u062D\u0644\u0647 ${index + 1}`;
      const assignee = normalizeAiProcessAssignee(inputStage?.assignee, orgPeopleContext);
      const stageRows = await restInsert(supabaseUrl, serviceRoleKey, "process_run_stages", [{
        process_run_id: processRun.id,
        template_stage_id: null,
        stage_name: stageName,
        sort_order: Number(inputStage?.sort_order || (index + 1) * 10),
        status: normalizeAiProcessStageStatus(inputStage?.status),
        assignee_user_id: assignee.assignee_id,
        assignee_role_id: assignee.assignee_role_id,
        wage: numberFrom(inputStage?.wage, 0),
        metadata: {
          ...inputStage?.metadata && typeof inputStage.metadata === "object" ? inputStage.metadata : {},
          source: "ai_process_operation",
          process_group_id: processGroupId,
          task_type: String(inputStage?.task_type || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC").trim() || "\u0641\u0639\u0627\u0644\u06CC\u062A \u0633\u0627\u0632\u0645\u0627\u0646\u06CC",
          automation_rules: Array.isArray(inputStage?.automation_rules) ? inputStage.automation_rules : [],
          [PROCESS_TASK_CUSTOM_FIELDS_KEY]: Array.isArray(inputStage?.custom_fields) ? inputStage.custom_fields : [],
          [PROCESS_TASK_STATUS_OPTIONS_KEY]: Array.isArray(inputStage?.status_options) ? inputStage.status_options : [],
          [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: inputStage?.custom_values && typeof inputStage.custom_values === "object" ? inputStage.custom_values : {}
        }
      }]);
      const processRunStage = stageRows[0] || null;
      const payload = buildProcessTaskPayload({
        authContext,
        moduleId,
        recordId,
        processRun,
        processRunStage,
        stage: { ...inputStage, name: stageName, process_group_id: processGroupId },
        orgPeopleContext
      });
      const taskRows = await restInsert(supabaseUrl, serviceRoleKey, "tasks", [payload]);
      const task = taskRows[0] || null;
      if (task?.id) {
        createdTasks.push({ id: task.id, title: buildAiRecordTitle(task, payload.name), stage_id: processRunStage?.id || null });
        if (processRunStage?.id) {
          await restPatch(supabaseUrl, serviceRoleKey, "process_run_stages", { id: `eq.${processRunStage.id}` }, {
            task_id: task.id,
            status: normalizeAiProcessStageStatus(task.status),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).catch(() => []);
        }
      }
    }
    return { type, process_run_id: processRun.id, created_tasks: createdTasks, title: processName };
  }
  if (type === "add_stage_task") {
    const runId = normalizeId(operation?.process_run_id);
    const run = runId ? (processContext.runs || []).find((item) => normalizeId(item?.id) === runId) : (processContext.runs || [])[0];
    if (!run?.id) {
      return await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext, {
        type: "create_raw_process_with_tasks",
        process_name: operation?.process_name || "\u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
        stages: [operation?.stage || operation]
      }, processContext, orgPeopleContext);
    }
    const existingSorts = (run.stages || []).map((stage2) => Number(stage2?.sort_order || 0));
    const nextSort = Number(operation?.stage?.sort_order || operation?.sort_order || Math.max(0, ...existingSorts) + 10);
    const stage = { ...operation?.stage || operation, sort_order: nextSort };
    const assignee = normalizeAiProcessAssignee(stage?.assignee, orgPeopleContext);
    const stageRows = await restInsert(supabaseUrl, serviceRoleKey, "process_run_stages", [{
      process_run_id: run.id,
      stage_name: String(stage?.name || stage?.stage_name || "\u0645\u0631\u062D\u0644\u0647 \u062C\u062F\u06CC\u062F").trim() || "\u0645\u0631\u062D\u0644\u0647 \u062C\u062F\u06CC\u062F",
      sort_order: nextSort,
      status: normalizeAiProcessStageStatus(stage?.status),
      assignee_user_id: assignee.assignee_id,
      assignee_role_id: assignee.assignee_role_id,
      wage: numberFrom(stage?.wage, 0),
      metadata: { ...stage?.metadata || {}, source: "ai_process_operation", process_group_id: run.process_group_id || run.id }
    }]);
    const processRunStage = stageRows[0] || null;
    const taskRows = await restInsert(supabaseUrl, serviceRoleKey, "tasks", [buildProcessTaskPayload({
      authContext,
      moduleId,
      recordId,
      processRun: run,
      processRunStage,
      stage,
      orgPeopleContext,
      sourceTemplateId: run.template_id || null
    })]);
    const task = taskRows[0] || null;
    if (task?.id && processRunStage?.id) {
      await restPatch(supabaseUrl, serviceRoleKey, "process_run_stages", { id: `eq.${processRunStage.id}` }, { task_id: task.id, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => []);
    }
    return { type, process_run_id: run.id, created_tasks: task?.id ? [{ id: task.id, title: buildAiRecordTitle(task, task.name), stage_id: processRunStage?.id || null }] : [] };
  }
  if (type === "update_stage_task") {
    const taskId = normalizeId(operation?.task_id);
    const stageId = normalizeId(operation?.stage_id || operation?.process_run_stage_id);
    const task = taskId ? (processContext.tasks || []).find((item) => normalizeId(item?.id) === taskId) : stageId ? (processContext.tasks || []).find((item) => normalizeId(item?.process_run_stage_id) === stageId) : null;
    if (!task?.id) throw new Error("\u0641\u0639\u0627\u0644\u06CC\u062A \u0642\u0627\u0628\u0644 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u062F\u0631 context \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (operation?.name || operation?.title) patch.name = String(operation.name || operation.title).trim();
    if (operation?.status) patch.status = normalizeAiProcessStatus(operation.status);
    if (operation?.description !== void 0) patch.description = String(operation.description || "").trim() || null;
    if (operation?.due_date || operation?.due_days !== void 0) patch.due_date = operation.due_date || addDaysIso(operation.due_days);
    if (operation?.assignee) Object.assign(patch, normalizeAiProcessAssignee(operation.assignee, orgPeopleContext));
    if (operation?.custom_values && typeof operation.custom_values === "object") {
      const recurrence = task.recurrence_info && typeof task.recurrence_info === "object" ? task.recurrence_info : {};
      patch.recurrence_info = {
        ...recurrence,
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: {
          ...recurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] || {},
          ...operation.custom_values
        }
      };
    }
    await restPatch(supabaseUrl, serviceRoleKey, "tasks", { id: `eq.${task.id}`, org_id: `eq.${authContext.orgId}` }, patch);
    if (task.process_run_stage_id) {
      await restPatch(supabaseUrl, serviceRoleKey, "process_run_stages", { id: `eq.${task.process_run_stage_id}` }, {
        status: normalizeAiProcessStageStatus(patch.status || task.status),
        task_id: task.id,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).catch(() => []);
    }
    return { type, updated_task_id: task.id, title: patch.name || task.name };
  }
  if (type === "cancel_stage_task") {
    const taskId = normalizeId(operation?.task_id);
    const stageId = normalizeId(operation?.stage_id || operation?.process_run_stage_id);
    const task = taskId ? (processContext.tasks || []).find((item) => normalizeId(item?.id) === taskId) : stageId ? (processContext.tasks || []).find((item) => normalizeId(item?.process_run_stage_id) === stageId) : null;
    if (!task?.id && !stageId) throw new Error("\u0645\u0631\u062D\u0644\u0647 \u06CC\u0627 \u0641\u0639\u0627\u0644\u06CC\u062A \u0642\u0627\u0628\u0644 \u0644\u063A\u0648 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    if (task?.id) {
      await restPatch(supabaseUrl, serviceRoleKey, "tasks", { id: `eq.${task.id}`, org_id: `eq.${authContext.orgId}` }, {
        status: "canceled",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const targetStageId = stageId || normalizeId(task?.process_run_stage_id);
    if (targetStageId) {
      await restPatch(supabaseUrl, serviceRoleKey, "process_run_stages", { id: `eq.${targetStageId}` }, {
        status: "canceled",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).catch(() => []);
    }
    return { type, canceled_task_id: task?.id || null, canceled_stage_id: targetStageId || null };
  }
  throw new Error(`\u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC ${type || "\u0646\u0627\u0645\u0634\u062E\u0635"} \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.`);
};
var handleProcessOperationFromPrompt = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const prompt = String(body?.message || body?.prompt || "").trim();
  if (!prompt) return json(400, { success: false, message: "\u0645\u062A\u0646 \u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const file = body?.file || body?.attachment || null;
  const filePrompt = file ? [
    prompt,
    "",
    `\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A: ${String(file?.filename || file?.fileName || file?.name || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A").trim() || "\u0641\u0627\u06CC\u0644 \u067E\u06CC\u0648\u0633\u062A"}`,
    String(file?.text || "").trim() ? `\u0645\u062D\u062A\u0648\u0627\u06CC \u0641\u0627\u06CC\u0644:
${String(file.text).trim()}` : ""
  ].filter(Boolean).join("\n") : prompt;
  const rawContext = normalizeContext(body?.context || {});
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId) {
    return json(403, { success: false, message: "\u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0628\u0627\u06CC\u062F \u0631\u0648\u06CC \u0631\u06A9\u0648\u0631\u062F \u0642\u0627\u0628\u0644 \u062F\u0633\u062A\u0631\u0633 \u0628\u0627\u0634\u06CC\u062F." });
  }
  const processPerm = getModulePermission(authContext.permissions, "process_runs");
  const taskPerm = getModulePermission(authContext.permissions, "tasks");
  if (!canViewModule(processPerm) || !canCreateModule(taskPerm)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0644\u0627\u0632\u0645 \u0628\u0631\u0627\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0641\u0631\u0622\u06CC\u0646\u062F \u0648 \u0641\u0639\u0627\u0644\u06CC\u062A\u200C\u0647\u0627 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const capability = String(body?.capability || "workflow_ai_prompt").trim() || "workflow_ai_prompt";
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, capability, { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, capability);
  const [processContext, orgPeopleContext, companyContext] = await Promise.all([
    loadAiProcessContext(supabaseUrl, serviceRoleKey, authContext, pageContext),
    loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, filePrompt),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext)
  ]);
  const contextKey = buildContextKey(rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `\u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: filePrompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      input_kind: String(body?.inputKind || body?.input_kind || (file ? "file" : "process_operation")).trim() || "process_operation",
      context_key: contextKey,
      context: pageContext.context,
      file: file ? {
        filename: file?.filename || file?.fileName || file?.name || null,
        mime_type: file?.mimeType || file?.mime_type || null,
        size: file?.size || null,
        asset_id: file?.assetId || file?.asset_id || null,
        entry_id: file?.entryId || file?.entry_id || null
      } : null
    }
  });
  const processPrompt = buildAiProcessOperationPrompt({
    request: filePrompt,
    company: companyContext,
    current: {
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      summary: pageContext.summary,
      record: pageContext.records?.[0] || null
    },
    people: {
      roles: (orgPeopleContext.roles || []).slice(0, 60),
      users: (orgPeopleContext.users || []).slice(0, 120)
    },
    process_context: processContext
  });
  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: "user",
      content: file && !String(file?.text || "").trim() ? buildOpenAiInputContentParts(processPrompt, file) : processPrompt
    }
  ], {
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_${capability}_process_operation`
  });
  const parsed = extractJsonObjectFromText(aiResult.content) || {};
  const clarificationQuestions = normalizeAiClarificationQuestions(parsed?.questions);
  const needsClarification = parsed?.needs_clarification === true || parsed?.needsClarification === true || clarificationQuestions.length > 0;
  const operations = !needsClarification && Array.isArray(parsed?.operations) ? parsed.operations : [];
  if (operations.length === 0) {
    const reply2 = buildAiClarificationReply(String(parsed?.reply || "").trim() || "\u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u062F\u0642\u06CC\u0642 \u0627\u06CC\u0646 \u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0628\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0628\u06CC\u0634\u062A\u0631\u06CC \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u0645.", clarificationQuestions);
    const assistantMessage2 = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: "assistant",
      content: reply2,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        action: "process_operation_from_prompt",
        capability,
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        raw_ai_json: parsed,
        needs_clarification: needsClarification
      }
    });
    const ledger2 = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage2?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: { source: "process_operation_clarification", context_key: contextKey }
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage2, aiResult.usageMetadata, ledger2);
    await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        ...thread?.metadata || {},
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: "process_operation_clarification",
        last_message_preview: prompt.slice(0, 300)
      }
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage2?.id || null,
      answer: reply2,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger2)
    });
  }
  const reply = String(parsed?.reply || "").trim() || "\u0627\u0642\u062F\u0627\u0645\u200C\u0647\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0627\u062C\u0631\u0627 \u0634\u062F.";
  const previewOnly = body?.previewOnly === true || body?.preview_only === true || body?.autoExecute === false || body?.auto_execute === false;
  if (previewOnly) {
    const assistantMessage2 = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
      thread_id: thread.id,
      role: "assistant",
      content: `${reply}

\u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0627\u0642\u062F\u0627\u0645\u060C \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0628\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.`,
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        action: "process_operation_from_prompt",
        capability,
        context_key: contextKey,
        usage: aiResult.usageMetadata,
        avalai_request_id: aiResult.requestId || null,
        proposed_operations: operations,
        raw_ai_json: parsed,
        requires_confirmation: true
      }
    });
    const actionRows = await restInsert(supabaseUrl, serviceRoleKey, "ai_action_logs", [{
      org_id: authContext.orgId,
      thread_id: thread.id,
      message_id: assistantMessage2?.id || null,
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      action_type: "process_operation_from_prompt",
      status: "proposed",
      proposed_payload: {
        prompt,
        reply,
        operations,
        context: pageContext.context || null,
        module_id: pageContext.moduleId,
        record_id: pageContext.recordId
      },
      result_payload: { model: aiResult.model, preview_only: true },
      avalai_request_id: aiResult.requestId || null,
      created_by: authContext.userId || null
    }]);
    const proposedAction = actionRows[0] || null;
    const ledger2 = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: thread.id,
      messageId: assistantMessage2?.id || null,
      requestId: aiResult.requestId,
      capability,
      provider: aiResult.provider,
      model: aiResult.model,
      usageMetadata: aiResult.usageMetadata,
      metadata: { source: "process_operation_preview", context_key: contextKey, operation_count: operations.length }
    });
    await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage2, aiResult.usageMetadata, ledger2);
    await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      provider: aiResult.provider,
      model: aiResult.model,
      metadata: {
        ...thread?.metadata || {},
        route: pageContext.context?.route || null,
        summary: pageContext.summary || null,
        context_kind: getContextKind(pageContext.context || {}),
        context_label: buildThreadContextLabel(pageContext),
        context: pageContext.context || null,
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        last_activity_kind: "process_operation_preview",
        last_message_preview: prompt.slice(0, 300),
        last_action_log_id: proposedAction?.id || null
      }
    });
    return json(200, {
      success: true,
      threadId: thread.id,
      userMessageId: userMessage?.id || null,
      messageId: assistantMessage2?.id || null,
      answer: `${reply}

\u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0627\u0642\u062F\u0627\u0645\u060C \u062A\u0627\u06CC\u06CC\u062F \u06A9\u0627\u0631\u0628\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.`,
      proposedAction: {
        id: proposedAction?.id || null,
        actionType: "process_operation_from_prompt",
        moduleId: pageContext.moduleId,
        recordId: pageContext.recordId,
        operations,
        status: "proposed"
      },
      operations,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: withCustomerBilling(aiResult.usageMetadata, ledger2)
    });
  }
  const executed = [];
  for (const operation of operations.slice(0, 8)) {
    executed.push(await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext, operation, processContext, orgPeopleContext));
  }
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: reply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      action: "process_operation_from_prompt",
      capability,
      context_key: contextKey,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      operations: executed,
      raw_ai_json: parsed
    }
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability,
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: "process_operation_from_prompt", context_key: contextKey, operation_count: executed.length }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  await restInsert(supabaseUrl, serviceRoleKey, "ai_action_logs", [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    message_id: assistantMessage?.id || null,
    module_id: pageContext.moduleId,
    record_id: pageContext.recordId,
    action_type: "process_operation_from_prompt",
    status: "executed",
    proposed_payload: { prompt, raw_operations: operations },
    result_payload: { reply, operations: executed, model: aiResult.model },
    avalai_request_id: aiResult.requestId || null,
    created_by: authContext.userId || null,
    executed_at: (/* @__PURE__ */ new Date()).toISOString()
  }]).catch((error) => console.warn("AI process operation log skipped", error));
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: "process_operation",
      last_message_preview: prompt.slice(0, 300),
      last_process_operations: executed
    }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: reply,
    operations: executed,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger
  });
};
var handleTranscribeVoice = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const audio = body?.audio || {};
  const audioBase64 = String(audio?.data || body?.audioBase64 || body?.audio_base64 || "").trim();
  if (!audioBase64) return json(400, { success: false, message: "\u0641\u0627\u06CC\u0644 \u0635\u0648\u062A\u06CC \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "voice_input");
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "voice_input");
  const result = await callAudioTranscription(
    providerConfig,
    audioBase64,
    String(audio?.mimeType || audio?.mime_type || body?.mimeType || "audio/webm"),
    String(audio?.filename || body?.filename || "voice.webm")
  );
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    capability: "voice_input",
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    usageMetadata: result.usageMetadata,
    metadata: {
      source: "voice_transcription",
      mime_type: String(audio?.mimeType || audio?.mime_type || body?.mimeType || "audio/webm"),
      duration_ms: numberFrom(audio?.durationMs || audio?.duration_ms || body?.durationMs, 0)
    }
  });
  return json(200, {
    success: true,
    transcript: result.transcript,
    provider: result.provider,
    model: result.model,
    usage: result.usageMetadata,
    ledger
  });
};
var handleGenerateVoiceOutput = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const text = String(body?.text || body?.prompt || body?.message || "").trim();
  if (!text) return json(400, { success: false, message: "\u0645\u062A\u0646 \u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "voice_output", { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "voice_output");
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `\u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627: ${text}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: text,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: "voice_output_prompt",
      capability: "voice_output"
    }
  });
  const voiceOptions = body?.settings && typeof body.settings === "object" ? body.settings : {};
  const voiceResult = await callAudioSpeech(providerConfig, text, {
    voice: voiceOptions.voice || body?.voice,
    speed: voiceOptions.speed ?? body?.speed,
    responseFormat: voiceOptions.responseFormat || voiceOptions.format || body?.responseFormat
  });
  const extension = String(voiceResult.format || "").trim() || (String(voiceResult.contentType || "").includes("wav") ? "wav" : "mp3");
  const storedVoice = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, voiceResult.bytes, voiceResult.contentType, {
    prefix: "voice",
    extension
  });
  let fileManagerResult = null;
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: "\u0641\u0627\u06CC\u0644 \u0635\u0648\u062A\u06CC \u0622\u0645\u0627\u062F\u0647 \u0634\u062F.",
    provider: voiceResult.provider,
    model: voiceResult.model,
    metadata: {
      capability: "voice_output",
      prompt: text,
      file: storedVoice,
      usage: voiceResult.usageMetadata,
      avalai_request_id: voiceResult.requestId || null
    }
  });
  fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedVoice, {
    displayName: `\u0635\u062F\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${extension}`,
    fileType: "audio",
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    prompt: text
  }).catch((error) => {
    console.warn("Could not register generated voice in file manager", error);
    return null;
  });
  if (assistantMessage?.id && fileManagerResult) {
    await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", {
      id: `eq.${assistantMessage.id}`,
      org_id: `eq.${authContext.orgId}`
    }, {
      metadata: {
        capability: "voice_output",
        prompt: text,
        file: {
          ...storedVoice,
          asset_id: fileManagerResult?.asset?.id || null,
          entry_id: fileManagerResult?.entry?.id || null,
          folder_id: fileManagerResult?.folder?.id || null
        },
        usage: voiceResult.usageMetadata,
        avalai_request_id: voiceResult.requestId || null
      }
    }).catch(() => []);
  }
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: voiceResult.requestId,
    capability: "voice_output",
    provider: voiceResult.provider,
    model: voiceResult.model,
    usageMetadata: voiceResult.usageMetadata,
    metadata: { source: "voice_output", user_message_id: userMessage?.id || null, storage_path: storedVoice.path }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, voiceResult.usageMetadata, ledger);
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: voiceResult.provider,
    model: voiceResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: "voice_output",
      last_message_preview: text.slice(0, 300),
      last_file_path: storedVoice.path,
      last_file_asset_id: fileManagerResult?.asset?.id || null,
      last_file_entry_id: fileManagerResult?.entry?.id || null,
      ai_files_folder_id: fileManagerResult?.folder?.id || null
    }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: "\u0641\u0627\u06CC\u0644 \u0635\u0648\u062A\u06CC \u0622\u0645\u0627\u062F\u0647 \u0634\u062F.",
    file: {
      ...storedVoice,
      asset_id: fileManagerResult?.asset?.id || null,
      entry_id: fileManagerResult?.entry?.id || null,
      folder_id: fileManagerResult?.folder?.id || null
    },
    provider: voiceResult.provider,
    model: voiceResult.model,
    usage: withCustomerBilling(voiceResult.usageMetadata, ledger),
    ledger
  });
};
var handleGenerateImage = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const prompt = String(body?.prompt || body?.message || "").trim();
  if (!prompt) return json(400, { success: false, message: "\u0645\u062A\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062A\u0635\u0648\u06CC\u0631 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "image_generation", { modelOverride: body?.modelOverride });
  const planContext = await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "image_generation");
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const imageSettings = body?.settings && typeof body.settings === "object" ? body.settings : {};
  const useOrganizationContext = imageSettings.useOrganizationContext !== false;
  const canUseKnowledge = useOrganizationContext && isAiCapabilityPlanAvailable(planContext, "document_analysis");
  const [companyContext, knowledgeChunks] = await Promise.all([
    useOrganizationContext ? loadCompanyContext(supabaseUrl, serviceRoleKey, authContext) : Promise.resolve(null),
    canUseKnowledge ? fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, prompt) : Promise.resolve([])
  ]);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: prompt.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      input_kind: "image_prompt",
      capability: "image_generation"
    }
  });
  const providerPrompt = clampImagePrompt(appendImageContextToPrompt(
    buildImagePromptWithSettings(prompt, imageSettings),
    { companyContext, pageSummary: pageContext.summary || null, knowledgeChunks }
  ));
  const rawSources = Array.isArray(body?.sourceImages) ? body.sourceImages : Array.isArray(imageSettings.sourceImages) ? imageSettings.sourceImages : [];
  const sourceImages = rawSources.map((src) => ({
    data: String(src?.data || src?.base64 || "").trim(),
    mimeType: String(src?.mimeType || src?.mime_type || "image/png").trim() || "image/png",
    filename: String(src?.filename || src?.fileName || "").trim() || void 0
  })).filter((src) => src.data);
  const sourceUrls = (Array.isArray(body?.sourceImageUrls) ? body.sourceImageUrls : Array.isArray(imageSettings.sourceImageUrls) ? imageSettings.sourceImageUrls : []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, 4);
  for (const url of sourceUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2e4) });
      if (!resp.ok) continue;
      const mimeType = resp.headers.get("content-type") || "image/png";
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.length) sourceImages.push({ data: uint8ToBase64(bytes), mimeType, filename: void 0 });
    } catch (error) {
      console.warn("Could not fetch source image url for editing", error);
    }
  }
  const imageCallOptions = {
    sourceImages,
    size: imageSettings.size || body?.size,
    quality: imageSettings.quality || body?.quality,
    n: imageSettings.n || body?.n,
    extraBody: imageSettings.extraBody || imageSettings.extra_body
  };
  const promptSettings = {
    persianText: imageSettings.persianText === true,
    persianDigits: imageSettings.persianDigits === true,
    rtlText: imageSettings.rtlText === true,
    orientationHorizontal: imageSettings.orientationHorizontal === true,
    orientationVertical: imageSettings.orientationVertical === true,
    useOrganizationContext
  };
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: "\u062F\u0631 \u062D\u0627\u0644 \u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631...",
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      capability: "image_generation",
      capabilities: ["image_generation"],
      kind: "image_generation",
      pending_status: true,
      recheckable: true,
      status: "processing",
      started_at: Date.now(),
      prompt,
      provider_prompt: providerPrompt,
      prompt_settings: promptSettings,
      context: pageContext.context,
      context_key: contextKey,
      context_summary: pageContext.summary,
      image_call_options: {
        size: imageCallOptions.size || null,
        quality: imageCallOptions.quality || null,
        n: imageCallOptions.n || null,
        extraBody: imageCallOptions.extraBody || null,
        hasSourceImages: sourceImages.length > 0
      }
    }
  });
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: providerConfig.provider,
    model: providerConfig.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: "image_generation_pending",
      last_message_preview: prompt.slice(0, 300),
      pending_message_id: assistantMessage?.id || null
    }
  }).catch(() => []);
  runBackgroundTask((async () => {
    try {
      const imageResult = await callImageGeneration(providerConfig, providerPrompt, imageCallOptions);
      const storedImage = await uploadGeneratedImage(supabaseUrl, serviceRoleKey, authContext, imageResult);
      const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedImage, {
        displayName: `\u062A\u0635\u0648\u06CC\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.png`,
        fileType: "image",
        threadId: thread.id,
        messageId: assistantMessage?.id || null,
        prompt
      }).catch((error) => {
        console.warn("Could not register generated image in file manager", error);
        return null;
      });
      const finalImage = fileManagerResult ? {
        ...storedImage,
        asset_id: fileManagerResult?.asset?.id || null,
        entry_id: fileManagerResult?.entry?.id || null,
        folder_id: fileManagerResult?.folder?.id || null
      } : storedImage;
      const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        threadId: thread.id,
        messageId: assistantMessage?.id || null,
        requestId: imageResult.requestId,
        capability: "image_generation",
        provider: imageResult.provider,
        model: imageResult.model,
        usageMetadata: imageResult.usageMetadata,
        metadata: { source: "image_generation", user_message_id: userMessage?.id || null, storage_path: storedImage.path }
      });
      await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, imageResult.usageMetadata, ledger);
      await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", {
        id: `eq.${assistantMessage.id}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        content: "\u062A\u0635\u0648\u06CC\u0631 \u0622\u0645\u0627\u062F\u0647 \u0634\u062F.",
        provider: imageResult.provider,
        model: imageResult.model,
        created_at: assistantMessage?.created_at || (/* @__PURE__ */ new Date()).toISOString(),
        metadata: {
          capability: "image_generation",
          capabilities: ["image_generation"],
          kind: "image_generation",
          pending_status: false,
          status: "completed",
          prompt,
          provider_prompt: providerPrompt,
          prompt_settings: promptSettings,
          image: finalImage,
          usage: withCustomerBilling(imageResult.usageMetadata, ledger),
          avalai_request_id: imageResult.requestId || null
        }
      }).catch(() => []);
      await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        provider: imageResult.provider,
        model: imageResult.model,
        context_type: getContextKind(pageContext.context || {}),
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        metadata: {
          ...thread?.metadata || {},
          route: pageContext.context?.route || null,
          summary: pageContext.summary || null,
          context_kind: getContextKind(pageContext.context || {}),
          context_label: buildThreadContextLabel(pageContext),
          context: pageContext.context || null,
          module_id: pageContext.moduleId || null,
          record_id: pageContext.recordId || null,
          last_activity_kind: "image_generation",
          last_message_preview: prompt.slice(0, 300),
          last_image_path: storedImage.path,
          last_file_asset_id: fileManagerResult?.asset?.id || null,
          last_file_entry_id: fileManagerResult?.entry?.id || null,
          ai_files_folder_id: fileManagerResult?.folder?.id || null
        }
      }).catch(() => []);
    } catch (error) {
      const rawFailure = shortenProviderError(String(error?.message || error || "image_generation_failed"));
      const failureMessage = `\u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F. \u0633\u0631\u0648\u06CC\u0633 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u0632\u0645\u0627\u0646 \u0645\u0646\u0627\u0633\u0628 \u067E\u0627\u0633\u062E \u0646\u062F\u0627\u062F \u06CC\u0627 \u062E\u0637\u0627 \u062F\u0627\u062F. \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.${rawFailure ? `
\u062C\u0632\u0626\u06CC\u0627\u062A: ${rawFailure}` : ""}`;
      await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", {
        id: `eq.${assistantMessage?.id}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        content: failureMessage,
        provider: providerConfig.provider,
        model: providerConfig.model,
        metadata: {
          capability: "image_generation",
          capabilities: ["image_generation"],
          kind: "image_generation",
          pending_status: false,
          status: "failed",
          failed: true,
          prompt,
          provider_prompt: providerPrompt,
          prompt_settings: promptSettings,
          error: rawFailure || "image_generation_failed",
          failed_note: failureMessage
        }
      }).catch(() => []);
      await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        provider: providerConfig.provider,
        model: providerConfig.model,
        context_type: getContextKind(pageContext.context || {}),
        module_id: pageContext.moduleId || null,
        record_id: pageContext.recordId || null,
        metadata: {
          ...thread?.metadata || {},
          route: pageContext.context?.route || null,
          summary: pageContext.summary || null,
          context_kind: getContextKind(pageContext.context || {}),
          context_label: buildThreadContextLabel(pageContext),
          context: pageContext.context || null,
          module_id: pageContext.moduleId || null,
          record_id: pageContext.recordId || null,
          last_activity_kind: "image_generation_failed",
          last_message_preview: failureMessage.slice(0, 300)
        }
      }).catch(() => []);
    }
  })());
  return json(200, {
    success: true,
    pending: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631 \u062B\u0628\u062A \u0634\u062F.",
    provider: providerConfig.provider,
    model: providerConfig.model,
    messages: [userMessage, assistantMessage].filter(Boolean)
  });
};
var handleGetImageStatus = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const messageId = normalizeId(body?.messageId);
  if (!messageId) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u067E\u06CC\u0627\u0645 \u062A\u0635\u0648\u06CC\u0631 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_messages", {
    id: `eq.${messageId}`,
    org_id: `eq.${authContext.orgId}`,
    select: "id,thread_id,role,content,provider,model,metadata,created_at",
    limit: "1"
  });
  const msg = rows[0] || null;
  if (!msg) return json(404, { success: false, message: "\u067E\u06CC\u0627\u0645 \u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." });
  const metadata = msg.metadata || {};
  if (metadata.pending_status === true) {
    const startedAt = Number(metadata.started_at || 0);
    const elapsedMs = startedAt ? Date.now() - startedAt : 0;
    if (startedAt && elapsedMs > IMAGE_STATUS_STALE_MS) {
      const failureMessage = "\u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631 \u062F\u0631 \u0632\u0645\u0627\u0646 \u0645\u0648\u0631\u062F \u0627\u0646\u062A\u0638\u0627\u0631 \u06A9\u0627\u0645\u0644 \u0646\u0634\u062F. \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0648 \u06A9\u0627\u0631\u062A \u06AF\u0641\u062A\u06AF\u0648 \u062D\u0641\u0638 \u0634\u062F\u061B \u0644\u0637\u0641\u0627\u064B \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0648\u0636\u0639\u06CC\u062A worker \u0633\u0631\u0648\u0631 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.";
      await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", {
        id: `eq.${messageId}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        content: failureMessage,
        metadata: {
          ...metadata,
          pending_status: false,
          status: "failed",
          failed: true,
          failed_note: failureMessage,
          error: "image_generation_worker_timeout"
        }
      }).catch(() => []);
      return json(200, { success: true, status: "failed", message: failureMessage, messageId, threadId: msg.thread_id });
    }
    return json(200, {
      success: true,
      status: "processing",
      messageId,
      threadId: msg.thread_id,
      message: msg,
      provider: msg.provider,
      model: msg.model
    });
  }
  return json(200, {
    success: true,
    status: metadata.failed || metadata.status === "failed" ? "failed" : "completed",
    messageId,
    threadId: msg.thread_id,
    message: msg,
    image: metadata.image || null,
    usage: metadata.usage || null,
    provider: msg.provider,
    model: msg.model
  });
};
var DOCUMENT_FORMATS = {
  docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pdf: { ext: "pdf", mime: "application/pdf" },
  csv: { ext: "csv", mime: "text/csv" }
};
var escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var normalizeDocumentSpec = (raw) => {
  const spec = raw && typeof raw === "object" ? raw : {};
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [];
  if (!sheets.length) {
    const table = blocks.find((b) => b?.type === "table" && Array.isArray(b.columns));
    if (table) sheets.push({ name: "Sheet1", columns: table.columns, rows: Array.isArray(table.rows) ? table.rows : [] });
  }
  return { title: String(spec.title || "").trim() || "\u0633\u0646\u062F \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC", blocks, sheets };
};
var buildDocumentHtml = (spec) => {
  const parts = [];
  parts.push(`<h1>${escapeHtml(spec.title)}</h1>`);
  for (const block of spec.blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "heading") {
      const level = Math.min(4, Math.max(1, Number(block.level) || 2));
      parts.push(`<h${level}>${escapeHtml(block.text)}</h${level}>`);
    } else if (block.type === "paragraph") {
      parts.push(`<p>${escapeHtml(block.text)}</p>`);
    } else if (block.type === "list" && Array.isArray(block.items)) {
      parts.push(`<ul>${block.items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`);
    } else if (block.type === "table" && Array.isArray(block.columns)) {
      const head = `<tr>${block.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
      const rows = (Array.isArray(block.rows) ? block.rows : []).map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
      parts.push(`<table border="1" cellspacing="0" cellpadding="6">${head}${rows}</table>`);
    }
  }
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<style>
  body{font-family:Tahoma,'IRANSans',sans-serif;direction:rtl;padding:32px;color:#1f2937;line-height:1.9}
  h1{font-size:22px} h2{font-size:18px} h3{font-size:16px}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th{background:#f3f4f6} th,td{border:1px solid #d1d5db;padding:6px;text-align:right}
  @page{size:A4;margin:18mm}
</style></head><body>${parts.join("\n")}
<script>window.__KALAMAPP_PRINT_READY = true;</script></body></html>`;
};
var buildCsvBytes = (spec) => {
  const sheet = spec.sheets[0] || { columns: [], rows: [] };
  const escapeCell = (cell) => {
    const text = String(cell ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [];
  if (Array.isArray(sheet.columns) && sheet.columns.length) lines.push(sheet.columns.map(escapeCell).join(","));
  for (const row of Array.isArray(sheet.rows) ? sheet.rows : []) {
    lines.push((Array.isArray(row) ? row : []).map(escapeCell).join(","));
  }
  return new TextEncoder().encode("\uFEFF" + lines.join("\r\n"));
};
var buildDocxBytes = async (spec) => {
  const docx = await import("https://esm.sh/docx@8.5.0");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(spec.title))] })
  ];
  for (const block of spec.blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "heading") {
      const level = Number(block.level) || 2;
      const heading = level <= 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({ heading, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(block.text || ""))] }));
    } else if (block.type === "paragraph") {
      children.push(new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(block.text || ""))] }));
    } else if (block.type === "list" && Array.isArray(block.items)) {
      for (const item of block.items) {
        children.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String(item || ""))] }));
      }
    } else if (block.type === "table" && Array.isArray(block.columns)) {
      const headerRow = new TableRow({ children: block.columns.map((c) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text: String(c ?? ""), bold: true })] })] })) });
      const bodyRows = (Array.isArray(block.rows) ? block.rows : []).map((row) => new TableRow({ children: block.columns.map((_, idx) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(String((Array.isArray(row) ? row[idx] : "") ?? ""))] })] })) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));
    }
  }
  const document = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
};
var buildXlsxBytes = async (spec) => {
  const XLSX = await import("https://esm.sh/xlsx@0.18.5");
  const wb = XLSX.utils.book_new();
  const sheets = spec.sheets.length ? spec.sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  sheets.forEach((sheet, index) => {
    const aoa = [];
    if (Array.isArray(sheet.columns) && sheet.columns.length) aoa.push(sheet.columns);
    for (const row of Array.isArray(sheet.rows) ? sheet.rows : []) aoa.push(Array.isArray(row) ? row : [row]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, String(sheet.name || `Sheet${index + 1}`).slice(0, 31));
  });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out);
};
var renderPdfViaService = async (supabaseUrl, serviceRoleKey, html, title) => {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/render-pdf`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
    body: JSON.stringify({ documentHtml: html, title, filename: title }),
    signal: AbortSignal.timeout(LONG_MEDIA_PROVIDER_TIMEOUT_MS)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`\u062A\u0648\u0644\u06CC\u062F PDF \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F: ${detail.slice(0, 300)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};
var handleGenerateDocument = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const prompt = String(body?.prompt || body?.message || "").trim();
  if (!prompt) return json(400, { success: false, message: "\u0645\u062A\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0633\u0627\u062E\u062A \u0641\u0627\u06CC\u0644 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const requestedFormat = String(body?.format || body?.settings?.format || "docx").trim().toLowerCase();
  const format = DOCUMENT_FORMATS[requestedFormat] ? requestedFormat : "docx";
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "document_generation", { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "document_generation");
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `\u0633\u0627\u062E\u062A \u0641\u0627\u06CC\u0644: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: { context: pageContext.context, context_key: contextKey, input_kind: "document_prompt", capability: "document_generation", format }
  });
  const schemaHint = format === "xlsx" || format === "csv" ? '\u0628\u0631\u0627\u06CC \u0641\u0627\u06CC\u0644 \u0635\u0641\u062D\u0647\u200C\u06AF\u0633\u062A\u0631\u062F\u0647\u060C \u0622\u0631\u0627\u06CC\u0647\u200C\u06CC sheets \u0631\u0627 \u067E\u0631 \u06A9\u0646: [{"name":"...","columns":["..."],"rows":[["..."]]}].' : "\u0628\u0631\u0627\u06CC \u0633\u0646\u062F \u0645\u062A\u0646\u06CC\u060C \u0622\u0631\u0627\u06CC\u0647\u200C\u06CC blocks \u0631\u0627 \u067E\u0631 \u06A9\u0646: heading {type,text,level}\u060C paragraph {type,text}\u060C list {type,items[]}\u060C table {type,columns[],rows[[]]}.";
  const aiResult = await callChatCompletions(providerConfig, [
    { role: "system", content: `\u062A\u0648 \u06CC\u06A9 \u062A\u0648\u0644\u06CC\u062F\u06A9\u0646\u0646\u062F\u0647\u200C\u06CC \u0645\u062D\u062A\u0648\u0627\u06CC \u0633\u0627\u062E\u062A\u0627\u0631\u06CC\u0627\u0641\u062A\u0647 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0641\u0627\u06CC\u0644 \u0647\u0633\u062A\u06CC. \u0641\u0642\u0637 \u0648 \u0641\u0642\u0637 \u06CC\u06A9 JSON \u0645\u0639\u062A\u0628\u0631 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646 (\u0628\u062F\u0648\u0646 \u062A\u0648\u0636\u06CC\u062D\u060C \u0628\u062F\u0648\u0646 markdown). \u0633\u0627\u062E\u062A\u0627\u0631: {"title":"...","blocks":[...],"sheets":[...]}. ${schemaHint} \u0647\u0645\u0647\u200C\u06CC \u0645\u062A\u0646\u200C\u0647\u0627 \u0641\u0627\u0631\u0633\u06CC \u0648 \u0631\u0633\u0645\u06CC \u0628\u0627\u0634\u0646\u062F.` },
    { role: "user", content: prompt }
  ], { safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_document_generation`, maxTokens: 4e3 });
  let spec;
  try {
    const cleaned = String(aiResult.content || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    spec = normalizeDocumentSpec(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    spec = normalizeDocumentSpec({ title: prompt.slice(0, 80), blocks: [{ type: "paragraph", text: String(aiResult.content || "") }] });
  }
  let bytes;
  if (format === "docx") bytes = await buildDocxBytes(spec);
  else if (format === "xlsx") bytes = await buildXlsxBytes(spec);
  else if (format === "csv") bytes = buildCsvBytes(spec);
  else bytes = await renderPdfViaService(supabaseUrl, serviceRoleKey, buildDocumentHtml(spec), spec.title);
  const stored = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, bytes, DOCUMENT_FORMATS[format].mime, {
    prefix: "document",
    extension: DOCUMENT_FORMATS[format].ext
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: `\u0641\u0627\u06CC\u0644 ${format.toUpperCase()} \u0622\u0645\u0627\u062F\u0647 \u0634\u062F: ${spec.title}`,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: { capability: "document_generation", format, prompt, file: stored, usage: aiResult.usageMetadata }
  });
  const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, stored, {
    displayName: `${spec.title}.${DOCUMENT_FORMATS[format].ext}`,
    fileType: "file",
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    prompt
  }).catch((error) => {
    console.warn("Could not register generated document", error);
    return null;
  });
  const fileResult = {
    ...stored,
    asset_id: fileManagerResult?.asset?.id || null,
    entry_id: fileManagerResult?.entry?.id || null,
    folder_id: fileManagerResult?.folder?.id || null
  };
  if (assistantMessage?.id && fileManagerResult) {
    await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", { id: `eq.${assistantMessage.id}`, org_id: `eq.${authContext.orgId}` }, {
      metadata: { capability: "document_generation", format, prompt, file: fileResult, usage: aiResult.usageMetadata }
    }).catch(() => []);
  }
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: "document_generation",
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: "document_generation", format, storage_path: stored.path }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    answer: `\u0641\u0627\u06CC\u0644 ${format.toUpperCase()} \u0622\u0645\u0627\u062F\u0647 \u0634\u062F.`,
    file: fileResult,
    format,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger
  });
};
var handleGenerateVideo = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const prompt = String(body?.prompt || body?.message || "").trim();
  if (!prompt) return json(400, { success: false, message: "\u0645\u062A\u0646 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0648\u06CC\u062F\u06CC\u0648 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const rawContext = normalizeContext(body?.context || {});
  const contextKey = buildContextKey(rawContext);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "video_generation", { modelOverride: body?.modelOverride });
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "video_generation");
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
  const settings = body?.settings && typeof body.settings === "object" ? body.settings : {};
  const sources = Array.isArray(body?.sourceImages) ? body.sourceImages : Array.isArray(settings.sourceImages) ? settings.sourceImages : [];
  const firstSource = sources.map((src) => ({
    data: String(src?.data || src?.base64 || "").trim(),
    mimeType: String(src?.mimeType || src?.mime_type || "image/png").trim() || "image/png"
  })).find((src) => src.data) || null;
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `\u062A\u0648\u0644\u06CC\u062F \u0648\u06CC\u062F\u06CC\u0648: ${prompt}`.slice(0, 90),
    pageContext,
    contextKey,
    provider: providerConfig.provider,
    model: providerConfig.model,
    forceNew: body?.forceNewThread === true
  });
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: prompt,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: { context: pageContext.context, context_key: contextKey, input_kind: "video_prompt", capability: "video_generation" }
  });
  const created = await callVideoCreate({ ...providerConfig, orgId: authContext.orgId }, prompt, {
    seconds: settings.seconds || body?.seconds,
    size: settings.size || body?.size,
    inputReference: firstSource
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: "\u062F\u0631 \u062D\u0627\u0644 \u0633\u0627\u062E\u062A \u0648\u06CC\u062F\u06CC\u0648... (\u0645\u0645\u06A9\u0646 \u0627\u0633\u062A \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u0637\u0648\u0644 \u0628\u06A9\u0634\u062F)",
    provider: created.provider,
    model: created.model,
    metadata: {
      capability: "video_generation",
      status: "processing",
      video_id: created.videoId,
      prompt,
      seconds: created.seconds,
      avalai_request_id: created.requestId || null
    }
  });
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: { ...thread?.metadata || {}, last_activity_kind: "video_generation", last_message_preview: prompt.slice(0, 300) }
  }).catch(() => []);
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    videoId: created.videoId,
    status: created.status || "processing",
    progress: created.progress,
    provider: created.provider,
    model: created.model
  });
};
var handleGetVideoStatus = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const videoId = String(body?.videoId || body?.video_id || "").trim();
  const messageId = normalizeId(body?.messageId);
  if (!videoId) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0648\u06CC\u062F\u06CC\u0648 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "video_generation");
  const statusResult = await callVideoStatus({ ...providerConfig, orgId: authContext.orgId }, videoId);
  if (statusResult.status === "completed") {
    const rawContext = normalizeContext(body?.context || {});
    const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, rawContext);
    const content = await callVideoContent({ ...providerConfig, orgId: authContext.orgId }, videoId);
    const storedVideo = await uploadGeneratedBinaryAsset(supabaseUrl, serviceRoleKey, authContext, content.bytes, content.contentType, {
      prefix: "video",
      extension: "mp4"
    });
    const fileManagerResult = await registerAiGeneratedFileInFileManager(supabaseUrl, serviceRoleKey, authContext, pageContext, storedVideo, {
      displayName: `\u0648\u06CC\u062F\u06CC\u0648 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.mp4`,
      fileType: "video",
      threadId: normalizeId(body?.threadId),
      messageId,
      prompt: String(body?.prompt || "")
    }).catch((error) => {
      console.warn("Could not register generated video in file manager", error);
      return null;
    });
    const fileResult = {
      ...storedVideo,
      asset_id: fileManagerResult?.asset?.id || null,
      entry_id: fileManagerResult?.entry?.id || null,
      folder_id: fileManagerResult?.folder?.id || null
    };
    const usageMetadata = { provider: providerConfig.provider, model: providerConfig.model, capability: "video_generation", video_seconds: statusResult.seconds };
    const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
      threadId: normalizeId(body?.threadId),
      messageId,
      capability: "video_generation",
      provider: providerConfig.provider,
      model: providerConfig.model,
      usageMetadata,
      metadata: { source: "video_generation", video_id: videoId, storage_path: storedVideo.path }
    });
    if (messageId) {
      await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", { id: `eq.${messageId}`, org_id: `eq.${authContext.orgId}` }, {
        content: "\u0648\u06CC\u062F\u06CC\u0648 \u0622\u0645\u0627\u062F\u0647 \u0634\u062F.",
        metadata: { capability: "video_generation", status: "completed", video_id: videoId, file: fileResult, usage: withCustomerBilling(usageMetadata, ledger) }
      }).catch(() => []);
    }
    return json(200, { success: true, status: "completed", progress: 100, file: fileResult, usage: withCustomerBilling(usageMetadata, ledger), ledger });
  }
  if (statusResult.status === "failed") {
    if (messageId) {
      await restPatch(supabaseUrl, serviceRoleKey, "ai_messages", { id: `eq.${messageId}`, org_id: `eq.${authContext.orgId}` }, {
        content: "\u0633\u0627\u062E\u062A \u0648\u06CC\u062F\u06CC\u0648 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.",
        metadata: { capability: "video_generation", status: "failed", video_id: videoId }
      }).catch(() => []);
    }
    return json(200, { success: true, status: "failed", progress: statusResult.progress });
  }
  return json(200, { success: true, status: statusResult.status || "processing", progress: statusResult.progress });
};
var normalizeReplyDraftMessages = (items) => (Array.isArray(items) ? items : []).map((item, index) => {
  const text = String(item?.text || item?.content || "").trim();
  if (!text) return null;
  const direction = String(item?.direction || "").trim().toLowerCase();
  const role = direction === "outbound" || direction === "assistant" || direction === "agent" ? "agent" : direction === "inbound" || direction === "user" || direction === "customer" ? "customer" : "unknown";
  return {
    index: index + 1,
    role,
    direction: direction || null,
    author_name: String(item?.authorName || item?.author_name || "").trim() || null,
    created_at: String(item?.createdAt || item?.created_at || "").trim() || null,
    text: text.slice(0, 2400)
  };
}).filter(Boolean).slice(-18);
var getNumericTotal = (rows, keys) => (rows || []).reduce((sum, row) => {
  const next = keys.reduce((acc, key) => {
    if (acc !== null) return acc;
    const raw = row?.[key];
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw ?? NaN);
    return Number.isFinite(parsed) ? parsed : null;
  }, null);
  return sum + (next || 0);
}, 0);
var fetchPermittedSingleRecord = async (supabaseUrl, serviceRoleKey, authContext, moduleId, recordId) => {
  if (!moduleId || !recordId || !ALLOWED_MODULES.has(moduleId) || !isUuid(recordId)) return null;
  const perm = getModulePermission(authContext.permissions, moduleId);
  if (!canViewModule(perm)) return null;
  const recordScope = getRecordScope(perm);
  const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, moduleId, {
    id: `eq.${recordId}`,
    select: "*",
    limit: 1
  });
  const row = rows[0] || null;
  if (!row || !canAccessAssignedRecord(row, authContext, recordScope)) return null;
  return sanitizeRecord(row, perm);
};
var fetchPermittedRowsByAnyFilter = async (supabaseUrl, serviceRoleKey, authContext, moduleId, filters, limit = 8) => {
  for (const params of filters) {
    const rows = await fetchPermittedRows(supabaseUrl, serviceRoleKey, authContext, moduleId, params, limit);
    if (rows.length > 0) return rows;
  }
  return [];
};
var fetchCounterpartyBusinessContext = async (supabaseUrl, serviceRoleKey, authContext, counterparty) => {
  if (!counterparty?.moduleId || !counterparty?.recordId) {
    return {
      counterparty: null,
      invoices: [],
      projects: [],
      payments: [],
      financial_summary: null
    };
  }
  const counterpartyRecord = await fetchPermittedSingleRecord(
    supabaseUrl,
    serviceRoleKey,
    authContext,
    counterparty.moduleId,
    counterparty.recordId
  );
  if (!counterpartyRecord) {
    return {
      counterparty: null,
      invoices: [],
      projects: [],
      payments: [],
      financial_summary: null
    };
  }
  if (counterparty.moduleId === "customers") {
    const [invoices, projects2, payments2] = await Promise.all([
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "invoices", [
        { customer_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
      ], 10),
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "projects", [
        { customer_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
      ], 10),
      fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "cash_bank_operations", [
        { customer_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" },
        { related_customer: `eq.${counterparty.recordId}`, order: "updated_at.desc" },
        { counterparty_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
      ], 12)
    ]);
    const financialSummary2 = {
      invoice_count: invoices.length,
      project_count: projects2.length,
      payment_count: payments2.length,
      invoice_total_estimate: getNumericTotal(invoices, ["grand_total", "total_amount", "payable_total", "amount_total"]),
      payment_total_estimate: getNumericTotal(payments2, ["amount", "amount_total", "value", "debit", "credit"]),
      open_invoice_count: invoices.filter((row) => {
        const status = String(row?.status || "").trim().toLowerCase();
        return status && !["paid", "settled", "completed", "closed", "done"].includes(status);
      }).length
    };
    return {
      counterparty: counterpartyRecord,
      invoices,
      projects: projects2,
      payments: payments2,
      financial_summary: financialSummary2
    };
  }
  const [purchaseInvoices, projects, payments] = await Promise.all([
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "purchase_invoices", [
      { supplier_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "projects", [
      { supplier_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" },
      { contractor_supplier_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "cash_bank_operations", [
      { supplier_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" },
      { related_supplier: `eq.${counterparty.recordId}`, order: "updated_at.desc" },
      { counterparty_id: `eq.${counterparty.recordId}`, order: "updated_at.desc" }
    ], 12)
  ]);
  const financialSummary = {
    invoice_count: purchaseInvoices.length,
    project_count: projects.length,
    payment_count: payments.length,
    invoice_total_estimate: getNumericTotal(purchaseInvoices, ["grand_total", "total_amount", "payable_total", "amount_total"]),
    payment_total_estimate: getNumericTotal(payments, ["amount", "amount_total", "value", "debit", "credit"]),
    open_invoice_count: purchaseInvoices.filter((row) => {
      const status = String(row?.status || "").trim().toLowerCase();
      return status && !["paid", "settled", "completed", "closed", "done"].includes(status);
    }).length
  };
  return {
    counterparty: counterpartyRecord,
    invoices: purchaseInvoices,
    projects,
    payments,
    financial_summary: financialSummary
  };
};
var fetchReplyCrossModuleContext = async (supabaseUrl, serviceRoleKey, authContext) => {
  const [products, productBundles, priceLists, purchaseInvoices, recentCustomers, recentSuppliers] = await Promise.all([
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "products", [
      { order: "updated_at.desc" }
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "product_bundles", [
      { order: "updated_at.desc" }
    ], 10),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "price_lists", [
      { order: "updated_at.desc" }
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "purchase_invoices", [
      { order: "updated_at.desc" }
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "customers", [
      { order: "updated_at.desc" }
    ], 8),
    fetchPermittedRowsByAnyFilter(supabaseUrl, serviceRoleKey, authContext, "suppliers", [
      { order: "updated_at.desc" }
    ], 8)
  ]);
  const users = authContext?.orgId ? await safeRestSelect(supabaseUrl, serviceRoleKey, "profiles", {
    org_id: `eq.${authContext.orgId}`,
    select: "id,full_name,email,mobile_1,mobile,role_id,job_title,position,team,updated_at",
    order: "updated_at.desc",
    limit: 20
  }) : [];
  return {
    products,
    product_bundles: productBundles,
    price_lists: priceLists,
    purchase_invoices: purchaseInvoices,
    recent_customers: recentCustomers,
    recent_suppliers: recentSuppliers,
    users: (users || []).map((row) => ({
      id: row?.id || null,
      full_name: row?.full_name || null,
      email: row?.email || null,
      mobile: row?.mobile_1 || row?.mobile || null,
      role_id: row?.role_id || null,
      job_title: row?.job_title || null,
      position: row?.position || null,
      team: row?.team || null
    }))
  };
};
var handleSuggestReply = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const channel = String(body?.channel || "").trim().toLowerCase();
  if (channel !== "sms" && channel !== "bot") {
    return json(400, { success: false, message: "\u06A9\u0627\u0646\u0627\u0644 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u067E\u0627\u0633\u062E \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  }
  const rawContext = normalizeContext(body?.context || {});
  const contextForReply = rawContext.moduleId ? rawContext : {
    route: "/notifications",
    mode: "page",
    moduleId: null,
    recordId: null,
    visibleRecordIds: [],
    selectedRecordIds: []
  };
  const contextKey = buildContextKey(contextForReply);
  const [providerConfig, companyContext] = await Promise.all([
    resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "customer_reply_suggestion"),
    loadCompanyContext(supabaseUrl, serviceRoleKey, authContext)
  ]);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, providerConfig.orgAiSettings, "customer_reply_suggestion");
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: channel === "sms" ? "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u067E\u0627\u0633\u062E \u067E\u06CC\u0627\u0645\u06A9" : "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u067E\u0627\u0633\u062E \u0628\u0627\u062A",
    pageContext: { context: contextForReply, moduleId: contextForReply.moduleId || null, recordId: contextForReply.recordId || null, summary: "reply_suggestion" },
    contextKey: `reply:${channel}:${contextKey}`,
    provider: providerConfig.provider,
    model: providerConfig.model
  });
  let counterpartyModuleId = String(body?.counterparty?.moduleId || body?.counterpartyModuleId || contextForReply.moduleId || "").trim();
  let counterpartyRecordId = String(body?.counterparty?.recordId || body?.counterpartyRecordId || contextForReply.recordId || "").trim();
  if ((!counterpartyModuleId || !counterpartyRecordId) && channel === "bot") {
    const botGroupId = normalizeId(body?.botGroupId);
    if (isUuid(botGroupId)) {
      const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "counterparty_bot_groups", {
        id: `eq.${botGroupId}`,
        org_id: `eq.${authContext.orgId}`,
        select: "id,target_type,customer_id,supplier_id,channel_type,group_title,bot_chat_id,status",
        limit: 1
      });
      const group = rows[0] || null;
      if (group) {
        const type = String(group?.target_type || "").trim();
        if (type === "customers" && group?.customer_id) {
          counterpartyModuleId = "customers";
          counterpartyRecordId = String(group.customer_id);
        } else if (type === "suppliers" && group?.supplier_id) {
          counterpartyModuleId = "suppliers";
          counterpartyRecordId = String(group.supplier_id);
        }
      }
    }
  }
  const counterparty = (counterpartyModuleId === "customers" || counterpartyModuleId === "suppliers") && isUuid(counterpartyRecordId) ? { moduleId: counterpartyModuleId, recordId: counterpartyRecordId } : null;
  const incomingDraftMessages = normalizeReplyDraftMessages(body?.recentMessages || []);
  const fallbackQuery = incomingDraftMessages.map((item) => item.text).join(" ");
  const phoneHint = String(body?.phone || body?.phoneNumber || "").trim();
  let recentMessages = incomingDraftMessages;
  if (recentMessages.length === 0 && channel === "bot") {
    const botGroupId = normalizeId(body?.botGroupId);
    if (isUuid(botGroupId)) {
      const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "counterparty_bot_messages", {
        bot_group_id: `eq.${botGroupId}`,
        org_id: `eq.${authContext.orgId}`,
        select: "id,direction,content_text,payload,created_at",
        order: "created_at.desc",
        limit: 18
      });
      recentMessages = (rows || []).slice().reverse().map((row, index) => ({
        index: index + 1,
        role: String(row?.direction || "").trim() === "outbound" ? "agent" : "customer",
        direction: String(row?.direction || "").trim() || null,
        author_name: String(row?.payload?.sender_display_name || "").trim() || null,
        created_at: String(row?.created_at || "").trim() || null,
        text: String(row?.content_text || "").trim().slice(0, 2400)
      })).filter((item) => item.text);
    }
  }
  if (recentMessages.length === 0 && channel === "sms" && phoneHint) {
    const rows = await safeRestSelect(supabaseUrl, serviceRoleKey, "sms_delivery_reports", {
      org_id: `eq.${authContext.orgId}`,
      phone_number: `eq.${phoneHint}`,
      select: "id,direction,message_text,message_at,created_at,sender,recipient",
      order: "message_at.desc",
      limit: 18
    });
    recentMessages = (rows || []).slice().reverse().map((row, index) => ({
      index: index + 1,
      role: String(row?.direction || "").trim() === "outbound" ? "agent" : "customer",
      direction: String(row?.direction || "").trim() || null,
      author_name: String(row?.direction || "").trim() === "outbound" ? "\u06A9\u0627\u0631\u0628\u0631 \u0633\u0627\u0632\u0645\u0627\u0646" : String(row?.sender || "").trim() || null,
      created_at: String(row?.message_at || row?.created_at || "").trim() || null,
      text: String(row?.message_text || "").trim().slice(0, 2400)
    })).filter((item) => item.text);
  }
  const businessContext = await fetchCounterpartyBusinessContext(supabaseUrl, serviceRoleKey, authContext, counterparty);
  const knowledgeQuery = [
    fallbackQuery,
    String(body?.instruction || "").trim(),
    channel === "sms" ? "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u067E\u0627\u0633\u062E \u067E\u06CC\u0627\u0645\u06A9 \u0645\u0634\u062A\u0631\u06CC" : "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u067E\u0627\u0633\u062E \u06AF\u0641\u062A\u06AF\u0648\u06CC \u0628\u0627\u062A \u0645\u0634\u062A\u0631\u06CC"
  ].filter(Boolean).join("\n");
  const [knowledgeChunks, crossModuleContext] = await Promise.all([
    fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, knowledgeQuery),
    fetchReplyCrossModuleContext(supabaseUrl, serviceRoleKey, authContext)
  ]);
  const retrievedContexts = await fetchRelevantModuleContexts(
    supabaseUrl,
    serviceRoleKey,
    authContext,
    [knowledgeQuery, recentMessages.map((item) => item.text).join("\n")].filter(Boolean).join("\n"),
    { moduleId: counterparty?.moduleId || contextForReply.moduleId || null }
  );
  const userContext = buildUserPromptContext(authContext);
  const payload = {
    request: {
      channel,
      tone: String(body?.tone || "").trim() || "professional",
      instruction: String(body?.instruction || "").trim() || null
    },
    company: companyContext,
    requester: userContext,
    active_context: {
      module_id: contextForReply.moduleId || null,
      record_id: contextForReply.recordId || null,
      phone: phoneHint || null
    },
    counterparty: {
      module_id: counterparty?.moduleId || null,
      record_id: counterparty?.recordId || null,
      profile: businessContext.counterparty,
      financial_summary: businessContext.financial_summary,
      recent_invoices: businessContext.invoices.slice(0, 6),
      recent_projects: businessContext.projects.slice(0, 6),
      recent_payments: businessContext.payments.slice(0, 8)
    },
    cross_module_context: crossModuleContext,
    conversation: recentMessages.slice(-16),
    retrieved_contexts: retrievedContexts.slice(0, 4),
    ai_instructions: knowledgeChunks.filter(
      (chunk) => String(chunk?.metadata?.system_key || "").trim() === "ai_instructions" || String(chunk?.metadata?.document_type || "").trim() === "ai_instructions"
    ).slice(0, 2).map((chunk, index) => ({
      index: index + 1,
      id: chunk.id,
      title: chunk?.metadata?.document_title || null,
      content: String(chunk?.content || "").slice(0, 1100)
    })),
    organization_knowledge: knowledgeChunks.filter(
      (chunk) => String(chunk?.metadata?.system_key || "").trim() !== "ai_instructions" && String(chunk?.metadata?.document_type || "").trim() !== "ai_instructions"
    ).map((chunk, index) => ({
      index: index + 1,
      id: chunk.id,
      title: chunk?.metadata?.document_title || null,
      content: String(chunk?.content || "").slice(0, 1100)
    }))
  };
  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: "system",
      content: "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u067E\u0627\u0633\u062E\u200C\u062F\u0647\u06CC \u0633\u0627\u0632\u0645\u0627\u0646\u06CC KalamApp \u0647\u0633\u062A\u06CC\u062F. \u0641\u0642\u0637 \u0645\u062A\u0646 \xAB\u067E\u0627\u0633\u062E \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0642\u0627\u0628\u0644 \u0627\u0631\u0633\u0627\u0644 \u0628\u0631\u0627\u06CC \u0645\u0634\u062A\u0631\u06CC\xBB \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. \u0627\u0632 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627\u06CC \u0645\u06A9\u0627\u0644\u0645\u0647 \u0627\u062E\u06CC\u0631\u060C \u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u06A9\u0627\u0631\u0628\u0631\u060C \u0648\u0636\u0639\u06CC\u062A \u0645\u0634\u062A\u0631\u06CC/\u062A\u0627\u0645\u06CC\u0646\u200C\u06A9\u0646\u0646\u062F\u0647\u060C \u0633\u0648\u0627\u0628\u0642 \u0641\u0627\u06A9\u062A\u0648\u0631/\u067E\u0631\u0648\u0698\u0647/\u067E\u0631\u062F\u0627\u062E\u062A \u0645\u062C\u0627\u0632\u060C \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0644\u0627/\u062E\u062F\u0645\u062A\u060C \u0644\u06CC\u0633\u062A \u0642\u06CC\u0645\u062A\u060C \u067E\u06A9\u06CC\u062C\u200C\u0647\u0627\u060C \u0641\u0627\u06A9\u062A\u0648\u0631\u0647\u0627\u06CC \u062E\u0631\u06CC\u062F\u060C \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0645\u0634\u062A\u0631\u06CC\u0627\u0646/\u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0645\u062C\u0627\u0632 \u0648 \u0627\u0633\u0646\u0627\u062F/\u0642\u0648\u0627\u0646\u06CC\u0646 \u0633\u0627\u0632\u0645\u0627\u0646 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F. \u0627\u06AF\u0631 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0642\u0637\u0639\u06CC \u0646\u06CC\u0633\u062A\u060C \u0628\u0627 \u0639\u0628\u0627\u0631\u062A \u0645\u062D\u062A\u0627\u0637\u0627\u0646\u0647 \u0648 \u0628\u062F\u0648\u0646 \u0627\u062F\u0639\u0627\u06CC \u0642\u0637\u0639\u06CC \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. \u062E\u0631\u0648\u062C\u06CC \u0628\u0627\u06CC\u062F \u0641\u0627\u0631\u0633\u06CC\u060C \u062D\u0631\u0641\u0647\u200C\u0627\u06CC\u060C \u0631\u0648\u0634\u0646\u060C \u06A9\u0648\u062A\u0627\u0647 \u0648 \u0627\u062C\u0631\u0627\u06CC\u06CC \u0628\u0627\u0634\u062F. Markdown\u060C \u0639\u0646\u0648\u0627\u0646\u060C \u062A\u0648\u0636\u06CC\u062D \u0641\u0631\u0627\u06CC\u0646\u062F \u0648 \u0645\u062A\u0646 \u0627\u0636\u0627\u0641\u06CC \u0646\u0646\u0648\u06CC\u0633\u06CC\u062F."
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ], {
    temperature: 0.22,
    maxTokens: 460,
    safetyIdentifier: `org_${authContext.orgId}_user_${authContext.userId}_cap_customer_reply_suggestion`
  });
  const suggestedReply = String(aiResult.content || "").replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!suggestedReply) {
    throw new Error("\u067E\u0627\u0633\u062E \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0645\u0639\u062A\u0628\u0631 \u0627\u0632 AI \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F.");
  }
  const userMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: `reply_suggestion:${channel}`,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context_key: `reply:${channel}:${contextKey}`,
      source: "notifications_chat_reply_suggest",
      channel,
      counterparty_module_id: counterparty?.moduleId || null,
      counterparty_record_id: counterparty?.recordId || null,
      conversation_size: recentMessages.length,
      knowledge_chunk_ids: knowledgeChunks.map((chunk) => chunk.id)
    }
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      source: "reply_suggestion",
      channel,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      context_key: `reply:${channel}:${contextKey}`,
      counterparty_module_id: counterparty?.moduleId || null,
      counterparty_record_id: counterparty?.recordId || null,
      financial_summary: businessContext.financial_summary,
      related_modules: counterparty?.moduleId === "customers" ? ["invoices", "projects", "cash_bank_operations"] : counterparty?.moduleId === "suppliers" ? ["purchase_invoices", "projects", "cash_bank_operations"] : [],
      cross_module_context_sizes: {
        products: crossModuleContext.products.length,
        product_bundles: crossModuleContext.product_bundles.length,
        price_lists: crossModuleContext.price_lists.length,
        purchase_invoices: crossModuleContext.purchase_invoices.length,
        recent_customers: crossModuleContext.recent_customers.length,
        recent_suppliers: crossModuleContext.recent_suppliers.length,
        users: crossModuleContext.users.length
      },
      retrieved_context_modules: retrievedContexts.map((ctx) => ctx.moduleId)
    }
  });
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(contextForReply || {}),
    module_id: counterparty?.moduleId || contextForReply.moduleId || null,
    record_id: counterparty?.recordId || contextForReply.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      last_reply_suggestion_at: (/* @__PURE__ */ new Date()).toISOString(),
      reply_channel: channel,
      context_kind: counterparty ? "record" : getContextKind(contextForReply || {}),
      context_label: counterparty ? `\u067E\u0627\u0633\u062E ${channel === "sms" ? "\u067E\u06CC\u0627\u0645\u06A9" : "\u0628\u0627\u062A"} \u0628\u0631\u0627\u06CC ${counterparty.moduleId}` : buildThreadContextLabel({ context: contextForReply, moduleId: contextForReply.moduleId || null, recordId: contextForReply.recordId || null }),
      context: contextForReply,
      module_id: counterparty?.moduleId || contextForReply.moduleId || null,
      record_id: counterparty?.recordId || contextForReply.recordId || null,
      last_activity_kind: "reply_suggestion",
      last_message_preview: suggestedReply.slice(0, 300)
    }
  });
  const ledger = await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: "customer_reply_suggestion",
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: "reply_suggestion", channel, context_key: `reply:${channel}:${contextKey}` }
  });
  await patchAiMessageCustomerBilling(supabaseUrl, serviceRoleKey, authContext, assistantMessage, aiResult.usageMetadata, ledger);
  return json(200, {
    success: true,
    threadId: thread.id,
    userMessageId: userMessage?.id || null,
    messageId: assistantMessage?.id || null,
    suggestedReply,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: withCustomerBilling(aiResult.usageMetadata, ledger),
    ledger,
    context: {
      channel,
      counterpartyModuleId: counterparty?.moduleId || null,
      counterpartyRecordId: counterparty?.recordId || null,
      conversationMessages: recentMessages.length,
      retrievedContextModules: retrievedContexts.map((ctx) => ctx.moduleId),
      knowledgeSources: knowledgeChunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.document_id,
        title: chunk?.metadata?.document_title || null,
        chunkIndex: chunk.chunk_index
      }))
    }
  });
};
var parseModelsResponse = (parsed) => {
  const list = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : [];
  return list.map((item) => {
    if (typeof item === "string") return { id: item, label: item };
    const id = String(item?.id || item?.name || item?.model || "").trim();
    if (!id) return null;
    return {
      id,
      label: String(item?.display_name || item?.label || item?.name || id).trim(),
      raw: item
    };
  }).filter(Boolean);
};
var handleListModels = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u0645\u062F\u0644\u200C\u0647\u0627\u06CC AI \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const catalogRows = await safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
    is_active: "eq.true",
    select: "*",
    order: "id.asc",
    limit: 200
  });
  if (catalogRows.length > 0) {
    return json(200, {
      success: true,
      models: catalogRows.filter((row) => row?.is_coming_soon !== true).map((row) => ({
        id: row.id,
        label: row.display_name_fa || row.id,
        capability_tags: row.capability_tags || [],
        pricing: row
      })),
      raw: { source: "ai_model_catalog" }
    });
  }
  const providerConfig = getCentralProviderConfig();
  if (!providerConfig.apiKey) {
    return json(200, {
      success: true,
      models: [],
      warning: "\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A \u0648 catalog \u0645\u062F\u0644\u200C\u0647\u0627 \u0647\u0645 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A."
    });
  }
  const { response, baseUrl } = await requestAvalaiWithFallback(providerConfig, "/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" }
  });
  const raw = await response.text();
  const parsed = parseJsonSafe(raw);
  if (!response.ok) {
    return json(200, {
      success: true,
      models: [],
      warning: "Provider \u0644\u06CC\u0633\u062A \u0645\u062F\u0644\u200C\u0647\u0627 \u0631\u0627 \u0627\u0632 \u0645\u0633\u06CC\u0631 OpenAI-compatible /models \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646\u062F \u0648 catalog \u0645\u062F\u0644\u200C\u0647\u0627 \u0647\u0645 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A.",
      raw: parsed
    });
  }
  return json(200, {
    success: true,
    models: parseModelsResponse(parsed),
    raw: { ...parsed, baseUrl }
  });
};
var handleTestProvider = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u062A\u0635\u0627\u0644\u0627\u062A AI \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext, "dashboard_chat");
  const result = await callChatCompletions(providerConfig, [
    { role: "system", content: "\u0641\u0642\u0637 \u0639\u0628\u0627\u0631\u062A \xAB\u0627\u062A\u0635\u0627\u0644 \u0628\u0631\u0642\u0631\u0627\u0631 \u0627\u0633\u062A\xBB \u0631\u0627 \u0628\u0631\u06AF\u0631\u062F\u0627\u0646." },
    { role: "user", content: "\u062A\u0633\u062A \u0627\u062A\u0635\u0627\u0644" }
  ], { temperature: 0, maxTokens: 30, safetyIdentifier: `org_${authContext.orgId}_test_provider` });
  await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    capability: "dashboard_chat",
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    usageMetadata: result.usageMetadata,
    metadata: { source: "test_provider" }
  });
  return json(200, {
    success: true,
    message: result.content || "\u0627\u062A\u0635\u0627\u0644 \u0628\u0631\u0642\u0631\u0627\u0631 \u0627\u0633\u062A",
    provider: result.provider,
    model: result.model,
    usage: result.usageMetadata
  });
};
var normalizeCreditPayload = (payload) => {
  const flat = payload && typeof payload === "object" ? payload : { value: payload };
  const candidates = [
    flat.balance,
    flat.credit,
    flat.credits,
    flat.remaining,
    flat.remaining_credit,
    flat.total_available,
    flat?.data?.balance,
    flat?.data?.credit,
    flat?.data?.remaining
  ].filter((item) => item !== null && item !== void 0 && item !== "");
  return {
    value: candidates[0] ?? null,
    currency: flat.currency || flat?.data?.currency || flat.unit || null,
    rial: flat.rial || flat.rials || flat.amount_rial || flat?.data?.rial || flat?.data?.amount_rial || null,
    toman: flat.toman || flat.tomans || flat.amount_toman || flat?.data?.toman || flat?.data?.amount_toman || null,
    token: flat.token || flat.tokens || flat.remaining_tokens || flat?.data?.tokens || null,
    raw: payload
  };
};
var handleGetCredit = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u062A\u0635\u0627\u0644\u0627\u062A AI \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const providerCredit = await fetchAvalaiCredit(getCentralProviderConfig());
  return json(200, {
    success: true,
    ...providerCredit,
    credit: providerCredit.available ? normalizeCreditPayload(providerCredit.credit) : null
  });
};
var handleEmbedDocumentChunks = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canManageAiSettings(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0627\u0632\u0633\u0627\u0632\u06CC embedding \u0627\u0633\u0646\u0627\u062F \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const settings = await ensureOrgAiSettings(supabaseUrl, serviceRoleKey, authContext);
  await assertAiCapabilityEnabled(supabaseUrl, serviceRoleKey, authContext, settings, "embedding");
  const documentId = normalizeId(body?.documentId || body?.document_id);
  if (!isUuid(documentId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0633\u0646\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  const chunks = await restSelect(supabaseUrl, serviceRoleKey, "document_chunks", {
    org_id: `eq.${authContext.orgId}`,
    document_id: `eq.${documentId}`,
    status: "eq.active",
    select: "id,content,embedding_status",
    order: "chunk_index.asc",
    limit: 80
  });
  if (chunks.length === 0) {
    return json(200, { success: true, processed: 0, failed: 0, message: "\u0628\u062E\u0634\u06CC \u0628\u0631\u0627\u06CC embedding \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." });
  }
  const providerConfig = getCentralProviderConfig();
  const jobRows = await restInsert(supabaseUrl, serviceRoleKey, "ai_document_ingestion_jobs", [{
    org_id: authContext.orgId,
    document_id: documentId,
    status: "running",
    job_type: "embedding",
    created_by: authContext.userId
  }]).catch(() => []);
  const job = jobRows[0] || null;
  let processed = 0;
  let failed = 0;
  for (const chunk of chunks.slice(0, 40)) {
    const chunkId = normalizeId(chunk?.id);
    const content = String(chunk?.content || "").trim();
    if (!chunkId || !content) continue;
    try {
      const embeddingResult = await callEmbeddings(providerConfig, content.slice(0, 8e3), DEFAULT_EMBEDDING_MODEL);
      await restPatch(supabaseUrl, serviceRoleKey, "document_chunks", {
        id: `eq.${chunkId}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        embedding: `[${embeddingResult.embedding.join(",")}]`,
        embedding_model: DEFAULT_EMBEDDING_MODEL,
        embedding_dimension: 1536,
        embedding_status: "ready",
        embedding_updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        embedding_error: null
      });
      processed += 1;
      await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
        capability: "embedding",
        provider: providerConfig.provider,
        model: DEFAULT_EMBEDDING_MODEL,
        requestId: embeddingResult.requestId,
        usageMetadata: embeddingResult.usageMetadata,
        metadata: { source: "document_embedding", document_id: documentId, chunk_id: chunkId }
      });
    } catch (error) {
      failed += 1;
      await restPatch(supabaseUrl, serviceRoleKey, "document_chunks", {
        id: `eq.${chunkId}`,
        org_id: `eq.${authContext.orgId}`
      }, {
        embedding_status: "failed",
        embedding_error: String(error?.message || error).slice(0, 500),
        embedding_updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).catch(() => []);
    }
  }
  if (job?.id) {
    await restPatch(supabaseUrl, serviceRoleKey, "ai_document_ingestion_jobs", {
      id: `eq.${job.id}`,
      org_id: `eq.${authContext.orgId}`
    }, {
      status: failed > 0 && processed === 0 ? "failed" : "completed",
      processed_chunks: processed,
      failed_chunks: failed,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).catch(() => []);
  }
  return json(200, { success: true, processed, failed });
};
var handleProposeNote = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const userMessage = String(body?.message || "").trim() || "\u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0631\u06A9\u0648\u0631\u062F \u06CC\u06A9 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u06A9\u0648\u062A\u0627\u0647 \u0648 \u06A9\u0627\u0631\u0628\u0631\u062F\u06CC \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0628\u062F\u0647.";
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
    ...body?.context || {},
    mode: "record"
  });
  if (!pageContext.permitted || !pageContext.moduleId || !pageContext.recordId || pageContext.records.length === 0) {
    return json(403, { success: false, message: "\u0628\u0631\u0627\u06CC \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u0628\u0627\u06CC\u062F \u0631\u0648\u06CC \u06CC\u06A9 \u0631\u06A9\u0648\u0631\u062F \u0642\u0627\u0628\u0644 \u062F\u0633\u062A\u0631\u0633 \u0628\u0627\u0634\u06CC\u062F." });
  }
  const knowledgeChunks = await fetchKnowledgeChunks(supabaseUrl, serviceRoleKey, authContext, userMessage);
  const providerConfig = await resolveProviderConfig(supabaseUrl, serviceRoleKey, authContext);
  const thread = await ensureThread(supabaseUrl, serviceRoleKey, authContext, {
    threadId: body?.threadId || null,
    title: `\u06CC\u0627\u062F\u062F\u0627\u0634\u062A ${pageContext.moduleId}`,
    pageContext,
    provider: providerConfig.provider,
    model: providerConfig.model
  });
  const aiResult = await callChatCompletions(providerConfig, [
    {
      role: "system",
      content: "\u0634\u0645\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 KalamApp \u0647\u0633\u062A\u06CC\u062F. \u0628\u0631 \u0627\u0633\u0627\u0633 Context \u0645\u062C\u0627\u0632\u060C \u0641\u0642\u0637 \u0645\u062A\u0646 \u06CC\u06A9 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u0641\u0627\u0631\u0633\u06CC \u06A9\u0648\u062A\u0627\u0647\u060C \u0631\u0648\u0634\u0646 \u0648 \u0642\u0627\u0628\u0644 \u062B\u0628\u062A \u0631\u0648\u06CC \u0631\u06A9\u0648\u0631\u062F \u0628\u0633\u0627\u0632\u06CC\u062F. \u0647\u06CC\u0686 \u062A\u0648\u0636\u06CC\u062D \u0627\u0636\u0627\u0641\u0647\u060C \u0639\u0646\u0648\u0627\u0646\u060C \u0646\u0642\u0644 \u0642\u0648\u0644 \u06CC\u0627 markdown \u0646\u0646\u0648\u06CC\u0633\u06CC\u062F."
    },
    {
      role: "user",
      content: JSON.stringify({
        request: userMessage,
        context: {
          summary: pageContext.summary,
          moduleId: pageContext.moduleId,
          recordId: pageContext.recordId,
          record: pageContext.records[0]
        },
        knowledge: knowledgeChunks.map((chunk) => ({
          title: chunk?.metadata?.document_title || null,
          content: String(chunk?.content || "").slice(0, 900)
        }))
      })
    }
  ], { temperature: 0.25, maxTokens: 360 });
  const noteContent = String(aiResult.content || "").replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!noteContent) throw new Error("Provider \u0645\u062A\u0646 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u0645\u0639\u062A\u0628\u0631\u06CC \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646\u062F.");
  const userAiMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "user",
    content: userMessage,
    provider: providerConfig.provider,
    model: providerConfig.model,
    metadata: {
      context_key: buildContextKey(pageContext.context || {}),
      context_summary: pageContext.summary,
      input_kind: "propose_note",
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId
    }
  });
  const assistantMessage = await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
    thread_id: thread.id,
    role: "assistant",
    content: noteContent,
    provider: aiResult.provider,
    model: aiResult.model,
    metadata: {
      source: "propose_note",
      context_key: buildContextKey(pageContext.context || {}),
      context_summary: pageContext.summary,
      usage: aiResult.usageMetadata,
      avalai_request_id: aiResult.requestId || null,
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId
    }
  });
  const actionRows = await restInsert(supabaseUrl, serviceRoleKey, "ai_action_logs", [{
    org_id: authContext.orgId,
    thread_id: thread.id,
    action_type: "send_note",
    status: "proposed",
    module_id: pageContext.moduleId,
    record_id: pageContext.recordId,
    proposed_payload: {
      module_id: pageContext.moduleId,
      record_id: pageContext.recordId,
      content: noteContent,
      mention_user_ids: [authContext.userId],
      mention_role_ids: [],
      source_type: "ai",
      author_name: AI_AUTHOR_NAME,
      provider: aiResult.provider,
      model: aiResult.model
    },
    result: {},
    created_by: authContext.userId
  }]);
  const action = actionRows[0] || null;
  await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${thread.id}`, org_id: `eq.${authContext.orgId}` }, {
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    provider: aiResult.provider,
    model: aiResult.model,
    context_type: getContextKind(pageContext.context || {}),
    module_id: pageContext.moduleId || null,
    record_id: pageContext.recordId || null,
    metadata: {
      ...thread?.metadata || {},
      route: pageContext.context?.route || null,
      summary: pageContext.summary || null,
      context_kind: getContextKind(pageContext.context || {}),
      context_label: buildThreadContextLabel(pageContext),
      context: pageContext.context || null,
      module_id: pageContext.moduleId || null,
      record_id: pageContext.recordId || null,
      last_activity_kind: "propose_note",
      last_message_preview: noteContent.slice(0, 300),
      last_action_log_id: action?.id || null
    }
  });
  await recordAiUsageLedger(supabaseUrl, serviceRoleKey, authContext, {
    threadId: thread.id,
    messageId: assistantMessage?.id || null,
    requestId: aiResult.requestId,
    capability: "record_chat",
    provider: aiResult.provider,
    model: aiResult.model,
    usageMetadata: aiResult.usageMetadata,
    metadata: { source: "propose_note", action_log_id: action?.id || null, user_message_id: userAiMessage?.id || null }
  });
  return json(200, {
    success: true,
    threadId: thread.id,
    proposedAction: {
      id: action?.id || null,
      actionType: "send_note",
      moduleId: pageContext.moduleId,
      recordId: pageContext.recordId,
      content: noteContent,
      status: "proposed"
    }
  });
};
var handleSaasAi = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  if (!canViewSaasAdmin(authContext)) {
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u067E\u0646\u0644 \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0627\u0632\u0647 \u0633\u06CC\u0633\u062A\u0645 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A." });
  }
  const subAction = String(body?.sub || "").trim();
  if (subAction === "overview") {
    const [allUsage, models, providerCredit, orgRows] = await Promise.all([
      safeRestSelect(supabaseUrl, serviceRoleKey, "org_ai_usage_ledger", {
        select: "id,org_id,capability,model,provider,status,raw_cost_irt,billed_amount_irt,margin_percent,created_at",
        order: "created_at.desc",
        limit: 600
      }),
      safeRestSelect(supabaseUrl, serviceRoleKey, "ai_model_catalog", {
        select: "*",
        order: "id.asc",
        limit: 300
      }),
      fetchAvalaiCredit(getCentralProviderConfig()).catch(() => ({ available: false, message: "\u0627\u0639\u062A\u0628\u0627\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u0646\u0634\u062F." })),
      safeRestSelect(supabaseUrl, serviceRoleKey, "organizations", {
        select: "id,name,slug",
        limit: 2e3
      })
    ]);
    const orgNameById = new Map((orgRows || []).map((row) => [
      normalizeId(row?.id),
      String(row?.name || row?.slug || "").trim() || "\u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u062F\u0648\u0646 \u0646\u0627\u0645"
    ]));
    const byOrg = /* @__PURE__ */ new Map();
    for (const row of allUsage) {
      const orgId = normalizeId(row.org_id);
      if (!orgId) continue;
      const entry = byOrg.get(orgId) || { org_id: orgId, org_name: orgNameById.get(orgId) || "\u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u062F\u0648\u0646 \u0646\u0627\u0645", requests: 0, billed_irt: 0, raw_irt: 0, models: /* @__PURE__ */ new Set() };
      entry.requests++;
      entry.billed_irt += numberFrom(row.billed_amount_irt, 0);
      entry.raw_irt += numberFrom(row.raw_cost_irt, 0);
      if (row.model) entry.models.add(String(row.model));
      byOrg.set(orgId, entry);
    }
    const orgSummaries = Array.from(byOrg.values()).map((item) => ({
      ...item,
      models: Array.from(item.models)
    })).sort((a, b) => b.billed_irt - a.billed_irt);
    const finalized = allUsage.filter((row) => String(row.status) === "finalized");
    const totals = finalized.reduce(
      (acc, row) => {
        acc.billed_irt += numberFrom(row.billed_amount_irt, 0);
        acc.raw_irt += numberFrom(row.raw_cost_irt, 0);
        acc.requests++;
        const model = String(row.model || "unknown");
        acc.by_model[model] = (acc.by_model[model] || 0) + numberFrom(row.billed_amount_irt, 0);
        const cap = String(row.capability || "unknown");
        acc.by_capability[cap] = (acc.by_capability[cap] || 0) + numberFrom(row.billed_amount_irt, 0);
        return acc;
      },
      { billed_irt: 0, raw_irt: 0, requests: 0, by_model: {}, by_capability: {} }
    );
    return json(200, {
      success: true,
      models,
      allUsage: allUsage.slice(0, 200).map((row) => ({
        ...row,
        org_name: orgNameById.get(normalizeId(row?.org_id)) || "\u0633\u0627\u0632\u0645\u0627\u0646 \u0628\u062F\u0648\u0646 \u0646\u0627\u0645"
      })),
      orgSummaries,
      totals,
      providerCredit: {
        ...providerCredit,
        credit: providerCredit.available ? normalizeCreditPayload(providerCredit.credit) : null
      }
    });
  }
  if (subAction === "sync_models") {
    const providerConfig = getCentralProviderConfig();
    if (!providerConfig.apiKey) {
      return json(200, { success: true, models: [], warning: "\u06A9\u0644\u06CC\u062F \u0645\u0631\u06A9\u0632\u06CC AI \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
    }
    const { response } = await requestAvalaiWithFallback(providerConfig, "/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" }
    });
    const raw = await response.text();
    const parsed = parseJsonSafe(raw);
    if (!response.ok) {
      return json(200, { success: false, models: [], message: "\u062F\u0631\u06CC\u0627\u0641\u062A \u0644\u06CC\u0633\u062A \u0645\u062F\u0644\u200C\u0647\u0627 \u0627\u0632 AvalAI \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.", raw: parsed });
    }
    return json(200, { success: true, models: parseModelsResponse(parsed), raw: parsed });
  }
  if (subAction === "upsert_model") {
    const row = body?.model || {};
    const modelId = String(row?.id || "").trim();
    if (!modelId) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0645\u062F\u0644 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
    const rows = await restUpsert(supabaseUrl, serviceRoleKey, "ai_model_catalog", [{
      id: modelId,
      provider: String(row.provider || "avalai").trim(),
      display_name_fa: String(row.display_name_fa || modelId).trim(),
      capability_tags: Array.isArray(row.capability_tags) ? row.capability_tags : [],
      input_usd_per_1m: numberFrom(row.input_usd_per_1m, 0),
      cached_input_usd_per_1m: row.cached_input_usd_per_1m !== void 0 ? numberFrom(row.cached_input_usd_per_1m, 0) : null,
      output_usd_per_1m: numberFrom(row.output_usd_per_1m, 0),
      specific_cost_usd: row.specific_cost_usd !== void 0 ? numberFrom(row.specific_cost_usd, 0) : null,
      specific_cost_unit: row.specific_cost_unit ? String(row.specific_cost_unit) : null,
      margin_percent: numberFrom(row.margin_percent, 30),
      exchange_rate_irt: numberFrom(row.exchange_rate_irt, DEFAULT_AI_EXCHANGE_RATE_IRT),
      is_active: row.is_active !== false,
      is_coming_soon: row.is_coming_soon === true,
      pricing_source: String(row.pricing_source || "manual").trim(),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }], "id");
    return json(200, { success: true, model: rows[0] || null });
  }
  if (subAction === "toggle_model") {
    const modelId = String(body?.modelId || "").trim();
    const isActive = body?.is_active !== false;
    if (!modelId) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0645\u062F\u0644 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
    await restPatch(supabaseUrl, serviceRoleKey, "ai_model_catalog", { id: `eq.${modelId}` }, {
      is_active: isActive,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return json(200, { success: true, modelId, is_active: isActive });
  }
  return json(400, { success: false, message: "\u0639\u0645\u0644\u06CC\u0627\u062A SaaS AI \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F." });
};
var handleConfirmAction = async (supabaseUrl, serviceRoleKey, authContext, body) => {
  const actionLogId = normalizeId(body?.actionLogId);
  if (!isUuid(actionLogId)) return json(400, { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0627\u0642\u062F\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  const rows = await restSelect(supabaseUrl, serviceRoleKey, "ai_action_logs", {
    id: `eq.${actionLogId}`,
    org_id: `eq.${authContext.orgId}`,
    created_by: `eq.${authContext.userId}`,
    select: "*",
    limit: 1
  });
  const action = rows[0] || null;
  if (!action) return json(404, { success: false, message: "\u0627\u0642\u062F\u0627\u0645 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." });
  if (String(action.status) !== "proposed") {
    return json(409, { success: false, message: "\u0627\u06CC\u0646 \u0627\u0642\u062F\u0627\u0645 \u0642\u0628\u0644\u0627 \u067E\u0631\u062F\u0627\u0632\u0634 \u0634\u062F\u0647 \u0627\u0633\u062A.", status: action.status });
  }
  if (String(action.action_type) === "create_record_from_prompt") {
    const proposed2 = action.proposed_payload || {};
    const targetModuleId = String(proposed2.target_module_id || "").trim();
    if (!targetModuleId || !ALLOWED_MODULES.has(targetModuleId)) {
      await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
        status: "failed",
        result_payload: { error: "invalid_target_module" }
      });
      return json(400, { success: false, message: "\u0645\u0627\u0698\u0648\u0644 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
    }
    const targetPerm = getModulePermission(authContext.permissions, targetModuleId);
    if (!canCreateModule(targetPerm)) {
      await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
        status: "failed",
        result_payload: { error: "create_access_denied" }
      });
      return json(403, { success: false, message: "\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u062F\u0631 \u0627\u06CC\u0646 \u0645\u0627\u0698\u0648\u0644 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
    }
    const schema = proposed2.record_creation_schema && typeof proposed2.record_creation_schema === "object" ? proposed2.record_creation_schema : { fields: [] };
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    if (fields.length === 0) return json(400, { success: false, message: "\u0641\u06CC\u0644\u062F\u0647\u0627\u06CC \u0645\u062C\u0627\u0632 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0645\u0634\u062E\u0635 \u0646\u06CC\u0633\u062A." });
    const targetTable = getModuleTable(targetModuleId);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetTable)) {
      return json(400, { success: false, message: "\u062C\u062F\u0648\u0644 \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
    }
    const moduleId2 = normalizeId(proposed2.module_id || action.module_id);
    const recordId2 = normalizeId(proposed2.record_id || action.record_id);
    if (moduleId2 && recordId2) {
      const pageContext2 = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
        ...proposed2.context || {},
        mode: "record",
        moduleId: moduleId2,
        recordId: recordId2
      });
      if (!pageContext2.permitted) {
        await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
          status: "failed",
          result_payload: { error: "access_denied_on_confirm" }
        });
        return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0634\u0645\u0627 \u0628\u0647 \u0631\u06A9\u0648\u0631\u062F \u0645\u0631\u062A\u0628\u0637 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u062A\u0627\u06CC\u06CC\u062F \u0646\u0634\u062F." });
      }
    }
    const payload = sanitizeAiRecordPayload({ fields: proposed2.payload || {} }, schema);
    if (Object.keys(payload).length === 0) return json(400, { success: false, message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F." });
    const rows2 = await restInsert(supabaseUrl, serviceRoleKey, targetTable, [{
      org_id: authContext.orgId,
      ...payload
    }]);
    const created = rows2[0] || null;
    const moduleLabel = String(proposed2.module_label || schema?.moduleLabel || targetModuleId).trim() || targetModuleId;
    const createdRecords = created ? [{
      module_id: targetModuleId,
      table: targetTable,
      id: created.id || null,
      title: buildAiRecordTitle(created, moduleLabel)
    }] : [];
    await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
      status: created ? "executed" : "skipped",
      confirmed_by: authContext.userId,
      executed_at: (/* @__PURE__ */ new Date()).toISOString(),
      result_payload: { created_records: createdRecords },
      result: { created_records: createdRecords }
    });
    if (action.thread_id) {
      await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
        thread_id: action.thread_id,
        role: "assistant",
        content: created ? `${moduleLabel} \u062A\u0627\u06CC\u06CC\u062F \u0648 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.` : "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0641\u06CC \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0631\u06A9\u0648\u0631\u062F \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.",
        provider: getEnvProviderConfig().provider,
        model: getEnvProviderConfig().model,
        metadata: {
          source: "confirm_create_record",
          action_log_id: actionLogId,
          created_records: createdRecords
        }
      }).catch(() => null);
      const threadRows = await restSelect(supabaseUrl, serviceRoleKey, "ai_threads", {
        id: `eq.${action.thread_id}`,
        org_id: `eq.${authContext.orgId}`,
        select: "id,metadata",
        limit: 1
      }).catch(() => []);
      const existingThread = threadRows[0] || {};
      await restPatch(supabaseUrl, serviceRoleKey, "ai_threads", { id: `eq.${action.thread_id}`, org_id: `eq.${authContext.orgId}` }, {
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        module_id: moduleId2 || targetModuleId,
        record_id: recordId2 || created?.id || null,
        metadata: {
          ...existingThread?.metadata && typeof existingThread.metadata === "object" ? existingThread.metadata : {},
          last_activity_kind: "create_record_confirmed",
          last_created_records: createdRecords,
          last_action_log_id: actionLogId
        }
      }).catch(() => []);
    }
    return json(200, { success: true, actionLogId, threadId: action.thread_id || null, createdRecords });
  }
  if (String(action.action_type) === "process_operation_from_prompt") {
    const proposed2 = action.proposed_payload || {};
    const moduleId2 = normalizeId(proposed2.module_id || action.module_id);
    const recordId2 = normalizeId(proposed2.record_id || action.record_id);
    const pageContext2 = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
      ...proposed2.context || {},
      mode: "record",
      moduleId: moduleId2,
      recordId: recordId2
    });
    if (!pageContext2.permitted || !pageContext2.moduleId || !pageContext2.recordId) {
      await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
        status: "failed",
        result_payload: { error: "access_denied_on_confirm" }
      });
      return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0634\u0645\u0627 \u0628\u0647 \u0631\u06A9\u0648\u0631\u062F \u0645\u0642\u0635\u062F \u0628\u0631\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC \u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u062A\u0627\u06CC\u06CC\u062F \u0646\u0634\u062F." });
    }
    const operations = Array.isArray(proposed2.operations) ? proposed2.operations : [];
    if (operations.length === 0) return json(400, { success: false, message: "\u0627\u0642\u062F\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0642\u0627\u0628\u0644 \u0627\u062C\u0631\u0627 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F." });
    const [processContext, orgPeopleContext] = await Promise.all([
      loadAiProcessContext(supabaseUrl, serviceRoleKey, authContext, pageContext2),
      loadOrgPeopleContext(supabaseUrl, serviceRoleKey, authContext, String(proposed2.prompt || ""))
    ]);
    const executed = [];
    for (const operation of operations.slice(0, 8)) {
      executed.push(await executeAiProcessOperation(supabaseUrl, serviceRoleKey, authContext, pageContext2, operation, processContext, orgPeopleContext));
    }
    await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
      status: "executed",
      confirmed_by: authContext.userId,
      executed_at: (/* @__PURE__ */ new Date()).toISOString(),
      result_payload: { operations: executed },
      result: { operations: executed }
    });
    if (action.thread_id) {
      await insertAiMessage(supabaseUrl, serviceRoleKey, authContext, {
        thread_id: action.thread_id,
        role: "assistant",
        content: "\u0627\u0642\u062F\u0627\u0645\u200C\u0647\u0627\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u062A\u0627\u06CC\u06CC\u062F \u0648 \u0627\u062C\u0631\u0627 \u0634\u062F.",
        provider: getEnvProviderConfig().provider,
        model: getEnvProviderConfig().model,
        metadata: {
          source: "confirm_process_operation",
          action_log_id: actionLogId,
          operations: executed
        }
      }).catch(() => null);
    }
    return json(200, { success: true, actionLogId, operations: executed });
  }
  if (String(action.action_type) !== "send_note") {
    return json(400, { success: false, message: "\u0627\u06CC\u0646 \u0646\u0648\u0639 \u0627\u0642\u062F\u0627\u0645 \u062F\u0631 v1 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F." });
  }
  const proposed = action.proposed_payload || {};
  const moduleId = normalizeId(proposed.module_id || action.module_id);
  const recordId = normalizeId(proposed.record_id || action.record_id);
  const pageContext = await buildPermittedPageContext(supabaseUrl, serviceRoleKey, authContext, {
    mode: "record",
    moduleId,
    recordId
  });
  if (!pageContext.permitted) {
    await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
      status: "failed",
      result: { error: "access_denied_on_confirm" }
    });
    return json(403, { success: false, message: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0634\u0645\u0627 \u0628\u0647 \u0627\u06CC\u0646 \u0631\u06A9\u0648\u0631\u062F \u0628\u0631\u0627\u06CC \u062B\u0628\u062A \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u062A\u0627\u06CC\u06CC\u062F \u0646\u0634\u062F." });
  }
  const content = String(proposed.content || "").trim();
  if (!content) return json(400, { success: false, message: "\u0645\u062A\u0646 \u06CC\u0627\u062F\u062F\u0627\u0634\u062A \u062E\u0627\u0644\u06CC \u0627\u0633\u062A." });
  const noteRows = await restInsert(supabaseUrl, serviceRoleKey, "notes", [{
    org_id: authContext.orgId,
    module_id: moduleId,
    record_id: recordId,
    content,
    mention_user_ids: Array.isArray(proposed.mention_user_ids) && proposed.mention_user_ids.length ? proposed.mention_user_ids : [authContext.userId],
    mention_role_ids: Array.isArray(proposed.mention_role_ids) ? proposed.mention_role_ids : [],
    reply_to: null,
    author_id: null,
    author_name: AI_AUTHOR_NAME,
    source_type: "ai",
    metadata: {
      action_log_id: actionLogId,
      confirmed_by: authContext.userId,
      provider: proposed.provider || getEnvProviderConfig().provider,
      model: proposed.model || getEnvProviderConfig().model
    }
  }]);
  const note = noteRows[0] || null;
  await restPatch(supabaseUrl, serviceRoleKey, "ai_action_logs", { id: `eq.${actionLogId}` }, {
    status: "executed",
    confirmed_by: authContext.userId,
    executed_at: (/* @__PURE__ */ new Date()).toISOString(),
    result: { note_id: note?.id || null }
  });
  return json(200, { success: true, note, actionLogId });
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return json(405, { success: false, build: FUNCTION_BUILD, message: "\u0631\u0648\u0634 \u0627\u0631\u0633\u0627\u0644 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0639\u0645\u0644\u06CC\u0627\u062A \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0627\u06CC\u062F \u0628\u0627 POST \u0627\u0631\u0633\u0627\u0644 \u0634\u0648\u062F." });
  }
  if (req.method !== "POST") {
    return json(405, { success: false, message: "\u0631\u0648\u0634 \u0627\u0631\u0633\u0627\u0644 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A." });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { success: false, message: "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u06A9\u0627\u0645\u0644 \u0646\u06CC\u0633\u062A. \u0645\u062A\u063A\u06CC\u0631\u0647\u0627\u06CC Supabase Function \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F." });
    }
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { success: false, message: "\u0646\u0634\u0633\u062A \u0634\u0645\u0627 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0634\u0648\u06CC\u062F." });
    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, token);
    const authContext = await loadUserContext(supabaseUrl, serviceRoleKey, user);
    const body = await readJsonBody(req);
    const action = String(body?.action || "chat");
    if (action === "get_ai_settings") return await handleGetAiSettings(supabaseUrl, serviceRoleKey, authContext);
    if (action === "save_ai_settings") return await handleSaveAiSettings(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "get_ai_overview") return await handleGetAiOverview(supabaseUrl, serviceRoleKey, authContext);
    if (action === "get_compose_models") return await handleGetComposeModels(supabaseUrl, serviceRoleKey, authContext);
    if (action === "test_provider") return await handleTestProvider(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "list_models") return await handleListModels(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "get_credit") return await handleGetCredit(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "list_threads") return await handleListThreads(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "rename_thread") return await handleRenameThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "archive_thread") return await handleArchiveThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "share_thread") return await handleShareThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "transcribe_voice") return await handleTranscribeVoice(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "generate_voice_output") return await handleGenerateVoiceOutput(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "generate_image") return await handleGenerateImage(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "get_image_status") return await handleGetImageStatus(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "generate_video") return await handleGenerateVideo(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "get_video_status") return await handleGetVideoStatus(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "generate_document") return await handleGenerateDocument(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "embed_document_chunks") return await handleEmbedDocumentChunks(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "get_thread") return await handleGetThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "delete_thread") return await handleDeleteThread(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "create_record_from_prompt" || action === "update_record_from_prompt") {
      return await handleRecordMutationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
    }
    if (action === "process_operation_from_prompt") return await handleProcessOperationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "workflow_ai_prompt") {
      const outputMode = String(body?.outputMode || body?.output_mode || "").trim();
      if (outputMode === "create_record" || outputMode === "update_record") {
        return await handleRecordMutationFromPrompt(supabaseUrl, serviceRoleKey, authContext, body);
      }
      if (outputMode === "process_operation") return await handleProcessOperationFromPrompt(supabaseUrl, serviceRoleKey, authContext, { ...body, autoExecute: true });
      return await handleChat(supabaseUrl, serviceRoleKey, authContext, { ...body, action: "chat", capability: "workflow_ai_prompt", forceNewThread: body?.forceNewThread !== false });
    }
    if (action === "chat") return await handleChat(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "chat_with_file" || action === "analyze_file" || action === "upload_file" || action === "send_file") {
      return await handleChatWithFile(supabaseUrl, serviceRoleKey, authContext, body);
    }
    if (action === "suggest_reply") return await handleSuggestReply(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "propose_note") return await handleProposeNote(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "confirm_action") return await handleConfirmAction(supabaseUrl, serviceRoleKey, authContext, body);
    if (action === "saas_ai") return await handleSaasAi(supabaseUrl, serviceRoleKey, authContext, body);
    return json(400, { success: false, message: "\u0627\u0642\u062F\u0627\u0645 \u062F\u0631\u062E\u0648\u0627\u0633\u062A\u06CC \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F." });
  } catch (error) {
    const message = shortenProviderError(String(error?.message || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647"));
    const status = message === "Unauthorized" ? 401 : 500;
    console.error("ai-assistant failed", error);
    return json(status, { success: false, message });
  }
});
