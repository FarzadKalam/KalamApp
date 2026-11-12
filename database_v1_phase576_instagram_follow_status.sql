-- Migration: phase 576 — Instagram Follow Status Support
-- اضافه کردن ستون‌های وضعیت فالو به instagram_contacts
-- و support رویداد follow_status_checked در interaction events

-- ستون‌های جدید روی instagram_contacts
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS follow_status TEXT
    CHECK (follow_status IS NULL OR follow_status IN ('following', 'not_following', 'unknown')),
  ADD COLUMN IF NOT EXISTS follow_status_checked_at TIMESTAMPTZ;

-- Index برای query روی follow_status
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_follow_status
  ON public.instagram_contacts (org_id, account_id, follow_status)
  WHERE follow_status IS NOT NULL;

-- اضافه کردن event_type جدید به interaction events (اگر constraint وجود دارد)
-- بررسی و به‌روزرسانی idempotent constraint روی instagram_interaction_events
DO $$
BEGIN
  -- اگر constraint event_type وجود دارد، آن را drop و recreate می‌کنیم
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instagram_interaction_events_event_type_check'
      AND conrelid = 'public.instagram_interaction_events'::regclass
  ) THEN
    ALTER TABLE public.instagram_interaction_events
      DROP CONSTRAINT instagram_interaction_events_event_type_check;
    ALTER TABLE public.instagram_interaction_events
      ADD CONSTRAINT instagram_interaction_events_event_type_check
      CHECK (event_type IN (
        'direct_received', 'comment_received', 'comment_replied',
        'showcase_button_clicked', 'follow_status_checked'
      ));
  END IF;
END $$;
