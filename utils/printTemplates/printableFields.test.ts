import { describe, expect, it } from 'vitest';
import {
  hasMeaningfulPrintValue,
  isPrintTemplateFieldVisible,
  resolveEffectivePrintFieldKeys,
  shouldInitializePrintFieldSelection,
} from './printableFields';

describe('printable field selection contract', () => {
  const fields = [
    { key: 'record.title', hasValue: true, defaultSelected: true },
    { key: 'record.description', hasValue: true, defaultSelected: true },
    { key: 'record.discount', hasValue: false, defaultSelected: true },
    { key: 'record.internal', hasValue: true, defaultSelected: false },
  ];

  it('uses value-aware defaults only while the user has no saved selection', () => {
    expect(resolveEffectivePrintFieldKeys({ fields, hasExplicitSelection: false })).toEqual([
      'record.title',
      'record.description',
    ]);
  });

  it('keeps an explicit empty selection empty instead of treating it as all fields', () => {
    expect(resolveEffectivePrintFieldKeys({
      fields,
      selectedKeys: [],
      hasExplicitSelection: true,
    })).toEqual([]);
  });

  it('waits for a value-aware default instead of storing a temporary empty selection', () => {
    expect(shouldInitializePrintFieldSelection({ persistedKeys: null, defaultKeys: [] })).toBe(false);
    expect(shouldInitializePrintFieldSelection({ persistedKeys: null, defaultKeys: ['record.title'] })).toBe(true);
    expect(shouldInitializePrintFieldSelection({ persistedKeys: [], defaultKeys: [] })).toBe(true);
  });

  it('allows a user to explicitly show an empty field', () => {
    expect(resolveEffectivePrintFieldKeys({
      fields,
      selectedKeys: ['record.discount'],
      hasExplicitSelection: true,
    })).toEqual(['record.discount']);
  });

  it('treats empty rich-text editor markup as empty and visible rich text as a value', () => {
    expect(hasMeaningfulPrintValue('<p><br></p>', 'description')).toBe(false);
    expect(hasMeaningfulPrintValue('<p>توضیحات ثبت‌شده</p>', 'description')).toBe(true);
  });

  it('keeps a selected invoice description visible through the system-template gate', () => {
    expect(isPrintTemplateFieldVisible({
      fieldPath: 'record.description',
      canView: true,
      controlsSelection: true,
      knownFieldKeys: ['record.description'],
      selectedFieldKeys: ['record.description'],
    })).toBe(true);
  });
});
