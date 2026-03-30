# Database V1 Full

**Date:** 2026-02-25  
**SQL File:** `database_v1_full.sql`  
**Type:** Additive full schema (config-aligned)

## What this file covers

This migration creates/completes all current module tables and runtime support tables used by the app.

### Module tables (from `moduleRegistry.ts`)

1. `products`
2. `product_bundles`
3. `warehouses`
4. `shelves`
5. `stock_transfers`
6. `production_boms`
7. `production_orders`
8. `production_group_orders`
9. `customers`
10. `suppliers`
11. `invoices`
12. `purchase_invoices`
13. `projects`
14. `marketing_leads`
15. `process_templates`
16. `process_runs`
17. `tasks`
18. `calculation_formulas`

### Required support tables

1. `organizations`, `org_roles`, `profiles`
2. `company_settings`, `integration_settings`
3. `dynamic_options`, `saved_views`
4. `tags`, `record_tags`
5. `changelogs`, `notes`, `sidebar_unread`
6. `workflows`, `workflow_logs`
7. `product_inventory`, `product_images`
8. `production_lines`, `product_lines`, `bundle_items`
9. `process_template_stages`, `process_run_stages`
10. `project_members`
11. `module_relations`, `ai_record_contexts`

### Company branding fields

`company_settings` now stores branding identity directly:

1. `company_full_name` (full legal/org name)
2. `trade_name` (display/brand name)
3. `company_name_en` (English name)
4. `brand_palette_key` with allowed values:
   - `executive_indigo` (ایندیگو مدیریتی)
   - `corporate_blue` (آبی سازمانی)
   - `deep_ocean` (اقیانوس عمیق)
   - `ruby_red` (قرمز یاقوتی)
   - `amber_navy` (زرد و سورمه‌ای)

## Runtime compatibility included

1. `onConflict`-safe unique indexes for:
   - `integration_settings(connection_type)`
   - `product_inventory(product_id, shelf_id)`
   - `sidebar_unread(user_id, module_id, record_id, tab_key)`
2. FK paths used by nested selects in UI (profiles/roles, shelves/warehouses, inventory/shelves, etc.)
3. `create_process_run_from_template(...)` function
4. `updated_at` triggers for all key tables
5. RLS policies (org-aware for org-scoped tables)

## Apply order

For a fresh database:

1. Run `database_v1_full.sql` only.

For an existing database:

1. Take backup.
2. Run `database_v1_full.sql`.
3. Optionally validate `NOT VALID` constraints after data cleanup.
