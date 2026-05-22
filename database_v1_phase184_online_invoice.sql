-- Phase 184: Online Invoice
-- Adds customer/supplier confirmation tracking, public notes flag, and public RPC for invoice viewing

-- ─────────────────────────────────────────────
-- 1. Confirmation fields on invoices
-- ─────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_confirmer_name  TEXT,
  ADD COLUMN IF NOT EXISTS confirm_otp_hash         TEXT,
  ADD COLUMN IF NOT EXISTS confirm_otp_expires_at   TIMESTAMPTZ;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supplier_confirmer_name  TEXT,
  ADD COLUMN IF NOT EXISTS confirm_otp_hash         TEXT,
  ADD COLUMN IF NOT EXISTS confirm_otp_expires_at   TIMESTAMPTZ;

-- ─────────────────────────────────────────────
-- 2. is_public flag on notes
-- ─────────────────────────────────────────────
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS notes_is_public_idx ON public.notes (org_id, module_id, record_id, is_public);

-- ─────────────────────────────────────────────
-- 3. public_link: computed column (path only — frontend prepends origin)
-- ─────────────────────────────────────────────
-- Cannot use GENERATED ALWAYS AS with TEXT in older PG without immutable functions,
-- so we use a simple nullable column and populate via trigger.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_link TEXT;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS public_link TEXT;

-- Back-fill existing rows
UPDATE public.invoices SET public_link = '/i/' || system_code WHERE system_code IS NOT NULL AND public_link IS NULL;
UPDATE public.purchase_invoices SET public_link = '/i/' || system_code || '?t=p' WHERE system_code IS NOT NULL AND public_link IS NULL;

-- Trigger to keep public_link in sync when system_code changes
CREATE OR REPLACE FUNCTION public.sync_invoice_public_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    NEW.public_link := CASE WHEN NEW.system_code IS NOT NULL THEN '/i/' || NEW.system_code ELSE NULL END;
  ELSE
    NEW.public_link := CASE WHEN NEW.system_code IS NOT NULL THEN '/i/' || NEW.system_code || '?t=p' ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_public_link ON public.invoices;
CREATE TRIGGER trg_invoices_public_link
  BEFORE INSERT OR UPDATE OF system_code ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_public_link();

DROP TRIGGER IF EXISTS trg_purchase_invoices_public_link ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_public_link
  BEFORE INSERT OR UPDATE OF system_code ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_public_link();

