import { describe, expect, it } from 'vitest';
import {
  buildDefaultPrintSignatureConfigs,
  buildPrintSignatureBandHtml,
  getPrintSignatureQuickAddOptions,
  materializePrintSignatureStates,
  stripLegacyPrintSignatureTokens,
} from './signatures';

describe('print signatures', () => {
  it('builds smart default rows for record print', () => {
    const rows = buildDefaultPrintSignatureConfigs({
      scope: 'record',
      moduleConfig: {
        fields: [
          { key: 'assignee_id', labels: { fa: 'مسئول' }, type: 'relation', relationConfig: { targetModule: 'profiles' } },
          { key: 'customer_id', labels: { fa: 'خریدار' }, type: 'relation', relationConfig: { targetModule: 'customers' } },
        ],
      },
      record: {
        assignee_id: 'user-1',
        customer_id: 'customer-1',
      },
      currentUserId: 'user-current',
      companyInfo: { ceo_name: 'مدیر نمونه', manager_title: 'مدیرمسئول' },
      canUseCeoSignature: true,
    });

    expect(rows.map((row) => row.kind)).toEqual([
      'ceo',
      'current_user',
      'record_assignee',
      'record_relation',
    ]);
  });

  it('materializes dynamic rows from current context', () => {
    const states = materializePrintSignatureStates({
      configs: [
        { id: 'ceo', kind: 'ceo', enabled: true, automatic: true },
        { id: 'current', kind: 'current_user', enabled: true, automatic: true, signerModule: 'profiles', signerId: 'user-current' },
        { id: 'customer', kind: 'record_relation', enabled: true, automatic: true, signerModule: 'customers', sourceFieldKey: 'customer_id', sourceFieldLabel: 'خریدار' },
      ],
      scope: 'record',
      moduleConfig: {
        fields: [{ key: 'customer_id', labels: { fa: 'خریدار' }, type: 'relation', relationConfig: { targetModule: 'customers' } }],
      },
      record: { customer_id: 'customer-1' },
      companyInfo: {
        ceo_name: 'مدیر نمونه',
        manager_title: 'مدیرمسئول',
        signature_image_url: 'https://cdn.example.com/signature.png',
        stamp_image_url: 'https://cdn.example.com/stamp.png',
      },
      currentUser: { id: 'user-current', full_name: 'کاربر جاری' },
      currentUserRoleTitle: 'مدیر فروش',
      signerLabelByKey: { 'customers:customer-1': 'شرکت نمونه' },
      canUseCeoSignature: true,
      assigneeDirectory: {
        users: [{ id: 'user-current', display_name: 'کاربر جاری', role_id: 'role-1' }],
        roles: [{ id: 'role-1', title: 'مدیر فروش' }],
      },
    });

    expect(states[0].subtitleValue).toBe('امضای مدیرمسئول');
    expect(states[0].nameValue).toBe('مدیر نمونه');
    expect(states[0].signatureImageUrl).toContain('signature.png');
    expect(states[0].stampImageUrl).toContain('stamp.png');
    expect(states[0].showCompanyAssets).toBe(true);
    expect(states[1].subtitleValue).toBe('امضای مدیر فروش');
    expect(states[2].subtitleValue).toBe('امضای خریدار');
    expect(states[2].nameValue).toBe('شرکت نمونه');
  });

  it('hides ceo rows when the role permission is disabled', () => {
    const states = materializePrintSignatureStates({
      configs: [{ id: 'ceo', kind: 'ceo', enabled: true, automatic: false, nameOverride: 'مدیر نمونه', subtitleOverride: 'امضای مدیرمسئول' }],
      scope: 'record',
      moduleConfig: { fields: [] },
      companyInfo: { ceo_name: 'مدیر نمونه', manager_title: 'مدیرمسئول', signature_image_url: 'https://cdn.example.com/signature.png' },
      canUseCeoSignature: false,
    });

    expect(states[0].nameValue).toBe('');
    expect(states[0].subtitleValue).toBe('');
    expect(states[0].showCompanyAssets).toBe(false);
  });

  it('uses the organization manager title in signature actions', () => {
    const options = getPrintSignatureQuickAddOptions({
      canUseCeoSignature: true,
      companyInfo: { manager_title: 'مدیرمسئول' },
    });

    expect(options.find((option) => option.key === 'ceo')?.label).toBe('امضای مدیرمسئول');
  });

  it('strips legacy signature placeholders and renders new band html', () => {
    expect(stripLegacyPrintSignatureTokens('{{system.footer_signatures}}<div>{{system.company_signature_image}}</div>')).toBe('<div></div>');

    const html = buildPrintSignatureBandHtml([
      {
        id: '1',
        kind: 'manual',
        enabled: true,
        automatic: false,
        signerModule: null,
        signerId: null,
        sourceFieldKey: null,
        sourceFieldLabel: null,
        derivedName: '',
        derivedSubtitle: '',
        nameValue: 'نام اول',
        subtitleValue: 'امضای اول',
        signatureImageUrl: null,
        stampImageUrl: null,
        showCompanyAssets: false,
        sourceDescription: '',
        unresolved: false,
      },
      {
        id: '2',
        kind: 'manual',
        enabled: true,
        automatic: false,
        signerModule: null,
        signerId: null,
        sourceFieldKey: null,
        sourceFieldLabel: null,
        derivedName: '',
        derivedSubtitle: '',
        nameValue: 'نام دوم',
        subtitleValue: 'امضای دوم',
        signatureImageUrl: 'https://cdn.example.com/signature.png',
        stampImageUrl: 'https://cdn.example.com/stamp.png',
        showCompanyAssets: true,
        sourceDescription: '',
        unresolved: false,
      },
    ]);

    expect(html).toContain('نام اول');
    expect(html).toContain('نام دوم');
    expect(html).toContain('signature.png');
    expect(html).toContain('stamp.png');
  });

  it('does not render the signature band when every signature is disabled', () => {
    const states = materializePrintSignatureStates({
      configs: [
        {
          id: 'manual-disabled',
          kind: 'manual',
          enabled: false,
          automatic: false,
          nameOverride: 'نام پنهان',
          subtitleOverride: 'امضای پنهان',
        },
      ],
      scope: 'record',
      moduleConfig: { fields: [] },
    });

    expect(states[0].enabled).toBe(false);
    expect(buildPrintSignatureBandHtml(states)).toBe('');
  });
});
