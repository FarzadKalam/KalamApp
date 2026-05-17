-- KalamApp - Phase 148
-- Goal: ensure SaaS self-service provisioning can write marketing lead notes

alter table if exists public.marketing_leads
  add column if not exists description text;