-- ─────────────────────────────────────────────
-- 4. Enable pgcrypto for sha256 OTP hashing
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- Helper: resolve org_id from request host header
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._resolve_org_for_public_invoice(
  p_system_code TEXT,
  p_module      TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_host   TEXT;
BEGIN
  BEGIN
    v_host := current_setting('request.headers', true)::jsonb->>'host';
  EXCEPTION WHEN OTHERS THEN
    v_host := NULL;
  END;

  IF v_host IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM public.saas_org_settings
    WHERE resolved_host = v_host
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    IF p_module = 'invoices' THEN
      SELECT org_id INTO v_org_id FROM public.invoices WHERE system_code = p_system_code LIMIT 1;
    ELSE
      SELECT org_id INTO v_org_id FROM public.purchase_invoices WHERE system_code = p_system_code LIMIT 1;
    END IF;
  END IF;

  RETURN v_org_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 4a. get_public_invoice: fetch invoice + items + payments + public notes + branding + online config
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_invoice(
  p_system_code TEXT,
  p_module       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       UUID;
  v_invoice      JSONB;
  v_items        JSONB;
  v_payments     JSONB;
  v_notes        JSONB;
  v_branding     JSONB;
  v_settings     JSONB;
  v_online_cfg   JSONB;
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Fetch invoice with joined customer/supplier name
  IF p_module = 'invoices' THEN
    SELECT jsonb_build_object(
      'id',                     i.id,
      'system_code',            i.system_code,
      'name',                   i.name,
      'status',                 i.status,
      'invoice_date',           i.invoice_date,
      'description',            i.description,
      'customer_id',            i.customer_id,
      'customer_name',          c.full_name,
      'customer_mobile',        c.mobile_1,
      'customer_mobile2',       c.mobile_2,
      'customer_assistant_mobile', c.assistant_phone,
      'assignee_id',            i.assignee_id,
      'total_invoice_amount',   i.total_invoice_amount,
      'total_received_amount',  i.total_received_amount,
      'remaining_balance',      i.remaining_balance,
      'customer_confirmed_at',  i.customer_confirmed_at,
      'customer_confirmer_name',i.customer_confirmer_name,
      'org_id',                 i.org_id
    ) INTO v_invoice
    FROM public.invoices i
    LEFT JOIN public.customers c ON c.id = i.customer_id AND c.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;
  ELSE
    SELECT jsonb_build_object(
      'id',                       i.id,
      'system_code',              i.system_code,
      'name',                     i.name,
      'status',                   i.status,
      'invoice_date',             i.invoice_date,
      'description',              i.description,
      'supplier_id',              i.supplier_id,
      'supplier_name',            s.business_name,
      'supplier_mobile',          s.mobile_1,
      'supplier_mobile2',         s.mobile_2,
      'assignee_id',              i.assignee_id,
      'total_invoice_amount',     i.total_invoice_amount,
      'total_received_amount',    i.total_received_amount,
      'remaining_balance',        i.remaining_balance,
      'supplier_confirmed_at',    i.supplier_confirmed_at,
      'supplier_confirmer_name',  i.supplier_confirmer_name,
      'org_id',                   i.org_id
    ) INTO v_invoice
    FROM public.purchase_invoices i
    LEFT JOIN public.suppliers s ON s.id = i.supplier_id AND s.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;
  END IF;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Fetch invoice items with product name resolved
  IF p_module = 'invoices' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           ii.id,
        'product_id',   ii.product_id,
        'product_name', p.name,
        'quantity',     ii.quantity,
        'main_unit',    ii.main_unit,
        'unit_price',   ii.unit_price,
        'discount',     ii.discount,
        'vat',          ii.vat,
        'total_price',  ii.total_price,
        'description',  ii.description,
        'length',       ii.length,
        'width',        ii.width,
        'start_date',   ii.start_date,
        'end_date',     ii.end_date,
        'order_index',  ii.order_index
      ) ORDER BY ii.order_index ASC NULLS LAST
    ) INTO v_items
    FROM public.invoice_items ii
    LEFT JOIN public.products p ON p.id = ii.product_id AND p.org_id = v_org_id
    WHERE ii.invoice_id = (v_invoice->>'id')::UUID;
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           ii.id,
        'product_id',   ii.product_id,
        'product_name', p.name,
        'quantity',     ii.quantity,
        'main_unit',    ii.main_unit,
        'unit_price',   ii.unit_price,
        'discount',     ii.discount,
        'vat',          ii.vat,
        'total_price',  ii.total_price,
        'description',  ii.description,
        'length',       ii.length,
        'width',        ii.width,
        'start_date',   ii.start_date,
        'end_date',     ii.end_date,
        'order_index',  ii.order_index
      ) ORDER BY ii.order_index ASC NULLS LAST
    ) INTO v_items
    FROM public.purchase_invoice_items ii
    LEFT JOIN public.products p ON p.id = ii.product_id AND p.org_id = v_org_id
    WHERE ii.invoice_id = (v_invoice->>'id')::UUID;
  END IF;

  -- Fetch payment rows
  IF p_module = 'invoices' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           ip.id,
        'date',         ip.date,
        'amount',       ip.amount,
        'payment_type', ip.payment_type,
        'description',  ip.description,
        'status',       ip.status
      ) ORDER BY ip.date ASC NULLS LAST
    ) INTO v_payments
    FROM public.invoice_payments ip
    WHERE ip.invoice_id = (v_invoice->>'id')::UUID;
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           ip.id,
        'date',         ip.date,
        'amount',       ip.amount,
        'payment_type', ip.payment_type,
        'description',  ip.description,
        'status',       ip.status
      ) ORDER BY ip.date ASC NULLS LAST
    ) INTO v_payments
    FROM public.purchase_invoice_payments ip
    WHERE ip.invoice_id = (v_invoice->>'id')::UUID;
  END IF;

  -- Fetch public notes
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          n.id,
      'content',     n.content,
      'author_name', n.author_name,
      'created_at',  n.created_at,
      'reply_to',    n.reply_to,
      'metadata',    n.metadata
    ) ORDER BY n.created_at ASC
  ) INTO v_notes
  FROM public.notes n
  WHERE n.org_id = v_org_id
    AND n.module_id = p_module
    AND n.record_id = (v_invoice->>'id')::UUID
    AND n.is_public = TRUE;

  -- Fetch branding
  SELECT jsonb_build_object(
    'branding_settings', s.branding_settings,
    'company_settings',  s.company_settings
  ) INTO v_branding
  FROM public.saas_org_settings s
  WHERE s.org_id = v_org_id
  LIMIT 1;

  -- Fetch online invoice settings from integration_settings (single-row store)
  -- Structure: settings -> modules -> {invoices|purchase_invoices} -> onlineInvoice
  SELECT (s.settings->'modules'->p_module->'onlineInvoice') INTO v_online_cfg
  FROM public.integration_settings s
  WHERE s.org_id = v_org_id
    AND s.connection_type = 'module_settings'
    AND s.is_active = TRUE
  ORDER BY s.updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'invoice',        v_invoice,
    'items',          COALESCE(v_items, '[]'::jsonb),
    'payments',       COALESCE(v_payments, '[]'::jsonb),
    'notes',          COALESCE(v_notes, '[]'::jsonb),
    'branding',       COALESCE(v_branding, '{}'::jsonb),
    'online_config',  COALESCE(v_online_cfg, '{}'::jsonb),
    'org_id',         v_org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice(TEXT, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 4b. insert_public_invoice_note
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_public_invoice_note(
  p_system_code   TEXT,
  p_module        TEXT,
  p_content       TEXT,
  p_author_name   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       UUID;
  v_invoice_id   UUID;
  v_assignee_id  UUID;
  v_note_id      UUID;
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT id, assignee_id INTO v_invoice_id, v_assignee_id
    FROM public.invoices
    WHERE org_id = v_org_id AND system_code = p_system_code
    LIMIT 1;
  ELSE
    SELECT id, assignee_id INTO v_invoice_id, v_assignee_id
    FROM public.purchase_invoices
    WHERE org_id = v_org_id AND system_code = p_system_code
    LIMIT 1;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  INSERT INTO public.notes (
    org_id,
    module_id,
    record_id,
    content,
    author_name,
    is_public,
    mention_user_ids,
    metadata
  )
  VALUES (
    v_org_id,
    p_module,
    v_invoice_id,
    p_content,
    p_author_name,
    TRUE,
    CASE WHEN v_assignee_id IS NOT NULL THEN ARRAY[v_assignee_id] ELSE ARRAY[]::UUID[] END,
    jsonb_build_object('source', 'online_invoice', 'system_code', p_system_code)
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_public_invoice_note(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 5. OTP send/verify for invoice confirmation
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_invoice_confirm_otp(
  p_system_code TEXT,
  p_module      TEXT,
  p_phone       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      UUID;
  v_invoice_id  UUID;
  v_status      TEXT;
  v_otp_code    TEXT;
  v_otp_hash    TEXT;
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT id, status INTO v_invoice_id, v_status
    FROM public.invoices WHERE org_id = v_org_id AND system_code = p_system_code LIMIT 1;
  ELSE
    SELECT id, status INTO v_invoice_id, v_status
    FROM public.purchase_invoices WHERE org_id = v_org_id AND system_code = p_system_code LIMIT 1;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_status NOT IN ('created', 'proforma') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  v_otp_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_otp_hash := encode(digest(v_otp_code || p_phone, 'sha256'), 'hex');

  IF p_module = 'invoices' THEN
    UPDATE public.invoices
    SET confirm_otp_hash = v_otp_hash, confirm_otp_expires_at = NOW() + INTERVAL '3 minutes'
    WHERE id = v_invoice_id AND org_id = v_org_id;
  ELSE
    UPDATE public.purchase_invoices
    SET confirm_otp_hash = v_otp_hash, confirm_otp_expires_at = NOW() + INTERVAL '3 minutes'
    WHERE id = v_invoice_id AND org_id = v_org_id;
  END IF;

  RETURN jsonb_build_object('otp_code', v_otp_code, 'invoice_id', v_invoice_id, 'org_id', v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_invoice_confirm_otp(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- 5b. verify_invoice_confirm_otp
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_invoice_confirm_otp(
  p_system_code    TEXT,
  p_module         TEXT,
  p_phone          TEXT,
  p_otp_code       TEXT,
  p_confirmer_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id        UUID;
  v_invoice_id    UUID;
  v_status        TEXT;
  v_stored_hash   TEXT;
  v_expires_at    TIMESTAMPTZ;
  v_expected_hash TEXT;
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT id, status, confirm_otp_hash, confirm_otp_expires_at
    INTO v_invoice_id, v_status, v_stored_hash, v_expires_at
    FROM public.invoices WHERE org_id = v_org_id AND system_code = p_system_code LIMIT 1;
  ELSE
    SELECT id, status, confirm_otp_hash, confirm_otp_expires_at
    INTO v_invoice_id, v_status, v_stored_hash, v_expires_at
    FROM public.purchase_invoices WHERE org_id = v_org_id AND system_code = p_system_code LIMIT 1;
  END IF;

  IF v_invoice_id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF v_status NOT IN ('created', 'proforma') THEN RETURN jsonb_build_object('error', 'invalid_status'); END IF;
  IF v_stored_hash IS NULL OR v_expires_at IS NULL THEN RETURN jsonb_build_object('error', 'otp_not_sent'); END IF;
  IF NOW() > v_expires_at THEN RETURN jsonb_build_object('error', 'otp_expired'); END IF;

  v_expected_hash := encode(digest(p_otp_code || p_phone, 'sha256'), 'hex');
  IF v_stored_hash <> v_expected_hash THEN RETURN jsonb_build_object('error', 'otp_invalid'); END IF;

  IF p_module = 'invoices' THEN
    UPDATE public.invoices
    SET status = 'confirmed',
        customer_confirmed_at   = NOW(),
        customer_confirmer_name = p_confirmer_name,
        confirm_otp_hash        = NULL,
        confirm_otp_expires_at  = NULL
    WHERE id = v_invoice_id AND org_id = v_org_id;
  ELSE
    UPDATE public.purchase_invoices
    SET status = 'confirmed',
        supplier_confirmed_at    = NOW(),
        supplier_confirmer_name  = p_confirmer_name,
        confirm_otp_hash         = NULL,
        confirm_otp_expires_at   = NULL
    WHERE id = v_invoice_id AND org_id = v_org_id;
  END IF;

  INSERT INTO public.notes (org_id, module_id, record_id, content, author_name, is_public, metadata)
  VALUES (
    v_org_id, p_module, v_invoice_id,
    'فاکتور توسط ' || p_confirmer_name || ' تایید شد.',
    p_confirmer_name, TRUE,
    jsonb_build_object('source', 'online_invoice_confirm', 'phone', p_phone, 'system_code', p_system_code)
  );

  RETURN jsonb_build_object('success', TRUE, 'confirmed_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_invoice_confirm_otp(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public._resolve_org_for_public_invoice(TEXT, TEXT) TO anon, authenticated;
