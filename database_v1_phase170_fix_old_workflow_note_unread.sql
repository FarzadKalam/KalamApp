-- Phase 170: Bulk-resolve old system/automation notes as read
-- ========================================================================
-- Context: Old workflow/automation notes (category='system' or 'assistant')
-- created before the conversation-key system (phase 160) have no
-- notification_read_states entries, so they always appear as unread.
-- This migration creates read_states for those stale items so users
-- are no longer nagged by notifications they can never resolve.
--
-- Safety: Only affects notes older than 30 days AND with category
-- 'system' or 'assistant' (automation-generated, not real user messages).
-- Does not touch direct/group conversation notes (category='internal'/'group').
-- ========================================================================

-- Step 1: Mark old system/assistant notes as read for all targeted users
INSERT INTO public.notification_read_states (
  org_id,
  user_id,
  section,
  source_type,
  source_id,
  read_at,
  created_at,
  updated_at
)
SELECT DISTINCT
  nii.org_id,
  target_users.user_id,
  nii.section,
  nii.source_type,
  nii.source_id,
  COALESCE(nii.last_event_at, nii.created_at) AS read_at,
  now(),
  now()
FROM public.notification_inbox_items nii
CROSS JOIN LATERAL (
  -- Expand targeted user IDs
  SELECT unnest(nii.target_user_ids) AS user_id
  WHERE array_length(nii.target_user_ids, 1) > 0
    AND NOT nii.is_org_wide
  UNION ALL
  -- For org-wide items: mark as read for all current org members
  SELECT p.id AS user_id
  FROM public.profiles p
  WHERE nii.is_org_wide = true
    AND p.org_id = nii.org_id
) target_users
WHERE nii.section = 'notes'
  AND nii.category IN ('system', 'assistant')
  AND nii.created_at < now() - interval '30 days'
ON CONFLICT (org_id, user_id, source_type, source_id)
DO UPDATE SET
  read_at = COALESCE(EXCLUDED.read_at, notification_read_states.read_at),
  updated_at = now()
WHERE notification_read_states.read_at IS NULL;


-- Step 2: Also resolve very old (>90 days) notes with no target_user_ids
-- that are is_org_wide=true and category='system' — these are broadcast
-- automation messages that nobody has ever read
INSERT INTO public.notification_read_states (
  org_id,
  user_id,
  section,
  source_type,
  source_id,
  read_at,
  created_at,
  updated_at
)
SELECT DISTINCT
  nii.org_id,
  p.id AS user_id,
  nii.section,
  nii.source_type,
  nii.source_id,
  COALESCE(nii.last_event_at, nii.created_at) AS read_at,
  now(),
  now()
FROM public.notification_inbox_items nii
JOIN public.profiles p ON p.org_id = nii.org_id
WHERE nii.section = 'notes'
  AND nii.category = 'system'
  AND nii.is_org_wide = true
  AND (nii.target_user_ids IS NULL OR array_length(nii.target_user_ids, 1) IS NULL)
  AND nii.created_at < now() - interval '90 days'
ON CONFLICT (org_id, user_id, source_type, source_id)
DO NOTHING;
