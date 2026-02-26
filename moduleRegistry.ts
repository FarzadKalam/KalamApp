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
};
