-- KalamApp V1 - Phase 90
-- Expense documents: estimated amount + financial summary backfill alignment

begin;

alter table if exists public.expense_documents
  add column if not exists estimated_expense_amount numeric(18,2) not null default 0;

with expense_calc as (
  select
    e.id,
    coalesce((
      select sum(
        case
          when trim(coalesce(item->>'total_price', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'total_price')::numeric
          else
            (
              case
                when trim(coalesce(item->>'quantity', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'quantity')::numeric
                else 0
              end
            ) * (
              case
                when trim(coalesce(item->>'unit_price', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'unit_price')::numeric
                else 0
              end
            )
        end
      )
      from jsonb_array_elements(coalesce(e.items, '[]'::jsonb)) as item
    ), 0)::numeric(18,2) as total_amount_calc,
    coalesce((
      select sum(
        abs(
          case
            when trim(coalesce(pay->>'amount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then (pay->>'amount')::numeric
            else 0
          end
        )
      )
      from jsonb_array_elements(coalesce(e.payments, '[]'::jsonb)) as pay
      where coalesce(nullif(lower(trim(coalesce(pay->>'status', ''))), ''), 'received') in ('received', 'paid', 'cleared')
    ), 0)::numeric(18,2) as paid_amount_calc
  from public.expense_documents e
)
update public.expense_documents e
set
  total_amount = c.total_amount_calc,
  paid_amount = c.paid_amount_calc,
  remaining_amount = (c.total_amount_calc - c.paid_amount_calc)::numeric(18,2),
  updated_at = now()
from expense_calc c
where e.id = c.id;

commit;
