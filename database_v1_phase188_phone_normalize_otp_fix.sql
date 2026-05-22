-- Phase 188: fix phone normalization + OTP hashing in invoice OTP functions
-- Problems fixed:
--   1. send/verify_invoice_confirm_otp did not normalize +98/98/9x prefix → phone_not_allowed
--   2. encode(digest(...)) from pgcrypto fails with SET search_path = public → otp_generation_failed
--      Fix: use built-in encode(sha256(... ::bytea), 'hex') (PostgreSQL 11+, no pgcrypto needed)

-- ── helper: full phone normalization (mirrors frontend normalizePhone) ─────────

CREATE OR REPLACE FUNCTION public._normalize_phone_for_match(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d LIKE '0098%'                      THEN '0' || substring(d FROM 5)
    WHEN length(d) = 12 AND d LIKE '98%'     THEN '0' || substring(d FROM 3)
    WHEN length(d) = 10 AND d LIKE '9%'      THEN '0' || d
    ELSE d
  END
  FROM (
    SELECT regexp_replace(
      translate(COALESCE(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'),
      '[^0-9]', '', 'g'
    ) AS d
  ) sub
$$;

-- ── send_invoice_confirm_otp ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_invoice_confirm_otp(
  p_system_code TEXT,
  p_module TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice_id UUID;
  v_status TEXT;
  v_otp_code TEXT;
  v_otp_hash TEXT;
  v_phone_allowed BOOLEAN := FALSE;
  v_phone_normalized TEXT := public._normalize_phone_for_match(p_phone);
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT
      i.id,
      i.status,
      (
        public._normalize_phone_for_match(c.mobile_1)       = v_phone_normalized
        OR public._normalize_phone_for_match(c.mobile_2)    = v_phone_normalized
        OR public._normalize_phone_for_match(c.assistant_phone) = v_phone_normalized
      )
    INTO v_invoice_id, v_status, v_phone_allowed
    FROM public.invoices i
    LEFT JOIN public.customers c ON c.id = i.customer_id AND c.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;
  ELSE
    SELECT
      i.id,
      i.status,
      (
        public._normalize_phone_for_match(s.mobile_1) = v_phone_normalized
        OR public._normalize_phone_for_match(s.mobile_2) = v_phone_normalized
      )
    INTO v_invoice_id, v_status, v_phone_allowed
    FROM public.purchase_invoices i
    LEFT JOIN public.suppliers s ON s.id = i.supplier_id AND s.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_status NOT IN ('created', 'proforma') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;
  IF COALESCE(v_phone_allowed, FALSE) = FALSE THEN
    RETURN jsonb_build_object('error', 'phone_not_allowed');
  END IF;

  v_otp_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  -- Use built-in sha256 (no pgcrypto required)
  v_otp_hash := encode(sha256(CAST(v_otp_code || v_phone_normalized AS bytea)), 'hex');

  IF p_module = 'invoices' THEN
    UPDATE public.invoices
    SET confirm_otp_hash = v_otp_hash,
        confirm_otp_expires_at = NOW() + INTERVAL '3 minutes'
    WHERE id = v_invoice_id AND org_id = v_org_id;
  ELSE
    UPDATE public.purchase_invoices
    SET confirm_otp_hash = v_otp_hash,
        confirm_otp_expires_at = NOW() + INTERVAL '3 minutes'
    WHERE id = v_invoice_id AND org_id = v_org_id;
  END IF;

  RETURN jsonb_build_object('otp_code', v_otp_code, 'invoice_id', v_invoice_id, 'org_id', v_org_id);
END;
$$;

-- ── verify_invoice_confirm_otp ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_invoice_confirm_otp(
  p_system_code TEXT,
  p_module TEXT,
  p_phone TEXT,
  p_otp_code TEXT,
  p_confirmer_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice_id UUID;
  v_status TEXT;
  v_stored_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_expected_hash TEXT;
  v_phone_normalized TEXT := public._normalize_phone_for_match(p_phone);
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT id, status, confirm_otp_hash, confirm_otp_expires_at
    INTO v_invoice_id, v_status, v_stored_hash, v_expires_at
    FROM public.invoices
    WHERE org_id = v_org_id AND system_code = p_system_code
    LIMIT 1;
  ELSE
    SELECT id, status, confirm_otp_hash, confirm_otp_expires_at
    INTO v_invoice_id, v_status, v_stored_hash, v_expires_at
    FROM public.purchase_invoices
    WHERE org_id = v_org_id AND system_code = p_system_code
    LIMIT 1;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_status NOT IN ('created', 'proforma') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;
  IF v_stored_hash IS NULL OR v_expires_at IS NULL THEN
    RETURN jsonb_build_object('error', 'otp_not_sent');
  END IF;
  IF NOW() > v_expires_at THEN
    RETURN jsonb_build_object('error', 'otp_expired');
  END IF;

  -- Use same built-in sha256 as send function
  v_expected_hash := encode(sha256(CAST(p_otp_code || v_phone_normalized AS bytea)), 'hex');
  IF v_stored_hash <> v_expected_hash THEN
    RETURN jsonb_build_object('error', 'otp_invalid');
  END IF;

  IF p_module = 'invoices' THEN
    UPDATE public.invoices
    SET status = 'confirmed',
        customer_confirmed_at = NOW(),
        customer_confirmer_name = p_confirmer_name,
        confirm_otp_hash = NULL,
        confirm_otp_expires_at = NULL
    WHERE id = v_invoice_id AND org_id = v_org_id;
  ELSE
    UPDATE public.purchase_invoices
    SET status = 'confirmed',
        supplier_confirmed_at = NOW(),
        supplier_confirmer_name = p_confirmer_name,
        confirm_otp_hash = NULL,
        confirm_otp_expires_at = NULL
    WHERE id = v_invoice_id AND org_id = v_org_id;
  END IF;

  INSERT INTO public.notes (org_id, module_id, record_id, content, author_name, is_public, metadata)
  VALUES (
    v_org_id,
    p_module,
    v_invoice_id::text,
    'فاکتور توسط ' || p_confirmer_name || ' تایید شد.',
    p_confirmer_name,
    TRUE,
    jsonb_build_object(
      'source', 'online_invoice_confirm',
      'phone', v_phone_normalized,
      'system_code', p_system_code
    )
  );

  RETURN jsonb_build_object('success', TRUE, 'confirmed_at', NOW());
END;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public._normalize_phone_for_match(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_invoice_confirm_otp(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_invoice_confirm_otp(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
