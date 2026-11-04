import { describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { isEmailAddress, isEmailField } from './organizationEmail';
describe('email field actions', () => {
  it('recognizes standard and custom email keys without treating arbitrary text as email', () => {
    for (const key of ['email', 'work_email', 'email_1', 'customer_mail']) expect(isEmailField({ key })).toBe(true);
    expect(isEmailField({ key: 'mailbox_count' })).toBe(false);
    expect(isEmailField({ key: 'name' })).toBe(false);
  });
  it('rejects header injection and incomplete recipients', () => {
    expect(isEmailAddress('office@example.com')).toBe(true);
    for (const value of ['name@', 'name@example.com\r\nBcc:a@example.com', '<a@example.com>', 'a b@example.com']) expect(isEmailAddress(value)).toBe(false);
  });
});
