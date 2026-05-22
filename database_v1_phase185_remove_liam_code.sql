-- Phase 185: remove liam_code from invoices

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS liam_code;
