-- Phase 23: Counterparty mirror FK deferrable fix
-- Date: 2026-03-20
-- Type: additive / non-breaking

begin;

alter table if exists public.suppliers
  drop constraint if exists suppliers_linked_customer_id_fkey;

alter table if exists public.suppliers
  add constraint suppliers_linked_customer_id_fkey
  foreign key (linked_customer_id)
  references public.customers(id)
  on delete set null
  deferrable initially deferred;

alter table if exists public.customers
  drop constraint if exists customers_linked_supplier_id_fkey;

alter table if exists public.customers
  add constraint customers_linked_supplier_id_fkey
  foreign key (linked_supplier_id)
  references public.suppliers(id)
  on delete set null
  deferrable initially deferred;

commit;
