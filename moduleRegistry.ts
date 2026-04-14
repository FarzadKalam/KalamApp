import { ModuleDefinition } from './types';
import { productsConfig } from './modules/productsConfig';
import { billboardConfig } from './modules/billboardsConfig';
import { productBundlesConfig } from './modules/productBundlesConfig';
import { productionBomModule, productionOrderModule } from './modules/productionConfig';
import { customerModule } from './modules/customerConfig';
import { supplierModule } from './modules/supplierConfig';
import { tasksModule } from './modules/tasksConfig';
import { invoicesConfig } from './modules/invoicesConfig';
import { purchaseInvoicesConfig } from './modules/purchaseInvoicesConfig';
import { warehousesConfig } from './modules/warehousesConfig';
import { shelvesConfig } from './modules/shelvesConfig';
import { stockTransfersConfig } from './modules/stockTransfersConfig';
import { secretariatDocumentsConfig } from './modules/secretariatDocumentsConfig';
import { deliveryFormsConfig } from './modules/deliveryFormsConfig';
import { calculationFormulasModule } from './modules/calculationFormulasConfig';
import { productionGroupOrdersModule } from './modules/productionGroupOrdersConfig';
import { projectsModule } from './modules/projectsConfig';
import { marketingLeadsModule } from './modules/marketingLeadsConfig';
import { processTemplatesModule } from './modules/processTemplatesConfig';
import { processRunsModule } from './modules/processRunsConfig';
import { fiscalYearsConfig } from './modules/fiscalYearsConfig';
import { chartOfAccountsConfig } from './modules/chartOfAccountsConfig';
import { journalEntriesConfig } from './modules/journalEntriesConfig';
import { accountingEventRulesConfig } from './modules/accountingEventRulesConfig';
import { costCentersConfig } from './modules/costCentersConfig';
import { cashBoxesConfig } from './modules/cashBoxesConfig';
import { bankAccountsConfig } from './modules/bankAccountsConfig';
import { chequesConfig } from './modules/chequesConfig';
import { cashBankOperationsConfig } from './modules/cashBankOperationsConfig';
import { bartersConfig } from './modules/bartersConfig';
import { employeesModule } from './modules/employeesConfig';
import { attendanceLogsModule } from './modules/attendanceLogsConfig';
import { workSchedulesModule } from './modules/workSchedulesConfig';
import { leaveRequestsModule } from './modules/leaveRequestsConfig';
import { overtimeRequestsModule } from './modules/overtimeRequestsConfig';
import { missionRequestsModule } from './modules/missionRequestsConfig';
import { priceListsConfig } from './modules/priceListsConfig';
import { webFormsConfig } from './modules/webFormsConfig';
import { automationExecutionReportsConfig } from './modules/automationExecutionReportsConfig';
import { smsDeliveryReportsConfig } from './modules/smsDeliveryReportsConfig';
import { voipCallReportsConfig } from './modules/voipCallReportsConfig';
import { counterpartyBotGroupsConfig } from './modules/counterpartyBotGroupsConfig';
import { expenseDocumentsConfig } from './modules/expenseDocumentsConfig';
import { employeeAdvancesConfig } from './modules/employeeAdvancesConfig';
import { payrollSlipsConfig } from './modules/payrollSlipsConfig';
import { employeeContractsConfig } from './modules/employeeContractsConfig';
import { recruitmentApplicantsConfig } from './modules/recruitmentApplicantsConfig';

export const MODULES: Record<string, ModuleDefinition> = {
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
  projects: projectsModule,
  marketing_leads: marketingLeadsModule,
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
  cheques: chequesConfig,
  barters: bartersConfig,
  cash_bank_operations: cashBankOperationsConfig,
  employees: employeesModule,
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
  payroll_slips: payrollSlipsConfig,
  employee_contracts: employeeContractsConfig,
  recruitment_applicants: recruitmentApplicantsConfig,
};
