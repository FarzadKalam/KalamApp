import { FieldLocation, FieldNature, FieldType, ModuleDefinition } from './types';
import { productsConfig } from './modules/productsConfig';
import { billboardConfig } from './modules/billboardsConfig';
import { productBundlesConfig } from './modules/productBundlesConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';
import { customerModule } from './modules/customerConfig';
import { supplierModule } from './modules/supplierConfig';
import { tasksModule } from './modules/tasksConfig';
import { invoicesConfig } from './modules/invoicesConfig';
import { purchaseInvoicesConfig } from './modules/purchaseInvoicesConfig';
import { salesReturnInvoicesConfig } from './modules/salesReturnInvoicesConfig';
import { purchaseReturnInvoicesConfig } from './modules/purchaseReturnInvoicesConfig';
import { warehousesConfig } from './modules/warehousesConfig';
import { shelvesConfig } from './modules/shelvesConfig';
import { stockTransfersConfig } from './modules/stockTransfersConfig';
import { secretariatDocumentsConfig } from './modules/secretariatDocumentsConfig';
import { deliveryFormsConfig } from './modules/deliveryFormsConfig';
import { calculationFormulasModule } from './modules/calculationFormulasConfig';
import { productionGroupOrdersModule } from './modules/productionGroupOrdersConfig';
import { projectsModule } from './modules/projectsConfig';
import { marketingLeadsModule } from './modules/marketingLeadsConfig';
import { personasModule } from './modules/personasConfig';
import { processTemplatesModule } from './modules/processTemplatesConfig';
import { processRunsModule } from './modules/processRunsConfig';
import { instructionsModule } from './modules/instructionsConfig';
import { fiscalYearsConfig } from './modules/fiscalYearsConfig';
import { chartOfAccountsConfig } from './modules/chartOfAccountsConfig';
import { journalEntriesConfig } from './modules/journalEntriesConfig';
import { accountingEventRulesConfig } from './modules/accountingEventRulesConfig';
import { costCentersConfig } from './modules/costCentersConfig';
import { cashBoxesConfig } from './modules/cashBoxesConfig';
import { bankAccountsConfig } from './modules/bankAccountsConfig';
import { pettyFundsConfig } from './modules/pettyFundsConfig';
import { chequesConfig } from './modules/chequesConfig';
import { cashBankOperationsConfig } from './modules/cashBankOperationsConfig';
import { bartersConfig } from './modules/bartersConfig';
import { employeesModule } from './modules/employeesConfig';
import { jobDescriptionsModule } from './modules/jobDescriptionsConfig';
import { attendanceLogsModule } from './modules/attendanceLogsConfig';
import { workSchedulesModule } from './modules/workSchedulesConfig';
import { leaveRequestsModule } from './modules/leaveRequestsConfig';
import { overtimeRequestsModule } from './modules/overtimeRequestsConfig';
import { missionRequestsModule } from './modules/missionRequestsConfig';
import { profilesModule } from './modules/profilesConfig';
import { priceListsConfig } from './modules/priceListsConfig';
import { webFormsConfig } from './modules/webFormsConfig';
import { automationExecutionReportsConfig } from './modules/automationExecutionReportsConfig';
import { smsDeliveryReportsConfig } from './modules/smsDeliveryReportsConfig';
import { voipCallReportsConfig } from './modules/voipCallReportsConfig';
import { counterpartyBotGroupsConfig } from './modules/counterpartyBotGroupsConfig';
import { expenseDocumentsConfig } from './modules/expenseDocumentsConfig';
import { employeeAdvancesConfig } from './modules/employeeAdvancesConfig';
import { employeeBonusRequestsModule } from './modules/employeeBonusRequestsConfig';
import { payrollSlipsConfig } from './modules/payrollSlipsConfig';
import { employeeContractsConfig } from './modules/employeeContractsConfig';
import { employeePenaltyRequestsModule } from './modules/employeePenaltyRequestsConfig';
import { recruitmentApplicantsConfig } from './modules/recruitmentApplicantsConfig';
import { surveysModule } from './modules/surveysConfig';
import { saasOrgsConfig } from './modules/saasOrgsConfig';
import { saasDemoRequestsConfig } from './modules/saasDemoRequestsConfig';
import { saasUsersConfig } from './modules/saasUsersConfig';
import { saasUserAnnouncementsConfig } from './modules/saasUserAnnouncementsConfig';
import { CMS_MODULES } from './utils/cmsModules';
import { withProcessModuleSupport } from './utils/processModuleSupport';
import { supportsGlobalAssignee } from './utils/assigneeSupport';
import { getAssigneeLabel } from './utils/assigneeLabel';

