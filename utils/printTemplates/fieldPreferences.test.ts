import { afterEach, describe, expect, it } from 'vitest';
import {
  getTemplateStoredPrintFieldSelection,
  loadPrintFieldPreference,
  savePrintFieldPreference,
} from './fieldPreferences';

const preference = {
  userId: 'user-1',
  moduleId: 'invoices',
  templateId: 'default_invoice_official',
  scope: 'record' as const,
};

describe('print field preferences', () => {
  afterEach(() => window.localStorage.clear());

  it('persists field choices per organization', () => {
    savePrintFieldPreference({ ...preference, orgId: 'org-a', selectedFieldKeys: ['record.description'] });
    savePrintFieldPreference({ ...preference, orgId: 'org-b', selectedFieldKeys: ['record.invoice_no'] });

    expect(loadPrintFieldPreference({ ...preference, orgId: 'org-a' })).toEqual(['record.description']);
    expect(loadPrintFieldPreference({ ...preference, orgId: 'org-b' })).toEqual(['record.invoice_no']);
  });

  it('does not reuse a legacy preference unless the caller explicitly allows it', () => {
    window.localStorage.setItem('kalamapp.print_field_preferences.v1', JSON.stringify({
      'user-1::invoices::default_invoice_official::record': ['record.description'],
    }));

    expect(loadPrintFieldPreference({ ...preference, orgId: 'org-a', allowLegacy: false })).toBeNull();
    expect(loadPrintFieldPreference({ ...preference, orgId: 'org-a', allowLegacy: true })).toEqual(['record.description']);
  });

  it('treats an empty template-owned selection as absent rather than hiding new variables', () => {
    expect(getTemplateStoredPrintFieldSelection([])).toBeNull();
    expect(getTemplateStoredPrintFieldSelection(['', ' system.today_date '])).toEqual([
      'system.today_date',
    ]);
  });
});
