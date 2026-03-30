# Customer Portal + Bots Roadmap

Last updated: 2026-03-21

## Goal

Build a customer-facing portal and organization-specific notification channels in a way that works for:

- current single-business deployment
- future multi-tenant/subscription model
- conservative additive migrations on self-hosted installs

## Confirmed Decisions

- Bot settings stay in `integration_settings` and must remain `org`-specific.
- Telegram, Bale, and Rubika are phase-1 outbound notification channels, not full chat channels.
- Customer portal auth/access must stay separate from internal `profiles` and `org_roles`.
- Customer portal permissions should use `portal role + customer override + row scope`.
- Current `notes` are an internal collaboration tool and should not become the main customer ticket engine.
- `record_files` should be reused later for portal/ticket attachments.
- Subdomain-based portal must be supported later, but initial implementation can be path-based.

## Delivery Phases

## Phase 1 - Foundation

- Extend `integration_settings` for:
  - `telegram_bot`
  - `bale_bot`
  - `rubika_bot`
  - `portal`
- Add `portal_roles` table per organization.
- Add customer portal fields to `customers`.
- Add a generic outbound message log table for SMS/bot notifications.
- Keep changes additive and backward-compatible.

## Phase 2 - Outbound Messaging UI

- Add bot settings UI inside `Settings > Connections`.
- Add send-message action from customer record.
- Add workflow action for channel notification.
- Log every outbound delivery attempt.

## Phase 3 - Customer Portal MVP

- Add separate `/portal` app shell and dashboard.
- Add portal login flow separate from internal admin users.
- Start read-only access for:
  - invoices
  - projects/orders
  - shared files
- Enforce row-level scoping to the current customer only.

## Phase 4 - Tickets / Messaging

- Add dedicated ticket tables.
- Add ticket messages with attachments.
- Add customer/internal visibility separation.
- Add bot/SMS notifications for ticket events.

## Phase 5 - SaaS / Subdomain Readiness

- Add organization portal slug/subdomain resolution.
- Add organization onboarding flow.
- Add billing/subscription boundaries.
- Move portal routing from path-based to subdomain-aware.

## Data Model Direction

### Portal Roles

Use a separate portal permission model. Do not reuse internal `org_roles` directly.

Suggested shape:

- `portal_roles.permissions.modules`
- `portal_roles.permissions.dashboard`
- `customers.portal_permissions_override`

### Customer Row Scope

Portal permissions must be combined with scoped data access, for example:

- customer sees only own invoices
- customer sees only own projects/orders
- customer sees only own files

### Notification Settings

Each organization owns its own provider settings through `integration_settings`.

Suggested `portal` settings payload later:

```json
{
  "portal_title": "",
  "portal_slug": "",
  "login_mode": "otp",
  "allow_file_download": true
}
```

Suggested bot settings payload later:

```json
{
  "bot_token": "",
  "api_base_url": "",
  "webhook_secret": "",
  "is_sandbox": false
}
```

## Risks To Watch

- Reusing internal permissions directly for customers will mix admin and portal concerns.
- Turning `notes` into customer tickets will create visibility and lifecycle issues.
- Building realtime chat too early will add operational complexity before the portal model stabilizes.
- Missing outbound delivery logs will make bot troubleshooting hard in production.
- Portal access without row-scoping will create data leakage risk.

## Immediate Next Build Steps

1. Finish schema foundation migration.
2. Extend `ConnectionsTab` to support bot and portal settings.
3. Add reusable outbound channel service beside SMS.
4. Add customer-side portal fields to customer UI.
5. Build read-only portal shell.
