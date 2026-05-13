-- =====================================================
-- KalamApp - Phase 141 Employee Job Description Fields
-- Date: 2026-05-11
-- Type: Additive / non-breaking migration
-- Goal: add modular job description fields to employees
-- =====================================================

begin;

alter table public.employees
  add column if not exists job_goal text,
  add column if not exists job_responsibilities text,
  add column if not exists job_duties text,
  add column if not exists job_requirements text,
  add column if not exists behavioral_traits text,
  add column if not exists career_path text,
  add column if not exists performance_kpi text,
  add column if not exists competency_ksa text,
  add column if not exists role_relationships text,
  add column if not exists salary_calculation_notes text,
  add column if not exists job_description_notes text;

commit;
