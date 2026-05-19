# Rubika Runtime Audit

Use this checklist after running [`database_v1_phase158_runtime_schema_repair.sql`](/abs/path/not/available).

## Goal

Separate database/schema problems from Rubika runtime/config problems.

## Required database/config checks

Run these checks in SQL or Supabase Table Editor:

```sql
select id, org_id, connection_type, provider, is_active, updated_at
from public.integration_settings
where connection_type in ('rubika_bot', 'rubika')
order by is_active desc, updated_at desc nulls last;
```

Expected:

- At least one active `rubika_bot` or legacy `rubika` row
- The row used by the UI has a valid `id`

Check the selected row payload:

```sql
select
  id,
  is_active,
  settings ->> 'bot_token' as bot_token,
  settings ->> 'webhook_secret' as webhook_secret,
  settings ->> 'public_api_base_url' as public_api_base_url,
  settings ->> 'public_supabase_url' as public_supabase_url,
  settings ->> 'webhook_base_url' as webhook_base_url
from public.integration_settings
where id = '<RUBIKA_CONNECTION_ID>';
```

Expected:

- `bot_token` must be non-empty
- `webhook_secret` should be present if webhook-based inbound flow is expected
- At least one public base URL path must resolve to a public API origin for file import

## New bot-admin diagnostic action

Invoke `supabase.functions.invoke('bot-admin', ...)` with:

```json
{
  "action": "diagnose_rubika_runtime",
  "channel": "rubika",
  "connectionId": "<RUBIKA_CONNECTION_ID>",
  "fileId": "<OPTIONAL_FILE_ID>",
  "chatId": "<OPTIONAL_CHAT_ID>"
}
```

Expected response fields:

- `success`
- `diagnostic`
- `diagnostic.integration`
- `diagnostic.public_base_url`
- `diagnostic.file_import`
- `diagnostic.missing_requirements`

If `success` is `false`, inspect `error_code` and `missing_requirements`.

## Common failure buckets

- `integration_missing_or_inactive`
  Cause: no usable Rubika connection row

- `rubika_token_missing`
  Cause: `settings.bot_token` empty

- `public_api_base_url_missing`
  Cause: file import cannot build public storage URL

- `rubika_file_id_missing`
  Cause: inbound message payload has no `media_file_id`

- `storage_policy_or_bucket_issue`
  Cause: file download worked but upload/public URL path is failing

## UI/runtime notes

- `NotificationsPopover` retries inbound media hydration through `import_rubika_file`.
- If config is incomplete, the function can keep failing until the message-level backoff suppresses retries.
- `WebSocket connection failed` is a Realtime transport/config issue and is not itself a Rubika API failure.
