import { describe, expect, it } from 'vitest';
import {
  getPrintFieldSelectionCandidates,
  hasMeaningfulPrintValue,
  isPrintFieldKnownToTemplate,
  isPrintFieldSelected,
  isPrintableModuleField,
} from './printableFields';

describe('printable field rules', () => {
  it('honors both field and parent block print settings', () => {
    const moduleConfig = { blocks: [{ id: 'public' }, { id: 'private', printable: false }] };
    expect(isPrintableModuleField(moduleConfig, { key: 'description' })).toBe(true);
    expect(isPrintableModuleField(moduleConfig, { key: 'internal_note', printable: false })).toBe(false);
    expect(isPrintableModuleField(moduleConfig, { key: 'private_note', location: 'block', blockId: 'private' })).toBe(false);
  });

  it('treats blank values and zero-value discounts as empty defaults', () => {
    expect(hasMeaningfulPrintValue('', 'description')).toBe(false);
    expect(hasMeaningfulPrintValue(0, 'discount')).toBe(false);
    expect(hasMeaningfulPrintValue('۰', 'discount_percent')).toBe(false);
    expect(hasMeaningfulPrintValue(0, 'quantity')).toBe(true);
  });

  it('matches manual and system selection keys for the same record field', () => {
    expect(getPrintFieldSelectionCandidates('record.description')).toEqual(['record.description', 'description']);
    expect(isPrintFieldKnownToTemplate('record.description', ['description'])).toBe(true);
    expect(isPrintFieldSelected('record.description', ['description'])).toBe(true);
    expect(isPrintFieldSelected('record.description', ['record.description'])).toBe(true);
  });

  it('keeps a selected table column and its parent table in sync', () => {
    expect(isPrintFieldSelected('block.invoiceItems', ['block.invoiceItems.description'])).toBe(true);
    expect(isPrintFieldSelected('block.invoiceItems.description', ['block.invoiceItems'])).toBe(false);
  });
});
