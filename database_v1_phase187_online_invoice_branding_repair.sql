-- Phase 187: repair online invoice branding source

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

  WITH company_row AS (
    SELECT COALESCE(to_jsonb(cs.*), '{}'::jsonb) AS payload
    FROM public.company_settings cs
    WHERE cs.org_id = v_org_id
    ORDER BY cs.updated_at DESC NULLS LAST, cs.created_at DESC NULLS LAST
    LIMIT 1
  ),
  branding_row AS (
    SELECT COALESCE(to_jsonb(i.settings), '{}'::jsonb) AS payload
    FROM public.integration_settings i
    WHERE i.org_id = v_org_id
      AND i.connection_type = 'ui_theme'
      AND COALESCE(i.provider, '') = 'branding'
      AND i.is_active = TRUE
    ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'company_settings', COALESCE((SELECT payload FROM company_row), '{}'::jsonb),
    'branding_settings', COALESCE((SELECT payload FROM branding_row), '{}'::jsonb)
  )
  INTO v_branding;

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
