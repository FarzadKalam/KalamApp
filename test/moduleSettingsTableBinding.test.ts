// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const migration = readFileSync('database_v1_phase578_module_settings_table_binding.sql','utf8');
beforeAll(async () => {
  db=new PGlite();
  await db.exec(`create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
    create function public.current_org_id() returns uuid language sql as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
    create function public.current_user_can_edit_module_settings(text) returns boolean language sql as $$ select current_setting('test.allowed',true)='yes' $$;
    create table public.target_a(id uuid,org_id uuid);create table public.target_b(id uuid,org_id uuid);
    create table public.voip_call_logs(id uuid,org_id uuid);
    select set_config('test.org','20000000-0000-4000-8000-000000000001',false),set_config('test.allowed','yes',false);`);
  await db.exec(migration);await db.exec(migration);
}, 60000);
afterAll(async () => { await db?.close(); });
const ensure = (module: string, table: string) => db.query('select public.ensure_module_settings_columns($1,$2,$3)',[module,table,JSON.stringify([{ key:'custom_text',type:'text' }])]);

describe.sequential('module settings DDL boundary', () => {
  it('refuses a different destination table even when module editing is allowed', async () => {
    await expect(ensure('target_a','target_b')).rejects.toThrow('همخوانی ندارد');
    expect((await db.query("select column_name from information_schema.columns where table_name='target_b' and column_name='custom_text'")).rows).toEqual([]);
  });
  it('keeps valid custom fields and the existing call-report alias working', async () => {
    await ensure('target_a','target_a');await ensure('target_a','target_a');
    await ensure('voip_call_reports','voip_call_logs');
    expect((await db.query("select column_name from information_schema.columns where table_name='target_a' and column_name='custom_text'")).rows).toHaveLength(1);
  });
  it('fails closed without organization or module permission', async () => {
    await db.exec("select set_config('test.org','',false)");
    await expect(ensure('target_a','target_a')).rejects.toThrow('سازمان');
    await db.exec("select set_config('test.org','20000000-0000-4000-8000-000000000001',false),set_config('test.allowed','no',false)");
    await expect(ensure('target_a','target_a')).rejects.toThrow('دسترسی');
  });
});
