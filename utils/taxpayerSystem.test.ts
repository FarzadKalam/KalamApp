import { describe, expect, it } from 'vitest';
import {
  buildTaxpayerTaxDateHex,
  buildTaxpayerTaxId,
  buildTaxpayerVerhoeffInput,
  mapTaxpayerSettlementMethodToSetm,
  normalizeTaxpayerMoneyToRial,
  stableStringifyForTaxpayer,
} from './taxpayerSystem';

describe('taxpayerSystem', () => {
  it('builds tax date hex from epoch days', () => {
    expect(buildTaxpayerTaxDateHex('2020-07-20')).toBe('0481F');
  });

  it('builds the official sample tax id', () => {
    expect(buildTaxpayerVerhoeffInput('DEF5GH', '2020-07-20', 12)).toBe('68697057172018463000000000012');
    expect(buildTaxpayerTaxId({ fiscalId: 'DEF5GH', invoiceDate: '2020-07-20', internalSerial: 12 })).toBe(
      'DEF5GH0481F000000000C2'
    );
  });

  it('stable stringifies taxpayer JSON with sorted keys and escaped hashes', () => {
    expect(stableStringifyForTaxpayer({ b: 2, a: { tag: '#x', z: null }, c: undefined })).toBe(
      '{"a":{"tag":"\\u0023x","z":null},"b":2}'
    );
  });

  it('normalizes money to rial', () => {
    expect(normalizeTaxpayerMoneyToRial(100, 'IRT')).toBe(1000);
    expect(normalizeTaxpayerMoneyToRial(100, 'IRR')).toBe(100);
  });

  it('maps settlement method to setm', () => {
    expect(mapTaxpayerSettlementMethodToSetm('cash')).toBe(1);
    expect(mapTaxpayerSettlementMethodToSetm('credit')).toBe(2);
    expect(mapTaxpayerSettlementMethodToSetm('mixed')).toBe(3);
  });
});
