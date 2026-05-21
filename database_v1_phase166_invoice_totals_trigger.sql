-- Phase 166: Auto-recalculate invoice financial totals via trigger
-- Problem: total_invoice_amount, total_received_amount, remaining_balance columns
-- were stored with DEFAULT 0 and only updated when user edited items/payments
-- through EditableTable. Invoices created via import, API, or old workflows
-- had 0 in these columns, causing ModuleList to show 0 while ModuleShow
-- showed correct values (calculated live from JSONB arrays).
-- Solution: BEFORE UPDATE trigger that recalculates on any change to invoiceItems or payments.

-- ─── Helper function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  v_total   numeric(18,2) := 0;
  v_paid    numeric(18,2) := 0;
  v_item    jsonb;
  v_amount  numeric;
  v_status  text;
BEGIN
  -- Sum total_price from invoiceItems
  FOR v_item IN SELECT jsonb_array_elements(COALESCE(NEW."invoiceItems", '[]'::jsonb)) LOOP
    BEGIN
      v_amount := (v_item->>'total_price')::numeric;
      IF v_amount IS NOT NULL THEN
        v_total := v_total + v_amount;
      END IF;
    EXCEPTION WHEN others THEN
      NULL; -- skip malformed rows
    END;
  END LOOP;

  -- Sum amount from payments (only included statuses)
  -- Logic mirrors EditableTable.tsx: PAYMENT_INCLUDED_STATUSES = received|paid|approved|cleared
  -- If a payment row has no status field, it is included (legacy data).
  -- If status is present but empty/null, it is included.
  -- If status is present and not in the set, it is excluded.
  FOR v_item IN SELECT jsonb_array_elements(COALESCE(NEW.payments, '[]'::jsonb)) LOOP
    BEGIN
      v_status := lower(trim(coalesce(v_item->>'status', '')));
      IF (v_item ? 'status')
         AND v_status <> ''
         AND v_status NOT IN ('received', 'paid', 'approved', 'cleared')
      THEN
        CONTINUE; -- excluded status
      END IF;
      v_amount := abs((v_item->>'amount')::numeric);
      IF v_amount IS NOT NULL THEN
        v_paid := v_paid + v_amount;
      END IF;
    EXCEPTION WHEN others THEN
      NULL; -- skip malformed rows
    END;
  END LOOP;

  NEW.total_invoice_amount  := v_total;
  NEW.total_received_amount := v_paid;
  NEW.remaining_balance     := v_total - v_paid;

  RETURN NEW;
END;
$$;

-- ─── Trigger on invoices ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_invoices_recalc_totals ON public.invoices;

CREATE TRIGGER trg_invoices_recalc_totals
  BEFORE INSERT OR UPDATE OF "invoiceItems", payments
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_invoice_totals();

-- ─── Trigger on purchase_invoices ───────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_purchase_invoices_recalc_totals ON public.purchase_invoices;

CREATE TRIGGER trg_purchase_invoices_recalc_totals
  BEFORE INSERT OR UPDATE OF "invoiceItems", payments
  ON public.purchase_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_invoice_totals();

-- ─── Backfill existing records ──────────────────────────────────────────────
-- Force-trigger the function for all rows that currently have 0 totals
-- but have non-empty invoiceItems (meaning data exists but totals weren't set).

UPDATE public.invoices
SET "invoiceItems" = "invoiceItems"   -- no-op column touch fires the trigger
WHERE jsonb_array_length(COALESCE("invoiceItems", '[]'::jsonb)) > 0
  AND total_invoice_amount = 0;

UPDATE public.purchase_invoices
SET "invoiceItems" = "invoiceItems"
WHERE jsonb_array_length(COALESCE("invoiceItems", '[]'::jsonb)) > 0
  AND total_invoice_amount = 0;

-- Also fix invoices with items already OK but stale payment totals
UPDATE public.invoices
SET payments = payments
WHERE jsonb_array_length(COALESCE(payments, '[]'::jsonb)) > 0
  AND total_received_amount = 0
  AND total_invoice_amount > 0;

UPDATE public.purchase_invoices
SET payments = payments
WHERE jsonb_array_length(COALESCE(payments, '[]'::jsonb)) > 0
  AND total_received_amount = 0
  AND total_invoice_amount > 0;
