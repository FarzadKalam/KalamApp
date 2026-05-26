-- phase 164: جدول تنظیمات پیش‌فرض بات برای هر مشتری/تامین‌کننده
-- ذخیره پلتفرم پیش‌فرض و رفتار fallback برای ارسال پیام بات

CREATE TABLE IF NOT EXISTS public.counterparty_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  default_channel text NOT NULL DEFAULT 'rubika' CHECK (default_channel IN ('rubika', 'telegram', 'bale')),
  fallback_to_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT counterparty_bot_config_one_target CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL)
    OR (supplier_id IS NOT NULL AND customer_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS counterparty_bot_config_customer_uq
  ON public.counterparty_bot_config (org_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS counterparty_bot_config_supplier_uq
  ON public.counterparty_bot_config (org_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS counterparty_bot_config_org_idx ON public.counterparty_bot_config (org_id);

-- RLS: fail-closed
ALTER TABLE public.counterparty_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counterparty_bot_config_tenant_select"
  ON public.counterparty_bot_config FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY "counterparty_bot_config_tenant_insert"
  ON public.counterparty_bot_config FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "counterparty_bot_config_tenant_update"
  ON public.counterparty_bot_config FOR UPDATE
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "counterparty_bot_config_tenant_delete"
  ON public.counterparty_bot_config FOR DELETE
  USING (org_id = public.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.counterparty_bot_config TO authenticated;

COMMENT ON TABLE public.counterparty_bot_config IS 'تنظیمات پیش‌فرض بات برای هر مشتری یا تامین‌کننده: پلتفرم پیش‌فرض و رفتار fallback';
COMMENT ON COLUMN public.counterparty_bot_config.default_channel IS 'پلتفرم پیش‌فرض برای ارسال پیام: rubika, telegram, bale';
COMMENT ON COLUMN public.counterparty_bot_config.fallback_to_active IS 'اگر true باشد و پلتفرم پیش‌فرض قطع شود، از اولین پلتفرم فعال استفاده شود';

-- trigger برای updated_at
CREATE OR REPLACE FUNCTION public.set_counterparty_bot_config_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_counterparty_bot_config_updated_at
  BEFORE UPDATE ON public.counterparty_bot_config
  FOR EACH ROW EXECUTE FUNCTION public.set_counterparty_bot_config_updated_at();
