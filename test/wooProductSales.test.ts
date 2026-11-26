// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = (path: string) => readFileSync(path, 'utf8');
const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const connection = '20000000-0000-4000-8000-000000000001';
const product = '30000000-0000-4000-8000-000000000001';
const actor = '40000000-0000-4000-8000-000000000001';
const role = '50000000-0000-4000-8000-000000000001';

it('recognizes WooCommerce sales on completion and keeps product metrics scoped and idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(migration('tests/database/tenant-content-rls.integration.setup.sql').replace(/^\\set.*\r?\n/, ''));
    await db.exec(`
      alter table products alter column id set default gen_random_uuid();
      alter table products add column manual_code text, add column system_code text,
        add column product_type text, add column sell_price numeric, add column updated_at timestamptz default now();
      alter table external_order_inbox add column external_status text, add column source_updated_at timestamptz,
        add column received_at timestamptz default now(), add column processing_status text default 'pending';
      alter table invoices add column name text, add column invoice_date date, add column status text default 'created',
        add column customer_id uuid, add column sale_source text, add column "invoiceItems" jsonb,
        add column subtotal_before_tax numeric, add column shipping_amount numeric, add column invoice_discount_amount numeric,
        add column total_invoice_amount numeric, add column total_received_amount numeric,
        add column remaining_balance numeric, add column updated_at timestamptz default clock_timestamp(),
        add column payments jsonb default '[]';
      create table customers (id uuid primary key default gen_random_uuid(), org_id uuid, full_name text,
        first_name text, last_name text, email text, mobile_1 text);
      create table company_settings (org_id uuid, currency_code text);
      create table dynamic_options (org_id uuid, category text, value text, label text,
        display_order int, is_active boolean, updated_at timestamptz, unique (org_id, category, value));
      grant select on invoices to authenticated;
    `);
    const permission = migration('database_v1_phase606_module_field_action_permissions.sql');
    await db.exec(permission.slice(permission.indexOf('create or replace function public.current_user_can_module_field'),
      permission.indexOf('-- Defense in depth')));
    const importer = migration('database_v1_phase562_woocommerce_sync_foundation.sql');
    await db.exec(importer.slice(importer.indexOf('create or replace function public.import_woocommerce_order('),
      importer.indexOf('revoke all on function public.import_woocommerce_order')));
    for (const file of [
      'database_v1_phase589_external_sync_history.sql', 'database_v1_phase591_product_site_content_drafts.sql',
      'database_v1_phase613_woo_product_content_sync.sql', 'database_v1_phase614_woo_invoice_product_sales.sql',
      'database_v1_phase613_woo_product_content_sync.sql', 'database_v1_phase614_woo_invoice_product_sales.sql',
    ]) await db.exec(migration(file));
    const inbox = migration('database_v1_phase561_external_connector_inbox.sql');
    await db.exec(inbox.slice(inbox.indexOf('create or replace function public.store_external_order('), inbox.indexOf('revoke all on function public.store_external_order')));

    await db.exec(`
      insert into organizations(id, name, slug) values ('${org}', 'A', 'a'), ('${otherOrg}', 'B', 'b');
      insert into auth.users values ('${actor}');
      insert into org_roles(id, org_id) values ('${role}', '${org}');
      insert into user_organization_memberships(org_id, user_id, role_id) values ('${org}', '${actor}', '${role}');
      insert into products(id, org_id, name, manual_code) values ('${product}', '${org}', 'Product A', 'ABC');
      insert into external_connections(id, org_id) values ('${connection}', '${org}');
      select set_config('request.jwt.claim.role', 'service_role', false);
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select set_config('request.jwt.claim.org_id', '${org}', false);
    `);
    const item = { product_id: 11, sku: 'ABC', name: 'Product A', quantity: 2, subtotal: '40', total: '30', total_tax: '0' };
    const importOrder = async (status: string, timestamp: string, id = '1') => {
      await db.query('select store_external_order($1, $2, $3, $4, $5)', [
        connection, id, status, timestamp, JSON.stringify({
          currency: 'IRT', total: '45', status,
          line_items: [item, { ...item, quantity: 1, subtotal: '20', total: '15' }],
        }),
      ]);
      const { rows } = await db.query<{ invoice_id: string; outcome: string }>(
        'select * from import_woocommerce_order_with_outcome($1, $2)', [connection, id]);
      return rows[0];
    };
    const metrics = async (orgId = org) => (await db.query(
      'select invoice_count, total_sold_quantity, total_sold_amount from get_product_sales_summary($1, $2)', [orgId, product],
    )).rows;

    const first = await importOrder('processing', '2026-11-18T00:00:00Z');
    expect(first.outcome).toBe('created');
    expect((await db.query<{ status: string; invoiceItems: { product_id: string }[] }>(
      'select status, "invoiceItems" from invoices where id = $1', [first.invoice_id])).rows[0])
      .toMatchObject({ status: 'created', invoiceItems: [{ product_id: product }, { product_id: product }] });
    expect(await metrics()).toEqual([{ invoice_count: 0, total_sold_quantity: '0', total_sold_amount: '0' }]);
    expect(await importOrder('completed', '2026-11-19T00:00:00Z')).toEqual({ ...first, outcome: 'updated' });
    expect(await importOrder('completed', '2026-11-19T00:00:00Z')).toEqual({ ...first, outcome: 'skipped' });
    expect(await importOrder('processing', '2026-11-18T00:00:00Z')).toEqual({ ...first, outcome: 'skipped' });
    expect(await metrics()).toEqual([{ invoice_count: 1, total_sold_quantity: '3', total_sold_amount: '45.00' }]);
    expect(await metrics(otherOrg)).toEqual([]);
    await db.exec('set role authenticated');
    expect(await metrics()).toEqual([{ invoice_count: 1, total_sold_quantity: '3', total_sold_amount: '45.00' }]);
    expect(await metrics(otherOrg)).toEqual([]);
    await db.exec('reset role');

    const paid = await importOrder('processing', '2026-11-18T00:00:00Z', '2');
    await db.query('update invoices set total_received_amount = 10 where id = $1', [paid.invoice_id]);
    await expect(importOrder('completed', '2026-11-19T00:00:00Z', '2')).rejects.toThrow('Invoice with recorded payments');
    await db.query('update org_roles set permissions = $1 where id = $2',
      ['{"products":{"fields":{"total_sold_amount":false}}}', role]);
    expect(await metrics()).toEqual([{ invoice_count: 1, total_sold_quantity: '3', total_sold_amount: null }]);
    await db.query('update org_roles set permissions = $1 where id = $2', ['{"invoices":{"view":false}}', role]);
    expect(await metrics()).toEqual([]);
    const retryable = await importOrder('failed', '2026-11-18T00:00:00Z', '3');
    expect(await importOrder('completed', '2026-11-19T00:00:00Z', '3')).toEqual({ ...retryable, outcome: 'updated' });
    expect((await db.query('select status from invoices where id = $1', [retryable.invoice_id])).rows)
      .toEqual([{ status: 'completed' }]);
  } finally {
    await db.close();
  }
}, 60_000);
