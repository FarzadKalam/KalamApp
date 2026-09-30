-- TazeSystem - Phase 533
-- pg_net مستقیماً worker اختصاصی تصویر را فراخوانی می‌کند تا gateway عمومی
-- و سقف کوتاه درخواست‌های Edge Function در مسیر تولید تصویر قرار نگیرند.

begin;

create or replace function public.trigger_ai_image_worker()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_key text;
begin
  v_service_key := current_setting('app.service_role_key', true);
  if coalesce(v_service_key, '') = '' then
    raise warning 'trigger_ai_image_worker: service role key is not configured';
    return;
  end if;

  perform net.http_post(
    url := 'http://ai-image-worker:9000/ai-assistant',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'x-kalam-internal', 'ai-image-worker'
    ),
    body := jsonb_build_object('action', 'process_ai_image_jobs'),
    timeout_milliseconds := 900000
  );
end;
$$;

revoke all on function public.trigger_ai_image_worker() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
