-- =====================================================
-- KalamApp - Phase 448 Financial History Secure Wrapper
-- Date: 2026-08-16
-- Type: Additive / idempotent migration
-- Goal: اجرای امن گردش مالی داخلی از طریق wrapper سازمان‌محور
-- =====================================================

begin;

-- تابع داخلی عمداً برای authenticated قابل اجرا نیست، چون org_id را می‌پذیرد.
-- wrapper پیش از فراخوانی، سازمان را فقط از نشست کاربر می‌گیرد و وجود شخص را
-- در همان سازمان کنترل می‌کند. SECURITY DEFINER باعث می‌شود این مسیر کنترل‌شده
-- بتواند هستهٔ خصوصی را اجرا کند، بدون آن‌که دسترسی مستقیم به آن باز شود.
alter function public.get_operational_financial_history(text, uuid)
  security definer;
alter function public.get_operational_financial_history(text, uuid)
  set search_path = public;

revoke all on function public.get_operational_financial_history(text, uuid) from public, anon;
grant execute on function public.get_operational_financial_history(text, uuid) to authenticated;

commit;
