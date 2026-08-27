import { describe, expect, it } from 'vitest';
import {
  formatWorkflowNumericValue,
  formatWorkflowPriceWithCurrency,
  getWorkflowStaticValueLabel,
  parseWorkflowIdentityReference,
  resolveWorkflowCurrencyLabel,
} from '../supabase/functions/_shared/workflow-value-labels';

describe('server workflow value labels', () => {
  it('translates attendance values to their Persian labels', () => {
    expect(getWorkflowStaticValueLabel('log_type', 'check_in')).toBe('ورود');
    expect(getWorkflowStaticValueLabel('log_type', 'check_out')).toBe('خروج');
    expect(getWorkflowStaticValueLabel('attendance.log_type', 'check_out')).toBe('خروج');
  });

  it('translates built-in activity priority and status values to Persian labels', () => {
    expect(getWorkflowStaticValueLabel('priority', 'urgent')).toBe('بسیار بالا');
    expect(getWorkflowStaticValueLabel('task_status', 'in_progress')).toBe('در حال انجام');
    expect(getWorkflowStaticValueLabel('status', 'done', 'tasks')).toBe('تکمیل شده');
  });

  it('extracts user and role references without exposing their raw identifiers', () => {
    const userId = '9ef7b957-d2b8-4852-bd61-1b0cdd252f9c';
    const roleId = '55555555-5555-4555-8555-555555555555';
    expect(parseWorkflowIdentityReference(`user_${userId}`)).toEqual({ type: 'user', id: userId });
    expect(parseWorkflowIdentityReference(`role:${roleId}`)).toEqual({ type: 'role', id: roleId });
    expect(parseWorkflowIdentityReference('check_out')).toBeNull();
  });

  it('formats only fields explicitly configured as price', () => {
    expect(formatWorkflowNumericValue('total_amount', '1234567.5')).toBeNull();
    expect(formatWorkflowNumericValue('invoice_price', '۱۲۳۴۵۶۷')).toBeNull();
    expect(formatWorkflowNumericValue('total_amount', '1234567.5', true)).toBe('۱٬۲۳۴٬۵۶۸');
    expect(formatWorkflowNumericValue('invoice_price', '۱۲۳۴۵۶۷', true)).toBe('۱٬۲۳۴٬۵۶۷');
    expect(formatWorkflowNumericValue('__workflow_related__customer::invoices::total_amount', 1250000, true)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatWorkflowNumericValue('custom-field-uuid', '1250000.25', true)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatWorkflowNumericValue('description', '1234567', true)).toBe('۱٬۲۳۴٬۵۶۷');
  });

  it('uses the organization currency label with code-based Persian fallbacks', () => {
    expect(resolveWorkflowCurrencyLabel('IRT', '')).toBe('تومان');
    expect(resolveWorkflowCurrencyLabel('IRR', '')).toBe('ریال');
    expect(resolveWorkflowCurrencyLabel('USD', '')).toBe('دلار');
    expect(resolveWorkflowCurrencyLabel('EUR', 'یورو سازمان')).toBe('یورو سازمان');
    expect(formatWorkflowPriceWithCurrency(1250000, 'IRR', '')).toBe('۱٬۲۵۰٬۰۰۰ ریال');
    expect(formatWorkflowPriceWithCurrency('۱۲۵۰۰۰۰', 'IRT', 'تومان ویژه')).toBe('۱٬۲۵۰٬۰۰۰ تومان ویژه');
    expect(formatWorkflowPriceWithCurrency('۱٬۲۵۰٬۰۰۰ تومان', 'IRT', 'تومان')).toBe('۱٬۲۵۰٬۰۰۰ تومان');
  });
});
