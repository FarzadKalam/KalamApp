import { MODULES } from '../../moduleRegistry';
import { CASH_BANK_LEDGER_PRINT_ID, cashBankLedgerPrintModule } from '../cashBankLedger';
import type { ModuleDefinition } from '../../types';

// Report-only print contexts are kept out of tenant navigation and plan modules.
export const PRINT_ONLY_MODULES: Record<string, ModuleDefinition> = { [CASH_BANK_LEDGER_PRINT_ID]: cashBankLedgerPrintModule };
export const PRINT_MODULES = { ...MODULES, ...PRINT_ONLY_MODULES };
