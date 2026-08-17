-- Phase 459: استفاده از ایندکس در دسترسی‌های سازمانیِ سنگین
-- شناسه سازمان در طول یک درخواست تغییر نمی‌کند. STABLE بودن تابع به planner
-- اجازه می‌دهد شرط RLS را پیش از اسکن ردیف‌ها به شرط index تبدیل کند.

begin;

alter function public.current_org_id() stable;

commit;
