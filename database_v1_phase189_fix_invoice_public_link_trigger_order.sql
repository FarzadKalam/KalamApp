-- Phase 189: Fix invoice public_link trigger ordering
-- Problem:
--   Two BEFORE INSERT triggers on invoices/purchase_invoices fire in alphabetical order:
--     1. trg_invoices_public_link          ('p') → sets public_link from system_code
--     2. trg_invoices_system_code_autogen  ('s') → assigns system_code if NULL
--   When an invoice is inserted WITHOUT system_code (e.g. from workflow actions),
--   trigger 1 fires first and sets public_link = NULL, THEN trigger 2 assigns system_code.
--   Result: system_code is set but public_link remains NULL.
--
-- Fix:
--   Rename trg_invoices_public_link → trg_invoices_zz_public_link (and same for
--   purchase_invoices) so it fires AFTER trg_invoices_system_code_autogen alphabetically.
--   Also backfill any existing rows that have system_code but NULL public_link.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. invoices: rename public_link trigger
-- ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_invoices_public_link ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoices_zz_public_link ON public.invoices;

CREATE TRIGGER trg_invoices_zz_public_link
  BEFORE INSERT OR UPDATE OF system_code ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_public_link();

-- ─────────────────────────────────────────────────────────────────
-- 2. purchase_invoices: rename public_link trigger
-- ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_purchase_invoices_public_link ON public.purchase_invoices;
DROP TRIGGER IF EXISTS trg_purchase_invoices_zz_public_link ON public.purchase_invoices;

CREATE TRIGGER trg_purchase_invoices_zz_public_link
  BEFORE INSERT OR UPDATE OF system_code ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_public_link();

-- ─────────────────────────────────────────────────────────────────
-- 3. Backfill: rows that have system_code but public_link is NULL
--    (rows inserted before this fix was deployed)
-- ─────────────────────────────────────────────────────────────────
UPDATE public.invoices
  SET public_link = '/i/' || system_code
  WHERE system_code IS NOT NULL
    AND (public_link IS NULL OR public_link = '');

UPDATE public.purchase_invoices
  SET public_link = '/i/' || system_code || '?t=p'
  WHERE system_code IS NOT NULL
    AND (public_link IS NULL OR public_link = '');

COMMIT;

NOTIFY pgrst, 'reload schema';
