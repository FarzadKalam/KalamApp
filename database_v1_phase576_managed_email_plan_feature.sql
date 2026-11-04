-- Managed mailbox hosting is opt-in and separate from connecting an existing mailbox.
-- Preserve explicit operator choices. All existing plans, including the base plan,
-- start without hosted mailboxes until enabled through plan management.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || '{"managed_organization_email":false}'::jsonb
where not coalesce(enabled_features, '{}'::jsonb) ? 'managed_organization_email';
