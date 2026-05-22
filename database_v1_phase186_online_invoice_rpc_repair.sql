-- Phase 186: repair online invoice public RPCs for JSONB invoice schema

CREATE OR REPLACE FUNCTION public.get_public_invoice(
  p_system_code TEXT,
  p_module TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice_id UUID;
  v_invoice JSONB;
  v_items JSONB := '[]'::jsonb;
  v_payments JSONB := '[]'::jsonb;
  v_notes JSONB := '[]'::jsonb;
  v_branding JSONB := '{}'::jsonb;
  v_online_cfg JSONB := '{}'::jsonb;
BEGIN
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_module = 'invoices' THEN
    SELECT
      i.id,
      jsonb_build_object(
        'id', i.id,
        'system_code', i.system_code,
        'public_link', i.public_link,
        'name', i.name,
        'status', i.status,
        'invoice_date', i.invoice_date,
        'description', i.description,
        'customer_id', i.customer_id,
        'customer_name', c.full_name,
        'customer_mobile', c.mobile_1,
        'customer_mobile2', c.mobile_2,
        'customer_assistant_mobile', c.assistant_phone,
        'assignee_id', i.assignee_id,
        'sale_source', i.sale_source,
        'province', i.province,
        'city', i.city,
        'postal_code', i.postal_code,
        'address', i.address,
        'total_invoice_amount', i.total_invoice_amount,
        'total_received_amount', i.total_received_amount,
        'remaining_balance', i.remaining_balance,
        'customer_confirmed_at', i.customer_confirmed_at,
        'customer_confirmer_name', i.customer_confirmer_name,
        'org_id', i.org_id
      )
    INTO v_invoice_id, v_invoice
    FROM public.invoices i
    LEFT JOIN public.customers c ON c.id = i.customer_id AND c.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(
          item_rows.item || jsonb_build_object(
            'product_name',
            COALESCE(
              p.name,
              NULLIF(item_rows.item->>'product_name', ''),
              NULLIF(item_rows.item->>'name', '')
            )
          )
        )
        ORDER BY
          CASE
            WHEN COALESCE(item_rows.item->>'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (item_rows.item->>'order_index')::numeric
            ELSE item_rows.ordinality::numeric
          END
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM public.invoices i
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(i."invoiceItems", '[]'::jsonb))
      WITH ORDINALITY AS item_rows(item, ordinality) ON TRUE
    LEFT JOIN public.products p
      ON p.org_id = i.org_id
     AND p.id::text = NULLIF(item_rows.item->>'product_id', '')
    WHERE i.id = v_invoice_id AND i.org_id = v_org_id;

    SELECT COALESCE(i.payments, '[]'::jsonb)
    INTO v_payments
    FROM public.invoices i
    WHERE i.id = v_invoice_id AND i.org_id = v_org_id
    LIMIT 1;
  ELSE
    SELECT
      i.id,
      jsonb_build_object(
        'id', i.id,
        'system_code', i.system_code,
        'public_link', i.public_link,
        'name', i.name,
        'status', i.status,
        'invoice_date', i.invoice_date,
        'description', i.description,
        'supplier_id', i.supplier_id,
        'supplier_name', s.business_name,
        'supplier_mobile', s.mobile_1,
        'supplier_mobile2', s.mobile_2,
        'assignee_id', i.assignee_id,
        'purchase_source', i.purchase_source,
        'total_invoice_amount', i.total_invoice_amount,
        'total_received_amount', i.total_received_amount,
        'remaining_balance', i.remaining_balance,
        'supplier_confirmed_at', i.supplier_confirmed_at,
        'supplier_confirmer_name', i.supplier_confirmer_name,
        'org_id', i.org_id
      )
    INTO v_invoice_id, v_invoice
    FROM public.purchase_invoices i
    LEFT JOIN public.suppliers s ON s.id = i.supplier_id AND s.org_id = i.org_id
    WHERE i.org_id = v_org_id AND i.system_code = p_system_code
    LIMIT 1;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(
          item_rows.item || jsonb_build_object(
            'product_name',
            COALESCE(
              p.name,
              NULLIF(item_rows.item->>'product_name', ''),
              NULLIF(item_rows.item->>'name', '')
            )
          )
        )
        ORDER BY
          CASE
            WHEN COALESCE(item_rows.item->>'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (item_rows.item->>'order_index')::numeric
            ELSE item_rows.ordinality::numeric
          END
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM public.purchase_invoices i
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(i."invoiceItems", '[]'::jsonb))
      WITH ORDINALITY AS item_rows(item, ordinality) ON TRUE
    LEFT JOIN public.products p
      ON p.org_id = i.org_id
     AND p.id::text = NULLIF(item_rows.item->>'product_id', '')
    WHERE i.id = v_invoice_id AND i.org_id = v_org_id;

    SELECT COALESCE(i.payments, '[]'::jsonb)
    INTO v_payments
    FROM public.purchase_invoices i
    WHERE i.id = v_invoice_id AND i.org_id = v_org_id
    LIMIT 1;
  END IF;

  IF v_invoice IS NULL OR v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'content', n.content,
        'author_name', n.author_name,
        'created_at', n.created_at,
        'reply_to', n.reply_to,
        'metadata', n.metadata
      )
      ORDER BY n.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_notes
  FROM public.notes n
  WHERE n.org_id = v_org_id
    AND n.module_id = p_module
    AND n.record_id = v_invoice_id::text
    AND n.is_public = TRUE;

  SELECT COALESCE(
    jsonb_build_object(
      'branding_settings', s.branding_settings,
      'company_settings', s.company_settings
    ),
    '{}'::jsonb
  )
  INTO v_branding
  FROM public.saas_org_settings s
  WHERE s.org_id = v_org_id
  LIMIT 1;

  SELECT COALESCE(s.settings->'modules'->p_module->'onlineInvoice', '{}'::jsonb)
  INTO v_online_cfg
  FROM public.integration_settings s
  WHERE s.org_id = v_org_id
    AND s.connection_type = 'module_settings'
    AND s.is_active = TRUE
  ORDER BY s.updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'invoice', v_invoice,
    'items', v_items,
    'payments', v_payments,
    'notes', v_notes,
    'branding', v_branding,
    'online_config', v_online_cfg,
    'org_id', v_org_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_public_invoice_note(
  p_system_code TEXT,
  p_module TEXT,
  p_content TEXT,
  p_author_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice_id UUID;
  v_assignee_id UUID;
  v_note_id UUID;
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
    v_invoice_id::text,
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
  v_phone_normalized TEXT := regexp_replace(translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g');
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
        regexp_replace(translate(COALESCE(c.mobile_1, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') = v_phone_normalized
        OR regexp_replace(translate(COALESCE(c.mobile_2, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') = v_phone_normalized
        OR regexp_replace(translate(COALESCE(c.assistant_phone, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') = v_phone_normalized
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
        regexp_replace(translate(COALESCE(s.mobile_1, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') = v_phone_normalized
        OR regexp_replace(translate(COALESCE(s.mobile_2, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') = v_phone_normalized
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
  v_otp_hash := encode(digest(v_otp_code || v_phone_normalized, 'sha256'), 'hex');

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
  v_phone_normalized TEXT := regexp_replace(translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g');
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

  v_expected_hash := encode(digest(p_otp_code || v_phone_normalized, 'sha256'), 'hex');
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
    jsonb_build_object('source', 'online_invoice_confirm', 'phone', v_phone_normalized, 'system_code', p_system_code)
  );

  RETURN jsonb_build_object('success', TRUE, 'confirmed_at', NOW());
END;
$$;
