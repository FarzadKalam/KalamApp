// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dialPhone, iranMobileAuth, iranMobileE164, iranMobileLocal, phoneLookupKey } from '../supabase/functions/_shared/phone-number';
import { normalizePhoneForStorage, normalizePhoneForStorageWithCountry, parsePhoneNumber } from '../utils/phoneNumber';

const variants = [
  '09123456789', '9123456789', '989123456789', '+989123456789',
  '00989123456789', '0989123456789', '+98 (0) 912-345-6789', '0098 09123456789',
  '۰۹۱۲۳۴۵۶۷۸۹', '۹۱۲۳۴۵۶۷۸۹', '+۹۸۹۱۲۳۴۵۶۷۸۹', '٠٠٩٨٩١٢٣٤٥٦٧٨٩', '\u200f۰۹۱۲ ۳۴۵ ۶۷۸۹\u200e',
];
let db: PGlite;
const migration = readFileSync(new URL('../database_v1_phase577_canonical_phone_identity.sql', import.meta.url), 'utf8');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table public.profiles(id uuid primary key,mobile_1 text,mobile text,full_name text,avatar_url text);
    create table auth.users(id uuid primary key,phone text unique,raw_user_meta_data jsonb,phone_confirmed_at timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    insert into auth.users values ('10000000-0000-4000-8000-000000000001','+989123456789','{}','2026-01-01');
    insert into auth.identities values ('10000000-0000-4000-8000-000000000001','phone','{"phone":"989123456789"}');
  `);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`create trigger sync_profile_contact after insert or update on profiles for each row execute function sync_profile_contact_to_auth_user();`);
},60_000);
afterAll(async () => { await db?.close(); });

describe('phone normalization across browser, Edge and PostgreSQL', () => {
  it.each(variants)('recognizes %s consistently', async value => {
    expect(iranMobileE164(value)).toBe('+989123456789');
    expect(iranMobileLocal(value)).toBe('09123456789');
    expect(iranMobileAuth(value)).toBe('989123456789');
    expect(dialPhone(value)).toBe('09123456789');
    expect(phoneLookupKey(value)).toBe('9123456789');
    expect(normalizePhoneForStorage(value)).toBe('+989123456789');
    expect(normalizePhoneForStorageWithCountry(value,'IR')).toBe('+989123456789');
    expect(parsePhoneNumber(value).nationalNumber).toBe('09123456789');
    const result = await db.query<{ mobile: string; lookup: string }>(
      'select normalize_iran_mobile_e164($1) as mobile,kalam_phone_lookup_key($1) as lookup', [value]);
    expect(result.rows[0]).toEqual({ mobile: '+989123456789', lookup: '9123456789' });
  });
  it.each(['', '123', '091234567890', 'person9123456789@example.com', '09123456789,09351234567'])('rejects invalid mobile %s', async value => {
    expect(iranMobileE164(value)).toBeNull();
    const result = await db.query<{ mobile: string | null }>('select normalize_iran_mobile_e164($1) as mobile',[value]);
    expect(result.rows[0].mobile).toBeNull();
  });
  it('preserves international calls, landlines and service numbers', () => {
    expect(dialPhone('+۴۴ ۲۰ ۷۹۴۶ ۰۰۱۸')).toBe('+442079460018');
    expect(dialPhone('۰۲۱-۱۲۳۴۵۶۷۸')).toBe('02112345678');
    expect(dialPhone('۱۰۰۰')).toBe('1000');
  });
  it('repairs old Auth values without granting phone verification', async () => {
    const result = await db.query<{ phone: string; verified: boolean }>('select phone,phone_confirmed_at is not null as verified from auth.users');
    expect(result.rows).toEqual([{phone:'989123456789',verified:true}]);
  });
  it('keeps Auth canonical after profile name/avatar changes and direct Auth writes', async () => {
    await db.exec(`insert into profiles values ('10000000-0000-4000-8000-000000000001','۰۹۱۲۳۴۵۶۷۸۹',null,'نام',null);
      update profiles set full_name='نام جدید',avatar_url='avatar';`);
    for (const value of variants) {
      await db.query('update auth.users set phone=$1',[value]);
      expect((await db.query<{phone:string}>('select phone from auth.users')).rows[0].phone).toBe('989123456789');
    }
    expect((await db.query<{verified:boolean}>('select phone_confirmed_at is not null as verified from auth.users')).rows[0].verified).toBe(true);
  });
  it('rejects a second owner of the same formatted number', async () => {
    await expect(db.query("insert into auth.users(id,phone) values('10000000-0000-4000-8000-000000000002',$1)",['۰۹۱۲۳۴۵۶۷۸۹'])).rejects.toThrow(/unique|duplicate/);
  });
  it('normalizes international Auth numbers and never confirms an unverified account', async () => {
    await db.query("insert into auth.users(id,phone) values('10000000-0000-4000-8000-000000000003',$1)",['+۴۴ ۲۰ ۷۹۴۶ ۰۰۱۸']);
    const result = await db.query<{phone:string;verified:boolean}>("select phone,phone_confirmed_at is not null as verified from auth.users where id='10000000-0000-4000-8000-000000000003'");
    expect(result.rows[0]).toEqual({phone:'442079460018',verified:false});
  });
  it('finds legacy Persian profile numbers only through the private service lookup', async () => {
    expect((await db.query('select id from find_profile_by_phone_for_auth($1)', ['+98 (0) 9123456789'])).rows).toHaveLength(1);
    expect((await db.query('select id from find_profile_by_phone_for_auth($1,$2)', ['09123456789','10000000-0000-4000-8000-000000000001'])).rows).toHaveLength(0);
    await db.exec('set role authenticated');
    try { await expect(db.query('select * from public.find_profile_by_phone_for_auth($1)', ['09123456789'])).rejects.toThrow(/permission denied/); }
    finally { await db.exec('reset role'); }
  });
  it('requires verification again when the profile phone really changes', async () => {
    await db.query("update profiles set mobile_1=$1 where id='10000000-0000-4000-8000-000000000001'", ['۰۹۳۵۱۲۳۴۵۶۷']);
    const result = await db.query<{phone:string;verified:boolean}>("select phone,phone_confirmed_at is not null as verified from auth.users where id='10000000-0000-4000-8000-000000000001'");
    expect(result.rows[0]).toEqual({phone:'989351234567',verified:false});
  });
});
