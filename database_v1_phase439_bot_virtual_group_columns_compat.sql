-- Phase 439: Compatibility columns for cached clients that may still request bot display fields.
-- Runtime values are still loaded from counterparty_bot_groups and counterparty_bot_config.

do $$
declare
  target_table text;
  target_column text;
  target_columns text[] := array[
    'bot_default_channel',
    'telegram_group_join_link',
    'bale_group_join_link',
    'rubika_group_join_link',
    'telegram_group_status',
    'bale_group_status',
    'rubika_group_status',
    'telegram_group_title',
    'bale_group_title',
    'rubika_group_title'
  ];
begin
  foreach target_table in array array['customers', 'suppliers', 'employees'] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      foreach target_column in array target_columns loop
        execute format(
          'alter table public.%I add column if not exists %I text',
          target_table,
          target_column
        );
        execute format(
          'comment on column public.%I.%I is %L',
          target_table,
          target_column,
          'ستون سازگاری برای جلوگیری از خطای نسخه‌های کش‌شده؛ مقدار اصلی گروه‌های بات از تنظیمات و گروه‌های بات خوانده می‌شود.'
        );
      end loop;
    end if;
  end loop;
end $$;