const TAGS_FIELD_KEY = 'tags';

const resolveTagsOrder = (module: ModuleDefinition) => {
  const headerFields = (module.fields || [])
    .filter((field) => field.key !== TAGS_FIELD_KEY)
    .filter((field) => field.location === FieldLocation.HEADER)
    .filter((field) => field.type !== FieldType.IMAGE);
  const anchorField = headerFields.find((field) => field.isKey)
    || headerFields.find((field) => field.isTableColumn)
    || headerFields[0];
  const anchorOrder = Number(anchorField?.order);
  return Number.isFinite(anchorOrder) ? anchorOrder + 0.05 : 1.05;
};

const withStandardTagsField = (module: ModuleDefinition): ModuleDefinition => {
  const fields = module.fields || [];
  const tagsOrder = resolveTagsOrder(module);
  const existingTagsField = fields.find((field) => field.key === TAGS_FIELD_KEY);
  const normalizedTagsField = {
    ...(existingTagsField || {}),
    key: TAGS_FIELD_KEY,
    labels: {
      fa: existingTagsField?.labels?.fa || 'برچسب‌ها',
      en: existingTagsField?.labels?.en || 'Tags',
    },
    type: FieldType.TAGS,
    location: FieldLocation.HEADER,
    order: tagsOrder,
    nature: FieldNature.STANDARD,
    isTableColumn: true,
  };

  return {
    ...module,
    fields: existingTagsField
      ? fields.map((field) => (field.key === TAGS_FIELD_KEY ? normalizedTagsField : field))
      : [...fields, normalizedTagsField],
  };
};

const resolveAssigneeOrder = (module: ModuleDefinition) => {
  const headerFields = (module.fields || [])
    .filter((field) => field.key !== 'assignee_id')
    .filter((field) => field.key !== TAGS_FIELD_KEY)
    .filter((field) => field.location === FieldLocation.HEADER)
    .filter((field) => field.type !== FieldType.IMAGE);
  const statusField = headerFields.find((field) => String(field.key || '').trim() === 'status');
  const anchorField = statusField
    || headerFields.reduce<typeof headerFields[number] | null>((latest, field) => {
      const currentOrder = Number(field?.order);
      const latestOrder = Number(latest?.order);
      if (!Number.isFinite(currentOrder)) return latest;
      if (!latest || !Number.isFinite(latestOrder) || currentOrder > latestOrder) return field;
      return latest;
    }, null);
  const anchorOrder = Number(anchorField?.order);
  return Number.isFinite(anchorOrder) ? anchorOrder + 0.05 : 1.1;
};

const withStandardAssigneeField = (module: ModuleDefinition): ModuleDefinition => {
  const moduleId = String(module.id || module.table || '').trim();
  if (!supportsGlobalAssignee(moduleId)) return module;

  const fields = module.fields || [];
  const existingAssigneeField = fields.find((field) => String(field?.key || '').trim() === 'assignee_id');
  const assigneeField = {
    ...(existingAssigneeField || {}),
    key: 'assignee_id',
    labels: {
      fa: getAssigneeLabel(moduleId),
      en: existingAssigneeField?.labels?.en || 'Assignee',
    },
    type: FieldType.USER,
    location: FieldLocation.HEADER,
    order: Number(existingAssigneeField?.order) || resolveAssigneeOrder(module),
    nature: FieldNature.STANDARD,
    isTableColumn: existingAssigneeField?.isTableColumn !== false,
  };

  return {
    ...module,
    fields: existingAssigneeField
      ? fields.map((field) => (String(field?.key || '').trim() === 'assignee_id' ? assigneeField : field))
      : [...fields, assigneeField],
  };
};

