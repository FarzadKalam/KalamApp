-- =====================================================
-- TazeSystem V1 Phase 492
-- هدف: پشتیبانی از فیلد عمومی تصویر / فایل در لیدهای بازاریابی
-- =====================================================

begin;

alter table if exists public.marketing_leads
  add column if not exists image_url text;

commit;
