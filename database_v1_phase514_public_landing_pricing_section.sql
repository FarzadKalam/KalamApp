-- TazeSystem V1 Phase 514
-- نمایش بخش تعرفه‌ها در صفحهٔ اصلیِ سفارشی‌شدهٔ CMS.

begin;

update public.cms_landing_pages
set sections = sections || jsonb_build_array(
  jsonb_build_object(
    'id', 'pricing',
    'type', 'pricing',
    'enabled', true,
    'props', jsonb_build_object(
      'eyebrow', 'تعرفه‌ها',
      'title', 'پلنی انتخاب کنید که با تیم شما رشد کند',
      'text', 'مدل قیمت‌گذاری ترکیبی از هزینه پایه پکیج و کاربر اضافه است تا رشد تیم قابل پیش‌بینی بماند.'
    )
  )
)
where slug = 'home'
  and jsonb_typeof(sections) = 'array'
  and jsonb_array_length(sections) > 0
  and not exists (
    select 1
    from jsonb_array_elements(sections) as section(value)
    where section.value ->> 'id' = 'pricing'
       or section.value ->> 'type' = 'pricing'
  );

notify pgrst, 'reload schema';

commit;