export const BASE_MODULES: Record<string, ModuleDefinition> = {
  products: productsConfig,
  billboards: billboardConfig,
  product_bundles: productBundlesConfig,
  warehouses: warehousesConfig,
  shelves: shelvesConfig,
  stock_transfers: stockTransfersConfig,
  secretariat_documents: secretariatDocumentsConfig,
  delivery_forms: deliveryFormsConfig,
  production_boms: productionBomModule,
  production_orders: productionOrderModule,
  production_group_orders: productionGroupOrdersModule,
  customers: customerModule,
  suppliers: supplierModule,
  invoices: invoicesConfig,
  purchase_invoices: purchaseInvoicesConfig,
  sales_return_invoices: salesReturnInvoicesConfig,
  purchase_return_invoices: purchaseReturnInvoicesConfig,
  projects: projectsModule,
  marketing_leads: marketingLeadsModule,
  personas: personasModule,
  instructions: instructionsModule,
  process_templates: processTemplatesModule,
  process_runs: processRunsModule,
  tasks: tasksModule,
  calculation_formulas: calculationFormulasModule,
  fiscal_years: fiscalYearsConfig,
  chart_of_accounts: chartOfAccountsConfig,
  journal_entries: journalEntriesConfig,
  accounting_event_rules: accountingEventRulesConfig,
  cost_centers: costCentersConfig,
  cash_boxes: cashBoxesConfig,
  bank_accounts: bankAccountsConfig,
  petty_funds: pettyFundsConfig,
  cheques: chequesConfig,
  barters: bartersConfig,
  cash_bank_operations: cashBankOperationsConfig,
  profiles: profilesModule,
  employees: employeesModule,
  job_descriptions: jobDescriptionsModule,
  attendance_logs: attendanceLogsModule,
  work_schedules: workSchedulesModule,
  leave_requests: leaveRequestsModule,
  overtime_requests: overtimeRequestsModule,
  mission_requests: missionRequestsModule,
  price_lists: priceListsConfig,
  web_forms: webFormsConfig,
  automation_execution_reports: automationExecutionReportsConfig,
  sms_delivery_reports: smsDeliveryReportsConfig,
  voip_call_reports: voipCallReportsConfig,
  counterparty_bot_groups: counterpartyBotGroupsConfig,
  expense_documents: expenseDocumentsConfig,
  employee_advances: employeeAdvancesConfig,
  employee_bonus_requests: employeeBonusRequestsModule,
  employee_penalty_requests: employeePenaltyRequestsModule,
  payroll_slips: payrollSlipsConfig,
  employee_contracts: employeeContractsConfig,
  recruitment_applicants: recruitmentApplicantsConfig,
  surveys: surveysModule,
  saas_orgs: saasOrgsConfig,
  saas_demo_requests: saasDemoRequestsConfig,
  saas_users: saasUsersConfig,
  saas_user_announcements: saasUserAnnouncementsConfig,
};

export const MODULES: Record<string, ModuleDefinition> = {
  ...Object.fromEntries(
    Object.entries(BASE_MODULES).map(([moduleId, module]) => [
      moduleId,
      withStandardTagsField(withStandardAssigneeField(withProcessModuleSupport(module))),
    ])
  ),
  // CMS modules — no process/assignee/tags wrappers needed
  ...Object.fromEntries(CMS_MODULES.map(m => [m.id, m])),
};
