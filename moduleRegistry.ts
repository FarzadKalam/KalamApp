import { ModuleDefinition } from './types';
import { productsConfig } from './modules/productsConfig';
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

export const MODULES: Record<string, ModuleDefinition> = {
  products: productsConfig,
  product_bundles: productBundlesConfig,
  warehouses: warehousesConfig,
  shelves: shelvesConfig,
  stock_transfers: stockTransfersConfig,
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
};
