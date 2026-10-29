-- ارزش عددی لید برای نمایش و اولویت‌بندی در کارت‌های CRM
alter table if exists public.marketing_leads
  add column if not exists lead_value numeric(18,2) not null default 0;

comment on column public.marketing_leads.lead_value is 'ارزش برآوردی لید برای تیم فروش';
