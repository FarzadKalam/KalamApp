import { describe, expect, it } from 'vitest';
import {
  buildTaxpayerTaxDateHex,
  buildTaxpayerTaxId,
  buildTaxpayerVerhoeffInput,
  isValidIranNationalCode,
  mapTaxpayerSettlementMethodToSetm,
  normalizeTaxpayerInvoiceDate,
  normalizeTaxpayerNumericId,
  normalizeTaxpayerMoneyToRial,
  normalizeTaxpayerLegacySignatureValue,
  normalizeTaxpayerRealBuyerNationalCode,
  omitNullTaxpayerLegacySignatureKeyId,
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

  it('normalizes jalali invoice dates before building taxpayer tax ids', () => {
    expect(normalizeTaxpayerInvoiceDate('1405/04/01')).toBe('2026-06-22');
    expect(normalizeTaxpayerInvoiceDate('۱۴۰۵/۰۴/۱۶')).toBe('2026-07-07');
    expect(buildTaxpayerTaxId({ fiscalId: 'A38MRA', invoiceDate: '1405/04/01', internalSerial: 455 })).toBe(
      'A38MRA0509200000001C76'
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

  it('normalizes taxpayer buyer national codes without losing leading zeroes', () => {
    expect(normalizeTaxpayerNumericId('۰۹۲-۲۳۵-۶۷۴۲')).toBe('0922356742');
    expect(isValidIranNationalCode('0922356742')).toBe(true);
    expect(normalizeTaxpayerRealBuyerNationalCode('922356742')).toBe('0922356742');
    expect(normalizeTaxpayerRealBuyerNationalCode('1111111111')).toBe('');
  });

  it('maps settlement method to setm', () => {
    expect(mapTaxpayerSettlementMethodToSetm('cash')).toBe(1);
    expect(mapTaxpayerSettlementMethodToSetm('credit')).toBe(2);
    expect(mapTaxpayerSettlementMethodToSetm('mixed')).toBe(3);
  });

  it('normalizes legacy SDK signatures with bearer token stripped', () => {
    const normalized = normalizeTaxpayerLegacySignatureValue(
      [{ uid: 'u1', packetType: 'INVOICE.V01', retry: false, data: { amount: 10 } }],
      { Authorization: 'Bearer token-1', requestTraceId: 'trace-1', timestamp: '123' }
    );
    expect(normalized).toBe('token-1#10#INVOICE.V01#false#u1#trace-1#123');
  });

  it('omits null legacy packet signature key id before signing', () => {
    expect(omitNullTaxpayerLegacySignatureKeyId({ uid: 'u1', signatureKeyId: null })).toEqual({ uid: 'u1' });
    expect(omitNullTaxpayerLegacySignatureKeyId({ uid: 'u1', signatureKeyId: 'key-1' })).toEqual({
      uid: 'u1',
      signatureKeyId: 'key-1',
    });
  });
});
